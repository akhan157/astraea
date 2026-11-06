//! P4 product test: the Barrowman fin-body interference diameter must be the
//! body the fin is mounted on, not the last body component in array order.
//!
//! Anchor: `tests/fixtures/p4-stability-baseline.json`, generated from the
//! unmodified code at lane base `be40032` (commit `959e08c`, before any P4
//! production edit). Designs whose fins sit on the last body component must
//! reproduce it bit-for-bit; the affected designs must move by exactly the
//! closed-form interference ratio of the two body diameters.
//!
//! Env: `ASTRAEA_P4_WRITE_PARITY=<path>` writes the post-fix cross-language
//! fixture consumed by `src/aero/finStation.test.ts`. Default run verifies.

use astraea_core::aero::{self, StabilityAnalysis};
use astraea_engine::models::{self, FrontendMotor, FrontendVehicle};
use serde_json::{json, Value};

const BASELINE: &str = include_str!("fixtures/p4-stability-baseline.json");
const IN: f64 = 0.0254;

fn fixture(name: &str) -> FrontendVehicle {
    let path = format!("{}/tests/fixtures/{name}", env!("CARGO_MANIFEST_DIR"));
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("parse {path}: {e}"))
}

fn arcas_vehicle(body_tube_in: f64) -> FrontendVehicle {
    let d = 2.25 * IN;
    let value = json!({
        "components": [
            {"id":"arcas-nose","name":"ARCAS ogive nose","type":"nosecone","materialId":"fiberglass",
             "shape":"ogive","length":10.6*IN,"baseDiameter":d,"wallThickness":0.002,"isHollow":true},
            {"id":"arcas-tube","name":"ARCAS body tube","type":"bodytube","materialId":"fiberglass",
             "length":body_tube_in*IN,"outerDiameter":d,"innerDiameter":d-0.004},
            {"id":"arcas-boattail","name":"ARCAS boattail","type":"transition","materialId":"fiberglass",
             "length":1.810*IN,"foreDiameter":d,"aftDiameter":1.5*IN,"wallThickness":0.002,"isHollow":true},
            {"id":"arcas-fins","name":"ARCAS fins (4)","type":"trapezoidfinset","materialId":"fiberglass",
             "finCount":4,"rootChord":3.380*IN,"tipChord":2.165*IN,"span":2.103*IN,
             "sweepLength":(3.380-2.165)*IN,"thickness":0.125*IN,
             "crossSection":"double_wedge","axialOffset":(body_tube_in-1.840)*IN}
        ]
    });
    serde_json::from_value(value).expect("ARCAS FrontendVehicle")
}

/// Reviewer probe: conical taper tail 0.5..0.7 m (0.06 -> 0.04) with a
/// 0.01 m root at 0.55..0.56 m. Root-local diameter at mid chord is 0.0545.
fn reviewer_taper_vehicle() -> FrontendVehicle {
    let value = json!({
        "components": [
            {"id":"n","name":"n","type":"nosecone","materialId":"cardboard","shape":"conical",
             "length":0.1,"baseDiameter":0.06,"wallThickness":0.002,"isHollow":true},
            {"id":"b","name":"b","type":"bodytube","materialId":"cardboard",
             "length":0.4,"outerDiameter":0.06,"innerDiameter":0.058},
            {"id":"t","name":"t","type":"transition","materialId":"cardboard",
             "length":0.2,"foreDiameter":0.06,"aftDiameter":0.04,"wallThickness":0.002,"isHollow":true},
            {"id":"f","name":"f","type":"trapezoidfinset","materialId":"balsa","finCount":4,
             "rootChord":0.01,"tipChord":0.05,"span":0.06,"sweepLength":0.03,
             "thickness":0.003,"crossSection":"rounded","axialOffset":0.45}
        ]
    });
    serde_json::from_value(value).expect("reviewer taper vehicle")
}

/// Reviewer probe / parity: von Karman nose 0..0.4 m base 0.08 with a
/// 0.2 m root at 0.1..0.3 m (mid chord u = 0.5).
fn nose_mount_vehicle() -> FrontendVehicle {
    let value = json!({
        "components": [
            {"id":"n","name":"n","type":"nosecone","materialId":"cardboard","shape":"vonkarman",
             "length":0.4,"baseDiameter":0.08,"wallThickness":0.002,"isHollow":true},
            {"id":"f","name":"f","type":"trapezoidfinset","materialId":"balsa","finCount":4,
             "rootChord":0.2,"tipChord":0.05,"span":0.06,"sweepLength":0.03,
             "thickness":0.003,"crossSection":"rounded","axialOffset":0.1}
        ]
    });
    serde_json::from_value(value).expect("nose-mount vehicle")
}

