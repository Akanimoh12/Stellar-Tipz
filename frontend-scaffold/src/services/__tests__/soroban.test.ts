import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Account,
  Address,
  Contract,
  SorobanRpc,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import {
  accountToScVal,
  numberToI128,
  getServer,
  getTxBuilder,
  getSimulationTxBuilder,
  simulateTx,
  submitTx,
  getTokenSymbol,
  getTokenName,
  getTokenDecimals,
  getTokenBalance,
  makePayment,
  getEstimatedFee,
  BASE_FEE,
  SendTxStatus,
} from '../soroban';

// Mock the SorobanRpc.Server
vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual('@stellar/stellar-sdk');
  return {
    ...actual,
    SorobanRpc: {
      Server: vi.fn(),
      Api: {
        isSimulationSuccess: vi.fn(),
        isSimulationError: vi.fn(),
        GetTransactionStatus: {
          NOT_FOUND: 'NOT_FOUND',
          SUCCESS: 'SUCCESS',
        },
      },
    },
  };
});

describe('soroban service', () => {
  const mockNetworkPassphrase = 'Test SDF Network ; September 2015';
  const mockPubKey = 'GD5DJQD73KHNA7HYLLKQYA6VTLNBLJ4HFGFA3SIXRS7SNTL5YF6GYQ3X';
  const mockContractId = 'CDLZFC3SYJYDZT7S46ZPZK4475FQDKMGTLEGHFGNQYX2GIRWK3QMNM';
  const mockRpcUrl = 'https://soroban-testnet.stellar.org/';

  let mockServer: any;
  let mockAccount: Account;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockAccount = new Account(mockPubKey, '123456789');
    
    mockServer = {
      getAccount: vi.fn().mockResolvedValue(mockAccount),
      simulateTransaction: vi.fn(),
      sendTransaction: vi.fn(),
      getTransaction: vi.fn(),
      prepareTransaction: vi.fn(),
    };

    (SorobanRpc.Server as any).mockImplementation(() => mockServer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('accountToScVal', () => {
    it('converts account address to ScVal', () => {
      const result = accountToScVal(mockPubKey);
      expect(result).toBeDefined();
      expect(result.switch()).toBeDefined();
    });
  });

  describe('numberToI128', () => {
    it('converts number to i128 ScVal', () => {
      const result = numberToI128(1000);
      expect(result).toBeDefined();
    });

    it('converts bigint to i128 ScVal', () => {
      const result = numberToI128(BigInt(1000));
      expect(result).toBeDefined();
    });
  });

  describe('getServer', () => {
    it('returns server with default RPC URL', () => {
      const networkDetails = {
        network: 'TESTNET',
        networkUrl: 'https://horizon-testnet.stellar.org',
        networkPassphrase: mockNetworkPassphrase,
      };
      
      const server = getServer(networkDetails);
      expect(SorobanRpc.Server).toHaveBeenCalledWith(
        'https://soroban-testnet.stellar.org/',
        { allowHttp: false }
      );
    });

    it('uses environment variable override', () => {
      process.env.VITE_SOROBAN_RPC_URL = 'https://custom-rpc.example.com';
      
      const networkDetails = {
        network: 'TESTNET',
        networkUrl: 'https://horizon-testnet.stellar.org',
        networkPassphrase: mockNetworkPassphrase,
      };
      
      getServer(networkDetails);
      
      expect(SorobanRpc.Server).toHaveBeenCalledWith(
        'https://custom-rpc.example.com',
        { allowHttp: false }
      );
      
      delete process.env.VITE_SOROBAN_RPC_URL;
    });

    it('throws error for unsupported network', () => {
      const networkDetails = {
        network: 'UNSUPPORTED',
        networkUrl: 'https://horizon-testnet.stellar.org',
        networkPassphrase: mockNetworkPassphrase,
      };
      
      expect(() => getServer(networkDetails)).toThrow();
    });
  });

  describe('getTxBuilder', () => {
    it('creates TransactionBuilder with account from server', async () => {
      const builder = await getTxBuilder(
        mockPubKey,
        BASE_FEE,
        mockServer,
        mockNetworkPassphrase
      );
      
      expect(mockServer.getAccount).toHaveBeenCalledWith(mockPubKey);
      expect(builder).toBeInstanceOf(TransactionBuilder);
    });
  });

  describe('getSimulationTxBuilder', () => {
    it('creates TransactionBuilder for simulation without server call', () => {
      const builder = getSimulationTxBuilder(
        mockPubKey,
        BASE_FEE,
        mockNetworkPassphrase
      );
      
      expect(builder).toBeInstanceOf(TransactionBuilder);
      expect(mockServer.getAccount).not.toHaveBeenCalled();
    });
  });

  describe('simulateTx', () => {
    it('simulates transaction and returns result', async () => {
      const contract = new Contract(mockContractId);
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      const tx = txBuilder
        .addOperation(contract.call('symbol'))
        .setTimeout(4294967295)
        .build();

      const mockResult = { retval: xdr.ScVal.scvString('XLM') };
      mockServer.simulateTransaction.mockResolvedValue({
        result: mockResult,
      });
      
      (SorobanRpc.Api.isSimulationSuccess as any).mockReturnValue(true);

      const result = await simulateTx<string>(tx, mockServer);
      expect(result).toBe('XLM');
    });

    it('throws error on simulation failure', async () => {
      const contract = new Contract(mockContractId);
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      const tx = txBuilder
        .addOperation(contract.call('symbol'))
        .setTimeout(4294967295)
        .build();

      mockServer.simulateTransaction.mockResolvedValue({
        error: 'Simulation failed',
      });
      
      (SorobanRpc.Api.isSimulationSuccess as any).mockReturnValue(false);

      await expect(simulateTx<string>(tx, mockServer)).rejects.toThrow(
        'cannot simulate transaction'
      );
    });

    it('handles RPC timeout', async () => {
      const contract = new Contract(mockContractId);
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      const tx = txBuilder
        .addOperation(contract.call('symbol'))
        .setTimeout(4294967295)
        .build();

      mockServer.simulateTransaction.mockRejectedValue(
        new Error('Request timeout')
      );

      await expect(simulateTx<string>(tx, mockServer)).rejects.toThrow(
        /timeout/i
      );
    });
  });

  describe('submitTx', () => {
    it('submits transaction and polls for success', async () => {
      const contract = new Contract(mockContractId);
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      const tx = txBuilder
        .addOperation(contract.call('transfer'))
        .setTimeout(4294967295)
        .build();

      const signedXDR = tx.toXDR();

      mockServer.sendTransaction.mockResolvedValue({
        status: SendTxStatus.Pending,
        hash: 'test-hash',
      });

      mockServer.getTransaction
        .mockResolvedValueOnce({
          status: SorobanRpc.Api.GetTransactionStatus.NOT_FOUND,
        })
        .mockResolvedValueOnce({
          status: SorobanRpc.Api.GetTransactionStatus.SUCCESS,
          resultXdr: xdr.ScVal.scvVoid(),
        });

      const result = await submitTx(signedXDR, mockNetworkPassphrase, mockServer, 2);
      expect(result).toBeDefined();
    });

    it('throws error on submission failure', async () => {
      const contract = new Contract(mockContractId);
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      const tx = txBuilder
        .addOperation(contract.call('transfer'))
        .setTimeout(4294967295)
        .build();

      const signedXDR = tx.toXDR();

      mockServer.sendTransaction.mockResolvedValue({
        status: SendTxStatus.Error,
        errorResult: xdr.ScVal.scvVoid(),
      });

      await expect(
        submitTx(signedXDR, mockNetworkPassphrase, mockServer)
      ).rejects.toThrow();
    });

    it('throws error on polling timeout', async () => {
      const contract = new Contract(mockContractId);
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      const tx = txBuilder
        .addOperation(contract.call('transfer'))
        .setTimeout(4294967295)
        .build();

      const signedXDR = tx.toXDR();

      mockServer.sendTransaction.mockResolvedValue({
        status: SendTxStatus.Pending,
        hash: 'test-hash',
      });

      mockServer.getTransaction.mockResolvedValue({
        status: SorobanRpc.Api.GetTransactionStatus.NOT_FOUND,
      });

      await expect(
        submitTx(signedXDR, mockNetworkPassphrase, mockServer, 1)
      ).rejects.toThrow(/timeout/i);
    });
  });

  describe('getTokenSymbol', () => {
    it('fetches token symbol', async () => {
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      
      const mockResult = { retval: xdr.ScVal.scvString('XLM') };
      mockServer.simulateTransaction.mockResolvedValue({
        result: mockResult,
      });
      
      (SorobanRpc.Api.isSimulationSuccess as any).mockReturnValue(true);

      const symbol = await getTokenSymbol(mockContractId, txBuilder, mockServer);
      expect(symbol).toBe('XLM');
    });
  });

  describe('getTokenName', () => {
    it('fetches token name', async () => {
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      
      const mockResult = { retval: xdr.ScVal.scvString('Stellar Lumens') };
      mockServer.simulateTransaction.mockResolvedValue({
        result: mockResult,
      });
      
      (SorobanRpc.Api.isSimulationSuccess as any).mockReturnValue(true);

      const name = await getTokenName(mockContractId, txBuilder, mockServer);
      expect(name).toBe('Stellar Lumens');
    });
  });

  describe('getTokenDecimals', () => {
    it('fetches token decimals', async () => {
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      
      const mockResult = { retval: xdr.ScVal.scvU32(7) };
      mockServer.simulateTransaction.mockResolvedValue({
        result: mockResult,
      });
      
      (SorobanRpc.Api.isSimulationSuccess as any).mockReturnValue(true);

      const decimals = await getTokenDecimals(mockContractId, txBuilder, mockServer);
      expect(decimals).toBe(7);
    });
  });

  describe('getTokenBalance', () => {
    it('fetches token balance for address', async () => {
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      
      const mockResult = { retval: xdr.ScVal.scvI128(BigInt(10000000)) };
      mockServer.simulateTransaction.mockResolvedValue({
        result: mockResult,
      });
      
      (SorobanRpc.Api.isSimulationSuccess as any).mockReturnValue(true);

      const balance = await getTokenBalance(mockPubKey, mockContractId, txBuilder, mockServer);
      expect(balance).toBeDefined();
    });
  });

  describe('makePayment', () => {
    it('builds payment transaction', async () => {
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      
      const preparedTx = txBuilder.build();
      mockServer.prepareTransaction.mockResolvedValue(preparedTx);

      const xdr = await makePayment(
        mockContractId,
        1000,
        mockPubKey,
        mockPubKey,
        'Test memo',
        txBuilder,
        mockServer
      );

      expect(xdr).toBeDefined();
      expect(mockServer.prepareTransaction).toHaveBeenCalled();
    });

    it('builds payment without memo', async () => {
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      
      const preparedTx = txBuilder.build();
      mockServer.prepareTransaction.mockResolvedValue(preparedTx);

      const xdr = await makePayment(
        mockContractId,
        1000,
        mockPubKey,
        mockPubKey,
        '',
        txBuilder,
        mockServer
      );

      expect(xdr).toBeDefined();
    });
  });

  describe('getEstimatedFee', () => {
    it('calculates estimated fee', async () => {
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      
      const mockSimResponse = {
        minResourceFee: '500',
        result: { retval: xdr.ScVal.scvVoid() },
      };
      mockServer.simulateTransaction.mockResolvedValue(mockSimResponse);
      
      (SorobanRpc.Api.isSimulationError as any).mockReturnValue(false);

      const fee = await getEstimatedFee(
        mockContractId,
        1000,
        mockPubKey,
        mockPubKey,
        '',
        txBuilder,
        mockServer
      );

      expect(fee).toBeDefined();
      expect(parseInt(fee)).toBeGreaterThan(0);
    });

    it('throws error on simulation failure', async () => {
      const txBuilder = getSimulationTxBuilder(mockPubKey, BASE_FEE, mockNetworkPassphrase);
      
      const mockError = new Error('Simulation failed');
      mockServer.simulateTransaction.mockResolvedValue({
        error: mockError,
      });
      
      (SorobanRpc.Api.isSimulationError as any).mockReturnValue(true);

      await expect(
        getEstimatedFee(
          mockContractId,
          1000,
          mockPubKey,
          mockPubKey,
          '',
          txBuilder,
          mockServer
        )
      ).rejects.toThrow();
    });
  });

  describe('XDR parsing', () => {
    it('parses contract result correctly', () => {
      const mockXDR = xdr.ScVal.scvString('test-result');
      const parsed = mockXDR.toString();
      expect(parsed).toBeDefined();
    });

    it('handles complex XDR structures', () => {
      const mockXDR = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvString('key'),
          val: xdr.ScVal.scvU32(42),
        }),
      ]);
      const parsed = mockXDR.toString();
      expect(parsed).toBeDefined();
    });
  });
});
