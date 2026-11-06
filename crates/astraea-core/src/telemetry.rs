//! Bounded display telemetry for the 6-DOF kernel.
//!
//! Mirrors `SixDofTelemetryPoint` in `src/sim/sixDofSimulator.ts:41-65`
//! field-for-field (same names, units, semantics). Nonterminal points are
//! NONCANONICAL display data: scalars carry the TS `parseFloat(x.toFixed(n))`
//! rounding (reproduced exactly by [`js_to_fixed`]); the terminal point is
//! full precision. The recorder lives in `six_dof::simulate_flight` and is
//! opt-in (`SixDofOptions::record_telemetry`, default off), so ensembles pay
//! nothing.
//!
//! IPC rule: no per-step IPC. `simulate_flight` returns ONE bounded display
//! series, produced by [`decimate_telemetry`] (at most
//! [`MAX_TELEMETRY_POINTS`] points); ensembles return coarse metrics only.

use crate::six_dof::{Quat, Vec3};

/// Hard cap on the display series that crosses the IPC boundary.
pub const MAX_TELEMETRY_POINTS: usize = 5000;

/// Body rates in the simulator convention: roll `p`, pitch `q`, yaw `r` (rad/s).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BodyRates {
    pub p: f64,
    pub q: f64,
    pub r: f64,
}

/// One telemetry sample. Single-stage runs never set the TS optional
/// `stage` / `stageTime` / `motorTime` fields, so they do not exist here.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct TelemetryPoint {
    /// seconds
    pub time: f64,
    /// East, North, Up (m)
    pub position: Vec3,
    /// Navigation-frame GROUND velocity (m/s, includes wind advection)
    pub velocity: Vec3,
    /// AIRSPEED magnitude |v_air| (m/s) — not |velocity|
    pub speed: f64,
    pub mach: f64,
    /// z coordinate (m AGL)
    pub altitude: f64,
    /// Scalar m/s^2
    pub acceleration: f64,
    /// Roll, pitch, yaw rates (rad/s)
    pub angular_velocity: BodyRates,
    /// Total incidence angle (degrees)
    pub angle_of_attack_deg: f64,
    /// Canonical body-to-nav attitude (unit quaternion)
    pub q: Quat,
    pub pitch_deg: f64,
    pub roll_deg: f64,
    pub yaw_deg: f64,
    /// Newtons
    pub drag: f64,
    /// Newtons
    pub thrust: f64,
    /// kg
    pub mass: f64,
    /// Pa
    pub dynamic_pressure: f64,
}

/// `parseFloat(x.toFixed(digits))` exactly as ECMAScript defines it.
///
/// `toFixed` picks the integer `n` minimizing `|n/10^f - x|` on the EXACT
/// binary value, choosing the larger `n` on an exact tie (round half up on the
/// magnitude; the sign is handled separately, and `-0` is not negative).
/// Rust's `{:.N}` formatting is exact, so the first discarded digit of a
/// sufficiently long exact expansion decides: digit >= 5 rounds up.
/// A double with magnitude >= 2^-20 has at most 72 fractional decimal digits,
/// so 80 digits are always exact for any value that can reach a tie.
///
/// Fast path: with `y = fl(|x| * 10^digits)` the only error is the one
/// rounding of that product (at most half an ulp of `y`). When `y < 2^53` and
/// its fractional part is more than two ulps away from one half, that error
/// cannot change which integer is nearest, so `n = y.round()` is the exact
/// `toFixed` digit string, and `n / 10^digits` (an exact integer over an exact
/// power of ten, correctly rounded) is exactly what `parseFloat` returns.
/// Anything near a tie takes the exact decimal expansion below.
pub fn js_to_fixed(x: f64, digits: usize) -> f64 {
    if x.is_finite() && digits <= 22 {
        let scale = POW10[digits];
        let y = x.abs() * scale;
        if y < 9_007_199_254_740_992.0 {
            let frac = y - y.floor();
            let ulp = f64::from_bits(y.to_bits() + 1) - y;
            if (frac - 0.5).abs() > 2.0 * ulp {
                let magnitude = y.round() / scale;
                return if x < 0.0 { -magnitude } else { magnitude };
            }
        }
    }
    js_to_fixed_exact(x, digits)
}

