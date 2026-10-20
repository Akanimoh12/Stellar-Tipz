    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Multi-signature Operations
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /// Set multi-signature configuration (admin only)
    pub fn set_multisig_config(
        env: Env,
        admin: Address,
        required_signatures: u32,
        signers: Vec<Address>,
    ) -> Result<(), ContractError> {
        multisig::set_multisig_config(&env, &admin, required_signatures, signers)
    }

    /// Get current multi-signature configuration
    pub fn get_multisig_config(env: Env) -> Option<multisig::MultisigConfig> {
        multisig::get_multisig_config(&env)
    }

    /// Propose a new action for multi-sig approval
    pub fn propose_action(
        env: Env,
        signer: Address,
        action: multisig::Action,
    ) -> Result<u32, ContractError> {
        multisig::propose_action(&env, &signer, action)
    }

    /// Approve an existing proposal
    pub fn approve_action(
        env: Env,
        signer: Address,
        proposal_id: u32,
    ) -> Result<(), ContractError> {
        multisig::approve_action(&env, &signer, proposal_id)
    }

    /// Cancel a proposal (only the proposer can cancel)
    pub fn cancel_proposal(
        env: Env,
        proposer: Address,
        proposal_id: u32,
    ) -> Result<(), ContractError> {
        multisig::cancel_proposal(&env, &proposer, proposal_id)
    }

    /// Get all pending proposals
    pub fn get_pending_proposals(env: Env) -> Vec<multisig::Proposal> {
        multisig::get_pending_proposals(&env)
    }

    /// Remove proposals whose expiry has passed. Returns the number purged.
    pub fn purge_expired_proposals(env: Env) -> u32 {
        multisig::purge_expired_proposals(&env)
    }

    /// Get a specific proposal by ID
    pub fn get_proposal(env: Env, proposal_id: u32) -> Option<multisig::Proposal> {
        multisig::get_proposal(&env, proposal_id)
    }

