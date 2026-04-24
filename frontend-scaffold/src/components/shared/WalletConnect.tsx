import React from 'react';
import Button from '../ui/Button';
import Toast from '../ui/Toast';
import CreditBadge from './CreditBadge';
import { useWallet, useProfile } from '../../hooks';
import { SUPPORTED_WALLETS } from '../../hooks/useWallet';
import { truncateAddress } from '../../services';
import Modal from '../ui/Modal';
import { ExternalLink, HelpCircle, Download, CheckCircle2, Wallet } from 'lucide-react';

interface WalletConnectProps {
  className?: string;
}

const WalletConnect: React.FC<WalletConnectProps> = ({ className }) => {
  const { 
    publicKey, 
    connected, 
    connecting, 
    error, 
    disconnect, 
    connectWallet, 
    isWalletInstalled,
    setError
  } = useWallet();
  const { profile } = useProfile();
  const [showModal, setShowModal] = React.useState(false);

  if (connected && publicKey) {
    return (
      <div className={`flex items-center gap-3 ${className || ''}`}>
        <div className="flex items-center gap-2">
          {profile && <CreditBadge score={profile.creditScore} showScore={false} />}
          <span className="text-sm font-mono font-bold border-2 border-black bg-white px-3 py-1.5 shadow-[2px 2px 0px 0px_rgba(0,0,0,1)]">
            {truncateAddress(publicKey)}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={disconnect}>
          Disconnect
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => setShowModal(true)}
        loading={connecting}
        className={className}
      >
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </Button>

      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Connect a Wallet"
      >
        <div className="space-y-6">
          <div className="space-y-4">
            {SUPPORTED_WALLETS.map((wallet) => {
              const installed = isWalletInstalled(wallet.id);
              return (
                <div
                  key={wallet.id}
                  className={`relative flex items-center justify-between p-4 border-2 border-black bg-white transition-all ${
                    wallet.recommended ? 'ring-2 ring-yellow-400' : ''
                  }`}
                >
                  {wallet.recommended && (
                    <span className="absolute -top-3 left-4 bg-yellow-400 text-[10px] font-black uppercase px-2 py-0.5 border-2 border-black">
                      Recommended
                    </span>
                  )}
                  
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 border-2 border-black bg-gray-50 flex items-center justify-center">
                      <Wallet size={20} />
                    </div>
                    <div>
                      <h3 className="font-black uppercase text-sm">{wallet.name}</h3>
                      <div className="flex items-center gap-1.5">
                        {installed ? (
                          <>
                            <CheckCircle2 size={12} className="text-green-600" />
                            <span className="text-[10px] font-bold text-green-600 uppercase">Installed</span>
                          </>
                        ) : (
                          <span className="text-[10px] font-bold text-gray-500 uppercase">Not detected</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {installed ? (
                      <Button
                        size="sm"
                        onClick={async () => {
                          await connectWallet(wallet.id);
                          setShowModal(false);
                        }}
                      >
                        Connect
                      </Button>
                    ) : (
                      <a
                        href={wallet.installUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border-2 border-black bg-white hover:bg-gray-50 text-[10px] font-black uppercase transition-colors"
                      >
                        <Download size={14} />
                        Install
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-4 border-t-2 border-black border-dashed flex flex-col gap-3">
            <a
              href="https://www.stellar.org/learn-wallet"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-xs font-bold text-gray-600 hover:text-black transition-colors"
            >
              <HelpCircle size={14} />
              What is a wallet?
            </a>
            <p className="text-[10px] leading-relaxed text-gray-500 font-medium">
              A wallet allows you to interact with the Stellar network. Your private keys stay in your wallet, and you only use them to sign transactions you approve.
            </p>
          </div>
        </div>
      </Modal>

      {error && (
        <Toast
          message={error}
          type="error"
          onClose={() => setError(null)}
        />
      )}
    </>
  );
};

export default WalletConnect;
