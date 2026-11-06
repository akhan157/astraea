//! Aero-model provider for the built-up method and its approved hybrid.
//!
//! Two model identities exist, and only these pairs are valid:
//! - `1.0.0` + `buildup`: the method alone (its own transonic blend).
//! - `1.1.0` + `legacy`: the method with the legacy total-drag override over
//!   Mach 0.80-1.20 (C1 weight ramps; weights sum to one, so no double
//!   counting). The result is a **hybrid**, not the method-only model, and no
//!   component breakdown is published inside the band.
//!
//! `1.0.0` + `legacy` is the defective 1b identity: such a project must load
//! (so the user can choose a current model) but must never execute.
//!
//! Flight (`simulate_flight`) deliberately has no selection argument in this
//! build; its coefficients still come from the legacy path, so a flight must
//! never carry `aero-buildup` identity (the app refuses pre-run).
//!
//! The registry is closed and must match `src/application/aeroModel.ts`; the
//! test below reads that file so a version bump cannot land on one side only.

use astraea_core::aero::{AeroCurveResult, DragBreakdown, StabilityAnalysis, Vehicle};
use astraea_core::aero_model::design_from_app_vehicle;
use astraea_core::calibrated::{evaluate, CalibratedError, CpMethod, EvalOptions};
use serde::Deserialize;

pub const AERO_MODEL_ID: &str = "aero-buildup";
pub const AERO_MODEL_VERSION_METHOD_ONLY: &str = "1.0.0";
pub const AERO_MODEL_VERSION_COMPOSED: &str = "1.1.0";
/// Current model version written by the UI.
pub const AERO_MODEL_VERSION: &str = AERO_MODEL_VERSION_COMPOSED;
pub const AERO_TERM_SOURCES: [&str; 2] = ["legacy", "buildup"];
/// Composition band (part of model 1.1.0; changing it needs a version bump).
pub const TRANSONIC_BAND_LOW_MACH: f64 = 0.80;
pub const TRANSONIC_BAND_HIGH_MACH: f64 = 1.20;
/// Both models are evaluated at the reference state today's tables use.
pub const REFERENCE_ATMOSPHERE: &str = "sea-level standard day (ISA 1976)";

/// Mach used for the lowest grid point. The method is undefined at exactly
/// zero airspeed; the reported grid keeps 0 and this is the evaluation Mach.
const MIN_EVAL_MACH: f64 = 0.01;
/// Mach ceiling of the panel grid (matches the legacy curve range).
const CURVE_MAX_MACH: f64 = 4.0;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AeroTerms {
    pub transonic: String,
}

/// Wire shape of the selection; parsed strictly, validated against the registry.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct AeroModelSelection {
    pub model_id: String,
    pub model_version: String,
    pub terms: AeroTerms,
}

/// Validate a selection against this build's closed registry.
///
/// Version and term are a **pair**: `1.0.0` pairs with `buildup`, `1.1.0`
/// with `legacy`. The defective 1b pair (`1.0.0` + `legacy`) parses for
/// archive display but refuses to execute.
pub fn validate(selection: &AeroModelSelection) -> Result<(), String> {
    if selection.model_id != AERO_MODEL_ID {
        return Err(format!(
            "aero model '{}' is unknown to this build; replay refuses rather than substituting a model",
            selection.model_id
        ));
    }
    let version = selection.model_version.as_str();
    if version != AERO_MODEL_VERSION_METHOD_ONLY && version != AERO_MODEL_VERSION_COMPOSED {
        return Err(format!(
            "aero model {AERO_MODEL_ID} version '{version}' is unknown to this build (known: {AERO_MODEL_VERSION_METHOD_ONLY}, {AERO_MODEL_VERSION_COMPOSED}); replay refuses rather than substituting a model"
        ));
    }
    let term = selection.terms.transonic.as_str();
    if !AERO_TERM_SOURCES.contains(&term) {
        return Err(format!(
            "aero term source '{term}' must be one of {}",
            AERO_TERM_SOURCES.join(", ")
        ));
    }
    match (version, term) {
        (AERO_MODEL_VERSION_METHOD_ONLY, "buildup") | (AERO_MODEL_VERSION_COMPOSED, "legacy") => Ok(()),
        (AERO_MODEL_VERSION_METHOD_ONLY, "legacy") => Err(format!(
            "aero model {AERO_MODEL_ID} 1.0.0 with the legacy transonic term was saved by a build that never implemented the composition; it cannot run. Select the current model (1.1.0 + legacy) or the legacy aero model."
        )),
        (AERO_MODEL_VERSION_COMPOSED, "buildup") => Err(format!(
            "aero model {AERO_MODEL_ID} 1.1.0 with the method-only transonic term is undefined; 1.1.0 pairs with 'legacy'."
        )),
        _ => unreachable!("version and term were checked above"),
    }
}