fn dummy_motor() -> FrontendMotor {
    let value = json!({
        "designation": "p4-fixture",
        "diameter": 0.020,
        "length": 0.20,
        "burnTime": 1.0,
        "propellantMass": 0.1,
        "totalMass": 0.5,
        "dryMass": 0.4,
        "maxThrust": 500.0,
        "thrustCurve": [{"time":0.0,"thrust":500.0},{"time":1.0,"thrust":500.0}]
    });
    serde_json::from_value(value).expect("dummy FrontendMotor")
}

fn design(id: &str) -> FrontendVehicle {
    match id {
        "alpha" => fixture("alpha-vehicle.json"),
        "nasa-sl" => fixture("nasa-sl-vehicle.json"),
        "spaceport" => fixture("spaceport-vehicle.json"),
        "arcas-short" => arcas_vehicle(28.54),
        "arcas-long" => arcas_vehicle(41.09),
        "taper-mount" => reviewer_taper_vehicle(),
        "nose-mount" => nose_mount_vehicle(),
        other => panic!("unknown design {other}"),
    }
}

fn stability(id: &str) -> StabilityAnalysis {
    let fv = design(id);
    let aero_v = models::to_aero_vehicle(&fv).expect("aero vehicle");
    aero::compute_rocket_stability(&aero_v).expect("stability")
}

fn baseline_design(id: &str) -> Value {
    let doc: Value = serde_json::from_str(BASELINE).expect("baseline json");
    doc["designs"][id].clone()
}

fn contribution<'a>(s: &'a StabilityAnalysis, id: &str) -> &'a aero::ComponentContribution {
    s.contributions
        .iter()
        .find(|c| c.id == id)
        .unwrap_or_else(|| panic!("contribution {id}"))
}

fn interference(diameter: f64, span: f64) -> f64 {
    let r = diameter / 2.0;
    let kfb = 1.0 + r / (span + r);
    let kbf = (r / (span + r)).powi(2) * (1.0 + span / r);
    kfb + kbf
}

fn is_fin(kind: &str) -> bool {
    matches!(kind, "trapezoidfinset" | "ellipticalfinset" | "freeformfinset")
}

#[test]
fn designs_on_the_last_body_component_are_bit_identical() {
    for id in ["alpha", "nasa-sl"] {
        let base = baseline_design(id);
        let s = stability(id);
        let b = &base["stability"];
        let label = |field: &str| format!("{id}: {field}");

        assert_eq!(s.total_cna.to_bits(), b["total_cna"].as_f64().unwrap().to_bits(), "{}", label("total_cna"));
        assert_eq!(s.cp.to_bits(), b["cp"].as_f64().unwrap().to_bits(), "{}", label("cp"));
        assert_eq!(
            s.static_margin_calibers.to_bits(),
            b["static_margin_calibers"].as_f64().unwrap().to_bits(),
            "{}",
            label("static_margin_calibers")
        );
        for want in b["contributions"].as_array().unwrap() {
            let got = contribution(&s, want["id"].as_str().unwrap());
            assert_eq!(
                got.cna.unwrap().to_bits(),
                want["cna"].as_f64().unwrap().to_bits(),
                "{} contribution cna",
                want["id"].as_str().unwrap()
            );
            assert_eq!(
                got.cp.unwrap().to_bits(),
                want["cp"].as_f64().unwrap().to_bits(),
                "{} contribution cp",
                want["id"].as_str().unwrap()
            );
        }

        // Product path: the prepared flight vehicle's fin group is the same
        // arithmetic, so it must be bit-identical too.
        let fv = design(id);
        let prepared = models::prepare_flight_vehicle(&fv, &dummy_motor()).expect("prepare");
        let want = &base["prepared"];
        assert_eq!(
            prepared.cna_fins.to_bits(),
            want["cna_fins"].as_f64().unwrap().to_bits(),
            "{} prepared cna_fins",
            id
        );
        assert_eq!(
            prepared.fin_first_moment.to_bits(),
            want["fin_first_moment"].as_f64().unwrap().to_bits(),
            "{} prepared fin_first_moment",
            id
        );
    }
}

