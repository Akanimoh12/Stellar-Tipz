# Transaction Failure Recovery

Use the failure category to choose the next action. Keep the tip form state in memory while the user resolves the problem so retrying does not require re-entering the amount, message, or recipient.

## Insufficient Balance

**Signal:** The account balance is lower than the payment plus the network fee.

**User guidance:** Show the required amount, the available balance, and the shortfall. Ask the user to fund the same Stellar account, then offer Retry after the balance is updated. Do not discard the current form state.

## Expired or Invalid Sequence

**Signal:** The transaction uses a stale sequence number or the account has submitted another transaction first.

**User guidance:** Refresh account state, rebuild the transaction with the latest sequence, and offer Retry. Preserve the form values and avoid replaying the stale transaction envelope.

## Signature Rejected

**Signal:** The wallet reports that the user rejected, cancelled, or closed the signing request.

**User guidance:** Treat this as a cancellation, not a system failure. Explain that no payment was submitted, keep the form state, and offer a neutral Try Again action. Do not show a scary error or imply that funds moved.

## Network or RPC Failure

**Signal:** The wallet or RPC endpoint is unreachable, times out, or returns a temporary server error.

**User guidance:** Explain that the network could not be reached, keep the form state, and offer Retry. If a transaction hash already exists, check its status before submitting a new transaction so a slow confirmation is not duplicated.

## Contract Rejection

**Signal:** Simulation or submission returns a Soroban contract error, such as an invalid amount, unauthorized action, or an already-processed claim.

**User guidance:** Display the contract-provided reason when it is safe to show. For validation and authorization failures, ask the user to correct the input or account. For an already-processed operation, show the existing result instead of retrying blindly.

## Recovery Checklist

1. Classify the failure before selecting the message and action.
2. Preserve the recipient, amount, message, and encryption choice while recovery is in progress.
3. Offer Retry only when repeating the operation is safe.
4. Check transaction status when a hash exists before creating another transaction.
5. Keep deliberate wallet cancellation distinct from failures that need investigation.