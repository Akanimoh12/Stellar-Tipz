use soroban_sdk::{Address, Env, String, Vec};

use crate::errors::ContractError;
use crate::events;
use crate::storage::{self, DataKey};
use crate::tips;
use crate::types::Subscription;

/// Create a new recurring tip subscription.
pub fn create_subscription(
    env: &Env,
    subscriber: Address,
    creator: Address,
    amount: i128,
    interval_days: u32,
) -> Result<Subscription, ContractError> {
    subscriber.require_auth();

    if amount <= 0 {
        return Err(ContractError::InvalidAmount);
    }

    if !storage::has_profile(env, &creator) {
        return Err(ContractError::NotRegistered);
    }

    if storage::is_profile_deactivated(env, &creator) {
        return Err(ContractError::ProfileDeactivated);
    }

    if subscriber == creator {
        return Err(ContractError::CannotTipSelf);
    }

    // Check subscription limit
    let sub_count = get_active_subscription_count(env, &subscriber);
    let limit = storage::get_subscription_limit(env);
    if sub_count >= limit {
        return Err(ContractError::SubscriptionLimitReached);
    }

    let next_due = env.ledger().timestamp() + (interval_days as u64 * 86400);

    let sub = Subscription {
        subscriber: subscriber.clone(),
        creator: creator.clone(),
        amount,
        interval_days,
        next_due,
        active: true,
    };

    let sub_key = DataKey::Subscription(subscriber.clone(), creator.clone());
    env.storage().persistent().set(&sub_key, &sub);

    // Update indices
    add_subscriber_to_creator(env, &creator, &subscriber);
    add_creator_to_subscriber(env, &subscriber, &creator);

    // Add to active subscriptions list
    storage::add_active_subscription(env, &subscriber, &creator);

    events::emit_subscription_created(env, &subscriber, &creator, amount, interval_days);

    Ok(sub)
}

/// Cancel an existing subscription.
pub fn cancel_subscription(
    env: &Env,
    subscriber: Address,
    creator: Address,
) -> Result<(), ContractError> {
    subscriber.require_auth();

    let sub_key = DataKey::Subscription(subscriber.clone(), creator.clone());
    if !env.storage().persistent().has(&sub_key) {
        return Err(ContractError::NotFound);
    }

    let mut sub: Subscription = env.storage().persistent().get(&sub_key).unwrap();
    if !sub.active {
        return Err(ContractError::NotFound);
    }

    sub.active = false;
    env.storage().persistent().set(&sub_key, &sub);

    // Remove from active subscriptions list
    storage::remove_active_subscription(env, &subscriber, &creator);

    events::emit_subscription_cancelled(env, &subscriber, &creator);

    Ok(())
}

/// Execute up to `limit` due subscriptions in a batched sweep.
/// Returns the number of subscriptions charged.
/// Subscriptions that fail are skipped with an event emitted.
pub fn execute_subscriptions(env: &Env, limit: u32) -> Result<u32, ContractError> {
    let active_subs = storage::get_active_subscriptions(env);
    let mut charged_count = 0_u32;
    let now = env.ledger().timestamp();

    for (subscriber, creator) in active_subs.iter() {
        if charged_count >= limit {
            break;
        }

        let sub_key = DataKey::Subscription(subscriber.clone(), creator.clone());
        if let Some(mut sub) = env.storage().persistent().get(&sub_key) {
            if sub.active && now >= sub.next_due {
                // Attempt to execute the due subscription
                match execute_due_subscription_internal(env, &mut sub, now) {
                    Ok(_) => {
                        charged_count += 1;
                        env.storage().persistent().set(&sub_key, &sub);
                    }
                    Err(_) => {
                        // Subscription charge failed - skip and emit event
                        events::emit_subscription_charge_failed(env, &subscriber, &creator);
                    }
                }
            }
        }
    }

    Ok(charged_count)
}

pub fn execute_due_subscription(
    env: &Env,
    subscriber: Address,
    creator: Address,
) -> Result<(), ContractError> {
    let sub_key = DataKey::Subscription(subscriber.clone(), creator.clone());
    if !env.storage().persistent().has(&sub_key) {
        return Err(ContractError::NotFound);
    }

    let mut sub: Subscription = env.storage().persistent().get(&sub_key).unwrap();
    if !sub.active {
        return Ok(());
    }

    let now = env.ledger().timestamp();
    if now >= sub.next_due {
        execute_due_subscription_internal(env, &mut sub, now)?;
        env.storage().persistent().set(&sub_key, &sub);
        events::emit_subscription_executed(env, &subscriber, &creator, sub.amount);
    }

    Ok(())
}

fn execute_due_subscription_internal(
    env: &Env,
    sub: &mut Subscription,
    now: u64,
) -> Result<(), ContractError> {
    tips::send_tip(
        env,
        &sub.subscriber,
        &sub.creator,
        sub.amount,
        &String::from_str(env, "Recurring Tip"),
        false,
        false,
    )?;

    // Advance next_due by exactly one interval, no drift
    sub.next_due = sub.next_due.saturating_add(sub.interval_days as u64 * 86400);
    Ok(())
}

pub fn get_subscriptions(env: &Env, subscriber: Address) -> Vec<Subscription> {
    let count = env
        .storage()
        .persistent()
        .get(&DataKey::SubscriberSubCount(subscriber.clone()))
        .unwrap_or(0);
    let mut result = Vec::new(env);
    for i in 0..count {
        if let Some(creator) = env
            .storage()
            .persistent()
            .get(&DataKey::SubscriberSub(subscriber.clone(), i))
        {
            if let Some(sub) = env
                .storage()
                .persistent()
                .get(&DataKey::Subscription(subscriber.clone(), creator))
            {
                result.push_back(sub);
            }
        }
    }
    result
}

pub fn get_subscribers(env: &Env, creator: Address) -> Vec<Subscription> {
    let count = env
        .storage()
        .persistent()
        .get(&DataKey::CreatorSubCount(creator.clone()))
        .unwrap_or(0);
    let mut result = Vec::new(env);
    for i in 0..count {
        if let Some(subscriber) = env
            .storage()
            .persistent()
            .get(&DataKey::CreatorSub(creator.clone(), i))
        {
            if let Some(sub) = env
                .storage()
                .persistent()
                .get(&DataKey::Subscription(subscriber, creator.clone()))
            {
                result.push_back(sub);
            }
        }
    }
    result
}

fn get_active_subscription_count(env: &Env, subscriber: &Address) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::SubscriberSubCount(subscriber.clone()))
        .unwrap_or(0)
}

// Internal helpers for indexing
fn add_subscriber_to_creator(env: &Env, creator: &Address, subscriber: &Address) {
    let count: u32 = env
        .storage()
        .persistent()
        .get(&DataKey::CreatorSubCount(creator.clone()))
        .unwrap_or(0);
    env.storage()
        .persistent()
        .set(&DataKey::CreatorSub(creator.clone(), count), subscriber);
    env.storage()
        .persistent()
        .set(&DataKey::CreatorSubCount(creator.clone()), &(count + 1));
}

fn add_creator_to_subscriber(env: &Env, subscriber: &Address, creator: &Address) {
    let count: u32 = env
        .storage()
        .persistent()
        .get(&DataKey::SubscriberSubCount(subscriber.clone()))
        .unwrap_or(0);
    env.storage()
        .persistent()
        .set(&DataKey::SubscriberSub(subscriber.clone(), count), creator);
    env.storage().persistent().set(
        &DataKey::SubscriberSubCount(subscriber.clone()),
        &(count + 1),
    );
}