#[test]
fn affected_designs_move_by_the_closed_form_interference_ratio() {
    // design, fin contribution id, fin span (m), old body diameter (m), new (m)
    let cases = [
        ("spaceport", "sac-fins", 0.14, 0.088, 0.102),
        ("arcas-short", "arcas-fins", 2.103 * IN, 1.5 * IN, 2.25 * IN),
        ("arcas-long", "arcas-fins", 2.103 * IN, 1.5 * IN, 2.25 * IN),
    ];
    for (id, fin_id, span, old_d, new_d) in cases {
        let base = baseline_design(id);
        let s = stability(id);
        let old = &base["stability"];
        let old_fin = old["contributions"]
            .as_array()
            .unwrap()
            .iter()
            .find(|c| c["id"].as_str() == Some(fin_id))
            .expect("baseline fin contribution");
        let new_fin = contribution(&s, fin_id);

        // Only the fin term moves: every other contribution is bit-identical.
        for want in old["contributions"].as_array().unwrap() {
            if want["id"].as_str() == Some(fin_id) {
                continue;
            }
            let got = contribution(&s, want["id"].as_str().unwrap());
            assert_eq!(
                got.cna.unwrap().to_bits(),
                want["cna"].as_f64().unwrap().to_bits(),
                "{id}: non-fin cna {} changed",
                want["id"]
            );
            assert_eq!(
                got.cp.unwrap().to_bits(),
                want["cp"].as_f64().unwrap().to_bits(),
                "{id}: non-fin cp {} changed",
                want["id"]
            );
        }

        let ratio = new_fin.cna.unwrap() / old_fin["cna"].as_f64().unwrap();
        let expected = interference(new_d, span) / interference(old_d, span);
        assert!(
            (ratio - expected).abs() <= 1e-12 * expected,
            "{id}: fin CNa ratio {ratio} != interference ratio {expected} (old d {old_d}, new d {new_d})"
        );
        assert!(
            new_fin.cna.unwrap() > old_fin["cna"].as_f64().unwrap(),
            "{id}: interference radius must grow"
        );
        assert!(
            s.cp > old["cp"].as_f64().unwrap(),
            "{id}: CP must move aft"
        );
        // The fin moment term keeps the combined fin/body-interference CP.
        let dcp = s.cp - old["cp"].as_f64().unwrap();
        assert!(dcp > 0.0);
    }
}

#[test]
fn affected_design_cp_deltas_match_the_gate_1_predictions() {
    // Predicted at M0 from the exact pre-fix formulas (Gate 1 note). The
    // tolerance is 0.2 mm: the risk notices are geometry, not tuning.
    for (id, predicted_cal) in [
        ("spaceport", 0.1167),
        ("arcas-short", 0.3410),
        ("arcas-long", 0.4640),
    ] {
        let old = baseline_design(id)["stability"].clone();
        let s = stability(id);
        let dcp_cal = (s.cp - old["cp"].as_f64().unwrap()) / s.reference_diameter;
        assert!(
            (dcp_cal - predicted_cal).abs() <= 2e-4,
            "{id}: measured dCP {dcp_cal:.5} cal vs predicted {predicted_cal:.4} cal"
        );
    }
}

#[test]
fn prepared_fin_group_is_the_corrected_stability_contribution() {
    for id in ["spaceport", "arcas-short", "arcas-long"] {
        let fv = design(id);
        let s = stability(id);
        let prepared = models::prepare_flight_vehicle(&fv, &dummy_motor()).expect("prepare");
        let fins: Vec<_> = s.contributions.iter().filter(|c| is_fin(c.kind.as_str()) && c.cna != Some(0.0)).collect();
        assert_eq!(fins.len(), 1, "{id}: one lifting fin set expected");
        let cna = fins[0].cna.unwrap();
        let cp = fins[0].cp.unwrap();
        assert_eq!(prepared.cna_fins.to_bits(), cna.to_bits(), "{id}: prepared cna_fins");
        assert_eq!(prepared.fin_first_moment.to_bits(), (cna * cp).to_bits(), "{id}: prepared fin moment");
        let sets = prepared.supersonic_normal.as_ref().expect("supersonic normal").fin_sets.clone();
        assert_eq!(sets.len(), 1);
        assert_eq!(sets[0].cna_per_rad.to_bits(), cna.to_bits(), "{id}: fin set cna");
        assert_eq!(sets[0].cp_station_m.to_bits(), cp.to_bits(), "{id}: fin set cp");
    }
}

