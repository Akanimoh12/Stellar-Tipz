//! Event emission helpers for the Tipz contract.
//!
//! Every on-chain action that mutates meaningful state emits an event so that
//! off-chain indexers can follow contract activity without replaying every
//! transaction.
//!
//! ## Naming convention
//! Topic tuple  → `(Symbol, Symbol)`   – identifies the event type
//! Data tuple   → `(field, field, …)`  – the payload

use soroban_sdk::{symbol_short, Address, BytesN, Env, String, Symbol, Vec};

use crate::types::BatchSkip;

// Event families are separated into modules while preserving the existing public API.
mod profile { use super::*; include!("events_parts/profile.rs"); }
mod credit { use super::*; include!("events_parts/credit.rs"); }
mod admin { use super::*; include!("events_parts/admin.rs"); }
mod finance { use super::*; include!("events_parts/finance.rs"); }
mod moderation { use super::*; include!("events_parts/moderation.rs"); }
mod scheduled { use super::*; include!("events_parts/scheduled.rs"); }
mod governance { use super::*; include!("events_parts/governance.rs"); }
mod token { use super::*; include!("events_parts/token.rs"); }
mod subscription { use super::*; include!("events_parts/subscription.rs"); }

pub use admin::*;
pub use credit::*;
pub use finance::*;
pub use governance::*;
pub use moderation::*;
pub use profile::*;
pub use scheduled::*;
pub use subscription::*;
pub use token::*;
