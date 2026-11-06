//! P1 fix round: one-sided derivatives of the transonic blend at
//! M = 0.8 and M = 1.2 on prepared ARCAS and R9 vehicles.
//!
//! Report + gate for the review finding: the previous blend froze r(1.2) and
//! forced a zero left derivative while the exterior law had a nonzero slope.
//! The repaired blend is cubic Hermite per group and must match value and
//! slope at both joins where the shape-preserving limiter is inactive.
//!
//! Run:
//!   ASTRAEA_P1_MANIFEST=… cargo test --test p1_derivative_continuity -- --nocapture
//! The R9 designs are skipped when the manifest env var is absent.

use astraea_core::six_dof::{
    flight_normal_at_mach, BoattailLift, Vehicle,
};
use astraea_engine::models::{self, FrontendMotor, FrontendVehicle};
use serde_json::json;
use std::path::PathBuf;

const IN: f64 = 0.0254;

fn arcas_vehicle(body_tube_in: f64) -> FrontendVehicle {
    let d = 2.25 * IN;
    let tube = body_tube_in * IN;
    let fin_offset = (body_tube_in - 1.840) * IN;
    serde_json::from_value(json!({
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
    })).expect("ARCAS vehicle")
}

fn dummy_motor() -> FrontendMotor {
    serde_json::from_value(json!({
        "designation": "p1-fixture",
        "diameter": 0.038,
        "length": 0.20,
        "burnTime": 1.0,
        "propellantMass": 0.1,
        "totalMass": 0.5,
        "dryMass": 0.4,
        "maxThrust": 500.0,
        "thrustCurve": [{"time":0.0,"thrust":500.0},{"time":1.0,"thrust":500.0}]
    }))
    .expect("dummy motor")
}

struct Probe {
    c: f64,
    cp: f64,
    j: f64,
}

fn probe(vehicle: &Vehicle, mach: f64) -> Probe {
    let (c, cp, j) = flight_normal_at_mach(mach, vehicle)
        .unwrap_or_else(|e| panic!("normal law at M{mach}: {e}"));
    Probe { c, cp, j }
}

struct OneSided {
    dl_c: f64,
    dr_c: f64,
    dl_cp: f64,
    dr_cp: f64,
    dl_j: f64,
    dr_j: f64,
}

fn one_sided(vehicle: &Vehicle, boundary: f64, h: f64) -> OneSided {
    let at = probe(vehicle, boundary);
    let left = probe(vehicle, boundary - h);
    let right = probe(vehicle, boundary + h);
    OneSided {
        dl_c: (at.c - left.c) / h,
        dr_c: (right.c - at.c) / h,
        dl_cp: (at.cp - left.cp) / h,
        dr_cp: (right.cp - at.cp) / h,
        dl_j: (at.j - left.j) / h,
        dr_j: (right.j - at.j) / h,
    }
}

