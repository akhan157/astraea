//! P1 independent supersonic normal-law check against digitized NASA data
//! already in the repository (no holdout, no new data).
//!
//! CP: NASA TN D-4013 Figs. 11/12 (transonic) and TN D-4014 Fig. 7
//! (supersonic native points 1.50/1.80/2.30/2.96/3.96/4.63), as recorded in
//! `src/validation/arcas/measured-arcas.ts`.
//! CNalpha: TN D-4013 Fig. 7(b) M1.20 short-model points, digitized in
//! `docs/internal/accuracy-program/first-batch-2026-10-26/D1/` (slope from the
//! -2.137 deg / +1.973 deg pair).
//!
//! Pre-registered bands (`/home/ak/astraea-evidence/P1-supersonic-normal/pre_registration.json`):
//!   short M1.5-2.96 CP within +/-0.5 caliber; long M1.8-2.96 within +/-0.8;
//!   CNalpha within +/-20% at M1.2. All other Mach are report-only.
//!
//! Run:  CARGO_BUILD_JOBS=2 cargo test --offline --jobs 2 \
//!   --manifest-path crates/astraea-engine/Cargo.toml --test p1_arcas_normal -- --nocapture

use astraea_core::six_dof::{flight_normal_at_mach, BoattailLift, Vehicle};
use astraea_engine::models::{self, FrontendMotor, FrontendVehicle};
use serde_json::json;

const IN: f64 = 0.0254;
const CAL: f64 = 2.25 * IN; // ARCAS body diameter

fn arcas_vehicle(body_tube_in: f64) -> FrontendVehicle {
    let d = 2.25 * IN;
    let tube = body_tube_in * IN;
    let fin_offset = (body_tube_in - 1.840) * IN;
    let value = json!({
        "components": [
            {"id":"arcas-nose","name":"ARCAS ogive nose","type":"nosecone","materialId":"fiberglass",
             "shape":"ogive","length":10.6*IN,"baseDiameter":d,"wallThickness":0.002,"isHollow":true},
            {"id":"arcas-tube","name":"ARCAS body tube","type":"bodytube","materialId":"fiberglass",
             "length":tube,"outerDiameter":d,"innerDiameter":d-0.004},
            {"id":"arcas-boattail","name":"ARCAS boattail","type":"transition","materialId":"fiberglass",
             "length":1.810*IN,"foreDiameter":d,"aftDiameter":1.5*IN,"wallThickness":0.002,"isHollow":true},
            {"id":"arcas-fins","name":"ARCAS fins (4)","type":"trapezoidfinset","materialId":"fiberglass",
             "finCount":4,"rootChord":3.380*IN,"tipChord":2.165*IN,"span":2.103*IN,
             "sweepLength":(3.380-2.165)*IN,"thickness":0.125*IN,
             "crossSection":"double_wedge","axialOffset":fin_offset}
        ]
    });
    serde_json::from_value(value).expect("ARCAS FrontendVehicle")
}

