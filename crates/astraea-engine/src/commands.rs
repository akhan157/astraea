//! Coarse-grained engine commands — the ONLY runtime path (served to the
//! app as WebAssembly through `crate::wasm` and `dispatch`).
//! Never per-step serialization: each command runs a whole engine pass in
//! Rust and returns coarse metrics. (solve_chamber + nozzle_performance are
//! the chamber/nozzle pair behind PropulsionStudio; run_ensemble,
//! run_ensemble_chunk, simulate_flight, stability, aero_curves,
//! aggregate_mass cover the rest; ingredient_library +
//! propellant_performance run any propellant recipe through the general
//! equilibrium solver.)
//!
//! Telemetry exception: `simulate_flight` additionally returns ONE bounded
//! display telemetry series (at most `telemetry::MAX_TELEMETRY_POINTS`
//! points, decimated in Rust from the full native series — first, terminal
//! and event-time samples kept, strictly increasing times). Ensembles return
//! coarse metrics only and never carry telemetry; nothing streams per step.

use crate::models::{
    self, AeroCurvesDto, ChamberDto, ChunkResultDto, ClassifiedDispersionResultDto,
    DispersionResultDto, EnsembleChunkRequest, EnsembleRequest, FlightOptionsDto, FlightResultDto,
    FrontendMotor, FrontendVehicle, MassRollupDto, NozzleDto, SigmasDto, StabilityDto,
};
use astraea_core::monte_carlo::{
    LandingPoint, PerturbationSigmas, PerturbedParams, RunObservation, SamplingVersion,
};
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
        drag_cd_scale: o.drag_cd_scale,
        // Internal: never a wire field. Only `simulate_flight` opts in.
        record_telemetry: false,
        record_moment_arm_history: false,
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

pub fn simulate_flight(
    vehicle: FrontendVehicle,
    motor: FrontendMotor,
    options: FlightOptionsDto,
) -> Result<FlightResultDto, String> {
    simulate_flight_with_history(vehicle, motor, options, false)
}

/// Explicit reporting request; the ordinary public call above stays unchanged.
pub fn simulate_flight_with_history(
    vehicle: FrontendVehicle, motor: FrontendMotor, options: FlightOptionsDto,
    report_moment_arm_history: bool,
) -> Result<FlightResultDto, String> {
    let flight_vehicle = models::prepare_flight_vehicle(&vehicle, &motor)?;
    let core_motor = models::to_motor(&motor)?;
    // Telemetry is opt-in inside the core so ensembles pay nothing; this is the
    // one command that asks for it, then decimates it to the bounded wire
    // series (fail closed: no silent truncation).
    let mut core_options = opts(&options);
    core_options.record_telemetry = true;
    core_options.record_moment_arm_history = report_moment_arm_history;
    let result = astraea_core::six_dof::simulate_flight(&flight_vehicle, &core_motor, &core_options)?;
    let mut dto = models::to_flight_dto(&result);
    dto.telemetry = models::flight_telemetry_dto(&result)?;
    if report_moment_arm_history {
        dto.moment_arm_history = Some(crate::moment_arm_history::to_dto(&result, &flight_vehicle)?);
    }
    Ok(dto)
}

/// Native diagnostic wrapper; intentionally absent from the app JSON dispatch.
/// Uses the actual frontend conversion, preparation, and core production RHS.
pub fn diagnose_flight_loads(
    vehicle: &FrontendVehicle, motor: &FrontendMotor,
    state: &astraea_core::six_dof::RigidState, time: f64,
    options: &FlightOptionsDto,
) -> Result<astraea_core::six_dof::FlightLoadsDiagnostic, String> {
    let prepared = models::prepare_flight_vehicle(vehicle, motor)?;
    let motor = models::to_motor(motor)?;
    astraea_core::six_dof::diagnose_flight_loads(time, state, false, false, false,
        options.launch_altitude_asl.unwrap_or(0.0),
        options.wind_speed_surface.unwrap_or(0.0),
        options.wind_azimuth_deg.unwrap_or(0.0),
        options.fin_cant_angle_deg.unwrap_or(0.0).to_radians(),
        &prepared, &motor, options.drag_cd_scale.unwrap_or(1.0))
}