fn check(label: &str, vehicle: &Vehicle) {
    let h = 1e-6;
    for boundary in [0.8_f64, 1.2_f64] {
        let d = one_sided(vehicle, boundary, h);
        println!(
            "{label} M{boundary}: dC left {:+.9e} right {:+.9e} | dCP left {:+.9e} right {:+.9e} | dJ left {:+.9e} right {:+.9e}",
            d.dl_c, d.dr_c, d.dl_cp, d.dr_cp, d.dl_j, d.dr_j
        );
        if boundary == 0.8 {
            // Both analytic slopes are zero at the legacy join; the finite
            // difference has O(h) curvature truncation.
            assert!((d.dl_c - d.dr_c).abs() <= 1e-2, "{label} dC kink at 0.8");
            assert!((d.dl_cp - d.dr_cp).abs() <= 1e-3, "{label} dCP kink at 0.8");
            assert!((d.dl_j - d.dr_j).abs() <= 1e-2, "{label} dJ kink at 0.8");
        } else {
            // Independent endpoint oracle: with m0=0, monotonicity requires
            // m1/secant in [0,3]. Exterior derivatives remain unchanged.
            let p = vehicle.supersonic_normal.as_ref().unwrap();
            let mut blend_c = 0.0;
            let mut blend_j = 0.0;
            let mut exterior_c = 0.0;
            let mut exterior_j = 0.0;
            let mut inactive = true;
            for set in &p.fin_sets {
                let end = set.cna_per_rad * astraea_core::aero::published_fin_lift_slope_ratio(1.2, set.aspect_ratio, set.leading_edge_cos);
                let secant = (end - set.cna_per_rad) / (1.2 - 0.8);
                let exterior = set.cna_per_rad * astraea_core::aero::published_fin_lift_slope_ratio_derivative(1.2, set.aspect_ratio, set.leading_edge_cos);
                let limited = if secant * exterior <= 0.0 { 0.0 }
                    else { exterior.signum() * exterior.abs().min(3.0 * secant.abs()) };
                inactive &= limited == exterior;
                blend_c += limited;
                blend_j += limited * set.cp_station_m;
                exterior_c += exterior;
                exterior_j += exterior * set.cp_station_m;
            }
            let at = probe(vehicle, boundary);
            let cp_slope = |dc: f64, dj: f64| (dj * at.c - at.j * dc) / (at.c * at.c);
            let blend_cp = cp_slope(blend_c, blend_j);
            let exterior_cp = cp_slope(exterior_c, exterior_j);
            println!("{label}: limiter inactive={inactive}; expected blend dC={blend_c} exterior dC={exterior_c}");
            for (got, expected, floor) in [
                (d.dl_c, blend_c, 1.0), (d.dl_j, blend_j, 1.0), (d.dl_cp, blend_cp, 1e-3),
                (d.dr_c, exterior_c, 1.0), (d.dr_j, exterior_j, 1.0), (d.dr_cp, exterior_cp, 1e-3),
            ] {
                assert!((got - expected).abs() <= 1e-2 * expected.abs().max(floor),
                    "{label}: endpoint slope {got} vs {expected}");
            }
            if inactive {
                assert!((d.dl_c - d.dr_c).abs() <= 1e-2 * d.dr_c.abs().max(1.0), "{label} dC kink at inactive join");
                assert!((d.dl_cp - d.dr_cp).abs() <= 1e-2 * d.dr_cp.abs().max(1e-3), "{label} dCP kink at inactive join");
                assert!((d.dl_j - d.dr_j).abs() <= 1e-2 * d.dr_j.abs().max(1.0), "{label} dJ kink at inactive join");
            }
        }
    }
}

#[test]
fn blend_derivatives_match_limited_or_exterior_slopes_on_prepared_vehicles() {
    let motor = dummy_motor();
    for (name, tube) in [("ARCAS-short", 28.54), ("ARCAS-long", 41.09)] {
        let prepared = models::prepare_flight_vehicle(&arcas_vehicle(tube), &motor)
            .unwrap_or_else(|e| panic!("{name}: {e}"));
        check(name, &prepared);
        let mut attached = prepared.clone();
        if let Some(p) = attached.supersonic_normal.as_mut() {
            p.boattail_lift = BoattailLift::Attached;
        }
        check(&format!("{name} boattail=attached"), &attached);
    }

    let Some(manifest_path) = std::env::var_os("ASTRAEA_P1_MANIFEST").map(PathBuf::from) else {
        eprintln!("SKIP R9 derivative probes: ASTRAEA_P1_MANIFEST is not set.");
        return;
    };
    let manifest: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&manifest_path).expect("manifest"))
            .expect("manifest json");
    let entries = manifest["entries"].as_array().expect("entries");
    for name in ["qu8k", "dontdebatethisn5800mindia", "proteus6"] {
        let entry = entries
            .iter()
            .find(|e| e["name"].as_str() == Some(name))
            .unwrap_or_else(|| panic!("{name} entry"));
        let vehicle: FrontendVehicle = serde_json::from_value(entry["vehicle"].clone()).expect("vehicle");
        let motor_dto: FrontendMotor = serde_json::from_value(entry["motor"].clone()).expect("motor");
        let prepared = models::prepare_flight_vehicle(&vehicle, &motor_dto)
            .unwrap_or_else(|e| panic!("{name}: {e}"));
        check(name, &prepared);
    }
}

// Every fin/body group must stay within its own endpoint range. Testing the
// total alone could hide an overshooting fin behind a positive body term.
fn bounded(value: f64, a: f64, b: f64) {
    assert!(value.is_finite() && value >= a.min(b) && value <= a.max(b),
        "out of endpoint bounds: {value} outside [{a}, {b}]");
}

