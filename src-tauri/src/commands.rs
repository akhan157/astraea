//! Seven coarse-grained Tauri commands — the ONLY runtime path.
//! Never per-step serialization: each command runs a whole engine pass in
//! Rust and returns coarse metrics. (solve_chamber + nozzle_performance are
//! the chamber/nozzle pair behind PropulsionStudio; run_ensemble,
//! simulate_flight, stability, aero_curves, aggregate_mass cover the rest.)

use crate::models::{
    self, AeroCurvesDto, ChamberDto, ChunkResultDto, DispersionResultDto, EnsembleChunkRequest,
    EnsembleRequest, FlightOptionsDto, FlightResultDto, FrontendMotor, FrontendVehicle,
    MassRollupDto, NozzleDto, SigmasDto, StabilityDto,
};
use astraea_core::monte_carlo::{LandingPoint, PerturbationSigmas, PerturbedParams, SamplingVersion};
use astraea_core::six_dof::Vehicle;

fn opts(o: &FlightOptionsDto) -> astraea_core::six_dof::SixDofOptions {
    astraea_core::six_dof::SixDofOptions {
        rail_length: o.rail_length,
        rail_elevation_deg: o.rail_elevation_deg,
        rail_azimuth_deg: o.rail_azimuth_deg,
        launch_altitude_asl: o.launch_altitude_asl,
        wind_speed_surface: o.wind_speed_surface,
        wind_azimuth_deg: o.wind_azimuth_deg,
        main_deploy_altitude_agl: o.main_deploy_altitude_agl,
        time_step: o.time_step,
        fin_cant_angle_deg: o.fin_cant_angle_deg,
    }
}

fn scaled_motor(
    fm: &FrontendMotor,
    impulse_scale: f64,
) -> Result<astraea_core::six_dof::MotorSpec, String> {
    let mut motor = models::to_motor(fm)?;
    if impulse_scale != 1.0 {
        if !(impulse_scale > 0.0) || !impulse_scale.is_finite() {
            return Err(format!(
                "runMonteCarlo: impulse scale must be finite and positive (got {impulse_scale})"
            ));
        }
        for p in &mut motor.thrust_curve {
            p.thrust *= impulse_scale;
        }
        motor.max_thrust *= impulse_scale;
    }
    Ok(motor)
}

#[tauri::command]
pub fn simulate_flight(
    vehicle: FrontendVehicle,
    motor: FrontendMotor,
    options: FlightOptionsDto,
) -> Result<FlightResultDto, String> {
    let flight_vehicle = models::prepare_flight_vehicle(&vehicle, &motor)?;
    let core_motor = models::to_motor(&motor)?;
    let result =
        astraea_core::six_dof::simulate_flight(&flight_vehicle, &core_motor, &opts(&options))?;
    Ok(models::to_flight_dto(&result))
}

#[tauri::command]
pub fn run_ensemble(req: EnsembleRequest) -> Result<DispersionResultDto, String> {
    if req.n_runs < 1 {
        return Err(format!(
            "runMonteCarlo: nRuns must be a positive integer (got {})",
            req.n_runs
        ));
    }
    // TS parity: n=1 with any sigmas still flies a single unperturbed-then-
    // perturbed run; statistics reduce over whatever lands.
    let parts = ensemble_parts(&req.vehicle, &req.motor, &req.options, &req.sigmas, &req.version)?;
    let fly = parts.fly();
    let result = astraea_core::monte_carlo::run_ensemble(
        &parts.base,
        &parts.sigmas,
        req.n_runs,
        req.seed,
        parts.version,
        &fly,
    )?;
    Ok(models::to_dispersion_dto(&result))
}

/// One absolute run range of a `per-run-v2` ensemble (S5 background host).
///
/// The chunk path shares `run_chunk` with `run_ensemble`, so a chunk is
/// bit-identical to the same range inside a single call; a host may therefore
/// partition an ensemble to report progress and stop early on cancel without
/// changing the numbers a completed run would have produced. `legacy-sequential-v1`
/// is refused here: its RNG stream is order-dependent, so only the whole-ensemble
/// command can run it.
#[tauri::command]
pub fn run_ensemble_chunk(req: EnsembleChunkRequest) -> Result<ChunkResultDto, String> {
    let parts = ensemble_parts(&req.vehicle, &req.motor, &req.options, &req.sigmas, &req.version)?;
    if parts.version != SamplingVersion::PerRunV2 {
        return Err(
            "runMonteCarloChunk: chunked hosting requires the per-run-v2 sampling version; \
             legacy-sequential-v1 is order-dependent and runs only as a whole ensemble"
                .to_string(),
        );
    }
    let fly = parts.fly();
    let chunk = astraea_core::monte_carlo::run_chunk(
        &parts.base,
        &parts.sigmas,
        req.n_runs,
        req.seed,
        req.run_start,
        req.run_end,
        &fly,
    )?;
    Ok(ChunkResultDto {
        run_start: chunk.run_start,
        run_end: chunk.run_end,
        landings: chunk
            .landings
            .iter()
            .map(|p| models::LandingPointDto { x: p.x, y: p.y })
            .collect(),
        failed_runs: chunk.failed_runs,
        first_failure_message: chunk.first_failure,
    })
}

