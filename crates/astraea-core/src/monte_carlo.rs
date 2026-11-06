//! Monte Carlo dispersion engine — Rust port of `src/sim/monteCarlo.ts`.
//!
//! The TS frontend is the untouched oracle. RNG / statistics parity is
//! verified by the `#[cfg(test)]` suite below against oracle values
//! extracted with `node -e` one-liners (never hand-invented).
//!
//! Trajectory coupling is via an injected closure so sixDof plugs in later:
//! [`run_ensemble`] takes `fly: &dyn Fn(&PerturbedParams) -> Result<LandingPoint, String>`.
//! The only trajectory-side dependency is the shared launch-rail domain
//! constants; the solver itself stays injected.

use crate::six_dof::{RAIL_ELEVATION_MAX_DEG, RAIL_ELEVATION_MIN_DEG};
use std::f64::consts::PI;

pub const DEFAULT_WIND_AZIMUTH_DEG: f64 = 90.0;
pub const DEFAULT_RAIL_ELEVATION_DEG: f64 = 85.0;
const STRIDE_I64: i64 = 0x9e3779b9;

/// Per-run landing offset from the launch pad: East (x), North (y), meters.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct LandingPoint {
    pub x: f64,
    pub y: f64,
}

/// Minimal perturbed trajectory input (module-local; no cross-module deps).
#[derive(Clone, Debug, PartialEq)]
pub struct PerturbedParams {
    pub wind_azimuth_deg: Option<f64>,
    pub rail_elevation_deg: Option<f64>,
    pub impulse_scale: f64,
}

impl Default for PerturbedParams {
    fn default() -> Self {
        Self {
            wind_azimuth_deg: None,
            rail_elevation_deg: None,
            impulse_scale: 1.0,
        }
    }
}

/// 1σ spread of each Gaussian perturbation. Zero leaves the field untouched.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PerturbationSigmas {
    pub wind_azimuth_deg_sigma: f64,
    pub rail_angle_deg_sigma: f64,
    pub impulse_pct_sigma: f64,
}

impl Default for PerturbationSigmas {
    fn default() -> Self {
        Self {
            wind_azimuth_deg_sigma: 0.0,
            rail_angle_deg_sigma: 0.0,
            impulse_pct_sigma: 0.0,
        }
    }
}

/// Symmetric 2x2 covariance matrix of the landing cloud (East, North).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Covariance2x2 {
    pub xx: f64,
    pub xy: f64,
    pub yy: f64,
}

/// Circular containment radii about the mean, from the empirical radial CDF.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ContainmentRadii {
    pub r50: f64,
    pub r90: f64,
    pub r99: f64,
}

/// Reduced dispersion statistics for a landing cloud.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct DispersionStatistics {
    pub mean: LandingPoint,
    pub covariance: Covariance2x2,
    pub sigma1: f64,
    pub sigma2: f64,
    pub theta_deg: f64,
    pub containment: ContainmentRadii,
}

#[derive(Clone, Debug, PartialEq)]
pub struct DispersionResult {
    pub mean: LandingPoint,
    pub covariance: Covariance2x2,
    pub sigma1: f64,
    pub sigma2: f64,
    pub theta_deg: f64,
    pub containment: ContainmentRadii,
    pub landings: Vec<LandingPoint>,
    pub successful_runs: i64,
    pub failed_runs: i64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SamplingVersion {
    Legacy,
    PerRunV2,
}

pub fn parse_sampling_version(s: &str) -> Result<SamplingVersion, String> {
    match s {
        "legacy-sequential-v1" => Ok(SamplingVersion::Legacy),
        "per-run-v2" => Ok(SamplingVersion::PerRunV2),
        _ => Err(format!("runMonteCarlo: unknown sampling version '{s}'")),
    }
}

/// Result of one chunk of a Monte Carlo ensemble (worker contract).
#[derive(Clone, Debug, PartialEq)]
pub struct ChunkResult {
    pub run_start: i64,
    pub run_end: i64,
    pub landings: Vec<LandingPoint>,
    pub failed_runs: i64,
    pub first_failure: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Accumulated {
    pub landings: Vec<LandingPoint>,
    pub failed_runs: i64,
    pub first_failure: Option<String>,
}

/// One trajectory result as returned by the classified ensemble closure.
///
/// The fields mirror the native `SimulationResult` classification exactly;
/// this module derives an outcome label but never renames or enriches the
/// native validity, envelope, touchdown or termination vocabulary.
#[derive(Clone, Debug, PartialEq)]
pub struct RunObservation {
    pub endpoint: LandingPoint,
    pub terminated: bool,
    pub termination_reason: String,
    pub touchdown_nominal: bool,
    pub validity: String,
    pub enveloped: bool,
    pub off_nominal_excursion: bool,
}

/// Derived outcome label for one requested absolute run index.
///
/// `Supported` means native validity `PASS` + declared Mach/alpha envelope +
/// touchdown-nominal only. It is not empirical qualification, recovery
/// success or physical probability. `ComputationalFailure` is only an engine
/// error or a non-finite endpoint; it never reclassifies a physics/support
/// result.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RunOutcomeClass {
    SupportedNominalTerminal,
    UnsupportedNominalTouchdown,
    NonNominalImpact,
    TimeLimitEndpoint,
    ComputationalFailure,
}

impl RunOutcomeClass {
    pub fn as_str(self) -> &'static str {
        match self {
            RunOutcomeClass::SupportedNominalTerminal => "supported-nominal-terminal",
            RunOutcomeClass::UnsupportedNominalTouchdown => "unsupported-nominal-touchdown",
            RunOutcomeClass::NonNominalImpact => "non-nominal-impact",
            RunOutcomeClass::TimeLimitEndpoint => "time-limit-endpoint",
            RunOutcomeClass::ComputationalFailure => "computational-failure",
        }
    }
}

/// One requested run's classified ledger entry. Native fields are `None` only
/// when they are genuinely unknown (a computational failure with no result).
#[derive(Clone, Debug, PartialEq)]
pub struct ClassifiedRun {
    pub run_index: i64,
    pub outcome: RunOutcomeClass,
    pub endpoint: Option<LandingPoint>,
    pub terminated: Option<bool>,
    pub termination_reason: Option<String>,
    pub touchdown_nominal: Option<bool>,
    pub validity: Option<String>,
    pub enveloped: Option<bool>,
    pub off_nominal_excursion: Option<bool>,
    pub failure_message: Option<String>,
}

/// Denominator counts for one classified ensemble. All five outcome counts
/// are always present; `requested == classified` for a complete ensemble.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct OutcomeCounts {
    pub requested: i64,
    pub supported_nominal_terminal: i64,
    pub unsupported_nominal_touchdown: i64,
    pub non_nominal_impact: i64,
    pub time_limit_endpoint: i64,
    pub computational_failure: i64,
}

