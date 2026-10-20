#!/usr/bin/env node
/** Read a reconciled provider billing export. No credentials or customer identifiers required. */
import { readFile } from 'node:fs/promises';
if(process.argv.length!==3) throw Error('Usage: node backend/scripts/cost-report.mjs invoice.json');
const invoice=JSON.parse(await readFile(process.argv[2],'utf8'));
if(!/^\d{4}-\d{2}-\d{2}$/.test(invoice.date || '')) throw Error('Expected UTC date YYYY-MM-DD');
const serviceNames=['ipfs','soroban_rpc','horizon','postgres','redis'];
const amounts=serviceNames.map(k=>invoice.services?.[k]);
if(amounts.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0)) throw Error('Provide non-negative USD spend for each service');
const activeUsers=invoice.activeUsers, tips=invoice.confirmedTips;
if(![activeUsers,tips].every(x=>Number.isSafeInteger(x)&&x>=0)) throw Error('Active users and confirmed real tips must be nonnegative counts');
const total=amounts.reduce((a,b)=>a+b,0);
console.log(JSON.stringify({date:invoice.date,totalUsd:total,costPerActiveUserUsd:activeUsers?total/activeUsers:null,costPerTipUsd:tips?total/tips:null,serviceCostsUsd:Object.fromEntries(serviceNames.map((k,i)=>[k,amounts[i]]))},null,2));
