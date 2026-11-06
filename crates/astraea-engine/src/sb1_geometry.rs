//! Opt-in native SB1 geometry adapter. No dispatch/runtime provider is activated.
//! Inputs are the existing engine DTO, not a parallel abstract vehicle schema.
use crate::models::{FrontendComponent, FrontendVehicle};
use astraea_core::aero_coefficients::{CandidateGeometry, GeometryDeclarations, References, TrapezoidFinSet};
use astraea_core::aero_profiles::{IntegrationReport, Profile, ProfileError, QuadratureSettings};
use std::collections::HashSet;

pub const ADAPTER_ID: &str = "frontend-external-profile-SB1/1.0.0";
#[derive(Clone, Copy, Debug)]
pub enum OgiveInterpretation { TangentOgive }
#[derive(Clone, Copy, Debug)]
pub enum TransitionInterpretation { Conical }
#[derive(Clone, Copy, Debug)]
pub enum AftTermination { FlatExposedBaseAtFinalStation }
/// Assertions about physical geometry unavailable from the DTO. No empirical
/// thinness/slenderness threshold is invented by this adapter.
#[derive(Clone, Debug)]
pub struct SupportDeclarations {
    pub provenance: String,
    pub sharp_physical_tip: bool,
    pub circular_axisymmetric_body: bool,
    pub smooth_slender_profile: bool,
    pub identical_equally_spaced_thin_uncanted_fins: bool,
    pub no_other_external_features_or_unmodeled_interferences: bool,
    /// Caller assertion only: typed DTO checks cannot establish raw-JSON completeness.
    pub source_represents_complete_external_geometry: bool,
}
#[derive(Clone, Debug)]
pub struct AdapterOptions {
    /// Retained as caller provenance, never represented as a computed geometry hash.
    pub source_identity: String,
    pub declarations: SupportDeclarations,
    pub ogive_interpretation: Option<OgiveInterpretation>,
    pub transition_interpretation: Option<TransitionInterpretation>,
    pub aft_termination: AftTermination,
    /// Only masscomponent/parachute may be excluded, by explicit ID and declaration.
    pub internal_non_geometry_ids: Vec<String>,
    pub quadrature: QuadratureSettings,
}
#[derive(Clone, Debug)]
pub enum ComponentRole {
    Body { profile: Profile, integration: IntegrationReport, interval_index: usize },
    Fins { host_component_id: String, host_start_m: f64, host_end_m: f64, geometry: TrapezoidFinSet },
    DeclaredInternalNonGeometry,
}
#[derive(Clone, Debug)]
pub struct ComponentProvenance {
    pub source_index: usize,
    pub source: FrontendComponent,
    pub role: ComponentRole,
}
#[derive(Clone, Debug)]
pub struct SupportReport {
    pub adapter_id: &'static str,
    pub source_identity: String,
    pub options: AdapterOptions,
    pub components: Vec<ComponentProvenance>,
    pub limits: Vec<&'static str>,
}
#[derive(Clone, Debug)]
pub struct AdaptedGeometry {
    pub geometry: CandidateGeometry,
    pub references: References,
    pub report: SupportReport,
}
#[derive(Clone, Debug)]
pub struct AdapterError {
    pub component_index: Option<usize>,
    pub component_id: Option<String>,
    pub reason: String,
    /// Nonconvergence retains the full failed integration report.
    pub profile_error: Option<ProfileError>,
}
fn error(reason: impl Into<String>) -> AdapterError {
    AdapterError { component_index: None,component_id: None,reason: reason.into(),profile_error: None }
}
fn required(v: Option<f64>, label: &str) -> Result<f64, AdapterError> {
    match v { Some(x) if x.is_finite() => Ok(x), _ => Err(error(format!("missing or nonfinite explicit {label}"))) }
}
fn positive(v: Option<f64>, label: &str) -> Result<f64, AdapterError> {
    let x=required(v,label)?; if x <= 0.0 { return Err(error(format!("{label} must be positive"))); } Ok(x)
}

