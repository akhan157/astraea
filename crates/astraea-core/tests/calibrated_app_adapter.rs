//! App-vehicle adapter: mapping, and the refusal matrix.
//!
//! The mapping test builds the same synthetic vehicle as design 0 of
//! `fixtures/aero-oracle-parity.json` and requires the adapter's design to
//! evaluate to the TS oracle's answers. The refusal tests pin every component
//! the calibrated method does not model, with the user-facing reason.

use astraea_core::aero::{
    Component, ComponentDesignInputs, FinCrossSection, NoseShape, Vehicle, VehicleComponent,
    VehicleDesignInputs,
};
use astraea_core::aero_model::{design_from_app_vehicle, support, AeroSupportStatus};
use astraea_core::calibrated::{
    evaluate, Airfoil, CalibratedError, CpMethod, EvalOptions, SurfaceFinish,
};
use astraea_core::fin_planform::FinPoint;
use serde_json::Value;
use std::collections::BTreeMap;

fn vc(id: &str, component: Component) -> VehicleComponent {
    VehicleComponent {
        id: id.to_string(),
        name: id.to_string(),
        material_id: "unknown".to_string(),
        component,
    }
}

fn synthetic_1() -> Vehicle {
    Vehicle {
        components: vec![
            vc(
                "s1-nose",
                Component::Nosecone {
                    shape: NoseShape::Ogive,
                    length: 0.2,
                    base_diameter: 0.0762,
                    wall_thickness: 0.0,
                    is_hollow: true,
                    mass_override: None,
                    cg_override: None,
                },
            ),
            vc(
                "s1-body",
                Component::BodyTube {
                    length: 0.6,
                    outer_diameter: 0.0762,
                    inner_diameter: Some(0.0762),
                    mass_override: None,
                    cg_override: None,
                },
            ),
            vc(
                "s1-fins",
                Component::TrapezoidFin {
                    fin_count: 4,
                    root_chord: 0.12,
                    tip_chord: 0.05,
                    span: 0.1,
                    sweep_length: 0.08,
                    thickness: 0.006,
                    cross_section: FinCrossSection::Square,
                    axial_offset: Some(0.45),
                    mass_override: None,
                    cg_override: None,
                },
            ),
        ],
        design_inputs: None,
    }
}

fn rel(actual: f64, expected: f64) -> f64 {
    (actual - expected).abs() / expected.abs().max(1e-3)
}

#[test]
fn adapter_design_matches_the_oracle_fixture() {
    let fixture: Value =
        serde_json::from_str(include_str!("fixtures/aero-oracle-parity.json")).expect("fixture");
    let design = design_from_app_vehicle(&synthetic_1()).expect("adapter");
    let mut compared = 0;
    for p in fixture["points"].as_array().expect("points") {
        if p["design"].as_u64() != Some(0) {
            continue;
        }
        let options = EvalOptions {
            mach: p["mach"].as_f64().unwrap(),
            alpha_deg: p["alpha"].as_f64().unwrap(),
            method: if p["method"].as_str() == Some("rogers") {
                CpMethod::Rogers
            } else {
                CpMethod::Barrowman
            },
            nozzle_exit_in: Some(0.0),
            altitude_ft: Some(0.0),
            site: None,
        };
        let got = evaluate(&design, &options).expect("evaluate");
        for (name, actual, expected) in [
            ("cd", got.cd, p["cd"].as_f64().unwrap()),
            ("cn", got.cn, p["cn"].as_f64().unwrap()),
            ("cpIn", got.cp_in, p["cpIn"].as_f64().unwrap()),
            ("reynolds", got.reynolds, p["reynolds"].as_f64().unwrap()),
        ] {
            assert!(
                rel(actual, expected) <= 1e-15,
                "{name} at M{} a{} {}: {actual} vs {expected}",
                p["mach"], p["alpha"], p["method"]
            );
        }
        compared += 1;
    }
    assert_eq!(compared, 72, "design 0 has 72 points (2 methods x 12 Mach x 3 alpha)");
}

fn refusal(vehicle: Vehicle) -> String {
    match design_from_app_vehicle(&vehicle) {
        Err(CalibratedError::Unsupported(message)) => message,
        other => panic!("expected Unsupported, got {other:?}"),
    }
}

#[test]
fn freeform_fins_refuse_with_a_reason() {
    let mut vehicle = synthetic_1();
    vehicle.components[2] = vc(
        "s1-fins",
        Component::FreeformFin {
            fin_count: 4,
            points: vec![
                FinPoint { x: 0.0, y: 0.0 },
                FinPoint { x: 0.12, y: 0.0 },
                FinPoint { x: 0.08, y: 0.1 },
                FinPoint { x: 0.05, y: 0.1 },
            ],
            thickness: 0.006,
            cross_section: FinCrossSection::Square,
            axial_offset: Some(0.45),
            mass_override: None,
            cg_override: None,
        },
    );
    let message = refusal(vehicle);
    assert!(message.contains("freeform"), "{message}");
    assert!(message.contains("trapezoidal"), "{message}");
}

