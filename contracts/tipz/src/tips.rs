//! Tip record storage and transfer logic for the Tipz contract.
//!
//! Tips are stored in temporary storage so they expire automatically after a
//! bounded lifetime, while aggregate counters remain in persistent contract
//! state.

use soroban_sdk::{Address, Env, String, Vec};

use crate::credit;
use crate::errors::ContractError;
use crate::events::emit_tip_sent;
use crate::leaderboard;
use crate::storage::{self, DataKey, ExtendedDataKey};
use crate::streaks;
use crate::token;
use crate::types::{ScheduledTip, Tip};
use crate::validation::{validate_message, validate_tip_for_creator};

// Module split for single and batch tipping flows and fee logic
mod single { use super::*; include!("tips_parts/single.rs"); }
mod fees { use super::*; include!("tips_parts/fees.rs"); }
mod batch { use super::*; include!("tips_parts/batch.rs"); }

pub use batch::*;
pub use fees::*;
pub use single::*;