fn dummy_motor() -> FrontendMotor {
    let value = json!({
        "designation": "p1-fixture",
        "diameter": 0.038,
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

struct Row {
    mach: f64,
    measured_pct: f64,
    model_pct: f64,
    residual_cal: f64,
}

fn residuals(vehicle: &Vehicle, points: &[(f64, f64)]) -> Vec<Row> {
    points
        .iter()
        .map(|&(mach, measured_pct)| {
            let (_, cp, _) = flight_normal_at_mach(mach, vehicle)
                .unwrap_or_else(|e| panic!("normal law at M{mach}: {e}"));
            let model_pct = 100.0 * cp / vehicle.total_length;
            Row {
                mach,
                measured_pct,
                model_pct,
                residual_cal: (model_pct - measured_pct) / 100.0 * vehicle.total_length / CAL,
            }
        })
        .collect()
}

fn print_rows(label: &str, rows: &[Row]) {
    println!("{label}");
    println!("mach,measured_pct,model_pct,residual_cal");
    for r in rows {
        println!(
            "{:.2},{:.1},{:.3},{:+.3}",
            r.mach, r.measured_pct, r.model_pct, r.residual_cal
        );
    }
}

fn assert_band(rows: &[Row], gate_machs: &[f64], band_cal: f64, label: &str) {
    for r in rows {
        if gate_machs.iter().any(|m| (*m - r.mach).abs() < 1e-12) {
            assert!(
                r.residual_cal.abs() <= band_cal,
                "{label} M{}: residual {:+.3} cal exceeds pre-registered +/-{band_cal} cal",
                r.mach,
                r.residual_cal
            );
        }
    }
}

// TN D-4014 Fig. 7 native supersonic CP points (measured-arcas.ts).
const SHORT_SUPERSONIC: &[(f64, f64)] = &[
    (1.50, 78.5),
    (1.80, 75.5),
    (2.30, 72.0),
    (2.96, 67.0),
    (3.96, 60.0),
    (4.63, 56.0),
];
const LONG_SUPERSONIC: &[(f64, f64)] = &[
    (1.80, 77.0),
    (2.30, 71.5),
    (2.96, 66.0),
    (3.96, 59.5),
    (4.63, 55.5),
];
const SHORT_TRANSONIC: &[(f64, f64)] = &[(1.20, 85.5)];
const LONG_TRANSONIC: &[(f64, f64)] = &[(1.20, 81.5)];

#[test]
fn arcas_cp_and_cn_alpha_against_digitized_nasa_data() {
    let motor = dummy_motor();
    let short = models::prepare_flight_vehicle(&arcas_vehicle(28.54), &motor).expect("short prepare");
    let long = models::prepare_flight_vehicle(&arcas_vehicle(41.09), &motor).expect("long prepare");

    let short_rows = residuals(&short, SHORT_SUPERSONIC);
    let long_rows = residuals(&long, LONG_SUPERSONIC);
    let mut short_context = residuals(&short, SHORT_TRANSONIC);
    short_context.extend(residuals(&short, &[(3.96, 60.0), (4.63, 56.0)]));
    let mut long_context = residuals(&long, LONG_TRANSONIC);
    long_context.extend(residuals(&long, &[(3.96, 59.5), (4.63, 55.5)]));

    print_rows("ARCAS-short supersonic CP (gate M1.5-2.96 +/-0.5 cal)", &short_rows);
    print_rows("ARCAS-long supersonic CP (gate M1.8-2.96 +/-0.8 cal)", &long_rows);
    print_rows("ARCAS-short context (report-only)", &short_context);
    print_rows("ARCAS-long context (report-only)", &long_context);

    // CNalpha at M1.2 from the three digitized CN points.
    let (cna, _, _) = flight_normal_at_mach(1.2, &short).expect("short M1.2");
    let measured_cna = 15.5_f64; // (0.611111 - (-0.5)) / (1.973 + 2.137) deg, per rad
    println!("ARCAS-short CNalpha M1.2: model {cna:.3} /rad, measured {measured_cna:.3} /rad, ratio {:.3}", cna / measured_cna);

    assert_band(&short_rows, &[1.5, 1.8, 2.3, 2.96], 0.5, "ARCAS-short");
    assert_band(&long_rows, &[1.8, 2.3, 2.96], 0.8, "ARCAS-long");
    assert!(
        (cna / measured_cna - 1.0).abs() <= 0.20,
        "ARCAS CNalpha ratio {:.3} outside +/-20%",
        cna / measured_cna
    );
}

#[test]
fn boattail_attached_arm_is_reported_for_the_same_points() {
    let motor = dummy_motor();
    let mut short = models::prepare_flight_vehicle(&arcas_vehicle(28.54), &motor).expect("short prepare");
    let mut long = models::prepare_flight_vehicle(&arcas_vehicle(41.09), &motor).expect("long prepare");
    if let Some(p) = short.supersonic_normal.as_mut() {
        p.boattail_lift = BoattailLift::Attached;
    }
    if let Some(p) = long.supersonic_normal.as_mut() {
        p.boattail_lift = BoattailLift::Attached;
    }
    print_rows(
        "SENSITIVITY boattail=attached ARCAS-short CP",
        &residuals(&short, SHORT_SUPERSONIC),
    );
    print_rows(
        "SENSITIVITY boattail=attached ARCAS-long CP",
        &residuals(&long, LONG_SUPERSONIC),
    );
    // No gate: this arm exists to show the load-bearing choice's size.
}

#[test]
fn subsonic_domain_is_bit_identical_on_real_prepared_vehicles() {
    let motor = dummy_motor();
    for (name, tube) in [("ARCAS-short", 28.54), ("ARCAS-long", 41.09)] {
        let prepared = models::prepare_flight_vehicle(&arcas_vehicle(tube), &motor)
            .unwrap_or_else(|e| panic!("{name}: prepare: {e}"));
        let mut legacy = prepared.clone();
        legacy.supersonic_normal = None;
        for k in 0..=80 {
            let mach = k as f64 * 0.01;
            let (c_new, cp_new, j_new) = flight_normal_at_mach(mach, &prepared).expect(name);
            let (c_old, cp_old, j_old) = flight_normal_at_mach(mach, &legacy).expect(name);
            assert_eq!(c_new.to_bits(), c_old.to_bits(), "{name} cna at M{mach}");
            assert_eq!(cp_new.to_bits(), cp_old.to_bits(), "{name} cp at M{mach}");
            assert_eq!(j_new.to_bits(), j_old.to_bits(), "{name} moment at M{mach}");
        }
    }
    println!("SUBSONIC INVARIANCE: 2 real prepared vehicles x 81 Mach samples, 0 ulp difference (CNa, CP, moment)");
}

// ---------------------------------------------------------------------------
// Report-only: legacy law on exactly the same points and convention.
// No gate, no assertion on the values, no interpretation against the frozen
// decision rule. Writes to ASTRAEA_P1_LEGACY_OUT when set.
// ---------------------------------------------------------------------------

fn cp_percent(vehicle: &Vehicle, mach: f64) -> f64 {
    let (_, cp, _) = flight_normal_at_mach(mach, vehicle)
        .unwrap_or_else(|e| panic!("normal law at M{mach}: {e}"));
    100.0 * cp / vehicle.total_length
}

fn residual_cal(vehicle: &Vehicle, mach: f64, measured_pct: f64) -> f64 {
    (cp_percent(vehicle, mach) - measured_pct) / 100.0 * vehicle.total_length / CAL
}

fn three_arms(prepared: &Vehicle) -> (Vehicle, Vehicle, Vehicle) {
    let mut legacy = prepared.clone();
    legacy.supersonic_normal = None;
    let suppressed = prepared.clone();
    let mut attached = prepared.clone();
    if let Some(p) = attached.supersonic_normal.as_mut() {
        p.boattail_lift = BoattailLift::Attached;
    }
    (legacy, suppressed, attached)
}

#[test]
fn legacy_arm_comparison_is_reported() {
    let motor = dummy_motor();
    let short_prepared =
        models::prepare_flight_vehicle(&arcas_vehicle(28.54), &motor).expect("short prepare");
    let long_prepared =
        models::prepare_flight_vehicle(&arcas_vehicle(41.09), &motor).expect("long prepare");

    let short_points: &[(f64, f64, bool)] = &[
        (1.20, 85.5, false),
        (1.50, 78.5, true),
        (1.80, 75.5, true),
        (2.30, 72.0, true),
        (2.96, 67.0, true),
        (3.96, 60.0, false),
        (4.63, 56.0, false),
    ];
    let long_points: &[(f64, f64, bool)] = &[
        (1.20, 81.5, false),
        (1.80, 77.0, true),
        (2.30, 71.5, true),
        (2.96, 66.0, true),
        (3.96, 59.5, false),
        (4.63, 55.5, false),
    ];

    let mut out = String::new();
    out.push_str("# P1 legacy-law comparison on the ARCAS gate and context points\n");
    out.push_str("# REPORT ONLY: no gate, no band change, not interpreted against the frozen decision rule.\n");
    out.push_str("# Same prepared vehicles, CP-percent and residual-caliber convention as p1_arcas_normal.\n");
    out.push_str("# Pre-registration: c4b77f21a96ac2f95c369d3d97506c11851cabee39e89eb176229979c8cdd3ad\n");
    out.push_str("model,mach,domain,measured_pct,legacy_pct,legacy_res_cal,suppressed_pct,suppressed_res_cal,attached_pct,attached_res_cal\n");

    for (label, prepared, points) in [
        ("ARCAS-short", &short_prepared, short_points),
        ("ARCAS-long", &long_prepared, long_points),
    ] {
        let (legacy, suppressed, attached) = three_arms(prepared);
        for &(mach, measured, gate) in points {
            out.push_str(&format!(
                "{label},{mach:.2},{},{measured:.1},{:.3},{:+.3},{:.3},{:+.3},{:.3},{:+.3}\n",
                if gate { "gate" } else { "context" },
                cp_percent(&legacy, mach),
                residual_cal(&legacy, mach, measured),
                cp_percent(&suppressed, mach),
                residual_cal(&suppressed, mach, measured),
                cp_percent(&attached, mach),
                residual_cal(&attached, mach, measured),
            ));
        }
    }

    out.push_str("\n# CNalpha at M1.2 vs the digitized TN D-4013 short-model slope 15.500 /rad\n");
    out.push_str("model,legacy_cna,legacy_ratio,suppressed_cna,suppressed_ratio,attached_cna,attached_ratio\n");
    let (legacy, suppressed, attached) = three_arms(&short_prepared);
    let measured_cna = 15.5_f64;
    let cna_of = |v: &Vehicle| flight_normal_at_mach(1.2, v).expect("cna").0;
    out.push_str(&format!(
        "ARCAS-short,{:.3},{:.3},{:.3},{:.3},{:.3},{:.3}\n",
        cna_of(&legacy),
        cna_of(&legacy) / measured_cna,
        cna_of(&suppressed),
        cna_of(&suppressed) / measured_cna,
        cna_of(&attached),
        cna_of(&attached) / measured_cna,
    ));
    out.push_str("\n# legacy = six_dof normal law with supersonic_normal=None (base 17a9c06 expression)\n");
    out.push_str("# suppressed = default B arm; attached = B with the boattail term kept\n");

    if let Some(path) = std::env::var_os("ASTRAEA_P1_LEGACY_OUT") {
        let path = std::path::PathBuf::from(path);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).expect("create output dir");
        }
        std::fs::write(&path, &out).expect("write legacy comparison");
        println!("wrote {}", path.display());
    }
    println!("{out}");
}
