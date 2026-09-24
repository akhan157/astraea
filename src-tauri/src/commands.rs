//! Seven coarse-grained Tauri commands — the ONLY runtime path.
//! Never per-step serialization: each command runs a whole engine pass in
//! Rust and returns coarse metrics. (solve_chamber + nozzle_performance are
//! the chamber/nozzle pair behind PropulsionStudio; run_ensemble,
//! simulate_flight, stability, aero_curves, aggregate_mass cover the rest.)

use crate::models::{
    self, AeroCurvesDto, ChamberDto, DispersionResultDto, EnsembleRequest, FlightOptionsDto,
    FlightResultDto, FrontendMotor, FrontendVehicle, MassRollupDto, NozzleDto, StabilityDto,
};

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
    use astraea_core::monte_carlo::{
        parse_sampling_version, PerturbedParams, PerturbationSigmas,
    };
    if req.n_runs < 1 {
        return Err(format!(
            "runMonteCarlo: nRuns must be a positive integer (got {})",
            req.n_runs
        ));
    }
    // TS parity: n=1 with any sigmas still flies a single unperturbed-then-
    // perturbed run; statistics reduce over whatever lands.
    let version = parse_sampling_version(&req.version)?;
    let base = PerturbedParams {
        wind_azimuth_deg: req.options.wind_azimuth_deg,
        rail_elevation_deg: req.options.rail_elevation_deg,
        impulse_scale: 1.0,
    };
    let sigmas = PerturbationSigmas {
        wind_azimuth_deg_sigma: req.sigmas.wind_azimuth_deg_sigma.unwrap_or(0.0),
        rail_angle_deg_sigma: req.sigmas.rail_angle_deg_sigma.unwrap_or(0.0),
        impulse_pct_sigma: req.sigmas.impulse_pct_sigma.unwrap_or(0.0),
    };
    let flight_vehicle = models::prepare_flight_vehicle(&req.vehicle, &req.motor)?;
    let base_options = opts(&req.options);
    let base_motor = req.motor.clone();
    let fly = |p: &PerturbedParams| -> Result<astraea_core::monte_carlo::LandingPoint, String> {
        let mut o = base_options.clone();
        o.wind_azimuth_deg = p.wind_azimuth_deg;
        o.rail_elevation_deg = p.rail_elevation_deg;
        let motor = scaled_motor(&base_motor, p.impulse_scale)?;
        let r = astraea_core::six_dof::simulate_flight(&flight_vehicle, &motor, &o)?;
        Ok(astraea_core::monte_carlo::LandingPoint {
            x: r.landing_position.x,
            y: r.landing_position.y,
        })
    };
    let result = astraea_core::monte_carlo::run_ensemble(
        &base,
        &sigmas,
        req.n_runs,
        req.seed,
        version,
        &fly,
    )?;
    Ok(models::to_dispersion_dto(&result))
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
