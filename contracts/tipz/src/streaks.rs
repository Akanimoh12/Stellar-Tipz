//! Tipping streak tracking for supporter/creator pairs.

use soroban_sdk::{Address, Env};

use crate::events::emit_streak_milestone;
use crate::storage;
use crate::types::Streak;

const SECONDS_PER_DAY: u64 = 86_400;
const STREAK_MILESTONES: [u32; 3] = [7, 30, 100];

fn current_day(env: &Env) -> u64 {
    env.ledger().timestamp() / SECONDS_PER_DAY
}

fn is_consecutive(day: u64, last_day: u64) -> bool {
    day == last_day + 1 || day == last_day + 7
}

pub fn get_streak(env: &Env, supporter: &Address, creator: &Address) -> Streak {
    storage::get_streak(env, supporter, creator).unwrap_or_else(|| Streak {
        supporter: supporter.clone(),
        creator: creator.clone(),
        current: 0,
        longest: 0,
        last_tip_day: None,
        bonus_points: 0,
    })
}

pub fn record_tip_streak(env: &Env, supporter: &Address, creator: &Address) -> Streak {
    let mut streak = get_streak(env, supporter, creator);
    let today = current_day(env);
    let previous_bonus = streak.bonus_points as i32;

    if streak.current == 0 || streak.last_tip_day.is_none() {
        streak.current = 1;
    } else if let Some(last_day) = streak.last_tip_day {
        if today > last_day && is_consecutive(today, last_day) {
            streak.current += 1;
        } else if today > last_day {
            streak.current = 1;
        }
    }

    streak.longest = streak.longest.max(streak.current);
    streak.last_tip_day = Some(today);
    streak.bonus_points = streak.current / 7;

    storage::adjust_creator_streak_bonus(
        env,
        creator,
        streak.bonus_points as i32 - previous_bonus,
    );

    if STREAK_MILESTONES.iter().any(|milestone| *milestone == streak.current) {
        emit_streak_milestone(env, supporter, creator, streak.current);
    }

    storage::set_streak(env, &streak);
    streak
}
