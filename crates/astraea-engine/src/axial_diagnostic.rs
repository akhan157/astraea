//! Native-only total axial diagnostic. No app command, WASM or trajectory exposure.
use crate::environment_diagnostic;
use astraea_core::{aero, axial as core, skin_friction};
use serde::Deserialize;
use serde_json::{json, Value};

pub const SCHEMA_VERSION: &str = "rmp06-local-total-axial-diagnostic/1.0.0";
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    schema_version: String,
    model_id: String,
    input_identity: String,
    source: Source,
    condition_identity: String,
    geometry: Geometry,
    power_policy: PowerPolicy,
    power: Power,
    environment: Value,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Source { identity: String, geometry_identity: String, condition_identity: String, description: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Geometry {
    identity: String,
    configuration: Configuration,
    friction_coverage: FrictionCoverage,
    reference_area_m2: f64,
    body_diameter_m: f64,
    nose_shape: NoseShape,
    nose_length_m: f64,
    cylinder_length_m: f64,
    body_friction: Surface,
    fins: Vec<Fin>,
}
#[derive(Deserialize)]
enum Configuration {
    #[serde(rename = "clean-nose-cylinder-trapezoid-fins-unobstructed-base/1.0.0")]
    Clean,
}
#[derive(Deserialize)]
enum FrictionCoverage {
    #[serde(rename = "nose-cylinder-plus-all-fin-faces-friction-no-pressure-in-form-factors/1.0.0")]
    Complete,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum NoseShape { Conical, Ogive, Parabolic, VonKarman, Elliptical }
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum CrossSection { Square, Rounded, Airfoil, DoubleWedge }
#[derive(Clone, Copy, Deserialize)]
enum PowerPolicy {
    #[serde(rename = "coast-only")]
    CoastOnly,
    #[serde(rename = "inherited-plume-factor-0.38")]
    InheritedPlume,
}
#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
enum Power { Coast, Powered }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Surface { identity: String, length_m: f64, roughness_m: f64, wetted_area_m2: f64, form_factor: f64 }
impl Surface {
    fn convert(&self) -> skin_friction::SurfaceGeometry {
        skin_friction::SurfaceGeometry { identity: self.identity.clone(), length_m: self.length_m, roughness_m: self.roughness_m, wetted_area_m2: self.wetted_area_m2, form_factor: self.form_factor }
    }
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Fin {
    count: i32,
    root_chord_m: f64,
    tip_chord_m: f64,
    span_m: f64,
    sweep_length_m: f64,
    thickness_m: f64,
    cross_section: CrossSection,
    friction: Surface,
}

pub fn evaluate(args: &Value) -> Result<Value, String> {
    let evaluate = || -> Result<Value, String> {
        let request: Request = serde_json::from_value(args.clone()).map_err(|e| format!("invalid request: {e}"))?;
        if request.schema_version != SCHEMA_VERSION { return Err(format!("unsupported schemaVersion; expected {SCHEMA_VERSION}")); }
        if request.model_id != core::MODEL_ID { return Err(format!("unsupported modelId; expected {}", core::MODEL_ID)); }
        if request.input_identity.trim().is_empty() || request.condition_identity.trim().is_empty() { return Err("inputIdentity/conditionIdentity must be nonempty".into()); }
        if request.condition_identity != request.source.condition_identity { return Err("source condition identity mismatch".into()); }
        let _ = (&request.geometry.configuration, &request.geometry.friction_coverage);
        let g = &request.geometry;
        let prepared = core::PreparedAxial::prepare(core::Geometry {
            identity: g.identity.clone(), configuration: core::Configuration::CleanNoseCylinderTrapezoidFinsUnobstructedBase,
            friction_coverage: core::FrictionCoverage::NoseCylinderPlusAllFinFacesNoPressureInFormFactors,
            reference_area_m2: g.reference_area_m2, body_diameter_m: g.body_diameter_m,
            nose_shape: match g.nose_shape { NoseShape::Conical => aero::NoseShape::Conical, NoseShape::Ogive => aero::NoseShape::Ogive, NoseShape::Parabolic => aero::NoseShape::Parabolic, NoseShape::VonKarman => aero::NoseShape::VonKarman, NoseShape::Elliptical => aero::NoseShape::Elliptical },
            nose_length_m: g.nose_length_m, cylinder_length_m: g.cylinder_length_m,
            body_friction: g.body_friction.convert(), fins: g.fins.iter().map(|f| core::FinSet {
                count: f.count, root_chord_m: f.root_chord_m, tip_chord_m: f.tip_chord_m, span_m: f.span_m,
                sweep_length_m: f.sweep_length_m, thickness_m: f.thickness_m,
                cross_section: match f.cross_section { CrossSection::Square => aero::FinCrossSection::Square, CrossSection::Rounded => aero::FinCrossSection::Rounded, CrossSection::Airfoil => aero::FinCrossSection::Airfoil, CrossSection::DoubleWedge => aero::FinCrossSection::DoubleWedge },
                friction: f.friction.convert(),
            }).collect(),
        }, core::Source { identity: request.source.identity.clone(), geometry_identity: request.source.geometry_identity.clone(), condition_identity: request.source.condition_identity.clone(), description: request.source.description.clone() },
        match request.power_policy { PowerPolicy::CoastOnly => core::PowerPolicy::CoastOnly, PowerPolicy::InheritedPlume => core::PowerPolicy::InheritedPlumeFactor038 })?;
        // Reuse the existing strict parser and actual E1 typed state exactly once.
        let environment = environment_diagnostic::evaluate_typed(&request.environment)?;
        let result = prepared.evaluate(&environment.evaluation, match request.power { Power::Coast => core::PowerState::Coast, Power::Powered => core::PowerState::Powered })?;
        Ok(json!({
            "schemaVersion": SCHEMA_VERSION, "modelId": core::MODEL_ID, "inputIdentity": request.input_identity, "input": args,
            "geometryIdentity": result.geometry_identity, "sourceIdentity": result.source.identity,
            "conditionIdentity": result.source.condition_identity,
            "computationalStatus": if result.zero_speed { "supported-zero-static-force-coefficients-unavailable" } else { "supported" },
            "empiricalQualification": "unqualified", "dynamicQualification": "not-modeled",
            "power": args["power"], "powerPolicy": args["powerPolicy"],
            "environment": environment_diagnostic::render(&request.environment, &environment),
            "totalCa0": result.ca0, "axialForceBodyN": result.axial_force_body_n,
            "unavailableReason": result.unavailable_reason,
            "components": result.components.iter().map(|c| json!({ "identity": c.identity, "sourceId": c.source_id, "ca0": c.ca0, "axialResistanceN": c.axial_resistance_n })).collect::<Vec<_>>(),
            "frictionSurfaces": result.friction.surfaces.iter().map(|s| json!({
                "identity": s.geometry.identity, "reynolds": s.reynolds, "roughnessOverLength": s.roughness_over_length,
                "roughnessReynoldsCutoff": s.roughness_reynolds_cutoff, "effectiveReynolds": s.effective_reynolds,
                "cfIncompressible": s.cf_incompressible, "compressibilityFactor": s.compressibility_factor,
                "cf": s.cf, "ca0": s.cd_friction, "axialResistanceN": s.modeled_static_resistance_n,
            })).collect::<Vec<_>>(),
            "sourceLedger": { "pressureSourceId": core::PRESSURE_SOURCE_ID, "frictionModelId": skin_friction::MODEL_ID, "frictionSourceId": skin_friction::SOURCE_ID,
                "configurationId": core::CONFIGURATION_ID, "frictionCoverageId": core::COVERAGE_ID, "maxMachExclusive": core::MAX_MACH_EXCLUSIVE,
                "minimumEffectiveReynolds": skin_friction::MIN_EFFECTIVE_REYNOLDS, "cachePolicy": "direct-only-no-axial-cache" },
            "limitations": [
                "Zero-incidence axial diagnostic only; no normal force, moment, rate, thrust, canopy, finite-angle or flight prediction.",
                "All source/geometry/condition/profile identities and area/form-factor/coverage declarations are caller assertions, not hashes or qualifications.",
                "Fully turbulent inherited friction; no transition, laminar, wall-temperature, humidity or pressure-gradient model.",
                "Inherited nose pressure offset and base/plume fits are unqualified. No nozzle area subtraction or sting model.",
                "No transonic, boattail, protuberance, attachment or obstructed-base support.",
                "Nonzero effective Re below 1000 refuses: this source cannot alone support a launch from rest.",
                "No stage-time/AGL conversion, shared-flight integration, product profile application or default activation."
            ]
        }))
    };
    evaluate().map_err(|e| format!("evaluate_native_total_axial: {e}"))
}