fn eval_options(mach: f64) -> EvalOptions {
    EvalOptions {
        mach: mach.max(MIN_EVAL_MACH),
        alpha_deg: 0.0,
        method: CpMethod::Barrowman,
        nozzle_exit_in: Some(0.0),
        altitude_ft: Some(0.0),
        site: None,
    }
}

fn map_error(error: CalibratedError) -> String {
    match error {
        CalibratedError::Unsupported(message) => format!("aero model: {message}"),
        CalibratedError::Design(message) => format!("aero model: {message}"),
    }
}

/// Stability totals from the built-up method.
///
/// CNalpha is the method's 0–4° slope per radian and CP its matching 0–4°
/// station; both are the engine's stability pair. Mass, CG, length and
/// reference diameter are not aerodynamic outputs and come from the existing
/// rollup, so the panel stays physically consistent. Component contributions
/// are empty by construction: the method exposes a labelled breakdown in no
/// regime yet, and the panel must say so rather than invent labels.
pub fn stability(vehicle: &Vehicle) -> Result<StabilityAnalysis, String> {
    let design = design_from_app_vehicle(vehicle).map_err(map_error)?;
    let point = evaluate(&design, &eval_options(MIN_EVAL_MACH)).map_err(map_error)?;
    let mut analysis = astraea_core::aero::stability(vehicle)?;
    let cp_m = point.cp04_in * 0.0254;
    analysis.cp = cp_m;
    analysis.total_cna = point.cn_alpha04;
    analysis.static_margin_calibers = (cp_m - analysis.cg) / analysis.reference_diameter;
    analysis.is_stable = analysis.static_margin_calibers >= 1.0;
    analysis.is_over_stable = analysis.static_margin_calibers > 3.0;
    analysis.contributions.clear();
    Ok(analysis)
}

/// Curve values from the built-up method (or its approved hybrid).
#[derive(Clone, Debug)]
pub struct ProviderCurves {
    pub curves: AeroCurveResult,
    /// False when any grid point has no component breakdown (transonic points
    /// have none by construction; the hybrid publishes none inside the band).
    pub breakdown_available: bool,
    /// Present only for the composed `1.1.0` model.
    pub composition: Option<CompositionMeta>,
}

/// The hybrid's band, recorded with every composed curve.
#[derive(Clone, Copy, Debug)]
pub struct CompositionMeta {
    pub band_low_mach: f64,
    pub band_high_mach: f64,
    pub reference_atmosphere: &'static str,
}

