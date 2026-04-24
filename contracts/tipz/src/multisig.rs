//! Multi-signature admin operations for critical contract functions.
//!
//! Implements a multi-signature approval system where critical operations
//! require N-of-M signatures from authorized signers before execution.

use soroban_sdk::{contracttype, Address, Env, Vec};

use crate::errors::ContractError;
use crate::storage::{self, DataKey};

/// Default proposal expiry time in seconds (7 days)
pub const DEFAULT_PROPOSAL_EXPIRY: u64 = 7 * 24 * 3600;

/// Action types that can be proposed for multi-sig approval
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Action {
    /// Pause the contract
    Pause,
    /// Unpause the contract
    Unpause,
    /// Upgrade contract to new WASM hash
    Upgrade(soroban_sdk::BytesN<32>),
    /// Change fee in basis points
    SetFee(u32),
    /// Rotate admin to new address
    SetAdmin(Address),
}

/// Multi-signature configuration
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct MultisigConfig {
    /// Number of signatures required for execution
    pub required_signatures: u32,
    /// List of authorized signers
    pub signers: Vec<Address>,
}

/// Proposal state
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Proposal {
    /// Unique proposal ID
    pub id: u32,
    /// Action to execute
    pub action: Action,
    /// Addresses that have approved
    pub approvals: Vec<Address>,
    /// Timestamp when proposal was created
    pub created_at: u64,
    /// Timestamp when proposal expires
    pub expires_at: u64,
    /// Whether the proposal has been executed
    pub executed: bool,
}

/// Set the multi-signature configuration (admin only)
pub fn set_multisig_config(
    env: &Env,
    admin: &Address,
    required_signatures: u32,
    signers: Vec<Address>,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    crate::admin::require_admin(env, admin)?;

    if required_signatures == 0 || required_signatures > signers.len() {
        return Err(ContractError::InvalidAmount);
    }

    let config = MultisigConfig {
        required_signatures,
        signers,
    };

    env.storage()
        .instance()
        .set(&DataKey::MultisigConfig, &config);

    Ok(())
}

/// Get the current multi-signature configuration
pub fn get_multisig_config(env: &Env) -> Option<MultisigConfig> {
    env.storage().instance().get(&DataKey::MultisigConfig)
}

/// Check if multi-sig is enabled
pub fn is_multisig_enabled(env: &Env) -> bool {
    get_multisig_config(env).is_some()
}

/// Propose a new action for multi-sig approval
pub fn propose_action(
    env: &Env,
    signer: &Address,
    action: Action,
) -> Result<u32, ContractError> {
    storage::extend_instance_ttl(env);
    signer.require_auth();

    let config = get_multisig_config(env).ok_or(ContractError::NotInitialized)?;

    // Verify signer is authorized
    if !config.signers.contains(signer) {
        return Err(ContractError::NotAuthorized);
    }

    // Get next proposal ID
    let proposal_id: u32 = env
        .storage()
        .instance()
        .get(&DataKey::NextProposalId)
        .unwrap_or(0);

    let now = env.ledger().timestamp();
    let mut approvals = Vec::new(env);
    approvals.push_back(signer.clone());

    let proposal = Proposal {
        id: proposal_id,
        action: action.clone(),
        approvals,
        created_at: now,
        expires_at: now + DEFAULT_PROPOSAL_EXPIRY,
        executed: false,
    };

    // Store proposal
    env.storage()
        .instance()
        .set(&DataKey::Proposal(proposal_id), &proposal);

    // Increment proposal ID counter
    env.storage()
        .instance()
        .set(&DataKey::NextProposalId, &(proposal_id + 1));

    // Emit event
    crate::events::emit_proposal_created(env, proposal_id, signer, &action);

    // Check if we can auto-execute (if required_signatures == 1)
    if config.required_signatures == 1 {
        execute_proposal_internal(env, proposal_id, &config)?;
    }

    Ok(proposal_id)
}

