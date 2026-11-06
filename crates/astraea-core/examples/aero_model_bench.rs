//! Calibrated provider performance (G9), measured in the product repo.
//!
//! Usage: cargo run --release --example aero_model_bench -j 2
//!
//! Builds the same synthetic vehicle as the adapter test, then evaluates
//! 20,000 mixed Mach/alpha/method points and prints microseconds per
//! evaluation. Allocation-free hot path: `evaluate` takes `&Design` and has no
//! per-call heap use beyond the returned value.

use astraea_core::aero::{Component, FinCrossSection, NoseShape, Vehicle, VehicleComponent};
use astraea_core::aero_model::design_from_app_vehicle;
use astraea_core::calibrated::{evaluate, CpMethod, EvalOptions};
use std::time::Instant;

fn vc(id: &str, component: Component) -> VehicleComponent {
    VehicleComponent {
        id: id.to_string(),
        name: id.to_string(),
        material_id: "unknown".to_string(),
        component,
    }
}

fn main() {
    let vehicle = Vehicle {
        components: vec![
            vc(
                "bench-nose",
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
                "bench-body",
                Component::BodyTube {
                    length: 0.6,
                    outer_diameter: 0.0762,
                    inner_diameter: Some(0.0762),
                    mass_override: None,
                    cg_override: None,
                },
            ),
            vc(
                "bench-fins",
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
    };
    let design = design_from_app_vehicle(&vehicle).expect("adapter");
    let options = |i: usize| EvalOptions {
        mach: 0.01 + (i % 2500) as f64 * 0.01,
        alpha_deg: (i % 5) as f64,
        method: if i % 2 == 0 {
            CpMethod::Barrowman
        } else {
            CpMethod::Rogers
        },
        nozzle_exit_in: Some(0.0),
        altitude_ft: Some(0.0),
        site: None,
    };
    for i in 0..200 {
        let _ = evaluate(&design, &options(i)).expect("warmup");
    }
    let n = 20_000usize;
    let start = Instant::now();
    let mut acc = 0.0;
    for i in 0..n {
        acc += evaluate(&design, &options(i)).expect("evaluate").cd;
    }
    let elapsed = start.elapsed();
    println!(
        "aero_model_bench: {n} evaluations in {:?} = {:.2} us/eval (acc {acc:.3})",
        elapsed,
        elapsed.as_secs_f64() * 1e6 / n as f64
    );
}
