//! Direct total zero-incidence axial diagnostic over the actual E1 local state.
//! Inherited, empirically unqualified equations; not a flight provider or default.
use crate::{aero, environment, skin_friction};
use std::collections::HashSet;
use std::f64::consts::PI;

pub const MODEL_ID: &str = "local-subsonic-inherited-total-axial/1.0.0";
pub const PRESSURE_SOURCE_ID: &str = "astraea-core:aero.rs:compute_nosecone_wave_drag+compute_fin_wave_drag+compute_fin_edge_drag+compute_base_drag@3d9ca93";
pub const MAX_MACH_EXCLUSIVE: f64 = 0.8;
pub const CONFIGURATION_ID: &str = "clean-nose-cylinder-trapezoid-fins-unobstructed-base/1.0.0";
pub const COVERAGE_ID: &str = "nose-cylinder-plus-all-fin-faces-friction-no-pressure-in-form-factors/1.0.0";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Configuration { CleanNoseCylinderTrapezoidFinsUnobstructedBase }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FrictionCoverage { NoseCylinderPlusAllFinFacesNoPressureInFormFactors }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PowerState { Coast, Powered }
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PowerPolicy { CoastOnly, InheritedPlumeFactor038 }
#[derive(Clone, Debug, PartialEq)]
pub struct FinSet {
    pub count: i32,
    pub root_chord_m: f64,
    pub tip_chord_m: f64,
    pub span_m: f64,
    /// Axial leading-edge sweep LENGTH, metres (not degrees).
    pub sweep_length_m: f64,
    pub thickness_m: f64,
    pub cross_section: aero::FinCrossSection,
    /// Wetted area includes all fins and both faces; count is already included.
    pub friction: skin_friction::SurfaceGeometry,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Geometry {
    pub identity: String,
    pub configuration: Configuration,
    pub friction_coverage: FrictionCoverage,
    pub reference_area_m2: f64,
    /// Nose base, cylinder, and unobstructed aft base all have this diameter.
    pub body_diameter_m: f64,
    pub nose_shape: aero::NoseShape,
    pub nose_length_m: f64,
    pub cylinder_length_m: f64,
    /// One surface covering the whole nose+cylinder, not just the cylinder.
    pub body_friction: skin_friction::SurfaceGeometry,
    pub fins: Vec<FinSet>,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Source {
    pub identity: String,
    pub geometry_identity: String,
    pub condition_identity: String,
    pub description: String,
}
#[derive(Clone, Debug)]
pub struct PreparedAxial {
    geometry: Geometry,
    source: Source,
    power_policy: PowerPolicy,
    surfaces: Vec<skin_friction::SurfaceGeometry>,
    body_area_m2: f64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Component {
    pub identity: String,
    pub source_id: &'static str,
    /// None only at exactly zero airspeed; never silently filled with zero.
    pub ca0: Option<f64>,
    pub axial_resistance_n: f64,
}
#[derive(Clone, Debug, PartialEq)]
pub struct Evaluation {
    pub model_id: &'static str,
    pub geometry_identity: String,
    pub source: Source,
    pub power_policy: PowerPolicy,
    pub power: PowerState,
    pub friction: skin_friction::Evaluation,
    pub components: Vec<Component>,
    pub ca0: Option<f64>,
    /// P0 +Y-forward: (0,-resistance,0). No normal force/moment/thrust added.
    pub axial_force_body_n: [f64; 3],
    pub zero_speed: bool,
    pub unavailable_reason: Option<&'static str>,
}
fn require(ok: bool, reason: &str) -> Result<(), String> {
    if ok { Ok(()) } else { Err(format!("{MODEL_ID}: {reason}")) }
}
fn positive(x: f64) -> bool { x.is_finite() && x > 0.0 }

#[cfg(test)]
mod tests;

impl PreparedAxial {
    pub fn prepare(geometry: Geometry, source: Source, power_policy: PowerPolicy) -> Result<Self, String> {
        for value in [&geometry.identity, &source.identity, &source.geometry_identity, &source.condition_identity, &source.description] {
            require(!value.trim().is_empty(), "geometry/source/condition identities and description must be nonempty")?;
        }
        require(source.geometry_identity == geometry.identity, "source geometry identity mismatch")?;
        // Refuse inputs that would trigger the legacy functions' hidden floors.
        require(geometry.reference_area_m2.is_finite() && geometry.reference_area_m2 >= 0.0001,
            "Sref must be finite >=1e-4 m2; inherited reference floor is not applied")?;
        require(geometry.body_diameter_m.is_finite() && geometry.body_diameter_m >= 0.01,
            "body diameter must be finite >=.01 m; inherited diameter floor is not applied")?;
        require(positive(geometry.nose_length_m) && positive(geometry.cylinder_length_m), "nose/cylinder lengths must be positive finite")?;
        let body_length = geometry.nose_length_m + geometry.cylinder_length_m;
        require(positive(body_length) && geometry.body_friction.length_m == body_length,
            "body friction length must equal finite nose+cylinder length")?;
        let body_area_m2 = (PI / 4.0) * geometry.body_diameter_m.powi(2);
        require(positive(body_area_m2) && positive(body_area_m2 / geometry.reference_area_m2), "body area/reference conversion overflow or underflow")?;
        let mut surfaces = vec![geometry.body_friction.clone()];
        for fin in &geometry.fins {
            require(fin.count > 0, "fin count must be positive")?;
            require(fin.root_chord_m.is_finite() && fin.root_chord_m >= 0.01,
                "root chord must be finite >=.01 m; inherited chord floor is not applied")?;
            require(fin.tip_chord_m.is_finite() && fin.tip_chord_m >= 0.0 && positive(fin.span_m) && positive(fin.thickness_m), "invalid fin tip/span/thickness")?;
            require(fin.sweep_length_m.is_finite(), "fin sweep length must be finite metres")?;
            require(positive(fin.span_m.powi(2)) && positive(fin.span_m.powi(2) + fin.sweep_length_m.powi(2)), "fin sweep arithmetic overflow/underflow")?;
            let cos2_sweep = fin.span_m.powi(2) / (fin.span_m.powi(2) + fin.sweep_length_m.powi(2));
            require(positive(cos2_sweep), "fin sweep quotient underflow; no lost positive leading-edge contribution allowed")?;
            let edge_ratio = fin.span_m * fin.thickness_m * f64::from(fin.count) / geometry.reference_area_m2;
            require(positive(edge_ratio), "fin edge/reference scale overflow/underflow")?;
            surfaces.push(fin.friction.clone());
        }
        let mut seen = HashSet::new();
        for surface in &surfaces {
            require(!surface.identity.trim().is_empty() && seen.insert(surface.identity.clone()), "surface identities must be nonempty and unique")?;
            require(positive(surface.length_m) && positive(surface.wetted_area_m2) && positive(surface.form_factor), "surface lengths/areas/form factors must be positive finite")?;
            require(surface.roughness_m.is_finite() && surface.roughness_m >= 0.0 && (surface.roughness_m == 0.0 || positive(surface.roughness_m / surface.length_m)), "invalid or unrepresentable surface roughness")?;
        }
        Ok(Self { geometry, source, power_policy, surfaces, body_area_m2 })
    }
    pub fn geometry(&self) -> &Geometry { &self.geometry }
    pub fn source(&self) -> &Source { &self.source }
    pub fn surface_inputs(&self) -> Vec<environment::SurfaceInput> {
        self.surfaces.iter().map(|s| environment::SurfaceInput { identity: s.identity.clone(), length_m: s.length_m, roughness_m: s.roughness_m }).collect()
    }

    /// Direct local evaluation: no atmosphere reconstruction, cache, coefficient
    /// interpolation, CP lookup, calibration, floor, power inference or fallback.
    /// Engine callers supply the actual strict E1 typed result, not rendered JSON.
    pub fn evaluate(&self, flow: &environment::Evaluation, power: PowerState) -> Result<Evaluation, String> {
        require(power != PowerState::Powered || self.power_policy == PowerPolicy::InheritedPlumeFactor038,
            "powered flow requires explicit inherited-plume-factor-0.38 policy; no coast fallback or inferred nozzle correction")?;
        require(positive(flow.sample.pressure_pa) && positive(flow.sample.temperature_k), "local P/T must be positive finite")?;
        let wind = flow.sample.wind_toward_enu_mps;
        let air = flow.air_relative_velocity_enu_mps;
        require([wind.east, wind.north, wind.up, air.east, air.north, air.up].iter().all(|v| v.is_finite()), "local wind/air-relative velocity must be finite")?;
        require(air.east.hypot(air.north).hypot(air.up) == flow.airspeed_mps, "local speed inconsistent with E1 air-relative vector")?;
        require(flow.mach.is_finite() && flow.mach >= 0.0 && flow.mach < MAX_MACH_EXCLUSIVE, "subsonic support requires 0<=Mach<.8")?;
        let mut seen = HashSet::new();
        require(flow.surfaces.len() == self.surfaces.len() && flow.surfaces.iter().all(|s| seen.insert(s.input.identity.clone())), "E1 surface identities must exactly cover geometry without duplicates")?;
        let friction = skin_friction::evaluate(flow, &self.surfaces, self.geometry.reference_area_m2)
            .map_err(|e| format!("{MODEL_ID}: {}: {e}", skin_friction::MODEL_ID))?;
        let zero = friction.zero_speed;
        let scale = flow.dynamic_pressure_pa * self.geometry.reference_area_m2;
        require(if zero { scale == 0.0 } else { positive(scale) }, "q*Sref overflow/underflow")?;
        let mut components = Vec::new();
        for surface in &friction.surfaces {
            components.push(Component { identity: format!("friction:{}", surface.geometry.identity), source_id: skin_friction::MODEL_ID,
                ca0: surface.cd_friction, axial_resistance_n: surface.modeled_static_resistance_n });
        }
        // Called only inside the reviewed subsonic branch, with every inherited
        // reference floor inactive. Nose and base are on body frontal area;
        // fin routines are already on Sref. Convert each exactly once.
        let area_ratio = self.body_area_m2 / self.geometry.reference_area_m2;
        let mut append = |identity: String, coefficient: f64| -> Result<(), String> {
            let force = scale * coefficient;
            require(coefficient.is_finite() && coefficient >= 0.0 && force.is_finite() && force >= 0.0
                && (zero || coefficient == 0.0 || force > 0.0), "pressure component overflow/underflow")?;
            components.push(Component { identity, source_id: PRESSURE_SOURCE_ID, ca0: if zero { None } else { Some(coefficient) }, axial_resistance_n: if zero { 0.0 } else { force } });
            Ok(())
        };
        let nose = aero::compute_nosecone_wave_drag(self.geometry.nose_shape, self.geometry.nose_length_m, self.geometry.body_diameter_m, flow.mach) * area_ratio;
        require(positive(nose), "nose pressure coefficient overflow/underflow")?;
        append("nose-pressure-offset".into(), nose)?;
        let base = aero::compute_base_drag(flow.mach, self.geometry.body_diameter_m, self.geometry.body_diameter_m, power == PowerState::Powered) * area_ratio;
        require(positive(base), "base pressure coefficient overflow/underflow")?;
        append("body-base".into(), base)?;
        for fin in &self.geometry.fins {
            let wave = aero::compute_fin_wave_drag(fin.count, fin.root_chord_m, fin.tip_chord_m, fin.span_m, fin.thickness_m, fin.cross_section, flow.mach, self.geometry.reference_area_m2);
            let (le, te) = aero::compute_fin_edge_drag(fin.count, fin.span_m, fin.sweep_length_m, fin.thickness_m, fin.cross_section, flow.mach, self.geometry.reference_area_m2);
            if !zero {
                // Only source-defined structural zeros are allowed. In this
                // envelope square/rounded/airfoil LE is strictly positive at
                // positive Mach. The inherited rounded subtraction can lose it
                // to cancellation: refuse rather than silently report zero.
                if fin.cross_section != aero::FinCrossSection::DoubleWedge {
                    require(positive(le), "lost positive leading-edge coefficient (underflow/cancellation); inherited pressure source unsupported at this scale")?;
                }
                if matches!(fin.cross_section, aero::FinCrossSection::Square | aero::FinCrossSection::Rounded) {
                    require(positive(te), "lost positive trailing-edge coefficient (underflow)")?;
                }
            }
            append(format!("fin-wave:{}", fin.friction.identity), wave)?;
            append(format!("fin-leading-edge:{}", fin.friction.identity), le)?;
            append(format!("fin-trailing-edge:{}", fin.friction.identity), te)?;
        }
        let ca0 = if zero { None } else { Some(components.iter().map(|c| c.ca0.unwrap()).sum::<f64>()) };
        let resistance = components.iter().map(|c| c.axial_resistance_n).sum::<f64>();
        require(if zero { resistance == 0.0 } else { ca0.is_some_and(positive) && positive(resistance) }, "component sum overflow/underflow")?;
        Ok(Evaluation { model_id: MODEL_ID, geometry_identity: self.geometry.identity.clone(), source: self.source.clone(), power_policy: self.power_policy, power,
            friction, components, ca0, axial_force_body_n: [0.0, -resistance, 0.0], zero_speed: zero,
            unavailable_reason: if zero { Some("zero-airspeed: all axial coefficients unavailable; modeled static axial force zero; no rate model") } else { None } })
    }
}