/// Approve an existing proposal
pub fn approve_action(
    env: &Env,
    signer: &Address,
    proposal_id: u32,
) -> Result<(), ContractError> {
    storage::extend_instance_ttl(env);
    signer.require_auth();

    let config = get_multisig_config(env).ok_or(ContractError::NotInitialized)?;

    // Verify signer is authorized
    if !config.signers.contains(signer) {
        return Err(ContractError::NotAuthorized);
    }

    // Get proposal
    let mut proposal: Proposal = env
        .storage()
        .instance()
        .get(&DataKey::Proposal(proposal_id))
        .ok_or(ContractError::NotFound)?;

    // Check if already executed
    if proposal.executed {
        return Err(ContractError::AlreadyVerified); // Reusing error for "already executed"
    }

    // Check if expired
    let now = env.ledger().timestamp();
    if now > proposal.expires_at {
        return Err(ContractError::NotFound); // Proposal expired
    }

    // Check if already approved by this signer
    if proposal.approvals.contains(signer) {
        return Err(ContractError::AlreadyVerified); // Already approved
    }

    // Add approval
    proposal.approvals.push_back(signer.clone());

    // Update proposal
    env.storage()
        .instance()
        .set(&DataKey::Proposal(proposal_id), &proposal);

    // Emit event
    crate::events::emit_proposal_approved(env, proposal_id, signer);

    // Check if we have enough approvals to execute
    if proposal.approvals.len() >= config.required_signatures {
        execute_proposal_internal(env, proposal_id, &config)?;
    }

    Ok(())
}

/// Internal function to execute a proposal
fn execute_proposal_internal(
    env: &Env,
    proposal_id: u32,
    config: &MultisigConfig,
) -> Result<(), ContractError> {
    let mut proposal: Proposal = env
        .storage()
        .instance()
        .get(&DataKey::Proposal(proposal_id))
        .ok_or(ContractError::NotFound)?;

    // Verify we have enough approvals
    if proposal.approvals.len() < config.required_signatures {
        return Err(ContractError::NotAuthorized);
    }

    // Mark as executed
    proposal.executed = true;
    env.storage()
        .instance()
        .set(&DataKey::Proposal(proposal_id), &proposal);

    // Execute the action
    match proposal.action {
        Action::Pause => {
            storage::set_paused(env, true);
            crate::events::emit_contract_paused(env, &env.current_contract_address());
        }
        Action::Unpause => {
            storage::set_paused(env, false);
            crate::events::emit_contract_unpaused(env, &env.current_contract_address());
        }
        Action::Upgrade(wasm_hash) => {
            env.deployer().update_current_contract_wasm(wasm_hash);
            let new_version = storage::get_version(env) + 1;
            storage::set_version(env, new_version);
        }
        Action::SetFee(fee_bps) => {
            if fee_bps > 1000 {
                return Err(ContractError::InvalidFee);
            }
            let old_bps = storage::get_fee_bps(env);
            storage::set_fee_bps(env, fee_bps);
            crate::events::emit_fee_updated(env, old_bps, fee_bps);
        }
        Action::SetAdmin(new_admin) => {
            let old_admin = storage::get_admin(env);
            storage::set_admin(env, &new_admin);
            crate::events::emit_admin_changed(env, &old_admin, &new_admin);
        }
    }

    // Emit execution event
    crate::events::emit_proposal_executed(env, proposal_id);

    Ok(())
}

/// Get all pending (non-executed, non-expired) proposals
pub fn get_pending_proposals(env: &Env) -> Vec<Proposal> {
    let next_id: u32 = env
        .storage()
        .instance()
        .get(&DataKey::NextProposalId)
        .unwrap_or(0);

    let mut pending = Vec::new(env);
    let now = env.ledger().timestamp();

    for id in 0..next_id {
        if let Some(proposal) = env
            .storage()
            .instance()
            .get::<DataKey, Proposal>(&DataKey::Proposal(id))
        {
            if !proposal.executed && now <= proposal.expires_at {
                pending.push_back(proposal);
            }
        }
    }

    pending
}

/// Get a specific proposal by ID
pub fn get_proposal(env: &Env, proposal_id: u32) -> Option<Proposal> {
    env.storage()
        .instance()
        .get(&DataKey::Proposal(proposal_id))
}
