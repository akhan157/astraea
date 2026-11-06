//! Freeform fin planform geometry — the Rust twin of `src/aero/finPlanform.ts`.
//!
//! The outline of one fin is a polygon in the fin plane (x aft from the root
//! leading edge, y outward from the body). It is cut into strips at every
//! vertex ordinate; inside a strip both edges are straight, so the area, mean
//! aerodynamic chord, MAC leading edge, centroid and the span-weighted
//! cosines of the mid-chord and leading-edge angles are exact closed forms.
//! OpenRocket's `FinSetCalc` evaluates the same integrals on 48 uniform strips.
//!
//! Every operation mirrors the TypeScript oracle in order, so the two agree to
//! the last few ulps (`f64::hypot` and `Math.hypot` are the only libm calls).

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FinPoint {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Copy)]
pub struct FreeformPlanform {
    pub span: f64,
    pub root_chord: f64,
    pub tip_chord: f64,
    pub area: f64,
    /// `2·area/span` — the trapezoid's (root + tip chord).
    pub chord_sum: f64,
    /// Mid-chord line length `span/cosΓ`.
    pub mid_chord_length: f64,
    pub mac_length: f64,
    pub mac_lead: f64,
    pub centroid_x: f64,
    /// Span-weighted mean cosine of the leading-edge sweep angle.
    pub cos_leading_edge: f64,
    /// Span-weighted integral of the squared local leading-edge cosine.
    pub cos_leading_edge_squared: f64,
    pub min_x: f64,
    pub max_x: f64,
}

fn fail<T>(msg: String) -> Result<T, String> {
    Err(format!("vehicle geometry: freeform fin {msg}"))
}

fn orient(a: FinPoint, b: FinPoint, c: FinPoint) -> f64 {
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

fn on_segment(a: FinPoint, b: FinPoint, p: FinPoint) -> bool {
    a.x.min(b.x) <= p.x && p.x <= a.x.max(b.x) && a.y.min(b.y) <= p.y && p.y <= a.y.max(b.y)
}

fn segments_intersect(p1: FinPoint, p2: FinPoint, p3: FinPoint, p4: FinPoint) -> bool {
    let o1 = orient(p1, p2, p3);
    let o2 = orient(p1, p2, p4);
    let o3 = orient(p3, p4, p1);
    let o4 = orient(p3, p4, p2);
    if ((o1 > 0.0 && o2 < 0.0) || (o1 < 0.0 && o2 > 0.0))
        && ((o3 > 0.0 && o4 < 0.0) || (o3 < 0.0 && o4 > 0.0))
    {
        return true;
    }
    (o1 == 0.0 && on_segment(p1, p2, p3))
        || (o2 == 0.0 && on_segment(p1, p2, p4))
        || (o3 == 0.0 && on_segment(p3, p4, p1))
        || (o4 == 0.0 && on_segment(p3, p4, p2))
}

/// Errors with the oracle's message unless `points` is a valid freeform outline.
pub fn validate_freeform_points(points: &[FinPoint]) -> Result<(), String> {
    let n = points.len();
    if n < 3 {
        return fail(format!("needs at least 3 points (got {n})"));
    }
    for (i, p) in points.iter().enumerate() {
        if !p.x.is_finite() || !p.y.is_finite() {
            return fail(format!("point {} must have finite x and y", i + 1));
        }
    }
    if points[0].x != 0.0 || points[0].y != 0.0 {
        return fail(format!(
            "first point must be the root leading edge (0, 0) on the body (got {}, {})",
            points[0].x, points[0].y
        ));
    }
    let last = points[n - 1];
    if last.y != 0.0 {
        return fail(format!("last point must lie on the body at y = 0 (got y = {})", last.y));
    }
    if !(last.x > 0.0) {
        return fail(format!(
            "last point must be the root trailing edge behind the leading edge (got x = {})",
            last.x
        ));
    }
    for i in 1..n - 1 {
        if points[i].y < 0.0 {
            return fail(format!(
                "point {} is inside the body (y = {} < 0)",
                i + 1,
                points[i].y
            ));
        }
        if points[i].y == 0.0 {
            return fail(format!(
                "point {} lies on the root line (y = 0); only the first and last point may",
                i + 1
            ));
        }
    }
    for i in 0..n {
        let a = points[i];
        let b = points[(i + 1) % n];
        if a.x == b.x && a.y == b.y {
            return fail(format!("points {} and {} are identical", i + 1, ((i + 1) % n) + 1));
        }
    }
    for i in 0..n {
        let a1 = points[i];
        let a2 = points[(i + 1) % n];
        for j in i + 1..n {
            let b1 = points[j];
            let b2 = points[(j + 1) % n];
            let adjacent = j == i + 1 || (i == 0 && j == n - 1);
            if adjacent {
                let (shared, far_a, far_b) = if j == i + 1 { (a2, a1, b2) } else { (a1, a2, b1) };
                let cross = orient(shared, far_a, far_b);
                let dot = (far_a.x - shared.x) * (far_b.x - shared.x)
                    + (far_a.y - shared.y) * (far_b.y - shared.y);
                if cross == 0.0 && dot > 0.0 {
                    return fail(format!(
                        "edges at point {} fold back onto each other",
                        (if j == i + 1 { j } else { i }) + 1
                    ));
                }
                continue;
            }
            if segments_intersect(a1, a2, b1, b2) {
                return fail(format!(
                    "outline is not a simple polygon: edge {}–{} meets edge {}–{}",
                    i + 1,
                    ((i + 1) % n) + 1,
                    j + 1,
                    ((j + 1) % n) + 1
                ));
            }
        }
    }
    Ok(())
}

fn x_on_edge(a: FinPoint, b: FinPoint, y: f64) -> f64 {
    if y == a.y {
        return a.x;
    }
    if y == b.y {
        return b.x;
    }
    a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y)
}

