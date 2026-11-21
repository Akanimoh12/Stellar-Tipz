#!/usr/bin/env node
// Real capped Stellar testnet tip, with isolated testnet API and database.
import { Keypair, Networks, SorobanRpc, TransactionBuilder } from '@stellar/stellar-sdk';
const need=['SYNTHETIC_TESTNET_SECRET','SYNTHETIC_RECIPIENT','SYNTHETIC_CONTRACT_ID','SYNTHETIC_API_URL'];
for(const key of need) if(!process.env[key]) throw Error('Missing ' + key);
if(process.env.STELLAR_NETWORK !== 'TESTNET') throw Error('Synthetic transaction is TESTNET ONLY');
const base=process.env.SYNTHETIC_API_URL.replace(/\/$/,'');
const rpcUrl=process.env.SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org';
if(!base.startsWith('https://') || base.includes('mainnet') || rpcUrl.includes('mainnet') || !rpcUrl.startsWith('https://')) throw Error('Unsafe testnet endpoint');
if(!/testnet|synthetic/i.test(new URL(base).hostname)) throw Error('Synthetic API hostname must explicitly identify an isolated testnet/synthetic deployment');
const signer=Keypair.fromSecret(process.env.SYNTHETIC_TESTNET_SECRET);
const rpc=new SorobanRpc.Server(rpcUrl);
const start=Date.now();
const log=(stage,t)=>console.log(JSON.stringify({stage,duration_ms:Date.now()-t}));
async function main(){
  const t0=Date.now();
  const response=await fetch(base+'/api/v1/tips/prepare',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({from:signer.publicKey(),to:process.env.SYNTHETIC_RECIPIENT,amount:'100000',message:'synthetic-monitor'})});
  if(!response.ok) throw Error('prepare stage HTTP '+response.status);
  const body=(await response.json()).data;
  if(body.contractId!==process.env.SYNTHETIC_CONTRACT_ID || body.networkPassphrase!==Networks.TESTNET) throw Error('prepare stage network/contract mismatch');
  const tx=TransactionBuilder.fromXDR(body.unsignedTxXdr,Networks.TESTNET);
  tx.sign(signer); log('prepared',t0);
  const t1=Date.now();
  const sent=await rpc.sendTransaction(tx);
  if(sent.status==='ERROR' || !sent.hash) throw Error('submission stage failed '+sent.status);
  log('submitted',t1);
  const deadline=Date.now()+90000;
  let confirmed=false;
  while(Date.now()<deadline){
    await new Promise(r=>setTimeout(r,2500));
    const item=await rpc.getTransaction(sent.hash);
    if(item.status==='FAILED') throw Error('confirmation stage FAILED '+sent.hash);
    if(item.status==='SUCCESS'){confirmed=true;break;}
  }
  if(!confirmed) throw Error('confirmation stage timed out '+sent.hash);
  log('confirmed',t1);
  while(Date.now()<deadline){
    const res=await fetch(base+'/api/v1/tips?address='+encodeURIComponent(process.env.SYNTHETIC_RECIPIENT)+'&direction=received&limit=100');
    if(res.ok){
      const page=await res.json();
      if(page.data?.some(x=>x.txHash===sent.hash&&x.status==='CONFIRMED')){
        log('indexed_and_visible',t1);
        const elapsed=Date.now()-start;
        console.log(JSON.stringify({result:'success',end_to_end_ms:elapsed,txHash:sent.hash}));
        const limit=Number(process.env.SYNTHETIC_LATENCY_ALERT_MS || 60000);
        if(!Number.isFinite(limit) || limit<=0) throw Error('Invalid synthetic latency alert threshold');
        if(elapsed>limit) throw Error('End-to-end latency threshold exceeded: '+elapsed+'ms > '+limit+'ms');
        return;
      }
    }
    await new Promise(r=>setTimeout(r,2500));
  }
  throw Error('indexing/API visibility stage timed out '+sent.hash);
}
main().catch(e=>{console.error(JSON.stringify({result:'failure',error:e.message}));process.exitCode=1;});