/// `simulate_flight` without the display telemetry: the same flight and the
/// same coarse metrics, for live previews that only need the numbers.
pub fn flight_summary(
    vehicle: FrontendVehicle,
    motor: FrontendMotor,
    options: FlightOptionsDto,
) -> Result<FlightResultDto, String> {
    let flight_vehicle = models::prepare_flight_vehicle(&vehicle, &motor)?;
    let core_motor = models::to_motor(&motor)?;
    let result = astraea_core::six_dof::simulate_flight(&flight_vehicle, &core_motor, &opts(&options))?;
    Ok(models::to_flight_dto(&result))
}

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
    Ok(models::to_dispersion_dto(&result, parts.vehicle.normal_law_identity()))
}

/// One absolute run range of a `per-run-v2` ensemble (S5 background host).
///
/// The chunk path shares `run_chunk` with `run_ensemble`, so a chunk is
/// bit-identical to the same range inside a single call; a host may therefore
/// partition an ensemble to report progress and stop early on cancel without
/// changing the numbers a completed run would have produced. `legacy-sequential-v1`
/// is refused here: its RNG stream is order-dependent, so only the whole-ensemble
/// command can run it.
pub fn run_ensemble_chunk(req: EnsembleChunkRequest) -> Result<ChunkResultDto, String> {
    let parts = ensemble_parts(&req.vehicle, &req.motor, &req.options, &req.sigmas, &req.version)?;
    if parts.version != SamplingVersion::PerRunV2 {
        return Err(
            "runMonteCarloChunk: chunked hosting requires the per-run-v2 sampling version; \
             legacy-sequential-v1 is order-dependent and runs only as a whole ensemble"
                .to_string(),
        );
    }
    let fly = parts.fly_classified();
    let chunk = astraea_core::monte_carlo::run_chunk_classified(
        &parts.base,
        &parts.sigmas,
        req.n_runs,
        req.seed,
        req.run_start,
        req.run_end,
        &fly,
    )?;
    let counts = astraea_core::monte_carlo::OutcomeCounts::from_runs(
        &chunk.runs,
        chunk.run_end - chunk.run_start,
    );
    Ok(ChunkResultDto {
        run_start: chunk.run_start,
        run_end: chunk.run_end,
        // Existing field and existing meaning: finite endpoints in absolute
        // index order. Classification is carried alongside, never by narrowing.
        landings: chunk
            .runs
            .iter()
            .filter_map(|r| r.endpoint)
            .map(|p| models::LandingPointDto { x: p.x, y: p.y })
            .collect(),
        failed_runs: counts.computational_failure,
        first_failure_message: chunk
            .runs
            .iter()
            .find_map(|r| r.failure_message.clone()),
        runs: chunk.runs.iter().map(models::to_run_outcome_dto).collect(),
        counts: models::to_outcome_counts_dto(&counts),
        normal_law_id: parts.vehicle.normal_law_identity().0.to_string(),
        boattail_policy: parts.vehicle.normal_law_identity().1.to_string(),
        fin_interference_id: astraea_core::aero::FIN_INTERFERENCE_ID.to_string(),
        outcome_policy: models::CLASSIFIED_OUTCOME_POLICY.to_string(),
    })
}