fn smoothstep(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// C1 blend weight: 0 below 0.80, 1 on 0.90-1.05, 0 above 1.20.
pub fn transonic_weight(mach: f64) -> f64 {
    const LOW0: f64 = 0.80;
    const LOW1: f64 = 0.90;
    const HIGH0: f64 = 1.05;
    const HIGH1: f64 = 1.20;
    if mach <= LOW0 || mach >= HIGH1 {
        0.0
    } else if mach < LOW1 {
        smoothstep((mach - LOW0) / (LOW1 - LOW0))
    } else if mach <= HIGH0 {
        1.0
    } else {
        1.0 - smoothstep((mach - HIGH0) / (HIGH1 - HIGH0))
    }
}

/// Recompute the summary fields from a drag table.
fn summarize(drag_curves: Vec<DragBreakdown>) -> AeroCurveResult {
    let max = drag_curves
        .iter()
        .fold((f64::NEG_INFINITY, 0.0), |best, d| {
            if d.total_cd > best.0 { (d.total_cd, d.mach) } else { best }
        });
    let subsonic_cd = drag_curves.first().map_or(0.35, |d| d.total_cd);
    let supersonic_cd_mach2 = drag_curves
        .iter()
        .find(|d| (d.mach - 2.0).abs() < 0.1)
        .map_or(0.45, |d| d.total_cd);
    AeroCurveResult {
        mach_points: drag_curves.iter().map(|d| d.mach).collect(),
        drag_curves,
        max_transonic_cd: max.0,
        mach_at_max_cd: max.1,
        subsonic_cd,
        supersonic_cd_mach2,
    }
}

/// Drag/CP curves over the panel grid.
pub fn curves(vehicle: &Vehicle, powered: bool, points: usize) -> Result<ProviderCurves, String> {
    if points < 2 {
        return Err(format!("aero curves: point count must be at least 2 (got {points})"));
    }
    let design = design_from_app_vehicle(vehicle).map_err(map_error)?;
    let base = astraea_core::aero::stability(vehicle)?;
    let mut drag_curves = Vec::with_capacity(points);
    let mut breakdown_available = true;
    for index in 0..points {
        let mach = CURVE_MAX_MACH * index as f64 / (points - 1) as f64;
        let point = evaluate(&design, &eval_options(mach)).map_err(map_error)?;
        let cp_m = point.cp04_in * 0.0254;
        let (friction, wave, base_cd, protuberance) = match point.components {
            Some(c) => {
                let friction = c.body_friction
                    + c.fin_friction_pressure.unwrap_or(0.0)
                    + c.fin_friction_pressure_sup.unwrap_or(0.0);
                let wave = c.nose_wave.unwrap_or(0.0)
                    + c.body_pressure.unwrap_or(0.0)
                    + c.fin_interference
                    + c.fin_interference_sup.unwrap_or(0.0)
                    + c.fin_extra.unwrap_or(0.0);
                (friction, wave, c.body_base + c.fin_base, c.protuberance)
            }
            None => {
                // The method blends totals across the transonic band and
                // publishes no component split there. Zero placeholders would
                // be invented data, so the flag tells the panel to hide them.
                breakdown_available = false;
                (0.0, 0.0, 0.0, 0.0)
            }
        };
        let total_cd = if powered { point.cd_power_on } else { point.cd_power_off };
        drag_curves.push(DragBreakdown {
            mach,
            total_cd,
            friction_cd: friction,
            wave_cd: wave,
            base_cd,
            protuberance_cd: protuberance,
            cp: cp_m,
            static_margin_calibers: (cp_m - base.cg) / base.reference_diameter,
        });
    }
    Ok(ProviderCurves {
        curves: summarize(drag_curves),
        breakdown_available,
        composition: None,
    })
}

/// The approved hybrid: the method's total CD blended with the legacy total
/// over Mach 0.80-1.20. The weights sum to one at every point, so the
/// method's own transonic rise is weighted out inside the band rather than
/// added on top. No component split is published inside the band: mixing two
/// sources under a "built-up" label would be false.
pub fn composed_curves(vehicle: &Vehicle, powered: bool, points: usize) -> Result<ProviderCurves, String> {
    let mut provider = curves(vehicle, powered, points)?;
    let legacy = astraea_core::aero::compute_aerodynamic_curves(vehicle, powered, points)?;
    if legacy.drag_curves.len() != provider.curves.drag_curves.len() {
        return Err(format!(
            "composed curves: legacy grid has {} points, provider grid has {}",
            legacy.drag_curves.len(),
            provider.curves.drag_curves.len()
        ));
    }
    let mut breakdown_available = provider.breakdown_available;
    for (index, point) in provider.curves.drag_curves.iter_mut().enumerate() {
        let weight = transonic_weight(point.mach);
        if weight > 0.0 {
            let legacy_cd = legacy.drag_curves[index].total_cd;
            point.total_cd = (1.0 - weight) * point.total_cd + weight * legacy_cd;
            point.friction_cd = 0.0;
            point.wave_cd = 0.0;
            point.base_cd = 0.0;
            point.protuberance_cd = 0.0;
            breakdown_available = false;
        }
    }
    let drag = provider.curves.drag_curves.clone();
    provider.curves = summarize(drag);
    provider.breakdown_available = breakdown_available;
    provider.composition = Some(CompositionMeta {
        band_low_mach: TRANSONIC_BAND_LOW_MACH,
        band_high_mach: TRANSONIC_BAND_HIGH_MACH,
        reference_atmosphere: REFERENCE_ATMOSPHERE,
    });
    Ok(provider)
}

/// Scoped pre-run status: panels and flight are separate because this build
/// only wires the provider into the panel commands.
#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AeroModelStatus {
    pub panels: &'static str,
    pub flight: &'static str,
    pub reasons: Vec<String>,
    pub assumptions: Vec<String>,
}

