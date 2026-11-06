//! Pre-fix stability baseline writer for the P4 fin-station lane (test only).
//!
//! This file was first run at the lane base `be40032421b041b60118fbb9197b6ad1c1be2a69`
//! (before any production edit) with `ASTRAEA_P4_WRITE_BASELINE=1` to write
//! `tests/fixtures/p4-stability-baseline.json`. That file is the immutable
//! pre-fix anchor for the acceptance (a) bit-identity proof: designs whose fins
//! sit on the last body component must reproduce it bit-for-bit after the fix.
//!
//! Default run (env absent) skips. Running again with the env var set
//! regenerates from the current tree; it must never be used to repair a failing
//! identity assertion.

use astraea_core::aero;
use astraea_engine::models::{self, FrontendMotor, FrontendVehicle};
use serde_json::{json, Value};

const BASE_COMMIT: &str = "be40032421b041b60118fbb9197b6ad1c1be2a69";

fn fixture(name: &str) -> FrontendVehicle {
    let path = format!(
        "{}/tests/fixtures/{name}",
        env!("CARGO_MANIFEST_DIR"),
    );
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path}: {e}"));
    serde_json::from_str(&text).unwrap_or_else(|e| panic!("parse {path}: {e}"))
}

fn arcas_vehicle(body_tube_in: f64) -> FrontendVehicle {
    const IN: f64 = 0.0254;
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

fn bits(value: f64) -> String {
    format!("{:016x}", value.to_bits())
}

fn stability_record(fv: &FrontendVehicle) -> Value {
    let aero_v = models::to_aero_vehicle(fv).expect("aero vehicle");
    let stab = aero::compute_rocket_stability(&aero_v).expect("stability");
    json!({
        "total_cna": stab.total_cna,
        "cp": stab.cp,
        "static_margin_calibers": stab.static_margin_calibers,
        "cg": stab.cg,
        "total_length": stab.total_length,
        "reference_diameter": stab.reference_diameter,
        "contributions": stab
            .contributions
            .iter()
            .filter_map(|c| c.cna.zip(c.cp).map(|(cna, cp)| json!({
                "id": c.id,
                "cna": cna,
                "cp": cp,
            })))
            .collect::<Vec<_>>(),
        "bits": {
            "total_cna": bits(stab.total_cna),
            "cp": bits(stab.cp),
            "static_margin_calibers": bits(stab.static_margin_calibers),
        },
    })
}

fn prepared_record(fv: &FrontendVehicle) -> Value {
    let motor = dummy_motor();
    let v = models::prepare_flight_vehicle(fv, &motor).expect("prepare");
    json!({
        "cna_body": v.cna_body,
        "cna_fins": v.cna_fins,
        "body_first_moment": v.body_first_moment,
        "fin_first_moment": v.fin_first_moment,
        "body_abs_cna": v.body_abs_cna,
        "fin_abs_cna": v.fin_abs_cna,
        "cg_from_nose": v.cg_from_nose,
        "total_length": v.total_length,
        "ref_diameter": v.ref_diameter,
        "fin_sets": v.supersonic_normal.as_ref().map(|p| p.fin_sets.iter().map(|s| json!({
            "cna_per_rad": s.cna_per_rad,
            "cp_station_m": s.cp_station_m,
            "aspect_ratio": s.aspect_ratio,
            "leading_edge_cos": s.leading_edge_cos,
        })).collect::<Vec<_>>()).unwrap_or_default(),
        "bits": {
            "cna_fins": bits(v.cna_fins),
            "fin_first_moment": bits(v.fin_first_moment),
        },
    })
}

fn design(role: &str, fv: &FrontendVehicle) -> Value {
    json!({
        "role": role,
        "stability": stability_record(fv),
        "prepared": prepared_record(fv),
    })
}

#[test]
fn write_pre_fix_stability_baseline() {
    let Some(path) = std::env::var_os("ASTRAEA_P4_WRITE_BASELINE") else {
        eprintln!("SKIP p4_baseline: set ASTRAEA_P4_WRITE_BASELINE=<path> to write the fixture");
        return;
    };
    let alpha = fixture("alpha-vehicle.json");
    let nasa_sl = fixture("nasa-sl-vehicle.json");
    let spaceport = fixture("spaceport-vehicle.json");
    let arcas_short = arcas_vehicle(28.54);
    let arcas_long = arcas_vehicle(41.09);

    let doc = json!({
        "note": "Immutable pre-fix Barrowman stability baseline for the P4 fin-station lane. Generated before the production edit; unaffected designs must match bit-for-bit afterward.",
        "baseCommit": BASE_COMMIT,
        "designs": {
            "alpha": design("unaffected: fins on the last body component (tube)", &alpha),
            "nasa-sl": design("unaffected: fins on the last body component (booster tube)", &nasa_sl),
            "spaceport": design("affected: boattail follows the fin set; root wholly on the tube", &spaceport),
            "arcas-short": design("affected: root straddles tube/boattail (54.4% tube)", &arcas_short),
            "arcas-long": design("affected: root straddles tube/boattail (54.4% tube)", &arcas_long),
        },
    });
    let path = std::path::PathBuf::from(path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).expect("create baseline dir");
    }
    std::fs::write(&path, serde_json::to_string_pretty(&doc).expect("json") + "\n")
        .expect("write baseline");
    println!("wrote {}", path.display());
}
