//! One module's published state on the wire — "any JSON, the module owns the shape", shared rather
//! than owned.
//!
//! The schema says nothing about the shape, so this is `serde_json::Value` in every way that
//! matters: it serializes as exactly the value it holds and deserializes anything. The one thing it
//! adds is the `Arc`. The engine keeps the last answer per module and hands the same tree to every
//! asker until the module's cursor moves (`engined`'s ingest), and an owned `Value` here would make
//! each of those answers a deep copy of a megabyte-sized tree just to be serialized once and
//! dropped. A `ModuleState` is cloned by bumping a count.
//!
//! Read-only by construction: nothing on the engine side edits a published state after the fold
//! built it, and [`std::ops::Deref`] to `Value` is all a reader needs.

use std::ops::Deref;
use std::sync::Arc;

use serde::{Deserialize, Deserializer, Serialize, Serializer};

/// A module's published state: any JSON, shared. See the module header.
#[derive(Clone, Debug, PartialEq)]
pub struct ModuleState(Arc<serde_json::Value>);

impl ModuleState {
    /// The state as the plain JSON value it is.
    #[must_use]
    pub fn as_json(&self) -> &serde_json::Value {
        &self.0
    }
}

impl From<serde_json::Value> for ModuleState {
    fn from(value: serde_json::Value) -> Self {
        Self(Arc::new(value))
    }
}

impl Deref for ModuleState {
    type Target = serde_json::Value;
    fn deref(&self) -> &serde_json::Value {
        &self.0
    }
}

/// So a reader can compare a state with the `json!` it expected, as it could when this was a
/// `Value`.
impl PartialEq<serde_json::Value> for ModuleState {
    fn eq(&self, other: &serde_json::Value) -> bool {
        *self.0 == *other
    }
}

impl Serialize for ModuleState {
    fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        self.0.serialize(serializer)
    }
}

impl<'de> Deserialize<'de> for ModuleState {
    fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        serde_json::Value::deserialize(deserializer).map(Self::from)
    }
}

#[cfg(test)]
mod tests {
    use super::ModuleState;
    use serde_json::json;

    #[test]
    fn it_is_the_json_it_holds_on_the_wire_both_ways() {
        // Objects and arrays both: `kills` publishes one, `loot` the other.
        for value in [
            json!({ "a": [1, 2.5, "x", null] }),
            json!([{ "n": 184_220 }]),
        ] {
            let state = ModuleState::from(value.clone());
            let text = serde_json::to_string(&state).expect("serializes");
            assert_eq!(text, serde_json::to_string(&value).expect("serializes"));
            let back: ModuleState = serde_json::from_str(&text).expect("deserializes");
            assert_eq!(back, value);
        }
    }

    #[test]
    fn a_clone_shares_the_tree_rather_than_copying_it() {
        let state = ModuleState::from(json!({ "rows": [1, 2, 3] }));
        let copy = state.clone();
        assert!(std::ptr::eq(state.as_json(), copy.as_json()));
    }
}
