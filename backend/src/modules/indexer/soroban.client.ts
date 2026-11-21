import { Contract, SorobanRpc } from '@stellar/stellar-sdk';
import { config } from '../../config/index.js';
import { logger } from '../../common/utils/logger.js';

export class SorobanClient {
  private server: SorobanRpc.Server;
  private contractId: string;

  constructor(rpcUrl?: string, contractId?: string) {
    this.server = new SorobanRpc.Server(rpcUrl ?? config.stellar.rpcUrl, {
      allowHttp: (rpcUrl ?? config.stellar.rpcUrl).startsWith('http://'),
    });
    this.contractId = contractId ?? config.stellar.contractId;
  }

  getServer(): SorobanRpc.Server {
    return this.server;
  }

  getContract(): Contract {
    return new Contract(this.contractId);
  }

  getContractId(): string {
    return this.contractId;
  }

  async getLatestLedger(): Promise<number> {
    try {
      const latestLedger = await this.server.getLatestLedger();
      return latestLedger.sequence;
    } catch (error) {
      logger.error({ error }, 'Failed to fetch latest ledger');
      throw error;
    }
  }

  async getEvents(startLedger: number, endLedger?: number): Promise<SorobanRpc.Api.GetEventsResponse> {
    try {
      const filters: SorobanRpc.Api.EventFilter[] = [{
        type: 'contract',
        contractIds: [this.contractId],
      }];

      const response = await this.server.getEvents({
        startLedger,
        filters,
        ...(endLedger && { endLedger }),
      });

      return response;
    } catch (error) {
      logger.error({ error, startLedger, endLedger }, 'Failed to fetch contract events');
      throw error;
    }
  }
}

export const sorobanClient = new SorobanClient();