/// Prepared ensemble inputs shared by the whole-ensemble and chunk commands.
struct EnsembleParts {
    base: PerturbedParams,
    sigmas: PerturbationSigmas,
    vehicle: Vehicle,
    options: astraea_core::six_dof::SixDofOptions,
    motor: FrontendMotor,
    version: SamplingVersion,
}

impl EnsembleParts {
    /// The per-run flight closure: perturbed options + impulse-scaled motor.
    fn fly(&self) -> impl Fn(&PerturbedParams) -> Result<LandingPoint, String> + '_ {
        move |p: &PerturbedParams| -> Result<LandingPoint, String> {
            let mut o = self.options.clone();
            o.wind_azimuth_deg = p.wind_azimuth_deg;
            o.rail_elevation_deg = p.rail_elevation_deg;
            let motor = scaled_motor(&self.motor, p.impulse_scale)?;
            let r = astraea_core::six_dof::simulate_flight(&self.vehicle, &motor, &o)?;
            Ok(LandingPoint {
                x: r.landing_position.x,
                y: r.landing_position.y,
            })
        }
    }
}

fn ensemble_parts(
    vehicle: &FrontendVehicle,
    motor: &FrontendMotor,
    options: &FlightOptionsDto,
    sigmas: &SigmasDto,
    version: &str,
) -> Result<EnsembleParts, String> {
    Ok(EnsembleParts {
        base: PerturbedParams {
            wind_azimuth_deg: options.wind_azimuth_deg,
            rail_elevation_deg: options.rail_elevation_deg,
            impulse_scale: 1.0,
        },
        sigmas: PerturbationSigmas {
            wind_azimuth_deg_sigma: sigmas.wind_azimuth_deg_sigma.unwrap_or(0.0),
            rail_angle_deg_sigma: sigmas.rail_angle_deg_sigma.unwrap_or(0.0),
            impulse_pct_sigma: sigmas.impulse_pct_sigma.unwrap_or(0.0),
        },
        vehicle: models::prepare_flight_vehicle(vehicle, motor)?,
        options: opts(options),
        motor: motor.clone(),
        version: astraea_core::monte_carlo::parse_sampling_version(version)?,
    })
}

#[tauri::command]
pub fn solve_chamber(pressure: f64) -> Result<ChamberDto, String> {
    let eq = astraea_core::gibbs::solve_chamber(pressure)?;
    Ok(ChamberDto {
        tc: eq.tc,
        gamma: eq.gamma,
        mol_weight: eq.mol_weight,
    })
}

#[tauri::command]
pub fn nozzle_performance(
    tc: f64,
    gamma: f64,
    mol_weight: f64,
    pc: f64,
    pe: f64,
    pa: f64,
) -> Result<NozzleDto, String> {
    let p = astraea_core::gibbs::performance(tc, gamma, mol_weight, pc, pe, pa)?;
    Ok(NozzleDto {
        isp_vac: p.isp_vac,
        isp_sea: p.isp_sea,
        cstar: p.cstar,
        cf_vac: p.cf_vac,
        cf_sea: p.cf_sea,
        exit_mach: p.exit_mach,
    })
}

#[tauri::command]
pub fn stability(vehicle: FrontendVehicle) -> Result<StabilityDto, String> {
    let av = models::to_aero_vehicle(&vehicle)?;
    let s = astraea_core::aero::stability(&av)?;
    Ok(models::to_stability_dto(&s))
}

#[tauri::command]
pub fn aero_curves(
    vehicle: FrontendVehicle,
    motor_burning: bool,
) -> Result<AeroCurvesDto, String> {
    let av = models::to_aero_vehicle(&vehicle)?;
    let r = astraea_core::aero::aero_curves(&av, motor_burning)?;
    Ok(models::to_curves_dto(&r))
}

#[tauri::command]
pub fn aggregate_mass(vehicle: FrontendVehicle) -> Result<MassRollupDto, String> {
    let mv = models::to_mass_vehicle(&vehicle)?;
    let r = astraea_core::mass::aggregate_mass(&mv)?;
    Ok(models::to_mass_dto(&r))
}

#[cfg(test)]
mod ensemble_chunk_tests {
    use super::*;
    use crate::models::{EnsembleChunkRequest, EnsembleRequest, FrontendThrustPoint};