/// Status for a selected model on this vehicle.
pub fn status(vehicle: &Vehicle, selection: &AeroModelSelection) -> Result<AeroModelStatus, String> {
    validate(selection)?;
    let support = astraea_core::aero_model::support(vehicle);
    let panels = match support.status {
        astraea_core::aero_model::AeroSupportStatus::Supported => "supported",
        astraea_core::aero_model::AeroSupportStatus::Fallback => "fallback",
        astraea_core::aero_model::AeroSupportStatus::Refused => "refused",
    };
    let mut reasons = support.reasons;
    let flight = if panels == "refused" {
        "refused"
    } else {
        reasons.push(
            "flight coefficients still come from the legacy path in this build; the built-up \
             method drives the stability and aero panels only"
                .to_string(),
        );
        "refused"
    };
    Ok(AeroModelStatus {
        panels,
        flight,
        reasons,
        assumptions: support.assumptions,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    fn alpha_vehicle() -> Vehicle {
        let value: Value = serde_json::from_str(include_str!("../tests/fixtures/alpha-vehicle.json"))
            .expect("alpha fixture");
        let fv: crate::models::FrontendVehicle = serde_json::from_value(value).expect("frontend");
        crate::models::to_aero_vehicle(&fv).expect("aero vehicle")
    }

    fn selection(version: &str, term: &str) -> AeroModelSelection {
        AeroModelSelection {
            model_id: AERO_MODEL_ID.into(),
            model_version: version.into(),
            terms: AeroTerms { transonic: term.into() },
        }
    }

    #[test]
    fn registry_enforces_version_term_pairs() {
        assert!(validate(&selection("1.0.0", "buildup")).is_ok());
        assert!(validate(&selection("1.1.0", "legacy")).is_ok());

        let defective = validate(&selection("1.0.0", "legacy")).unwrap_err();
        assert!(defective.contains("never implemented the composition"), "{defective}");
        let undefined = validate(&selection("1.1.0", "buildup")).unwrap_err();
        assert!(undefined.contains("undefined"), "{undefined}");
        let unknown_version = validate(&selection("9.9.9", "buildup")).unwrap_err();
        assert!(unknown_version.contains("refuses rather than substituting"), "{unknown_version}");
        let unknown_term = validate(&selection("1.1.0", "nope")).unwrap_err();
        assert!(unknown_term.contains("must be one of"), "{unknown_term}");
        let unknown_id = validate(&AeroModelSelection {
            model_id: "other".into(),
            model_version: "1.1.0".into(),
            terms: AeroTerms { transonic: "legacy".into() },
        })
        .unwrap_err();
        assert!(unknown_id.contains("unknown to this build"), "{unknown_id}");
    }

    #[test]
    fn registry_matches_the_application_typescript() {
        let ts = include_str!("../../../src/application/aeroModel.ts");
        assert!(ts.contains("AERO_MODEL_VERSION_METHOD_ONLY = '1.0.0'"), "TS method-only version drift");
        assert!(ts.contains("AERO_MODEL_VERSION = '1.1.0'"), "TS current version drift");
        assert!(ts.contains("['aero-buildup']"), "TS model id drift");
        assert!(ts.contains("['legacy', 'buildup']"), "TS term sources drift");
        assert!(ts.contains("AERO_MODEL_PAIRS"), "TS pair registry drift");
    }

    #[test]
    fn status_scopes_panels_and_flight() {
        let vehicle = alpha_vehicle();
        let report = status(&vehicle, &selection("1.1.0", "legacy")).expect("status");
        assert_eq!(report.panels, "supported");
        assert_eq!(report.flight, "refused");
        assert!(report.reasons.iter().any(|r| r.contains("legacy path")));
        assert_eq!(report.assumptions.len(), 3);
    }

    #[test]
    fn weight_is_c1_and_bounded() {
        assert_eq!(transonic_weight(TRANSONIC_BAND_LOW_MACH), 0.0);
        assert_eq!(transonic_weight(0.90), 1.0);
        assert_eq!(transonic_weight(1.05), 1.0);
        assert_eq!(transonic_weight(TRANSONIC_BAND_HIGH_MACH), 0.0);
        for mach in [0.5, 0.79, 0.85, 0.95, 1.10, 1.19, 1.5] {
            let w = transonic_weight(mach);
            assert!((0.0..=1.0).contains(&w), "weight out of range at {mach}: {w}");
        }
        // C1 seams: one-sided derivatives must agree at each band edge.
        let h = 1e-8;
        for seam in [0.80, 0.90, 1.05, 1.20] {
            let left = (transonic_weight(seam) - transonic_weight(seam - h)) / h;
            let right = (transonic_weight(seam + h) - transonic_weight(seam)) / h;
            assert!((left - right).abs() < 1e-5, "weight not C1 at {seam}: {left} vs {right}");
        }
    }

    #[test]
    fn composed_curve_blends_totals_and_withholds_the_breakdown() {
        let vehicle = alpha_vehicle();
        let method = curves(&vehicle, false, 41).expect("method");
        let composed = composed_curves(&vehicle, false, 41).expect("composed");
        let legacy =
            astraea_core::aero::compute_aerodynamic_curves(&vehicle, false, 41).expect("legacy");
        assert_eq!(composed.curves.drag_curves.len(), 41);
        let mut saw_inside = false;
        for (index, point) in composed.curves.drag_curves.iter().enumerate() {
            let weight = transonic_weight(point.mach);
            let expected = (1.0 - weight) * method.curves.drag_curves[index].total_cd
                + weight * legacy.drag_curves[index].total_cd;
            assert!(
                (point.total_cd - expected).abs() <= 1e-12,
                "M{}: composed {} != expected {}",
                point.mach,
                point.total_cd,
                expected
            );
            if weight == 0.0 {
                assert_eq!(point.total_cd, method.curves.drag_curves[index].total_cd);
            }
            if weight == 1.0 {
                saw_inside = true;
                assert!((point.total_cd - legacy.drag_curves[index].total_cd).abs() <= 1e-12);
            }
            if weight > 0.0 {
                assert_eq!(point.friction_cd, 0.0);
                assert_eq!(point.wave_cd, 0.0);
                assert_eq!(point.base_cd, 0.0);
                assert_eq!(point.protuberance_cd, 0.0);
            }
        }
        assert!(saw_inside, "the grid must include a point at weight 1");
        assert!(!composed.breakdown_available);
        let meta = composed.composition.expect("composition metadata");
        assert_eq!(meta.band_low_mach, TRANSONIC_BAND_LOW_MACH);
        assert_eq!(meta.band_high_mach, TRANSONIC_BAND_HIGH_MACH);
        assert_eq!(meta.reference_atmosphere, REFERENCE_ATMOSPHERE);
        assert!(method.composition.is_none(), "method-only curves carry no composition");
    }

    #[test]
    fn composed_curve_evidence() {
        let Some(out) = std::env::var_os("ASTRAEA_COMPOSITION_OUT") else {
            return;
        };
        let vehicle = alpha_vehicle();
        // 81 points (0.05 Mach) so every seam (0.80/0.90/1.05/1.20) is on the grid.
        let points = 81;
        let method = curves(&vehicle, false, points).expect("method");
        let legacy =
            astraea_core::aero::compute_aerodynamic_curves(&vehicle, false, points).expect("legacy");
        let composed = composed_curves(&vehicle, false, points).expect("composed");
        let weights: Vec<String> = (80..=120)
            .map(|i| {
                let mach = i as f64 / 100.0;
                format!("{{\"mach\":{mach},\"weight\":{:.15}}}", transonic_weight(mach))
            })
            .collect();
        let seams: Vec<String> = [0.80, 0.90, 1.05, 1.20]
            .iter()
            .map(|seam| {
                let seam = *seam;
                let index = composed
                    .curves
                    .drag_curves
                    .iter()
                    .position(|d| (d.mach - seam).abs() < 1e-9)
                    .expect("seam on grid");
                let prev = index.saturating_sub(1);
                let next = (index + 1).min(composed.curves.drag_curves.len() - 1);
                let left_dm = composed.curves.drag_curves[index].mach
                    - composed.curves.drag_curves[prev].mach;
                let right_dm = composed.curves.drag_curves[next].mach
                    - composed.curves.drag_curves[index].mach;
                let left = (composed.curves.drag_curves[index].total_cd
                    - composed.curves.drag_curves[prev].total_cd)
                    / left_dm;
                let right = (composed.curves.drag_curves[next].total_cd
                    - composed.curves.drag_curves[index].total_cd)
                    / right_dm;
                let h = 1e-8;
                let weight_left = (transonic_weight(seam) - transonic_weight(seam - h)) / h;
                let weight_right = (transonic_weight(seam + h) - transonic_weight(seam)) / h;
                format!(
                    "{{\"mach\":{seam},\"weight\":{:.15},\"composedCd\":{:.17},\"providerCd\":{:.17},\"legacyCd\":{:.17},\"leftSecant\":{:.6},\"rightSecant\":{:.6},\"weightLeftSlope\":{:.9},\"weightRightSlope\":{:.9}}}",
                    transonic_weight(seam),
                    composed.curves.drag_curves[index].total_cd,
                    method.curves.drag_curves[index].total_cd,
                    legacy.drag_curves[index].total_cd,
                    left,
                    right,
                    weight_left,
                    weight_right
                )
            })
            .collect();
        let body = format!(
            "{{\n  \"gate\":\"aero-model composition 1.1.0\",\n  \"band\":{{\"lowMach\":{},\"highMach\":{}}},\n  \"referenceAtmosphere\":\"{}\",\n  \"weights\":[{}],\n  \"seams\":[{}]\n}}\n",
            TRANSONIC_BAND_LOW_MACH,
            TRANSONIC_BAND_HIGH_MACH,
            REFERENCE_ATMOSPHERE,
            weights.join(","),
            seams.join(",")
        );
        let path = std::path::PathBuf::from(out);
        std::fs::write(&path, body).unwrap_or_else(|e| panic!("write {}: {e}", path.display()));
        let csv_path = path.with_extension("csv");
        let mut csv = String::from("mach,providerCd,legacyCd,composedCd,weight\n");
        for (index, point) in composed.curves.drag_curves.iter().enumerate() {
            csv.push_str(&format!(
                "{},{:.17},{:.17},{:.17},{:.15}\n",
                point.mach,
                method.curves.drag_curves[index].total_cd,
                legacy.drag_curves[index].total_cd,
                point.total_cd,
                transonic_weight(point.mach)
            ));
        }
        std::fs::write(&csv_path, csv)
            .unwrap_or_else(|e| panic!("write {}: {e}", csv_path.display()));
    }

    #[test]
    fn stability_totals_use_radians_and_axial_metres() {
        let vehicle = alpha_vehicle();
        let s = stability(&vehicle).expect("provider");
        let design = design_from_app_vehicle(&vehicle).expect("design");
        let alpha_rad = 4.0 * 3.14159 / 180.0;
        let at4 = evaluate(
            &design,
            &EvalOptions {
                mach: MIN_EVAL_MACH,
                alpha_deg: 4.0,
                method: CpMethod::Barrowman,
                nozzle_exit_in: Some(0.0),
                altitude_ft: Some(0.0),
                site: None,
            },
        )
        .expect("alpha 4");
        let endpoint_slope = at4.cn / alpha_rad;
        assert!(
            (s.total_cna - endpoint_slope).abs() / endpoint_slope < 0.02,
            "CNalpha must be per radian: {} vs {}",
            s.total_cna,
            endpoint_slope
        );
        assert!(s.cp > 0.0 && s.cp < s.total_length, "CP must be an axial station");
        assert!(
            (s.static_margin_calibers - (s.cp - s.cg) / s.reference_diameter).abs() < 1e-12,
            "margin must use (cp - cg) / referenceDiameter"
        );
    }

    #[test]
    fn stability_uses_provider_totals_and_no_contributions() {
        let vehicle = alpha_vehicle();
        let legacy = astraea_core::aero::stability(&vehicle).expect("legacy");
        let provider = stability(&vehicle).expect("provider");
        assert!(provider.cp.is_finite() && provider.cp > 0.0);
        assert!(provider.total_cna.is_finite() && provider.total_cna > 0.0);
        assert!(provider.contributions.is_empty());
        assert!((provider.cp - legacy.cp).abs() > 0.0, "provider must not equal legacy");
        assert_eq!(provider.total_length, legacy.total_length);
        assert_eq!(provider.reference_diameter, legacy.reference_diameter);
    }

    #[test]
    fn curves_cover_the_grid_and_name_breakdown_availability() {
        let vehicle = alpha_vehicle();
        let result = curves(&vehicle, false, 41).expect("curves");
        assert_eq!(result.curves.mach_points.len(), 41);
        assert_eq!(result.curves.drag_curves.len(), 41);
        assert!(result.curves.drag_curves.iter().all(|d| d.total_cd.is_finite() && d.total_cd > 0.0));
        assert!(result.curves.drag_curves.iter().all(|d| d.cp.is_finite()));
        assert!(!result.breakdown_available, "transonic points have no breakdown");
    }
}