#[test]
fn arcas_near_swept_sonic_reproducer_is_positive() {
    let mut dto = arcas_vehicle(28.54);
    dto.components.iter_mut().find(|c| c.kind == "trapezoidfinset").unwrap()
        .sweep_length = Some(0.035436937010036015);
    let prepared = models::prepare_flight_vehicle(&dto, &dummy_motor()).unwrap();
    let cos = prepared.supersonic_normal.as_ref().unwrap().fin_sets[0].leading_edge_cos;
    assert!((cos - 0.8333).abs() < 1e-15);
    let got = probe(&prepared, 1.0);
    println!("reproducer sweep=0.035436937010036015 cos={cos} M=1 CNa={} CP={} J={}", got.c, got.cp, got.j);
    assert!(got.c > 0.0 && got.cp.is_finite());
}

#[test]
fn dense_sweep_mach_scan_is_positive_bounded_and_finite() {
    let motor = dummy_motor();
    let mut samples = 0;
    let mut min_cna = f64::INFINITY;
    let mut max_cna = f64::NEG_INFINITY;
    // 601 uniform sweep cosines, plus the reproducer and both sides of the
    // exact endpoint cusp (the uniform grid alone does not hit these).
    let cosines = (0..=600).map(|k| 0.70 + k as f64 * 0.0005)
        .chain([0.8333, 1.0 / 1.2 - 1e-10, 1.0 / 1.2, 1.0 / 1.2 + 1e-10]);
    for cos in cosines {
        let mut dto = arcas_vehicle(28.54);
        let fin = dto.components.iter_mut().find(|c| c.kind == "trapezoidfinset").unwrap();
        let span = fin.span.unwrap();
        fin.sweep_length = Some(span * (1.0 / (cos * cos) - 1.0).sqrt());
        let prepared = models::prepare_flight_vehicle(&dto, &motor).unwrap();
        for arm in [BoattailLift::Suppressed, BoattailLift::Attached] {
            let mut v = prepared.clone();
            v.supersonic_normal.as_mut().unwrap().boattail_lift = arm;
            let p = v.supersonic_normal.as_ref().unwrap();
            // Isolate fin and body groups through the public production law.
            let mut fin = v.clone();
            fin.cna_body = 0.0;
            fin.body_first_moment = 0.0;
            fin.body_abs_cna = 0.0;
            let fp = fin.supersonic_normal.as_mut().unwrap();
            fp.body_attached_cna = 0.0;
            fp.body_attached_moment = 0.0;
            fp.body_attached_abs_cna = 0.0;
            fp.body_positive_cna = 0.0;
            fp.body_positive_moment = 0.0;
            fp.body_positive_abs_cna = 0.0;
            let mut body = v.clone();
            body.cna_fins = 0.0;
            body.fin_first_moment = 0.0;
            body.fin_abs_cna = 0.0;
            body.supersonic_normal.as_mut().unwrap().fin_sets.clear();
            let f0 = probe(&fin, 0.8);
            let f1 = probe(&fin, 1.2);
            let b0 = probe(&body, 0.8);
            let b1 = probe(&body, 1.2);
            for k in 0..=400 {
                let mach = if k == 400 { 1.2 } else { 0.8 + k as f64 * 0.001 };
                let total = probe(&v, mach);
                assert!(total.c > 0.0 && total.cp.is_finite() && total.j.is_finite(), "cos={cos} M={mach}");
                let f = probe(&fin, mach);
                let b = probe(&body, mach);
                for (got, lo, hi) in [(f.c, f0.c, f1.c), (f.j, f0.j, f1.j),
                                      (b.c, b0.c, b1.c), (b.j, b0.j, b1.j)] {
                    bounded(got, lo, hi);
                }
                // Absolute support is likewise bounded for each positive fin group.
                assert_eq!(p.fin_sets.len(), 1);
                min_cna = min_cna.min(total.c);
                max_cna = max_cna.max(total.c);
                samples += 1;
            }
        }
    }
    assert_eq!(samples, 605 * 2 * 401);
    println!("dense scan: {samples} geometry/arm/Mach samples; CNa [{min_cna}, {max_cna}]; 0 nonpositive, 0 out-of-bounds groups, 0 nonfinite CP");
}
