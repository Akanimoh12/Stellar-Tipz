    use super::*;
    use soroban_sdk::testutils::storage::{Instance, Persistent, Temporary};
    use soroban_sdk::{testutils::Address as _, Env, Map, Symbol};

    use crate::types::{VerificationStatus, VerificationType};
    use crate::TipzContract;

    /// Creates a test `Env` and registers the contract, returning both.
    /// Storage operations must be executed inside `env.as_contract(&id, ...)`.
    fn make_env() -> (Env, Address) {
        let env = Env::default();
        let id = env.register_contract(None, TipzContract);
        (env, id)
    }

    // ── #1175 persistent TTL policy ────────────────────────────────────────────

    #[test]
    fn set_username_bumps_standard_ttl_on_write() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            let user = String::from_str(&env, "alice");
            let addr = Address::generate(&env);
            set_username_address(&env, &user, &addr);
            let key = DataKey::UsernameToAddress(user);
            assert_eq!(
                env.storage().persistent().get_ttl(&key),
                PERSISTENT_TTL_MAX_LEDGERS
            );
        });
    }

    #[test]
    fn get_username_bumps_standard_ttl_on_read() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            let user = String::from_str(&env, "bob");
            let addr = Address::generate(&env);
            let key = DataKey::UsernameToAddress(user.clone());
            // Seed the entry, then knock its TTL below the bump threshold.
            env.storage().persistent().set(&key, &addr);
            // A read must re-extend it back to the standard target.
            let _ = get_username_address(&env, &user);
            assert_eq!(
                env.storage().persistent().get_ttl(&key),
                PERSISTENT_TTL_MAX_LEDGERS
            );
        });
    }

    #[test]
    fn token_balance_bumps_balance_ttl_on_write_and_read() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            let creator = Address::generate(&env);
            let token = Address::generate(&env);
            set_token_balance(&env, &creator, &token, 100i128);
            let key = ExtendedDataKey::TokenBalance(creator.clone(), token.clone());
            // Balance-bearing entries get the longest TTL, on write …
            assert_eq!(
                env.storage().persistent().get_ttl(&key),
                BALANCE_TTL_MAX_LEDGERS
            );
            // … and on read.
            let _ = get_token_balance(&env, &creator, &token);
            assert_eq!(
                env.storage().persistent().get_ttl(&key),
                BALANCE_TTL_MAX_LEDGERS
            );
        });
    }

    #[test]
    fn balance_ttl_outlives_standard_ttl() {
        // The core funds-safety guarantee: a balance entry is always extended
        // at least as far out as any standard metadata entry.
        assert!(BALANCE_TTL_MAX_LEDGERS >= PERSISTENT_TTL_MAX_LEDGERS);
    }

    // ── is_initialized ────────────────────────────────────────────────────────

    #[test]
    fn is_initialized_false_before_set() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert!(!is_initialized(&env));
        });
    }

    #[test]
    fn is_initialized_true_after_set() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            env.storage().instance().set(&DataKey::Initialized, &true);
            assert!(is_initialized(&env));
        });
    }

    #[test]
    fn extend_instance_ttl_sets_expected_ttl() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            extend_instance_ttl(&env);
            assert_eq!(env.storage().instance().get_ttl(), INSTANCE_TTL_MAX_LEDGERS);
        });
    }

    // ── admin ─────────────────────────────────────────────────────────────────

    #[test]
    fn set_and_get_admin() {
        let (env, id) = make_env();
        let admin = Address::generate(&env);
        env.as_contract(&id, || {
            set_admin(&env, &admin);
            assert_eq!(get_admin(&env), admin);
        });
    }

    // ── fee bps ───────────────────────────────────────────────────────────────

    #[test]
    fn get_fee_bps_defaults_to_zero() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(get_fee_bps(&env), 0);
        });
    }

    #[test]
    fn set_and_get_fee_bps() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            set_fee_bps(&env, 200);
            assert_eq!(get_fee_bps(&env), 200);
        });
    }

    // ── fee collector ─────────────────────────────────────────────────────────

    #[test]
    fn set_and_get_fee_collector() {
        let (env, id) = make_env();
        let collector = Address::generate(&env);
        env.as_contract(&id, || {
            set_fee_collector(&env, &collector);
            assert_eq!(get_fee_collector(&env), collector);
        });
    }

    // ── profile ───────────────────────────────────────────────────────────────

    #[test]
    fn has_profile_false_when_absent() {
        let (env, id) = make_env();
        let addr = Address::generate(&env);
        env.as_contract(&id, || {
            assert!(!has_profile(&env, &addr));
        });
    }

    #[test]
    fn set_profile_and_has_profile() {
        let (env, id) = make_env();
        let owner = Address::generate(&env);
        let profile = Profile {
            owner: owner.clone(),
            username: String::from_str(&env, "alice"),
            display_name: String::from_str(&env, "Alice"),
            bio: String::from_str(&env, ""),
            website: String::from_str(&env, ""),
            image_url: String::from_str(&env, ""),
            social_links: Map::<Symbol, String>::new(&env),
            x_handle: String::from_str(&env, ""),
            x_followers: 0,
            x_engagement_avg: 0,
            credit_score: 40,
            total_tips_received: 0,
            total_tips_count: 0,
            balance: 0,
            registered_at: 0,
            updated_at: 0,
            verification: crate::types::VerificationStatus::default(),
            domain: String::from_str(&env, ""),
            domain_verified: false,
            domain_verified_at: None,
            custom_min_tip: None,
        };
        env.as_contract(&id, || {
            set_profile(&env, &profile);
            assert!(has_profile(&env, &owner));
        });
    }

    #[test]
    fn get_profile_round_trips() {
        let (env, id) = make_env();
        let owner = Address::generate(&env);
        let profile = Profile {
            owner: owner.clone(),
            username: String::from_str(&env, "bob"),
            display_name: String::from_str(&env, "Bob"),
            bio: String::from_str(&env, ""),
            website: String::from_str(&env, ""),
            image_url: String::from_str(&env, ""),
            social_links: Map::<Symbol, String>::new(&env),
            x_handle: String::from_str(&env, ""),
            x_followers: 0,
            x_engagement_avg: 0,
            credit_score: 40,
            total_tips_received: 0,
            total_tips_count: 0,
            balance: 500,
            registered_at: 100,
            updated_at: 200,
            verification: crate::types::VerificationStatus::default(),
            domain: String::from_str(&env, ""),
            domain_verified: false,
            domain_verified_at: None,
            custom_min_tip: None,
        };
        env.as_contract(&id, || {
            set_profile(&env, &profile);
            let retrieved = get_profile(&env, &owner);
            assert_eq!(retrieved.username, String::from_str(&env, "bob"));
            assert_eq!(retrieved.balance, 500);
            assert_eq!(retrieved.registered_at, 100);
        });
    }

    // ── username reverse lookup ───────────────────────────────────────────────

    #[test]
    fn get_username_address_none_when_absent() {
        let (env, id) = make_env();
        let username = String::from_str(&env, "ghost");
        env.as_contract(&id, || {
            assert_eq!(get_username_address(&env, &username), None);
        });
    }

    #[test]
    fn set_and_get_username_address() {
        let (env, id) = make_env();
        let addr = Address::generate(&env);
        let username = String::from_str(&env, "alice");
        env.as_contract(&id, || {
            set_username_address(&env, &username, &addr);
            assert_eq!(get_username_address(&env, &username), Some(addr));
        });
    }

    // ── tip counter ───────────────────────────────────────────────────────────

    #[test]
    fn get_tip_count_defaults_to_zero() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(get_tip_count(&env), 0);
        });
    }

    #[test]
    fn increment_tip_count_returns_pre_increment_value() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(increment_tip_count(&env), 0); // pre-increment → 0; stored → 1
            assert_eq!(get_tip_count(&env), 1);
            assert_eq!(increment_tip_count(&env), 1); // pre-increment → 1; stored → 2
            assert_eq!(get_tip_count(&env), 2);
        });
    }

    // ── total creators ────────────────────────────────────────────────────────

    #[test]
    fn get_total_creators_defaults_to_zero() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(get_total_creators(&env), 0);
        });
    }

    #[test]
    fn total_creators_increments_correctly() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            super::increment_total_creators(&env);
            assert_eq!(get_total_creators(&env), 1);
            super::increment_total_creators(&env);
            assert_eq!(get_total_creators(&env), 2);
        });
    }

    // ── tips volume ───────────────────────────────────────────────────────────

    #[test]
    fn get_total_tips_volume_defaults_to_zero() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(get_total_tips_volume(&env), 0);
        });
    }

    #[test]
    fn add_to_tips_volume_accumulates() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            add_to_tips_volume(&env, 1_000_000).unwrap();
            add_to_tips_volume(&env, 2_000_000).unwrap();
            assert_eq!(get_total_tips_volume(&env), 3_000_000);
        });
    }

    // ── fees ──────────────────────────────────────────────────────────────────

    #[test]
    fn get_total_fees_defaults_to_zero() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            assert_eq!(get_total_fees(&env), 0);
        });
    }

    #[test]
    fn add_to_fees_accumulates() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            add_to_fees(&env, 500).unwrap();
            add_to_fees(&env, 300).unwrap();
            assert_eq!(get_total_fees(&env), 800);
        });
    }

    #[test]
    fn set_tip_ttl_sets_expected_ttl() {
        let (env, id) = make_env();
        env.as_contract(&id, || {
            let key = DataKey::Tip(7);
            env.storage().temporary().set(&key, &7_u32);
            set_tip_ttl(&env, &key);
            assert_eq!(env.storage().temporary().get_ttl(&key), TIP_TTL_LEDGERS);
        });
    }

    #[test]
    fn remove_profile_removes_entry() {
        use soroban_sdk::testutils::Address as _;
        let (env, id) = make_env();
        let owner = Address::generate(&env);
        let profile = Profile {
            owner: owner.clone(),
            username: String::from_str(&env, "testuser"),
            display_name: String::from_str(&env, "Test User"),
            bio: String::from_str(&env, ""),
            website: String::from_str(&env, ""),
            image_url: String::from_str(&env, ""),
            social_links: Map::<Symbol, String>::new(&env),
            x_handle: String::from_str(&env, ""),
            x_followers: 0,
            x_engagement_avg: 0,
            credit_score: 40,
            total_tips_received: 0,
            total_tips_count: 0,
            balance: 0,
            registered_at: 0,
            updated_at: 0,
            verification: crate::types::VerificationStatus::default(),
            domain: String::from_str(&env, ""),
            domain_verified: false,
            domain_verified_at: None,
            custom_min_tip: None,
        };
        env.as_contract(&id, || {
            // Set profile
            set_profile(&env, &profile);
            assert!(has_profile(&env, &owner));

            // Remove profile
            remove_profile(&env, &owner);
            assert!(!has_profile(&env, &owner));
        });
    }