/// The flat list advances only for nose/tube/transition. Fin offsets refer to
/// the most recent preceding body tube's START, matching existing DTO semantics.
/// There are no geometry defaults: omitted sweep/offset/shape need explicit data.
pub fn adapt_frontend_vehicle(vehicle: &FrontendVehicle, options: &AdapterOptions) -> Result<AdaptedGeometry, AdapterError> {
    let d=&options.declarations;
    if options.source_identity.trim().is_empty() || d.provenance.trim().is_empty() {
        return Err(error("source identity and declaration provenance required"));
    }
    if !d.sharp_physical_tip || !d.circular_axisymmetric_body || !d.smooth_slender_profile
        || !d.identical_equally_spaced_thin_uncanted_fins || !d.no_other_external_features_or_unmodeled_interferences
        || !d.source_represents_complete_external_geometry {
        return Err(error("explicit physical support declarations required; support is unqualified"));
    }
    options.quadrature.validate().map_err(|e| AdapterError { profile_error: Some(e),..error("invalid quadrature options") })?;
    let internal: HashSet<_>=options.internal_non_geometry_ids.iter().cloned().collect();
    if internal.len()!=options.internal_non_geometry_ids.len() { return Err(error("duplicate internal declarations")); }
    let mut seen=HashSet::new(); let mut used_internal=HashSet::new();
    let mut body=Vec::new(); let mut provenance=Vec::new(); let mut station=0.0;
    let mut previous_radius=0.0; let mut max_radius: f64=0.0;
    let mut host: Option<(String,f64,f64,f64)>=None;
    let mut fins=None; let mut nose_seen=false;
    for (index,c) in vehicle.components.iter().enumerate() {
        let result=(|| -> Result<ComponentRole,AdapterError> {
            if c.id.trim().is_empty() || !seen.insert(c.id.clone()) { return Err(error("empty or duplicate component ID")); }
            if c.is_motor_mount==Some(true) { return Err(error("motor-mount internal/external topology ambiguous")); }
            if internal.contains(&c.id) {
                if c.kind!="masscomponent" && c.kind!="parachute" { return Err(error("only explicit masscomponent/parachute internal exclusions supported")); }
                used_internal.insert(c.id.clone()); return Ok(ComponentRole::DeclaredInternalNonGeometry);
            }
            if c.points.is_some() { return Err(error("freeform point declaration unsupported")); }
            let fin_dimensions = c.fin_count.is_some() || c.root_chord.is_some() || c.tip_chord.is_some()
                || c.span.is_some() || c.sweep_length.is_some() || c.thickness.is_some();
            let body_dimensions = c.length.is_some() || c.base_diameter.is_some() || c.outer_diameter.is_some()
                || c.inner_diameter.is_some() || c.fore_diameter.is_some() || c.aft_diameter.is_some();
            if (c.kind!="trapezoidfinset" && fin_dimensions) || (c.kind=="trapezoidfinset" && body_dimensions)
                || c.diameter.is_some() || c.cd.is_some() {
                return Err(error("geometry declaration belongs to an unsupported/different component role"));
            }
            let incompatible_body_fields = match c.kind.as_str() {
                "nosecone" => c.outer_diameter.is_some() || c.inner_diameter.is_some() || c.fore_diameter.is_some() || c.aft_diameter.is_some(),
                "bodytube" => c.base_diameter.is_some() || c.fore_diameter.is_some() || c.aft_diameter.is_some(),
                "transition" => c.base_diameter.is_some() || c.outer_diameter.is_some() || c.inner_diameter.is_some(),
                _ => false,
            };
            if incompatible_body_fields { return Err(error("conflicting external profile declarations")); }
            if c.kind=="trapezoidfinset" {
                if fins.is_some() { return Err(error("multiple fin sets unsupported")); }
                if c.shape.is_some() { return Err(error("fin shape declaration unsupported")); }
                if let Some(s)=c.cross_section.as_deref() {
                    if !["square","rounded","double_wedge","airfoil"].contains(&s) { return Err(error("unknown fin cross-section")); }
                }
                let (host_id,start,end,radius)=host.clone().ok_or_else(|| error("fins require a preceding external bodytube"))?;
                let count=required(c.fin_count,"finCount")?;
                if count!=3.0 && count!=4.0 { return Err(error("exactly three or four fins required")); }
                let root=positive(c.root_chord,"rootChord")?; let tip=required(c.tip_chord,"tipChord")?;
                let span=positive(c.span,"exposed span")?; let sweep=required(c.sweep_length,"tip LE sweepLength")?;
                let offset=required(c.axial_offset,"axialOffset relative to preceding bodytube start")?;
                positive(c.thickness,"fin thickness")?;
                let x=start+offset;
                if tip<0.0 || sweep<0.0 || !x.is_finite() || x<start || x+root>end {
                    return Err(error("invalid fin dimensions or root not wholly on its host cylinder"));
                }
                let f=TrapezoidFinSet { count: count as u8,exposed_semispan_m: span,local_body_radius_m: radius,
                    root_chord_m: root,tip_chord_m: tip,tip_le_sweep_m: sweep,root_le_station_m: x };
                fins=Some(f);
                return Ok(ComponentRole::Fins { host_component_id: host_id,host_start_m: start,host_end_m: end,geometry: f });
            }
            if !["nosecone","bodytube","transition"].contains(&c.kind.as_str()) {
                return Err(error(format!("unsupported component kind '{}' (internals require explicit ID exclusion)",c.kind)));
            }
            if c.cross_section.is_some() { return Err(error("body cross-section declaration unsupported")); }
            if let Some(offset)=c.axial_offset { if !offset.is_finite() || offset!=0.0 { return Err(error("body axial offsets/gaps unsupported in flat sequential chain")); } }
            let length=positive(c.length,"length")?;
            let profile=match c.kind.as_str() {
                "nosecone" => {
                    if nose_seen || station!=0.0 { return Err(error("one nose must begin the external chain")); }
                    nose_seen=true;
                    let radius=positive(c.base_diameter,"baseDiameter")?/2.0;
                    match c.shape.as_deref() {
                        Some("conical") => Profile::Cone { length_m: length,base_radius_m: radius },
                        Some("ogive") if options.ogive_interpretation.is_some() => Profile::TangentOgive { length_m: length,base_radius_m: radius },
                        _ => return Err(error("explicit conical or declared tangent-ogive nose required")),
                    }
                },
                "bodytube" => {
                    if !nose_seen || c.shape.is_some() { return Err(error("bodytube requires preceding nose and no unknown shape declaration")); }
                    Profile::Cylinder { length_m: length,radius_m: positive(c.outer_diameter,"outerDiameter")?/2.0 }
                },
                _ => {
                    if !nose_seen || options.transition_interpretation.is_none()
                        || !matches!(c.shape.as_deref(),None|Some("conical")) { return Err(error("explicit conical transition interpretation required")); }
                    Profile::ConicalFrustum { length_m: length,fore_radius_m: positive(c.fore_diameter,"foreDiameter")?/2.0,
                        aft_radius_m: positive(c.aft_diameter,"aftDiameter")?/2.0 }
                },
            };
            let (_,r0,r1)=profile.dimensions();
            if r0!=previous_radius { return Err(error("disconnected profile diameters/gaps unsupported (exact source continuity required)")); }
            let (interval,integration)=profile.integrate(station,options.quadrature).map_err(|e| AdapterError {
                profile_error: Some(e),..error("profile integration failed") })?;
            let interval_index=body.len();
            if c.kind=="bodytube" { host=Some((c.id.clone(),station,interval.x1_m,r1)); }
            station=interval.x1_m; previous_radius=r1;max_radius=max_radius.max(r0).max(r1);
            body.push(interval);
            Ok(ComponentRole::Body { profile,integration,interval_index })
        })();
        match result {
            Ok(role) => provenance.push(ComponentProvenance { source_index: index,source: c.clone(),role }),
            Err(mut e) => { e.component_index=Some(index); e.component_id=Some(c.id.clone());return Err(e); },
        }
    }
    if used_internal!=internal { return Err(error("internal declaration references absent source ID")); }
    let fins=fins.ok_or_else(|| error("one supported trapezoidal fin set required"))?;
    let references=References::canonical(2.0*max_radius).map_err(|e| error(format!("invalid references: {e:?}")))?;
    let geometry=CandidateGeometry {
        identity: format!("{ADAPTER_ID}:{}",options.source_identity),
        integral_provenance: "retained exact source profiles; analytic cone/cylinder/frustum; error-estimated Simpson tangent ogive; see SupportReport".into(),
        declarations: GeometryDeclarations { sharp_nosed_axisymmetric_circular: true,smooth_slender_profile: true,
            identical_equally_spaced_thin_uncanted_fins: true },body,fins,
    };
    geometry.normal_sums(0.0,references).map_err(|e| error(format!("SB1 structural checks failed: {e:?}")))?;
    Ok(AdaptedGeometry { geometry,references,report: SupportReport { adapter_id: ADAPTER_ID,
        source_identity: options.source_identity.clone(),options: options.clone(),components: provenance,
        limits: vec![
            "Typed DTO boundary: unknown raw JSON fields may already have been discarded; this adapter cannot validate raw-source completeness.",
            "Physical sharpness, smoothness/slenderness, thinness, spacing, cant and omitted features/interferences are explicit caller assertions, not empirical qualification.",
            "Flat exposed aft base ends the profile; no invented closing-cap normal force. Axial/base drag requires a separately identified provider.",
            "Known fin cross-section and thickness are retained; the asserted thin-fin SB1 idealization does not model thickness or cross-section effects.",
            "Quadrature Richardson error and roundoff indicators are convergence diagnostics, not rigorous bounds or physical uncertainty.",
            "body-area-upper-bound-roundoff/1.0.0 admits only relative 64-epsilon arithmetic differences in SB1 area upper-bound validation; source profile radius continuity remains exact.",
            "Source identity is caller supplied; retained DTO/options are provenance, not a canonical geometry hash or cache identity.",
        ] } })
}