/// Exact powers of ten representable in an f64 (10^0 ..= 10^22).
const POW10: [f64; 23] = [
    1e0, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16,
    1e17, 1e18, 1e19, 1e20, 1e21, 1e22,
];

/// Reference `toFixed` on the exact decimal expansion; `js_to_fixed` falls
/// back to it near ties and is tested against it.
fn js_to_fixed_exact(x: f64, digits: usize) -> f64 {
    if !x.is_finite() || x.abs() >= 1e21 {
        // JS returns the plain number string for |x| >= 1e21 and "NaN"/"Infinity"
        // otherwise; parseFloat of those is x itself (NaN / ±Infinity).
        return x;
    }
    let negative = x < 0.0;
    let exact = format!("{:.80}", x.abs());
    let (int_part, frac_part) = exact
        .split_once('.')
        .expect("fixed-point format always contains a decimal point");
    let round_up = frac_part.as_bytes()[digits] >= b'5';
    let mut kept: Vec<u8> = Vec::with_capacity(int_part.len() + digits);
    kept.extend_from_slice(int_part.as_bytes());
    kept.extend_from_slice(&frac_part.as_bytes()[..digits]);
    if round_up {
        let mut i = kept.len();
        loop {
            if i == 0 {
                kept.insert(0, b'1');
                break;
            }
            i -= 1;
            if kept[i] == b'9' {
                kept[i] = b'0';
            } else {
                kept[i] += 1;
                break;
            }
        }
    }
    let digits_str = String::from_utf8(kept).expect("ASCII digits");
    let magnitude: f64 = format!("{}e-{}", digits_str, digits)
        .parse()
        .expect("decimal literal always parses");
    if negative {
        -magnitude
    } else {
        magnitude
    }
}

