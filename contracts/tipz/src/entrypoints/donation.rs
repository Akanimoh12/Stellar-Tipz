    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Donation Pages
    // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /// Set custom donation page configuration
    pub fn set_donation_page(
        env: Env,
        creator: Address,
        config: types::DonationPageConfig,
    ) -> Result<(), ContractError> {
        profile::set_donation_page(&env, &creator, config)
    }

    /// Get donation page configuration for a creator
    pub fn get_donation_page(
        env: Env,
        creator: Address,
    ) -> Result<types::DonationPageConfig, ContractError> {
        profile::get_donation_page(&env, &creator)
    }

    /// Set a custom minimum tip amount for a creator profile.
    ///
    /// Pass `0` to reset to the global minimum.
    pub fn set_min_tip(env: Env, creator: Address, min_amount: i128) -> Result<(), ContractError> {
        profile::set_min_tip(&env, creator, min_amount)
    }

    /// Return the effective minimum tip for a creator (custom or global default).
    pub fn get_creator_min_tip(env: Env, creator: Address) -> Result<i128, ContractError> {
        profile::get_creator_min_tip(&env, &creator)
    }

    /// Set the domain to verify via stellar.toml (marks verification as pending).
    pub fn set_domain(env: Env, creator: Address, domain: String) -> Result<(), ContractError> {
        profile::set_domain(&env, creator, domain)
    }