#[test]
fn write_post_fix_parity_fixture() {
    let Some(path) = std::env::var_os("ASTRAEA_P4_WRITE_PARITY") else {
        eprintln!("SKIP p4_fin_station parity writer: set ASTRAEA_P4_WRITE_PARITY=<path>");
        return;
    };
    let mut designs = serde_json::Map::new();
    for id in [
        "alpha",
        "nasa-sl",
        "spaceport",
        "arcas-short",
        "arcas-long",
        "taper-mount",
        "nose-mount",
    ] {
        let s = stability(id);
        designs.insert(
            id.to_string(),
            json!({
                "totalCna": s.total_cna,
                "cp": s.cp,
                "staticMarginCalibers": s.static_margin_calibers,
                "contributions": s.contributions.iter().filter_map(|c| {
                    c.cna.zip(c.cp).map(|(cna, cp)| json!({"id": c.id, "cna": cna, "cp": cp}))
                }).collect::<Vec<_>>(),
            }),
        );
    }
    let doc = json!({
        "note": "Post-fix P4 fin-station parity fixture. Mirrors the TS implementation to <=1e-12 relative; the bit-identity anchor is the separate pre-fix baseline.",
        "baseCommit": "be40032421b041b60118fbb9197b6ad1c1be2a69",
        "designs": designs,
    });
    let path = std::path::PathBuf::from(path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("create parity dir");
    }
    std::fs::write(&path, serde_json::to_string_pretty(&doc).expect("json") + "\n").expect("write parity");
    println!("wrote {}", path.display());
}

#[test]
fn reviewer_taper_probe_selects_the_root_local_diameter() {
    // Reviewer finding 1: transition 0.50..0.70 m, D 0.06 -> 0.04, root
    // 0.55..0.56. Local D runs 0.055..0.054 (0.0545 at mid chord); the old
    // code used the aft diameter 0.04.
    let fv = reviewer_taper_vehicle();
    let aero_v = models::to_aero_vehicle(&fv).expect("aero vehicle");
    let s = aero::compute_rocket_stability(&aero_v).expect("stability");
    let fin = contribution(&s, "f");
    let local = 0.0545_f64; // 0.06 + (0.04 - 0.06) * ((0.555 - 0.5) / 0.2)
    let want = aero::compute_trapezoid_fin_aero(4, 0.01, 0.05, 0.06, 0.03, 0.55, local, 0.06);
    let got = fin.cna.unwrap();
    assert!(
        (got - want.cna).abs() <= 1e-12 * want.cna,
        "taper root CNa {got} != local-diameter {want_cna} (local D {local})",
        want_cna = want.cna
    );
    // Reviewer bounds: strictly above the aft-local lower bound (D=0.054)
    // and below the fore-local value (D=0.055).
    let lower = aero::compute_trapezoid_fin_aero(4, 0.01, 0.05, 0.06, 0.03, 0.55, 0.054, 0.06);
    let upper = aero::compute_trapezoid_fin_aero(4, 0.01, 0.05, 0.06, 0.03, 0.55, 0.055, 0.06);
    assert!(got > lower.cna, "taper CNa {got} must exceed {l}", l = lower.cna);
    assert!(got < upper.cna, "taper CNa {got} must stay below {u}", u = upper.cna);
    let old = aero::compute_trapezoid_fin_aero(4, 0.01, 0.05, 0.06, 0.03, 0.55, 0.04, 0.06);
    assert!(got != old.cna, "taper root still uses the aft diameter");
}

#[test]
fn reviewer_decimal_joint_is_a_forward_tie() {
    // Finding 2: nose 0.1 + tube 0.4 => joint 0.5; root 0.4..0.6. Raw
    // overlaps differ in the last bits; the scale-aware tie goes forward.
    let value = json!({
        "components": [
            {"id":"n","name":"n","type":"nosecone","materialId":"cardboard","shape":"conical",
             "length":0.1,"baseDiameter":0.06,"wallThickness":0.002,"isHollow":true},
            {"id":"b","name":"b","type":"bodytube","materialId":"cardboard",
             "length":0.4,"outerDiameter":0.06,"innerDiameter":0.058},
            {"id":"t","name":"t","type":"transition","materialId":"cardboard",
             "length":0.2,"foreDiameter":0.06,"aftDiameter":0.04,"wallThickness":0.002,"isHollow":true},
            {"id":"f","name":"f","type":"trapezoidfinset","materialId":"balsa","finCount":4,
             "rootChord":0.2,"tipChord":0.05,"span":0.06,"sweepLength":0.03,
             "thickness":0.003,"crossSection":"rounded","axialOffset":0.3}
        ]
    });
    let fv: FrontendVehicle = serde_json::from_value(value).expect("tie vehicle");
    let aero_v = models::to_aero_vehicle(&fv).expect("aero vehicle");
    let s = aero::compute_rocket_stability(&aero_v).expect("stability");
    let got = contribution(&s, "f").cna.unwrap();
    let forward = aero::compute_trapezoid_fin_aero(4, 0.2, 0.05, 0.06, 0.03, 0.4, 0.06, 0.06);
    let aft = aero::compute_trapezoid_fin_aero(4, 0.2, 0.05, 0.06, 0.03, 0.4, 0.04, 0.06);
    assert_eq!(got.to_bits(), forward.cna.to_bits(), "decimal joint must go forward");
    assert_ne!(got.to_bits(), aft.cna.to_bits(), "decimal joint fell aft");
}

