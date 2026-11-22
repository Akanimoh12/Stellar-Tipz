    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Verification

    pub fn request_verification(
        env: Env,
        caller: Address,
        verification_type: crate::types::VerificationType,
    ) -> Result<(), ContractError> {
        verification::request_verification(&env, caller, verification_type)
    }

    pub fn approve_verification(
        env: Env,
        caller: Address,
        creator: Address,
        verification_type: crate::types::VerificationType,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        verification::approve_verification(&env, creator, verification_type)
    }

    pub fn revoke_verification(
        env: Env,
        caller: Address,
        creator: Address,
    ) -> Result<(), ContractError> {
        caller.require_auth();
        verification::revoke_verification(&env, creator)
    }

    pub fn get_verification_status(
        env: Env,
        creator: Address,
    ) -> Result<crate::types::VerificationStatus, ContractError> {
        verification::get_verification_status(&env, creator)
    }

    pub fn is_verification_expired(env: Env, creator: Address) -> Result<bool, ContractError> {
        verification::is_verification_expired(&env, creator)
    }

