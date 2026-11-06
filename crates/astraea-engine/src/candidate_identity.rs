//! Candidate input/model identity shared by the explicit runtime command in
//! native and wasm32 builds. Not an executable identity or an empirical
//! qualification, and not itself a dispatch command. The digest can stay equal
//! while the report representation/version changes: this scheme covers typed
//! inputs, prepared model identities, active policies and numerical policy, not
//! the report envelope's schema or command metadata.
use serde::ser::{self, Serialize, Serializer};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::fmt;

pub const SCHEME_ID: &str = "native-candidate-input-model-sha256/1.0.0";
pub const ENCODING_ID: &str = "astraea-typed-json-bits/1.0.0";
/// Must change if the inherited driver numerical contract changes. This is not
/// a substitute for recording the exact executable used by an experiment.
pub const NUMERICAL_POLICY_ID: &str = "inherited-candidate-driver-numerics/2.0.0";
/// Explicit native-only diagnostic controls never reuse the inherited policy ID.
pub const EXPLICIT_NUMERICAL_POLICY_ID: &str = "candidate-native-diagnostic-numerics/2.0.0";
pub const KNOT_CUT_POLICY_ID: &str = "candidate-thrust-knot-cut/1.0.0";

/// Actual numerical policy bound into the identity envelope. Absent controls
/// keep the inherited ID and add no envelope fields, preserving old preimages.
pub(crate) struct NumericalPolicyDescriptor {
    pub policy_id: &'static str,
    pub extra: Option<Value>,
}

impl NumericalPolicyDescriptor {
    pub fn inherited() -> Self {
        Self {
            policy_id: NUMERICAL_POLICY_ID,
            extra: Some(json!({
                "splitAtThrustKnots": true,
                "knotCutPolicyId": KNOT_CUT_POLICY_ID,
                "eventRootWidthS": astraea_core::six_dof::EVENT_ROOT_WIDTH_S,
            })),
        }
    }
    pub fn explicit(policy_label: &str, split_at_thrust_knots: bool, r: f64, v: f64, q: f64, w: f64) -> Self {
        Self {
            policy_id: EXPLICIT_NUMERICAL_POLICY_ID,
            extra: Some(json!({
                "absoluteTolerancePolicy": policy_label,
                "appliedAbsoluteTolerances": { "rM": r, "vMps": v, "qUnit": q, "wRadps": w },
                "splitAtThrustKnots": split_at_thrust_knots,
                "knotCutPolicyId": KNOT_CUT_POLICY_ID,
                "eventRootWidthS": astraea_core::six_dof::EVENT_ROOT_WIDTH_S,
            })),
        }
    }
}

#[cfg(not(target_arch = "wasm32"))]
mod replay;
#[cfg(not(target_arch = "wasm32"))]
pub use replay::replay_report_json;

/// Serialize finite typed inputs before hashing: serde_json alone would silently
/// serialize NaN/Infinity as null, including in optional DTO fields.
pub(crate) fn normalized<T: Serialize>(input: &T) -> Result<Value, String> {
    input.serialize(FiniteCheck).map_err(|e| e.to_string())?;
    serde_json::to_value(input).map_err(|e| format!("candidate identity: {e}"))
}

/// Contract: sort object keys, retain array order and exact integer values;
/// represent floats by binary64 bits, canonicalizing signed zero. Not RFC8785.
/// Typed serialization happens first, so numeric spellings of consumed f64
/// fields normalize without rounding i64 epochs through f64.
pub fn canonical(value: &Value) -> String {
    fn append(value: &Value, out: &mut String) {
        match value {
            Value::Null => out.push_str("null"),
            Value::Bool(b) => out.push_str(if *b { "true" } else { "false" }),
            Value::String(s) => out.push_str(&serde_json::to_string(s).expect("string serialization")),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() { out.push_str(&format!("i{i};")); }
                else if let Some(u) = n.as_u64() { out.push_str(&format!("i{u};")); }
                else {
                    let f = n.as_f64().expect("finite JSON number");
                    let bits = if f == 0.0 { 0 } else { f.to_bits() };
                    out.push_str(&format!("f{bits:016x};"));
                }
            }
            Value::Array(values) => {
                out.push('[');
                for (index, value) in values.iter().enumerate() {
                    if index != 0 { out.push(','); }
                    append(value, out);
                }
                out.push(']');
            }
            Value::Object(values) => {
                let mut keys: Vec<_> = values.keys().collect();
                keys.sort();
                out.push('{');
                for (index, key) in keys.iter().enumerate() {
                    if index != 0 { out.push(','); }
                    out.push_str(&serde_json::to_string(key).expect("key serialization"));
                    out.push(':');
                    append(&values[*key], out);
                }
                out.push('}');
            }
        }
    }
    let mut out = String::new();
    append(value, &mut out);
    out
}