#[test]
fn elliptical_fins_refuse_with_a_reason() {
    let mut vehicle = synthetic_1();
    vehicle.components[2] = vc(
        "s1-fins",
        Component::EllipticalFin {
            fin_count: 3,
            root_chord: 0.12,
            span: 0.1,
            thickness: 0.006,
            axial_offset: Some(0.45),
            mass_override: None,
            cg_override: None,
        },
    );
    let message = refusal(vehicle);
    assert!(message.contains("elliptical"), "{message}");
}

#[test]
fn airfoil_cross_section_derives_the_subsonic_naca_section() {
    let mut vehicle = synthetic_1();
    vehicle.components[2] = vc(
        "s1-fins",
        Component::TrapezoidFin {
            fin_count: 4,
            root_chord: 0.12,
            tip_chord: 0.05,
            span: 0.1,
            sweep_length: 0.08,
            thickness: 0.006,
            cross_section: FinCrossSection::Airfoil,
            axial_offset: Some(0.45),
            mass_override: None,
            cg_override: None,
        },
    );
    let design = design_from_app_vehicle(&vehicle).expect("airfoil derives a section");
    let fin = design.chain[1].fin.as_ref().expect("fin attached");
    assert_eq!(fin.airfoil, Airfoil::SubsonicNaca);
}

#[test]
fn design_inputs_reach_the_calibrated_design() {
    let mut vehicle = synthetic_1();
    let mut components = BTreeMap::new();
    components.insert(
        "s1-body".to_string(),
        ComponentDesignInputs {
            rail_guide_diameter: Some(0.004),
            rail_guide_height: Some(0.006),
            launch_lug_diameter: Some(0.005),
            launch_shoe_area: Some(0.001),
            ..ComponentDesignInputs::default()
        },
    );
    components.insert(
        "s1-fins".to_string(),
        ComponentDesignInputs {
            airfoil_section: Some("Double Wedge".to_string()),
            leading_edge_bevel: Some(0.002),
            trailing_edge_bevel: Some(0.003),
            leading_edge_radius: Some(0.0015),
            ..ComponentDesignInputs::default()
        },
    );
    vehicle.design_inputs = Some(VehicleDesignInputs {
        surface_finish: Some("Polished".to_string()),
        force_turbulent_flow: Some(true),
        nozzle_exit_diameter: Some(0.02),
        components,
    });

    let design = design_from_app_vehicle(&vehicle).expect("design inputs");
    assert_eq!(design.surface, SurfaceFinish::Polished);
    assert!(design.turbulence);
    assert_eq!(design.sustainer_nozzle, 0.02 / 0.0254);

    let body = &design.chain[1];
    assert_eq!(body.rail_diameter, Some(0.004 / 0.0254));
    assert_eq!(body.rail_height, Some(0.006 / 0.0254));
    assert_eq!(body.lug_diameter, Some(0.005 / 0.0254));
    assert_eq!(body.shoe_area, Some((0.001 / 0.0254) / 0.0254));

    let fin = body.fin.as_ref().expect("fin attached");
    // The explicit section wins over the cross-section-derived default.
    assert_eq!(fin.airfoil, Airfoil::DoubleWedge);
    assert_eq!(fin.fx1, 0.002 / 0.0254);
    assert_eq!(fin.fx3, 0.003 / 0.0254);
    assert_eq!(fin.le_radius, 0.0015 / 0.0254);

    let report = support(&vehicle);
    assert_eq!(report.status, AeroSupportStatus::Supported);
    assert!(report.assumptions.is_empty(), "every input is recorded");
}

#[test]
fn support_lists_only_absent_vehicle_inputs() {
    let mut vehicle = synthetic_1();
    vehicle.design_inputs = Some(VehicleDesignInputs {
        surface_finish: Some("Smooth Paint".to_string()),
        force_turbulent_flow: None,
        nozzle_exit_diameter: Some(0.02),
        components: BTreeMap::new(),
    });
    let report = support(&vehicle);
    assert_eq!(report.status, AeroSupportStatus::Supported);
    assert_eq!(report.assumptions, vec!["turbulent flow not forced".to_string()]);
}

#[test]
fn support_reports_supported_with_its_assumptions() {
    let report = support(&synthetic_1());
    assert_eq!(report.status, AeroSupportStatus::Supported);
    assert!(report.reasons.is_empty());
    assert_eq!(report.assumptions.len(), 3, "surface, turbulence and nozzle");
    assert!(report.assumptions.iter().any(|a| a.contains("surface finish")));
    assert!(report.assumptions.iter().any(|a| a.contains("nozzle exit diameter")));
}

#[test]
fn support_refuses_freeform_with_the_adapter_reason() {
    let mut vehicle = synthetic_1();
    vehicle.components[2] = vc(
        "s1-fins",
        Component::FreeformFin {
            fin_count: 4,
            points: vec![
                FinPoint { x: 0.0, y: 0.0 },
                FinPoint { x: 0.12, y: 0.0 },
                FinPoint { x: 0.08, y: 0.1 },
                FinPoint { x: 0.05, y: 0.1 },
            ],
            thickness: 0.006,
            cross_section: FinCrossSection::Square,
            axial_offset: Some(0.45),
            mass_override: None,
            cg_override: None,
        },
    );
    let report = support(&vehicle);
    assert_eq!(report.status, AeroSupportStatus::Refused);
    assert_eq!(report.reasons.len(), 1);
    assert!(report.reasons[0].contains("freeform"));
}