/// Validates the polygon and integrates the planform quantities.
pub fn analyze_freeform_planform(points: &[FinPoint]) -> Result<FreeformPlanform, String> {
    validate_freeform_points(points)?;
    let n = points.len();

    let mut ys: Vec<f64> = Vec::new();
    for p in points {
        if !ys.contains(&p.y) {
            ys.push(p.y);
        }
    }
    ys.sort_by(|a, b| a.partial_cmp(b).expect("validated finite"));
    let span = ys[ys.len() - 1];

    let mut area = 0.0;
    let mut chord_squared = 0.0;
    let mut lead_moment = 0.0;
    let mut cos_mid = 0.0;
    let mut cos_lead = 0.0;
    let mut cos_lead_squared = 0.0;
    let mut root_chord = 0.0;
    let mut tip_chord = 0.0;
    let mut min_x = f64::INFINITY;
    let mut max_x = f64::NEG_INFINITY;
    for p in points {
        if p.x < min_x {
            min_x = p.x;
        }
        if p.x > max_x {
            max_x = p.x;
        }
    }

    for k in 0..ys.len() - 1 {
        let y0 = ys[k];
        let y1 = ys[k + 1];
        let h = y1 - y0;
        let mut crossing: Vec<(f64, f64)> = Vec::new();
        for i in 0..n {
            let a = points[i];
            let b = points[(i + 1) % n];
            if a.y == b.y {
                continue;
            }
            let lo = a.y.min(b.y);
            let hi = a.y.max(b.y);
            if lo <= y0 && hi >= y1 {
                crossing.push((x_on_edge(a, b, y0), x_on_edge(a, b, y1)));
            }
        }
        if crossing.len() != 2 {
            return fail(format!(
                "has {} outline edges across span {}–{} m; notches, holes and detached sections \
                 are not supported (one material interval per span station)",
                crossing.len(),
                y0,
                y1
            ));
        }
        // Stable sort by mid-station x, as the oracle's comparator does.
        crossing.sort_by(|p, q| {
            (p.0 + p.1 - (q.0 + q.1))
                .partial_cmp(&0.0)
                .expect("validated finite")
        });
        let (le0, le1) = crossing[0];
        let (te0, te1) = crossing[1];
        let c0 = te0 - le0;
        let c1 = te1 - le1;
        if c0 < 0.0 || c1 < 0.0 {
            return fail(format!("outline crosses itself near span {y0}–{y1} m"));
        }
        if k == 0 {
            root_chord = c0;
        }
        tip_chord = c1;
        area += (h * (c0 + c1)) / 2.0;
        chord_squared += (h * (c0 * c0 + c0 * c1 + c1 * c1)) / 3.0;
        lead_moment += h
            * (le0 * c0
                + (le0 * (c1 - c0) + (le1 - le0) * c0) / 2.0
                + ((le1 - le0) * (c1 - c0)) / 3.0);
        let mid0 = (le0 + te0) / 2.0;
        let mid1 = (le1 + te1) / 2.0;
        cos_mid += (h * h) / h.hypot(mid1 - mid0);
        cos_lead += (h * h) / h.hypot(le1 - le0);
        cos_lead_squared += (h * h * h) / (h * h + (le1 - le0) * (le1 - le0));
    }
    if !(area > 0.0) {
        return fail("has no area".to_string());
    }
    cos_mid /= span;
    cos_lead /= span;
    cos_lead_squared /= span;

    Ok(FreeformPlanform {
        span,
        root_chord,
        tip_chord,
        area,
        chord_sum: (2.0 * area) / span,
        mid_chord_length: span / cos_mid,
        mac_length: chord_squared / area,
        mac_lead: lead_moment / area,
        centroid_x: (lead_moment + chord_squared / 2.0) / area,
        cos_leading_edge: cos_lead,
        cos_leading_edge_squared: cos_lead_squared,
        min_x,
        max_x,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pts(v: &[(f64, f64)]) -> Vec<FinPoint> {
        v.iter().map(|&(x, y)| FinPoint { x, y }).collect()
    }

    #[test]
    fn trapezoid_polygon_reduces_to_closed_forms() {
        let (cr, ct, s, m) = (0.070, 0.028, 0.051, 0.038);
        let p = analyze_freeform_planform(&pts(&[(0.0, 0.0), (m, s), (m + ct, s), (cr, 0.0)]))
            .unwrap();
        let rel = |a: f64, b: f64| assert!((a - b).abs() <= 1e-12 * b.abs().max(1.0), "{a} vs {b}");
        rel(p.area, 0.5 * (cr + ct) * s);
        rel(p.chord_sum, cr + ct);
        rel(p.mid_chord_length, s.hypot(m + 0.5 * ct - 0.5 * cr));
        rel(p.mac_length, (2.0 / 3.0) * (cr + ct - cr * ct / (cr + ct)));
        rel(p.mac_lead, m * (cr + 2.0 * ct) / (3.0 * (cr + ct)));
        rel(p.cos_leading_edge, s / s.hypot(m));
        rel(p.root_chord, cr);
        rel(p.tip_chord, ct);
    }

    #[test]
    fn invalid_outlines_use_the_oracle_messages() {
        let err = |v: &[(f64, f64)]| validate_freeform_points(&pts(v)).unwrap_err();
        assert!(err(&[(0.0, 0.0), (0.05, 0.0)]).contains("at least 3 points"));
        assert!(err(&[(0.01, 0.0), (0.03, 0.05), (0.08, 0.0)]).contains("first point must be the root leading edge"));
        assert!(err(&[(0.0, 0.0), (0.03, -0.01), (0.08, 0.0)]).contains("point 2 is inside the body"));
        assert!(err(&[(0.0, 0.0), (0.03, 0.0), (0.08, 0.0)]).contains("lies on the root line"));
        assert!(err(&[(0.0, 0.0), (0.06, 0.05), (0.03, 0.05), (0.05, 0.02), (0.08, 0.0)])
            .contains("not a simple polygon"));
        let slot = pts(&[
            (0.0, 0.0), (0.0, 0.06), (0.04, 0.06), (0.04, 0.02),
            (0.06, 0.02), (0.06, 0.06), (0.1, 0.06), (0.1, 0.0),
        ]);
        assert!(validate_freeform_points(&slot).is_ok());
        assert!(analyze_freeform_planform(&slot)
            .unwrap_err()
            .contains("4 outline edges across span 0.02–0.06 m"));
    }
}
