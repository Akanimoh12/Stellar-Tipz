// Profile CRUD
// ──────────────────────────────────────────────────────────────────────────────

/// Returns `true` if `address` has a registered profile.
pub fn has_profile(env: &Env, address: &Address) -> bool {
    env.storage()
        .persistent()
        .has(&DataKey::Profile(address.clone()))
}

/// Returns the profile for `address`.
///
/// # Panics
/// Panics if no profile is registered for `address`. Callers should guard
/// with [`has_profile`] first.
pub fn get_profile(env: &Env, address: &Address) -> Profile {
    let key = DataKey::Profile(address.clone());
    let profile = env
        .storage()
        .persistent()
        .get(&key)
        .expect("profile not found");
    extend_persistent_ttl(env, &key, PersistentTier::Balance);
    profile
}

/// Returns the profile for `address`, or `None` when absent.
pub fn get_profile_opt(env: &Env, address: &Address) -> Option<Profile> {
    let key = DataKey::Profile(address.clone());
    let profile = env.storage().persistent().get(&key);
    if profile.is_some() {
        extend_persistent_ttl(env, &key, PersistentTier::Balance);
    }
    profile
}

/// Persists (creates or updates) a profile, keyed by `profile.owner`.
pub fn set_profile(env: &Env, profile: &Profile) {
    let key = DataKey::Profile(profile.owner.clone());
    env.storage().persistent().set(&key, profile);
    extend_persistent_ttl(env, &key, PersistentTier::Balance);
}

/// Remove a profile from persistent storage.
pub fn remove_profile(env: &Env, address: &Address) {
    env.storage()
        .persistent()
        .remove(&DataKey::Profile(address.clone()));
}

/// Remove a username reverse-lookup entry from persistent storage.
pub fn remove_username_address(env: &Env, username: &String) {
    env.storage()
        .persistent()
        .remove(&DataKey::UsernameToAddress(username.clone()));
}

// ──────────────────────────────────────────────────────────────────────────────
// Username reverse lookup
// ──────────────────────────────────────────────────────────────────────────────

/// Returns the address associated with `username`, or `None` if not taken.
pub fn get_username_address(env: &Env, username: &String) -> Option<Address> {
    let key = DataKey::UsernameToAddress(username.clone());
    let addr = env.storage().persistent().get(&key);
    if addr.is_some() {
        extend_persistent_ttl(env, &key, PersistentTier::Standard);
    }
    addr
}

/// Stores the `username → address` reverse-lookup entry.
pub fn set_username_address(env: &Env, username: &String, address: &Address) {
    let key = DataKey::UsernameToAddress(username.clone());
    env.storage().persistent().set(&key, address);
    extend_persistent_ttl(env, &key, PersistentTier::Standard);
}

/// Bumps the TTL for both `Profile` and `UsernameToAddress` entries together,
/// preventing TTL desync between the two persistent storage entries.
///
/// Must be called on every profile interaction (register, update, tip, withdraw).
pub fn bump_profile_ttl(env: &Env, address: &Address) {
    let profile_key = DataKey::Profile(address.clone());
    if env.storage().persistent().has(&profile_key) {
        env.storage().persistent().extend_ttl(
            &profile_key,
            PROFILE_TTL_MIN_LEDGERS,
            PROFILE_TTL_MAX_LEDGERS,
        );
    }
}

/// Bumps the TTL for a `UsernameToAddress` entry.
///
/// Call this alongside [`bump_profile_ttl`] whenever the username is already
/// known, to keep both entries in sync without an extra storage read.
pub fn bump_username_ttl(env: &Env, username: &soroban_sdk::String) {
    let username_key = DataKey::UsernameToAddress(username.clone());
    if env.storage().persistent().has(&username_key) {
        env.storage().persistent().extend_ttl(
            &username_key,
            PROFILE_TTL_MIN_LEDGERS,
            PROFILE_TTL_MAX_LEDGERS,
        );
    }
}

/// Returns `true` only when both the `Profile` and its `UsernameToAddress`
/// reverse-lookup entry exist in persistent storage.
///
/// A profile is considered active only when both entries are live; if either
/// has expired the profile is in an orphaned state and should be treated as
/// absent.
pub fn is_profile_active(env: &Env, address: &Address) -> bool {
    let profile_key = DataKey::Profile(address.clone());
    if !env.storage().persistent().has(&profile_key) {
        return false;
    }
    let profile: crate::types::Profile = match env.storage().persistent().get(&profile_key) {
        Some(p) => p,
        None => return false,
    };
    env.storage()
        .persistent()
        .has(&DataKey::UsernameToAddress(profile.username))
}