/// Classified whole-ensemble entry point, sharing normal-law identity metadata.
/// Kept separate from `run_ensemble` to preserve legacy endpoint accounting
/// and its all-failed Err. Returns the complete ledger even when every run is a
/// timeout/unsupported/failure; statistics are absent when no supported
/// nominal terminal sample exists.
pub fn run_ensemble_classified(req: EnsembleRequest) -> Result<ClassifiedDispersionResultDto, String> {
    if req.n_runs < 1 {
        return Err(format!(
            "runMonteCarlo: nRuns must be a positive integer (got {})",
            req.n_runs
        ));
    }
    let parts = ensemble_parts(&req.vehicle, &req.motor, &req.options, &req.sigmas, &req.version)?;
    let fly = parts.fly_classified();
    let result = astraea_core::monte_carlo::run_ensemble_classified(
        &parts.base,
        &parts.sigmas,
        req.n_runs,
        req.seed,
        parts.version,
        &fly,
    )?;
    Ok(models::to_classified_dispersion_dto(&result, parts.vehicle.normal_law_identity()))
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

    /// Classified closure: same trajectory, but every native outcome field is
    /// carried. The termination/touchdown normalization mirrors `to_flight_dto`
    /// exactly so the ledger cannot drift from the single-flight wire result.
    fn fly_classified(&self) -> impl Fn(&PerturbedParams) -> Result<RunObservation, String> + '_ {
        move |p: &PerturbedParams| -> Result<RunObservation, String> {
            let mut o = self.options.clone();
            o.wind_azimuth_deg = p.wind_azimuth_deg;
            o.rail_elevation_deg = p.rail_elevation_deg;
            let motor = scaled_motor(&self.motor, p.impulse_scale)?;
            let r = astraea_core::six_dof::simulate_flight(&self.vehicle, &motor, &o)?;
            Ok(RunObservation {
                endpoint: LandingPoint {
                    x: r.landing_position.x,
                    y: r.landing_position.y,
                },
                terminated: r.terminated,
                termination_reason: if r.terminated {
                    "touchdown".to_string()
                } else {
                    "timeout".to_string()
                },
                touchdown_nominal: if r.terminated { r.touchdown_nominal } else { false },
                validity: r.validity,
                enveloped: r.enveloped,
                off_nominal_excursion: r.off_nominal_excursion,
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

pub fn solve_chamber(pressure: f64) -> Result<ChamberDto, String> {
    let eq = astraea_core::gibbs::solve_chamber(pressure)?;
    Ok(ChamberDto {
        tc: eq.tc,
        gamma: eq.gamma,
        mol_weight: eq.mol_weight,
    })
}

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

/// Built-in propellant ingredients (formula, heat of formation, density).
pub fn ingredient_library() -> Vec<crate::propellant::IngredientDto> {
    astraea_core::propellant::ingredient_library()
        .into_iter()
        .map(Into::into)
        .collect()
}

/// Theoretical performance of a propellant recipe (CEA rocket problem).
pub fn propellant_performance(
    request: crate::propellant::PropellantRequestDto,
) -> Result<crate::propellant::PropellantResultDto, String> {
    crate::propellant::run(request)
}

pub fn stability(
    vehicle: FrontendVehicle,
    aero_model: Option<crate::aero_provider::AeroModelSelection>,
) -> Result<StabilityDto, String> {
    let av = models::to_aero_vehicle(&vehicle)?;
    match aero_model {
        None => Ok(models::to_stability_dto(&astraea_core::aero::stability(&av)?)),
        Some(selection) => {
            crate::aero_provider::validate(&selection)?;
            let s = crate::aero_provider::stability(&av)?;
            Ok(models::to_provider_stability_dto(
                &s,
                &selection.model_id,
                &selection.model_version,
            ))
        }
    }
}

pub fn aero_curves(
    vehicle: FrontendVehicle,
    motor_burning: bool,
    aero_model: Option<crate::aero_provider::AeroModelSelection>,
) -> Result<AeroCurvesDto, String> {
    let av = models::to_aero_vehicle(&vehicle)?;
    match aero_model {
        None => Ok(models::to_curves_dto(&astraea_core::aero::aero_curves(
            &av,
            motor_burning,
        )?)),
        Some(selection) => {
            crate::aero_provider::validate(&selection)?;
            let composed = selection.terms.transonic == "legacy";
            let provider = if composed {
                crate::aero_provider::composed_curves(&av, motor_burning, 41)?
            } else {
                crate::aero_provider::curves(&av, motor_burning, 41)?
            };
            Ok(models::to_provider_curves_dto(
                &provider.curves,
                provider.breakdown_available,
                &selection.model_id,
                &selection.model_version,
                provider.composition.as_ref(),
            ))
        }
    }
}

/// Scoped pre-run status for a selected aero model.
pub fn aero_model_status(
    vehicle: FrontendVehicle,
    aero_model: crate::aero_provider::AeroModelSelection,
) -> Result<crate::aero_provider::AeroModelStatus, String> {
    let av = models::to_aero_vehicle(&vehicle)?;
    crate::aero_provider::status(&av, &aero_model)
}

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

    #[test]
    fn undefined_normal_station_reaches_native_flight_command_as_error() {
        let mut v = vehicle();
        v.components.retain(|c| c.kind == "bodytube");
        let err = simulate_flight(v,motor(),options()).unwrap_err();
        assert!(err.contains("unsupported total CNalpha"), "{err}");
        let ordinary = simulate_flight(vehicle(),motor(),options()).unwrap();
        let policy = ordinary.run_manifest["unsupportedHandling"].as_str().unwrap();
        assert!(policy.contains("classified out-of-domain loads continue"));
        assert!(policy.contains("undefined normal-force CP"));
        assert!(policy.contains("fails the command before arm use"));
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
            drag_cd_scale: None,
        }
    }

    #[test]
    fn unknown_option_field_is_rejected_by_the_dto() {
        let err = serde_json::from_value::<FlightOptionsDto>(serde_json::json!({
            "railLength": 1.0,
            "dragCdScaleCurve": 0.5
        }))
        .unwrap_err();
        assert!(
            err.to_string().contains("unknown field"),
            "unknown option field must be rejected: {err}"
        );
    }

    #[test]
    fn drag_cd_scale_wire_name_maps_through_opts() {
        let dto: FlightOptionsDto =
            serde_json::from_value(serde_json::json!({ "dragCdScale": 0.6118 })).unwrap();
        assert_eq!(dto.drag_cd_scale, Some(0.6118));
        assert_eq!(opts(&dto).drag_cd_scale, Some(0.6118));

        let absent: FlightOptionsDto = serde_json::from_value(serde_json::json!({})).unwrap();
        assert_eq!(absent.drag_cd_scale, None);
        assert_eq!(opts(&absent).drag_cd_scale, None);
    }

    #[test]
    fn simulate_flight_rejects_nonpositive_drag_cd_scale() {
        let err = simulate_flight(
            vehicle(),
            motor(),
            FlightOptionsDto { drag_cd_scale: Some(0.0), ..options() },
        )
        .unwrap_err();
        assert!(
            err.contains("dragCdScale must be a positive finite number"),
            "unexpected error: {err}"
        );
    }

    #[test]
    fn ensemble_applies_drag_cd_scale_to_every_run() {
        let request = |scale: Option<f64>| EnsembleRequest {
            vehicle: vehicle(),
            motor: motor(),
            options: FlightOptionsDto { drag_cd_scale: scale, ..options() },
            sigmas: sigmas(),
            n_runs: 4,
            seed: 20260909,
            version: "per-run-v2".to_string(),
        };
        // Same seed => identical perturbed params per run, so any landing change
        // is the drag calibration itself: it must reach EVERY run.
        let plain = run_ensemble(request(None)).unwrap();
        let scaled = run_ensemble(request(Some(0.5))).unwrap();
        assert_eq!(plain.landings.len(), scaled.landings.len());
        assert_eq!(plain.landings.len(), 4);
        for (i, (a, b)) in plain.landings.iter().zip(scaled.landings.iter()).enumerate() {
            assert!(
                a.x != b.x || a.y != b.y,
                "run {i} landing ({}, {}) unchanged by dragCdScale 0.5",
                a.x,
                a.y
            );
        }
    }

    #[test]
    fn whole_ensemble_commands_serialize_the_prepared_normal_identity() {
        for version in ["legacy-sequential-v1", "per-run-v2"] {
            let req = EnsembleRequest {
                vehicle: vehicle(), motor: motor(), options: options(), sigmas: sigmas(),
                n_runs: 1, seed: 20260909, version: version.to_string(),
            };
            let plain = run_ensemble(req.clone()).unwrap();
            let classified = run_ensemble_classified(req).unwrap();
            for wire in [serde_json::to_value(plain).unwrap(), serde_json::to_value(classified).unwrap()] {
                assert_eq!(wire["normalLawId"], "published-supersonic-normal-v1");
                assert_eq!(wire["boattailPolicy"], "suppressed");
                assert_eq!(wire["finInterferenceId"], "fin-station-v2");
            }
        }
    }

    #[test]
    fn classified_commands_expose_the_complete_outcome_ledger() {
        let req = EnsembleRequest {
            vehicle: vehicle(),
            motor: motor(),
            options: options(),
            sigmas: sigmas(),
            n_runs: 4,
            seed: 20260909,
            version: "per-run-v2".to_string(),
        };
        let whole = run_ensemble_classified(req.clone()).unwrap();
        assert_eq!(whole.runs.len(), 4);
        assert_eq!(whole.counts.requested, 4);
        assert_eq!(whole.outcome_policy, models::CLASSIFIED_OUTCOME_POLICY);
        let total = whole.counts.supported_nominal_terminal
            + whole.counts.unsupported_nominal_touchdown
            + whole.counts.non_nominal_impact
            + whole.counts.time_limit_endpoint
            + whole.counts.computational_failure;
        assert_eq!(total, 4, "all five outcome counts must sum to requested");
        assert_eq!(whole.runs.iter().map(|r| r.run_index).collect::<Vec<_>>(), vec![0, 1, 2, 3]);

        let chunk = run_ensemble_chunk(EnsembleChunkRequest {
            vehicle: req.vehicle,
            motor: req.motor,
            options: req.options,
            sigmas: req.sigmas,
            n_runs: req.n_runs,
            seed: req.seed,
            version: req.version,
            run_start: 0,
            run_end: 4,
        })
        .unwrap();
        assert_eq!(chunk.normal_law_id, whole.normal_law_id);
        assert_eq!(chunk.boattail_policy, whole.boattail_policy);
        assert_eq!(chunk.fin_interference_id, whole.fin_interference_id);
        assert_eq!(chunk.fin_interference_id, "fin-station-v2");
        assert_eq!(chunk.runs.len(), 4);
        assert_eq!(chunk.counts.requested, 4);
        assert_eq!(chunk.outcome_policy, models::CLASSIFIED_OUTCOME_POLICY);
        assert_eq!(chunk.landings.len(), chunk.runs.iter().filter(|r| r.endpoint.is_some()).count());
    }

    /// The removed calibrated wire options are now unknown fields: a stale
    /// bridge payload fails closed instead of silently dropping an option.
    #[test]
    fn removed_calibrated_options_are_rejected_by_the_dto() {
        for key in ["aeroModel", "launchTemperatureK", "launchPressurePa"] {
            let mut value = serde_json::Map::new();
            value.insert(key.to_string(), serde_json::json!(1.0));
            let err = serde_json::from_value::<FlightOptionsDto>(serde_json::Value::Object(value))
                .unwrap_err();
            assert!(
                err.to_string().contains("unknown field"),
                "{key} must be rejected: {err}"
            );
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
            let chunk = (run_ensemble_chunk(EnsembleChunkRequest {
                vehicle: vehicle(),
                motor: motor(),
                options: options(),
                sigmas: sigmas(),
                n_runs,
                seed: 20260909,
                version: "per-run-v2".to_string(),
                run_start: start,
                run_end: end,
            }))
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
        let err = (run_ensemble_chunk(EnsembleChunkRequest {
            vehicle: vehicle(),
            motor: motor(),
            options: options(),
            sigmas: sigmas(),
            n_runs: 4,
            seed: 20260909,
            version: "legacy-sequential-v1".to_string(),
            run_start: 0,
            run_end: 2,
        }))
        .unwrap_err();
        assert!(err.contains("per-run-v2"), "unexpected error: {err}");
    }

    fn vertical_rail_request(n_runs: i64) -> EnsembleRequest {
        EnsembleRequest {
            vehicle: vehicle(),
            motor: motor(),
            options: FlightOptionsDto {
                rail_elevation_deg: Some(astraea_core::six_dof::RAIL_ELEVATION_MAX_DEG),
                wind_speed_surface: Some(0.0),
                ..options()
            },
            sigmas: SigmasDto {
                wind_azimuth_deg_sigma: Some(0.0),
                rail_angle_deg_sigma: Some(1.0),
                impulse_pct_sigma: Some(0.0),
            },
            n_runs,
            seed: 20260909,
            version: "per-run-v2".to_string(),
        }
    }

    #[test]
    fn vertical_rail_ensemble_has_no_domain_failures() {
        // R9 measured roughly half the runs failing at this configuration
        // before the sampler was folded into the solver domain.
        let r = run_ensemble(vertical_rail_request(64)).unwrap();
        assert_eq!(r.failed_runs, 0, "90° rail with 1° sigma must not lose runs");
        assert_eq!(r.successful_runs, 64);
    }

    /// One-off evidence probe. Ignored by default because 10,000 real 6-DOF
    /// flights are minutes of compute; run once with `--release --ignored`.
    #[test]
    #[ignore = "10k real 6-DOF flights; one-off P2 evidence probe"]
    fn vertical_rail_10k_probe() {
        let r = run_ensemble(vertical_rail_request(10_000)).unwrap();
        eprintln!(
            "P2 probe: 90° rail, 1° sigma, per-run-v2 — {} successful, {} failed",
            r.successful_runs, r.failed_runs
        );
        assert_eq!(r.failed_runs, 0);
        assert_eq!(r.successful_runs, 10_000);
    }
}

#[cfg(test)]
mod aero_provider_command_tests {
    use super::*;

    fn alpha() -> FrontendVehicle {
        serde_json::from_str(include_str!("../tests/fixtures/alpha-vehicle.json")).expect("alpha")
    }

    fn selection(version: &str, term: &str) -> crate::aero_provider::AeroModelSelection {
        crate::aero_provider::AeroModelSelection {
            model_id: crate::aero_provider::AERO_MODEL_ID.to_string(),
            model_version: version.to_string(),
            terms: crate::aero_provider::AeroTerms { transonic: term.to_string() },
        }
    }

    fn method_only() -> crate::aero_provider::AeroModelSelection {
        selection("1.0.0", "buildup")
    }

    fn composed() -> crate::aero_provider::AeroModelSelection {
        selection("1.1.0", "legacy")
    }

    #[test]
    fn legacy_stability_keeps_its_bytes_and_has_no_model_id() {
        let dto = stability(alpha(), None).expect("legacy");
        let json = serde_json::to_value(&dto).expect("json");
        assert!(json.get("modelId").is_none());
        assert!(json.get("modelVersion").is_none());
        assert!(json.get("breakdownUnavailable").is_none());
        assert!(!dto.contributions.is_empty());
    }

    #[test]
    fn method_only_stability_names_the_model_and_withholds_the_breakdown() {
        let dto = stability(alpha(), Some(method_only())).expect("provider");
        assert_eq!(dto.model_id.as_deref(), Some("aero-buildup"));
        assert_eq!(dto.model_version.as_deref(), Some("1.0.0"));
        assert!(dto.breakdown_unavailable);
        assert!(dto.contributions.is_empty());
        assert!(dto.cp.is_finite() && dto.total_cna > 0.0);
    }

    #[test]
    fn method_only_curves_carry_no_composition() {
        let dto = aero_curves(alpha(), false, Some(method_only())).expect("curves");
        assert_eq!(dto.model_version.as_deref(), Some("1.0.0"));
        assert!(dto.composition.is_none());
        assert!(dto.breakdown_unavailable);
        assert_eq!(dto.mach_points.len(), 41);
    }

    #[test]
    fn composed_curves_record_the_band_and_withhold_the_breakdown() {
        let dto = aero_curves(alpha(), false, Some(composed())).expect("composed");
        assert_eq!(dto.model_version.as_deref(), Some("1.1.0"));
        let composition = dto.composition.expect("composition metadata");
        assert_eq!(composition.kind, "total-cd-band");
        assert_eq!(composition.band_low_mach, 0.80);
        assert_eq!(composition.band_high_mach, 1.20);
        assert!(composition.reference_atmosphere.contains("sea-level"));
        assert!(dto.breakdown_unavailable);
        assert!(dto.drag_curves.iter().all(|d| d.total_cd.is_finite() && d.total_cd > 0.0));
    }

    #[test]
    fn defective_and_undefined_pairs_refuse_before_any_number() {
        let error = stability(alpha(), Some(selection("1.0.0", "legacy"))).unwrap_err();
        assert!(error.contains("never implemented the composition"), "{error}");
        let error = aero_curves(alpha(), true, Some(selection("1.0.0", "legacy"))).unwrap_err();
        assert!(error.contains("never implemented the composition"), "{error}");
        let error = stability(alpha(), Some(selection("1.1.0", "buildup"))).unwrap_err();
        assert!(error.contains("undefined"), "{error}");
        let error = aero_curves(alpha(), true, Some(selection("1.1.0", "buildup"))).unwrap_err();
        assert!(error.contains("undefined"), "{error}");
    }

    #[test]
    fn unknown_version_refuses_before_any_number() {
        let error = stability(alpha(), Some(selection("9.9.9", "buildup"))).unwrap_err();
        assert!(error.contains("refuses rather than substituting"), "{error}");
        let error = aero_curves(alpha(), true, Some(selection("9.9.9", "buildup"))).unwrap_err();
        assert!(error.contains("refuses rather than substituting"), "{error}");
    }
}