impl OutcomeCounts {
    pub fn from_runs(runs: &[ClassifiedRun], requested: i64) -> Self {
        let mut counts = Self { requested, ..Self::default() };
        for run in runs {
            match run.outcome {
                RunOutcomeClass::SupportedNominalTerminal => counts.supported_nominal_terminal += 1,
                RunOutcomeClass::UnsupportedNominalTouchdown => counts.unsupported_nominal_touchdown += 1,
                RunOutcomeClass::NonNominalImpact => counts.non_nominal_impact += 1,
                RunOutcomeClass::TimeLimitEndpoint => counts.time_limit_endpoint += 1,
                RunOutcomeClass::ComputationalFailure => counts.computational_failure += 1,
            }
        }
        counts
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct IndexedEndpoint {
    pub run_index: i64,
    pub point: LandingPoint,
}

/// One absolute range of classified runs (worker contract).
#[derive(Clone, Debug, PartialEq)]
pub struct ClassifiedChunk {
    pub run_start: i64,
    pub run_end: i64,
    pub runs: Vec<ClassifiedRun>,
}

/// Complete classified ensemble. `landings` keeps the legacy meaning: every
/// finite endpoint in absolute index order, including time-limit and
/// unsupported endpoints. `eligible_endpoints` is the strict footprint
/// denominator (supported nominal terminals only). Statistics are absent when
/// that denominator is zero; they are never zero-filled.
#[derive(Clone, Debug, PartialEq)]
pub struct ClassifiedDispersionResult {
    pub requested_runs: i64,
    pub runs: Vec<ClassifiedRun>,
    pub counts: OutcomeCounts,
    pub landings: Vec<LandingPoint>,
    pub endpoints: Vec<IndexedEndpoint>,
    pub eligible_endpoints: Vec<IndexedEndpoint>,
    pub successful_runs: i64,
    pub failed_runs: i64,
    pub statistics_available: bool,
    pub statistics: Option<DispersionStatistics>,
}

// ---------------------------------------------------------------------------
// RNG
// ---------------------------------------------------------------------------

/// mulberry32 — 32-bit seeded PRNG returning uniform doubles on [0, 1).
///
/// State arithmetic mirrors the oracle's BigInt implementation with exact
/// mod-2^32 wrapping (`wrapping_add` / `wrapping_mul` on `u32`).
/// The seed is `i64` so every representable seed is an integer by
/// construction; the JS non-integer-throw path has no Rust counterpart.
#[derive(Clone, Debug)]
pub struct Mulberry32 {
    state: u32,
}

impl Mulberry32 {
    pub fn new(seed: i64) -> Self {
        Self { state: seed as u32 }
    }

    pub fn next(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b79f5);
        let mut v = self.state;
        v ^= v >> 15;
        v = v.wrapping_mul(0x2c1b3c6d);
        v ^= v >> 12;
        v = v.wrapping_mul(0x297a2d39);
        v ^= v >> 15;
        (v as f64) / 4294967296.0
    }
}

/// Standard normal sample via Box-Muller. Consumes exactly two uniforms;
/// `1 - rng()` maps [0, 1) onto (0, 1] so `ln(0)` can never occur.
pub fn gaussian(rng: &mut Mulberry32) -> f64 {
    let u1 = 1.0 - rng.next();
    let u2 = rng.next();
    (-2.0 * u1.ln()).sqrt() * (2.0 * PI * u2).cos()
}

/// Per-run sub-seed: `masterSeed + runIndex * STRIDE` with wrapping `i64`
/// arithmetic (may exceed i32 — the TS oracle returns the full double).
pub fn sub_seed_of(master_seed: i64, run_index: i64) -> i64 {
    master_seed.wrapping_add(run_index.wrapping_mul(STRIDE_I64))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// JS-style number rendering for error strings (`Infinity`, not `inf`).
fn js_num(v: f64) -> String {
    if v.is_nan() {
        "NaN".to_string()
    } else if v == f64::INFINITY {
        "Infinity".to_string()
    } else if v == f64::NEG_INFINITY {
        "-Infinity".to_string()
    } else if v == 0.0 {
        "0".to_string()
    } else {
        format!("{v}")
    }
}

/// Nearest-rank index for percentile `pct` over `n` sorted samples.
fn percentile_index(n: usize, pct: f64) -> usize {
    let idx = ((pct / 100.0) * n as f64).ceil() as i64 - 1;
    idx.clamp(0, n as i64 - 1) as usize
}

fn nan_stats() -> DispersionStatistics {
    DispersionStatistics {
        mean: LandingPoint { x: f64::NAN, y: f64::NAN },
        covariance: Covariance2x2 { xx: f64::NAN, xy: f64::NAN, yy: f64::NAN },
        sigma1: f64::NAN,
        sigma2: f64::NAN,
        theta_deg: f64::NAN,
        containment: ContainmentRadii { r50: f64::NAN, r90: f64::NAN, r99: f64::NAN },
    }
}

/// Reduces a landing cloud into dispersion statistics.
/// Empty cloud => all-NaN stats; single sample => zero spread at the sample.
/// Any non-finite coordinate is rejected fail-closed.
pub fn compute_dispersion_statistics(
    landings: &[LandingPoint],
) -> Result<DispersionStatistics, String> {
    let n = landings.len();
    if n == 0 {
        return Ok(nan_stats());
    }
    for p in landings {
        if !p.x.is_finite() || !p.y.is_finite() {
            return Err(format!(
                "computeDispersionStatistics: landing point must be finite (got x={}, y={})",
                js_num(p.x),
                js_num(p.y)
            ));
        }
    }
    let (mut sx, mut sy) = (0.0_f64, 0.0_f64);
    for p in landings {
        sx += p.x;
        sy += p.y;
    }
    let mean = LandingPoint { x: sx / n as f64, y: sy / n as f64 };
    if n == 1 {
        return Ok(DispersionStatistics {
            mean,
            covariance: Covariance2x2 { xx: 0.0, xy: 0.0, yy: 0.0 },
            sigma1: 0.0,
            sigma2: 0.0,
            theta_deg: 0.0,
            containment: ContainmentRadii { r50: 0.0, r90: 0.0, r99: 0.0 },
        });
    }
    let (mut ax2, mut axy, mut ay2) = (0.0_f64, 0.0_f64, 0.0_f64);
    for p in landings {
        let dx = p.x - mean.x;
        let dy = p.y - mean.y;
        ax2 += dx * dx;
        axy += dx * dy;
        ay2 += dy * dy;
    }
    let inv = 1.0 / (n as f64 - 1.0);
    let (xx, xy, yy) = (ax2 * inv, axy * inv, ay2 * inv);

    let mid = (xx - yy) / 2.0;
    let hyp = (mid * mid + xy * xy).sqrt();
    let lambda1 = (xx + yy) / 2.0 + hyp;
    let lambda2 = (xx + yy) / 2.0 - hyp;
    let sigma1 = lambda1.max(0.0).sqrt();
    let sigma2 = lambda2.max(0.0).sqrt();
    let theta_deg = (0.5 * (2.0 * xy).atan2(xx - yy)) * (180.0 / PI);

    let mut dist: Vec<f64> = landings
        .iter()
        .map(|p| (p.x - mean.x).hypot(p.y - mean.y))
        .collect();
    dist.sort_by(|a, b| a.total_cmp(b));
    let containment = ContainmentRadii {
        r50: dist[percentile_index(n, 50.0)],
        r90: dist[percentile_index(n, 90.0)],
        r99: dist[percentile_index(n, 99.0)],
    };
    Ok(DispersionStatistics {
        mean,
        covariance: Covariance2x2 { xx, xy, yy },
        sigma1,
        sigma2,
        theta_deg,
        containment,
    })
}

fn validate_sigmas(sigmas: &PerturbationSigmas) -> Result<(), String> {
    for (name, value) in [
        ("windAzimuthDegSigma", sigmas.wind_azimuth_deg_sigma),
        ("railAngleDegSigma", sigmas.rail_angle_deg_sigma),
        ("impulsePctSigma", sigmas.impulse_pct_sigma),
    ] {
        if !value.is_finite() || value < 0.0 {
            return Err(format!(
                "runMonteCarlo: {name} must be a finite nonnegative number (got {})",
                js_num(value)
            ));
        }
    }
    Ok(())
}

/// Folds a sampled rail elevation into the solver's declared domain by
/// reflecting it about the bound it crossed. Values already inside the domain
/// are returned unchanged, so a seeded sample away from a bound is
/// bit-identical to the unclamped sampler. A reflection that overshoots the
/// opposite bound (only reachable when the spread exceeds the 10° half-width)
/// folds again, so domain membership is unconditional.
///
/// At a nominal sitting on a bound this is the exact Gaussian conditioned on
/// the domain: at 90° the samples are `90 - sigma*|z|`, a half-normal. It
/// therefore introduces no point mass and no duplicate rail angle at the
/// bound, unlike clamping.
fn fold_rail_elevation_deg(value: f64) -> f64 {
    if (RAIL_ELEVATION_MIN_DEG..=RAIL_ELEVATION_MAX_DEG).contains(&value) {
        return value;
    }
    let span = RAIL_ELEVATION_MAX_DEG - RAIL_ELEVATION_MIN_DEG;
    let period = 2.0 * span;
    let mut offset = (value - RAIL_ELEVATION_MIN_DEG) % period;
    if offset < 0.0 {
        offset += period;
    }
    if offset > span {
        offset = period - offset;
    }
    RAIL_ELEVATION_MIN_DEG + offset
}

/// Deep-clones `base` and applies one Gaussian perturbation per active
/// sigma, consuming exactly two uniforms per active perturbation in the
/// fixed order wind-azimuth → rail-elevation → impulse. The rail draw is
/// folded into the solver's declared elevation domain after the draw; the
/// fold consumes no uniform, so every other parameter and the following
/// stream state are unchanged. Because the draw count, order and per-run
/// sub-seed mapping are untouched, the sampling-version identity
/// (`legacy-sequential-v1` / `per-run-v2`) is unchanged; seeded samples away
/// from a bound replay bit-for-bit.
pub fn apply_perturbations(
    base: &PerturbedParams,
    sigmas: &PerturbationSigmas,
    rng: &mut Mulberry32,
) -> PerturbedParams {
    let mut out = base.clone();
    if sigmas.wind_azimuth_deg_sigma > 0.0 {
        let z = gaussian(rng);
        let b = out.wind_azimuth_deg.unwrap_or(DEFAULT_WIND_AZIMUTH_DEG);
        out.wind_azimuth_deg = Some(b + z * sigmas.wind_azimuth_deg_sigma);
    }
    if sigmas.rail_angle_deg_sigma > 0.0 {
        let z = gaussian(rng);
        let b = out.rail_elevation_deg.unwrap_or(DEFAULT_RAIL_ELEVATION_DEG);
        let sampled = b + z * sigmas.rail_angle_deg_sigma;
        // Fold noise excursions into the solver domain, but never repair an
        // out-of-domain nominal: that is an input error and must stay visible
        // to the solver's fail-closed validation.
        out.rail_elevation_deg = Some(
            if (RAIL_ELEVATION_MIN_DEG..=RAIL_ELEVATION_MAX_DEG).contains(&b) {
                fold_rail_elevation_deg(sampled)
            } else {
                sampled
            },
        );
    }
    if sigmas.impulse_pct_sigma > 0.0 {
        let z = gaussian(rng);
        let scale = 1.0 + (sigmas.impulse_pct_sigma / 100.0) * z;
        out.impulse_scale *= scale;
    }
    out
}

fn run_single_landing(
    base: &PerturbedParams,
    sigmas: &PerturbationSigmas,
    rng: &mut Mulberry32,
    run_label: &str,
    fly: &dyn Fn(&PerturbedParams) -> Result<LandingPoint, String>,
) -> (Option<LandingPoint>, Option<String>) {
    let input = apply_perturbations(base, sigmas, rng);
    match fly(&input) {
        Ok(landing) => {
            if !landing.x.is_finite() || !landing.y.is_finite() {
                (
                    None,
                    Some(format!(
                        "runMonteCarlo: {run_label} produced a non-finite landing (x={}, y={})",
                        js_num(landing.x),
                        js_num(landing.y)
                    )),
                )
            } else {
                (Some(landing), None)
            }
        }
        Err(msg) => (None, Some(msg)),
    }
}

fn stats_to_result(stats: DispersionStatistics, landings: Vec<LandingPoint>, failed_runs: i64) -> DispersionResult {
    DispersionResult {
        mean: stats.mean,
        covariance: stats.covariance,
        sigma1: stats.sigma1,
        sigma2: stats.sigma2,
        theta_deg: stats.theta_deg,
        containment: stats.containment,
        successful_runs: landings.len() as i64,
        failed_runs,
        landings,
    }
}

// ---------------------------------------------------------------------------
// Ensemble API
// ---------------------------------------------------------------------------

/// Monte Carlo dispersion over an injected trajectory closure.
///
/// `version = Legacy` replays the original single sequential stream;
/// `PerRunV2` derives each run's stream from
/// `mulberry32(sub_seed_of(seed, absoluteIndex))` so any chunk partition
/// reproduces the identical ensemble run for run.
pub fn run_ensemble(
    base: &PerturbedParams,
    sigmas: &PerturbationSigmas,
    n_runs: i64,
    seed: i64,
    version: SamplingVersion,
    fly: &dyn Fn(&PerturbedParams) -> Result<LandingPoint, String>,
) -> Result<DispersionResult, String> {
    if n_runs < 1 {
        return Err(format!(
            "runMonteCarlo: nRuns must be a positive integer (got {n_runs})"
        ));
    }
    if version == SamplingVersion::PerRunV2 {
        let chunk = run_chunk(base, sigmas, n_runs, seed, 0, n_runs, fly)?;
        return finalize_chunks(std::slice::from_ref(&chunk), n_runs);
    }
    validate_sigmas(sigmas)?;
    let mut rng = Mulberry32::new(seed);
    let mut landings: Vec<LandingPoint> = Vec::new();
    let mut failed_runs: i64 = 0;
    let mut first_failure: Option<String> = None;
    for i in 0..n_runs {
        let label = format!("run {}/{n_runs}", i + 1);
        let (landing, failure) = run_single_landing(base, sigmas, &mut rng, &label, fly);
        match landing {
            Some(p) => landings.push(p),
            None => {
                failed_runs += 1;
                if first_failure.is_none() {
                    first_failure = failure;
                }
            }
        }
    }
    if failed_runs == n_runs {
        if let Some(msg) = first_failure {
            return Err(format!(
                "runMonteCarlo: all {n_runs} runs failed; first failure: {msg}"
            ));
        }
    }
    let stats = compute_dispersion_statistics(&landings)?;
    Ok(stats_to_result(stats, landings, failed_runs))
}

/// Runs one absolute run range `[run_start, run_end)` of an `n_runs`-run
/// `per-run-v2` ensemble. Chunks never throw per-run failures: they are
/// counted in the result. An empty range yields an empty result.
pub fn run_chunk(
    base: &PerturbedParams,
    sigmas: &PerturbationSigmas,
    n_runs: i64,
    seed: i64,
    run_start: i64,
    run_end: i64,
    fly: &dyn Fn(&PerturbedParams) -> Result<LandingPoint, String>,
) -> Result<ChunkResult, String> {
    if n_runs < 1 {
        return Err(format!(
            "runMonteCarloChunk: nRuns must be a positive integer (got {n_runs})"
        ));
    }
    if run_start < 0 || run_start > n_runs {
        return Err(format!(
            "runMonteCarloChunk: runStart must be an integer in [0, nRuns] (got {run_start})"
        ));
    }
    if run_end < run_start || run_end > n_runs {
        return Err(format!(
            "runMonteCarloChunk: runEnd must be an integer in [runStart, nRuns] (got {run_end})"
        ));
    }
    // NB: the oracle's chunk path shares validateSigmas, so sigma errors
    // keep the `runMonteCarlo:` prefix on both paths.
    validate_sigmas(sigmas)?;
    let mut landings: Vec<LandingPoint> = Vec::new();
    let mut failed_runs: i64 = 0;
    let mut first_failure: Option<String> = None;
    for i in run_start..run_end {
        let mut rng = Mulberry32::new(sub_seed_of(seed, i));
        let label = format!("run {}/{n_runs}", i + 1);
        let (landing, failure) = run_single_landing(base, sigmas, &mut rng, &label, fly);
        match landing {
            Some(p) => landings.push(p),
            None => {
                failed_runs += 1;
                if first_failure.is_none() {
                    first_failure = failure;
                }
            }
        }
    }
    Ok(ChunkResult { run_start, run_end, landings, failed_runs, first_failure })
}

/// Merges chunk results into one ordered landing cloud (sorted by
/// `run_start` so late/out-of-order worker replies cannot scramble run
/// order) with reconciled failure bookkeeping. Pure accumulation.
pub fn accumulate_chunks(chunks: &[ChunkResult]) -> Accumulated {
    let mut ordered: Vec<&ChunkResult> = chunks.iter().collect();
    ordered.sort_by_key(|c| c.run_start);
    let mut landings: Vec<LandingPoint> = Vec::new();
    let mut failed_runs: i64 = 0;
    let mut first_failure: Option<String> = None;
    for c in ordered {
        landings.extend_from_slice(&c.landings);
        failed_runs += c.failed_runs;
        if first_failure.is_none() {
            first_failure = c.first_failure.clone();
        }
    }
    Accumulated { landings, failed_runs, first_failure }
}

/// Finalizes an ensemble from its chunks: accumulation plus the all-failed
/// fail-closed gate and dispersion reduction.
pub fn finalize_chunks(
    chunks: &[ChunkResult],
    n_runs: i64,
) -> Result<DispersionResult, String> {
    let acc = accumulate_chunks(chunks);
    if acc.failed_runs == n_runs {
        if let Some(msg) = acc.first_failure {
            return Err(format!(
                "runMonteCarlo: all {n_runs} runs failed; first failure: {msg}"
            ));
        }
    }
    let stats = compute_dispersion_statistics(&acc.landings)?;
    Ok(stats_to_result(stats, acc.landings, acc.failed_runs))
}

// ---------------------------------------------------------------------------
// Classified outcome ledger
// ---------------------------------------------------------------------------

/// Derives the explicit outcome label from the carried native semantics.
///
/// Priority: computational failure (handled by the caller, no observation),
/// time-limit endpoint, non-nominal impact, unsupported nominal touchdown,
/// then supported nominal terminal. A timeout terminal position is never a
/// landing, and a finite endpoint alone is never evidence of support.
pub fn classify_observation(obs: &RunObservation) -> RunOutcomeClass {
    if obs.termination_reason == "timeout" || !obs.terminated {
        RunOutcomeClass::TimeLimitEndpoint
    } else if !obs.touchdown_nominal {
        RunOutcomeClass::NonNominalImpact
    } else if obs.validity == "PASS" && obs.enveloped && !obs.off_nominal_excursion {
        RunOutcomeClass::SupportedNominalTerminal
    } else {
        RunOutcomeClass::UnsupportedNominalTouchdown
    }
}

fn classified_from_observation(index: i64, obs: RunObservation) -> ClassifiedRun {
    ClassifiedRun {
        run_index: index,
        outcome: classify_observation(&obs),
        endpoint: Some(obs.endpoint),
        terminated: Some(obs.terminated),
        termination_reason: Some(obs.termination_reason),
        touchdown_nominal: Some(obs.touchdown_nominal),
        validity: Some(obs.validity),
        enveloped: Some(obs.enveloped),
        off_nominal_excursion: Some(obs.off_nominal_excursion),
        failure_message: None,
    }
}

fn computational_failure(index: i64, message: String) -> ClassifiedRun {
    ClassifiedRun {
        run_index: index,
        outcome: RunOutcomeClass::ComputationalFailure,
        endpoint: None,
        terminated: None,
        termination_reason: None,
        touchdown_nominal: None,
        validity: None,
        enveloped: None,
        off_nominal_excursion: None,
        failure_message: Some(message),
    }
}

fn run_single_classified(
    base: &PerturbedParams,
    sigmas: &PerturbationSigmas,
    rng: &mut Mulberry32,
    run_index: i64,
    run_label: &str,
    fly: &dyn Fn(&PerturbedParams) -> Result<RunObservation, String>,
) -> ClassifiedRun {
    let input = apply_perturbations(base, sigmas, rng);
    match fly(&input) {
        Ok(obs) => {
            if !obs.endpoint.x.is_finite() || !obs.endpoint.y.is_finite() {
                computational_failure(
                    run_index,
                    format!(
                        "runMonteCarlo: {run_label} produced a non-finite landing (x={}, y={})",
                        js_num(obs.endpoint.x),
                        js_num(obs.endpoint.y)
                    ),
                )
            } else {
                classified_from_observation(run_index, obs)
            }
        }
        Err(msg) => computational_failure(run_index, msg),
    }
}

fn build_classified_result(
    runs: Vec<ClassifiedRun>,
    requested_runs: i64,
) -> Result<ClassifiedDispersionResult, String> {
    let counts = OutcomeCounts::from_runs(&runs, requested_runs);
    let landings: Vec<LandingPoint> = runs.iter().filter_map(|r| r.endpoint).collect();
    let endpoints: Vec<IndexedEndpoint> = runs
        .iter()
        .filter_map(|r| r.endpoint.map(|point| IndexedEndpoint { run_index: r.run_index, point }))
        .collect();
    let eligible_endpoints: Vec<IndexedEndpoint> = runs
        .iter()
        .filter(|r| r.outcome == RunOutcomeClass::SupportedNominalTerminal)
        .filter_map(|r| r.endpoint.map(|point| IndexedEndpoint { run_index: r.run_index, point }))
        .collect();
    let eligible_points: Vec<LandingPoint> = eligible_endpoints.iter().map(|e| e.point).collect();
    let statistics = if eligible_points.is_empty() {
        None
    } else {
        Some(compute_dispersion_statistics(&eligible_points)?)
    };
    Ok(ClassifiedDispersionResult {
        requested_runs,
        counts,
        landings: landings.clone(),
        endpoints,
        eligible_endpoints,
        successful_runs: landings.len() as i64,
        failed_runs: counts.computational_failure,
        statistics_available: statistics.is_some(),
        statistics,
        runs,
    })
}

/// Runs one absolute run range `[run_start, run_end)` of a classified
/// ensemble. Every requested index yields one ledger entry; per-run engine
/// errors and non-finite endpoints are recorded as `ComputationalFailure`
/// rather than thrown. The RNG stream and absolute-index partition are
/// identical to [`run_chunk`].
pub fn run_chunk_classified(
    base: &PerturbedParams,
    sigmas: &PerturbationSigmas,
    n_runs: i64,
    seed: i64,
    run_start: i64,
    run_end: i64,
    fly: &dyn Fn(&PerturbedParams) -> Result<RunObservation, String>,
) -> Result<ClassifiedChunk, String> {
    if n_runs < 1 {
        return Err(format!(
            "runMonteCarloChunk: nRuns must be a positive integer (got {n_runs})"
        ));
    }
    if run_start < 0 || run_start > n_runs {
        return Err(format!(
            "runMonteCarloChunk: runStart must be an integer in [0, nRuns] (got {run_start})"
        ));
    }
    if run_end < run_start || run_end > n_runs {
        return Err(format!(
            "runMonteCarloChunk: runEnd must be an integer in [runStart, nRuns] (got {run_end})"
        ));
    }
    validate_sigmas(sigmas)?;
    let mut runs: Vec<ClassifiedRun> = Vec::with_capacity((run_end - run_start) as usize);
    for i in run_start..run_end {
        let mut rng = Mulberry32::new(sub_seed_of(seed, i));
        let label = format!("run {}/{n_runs}", i + 1);
        runs.push(run_single_classified(base, sigmas, &mut rng, i, &label, fly));
    }
    Ok(ClassifiedChunk { run_start, run_end, runs })
}

/// Finalizes classified chunks only when their absolute ranges cover
/// `[0, n_runs)` exactly once. Missing, duplicate, overlapping or mismatched
/// per-index records are rejected, so a partial/cancelled partition can never
/// be presented as a complete ensemble.
pub fn finalize_classified_chunks(
    chunks: &[ClassifiedChunk],
    n_runs: i64,
) -> Result<ClassifiedDispersionResult, String> {
    if n_runs < 1 {
        return Err(format!(
            "runMonteCarlo: nRuns must be a positive integer (got {n_runs})"
        ));
    }
    let mut ordered: Vec<&ClassifiedChunk> = chunks.iter().collect();
    ordered.sort_by_key(|c| c.run_start);
    let mut expected_start = 0_i64;
    let mut runs: Vec<ClassifiedRun> = Vec::with_capacity(n_runs as usize);
    for chunk in ordered {
        if chunk.run_start < 0 || chunk.run_end < chunk.run_start || chunk.run_end > n_runs {
            return Err(format!(
                "runMonteCarlo: classified chunk range [{}, {}) is outside [0, {n_runs})",
                chunk.run_start, chunk.run_end
            ));
        }
        if chunk.run_start != expected_start {
            return Err(format!(
                "runMonteCarlo: classified chunks must cover each absolute run once; expected run {expected_start}, got [{}, {})",
                chunk.run_start, chunk.run_end
            ));
        }
        let expected_len = (chunk.run_end - chunk.run_start) as usize;
        if chunk.runs.len() != expected_len {
            return Err(format!(
                "runMonteCarlo: classified chunk [{}, {}) carries {} runs, expected {expected_len}",
                chunk.run_start, chunk.run_end, chunk.runs.len()
            ));
        }
        for (offset, run) in chunk.runs.iter().enumerate() {
            let expected_index = chunk.run_start + offset as i64;
            if run.run_index != expected_index {
                return Err(format!(
                    "runMonteCarlo: classified run index {} is not the expected {expected_index}",
                    run.run_index
                ));
            }
            runs.push(run.clone());
        }
        expected_start = chunk.run_end;
    }
    if expected_start != n_runs {
        return Err(format!(
            "runMonteCarlo: classified ensemble is incomplete; missing absolute runs [{expected_start}, {n_runs})"
        ));
    }
    build_classified_result(runs, n_runs)
}

/// Classified whole-ensemble path. Legacy sampling replays the sequential
/// stream; per-run-v2 reuses the classified chunk path. Unlike the legacy
/// unclassified `run_ensemble`, an all-failure/all-timeout/all-unsupported
/// ensemble is returned with its complete ledger and absent statistics, not
/// replaced by an error that would discard the only outcome record.
pub fn run_ensemble_classified(
    base: &PerturbedParams,
    sigmas: &PerturbationSigmas,
    n_runs: i64,
    seed: i64,
    version: SamplingVersion,
    fly: &dyn Fn(&PerturbedParams) -> Result<RunObservation, String>,
) -> Result<ClassifiedDispersionResult, String> {
    if n_runs < 1 {
        return Err(format!(
            "runMonteCarlo: nRuns must be a positive integer (got {n_runs})"
        ));
    }
    if version == SamplingVersion::PerRunV2 {
        let chunk = run_chunk_classified(base, sigmas, n_runs, seed, 0, n_runs, fly)?;
        return finalize_classified_chunks(std::slice::from_ref(&chunk), n_runs);
    }
    validate_sigmas(sigmas)?;
    let mut rng = Mulberry32::new(seed);
    let mut runs: Vec<ClassifiedRun> = Vec::with_capacity(n_runs as usize);
    for i in 0..n_runs {
        let label = format!("run {}/{n_runs}", i + 1);
        runs.push(run_single_classified(base, sigmas, &mut rng, i, &label, fly));
    }
    build_classified_result(runs, n_runs)
}

// ---------------------------------------------------------------------------
// Parity tests (oracle values extracted via `node -e` against TS sources)
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    fn approx(a: f64, b: f64, tol: f64) -> bool {
        (a - b).abs() <= tol
    }

    #[test]
    fn rng_first_five_exact() {
        // node: mulberry32(42) first 5
        let expected = [
            0.2189318814780563,
            0.7678455009590834,
            0.24957433994859457,
            0.5293752641882747,
            0.5275187129154801,
        ];
        let mut rng = Mulberry32::new(42);
        for (i, &want) in expected.iter().enumerate() {
            let got = rng.next();
            assert!(
                got == want,
                "draw {i}: got {got:?}, want {want:?}"
            );
            assert!((0.0..1.0).contains(&got));
        }
        // Deterministic replay.
        let mut a = Mulberry32::new(42);
        let mut b = Mulberry32::new(42);
        for _ in 0..64 {
            assert_eq!(a.next().to_bits(), b.next().to_bits());
        }
    }

    #[test]
    fn sub_seed_values() {
        assert_eq!(sub_seed_of(20260909, 0), 20260909);
        assert_eq!(sub_seed_of(20260909, 1), 2674696678);
        assert_ne!(sub_seed_of(20260909, 3), sub_seed_of(20260909, 4));
        assert_ne!(sub_seed_of(20260909, 3), sub_seed_of(20260910, 3));
    }

    #[test]
    fn gaussian_bands_20k() {
        let mut rng = Mulberry32::new(20260909);
        let n = 20000;
        let (mut sum, mut sum_sq) = (0.0_f64, 0.0_f64);
        for _ in 0..n {
            let z = gaussian(&mut rng);
            assert!(z.is_finite());
            sum += z;
            sum_sq += z * z;
        }
        let mean = sum / n as f64;
        let var = sum_sq / n as f64 - mean * mean;
        assert!(mean.abs() < 0.05, "mean {mean}");
        assert!((0.9..1.1).contains(&var), "var {var}");
    }

    #[test]
    fn gaussian_first_draw_pins_box_muller_order() {
        // node rounded: seed 42 first gaussian ≈ 0.0787 (u1 = 1 - rng).
        let mut rng = Mulberry32::new(42);
        let z = gaussian(&mut rng);
        assert!(approx(z, 0.0787, 1e-3), "z={z}");
    }

    #[test]
    fn anisotropic_cloud_stats() {
        let pts = [
            LandingPoint { x: 2.0, y: 0.0 },
            LandingPoint { x: -2.0, y: 0.0 },
            LandingPoint { x: 0.0, y: 1.0 },
            LandingPoint { x: 0.0, y: -1.0 },
        ];
        let s = compute_dispersion_statistics(&pts).unwrap();
        assert_eq!(s.mean, LandingPoint { x: 0.0, y: 0.0 });
        assert!(approx(s.covariance.xx, 8.0 / 3.0, 1e-9));
        assert!(approx(s.covariance.xy, 0.0, 1e-9));
        assert!(approx(s.covariance.yy, 2.0 / 3.0, 1e-9));
        assert!(approx(s.sigma1, (8.0_f64 / 3.0).sqrt(), 1e-9));
        assert!(approx(s.sigma2, (2.0_f64 / 3.0).sqrt(), 1e-9));
        assert!(approx(s.theta_deg, 0.0, 1e-9));
    }

    #[test]
    fn y_dominant_theta_90() {
        let pts = [
            LandingPoint { x: 0.0, y: 3.0 },
            LandingPoint { x: 0.0, y: -3.0 },
            LandingPoint { x: 1.0, y: 0.0 },
            LandingPoint { x: -1.0, y: 0.0 },
        ];
        let s = compute_dispersion_statistics(&pts).unwrap();
        assert!(approx(s.sigma1, 6.0_f64.sqrt(), 1e-9));
        assert!(approx(s.sigma2, (2.0_f64 / 3.0).sqrt(), 1e-9));
        assert!(approx(s.theta_deg.abs(), 90.0, 1e-9));
    }

    #[test]
    fn containment_radial_cdf() {
        let pts = [
            LandingPoint { x: 10.0, y: 0.0 },
            LandingPoint { x: 20.0, y: 0.0 },
            LandingPoint { x: 30.0, y: 0.0 },
            LandingPoint { x: 40.0, y: 0.0 },
        ];
        let s = compute_dispersion_statistics(&pts).unwrap();
        assert_eq!(s.mean, LandingPoint { x: 25.0, y: 0.0 });
        assert_eq!(s.containment.r50, 5.0);
        assert_eq!(s.containment.r90, 15.0);
        assert_eq!(s.containment.r99, 15.0);
        assert!(approx(s.sigma2, 0.0, 1e-9));
        assert!(approx(s.sigma1, (500.0_f64 / 3.0).sqrt(), 1e-9));
    }

    #[test]
    fn empty_and_single_clouds() {
        let e = compute_dispersion_statistics(&[]).unwrap();
        assert!(e.mean.x.is_nan() && e.sigma1.is_nan() && e.containment.r50.is_nan());
        let s = compute_dispersion_statistics(&[LandingPoint { x: 7.5, y: -2.0 }]).unwrap();
        assert_eq!(s.mean, LandingPoint { x: 7.5, y: -2.0 });
        assert_eq!(s.covariance, Covariance2x2 { xx: 0.0, xy: 0.0, yy: 0.0 });
        assert_eq!(s.sigma1, 0.0);
        assert_eq!(s.sigma2, 0.0);
        assert_eq!(s.containment, ContainmentRadii { r50: 0.0, r90: 0.0, r99: 0.0 });
    }

    #[test]
    fn rejects_non_finite() {
        let err = compute_dispersion_statistics(&[
            LandingPoint { x: f64::NAN, y: 0.0 },
            LandingPoint { x: 1.0, y: 1.0 },
        ])
        .unwrap_err();
        assert!(
            err.contains("landing point must be finite (got x=NaN, y=0)"),
            "msg: {err}"
        );
        assert!(compute_dispersion_statistics(&[LandingPoint {
            x: 0.0,
            y: f64::INFINITY
        }])
        .unwrap_err()
        .contains("landing point must be finite"));
        assert!(compute_dispersion_statistics(&[LandingPoint {
            x: 0.0,
            y: f64::NEG_INFINITY
        }])
        .unwrap_err()
        .contains("landing point must be finite"));
    }

    #[test]
    fn input_validation_errors() {
        let base = PerturbedParams::default();
        let fly = |_: &PerturbedParams| Ok(LandingPoint { x: 0.0, y: 0.0 });
        let e = run_ensemble(&base, &PerturbationSigmas::default(), 0, 1, SamplingVersion::Legacy, &fly)
            .unwrap_err();
        assert!(e.contains("nRuns must be a positive integer"), "msg: {e}");
        let e = run_ensemble(
            &base,
            &PerturbationSigmas { wind_azimuth_deg_sigma: -1.0, ..Default::default() },
            1,
            1,
            SamplingVersion::Legacy,
            &fly,
        )
        .unwrap_err();
        assert!(e.contains("windAzimuthDegSigma"), "msg: {e}");
        let e = run_ensemble(
            &base,
            &PerturbationSigmas { impulse_pct_sigma: f64::INFINITY, ..Default::default() },
            1,
            1,
            SamplingVersion::Legacy,
            &fly,
        )
        .unwrap_err();
        assert!(e.contains("impulsePctSigma"), "msg: {e}");
        assert!(parse_sampling_version("bogus-version").unwrap_err().contains("unknown sampling version"));
        let e = run_chunk(&base, &PerturbationSigmas::default(), 9, 1, -1, 3, &fly).unwrap_err();
        assert!(e.contains("runStart"), "msg: {e}");
        let e = run_chunk(&base, &PerturbationSigmas::default(), 9, 1, 5, 3, &fly).unwrap_err();
        assert!(e.contains("runEnd"), "msg: {e}");
        let e = run_chunk(&base, &PerturbationSigmas::default(), 9, 1, 0, 10, &fly).unwrap_err();
        assert!(e.contains("runEnd"), "msg: {e}");
    }

    #[test]
    fn perturbation_consumption_order() {
        // Only wind active: perturbed wind = base + z0 * sigma where z0 is
        // the first gaussian draw of the stream.
        let base = PerturbedParams {
            wind_azimuth_deg: Some(90.0),
            rail_elevation_deg: Some(85.0),
            impulse_scale: 1.0,
        };
        let sigmas = PerturbationSigmas { wind_azimuth_deg_sigma: 5.0, ..Default::default() };
        let mut rng = Mulberry32::new(7);
        let mut expect_rng = Mulberry32::new(7);
        let z0 = gaussian(&mut expect_rng);
        let out = apply_perturbations(&base, &sigmas, &mut rng);
        assert!(approx(out.wind_azimuth_deg.unwrap(), 90.0 + z0 * 5.0, 1e-12));
        assert_eq!(out.rail_elevation_deg, Some(85.0));
        assert_eq!(out.impulse_scale, 1.0);
        // Zero sigmas reproduce the base exactly and consume no draws.
        let zero = PerturbationSigmas::default();
        let mut rng2 = Mulberry32::new(7);
        let out2 = apply_perturbations(&base, &zero, &mut rng2);
        assert_eq!(out2, base);
        assert_eq!(rng2.next().to_bits(), Mulberry32::new(7).next().to_bits());
    }

    /// Pre-fix sampler: the old unclamped formula, kept as a test oracle so
    /// bit-identity can be asserted against the exact prior behaviour.
    fn pre_fix_apply(
        base: &PerturbedParams,
        sigmas: &PerturbationSigmas,
        rng: &mut Mulberry32,
    ) -> PerturbedParams {
        let mut out = base.clone();
        if sigmas.wind_azimuth_deg_sigma > 0.0 {
            let z = gaussian(rng);
            let b = out.wind_azimuth_deg.unwrap_or(DEFAULT_WIND_AZIMUTH_DEG);
            out.wind_azimuth_deg = Some(b + z * sigmas.wind_azimuth_deg_sigma);
        }
        if sigmas.rail_angle_deg_sigma > 0.0 {
            let z = gaussian(rng);
            let b = out.rail_elevation_deg.unwrap_or(DEFAULT_RAIL_ELEVATION_DEG);
            out.rail_elevation_deg = Some(b + z * sigmas.rail_angle_deg_sigma);
        }
        if sigmas.impulse_pct_sigma > 0.0 {
            let z = gaussian(rng);
            let scale = 1.0 + (sigmas.impulse_pct_sigma / 100.0) * z;
            out.impulse_scale *= scale;
        }
        out
    }

    fn rail_sigmas(sigma: f64) -> PerturbationSigmas {
        PerturbationSigmas { rail_angle_deg_sigma: sigma, ..Default::default() }
    }

    fn rail_base(elevation: f64) -> PerturbedParams {
        PerturbedParams {
            wind_azimuth_deg: Some(270.0),
            rail_elevation_deg: Some(elevation),
            impulse_scale: 1.0,
        }
    }

    fn is_in_rail_domain(value: f64) -> bool {
        (RAIL_ELEVATION_MIN_DEG..=RAIL_ELEVATION_MAX_DEG).contains(&value)
    }

    fn bits(value: Option<f64>) -> Option<u64> {
        value.map(f64::to_bits)
    }

    #[test]
    fn rail_fold_keeps_upper_bound_samples_in_domain() {
        let n = 100_000;
        let base = rail_base(RAIL_ELEVATION_MAX_DEG);
        let sigmas = rail_sigmas(1.0);
        let fly = |p: &PerturbedParams| -> Result<LandingPoint, String> {
            let rail = p.rail_elevation_deg.expect("rail elevation sampled");
            if !is_in_rail_domain(rail) {
                return Err(format!("railElevationDeg {rail}° is outside the declared launch-rail domain [70°, 90°]"));
            }
            Ok(LandingPoint { x: 0.0, y: rail })
        };
        let r = run_ensemble(&base, &sigmas, n, 20260909, SamplingVersion::PerRunV2, &fly).unwrap();
        assert_eq!(r.successful_runs, n);
        assert_eq!(r.failed_runs, 0);
        assert!(r.landings.iter().all(|p| is_in_rail_domain(p.y)));
    }

    #[test]
    fn rail_fold_keeps_lower_bound_samples_in_domain() {
        let n = 100_000;
        let base = rail_base(RAIL_ELEVATION_MIN_DEG);
        let sigmas = rail_sigmas(1.0);
        let fly = |p: &PerturbedParams| -> Result<LandingPoint, String> {
            let rail = p.rail_elevation_deg.expect("rail elevation sampled");
            if !is_in_rail_domain(rail) {
                return Err(format!("railElevationDeg {rail}° is outside the declared launch-rail domain [70°, 90°]"));
            }
            Ok(LandingPoint { x: 0.0, y: rail })
        };
        let r = run_ensemble(&base, &sigmas, n, 20260909, SamplingVersion::PerRunV2, &fly).unwrap();
        assert_eq!(r.successful_runs, n);
        assert_eq!(r.failed_runs, 0);
        assert!(r.landings.iter().all(|p| is_in_rail_domain(p.y)));
    }

    #[test]
    fn rail_bound_distribution_matches_the_truncated_normal() {
        // Folding about the bound is the Gaussian conditioned on the domain
        // when the nominal sits on that bound: a half-normal with no atom.
        for (nominal, inward) in [
            (RAIL_ELEVATION_MAX_DEG, -1.0),
            (RAIL_ELEVATION_MIN_DEG, 1.0),
        ] {
            let n = 20_000;
            let sigma = 1.0;
            let base = rail_base(nominal);
            let sigmas = rail_sigmas(sigma);
            let mut rng = Mulberry32::new(20260909);
            let (mut sum, mut sum_sq) = (0.0, 0.0);
            let mut at_bound = 0usize;
            for _ in 0..n {
                let rail = apply_perturbations(&base, &sigmas, &mut rng)
                    .rail_elevation_deg
                    .unwrap();
                assert!(is_in_rail_domain(rail), "nominal {nominal}: {rail}");
                sum += rail;
                sum_sq += rail * rail;
                if rail == nominal {
                    at_bound += 1;
                }
            }
            let mean = sum / n as f64;
            let variance = sum_sq / n as f64 - mean * mean;
            let expected_mean = nominal + inward * sigma * (2.0 / PI).sqrt();
            assert!(
                approx(mean, expected_mean, 0.02),
                "nominal {nominal}: mean {mean} vs {expected_mean}"
            );
            assert!(
                approx(variance, sigma * sigma * (1.0 - 2.0 / PI), 0.02),
                "nominal {nominal}: variance {variance}"
            );
            assert!(
                at_bound * 100 < n,
                "nominal {nominal}: {at_bound} samples sit exactly on the bound (point mass)"
            );
        }
    }

    #[test]
    fn mid_domain_ensemble_is_bit_identical_to_the_pre_fix_sampler() {
        let base = rail_base(85.0);
        let sigmas = PerturbationSigmas {
            wind_azimuth_deg_sigma: 20.0,
            rail_angle_deg_sigma: 1.0,
            impulse_pct_sigma: 3.0,
        };
        let mut new_rng = Mulberry32::new(20260909);
        let mut old_rng = Mulberry32::new(20260909);
        for run in 0..1_000 {
            let new = apply_perturbations(&base, &sigmas, &mut new_rng);
            let old = pre_fix_apply(&base, &sigmas, &mut old_rng);
            assert!(is_in_rail_domain(old.rail_elevation_deg.unwrap()), "run {run} left the domain; the mid-domain path was not exercised");
            assert_eq!(new, old, "run {run}");
        }
        assert_eq!(new_rng.next().to_bits(), old_rng.next().to_bits());
    }

    #[test]
    fn fold_preserves_other_parameter_draws() {
        let base = rail_base(RAIL_ELEVATION_MAX_DEG);
        let sigmas = PerturbationSigmas {
            wind_azimuth_deg_sigma: 20.0,
            rail_angle_deg_sigma: 1.0,
            impulse_pct_sigma: 3.0,
        };
        let mut new_rng = Mulberry32::new(12345);
        let mut old_rng = Mulberry32::new(12345);
        let mut folded = 0;
        for run in 0..500 {
            let new = apply_perturbations(&base, &sigmas, &mut new_rng);
            let old = pre_fix_apply(&base, &sigmas, &mut old_rng);
            assert_eq!(bits(new.wind_azimuth_deg), bits(old.wind_azimuth_deg), "run {run}: wind");
            assert_eq!(new.impulse_scale.to_bits(), old.impulse_scale.to_bits(), "run {run}: impulse");
            assert!(is_in_rail_domain(new.rail_elevation_deg.unwrap()), "run {run}: rail");
            if new.rail_elevation_deg != old.rail_elevation_deg {
                folded += 1;
            }
        }
        assert!(folded > 100, "expected roughly half the runs to fold, got {folded}");
        assert_eq!(new_rng.next().to_bits(), old_rng.next().to_bits());
    }

    #[test]
    fn rail_fold_never_escapes_for_large_sigma() {
        let base = rail_base(RAIL_ELEVATION_MAX_DEG);
        let sigmas = rail_sigmas(50.0);
        let mut rng = Mulberry32::new(7);
        for draw in 0..10_000 {
            let rail = apply_perturbations(&base, &sigmas, &mut rng)
                .rail_elevation_deg
                .unwrap();
            assert!(is_in_rail_domain(rail), "draw {draw}: {rail}");
        }
    }

    #[test]
    fn out_of_domain_nominal_is_not_silently_repaired() {
        let base = rail_base(65.0);
        let sigmas = rail_sigmas(1.0);
        let mut new_rng = Mulberry32::new(20260909);
        let mut old_rng = Mulberry32::new(20260909);
        let mut below_domain = 0;
        for _ in 0..100 {
            let got = apply_perturbations(&base, &sigmas, &mut new_rng)
                .rail_elevation_deg
                .unwrap();
            let raw = pre_fix_apply(&base, &sigmas, &mut old_rng)
                .rail_elevation_deg
                .unwrap();
            assert_eq!(got.to_bits(), raw.to_bits());
            if got < RAIL_ELEVATION_MIN_DEG {
                below_domain += 1;
            }
        }
        assert!(
            below_domain > 0,
            "an invalid 65° nominal must stay raw for the solver to reject, not be folded into the domain"
        );
    }

    fn stub_fly() -> impl Fn(&PerturbedParams) -> Result<LandingPoint, String> {
        |p: &PerturbedParams| {
            Ok(LandingPoint {
                x: p.wind_azimuth_deg.unwrap_or(DEFAULT_WIND_AZIMUTH_DEG) + p.impulse_scale,
                y: p.rail_elevation_deg.unwrap_or(DEFAULT_RAIL_ELEVATION_DEG),
            })
        }
    }

    #[test]
    fn determinism_and_seed_divergence() {
        let base = PerturbedParams::default();
        let sigmas = PerturbationSigmas {
            wind_azimuth_deg_sigma: 12.0,
            rail_angle_deg_sigma: 1.2,
            impulse_pct_sigma: 4.0,
        };
        let fly = stub_fly();
        let a = run_ensemble(&base, &sigmas, 4, 12345, SamplingVersion::Legacy, &fly).unwrap();
        let b = run_ensemble(&base, &sigmas, 4, 12345, SamplingVersion::Legacy, &fly).unwrap();
        let c = run_ensemble(&base, &sigmas, 4, 54321, SamplingVersion::Legacy, &fly).unwrap();
        assert_eq!(a.landings, b.landings);
        assert_eq!(a.successful_runs, 4);
        assert_eq!(a.failed_runs, 0);
        assert_ne!(a.landings, c.landings);
        // Base never mutated.
        assert_eq!(base, PerturbedParams::default());
        // Zero-sigma single run matches the unperturbed closure exactly.
        let z = run_ensemble(&base, &PerturbationSigmas::default(), 1, 42, SamplingVersion::Legacy, &fly).unwrap();
        let direct = fly(&base).unwrap();
        assert!((z.landings[0].x - direct.x).abs() <= 1e-9);
        assert!((z.landings[0].y - direct.y).abs() <= 1e-9);
    }

    #[test]
    fn chunk_partition_equivalence_v2() {
        let base = PerturbedParams::default();
        let sigmas = PerturbationSigmas {
            wind_azimuth_deg_sigma: 5.0,
            rail_angle_deg_sigma: 1.0,
            impulse_pct_sigma: 3.0,
        };
        let fly = stub_fly();
        let full = run_ensemble(&base, &sigmas, 9, 20260909, SamplingVersion::PerRunV2, &fly).unwrap();
        let partitions: Vec<Vec<(i64, i64)>> = vec![
            vec![(0, 9)],
            vec![(0, 4), (4, 9)],
            vec![(0, 3), (3, 6), (6, 9)],
            vec![(0, 5), (5, 6), (6, 9)],
            vec![(0, 9), (9, 9)],
        ];
        for ranges in &partitions {
            let chunks: Vec<ChunkResult> = ranges
                .iter()
                .map(|(s, e)| run_chunk(&base, &sigmas, 9, 20260909, *s, *e, &fly).unwrap())
                .collect();
            let merged = finalize_chunks(&chunks, 9).unwrap();
            assert_eq!(merged.landings, full.landings, "ranges {ranges:?}");
            assert_eq!(merged.failed_runs, full.failed_runs);
            assert_eq!(merged.successful_runs, full.successful_runs);
        }
        // Out-of-order worker replies merge into run order.
        let a = run_chunk(&base, &sigmas, 9, 20260909, 0, 4, &fly).unwrap();
        let b = run_chunk(&base, &sigmas, 9, 20260909, 4, 9, &fly).unwrap();
        let acc = accumulate_chunks(&[b.clone(), a.clone()]);
        assert_eq!(acc.landings, full.landings);
        assert_eq!(finalize_chunks(&[b, a], 9).unwrap().landings, full.landings);
        // Empty ranges.
        for (s, e) in [(9, 9), (4, 4), (0, 0)] {
            let empty = run_chunk(&base, &sigmas, 9, 20260909, s, e, &fly).unwrap();
            assert!(empty.landings.is_empty());
            assert_eq!(empty.failed_runs, 0);
        }
    }

    #[test]
    fn all_failed_gate() {
        let base = PerturbedParams::default();
        let fly = |_: &PerturbedParams| -> Result<LandingPoint, String> {
            Err("simulate6DofFlight: railLength must be positive (got 0)".to_string())
        };
        let e = run_ensemble(&base, &PerturbationSigmas::default(), 3, 1, SamplingVersion::Legacy, &fly)
            .unwrap_err();
        assert!(
            e.contains("runMonteCarlo: all 3 runs failed; first failure: simulate6DofFlight: railLength must be positive (got 0)"),
            "msg: {e}"
        );
        let chunks = vec![run_chunk(&base, &PerturbationSigmas::default(), 3, 1, 0, 3, &fly).unwrap()];
        let e2 = finalize_chunks(&chunks, 3).unwrap_err();
        assert!(e2.contains("all 3 runs failed"), "msg: {e2}");
    }

    #[test]
    fn non_finite_landing_counts_failed() {
        let base = PerturbedParams::default();
        let calls = std::cell::Cell::new(0);
        let fly = |_: &PerturbedParams| -> Result<LandingPoint, String> {
            let n = calls.get();
            calls.set(n + 1);
            if n == 0 {
                Ok(LandingPoint { x: f64::NAN, y: 0.0 })
            } else {
                Ok(LandingPoint { x: 1.0, y: 2.0 })
            }
        };
        let r = run_ensemble(&base, &PerturbationSigmas::default(), 3, 11, SamplingVersion::Legacy, &fly).unwrap();
        assert_eq!(r.failed_runs, 1);
        assert_eq!(r.successful_runs, 2);
        assert!(r.landings.iter().all(|p| p.x.is_finite() && p.y.is_finite()));
        // All non-finite surfaces the first message.
        let fly2 = |_: &PerturbedParams| -> Result<LandingPoint, String> {
            Ok(LandingPoint { x: f64::INFINITY, y: 0.0 })
        };
        let e = run_ensemble(&base, &PerturbationSigmas::default(), 2, 11, SamplingVersion::Legacy, &fly2)
            .unwrap_err();
        assert!(e.contains("non-finite landing (x=Infinity, y=0)"), "msg: {e}");
    }

    fn observation(
        terminated: bool,
        touchdown_nominal: bool,
        validity: &str,
        enveloped: bool,
    ) -> RunObservation {
        RunObservation {
            endpoint: LandingPoint { x: 1.0, y: 2.0 },
            terminated,
            termination_reason: if terminated { "touchdown" } else { "timeout" }.to_string(),
            touchdown_nominal: if terminated { touchdown_nominal } else { false },
            validity: validity.to_string(),
            enveloped,
            off_nominal_excursion: false,
        }
    }

    #[test]
    fn classifies_each_native_outcome_without_relabeling() {
        let timeout = observation(false, true, "PASS", true);
        assert_eq!(classify_observation(&timeout), RunOutcomeClass::TimeLimitEndpoint);
        let non_nominal = observation(true, false, "PASS", true);
        assert_eq!(classify_observation(&non_nominal), RunOutcomeClass::NonNominalImpact);
        let unsupported = observation(true, true, "UNKNOWN", false);
        assert_eq!(classify_observation(&unsupported), RunOutcomeClass::UnsupportedNominalTouchdown);
        let supported = observation(true, true, "PASS", true);
        assert_eq!(classify_observation(&supported), RunOutcomeClass::SupportedNominalTerminal);
    }

    #[test]
    fn classified_support_requires_no_off_nominal_excursion() {
        let mut excursion = observation(true, true, "PASS", true);
        excursion.off_nominal_excursion = true;
        assert_eq!(
            classify_observation(&excursion),
            RunOutcomeClass::UnsupportedNominalTouchdown,
            "a PASS/enveloped/nominal touchdown with an off-nominal excursion must not enter the qualified footprint"
        );
        // Valid-timeout pairing: the same native flags but no terminal
        // touchdown remain a time-limit endpoint, never a supported sample.
        let timeout = observation(false, true, "PASS", true);
        assert_eq!(classify_observation(&timeout), RunOutcomeClass::TimeLimitEndpoint);
    }

    #[test]
    fn classified_chunk_keeps_every_index_and_counts() {
        let base = PerturbedParams::default();
        let calls = std::cell::Cell::new(0_i64);
        let fly = |_: &PerturbedParams| -> Result<RunObservation, String> {
            let i = calls.get();
            calls.set(i + 1);
            let obs = match i {
                0 => observation(true, true, "PASS", true),
                1 => observation(true, true, "UNKNOWN", false),
                2 => observation(false, true, "UNKNOWN", false),
                3 => observation(true, false, "PASS", true),
                _ => return Err("synthetic engine failure".to_string()),
            };
            Ok(obs)
        };
        let chunk = run_chunk_classified(&base, &PerturbationSigmas::default(), 5, 11, 0, 5, &fly).unwrap();
        assert_eq!(chunk.runs.len(), 5);
        for (i, run) in chunk.runs.iter().enumerate() {
            assert_eq!(run.run_index, i as i64);
        }
        let result = finalize_classified_chunks(&[chunk], 5).unwrap();
        assert_eq!(result.counts.requested, 5);
        assert_eq!(result.counts.supported_nominal_terminal, 1);
        assert_eq!(result.counts.unsupported_nominal_touchdown, 1);
        assert_eq!(result.counts.non_nominal_impact, 1);
        assert_eq!(result.counts.time_limit_endpoint, 1);
        assert_eq!(result.counts.computational_failure, 1);
        // Legacy `landings` keeps every finite endpoint; the footprint uses
        // only the supported terminal sample.
        assert_eq!(result.landings.len(), 4);
        assert_eq!(result.endpoints.len(), 4);
        assert_eq!(result.eligible_endpoints.len(), 1);
        assert!(result.statistics_available);
        assert!(result.statistics.is_some());
        assert_eq!(result.failed_runs, 1);
    }

    #[test]
    fn classified_zero_eligible_is_not_fabricated() {
        let base = PerturbedParams::default();
        let fly = |_: &PerturbedParams| -> Result<RunObservation, String> {
            Ok(observation(false, true, "UNKNOWN", false))
        };
        let chunk = run_chunk_classified(&base, &PerturbationSigmas::default(), 3, 1, 0, 3, &fly).unwrap();
        let result = finalize_classified_chunks(&[chunk], 3).unwrap();
        assert_eq!(result.counts.time_limit_endpoint, 3);
        assert_eq!(result.landings.len(), 3);
        assert!(result.eligible_endpoints.is_empty());
        assert!(!result.statistics_available);
        assert!(result.statistics.is_none());
    }

    #[test]
    fn classified_all_failure_returns_the_ledger_instead_of_discarding_it() {
        let base = PerturbedParams::default();
        let fly = |_: &PerturbedParams| -> Result<RunObservation, String> {
            Err("synthetic engine failure".to_string())
        };
        let result = run_ensemble_classified(
            &base,
            &PerturbationSigmas::default(),
            3,
            1,
            SamplingVersion::Legacy,
            &fly,
        )
        .unwrap();
        assert_eq!(result.counts.computational_failure, 3);
        assert_eq!(result.runs.len(), 3);
        assert_eq!(result.failed_runs, 3);
        assert!(result.landings.is_empty());
        assert!(!result.statistics_available);
    }

    #[test]
    fn classified_coverage_rejects_missing_duplicate_and_overlap() {
        let base = PerturbedParams::default();
        let fly = |_: &PerturbedParams| -> Result<RunObservation, String> {
            Ok(observation(true, true, "PASS", true))
        };
        let a = run_chunk_classified(&base, &PerturbationSigmas::default(), 4, 1, 0, 2, &fly).unwrap();
        let b = run_chunk_classified(&base, &PerturbationSigmas::default(), 4, 1, 2, 4, &fly).unwrap();
        assert!(finalize_classified_chunks(&[a.clone(), b.clone()], 4).is_ok());
        assert!(finalize_classified_chunks(&[a.clone()], 4).unwrap_err().contains("incomplete"));
        assert!(finalize_classified_chunks(&[a.clone(), a.clone(), b.clone()], 4)
            .unwrap_err()
            .contains("expected run"));
        let overlap = run_chunk_classified(&base, &PerturbationSigmas::default(), 4, 1, 1, 3, &fly).unwrap();
        assert!(finalize_classified_chunks(&[a, overlap, b], 4)
            .unwrap_err()
            .contains("expected run"));
    }
}