#[cfg(test)]
mod tests {
    use super::*;
    use astraea_core::aero_coefficients::{evaluate_static,Datum,PrescribedAxial,StaticInput,Vec3};
    use serde_json::json;
    fn vehicle() -> FrontendVehicle { serde_json::from_value(json!({"components":[
        {"id":"nose","name":"synthetic cone","type":"nosecone","shape":"conical","length":0.3,"baseDiameter":0.1},
        {"id":"tube1","name":"forward tube","type":"bodytube","length":0.6,"outerDiameter":0.1},
        {"id":"tube2","name":"aft tube","type":"bodytube","length":1.0,"outerDiameter":0.1},
        {"id":"fins","name":"synthetic fins","type":"trapezoidfinset","finCount":4,"rootChord":0.2,"tipChord":0.1,"span":0.08,"sweepLength":0.05,"thickness":0.001,"axialOffset":0.5}
    ]})).unwrap() }
    fn options() -> AdapterOptions { AdapterOptions {
        source_identity: "synthetic-not-as-flown".into(),declarations: SupportDeclarations { provenance: "test fixture assertions only".into(),
            sharp_physical_tip: true,circular_axisymmetric_body: true,smooth_slender_profile: true,
            identical_equally_spaced_thin_uncanted_fins: true,no_other_external_features_or_unmodeled_interferences: true,
            source_represents_complete_external_geometry: true },
        ogive_interpretation: None,transition_interpretation: Some(TransitionInterpretation::Conical),
        aft_termination: AftTermination::FlatExposedBaseAtFinalStation,internal_non_geometry_ids: vec![],
        quadrature: QuadratureSettings { absolute_tolerance_m3: 1e-14,relative_tolerance: 1e-10,max_panels: 4096 },
    } }
    fn near(a: f64,b: f64) { assert!((a-b).abs()<1e-11, "{a} != {b}"); }
    #[test]
    fn actual_frontend_dto_to_profiles_and_coefficient_evaluation() {
        let a=adapt_frontend_vehicle(&vehicle(),&options()).unwrap();
        near(a.references.diameter_m,0.1);near(a.geometry.fins.root_le_station_m,1.4);
        let cone=a.geometry.body[0].contribution(a.references).unwrap();near(cone.c_per_rad,2.0);near(cone.j_m_per_rad,0.4);
        for tube in &a.geometry.body[1..] { let c=tube.contribution(a.references).unwrap();near(c.c_per_rad,0.0);near(c.j_m_per_rad,0.0); }
        assert_eq!(a.report.components[3].source.id,"fins");
        assert!(matches!(&a.report.components[3].role,ComponentRole::Fins { host_component_id,.. } if host_component_id=="tube2"));
        let out=evaluate_static(&a.geometry,a.references,Datum::NOSE,
            &PrescribedAxial { ca0: 0.3,provider_id: "analytic-fixture-CA0".into(),input_identity: "fixture".into() },
            StaticInput { relative_velocity_at_cg_b_mps: Vec3::new(0.0,100.0,1.0),omega_b_radps: Vec3::ZERO,
                mach: 0.3,density_kg_m3: 1.2,cg_position_from_nose_b_m: Vec3::new(0.0,-1.0,0.0) }).unwrap();
        assert!(out.static_coefficients_at_datum.unwrap().cm_b.x>0.0);
    }
    #[test]
    fn actual_decimal_dto_cylinder_average_one_ulp_above_reference_is_supported() {
        let mut v=vehicle();
        v.components[0].length=Some(0.1);v.components[0].base_diameter=Some(0.07);
        v.components[1].length=Some(0.31);v.components[1].outer_diameter=Some(0.07);
        v.components[2].length=Some(0.5);v.components[2].outer_diameter=Some(0.07);
        v.components[3].axial_offset=Some(0.1);
        let a=adapt_frontend_vehicle(&v,&options()).unwrap();
        let i=a.geometry.body[1];
        assert!(i.integral_area_m3/(i.x1_m-i.x0_m)>a.references.area_m2);
        near(a.references.diameter_m,0.07);
        // Real source gaps remain exact failures, regardless of numerical-area policy.
        v.components[2].outer_diameter=Some(f64::from_bits(0.07_f64.to_bits()+1));
        assert!(adapt_frontend_vehicle(&v,&options()).is_err());
    }
    #[test]
    fn tangent_ogive_requires_interpretation_and_records_quadrature() {
        let mut v=vehicle();v.components[0].shape=Some("ogive".into());
        assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        let mut o=options();o.ogive_interpretation=Some(OgiveInterpretation::TangentOgive);
        let a=adapt_frontend_vehicle(&v,&o).unwrap();
        assert!(matches!(&a.report.components[0].role,ComponentRole::Body { profile: Profile::TangentOgive {..},integration,.. } if integration.converged && integration.panels>0));
        o.quadrature.max_panels=8;o.quadrature.absolute_tolerance_m3=1e-30;o.quadrature.relative_tolerance=0.0;
        assert!(matches!(adapt_frontend_vehicle(&v,&o),Err(AdapterError { profile_error: Some(ProfileError::NonConverged(_)),.. })));
    }
    #[test]
    fn rejects_unsupported_geometry_missing_data_and_nonfinite_inputs() {
        for shape in ["parabolic","elliptical","vonkarman","unknown"] {
            let mut v=vehicle();v.components[0].shape=Some(shape.into());assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        }
        for kind in ["freeformfinset","ellipticalfinset","masscomponent","parachute","unknown"] {
            let mut v=vehicle();v.components[3].kind=kind.into();assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        }
        let mut v=vehicle();v.components[1].is_motor_mount=Some(true);assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        let mut v=vehicle();v.components[2].outer_diameter=Some(0.11);assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        let mut v=vehicle();v.components[3].axial_offset=None;assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        let mut v=vehicle();v.components[3].sweep_length=None;assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        let mut v=vehicle();v.components[3].axial_offset=Some(0.9);assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        let mut v=vehicle();let mut f=v.components[3].clone();f.id="second".into();v.components.push(f);assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        for bad in [f64::NAN,f64::INFINITY,-1.0] {
            let mut v=vehicle();v.components[0].length=Some(bad);assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        }
        let mut o=options();o.declarations.sharp_physical_tip=false;assert!(adapt_frontend_vehicle(&vehicle(),&o).is_err());
        let mut v=vehicle();v.components[3].cross_section=Some("unknown".into());assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        let mut v=vehicle();v.components[0].outer_diameter=Some(0.1);assert!(adapt_frontend_vehicle(&v,&options()).is_err());
    }
    #[test]
    fn explicit_internal_exclusions_preserve_station_and_provenance() {
        let mut v=vehicle();let mut internal=v.components[1].clone();internal.id="ballast".into();internal.kind="masscomponent".into();
        v.components.insert(2,internal);
        assert!(adapt_frontend_vehicle(&v,&options()).is_err());
        let mut o=options();o.internal_non_geometry_ids.push("ballast".into());
        let a=adapt_frontend_vehicle(&v,&o).unwrap();near(a.geometry.fins.root_le_station_m,1.4);
        assert!(matches!(a.report.components[2].role,ComponentRole::DeclaredInternalNonGeometry));
        o.internal_non_geometry_ids.push("missing".into());assert!(adapt_frontend_vehicle(&v,&o).is_err());
    }
    #[test]
    fn transitions_preserve_source_profiles_and_signed_contributions() {
        let mut v=vehicle();let mut t=v.components[1].clone();t.id="taper".into();t.kind="transition".into();
        t.length=Some(0.2);t.outer_diameter=None;t.fore_diameter=Some(0.1);t.aft_diameter=Some(0.08);
        v.components.insert(2,t);v.components[3].outer_diameter=Some(0.08);
        let a=adapt_frontend_vehicle(&v,&options()).unwrap();
        assert!(a.geometry.body[2].contribution(a.references).unwrap().c_per_rad<0.0);
        near(a.geometry.fins.local_body_radius_m,0.04);near(a.geometry.fins.root_le_station_m,1.6);
        assert!(matches!(a.report.components[2].role,ComponentRole::Body { profile: Profile::ConicalFrustum {..},.. }));
        let mut o=options();o.transition_interpretation=None;assert!(adapt_frontend_vehicle(&v,&o).is_err());
    }
    #[test]
    fn rejected_adapters_leave_the_input_vehicle_identical_and_localize_the_component() {
        let mut cases:Vec<(FrontendVehicle,AdapterOptions,&str)>=Vec::new();
        let mut multiple=vehicle();let mut second=multiple.components[3].clone();
        second.id="second-fins".into();multiple.components.push(second);
        cases.push((multiple,options(),"second-fins"));
        let mut count=vehicle();count.components[3].fin_count=Some(2.0);
        cases.push((count,options(),"fins"));
        let mut unknown_nose=vehicle();unknown_nose.components[0].shape=Some("parabolic".into());
        cases.push((unknown_nose,options(),"nose"));
        let mut cross_section=vehicle();cross_section.components[3].cross_section=Some("diamond".into());
        cases.push((cross_section,options(),"fins"));
        let mut fin_gap=vehicle();fin_gap.components[3].axial_offset=Some(0.9);
        cases.push((fin_gap,options(),"fins"));
        let mut body_gap=vehicle();body_gap.components[1].axial_offset=Some(0.01);
        cases.push((body_gap,options(),"tube1"));
        let mut unknown_kind=vehicle();unknown_kind.components[1].kind="attachment".into();
        cases.push((unknown_kind,options(),"tube1"));
        let mut transition=vehicle();let mut t=transition.components[1].clone();
        t.id="taper".into();t.kind="transition".into();t.length=Some(0.2);t.outer_diameter=None;
        t.fore_diameter=Some(0.1);t.aft_diameter=Some(0.1);t.shape=Some("ogive".into());
        transition.components.insert(2,t);
        cases.push((transition,options(),"taper"));
        let mut ogive=vehicle();ogive.components[0].shape=Some("ogive".into());
        let mut tight=options();tight.ogive_interpretation=Some(OgiveInterpretation::TangentOgive);
        tight.quadrature=QuadratureSettings { absolute_tolerance_m3:1e-30,relative_tolerance:0.0,max_panels:8 };
        cases.push((ogive,tight,"nose"));
        for (v,o,expected_id) in cases {
            let before=serde_json::to_value(&v).unwrap();
            let err=adapt_frontend_vehicle(&v,&o).unwrap_err();
            assert_eq!(serde_json::to_value(&v).unwrap(),before,"adapter mutated its input");
            assert_eq!(err.component_id.as_deref(),Some(expected_id),"{err:?}");
            assert!(err.component_index.is_some());
        }
    }
}
