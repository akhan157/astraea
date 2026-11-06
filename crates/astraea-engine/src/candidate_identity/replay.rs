//! Lossless native replay from the bit-exact preimage, never from rounded
//! decimal display fields. Does not change production serde_json parsing.
use super::{canonical, ENCODING_ID, SCHEME_ID};
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

/// Reconstruct the finite typed inputs from their exact archived bit preimage,
/// run the current native diagnostic, and require the same input/model digest.
/// This does NOT establish executable equality or equality of all results.
/// Callers still need an external exact executable hash for qualified replay.
pub fn replay_report_json(report_json: &str) -> Result<String, String> {
    let report: Value = serde_json::from_str(report_json).map_err(|e| format!("invalid replay report: {e}"))?;
    let c = &report["contentIdentity"];
    if c["schemeId"] != SCHEME_ID || c["encodingId"] != ENCODING_ID {
        return Err("unsupported replay identity scheme/encoding".into());
    }
    let preimage = c["canonicalPreimage"].as_str().ok_or("missing canonical replay preimage")?;
    let expected = format!("{:x}", Sha256::digest(preimage.as_bytes()));
    if c["sha256"].as_str() != Some(expected.as_str()) {
        return Err("replay preimage digest mismatch".into());
    }
    let prefix = format!("{SCHEME_ID}\n{ENCODING_ID}\n");
    let payload = preimage.strip_prefix(&prefix).ok_or("invalid replay preimage prefix")?;
    let mut reader = Reader { bytes: payload.as_bytes(), pos: 0 };
    let envelope = reader.value(0)?;
    if reader.pos != reader.bytes.len() || canonical(&envelope) != payload {
        return Err("noncanonical or trailing replay preimage".into());
    }
    if envelope["schemeId"] != SCHEME_ID || envelope["encodingId"] != ENCODING_ID {
        return Err("unsupported replay envelope scheme/encoding".into());
    }
    let inputs = &envelope["inputs"];
    let replay = if inputs["schemaId"] == crate::profile_candidate::SCHEMA_ID {
        crate::profile_candidate::evaluate(inputs)?
    } else {
        let typed = serde_json::from_value(inputs.clone()).map_err(|e| format!("invalid replay native inputs: {e}"))?;
        crate::native_candidate::run_request(&typed)?
    };
    if replay["contentIdentity"]["sha256"].as_str() != Some(expected.as_str()) {
        return Err("current input/model/policy identity differs from archived report; executable equality remains unknown".into());
    }
    serde_json::to_string(&replay).map_err(|e| format!("replay report serialization: {e}"))
}

struct Reader<'a> { bytes: &'a [u8], pos: usize }
impl Reader<'_> {
    fn take(&mut self, expected: u8) -> Result<(), String> {
        if self.bytes.get(self.pos) != Some(&expected) { return Err("invalid canonical replay token".into()); }
        self.pos += 1;
        Ok(())
    }
    fn string(&mut self) -> Result<String, String> {
        let start = self.pos;
        self.take(b'"')?;
        let mut escaped = false;
        while let Some(&byte) = self.bytes.get(self.pos) {
            self.pos += 1;
            if !escaped && byte == b'"' {
                return serde_json::from_slice(&self.bytes[start..self.pos]).map_err(|e| format!("invalid replay string: {e}"));
            }
            if escaped { escaped = false; } else if byte == b'\\' { escaped = true; }
        }
        Err("unterminated replay string".into())
    }
    fn value(&mut self, depth: usize) -> Result<Value, String> {
        if depth > 128 { return Err("canonical replay nesting limit exceeded".into()); }
        match self.bytes.get(self.pos).copied() {
            Some(b'"') => Ok(Value::String(self.string()?)),
            Some(b'i') => {
                self.pos += 1;
                let start = self.pos;
                while matches!(self.bytes.get(self.pos), Some(b'-' | b'0'..=b'9')) { self.pos += 1; }
                let number = std::str::from_utf8(&self.bytes[start..self.pos]).map_err(|_| "invalid replay integer")?;
                let n: Value = serde_json::from_str(number).map_err(|e| format!("invalid replay integer: {e}"))?;
                if !(n.as_i64().is_some() || n.as_u64().is_some()) { return Err("replay integer outside exact JSON integer range".into()); }
                self.take(b';')?;
                Ok(n)
            }
            Some(b'f') => {
                self.pos += 1;
                let end = self.pos.checked_add(16).ok_or("invalid replay float width")?;
                let hex = self.bytes.get(self.pos..end).ok_or("truncated replay float")?;
                let hex = std::str::from_utf8(hex).map_err(|_| "invalid replay float bits")?;
                let f = f64::from_bits(u64::from_str_radix(hex,16).map_err(|_| "invalid replay float bits")?);
                if !f.is_finite() { return Err("nonfinite replay float".into()); }
                self.pos = end;
                self.take(b';')?;
                Ok(serde_json::json!(f))
            }
            Some(b'[') => {
                self.pos += 1;
                let mut values = Vec::new();
                if self.bytes.get(self.pos) != Some(&b']') {
                    loop {
                        values.push(self.value(depth + 1)?);
                        if self.bytes.get(self.pos) != Some(&b',') { break; }
                        self.pos += 1;
                    }
                }
                self.take(b']')?;
                Ok(Value::Array(values))
            }
            Some(b'{') => {
                self.pos += 1;
                let mut values = Map::new();
                if self.bytes.get(self.pos) != Some(&b'}') {
                    loop {
                        let key = self.string()?;
                        self.take(b':')?;
                        if values.insert(key,self.value(depth + 1)?).is_some() { return Err("duplicate replay object key".into()); }
                        if self.bytes.get(self.pos) != Some(&b',') { break; }
                        self.pos += 1;
                    }
                }
                self.take(b'}')?;
                Ok(Value::Object(values))
            }
            _ => {
                for (token, value) in [("null",Value::Null),("true",Value::Bool(true)),("false",Value::Bool(false))] {
                    if self.bytes[self.pos..].starts_with(token.as_bytes()) {
                        self.pos += token.len();
                        return Ok(value);
                    }
                }
                Err("invalid canonical replay value".into())
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn canonical_decoder_is_exact_and_rejects_malformed_tokens() {
        let v = serde_json::json!({"a":[51.248178375505404_f64,-0.5,null,true,"escaped\"\\\n🛰"],"epoch":9007199254740993_i64});
        let text=canonical(&v);
        let mut reader=Reader { bytes:text.as_bytes(),pos:0 };
        assert_eq!(reader.value(0).unwrap(),v);
        assert_eq!(reader.pos,text.len());
        for bad in ["f7ff0000000000000;", "f7ff8000000000000;", "f123;", "{\"a\":null,\"a\":true}", "[null,]", "i18446744073709551616;", "\"unterminated"] {
            assert!(Reader {bytes:bad.as_bytes(),pos:0}.value(0).is_err(),"{bad}");
        }
        let deep=format!("{}null{}","[".repeat(130),"]".repeat(130));
        assert!(Reader {bytes:deep.as_bytes(),pos:0}.value(0).is_err());
    }
}