/// One versioned content identity over complete typed inputs and the actual
/// prepared model's identities. Caller labels remain declarations and are
/// conservatively included: this is not a minimal physical-equivalence key.
pub(crate) fn attach(report: &mut Value, inputs: Value, numerical: &NumericalPolicyDescriptor) {
    let mut envelope = json!({
        "schemeId": SCHEME_ID,
        "encodingId": ENCODING_ID,
        "numericalPolicyId": numerical.policy_id,
        "models": report["identities"],
        "activePolicies": report["activePolicies"],
        "inputs": inputs,
    });
    if let Some(extra) = &numerical.extra {
        envelope["numericalDiagnostics"] = extra.clone();
    }
    let preimage = format!("{SCHEME_ID}\n{ENCODING_ID}\n{}", canonical(&envelope));
    let sha256 = format!("{:x}", Sha256::digest(preimage.as_bytes()));
    report["contentIdentity"] = json!({
        "schemeId": SCHEME_ID,
        "encodingId": ENCODING_ID,
        "sha256": sha256,
        "canonicalPreimage": preimage,
        "envelope": envelope,
        "replayPolicy": "Canonical bit preimage is authoritative; use replay_report_json, not decimal JSON reparsing of the display envelope",
        "runtimeIdentity": null,
        "runtimeBinding": "Unknown: input/model digest is not an executable or production-WASM digest",
        "qualification": "Unqualified; deterministic content identity is not physical or numerical qualification",
        "callerLabelsPolicy": "Retained declarations included conservatively, never trusted as computed content hashes",
    });
}

#[derive(Debug)]
struct FiniteError;
impl fmt::Display for FiniteError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("candidate identity: nonfinite or unserializable input")
    }
}
impl std::error::Error for FiniteError {}
impl ser::Error for FiniteError {
    fn custom<T: fmt::Display>(_: T) -> Self { Self }
}

