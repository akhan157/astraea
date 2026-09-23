//! Monte Carlo dispersion engine — Rust port of `src/sim/monteCarlo.ts`.
//!
//! The TS frontend is the untouched oracle. RNG / statistics parity is
//! verified by the `#[cfg(test)]` suite below against oracle values
//! extracted with `node -e` one-liners (never hand-invented).
//!
//! Trajectory coupling is via an injected closure so sixDof plugs in later:
//! [`run_ensemble`] takes `fly: &dyn Fn(&PerturbedParams) -> Result<LandingPoint, String>`.

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

/// Deep-clones `base` and applies one Gaussian perturbation per active
/// sigma, consuming exactly two uniforms per active perturbation in the
/// fixed order wind-azimuth → rail-elevation → impulse.
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
        out.rail_elevation_deg = Some(b + z * sigmas.rail_angle_deg_sigma);
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
}