/// Deterministic bounded display series.
///
/// Contract:
/// * at most `max_points` points, strictly increasing `time`;
/// * ALWAYS keeps the first point, the terminal point, and — for each entry of
///   `event_times` — the sample whose time is nearest the event (earliest on a
///   tie), since localized event roots fall between display samples;
/// * keeps the first recorded sample attaining the largest finite nonnegative
///   `dynamic_pressure`, if any; this preserves a recorded display peak, not a
///   continuous-time extremum or a sampling/rounding error bound;
/// * a series that already fits is returned whole (strict-time repair aside);
/// * otherwise the remaining budget is spent on a uniform index stride over
///   the full series (indices `round(j*(n-1)/(k-1))`), which is a pure
///   function of the input, so repeated runs decimate identically.
///
/// Time collisions (possible when a sub-millisecond step makes the rounded
/// display times coincide) are resolved by dropping the lower-priority sample
/// (forced first/terminal/event/pressure peak > stride; the later stride sample
/// on equal priority), never by emitting a non-increasing series. Fails closed
/// on non-finite times, on conflicting forced sample times, and on a cap too
/// small to hold the forced points. Invalid pressure entries are left unchanged
/// and excluded from peak selection; if none qualify there is no peak guarantee.
pub fn decimate_telemetry(
    full: &[TelemetryPoint],
    event_times: &[f64],
    max_points: usize,
) -> Result<Vec<TelemetryPoint>, String> {
    if full.is_empty() {
        return Ok(Vec::new());
    }
    if full.iter().any(|p| !p.time.is_finite()) {
        return Err("telemetry decimation: non-finite sample time".to_string());
    }
    let n = full.len();
    let last = n - 1;
    if n > 1 && !(full[0].time < full[last].time) {
        return Err("telemetry decimation: first and terminal times are not strictly increasing".to_string());
    }

    // Priority per index: 0 = unselected, 1 = stride, 2 = event/peak, 3 = endpoints.
    // All ranks >= 2 are obligations; conflicting obligations fail below.
    let mut rank = vec![0u8; n];
    rank[0] = 3;
    rank[last] = 3;
    for &et in event_times {
        if !et.is_finite() {
            return Err("telemetry decimation: non-finite event time".to_string());
        }
        let mut best = 0usize;
        let mut best_d = (full[0].time - et).abs();
        for (i, p) in full.iter().enumerate().skip(1) {
            let d = (p.time - et).abs();
            if d < best_d {
                best = i;
                best_d = d;
            }
        }
        if rank[best] < 2 {
            rank[best] = 2;
        }
    }
    let mut peak: Option<usize> = None;
    for (i, p) in full.iter().enumerate() {
        if p.dynamic_pressure.is_finite() && p.dynamic_pressure >= 0.0
            && peak.map_or(true, |best| p.dynamic_pressure > full[best].dynamic_pressure)
        {
            peak = Some(i);
        }
    }
    if let Some(i) = peak {
        rank[i] = rank[i].max(2);
    }
    let forced = rank.iter().filter(|&&r| r >= 2).count();
    if forced > max_points {
        return Err(format!(
            "telemetry decimation: {} forced points exceed the {}-point cap",
            forced, max_points
        ));
    }
    if n > max_points {
        // Spend the remaining budget on the indices that are NOT already
        // forced, so the uniform stride can never duplicate a kept point and
        // the output hits the cap exactly.
        let free_indices: Vec<usize> = (0..n).filter(|&i| rank[i] < 2).collect();
        let budget = max_points - forced;
        let m = free_indices.len();
        if budget >= m {
            for &i in &free_indices {
                rank[i] = 1;
            }
        } else if budget == 1 {
            rank[free_indices[m / 2]] = 1;
        } else if budget > 1 {
            for j in 0..budget {
                let idx = (j as f64 * (m - 1) as f64 / (budget - 1) as f64).round() as usize;
                rank[free_indices[idx]] = 1;
            }
        }
    } else {
        for r in rank.iter_mut() {
            if *r < 1 {
                *r = 1;
            }
        }
    }

    // Walk selected indices in order; enforce strictly increasing time.
    let mut kept: Vec<usize> = Vec::new();
    'next: for i in 0..n {
        if rank[i] == 0 {
            continue;
        }
        while let Some(&l) = kept.last() {
            if full[l].time < full[i].time {
                break;
            }
            if rank[l] >= 2 && rank[i] >= 2 {
                return Err(format!(
                    "telemetry decimation: forced sample times are not strictly increasing (indices {} and {})",
                    l, i
                ));
            }
            if rank[l] >= rank[i] {
                continue 'next;
            }
            kept.pop();
        }
        kept.push(i);
    }
    debug_assert!(kept.len() <= max_points);
    Ok(kept.into_iter().map(|i| full[i]).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn same(a: f64, b: f64) -> bool {
        a.to_bits() == b.to_bits() || (a.is_nan() && b.is_nan())
    }

    #[test]
    fn fast_to_fixed_matches_exact_expansion_bit_for_bit() {
        let mut seed: u64 = 0x9E37_79B9_7F4A_7C15;
        let mut next = || {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            seed
        };
        let mut values: Vec<f64> = vec![
            0.0, -0.0, 0.5, 1.5, 2.5, -2.5, 0.125, 0.0625, 1.005, 2.675, 1.45, -1.45, 0.05, 0.15,
            0.25, 0.35, 1e-7, -1e-7, 123456.7855, 9.995, 99.995, 1e15 + 0.5, 4.5e15, 9.0e15, 1e20,
            f64::NAN, f64::INFINITY, f64::NEG_INFINITY, f64::MIN_POSITIVE, 5e-324,
        ];
        for _ in 0..200_000 {
            let bits = next();
            // Telemetry-scale magnitudes, with and without a sign.
            let unit = (bits >> 11) as f64 / (1u64 << 53) as f64;
            let mag = 10f64.powi((bits % 12) as i32 - 3);
            let v = unit * mag;
            values.push(if bits & 1 == 0 { v } else { -v });
            // Exact decimal ties and their neighbours.
            let tie = ((bits >> 20) % 2_000_000) as f64 / 2000.0 + 0.0005;
            values.push(tie);
            values.push(f64::from_bits(tie.to_bits() + 1));
            values.push(f64::from_bits(tie.to_bits() - 1));
            // Arbitrary finite doubles.
            let any = f64::from_bits(bits);
            if any.is_finite() {
                values.push(any);
            }
        }
        for &v in &values {
            for digits in 0..=6 {
                let fast = js_to_fixed(v, digits);
                let exact = js_to_fixed_exact(v, digits);
                assert!(same(fast, exact), "js_to_fixed({v:e}, {digits}) = {fast:e}, exact {exact:e}");
            }
        }
    }

    fn pt(time: f64) -> TelemetryPoint {
        TelemetryPoint {
            time,
            position: Vec3 { x: 0.0, y: 0.0, z: time },
            velocity: Vec3::zero(),
            speed: 0.0,
            mach: 0.0,
            altitude: time,
            acceleration: 0.0,
            angular_velocity: BodyRates { p: 0.0, q: 0.0, r: 0.0 },
            angle_of_attack_deg: 0.0,
            q: Quat { w: 1.0, x: 0.0, y: 0.0, z: 0.0 },
            pitch_deg: 0.0,
            roll_deg: 0.0,
            yaw_deg: 0.0,
            drag: 0.0,
            thrust: 0.0,
            mass: 1.0,
            dynamic_pressure: 0.0,
        }
    }

    fn series(n: usize, dt: f64) -> Vec<TelemetryPoint> {
        (0..n).map(|i| pt(i as f64 * dt)).collect()
    }

    fn strictly_increasing(v: &[TelemetryPoint]) -> bool {
        v.windows(2).all(|w| w[0].time < w[1].time)
    }

    #[test]
    fn to_fixed_matches_javascript() {
        // Reference values from node: parseFloat(x.toFixed(n)).
        assert_eq!(js_to_fixed(0.25, 1), 0.3); // exact tie -> larger n
        assert_eq!(js_to_fixed(0.35, 1), 0.3); // 0.35 is 0.34999999999999997..
        assert_eq!(js_to_fixed(2.5, 0), 3.0);
        assert_eq!(js_to_fixed(-2.5, 0), -3.0); // sign split off, tie away from zero
        assert_eq!(js_to_fixed(1.005, 2), 1.0); // 1.00499999999999989...
        assert_eq!(js_to_fixed(1.45, 1), 1.4); // 1.4499999999999999556
        assert_eq!(js_to_fixed(8.345, 2), 8.35); // 8.3450000000000006394
        assert_eq!(js_to_fixed(9.96, 1), 10.0); // carry into a new digit
        assert_eq!(js_to_fixed(99.96, 1), 100.0);
        assert_eq!(js_to_fixed(0.0004, 3), 0.0);
        assert_eq!(js_to_fixed(0.0005, 3), 0.001); // 0.0005000000000000000104
        assert_eq!(js_to_fixed(123.456, 0), 123.0);
        assert_eq!(js_to_fixed(1e21, 1), 1e21);
        assert!(js_to_fixed(f64::NAN, 1).is_nan());
        let tiny_neg = js_to_fixed(-0.01, 1);
        assert_eq!(tiny_neg, 0.0);
        assert!(tiny_neg.is_sign_negative(), "(-0.01).toFixed(1) is \"-0.0\" -> -0");
        let neg_zero = js_to_fixed(-0.0, 1);
        assert!(neg_zero.is_sign_positive(), "(-0).toFixed(1) is \"0.0\" -> +0");
    }

    #[test]
    fn short_run_is_kept_whole() {
        let full = series(120, 0.05);
        let out = decimate_telemetry(&full, &[0.33, 2.0], MAX_TELEMETRY_POINTS).unwrap();
        assert_eq!(out, full);
    }

    #[test]
    fn exactly_at_cap_is_kept_whole() {
        let full = series(MAX_TELEMETRY_POINTS, 0.01);
        let out = decimate_telemetry(&full, &[1.0], MAX_TELEMETRY_POINTS).unwrap();
        assert_eq!(out.len(), MAX_TELEMETRY_POINTS);
        assert_eq!(out, full);
    }

    #[test]
    fn long_run_is_capped_and_keeps_endpoints() {
        let full = series(30_001, 0.01);
        let out = decimate_telemetry(&full, &[], MAX_TELEMETRY_POINTS).unwrap();
        assert_eq!(out.len(), MAX_TELEMETRY_POINTS);
        assert_eq!(out.first().unwrap().time, 0.0);
        assert_eq!(out.last().unwrap().time, full.last().unwrap().time);
        assert!(strictly_increasing(&out));
        // Deterministic.
        assert_eq!(out, decimate_telemetry(&full, &[], MAX_TELEMETRY_POINTS).unwrap());
    }

    #[test]
    fn long_run_keeps_event_points() {
        let full = series(30_001, 0.01);
        // Off-grid event times fall between samples; the nearest sample is kept.
        let events = [0.1234, 41.117, 187.5, 299.999, 300.0];
        let out = decimate_telemetry(&full, &events, MAX_TELEMETRY_POINTS).unwrap();
        assert!(out.len() <= MAX_TELEMETRY_POINTS);
        assert!(strictly_increasing(&out));
        for et in events {
            let nearest = full
                .iter()
                .min_by(|a, b| (a.time - et).abs().partial_cmp(&(b.time - et).abs()).unwrap())
                .unwrap();
            assert!(out.iter().any(|p| p.time == nearest.time), "event {} missing", et);
        }
    }

    #[test]
    fn colliding_times_are_repaired_not_emitted() {
        let mut full = series(10, 0.1);
        full[4].time = full[3].time; // display rounding collision
        let out = decimate_telemetry(&full, &[], 5000).unwrap();
        assert!(strictly_increasing(&out));
        assert_eq!(out.len(), 9);
        assert_eq!(out.first().unwrap().time, 0.0);
        assert_eq!(out.last().unwrap().time, full[9].time);
    }

    #[test]
    fn recorded_pressure_spike_survives_off_stride() {
        let mut full = series(30_001, 0.01);
        full[4].dynamic_pressure = 1234.0;
        let out = decimate_telemetry(&full, &[], MAX_TELEMETRY_POINTS).unwrap();
        assert_eq!(out.len(), MAX_TELEMETRY_POINTS);
        let sampled_peak = out.iter().map(|p| p.dynamic_pressure).fold(0.0, f64::max);
        eprintln!("synthetic off-stride spike: recorded 1234 Pa at 0.04 s; output {sampled_peak} Pa; {} points", out.len());
        assert!(out.contains(&full[4]), "off-stride recorded pressure peak missing");
        assert!(strictly_increasing(&out));
    }

    #[test]
    fn equal_pressure_maxima_keep_the_first_recorded_sample() {
        let mut full = series(11, 0.1);
        full[4].dynamic_pressure = 1234.0;
        full[8].dynamic_pressure = 1234.0;
        let out = decimate_telemetry(&full, &[], 3).unwrap();
        assert_eq!(out, vec![full[0], full[4], full[10]]);
        assert_eq!(out, decimate_telemetry(&full, &[], 3).unwrap());
    }

    #[test]
    fn pressure_peak_shares_forced_budget_without_displacing_events() {
        let mut full = series(11, 0.1);
        full[4].dynamic_pressure = 1234.0;
        assert!(decimate_telemetry(&full, &[], 2).unwrap_err().contains("3 forced points"));
        // An event at the peak reuses the same obligation; a distinct one does not.
        let out = decimate_telemetry(&full, &[full[4].time], 3).unwrap();
        assert_eq!(out, vec![full[0], full[4], full[10]]);
        assert!(decimate_telemetry(&full, &[full[6].time], 3)
            .unwrap_err().contains("4 forced points"));
        assert_eq!(decimate_telemetry(&full, &[full[6].time], 4).unwrap(),
            vec![full[0], full[4], full[6], full[10]]);
        full[0].dynamic_pressure = 2000.0;
        assert_eq!(decimate_telemetry(&full, &[], 2).unwrap(), vec![full[0], full[10]]);
    }

    #[test]
    fn invalid_pressures_do_not_define_or_replace_the_recorded_peak() {
        let mut full = series(9, 0.1);
        full[0].dynamic_pressure = -1.0;
        full[1].dynamic_pressure = f64::NAN;
        full[2].dynamic_pressure = f64::INFINITY;
        full[3].dynamic_pressure = f64::NEG_INFINITY;
        full[4].dynamic_pressure = 1234.0;
        let out = decimate_telemetry(&full, &[], 3).unwrap();
        assert_eq!(out, vec![full[0], full[4], full[8]]);
        let unbounded = decimate_telemetry(&full, &[], 9).unwrap();
        for (a, b) in unbounded.iter().zip(&full) {
            assert_eq!(a.dynamic_pressure.to_bits(), b.dynamic_pressure.to_bits());
        }
        for p in &mut full { p.dynamic_pressure = -1.0; }
        full[1].dynamic_pressure = f64::NAN;
        assert_eq!(decimate_telemetry(&full, &[], 2).unwrap(), vec![full[0], full[8]]);
    }

    #[test]
    fn pressure_peak_replaces_colliding_stride_sample() {
        let mut full = series(10, 0.1);
        full[4].time = full[3].time;
        full[4].dynamic_pressure = 1234.0;
        let out = decimate_telemetry(&full, &[], 10).unwrap();
        assert!(out.contains(&full[4]));
        assert!(!out.contains(&full[3]));
        assert!(strictly_increasing(&out));
        // The peak also wins when it is the earlier colliding index.
        full[4].dynamic_pressure = 0.0;
        full[3].dynamic_pressure = 1234.0;
        let out = decimate_telemetry(&full, &[], 10).unwrap();
        assert!(out.contains(&full[3]));
        assert!(!out.contains(&full[4]));
    }

    #[test]
    fn conflicting_forced_times_fail_instead_of_losing_required_samples() {
        let mut full = series(10, 0.1);
        full[4].time = full[3].time;
        full[4].dynamic_pressure = 1234.0;
        assert!(decimate_telemetry(&full, &[full[3].time], 10)
            .unwrap_err().contains("forced sample times"));
        full[4].time = full[5].time;
        // Event/peak at one index is fine even if a stride sample collides.
        assert!(decimate_telemetry(&full, &[full[4].time], 10).is_ok());
        full[4].time = full[0].time;
        assert!(decimate_telemetry(&full, &[], 10)
            .unwrap_err().contains("forced sample times"));
        full[4].time = full[9].time;
        assert!(decimate_telemetry(&full, &[], 10)
            .unwrap_err().contains("forced sample times"));

        let mut events = series(10, 0.1);
        events[3].time = 0.45;
        assert!(decimate_telemetry(&events, &[events[3].time, events[4].time], 10)
            .unwrap_err().contains("forced sample times"));
    }

    #[test]
    fn fails_closed() {
        assert!(decimate_telemetry(&[pt(0.0), pt(f64::NAN)], &[], 10).is_err());
        assert!(decimate_telemetry(&[pt(1.0), pt(1.0)], &[], 10).is_err());
        assert!(decimate_telemetry(&series(100, 0.1), &[1.0, 2.0, 3.0], 4).is_err());
        assert!(decimate_telemetry(&series(5, 0.1), &[f64::NAN], 10).is_err());
        assert!(decimate_telemetry(&[], &[], 10).unwrap().is_empty());
    }
}
