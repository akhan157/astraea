//! Shared helpers for the calibrated-provider integration tests.
//!
//! The engine corpus itself is never committed: `design.json`/`points.csv`
//! live outside the repository and are reached through `ASTRAEA_ENGINE_CORPUS`.
//! The committed manifest pins each file's row count and SHA-256.
#![allow(dead_code)]

use astraea_core::calibrated::design::MachAlt;
use astraea_core::calibrated::{Airfoil, Design, Fin, NoseShape, Part, PartKind, SurfaceFinish};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::Path;

/// Engine-parity tier: relative error <= 2e-6 against the engine columns.
pub const EXACT_TOLERANCE: f64 = 2e-6;

/// |actual - expected| / max(|expected|, 1e-3), as in the TS parity tests.
pub fn rel_err(actual: f64, expected: f64) -> f64 {
    (actual - expected).abs() / expected.abs().max(1e-3)
}

pub fn file_sha256(path: &Path) -> String {
    let bytes = std::fs::read(path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()));
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    format!("{:x}", hasher.finalize())
}

pub fn num(v: &Value, key: &str) -> f64 {
    v.get(key)
        .and_then(Value::as_f64)
        .unwrap_or_else(|| panic!("missing number {key} in {v}"))
}

fn opt_num(v: &Value, key: &str) -> Option<f64> {
    v.get(key)
        .map(|x| x.as_f64().unwrap_or_else(|| panic!("{key} not a number")))
}

pub fn text<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key)
        .and_then(Value::as_str)
        .unwrap_or_else(|| panic!("missing string {key}"))
}

fn fin_of(v: &Value) -> Fin {
    Fin {
        chord: num(v, "chord"),
        tip: num(v, "tip"),
        sweep: num(v, "sweep"),
        span: num(v, "span"),
        thickness: num(v, "thickness"),
        count: num(v, "count") as u32,
        airfoil: Airfoil::from_calibrated_name(text(v, "airfoil")).expect("airfoil"),
        location: num(v, "location"),
        fx1: num(v, "fx1"),
        fx3: num(v, "fx3"),
        le_radius: num(v, "leRadius"),
        parent_diameter: num(v, "parentDiameter"),
        rear_diameter: num(v, "rearDiameter"),
        leading_edge: num(v, "leadingEdge"),
    }
}

fn part_of(v: &Value) -> Part {
    Part {
        kind: PartKind::from_calibrated_name(text(v, "type")).expect("part type"),
        length: num(v, "length"),
        diameter: num(v, "diameter"),
        rear_diameter: opt_num(v, "rearDiameter"),
        blunt_radius: opt_num(v, "bluntRadius"),
        location: num(v, "location"),
        rail_diameter: opt_num(v, "railDiameter"),
        rail_height: opt_num(v, "railHeight"),
        lug_diameter: opt_num(v, "lugDiameter"),
        shoe_area: opt_num(v, "shoeArea"),
        fin: match v.get("fin") {
            None | Some(Value::Null) => None,
            Some(f) => Some(fin_of(f)),
        },
    }
}

/// Parse a `design.json` fixture (TS `serializeCalibratedDesign`).
pub fn design_from_json(text_json: &str) -> Design {
    let v: Value = serde_json::from_str(text_json).expect("design json");
    Design {
        nose_shape: NoseShape::from_calibrated_name(text(&v, "noseShape")).expect("nose shape"),
        nose_power_law_exponent: v["chain"][0]
            .get("powerLawExponent")
            .and_then(Value::as_f64),
        surface: SurfaceFinish::from_calibrated_name(text(&v, "surface")).expect("surface"),
        turbulence: v["turbulence"].as_bool().expect("turbulence"),
        sustainer_nozzle: num(&v, "sustainerNozzle"),
        chain: v["chain"].as_array().expect("chain").iter().map(part_of).collect(),
        sustainer_length: num(&v, "sustainerLength"),
        max_diameter: num(&v, "maxDiameter"),
        first_diameter: num(&v, "firstDiameter"),
        base_diameter: num(&v, "baseDiameter"),
        mach_alt: v["machAlt"]
            .as_array()
            .expect("machAlt")
            .iter()
            .map(|m| MachAlt { mach: num(m, "mach"), alt_ft: num(m, "altFt") })
            .collect(),
    }
}

/// One design pinned by the committed engine-corpus manifest.
pub struct ManifestDesign {
    pub slug: String,
    pub rows: usize,
    pub sha256: String,
    pub duplicate_of: Option<String>,
}

/// The committed manifest (40 designs, 36,936 rows). No engine data.
pub fn manifest() -> Vec<ManifestDesign> {
    let doc: Value = serde_json::from_str(include_str!("../fixtures/engine-corpus-manifest.json"))
        .expect("engine corpus manifest");
    doc["designs"]
        .as_array()
        .expect("designs")
        .iter()
        .map(|d| ManifestDesign {
            slug: text(d, "slug").to_string(),
            rows: num(d, "rows") as usize,
            sha256: text(d, "sha256").to_string(),
            duplicate_of: d.get("duplicateOf").and_then(Value::as_str).map(str::to_string),
        })
        .collect()
}

/// One engine row of `points.csv`. Empty cells are absent.
pub struct CorpusRow {
    pub rogers: bool,
    pub alpha_deg: f64,
    pub mach: f64,
    pub nozzle_exit_in: f64,
    pub cells: HashMap<String, f64>,
}

impl CorpusRow {
    pub fn get(&self, column: &str) -> Option<f64> {
        self.cells.get(column).copied()
    }
    pub fn require(&self, column: &str) -> f64 {
        self.get(column)
            .unwrap_or_else(|| panic!("row has no {column}"))
    }
}

pub fn load_rows(corpus: &Path, slug: &str) -> Vec<CorpusRow> {
    let path = corpus.join(slug).join("points.csv");
    let text = std::fs::read_to_string(&path).unwrap_or_else(|_| panic!("read {}", path.display()));
    let mut lines = text.trim().split('\n').map(|l| l.trim_end_matches('\r'));
    let header: Vec<&str> = lines.next().expect("header").split(',').collect();
    lines
        .map(|line| {
            let mut cells = HashMap::new();
            let mut method = "";
            for (name, cell) in header.iter().zip(line.split(',')) {
                if *name == "method" {
                    method = cell;
                } else if !cell.trim().is_empty() {
                    cells.insert(
                        name.to_string(),
                        cell.trim()
                            .parse::<f64>()
                            .unwrap_or_else(|_| panic!("{name}={cell}")),
                    );
                }
            }
            CorpusRow {
                rogers: method == "rogers",
                alpha_deg: cells["alpha"],
                mach: cells["mach"],
                nozzle_exit_in: cells["nozzleExitIn"],
                cells,
            }
        })
        .collect()
}
