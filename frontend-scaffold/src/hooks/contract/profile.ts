import { useCallback } from "react";
import {
  Contract,
  TimeoutInfinite,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";

import {
  accountToScVal,
  BASE_FEE,
  getSimulationTxBuilder,
  getTxBuilder,
  simulateTx,
  submitTx,
} from "../../services";
import {
  Profile,
  getCreditTier as calculateCreditTier,
} from "../../types/contract";
import { ProfileFormData } from "../../types/profile";
import { ContractContext, READ_ONLY_SOURCE } from "./core";

/**
 * Profile domain of the Tipz contract: profile reads, registration and
 * updates, credit tier, and domain verification.
 *
 * @param ctx - Shared contract context created by `useContractCore`.
 */
export const useProfileContract = ({
  wallet,
  networkDetails,
  server,
  contractId,
  withLoading,
  withRetry,
}: ContractContext) => {
  const getProfile = useCallback(
    async (address: string): Promise<Profile> => {
      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = getSimulationTxBuilder(
          address,
          BASE_FEE,
          networkDetails.networkPassphrase,
        );
        const tx = txBuilder
          .addOperation(contract.call("get_profile", accountToScVal(address)))
          .setTimeout(TimeoutInfinite)
          .build();

        return withRetry(() => simulateTx<Profile>(tx, server));
      });
    },
    [contractId, server, networkDetails, withLoading, withRetry],
  );

  const getProfileByUsername = useCallback(
    async (username: string): Promise<Profile> => {
      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = wallet.publicKey
          ? await getTxBuilder(
              wallet.publicKey,
              BASE_FEE,
              server,
              networkDetails.networkPassphrase,
            )
          : getSimulationTxBuilder(
              READ_ONLY_SOURCE,
              BASE_FEE,
              networkDetails.networkPassphrase,
            );
        const tx = txBuilder
          .addOperation(
            contract.call("get_profile_by_username", nativeToScVal(username)),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        return withRetry(() => simulateTx<Profile>(tx, server));
      });
    },
    [
      contractId,
      wallet.publicKey,
      server,
      networkDetails,
      withLoading,
      withRetry,
    ],
  );

  const getCreditTier = useCallback(
    async (address: string) => {
      return withLoading(async () => {
        const profile = await getProfile(address);
        const tier = calculateCreditTier(profile.creditScore);
        return { score: profile.creditScore, tier };
      });
    },
    [getProfile, withLoading],
  );

  // --- Write Methods ---

  const registerProfile = useCallback(
    async (data: ProfileFormData): Promise<string> => {
      const publicKey = wallet.publicKey;
      if (!publicKey) throw new Error("Wallet not connected");

      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = await getTxBuilder(
          publicKey,
          BASE_FEE,
          server,
          networkDetails.networkPassphrase,
        );

        const tx = txBuilder
          .addOperation(
            contract.call(
              "register_profile",
              accountToScVal(publicKey),
              nativeToScVal(data.username),
              nativeToScVal(data.displayName),
              nativeToScVal(data.bio),
              nativeToScVal(data.imageUrl),
              nativeToScVal(data.xHandle),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const xdr = tx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const updateProfile = useCallback(
    async (data: Partial<ProfileFormData>): Promise<string> => {
      const publicKey = wallet.publicKey;
      if (!publicKey) throw new Error("Wallet not connected");

      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = await getTxBuilder(
          publicKey,
          BASE_FEE,
          server,
          networkDetails.networkPassphrase,
        );

        // Helper function to convert optional string to ScVal
        // Returns an Option with Some(value) if value is provided, else None
        const optionalStringToScVal = (value?: string): xdr.ScVal => {
          if (value !== undefined && value !== "") {
            return nativeToScVal({ type: "some", value: value });
          }
          return nativeToScVal({ type: "none" });
        };

        const tx = txBuilder
          .addOperation(
            contract.call(
              "update_profile",
              accountToScVal(publicKey),
              optionalStringToScVal(data.displayName),
              optionalStringToScVal(data.bio),
              optionalStringToScVal(data.imageUrl),
              optionalStringToScVal(data.xHandle),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const xdr_tx = tx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr_tx);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const setDomain = useCallback(
    async (domain: string): Promise<string> => {
      const publicKey = wallet.publicKey;
      if (!publicKey) throw new Error("Wallet not connected");

      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = await getTxBuilder(
          publicKey,
          BASE_FEE,
          server,
          networkDetails.networkPassphrase,
        );

        const tx = txBuilder
          .addOperation(
            contract.call(
              "set_domain",
              accountToScVal(publicKey),
              nativeToScVal(domain.trim().toLowerCase()),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const xdr = tx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const verifyDomain = useCallback(
    async (creator?: string): Promise<string> => {
      const publicKey = wallet.publicKey;
      if (!publicKey) throw new Error("Wallet not connected");

      return withLoading(async () => {
        const contract = new Contract(contractId);
        const txBuilder = await getTxBuilder(
          publicKey,
          BASE_FEE,
          server,
          networkDetails.networkPassphrase,
        );

        const tx = txBuilder
          .addOperation(
            contract.call(
              "verify_domain",
              accountToScVal(publicKey),
              accountToScVal(creator ?? publicKey),
            ),
          )
          .setTimeout(TimeoutInfinite)
          .build();

        const xdr = tx.toXDR();
        const signedXdr = await wallet.signTransaction(xdr);
        return submitTx(signedXdr, networkDetails.networkPassphrase, server);
      });
    },
    [contractId, wallet, server, networkDetails, withLoading],
  );

  const deregisterProfile = useCallback(async (): Promise<string> => {
    const publicKey = wallet.publicKey;
    if (!publicKey) throw new Error("Wallet not connected");

    return withLoading(async () => {
      const contract = new Contract(contractId);
      const txBuilder = await getTxBuilder(
        publicKey,
        BASE_FEE,
        server,
        networkDetails.networkPassphrase,
      );

      const tx = txBuilder
        .addOperation(
          contract.call("deregister_profile", accountToScVal(publicKey)),
        )
        .setTimeout(TimeoutInfinite)
        .build();

      const xdr = tx.toXDR();
      const signedXdr = await wallet.signTransaction(xdr);
      return submitTx(signedXdr, networkDetails.networkPassphrase, server);
    });
  }, [contractId, wallet, server, networkDetails, withLoading]);

  return {
    getProfile,
    getProfileByUsername,
    getCreditTier,
    registerProfile,
    updateProfile,
    setDomain,
    verifyDomain,
    deregisterProfile,
  };
};
