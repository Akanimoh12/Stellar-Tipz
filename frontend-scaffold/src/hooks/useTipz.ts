import { useState, useCallback } from 'react';
import { useContract } from './useContract';

export type TxStatus = 'idle' | 'signing' | 'submitting' | 'confirming' | 'success' | 'error';

interface TipState {
  sending: boolean;
  withdrawing: boolean;
  error: string | null;
  txHash: string | null;
  txStatus: TxStatus;
}

interface UseTipzReturn extends TipState {
  sendTip: (creator: string, amount: string, message: string) => Promise<void>;
  withdrawTips: (amount: string) => Promise<string>;
  reset: () => void;
}

const initialState: TipState = {
  sending: false,
  withdrawing: false,
  error: null,
  txHash: null,
  txStatus: 'idle',
};

export const useTipz = (): UseTipzReturn => {
  const [state, setState] = useState<TipState>(initialState);
  const { sendTip: contractSendTip, withdrawTips: contractWithdrawTips } = useContract();

  const sendTip = useCallback(async (creator: string, amount: string, message: string, isAnonymous: boolean = false): Promise<void> => {
    setState({ ...initialState, sending: true, txStatus: 'signing' });
    try {
      // The useContract.sendTip method handles signing and submission
      const result = await contractSendTip(creator, amount, message, isAnonymous);
      
      setState((prev) => ({ 
        ...prev, 
        txStatus: 'success', 
        sending: false, 
        txHash: result // Assuming the contract method returns the tx hash/id
      }));
    } catch (err) {
      console.error('Tip transaction failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to send tip';
      setState((prev) => ({ 
        ...prev, 
        sending: false, 
        error: message, 
        txStatus: 'error' 
      }));
      throw err; // Re-throw to allow component-level handling
    }
  }, [contractSendTip]);

  const withdrawTips = useCallback(async (amount: string): Promise<string> => {
    setState({ ...initialState, withdrawing: true, txStatus: 'signing' });
    try {
      const result = await contractWithdrawTips(amount);
      
      setState((prev) => ({ 
        ...prev, 
        txStatus: 'success', 
        withdrawing: false, 
        txHash: result 
      }));
      return result;
    } catch (err) {
      console.error('Withdrawal failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to withdraw tips';
      setState((prev) => ({ 
        ...prev, 
        withdrawing: false, 
        error: message, 
        txStatus: 'error' 
      }));
      throw err;
    }
  }, [contractWithdrawTips]);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return { ...state, sendTip, withdrawTips, reset };
};