    /// Same Estes Alpha-class fixture the DTO oracles use.
    fn vehicle() -> FrontendVehicle {
        serde_json::from_value(serde_json::json!({
            "components": [
                {"id":"alpha-nc","name":"Ogive Nosecone","type":"nosecone","materialId":"pla_3dprint",
                 "shape":"ogive","length":0.165,"baseDiameter":0.0248,"wallThickness":0.0015,"isHollow":true},
                {"id":"alpha-bt","name":"Main Body Tube (BT-50)","type":"bodytube",
                 "length":0.311,"outerDiameter":0.0248,"innerDiameter":0.0241,
                 "isMotorMount":true,"materialId":"cardboard"},
                {"id":"alpha-fins","name":"Stabilizer Fins (3-Fin)","type":"trapezoidfinset",
                 "finCount":3.0,"rootChord":0.070,"tipChord":0.028,"span":0.051,
                 "sweepLength":0.038,"thickness":0.002,"crossSection":"rounded",
                 "axialOffset":0.241,"materialId":"pla_3dprint"},
                {"id":"alpha-chute","name":"12in Parachute","type":"parachute",
                 "mass":0.008,"diameter":0.305,"cd":0.8,"axialOffset":0.05,"materialId":"cardboard"}
            ]
        }))
        .unwrap()
    }

    fn motor() -> FrontendMotor {
        FrontendMotor {
            designation: Some("Estes C6".to_string()),
            diameter: 0.018,
            length: 0.070,
            burn_time: 1.86,
            propellant_mass: 0.0125,
            total_mass: 0.0248,
            dry_mass: 0.0123,
            max_thrust: Some(14.2),
            thrust_curve: vec![
                FrontendThrustPoint { time: 0.0, thrust: 0.0 },
                FrontendThrustPoint { time: 0.18, thrust: 14.2 },
                FrontendThrustPoint { time: 0.50, thrust: 4.8 },
                FrontendThrustPoint { time: 1.86, thrust: 0.0 },
            ],
        }
    }

    fn options() -> FlightOptionsDto {
        FlightOptionsDto {
            rail_length: Some(1.0),
            rail_elevation_deg: Some(85.0),
            rail_azimuth_deg: Some(0.0),
            launch_altitude_asl: None,
            wind_speed_surface: Some(3.0),
            wind_azimuth_deg: Some(270.0),
            main_deploy_altitude_agl: Some(250.0),
            time_step: None,
            fin_cant_angle_deg: None,
        }
    }

    fn sigmas() -> SigmasDto {
        SigmasDto {
            wind_azimuth_deg_sigma: Some(5.0),
            rail_angle_deg_sigma: Some(1.0),
            impulse_pct_sigma: Some(3.0),
        }
    }

    #[test]
    fn chunked_ranges_reproduce_the_whole_ensemble_landings() {
        let n_runs = 6;
        let whole = run_ensemble(EnsembleRequest {
            vehicle: vehicle(),
            motor: motor(),
            options: options(),
            sigmas: sigmas(),
            n_runs,
            seed: 20260909,
            version: "per-run-v2".to_string(),
        })
        .unwrap();

        let mut chunked: Vec<(f64, f64)> = Vec::new();
        let mut failed = 0;
        for (start, end) in [(0, 4), (4, 6)] {
            let chunk = run_ensemble_chunk(EnsembleChunkRequest {
                vehicle: vehicle(),
                motor: motor(),
                options: options(),
                sigmas: sigmas(),
                n_runs,
                seed: 20260909,
                version: "per-run-v2".to_string(),
                run_start: start,
                run_end: end,
            })
            .unwrap();
            assert_eq!(chunk.run_start, start);
            assert_eq!(chunk.run_end, end);
            failed += chunk.failed_runs;
            chunked.extend(chunk.landings.iter().map(|p| (p.x, p.y)));
        }

        let whole_pts: Vec<(f64, f64)> = whole.landings.iter().map(|p| (p.x, p.y)).collect();
        assert_eq!(chunked.len(), whole_pts.len(), "chunked run count differs");
        for (i, (got, want)) in chunked.iter().zip(whole_pts.iter()).enumerate() {
            assert_eq!(got, want, "run {i} landing differs between chunked and whole ensemble");
        }
        assert_eq!(failed, whole.failed_runs);
    }

    #[test]
    fn chunk_command_refuses_the_order_dependent_legacy_version() {
        let err = run_ensemble_chunk(EnsembleChunkRequest {
            vehicle: vehicle(),
            motor: motor(),
            options: options(),
            sigmas: sigmas(),
            n_runs: 4,
            seed: 20260909,
            version: "legacy-sequential-v1".to_string(),
            run_start: 0,
            run_end: 2,
        })
        .unwrap_err();
        assert!(err.contains("per-run-v2"), "unexpected error: {err}");
    }
}
