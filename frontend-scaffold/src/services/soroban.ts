import {
  Address,
  Contract,
  Memo,
  MemoType,
  nativeToScVal,
  Operation,
  scValToNative,
  SorobanRpc,
  TimeoutInfinite,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

import { NetworkDetails } from "../helpers/network";
import { stroopToXlm, mapContractResponse } from "../helpers/format";
import { ERRORS } from "../helpers/error";

// TODO: once soroban supports estimated fees, we can fetch this
export const BASE_FEE = "100";
export const baseFeeXlm = stroopToXlm(BASE_FEE).toString();

export const SendTxStatus: {
  [index: string]: SorobanRpc.Api.SendTransactionStatus;
} = {
  Pending: "PENDING",
  Duplicate: "DUPLICATE",
  Retry: "TRY_AGAIN_LATER",
  Error: "ERROR",
};

export const XLM_DECIMALS = 7;

export const RPC_URLS: { [key: string]: string } = {
  TESTNET: "https://soroban-testnet.stellar.org/",
  PUBLIC: "https://soroban-rpc.mainnet.stellar.gateway.fm/",
};

// Can be used whenever you need an Address argument for a contract method
export const accountToScVal = (account: string) =>
  new Address(account).toScVal();

// Can be used whenever you need an i128 argument for a contract method
export const numberToI128 = (value: number | bigint): xdr.ScVal =>
  nativeToScVal(value, { type: "i128" });

// Get a server configured for a specific network
export const getServer = (networkDetails: NetworkDetails) => {
  // Check for environment variable override first
  const envRpcUrl = import.meta.env.VITE_SOROBAN_RPC_URL;
  
  let rpcUrl: string;
  
  if (envRpcUrl) {
    rpcUrl = envRpcUrl;
    console.log(`Using RPC URL from environment: ${rpcUrl}`);
  } else {
    rpcUrl = RPC_URLS[networkDetails.network];
    
    if (!rpcUrl) {
      console.warn(
        `No RPC URL configured for network: ${networkDetails.network}. ` +
        `Available networks: ${Object.keys(RPC_URLS).join(", ")}. ` +
        `Set VITE_SOROBAN_RPC_URL environment variable to override.`
      );
      throw new Error(
        `RPC URL not found for network: ${networkDetails.network}. ` +
        `Please configure VITE_SOROBAN_RPC_URL or use a supported network.`
      );
    }
    
    console.log(`Using default RPC URL for ${networkDetails.network}: ${rpcUrl}`);
  }
  
  return new SorobanRpc.Server(rpcUrl, {
    allowHttp: networkDetails.networkUrl.startsWith("http://"),
  });
};

// Get a TransactionBuilder configured with our public key
export const getTxBuilder = async (
  pubKey: string,
  fee: string,
  server: SorobanRpc.Server,
  networkPassphrase: string,
) => {
  const source = await server.getAccount(pubKey);
  return new TransactionBuilder(source, {
    fee,
    networkPassphrase,
  });
};

//  Can be used whenever we need to perform a "read-only" operation
//  Used in getTokenSymbol, getTokenName, getTokenDecimals, and getTokenBalance
export const simulateTx = async <ArgType>(
  tx: Transaction<Memo<MemoType>, Operation[]>,
  server: SorobanRpc.Server,
): Promise<ArgType> => {
  const response = await server.simulateTransaction(tx);

  if (
    SorobanRpc.Api.isSimulationSuccess(response) &&
    response.result !== undefined
  ) {
    const raw = scValToNative(response.result.retval);
    return mapContractResponse<ArgType>(raw);
  }

  throw new Error("cannot simulate transaction");
};

// Build and submits a transaction to the Soroban RPC
// Polls for non-pending state, returns result after status is updated
export const submitTx = async (
  signedXDR: string,
  networkPassphrase: string,
  server: SorobanRpc.Server,
  timeoutSeconds: number = 60,
) => {
  const tx = TransactionBuilder.fromXDR(signedXDR, networkPassphrase);

  const sendResponse = await server.sendTransaction(tx);

  if (sendResponse.errorResult) {
    throw new Error(ERRORS.UNABLE_TO_SUBMIT_TX);
  }

  if (sendResponse.status === SendTxStatus.Pending) {
    let txResponse = await server.getTransaction(sendResponse.hash);
    const startTime = Date.now();
    const timeoutMs = timeoutSeconds * 1000;

    while (
      txResponse.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND
    ) {
      // Check if timeout exceeded
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(
          `Transaction polling timeout after ${timeoutSeconds} seconds. Hash: ${sendResponse.hash}`
        );
      }

      // See if the transaction is complete
      txResponse = await server.getTransaction(sendResponse.hash);
      // Wait a second
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    if (txResponse.status === SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      return txResponse.resultXdr.toXDR("base64");
    }
  }
  throw new Error(
    `Unable to submit transaction, status: ${sendResponse.status}`,
  );
};

// Get the tokens symbol, decoded as a string
export const getTokenSymbol = async (
  tokenId: string,
  txBuilder: TransactionBuilder,
  server: SorobanRpc.Server,
) => {
  const contract = new Contract(tokenId);
  const tx = txBuilder
    .addOperation(contract.call("symbol"))
    .setTimeout(TimeoutInfinite)
    .build();

  const result = await simulateTx<string>(tx, server);
  return result;
};

// Get the tokens name, decoded as a string
export const getTokenName = async (
  tokenId: string,
  txBuilder: TransactionBuilder,
  server: SorobanRpc.Server,
) => {
  const contract = new Contract(tokenId);
  const tx = txBuilder
    .addOperation(contract.call("name"))
    .setTimeout(TimeoutInfinite)
    .build();

  const result = await simulateTx<string>(tx, server);
  return result;
};

// Get the tokens decimals, decoded as a number
export const getTokenDecimals = async (
  tokenId: string,
  txBuilder: TransactionBuilder,
  server: SorobanRpc.Server,
) => {
  const contract = new Contract(tokenId);
  const tx = txBuilder
    .addOperation(contract.call("decimals"))
    .setTimeout(TimeoutInfinite)
    .build();

  const result = await simulateTx<number>(tx, server);
  return result;
};

// Get the tokens balance, decoded as a string
export const getTokenBalance = async (
  address: string,
  tokenId: string,
  txBuilder: TransactionBuilder,
  server: SorobanRpc.Server,
) => {
  const params = [accountToScVal(address)];
  const contract = new Contract(tokenId);
  const tx = txBuilder
    .addOperation(contract.call("balance", ...params))
    .setTimeout(TimeoutInfinite)
    .build();

  const result = await simulateTx<string>(tx, server);
  return result;
};

// Build a "transfer" operation, and prepare the corresponding XDR
// https://github.com/stellar/soroban-examples/blob/main/token/src/contract.rs#L27
export const makePayment = async (
  tokenId: string,
  amount: number,
  to: string,
  pubKey: string,
  memo: string,
  txBuilder: TransactionBuilder,
  server: SorobanRpc.Server,
) => {
  const contract = new Contract(tokenId);
  const tx = txBuilder
    .addOperation(
      contract.call(
        "transfer",
        ...[
          accountToScVal(pubKey), // from
          accountToScVal(to), // to
          numberToI128(amount), // amount
        ],
      ),
    )
    .setTimeout(TimeoutInfinite);

  if (memo.length > 0) {
    tx.addMemo(Memo.text(memo));
  }

  const preparedTransaction = await server.prepareTransaction(tx.build());

  return preparedTransaction.toXDR();
};

export const getEstimatedFee = async (
  tokenId: string,
  amount: number,
  to: string,
  pubKey: string,
  memo: string,
  txBuilder: TransactionBuilder,
  server: SorobanRpc.Server,
) => {
  const contract = new Contract(tokenId);
  const tx = txBuilder
    .addOperation(
      contract.call(
        "transfer",
        ...[
          accountToScVal(pubKey), // from
          accountToScVal(to), // to
          numberToI128(amount), // amount
        ],
      ),
    )
    .setTimeout(TimeoutInfinite);

  if (memo.length > 0) {
    tx.addMemo(Memo.text(memo));
  }

  const raw = tx.build();

  const simResponse = await server.simulateTransaction(raw);

  if (SorobanRpc.Api.isSimulationError(simResponse)) {
    throw simResponse.error;
  }

  // 'classic' tx fees are measured as the product of tx.fee * 'number of operations', In soroban contract tx,
  // there can only be single operation in the tx, so can make simplification
  // of total classic fees for the soroban transaction will be equal to incoming tx.fee + minResourceFee.
  const classicFeeNum = BigInt(raw.fee || "0");
  const minResourceFeeNum = BigInt(simResponse.minResourceFee || "0");
  const fee = (classicFeeNum + minResourceFeeNum).toString();
  return fee;
};