// A no-allocation validation pass over the actual Serialize representation.
// It catches optional/otherwise-unused nonfinite DTO numbers before JSON can
// erase them. Every compound path visits its children.
struct FiniteCheck;
macro_rules! primitive {
    ($($method:ident($ty:ty)),* $(,)?) => {$(
        fn $method(self, _: $ty) -> Result<(), FiniteError> { Ok(()) }
    )*};
}
impl Serializer for FiniteCheck {
    type Ok = ();
    type Error = FiniteError;
    type SerializeSeq = Self;
    type SerializeTuple = Self;
    type SerializeTupleStruct = Self;
    type SerializeTupleVariant = Self;
    type SerializeMap = Self;
    type SerializeStruct = Self;
    type SerializeStructVariant = Self;
    primitive!(serialize_bool(bool), serialize_i8(i8), serialize_i16(i16),
        serialize_i32(i32), serialize_i64(i64), serialize_u8(u8), serialize_u16(u16),
        serialize_u32(u32), serialize_u64(u64), serialize_char(char),
        serialize_str(&str), serialize_bytes(&[u8]));
    fn serialize_f32(self, v: f32) -> Result<(), FiniteError> {
        if v.is_finite() { Ok(()) } else { Err(FiniteError) }
    }
    fn serialize_f64(self, v: f64) -> Result<(), FiniteError> {
        if v.is_finite() { Ok(()) } else { Err(FiniteError) }
    }
    fn serialize_none(self) -> Result<(), FiniteError> { Ok(()) }
    fn serialize_some<T: ?Sized + Serialize>(self, v: &T) -> Result<(), FiniteError> { v.serialize(self) }
    fn serialize_unit(self) -> Result<(), FiniteError> { Ok(()) }
    fn serialize_unit_struct(self, _: &'static str) -> Result<(), FiniteError> { Ok(()) }
    fn serialize_unit_variant(self, _: &'static str, _: u32, _: &'static str) -> Result<(), FiniteError> { Ok(()) }
    fn serialize_newtype_struct<T: ?Sized + Serialize>(self, _: &'static str, v: &T) -> Result<(), FiniteError> { v.serialize(self) }
    fn serialize_newtype_variant<T: ?Sized + Serialize>(self, _: &'static str, _: u32, _: &'static str, v: &T) -> Result<(), FiniteError> { v.serialize(self) }
    fn serialize_seq(self, _: Option<usize>) -> Result<Self, FiniteError> { Ok(self) }
    fn serialize_tuple(self, _: usize) -> Result<Self, FiniteError> { Ok(self) }
    fn serialize_tuple_struct(self, _: &'static str, _: usize) -> Result<Self, FiniteError> { Ok(self) }
    fn serialize_tuple_variant(self, _: &'static str, _: u32, _: &'static str, _: usize) -> Result<Self, FiniteError> { Ok(self) }
    fn serialize_map(self, _: Option<usize>) -> Result<Self, FiniteError> { Ok(self) }
    fn serialize_struct(self, _: &'static str, _: usize) -> Result<Self, FiniteError> { Ok(self) }
    fn serialize_struct_variant(self, _: &'static str, _: u32, _: &'static str, _: usize) -> Result<Self, FiniteError> { Ok(self) }
}
macro_rules! sequence {
    ($trait:ident, $method:ident) => {
        impl ser::$trait for FiniteCheck {
            type Ok = ();
            type Error = FiniteError;
            fn $method<T: ?Sized + Serialize>(&mut self, v: &T) -> Result<(), FiniteError> { v.serialize(FiniteCheck) }
            fn end(self) -> Result<(), FiniteError> { Ok(()) }
        }
    };
}
sequence!(SerializeSeq, serialize_element);
sequence!(SerializeTuple, serialize_element);
sequence!(SerializeTupleStruct, serialize_field);
sequence!(SerializeTupleVariant, serialize_field);
impl ser::SerializeMap for FiniteCheck {
    type Ok = ();
    type Error = FiniteError;
    fn serialize_key<T: ?Sized + Serialize>(&mut self, v: &T) -> Result<(), FiniteError> { v.serialize(FiniteCheck) }
    fn serialize_value<T: ?Sized + Serialize>(&mut self, v: &T) -> Result<(), FiniteError> { v.serialize(FiniteCheck) }
    fn end(self) -> Result<(), FiniteError> { Ok(()) }
}
macro_rules! structure {
    ($trait:ident) => {
        impl ser::$trait for FiniteCheck {
            type Ok = ();
            type Error = FiniteError;
            fn serialize_field<T: ?Sized + Serialize>(&mut self, _: &'static str, v: &T) -> Result<(), FiniteError> { v.serialize(FiniteCheck) }
            fn end(self) -> Result<(), FiniteError> { Ok(()) }
        }
    };
}
structure!(SerializeStruct);
structure!(SerializeStructVariant);

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn canonical_is_typed_ordered_and_not_lossy_for_large_integers() {
        let value = json!({"z": [1, 1.0, null, true, "f0000000000000000;"], "a": 9007199254740993_i64});
        assert_eq!(canonical(&value), "{\"a\":i9007199254740993;,\"z\":[i1;,f3ff0000000000000;,null,true,\"f0000000000000000;\"]}");
        assert_eq!(canonical(&json!(-0.0)), canonical(&json!(0.0)));
        assert_ne!(canonical(&json!(null)), canonical(&json!(0.0)));
        assert_ne!(canonical(&json!([1,2])), canonical(&json!([2,1])));
        assert_ne!(canonical(&json!(9007199254740993_i64)), canonical(&json!(9007199254740992_i64)));
    }
    #[test]
    fn nonfinite_is_not_silently_hashed_as_null() {
        #[derive(serde::Serialize)]
        struct Nested { optional: Option<Vec<f64>> }
        for n in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
            assert!(normalized(&Nested { optional: Some(vec![n]) }).is_err());
        }
        assert_eq!(normalized(&Nested { optional: None }).unwrap(), json!({"optional":null}));
    }
    #[test]
    fn model_policy_changes_invalidate_the_digest() {
        let mut a = json!({"identities":{"supportPolicyId":"one"}});
        let mut b = json!({"identities":{"supportPolicyId":"two"}});
        attach(&mut a,json!({"ca0":0.2}),&NumericalPolicyDescriptor::inherited()); attach(&mut b,json!({"ca0":0.2}),&NumericalPolicyDescriptor::inherited());
        assert_ne!(a["contentIdentity"]["sha256"],b["contentIdentity"]["sha256"]);
        assert!(a["contentIdentity"]["runtimeIdentity"].is_null());
    }
    #[test]
    fn every_bound_active_policy_changes_the_digest() {
        let policies = json!({
            "aeroNegligibility":"a", "attitude":"b", "prefixSampling":"c",
            "cpCancellation":"d", "bodyAreaValidation":"e", "profileTime":"f",
        });
        let mut a=json!({"identities":{}, "activePolicies":policies});
        attach(&mut a,json!({}),&NumericalPolicyDescriptor::inherited());
        for key in policies.as_object().unwrap().keys() {
            let mut b=json!({"identities":{}, "activePolicies":policies});
            b["activePolicies"][key]=json!("changed-policy-version");
            attach(&mut b,json!({}),&NumericalPolicyDescriptor::inherited());
            assert_ne!(a["contentIdentity"]["sha256"],b["contentIdentity"]["sha256"],"{key}");
        }
    }
}