#[test]
fn nose_mounted_root_uses_the_profile_radius_at_mid_chord() {
    let fv = nose_mount_vehicle();
    let aero_v = models::to_aero_vehicle(&fv).expect("aero vehicle");
    let s = aero::compute_rocket_stability(&aero_v).expect("stability");
    let got = contribution(&s, "f").cna.unwrap();
    let want = aero::compute_trapezoid_fin_aero(
        4, 0.2, 0.05, 0.06, 0.03, 0.1, 0.08 / 2.0_f64.sqrt(), 0.08,
    );
    assert!(
        (got - want.cna).abs() <= 1e-12 * want.cna,
        "nose root CNa {got} != von Karman mid-chord {w}",
        w = want.cna
    );
    assert_ne!(
        got.to_bits(),
        aero::compute_trapezoid_fin_aero(4, 0.2, 0.05, 0.06, 0.03, 0.1, 0.08, 0.08).cna.to_bits(),
        "nose root still uses the base diameter"
    );
}

#[test]
fn r9_corpus_fins_select_the_legacy_body_diameter() {
    // Acceptance (a) on the external R9 corpus: the new rule must return the
    // pre-fix running diameter for every fin set, so the prepared vehicle (and
    // therefore every trajectory) is bit-identical. Reads inputs only.
    let Some(manifest) = std::env::var_os("ASTRAEA_P1_MANIFEST") else {
        eprintln!("SKIP p4_fin_station R9 selection: ASTRAEA_P1_MANIFEST is not set");
        return;
    };
    let text = std::fs::read_to_string(&manifest).expect("manifest");
    let doc: Value = serde_json::from_str(&text).expect("manifest json");
    let mut checked = 0;
    for entry in doc["entries"].as_array().expect("entries") {
        let Some(vehicle) = entry.get("vehicle") else { continue };
        let fv: FrontendVehicle = serde_json::from_value(vehicle.clone()).expect("vehicle");
        let aero_v = models::to_aero_vehicle(&fv).expect("aero vehicle");
        let s = aero::compute_rocket_stability(&aero_v).expect("stability");
        let mut x = 0.0;
        let mut last_tube_start = 0.0;
        let mut last_body_diameter = s.reference_diameter;
        for comp in &aero_v.components {
            match &comp.component {
                aero::Component::Nosecone { length, base_diameter, .. } => {
                    last_body_diameter = *base_diameter;
                    x += *length;
                }
                aero::Component::BodyTube { length, outer_diameter, .. } => {
                    last_tube_start = x;
                    last_body_diameter = *outer_diameter;
                    x += *length;
                }
                aero::Component::Transition { length, aft_diameter, .. } => {
                    last_body_diameter = *aft_diameter;
                    x += *length;
                }
                aero::Component::TrapezoidFin {
                    fin_count,
                    root_chord,
                    tip_chord,
                    span,
                    sweep_length,
                    axial_offset,
                    ..
                } => {
                    let start = last_tube_start + axial_offset.unwrap_or(0.0);
                    let want = aero::compute_trapezoid_fin_aero(
                        *fin_count,
                        *root_chord,
                        *tip_chord,
                        *span,
                        *sweep_length,
                        start,
                        last_body_diameter,
                        s.reference_diameter,
                    );
                    let got = s
                        .contributions
                        .iter()
                        .find(|c| c.id == comp.id)
                        .expect("fin contribution");
                    assert_eq!(
                        got.cna.unwrap().to_bits(),
                        want.cna.to_bits(),
                        "{}: cna differs from the pre-fix diameter",
                        entry["name"]
                    );
                    assert_eq!(
                        got.cp.unwrap().to_bits(),
                        want.cp.to_bits(),
                        "{}: cp differs from the pre-fix diameter",
                        entry["name"]
                    );
                    checked += 1;
                }
                _ => {}
            }
        }
    }
    println!("R9 corpus: {checked} fin sets select the pre-fix body diameter bit-for-bit");
    assert!(checked >= 9, "expected the five R9 designs and the screen set");
}
