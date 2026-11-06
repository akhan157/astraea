#!/usr/bin/env python3
"""Independent re-derivation for RMP12-attitude-display (proposal gate).

Pure standard-library numerics against the shipped formulas:
  crates/astraea-core/src/six_dof.rs:152 quaternion_to_matrix
  crates/astraea-core/src/six_dof.rs:185-198 quaternion_to_euler_deg
  src/sim/sixDofSimulator.ts:280-302 quaternionToEulerDeg

Sections:
  1. the shipped matrix is the standard active body->nav rotation
  2. composition order and exact extraction (two candidate conventions)
  3. the code-native rail invariant selects the convention
  4. no interpretation of the shipped triple reconstructs R
  5. q / -q, gimbal lock, clamp
  6. retained RMP12-knot-split replies (read-only, optional)
  7. generated telemetry fixture byte deltas (read-only, optional)

Usage:
  python3 derive_attitude.py [--evidence DIR] [--fixture PATH]

No writes, no network, no build.
"""
import argparse
import json
import math
import os
import random

# ---------------------------------------------------------------- quaternions
def qmul(a, b):
    aw, ax, ay, az = a
    bw, bx, by, bz = b
    return (aw * bw - ax * bx - ay * by - az * bz,
            aw * bx + ax * bw + ay * bz - az * by,
            aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw)

def axis_angle(axis, deg):
    h = math.radians(deg) / 2.0
    s = math.sin(h)
    return (math.cos(h), axis[0] * s, axis[1] * s, axis[2] * s)

def qx(d): return axis_angle((1, 0, 0), d)
def qy(d): return axis_angle((0, 1, 0), d)
def qz(d): return axis_angle((0, 0, 1), d)

def mat_quat(q):
    w, x, y, z = q
    return [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
            [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
            [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]

def mat_axis(axis, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    if axis == 0:
        return [[1, 0, 0], [0, c, -s], [0, s, c]]
    if axis == 1:
        return [[c, 0, s], [0, 1, 0], [-s, 0, c]]
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]]

def mm(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]

def md(a, b):
    return max(abs(a[i][j] - b[i][j]) for i in range(3) for j in range(3))

def clamp(x):
    return max(-1.0, min(1.0, x))

# ---------------------------------------------------------------- extractions
def shipped(q):
    """Shipped Rust/TS triple: sixth_dof.rs:185-198."""
    w, x, y, z = q
    sp = 2 * (w * x - y * z)
    p = math.copysign(math.pi / 2, sp) if abs(sp) >= 1 else math.asin(sp)
    return (math.degrees(p),
            math.degrees(math.atan2(2 * (w * y + z * x), 1 - 2 * (x * x + y * y))),
            math.degrees(math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))))

def conv_a(q):
    """R = Rz(yaw) Ry(roll) Rx(pitch): roll is the middle angle."""
    w, x, y, z = q
    return (math.degrees(math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))),
            math.degrees(math.asin(clamp(2 * (w * y - z * x)))),
            math.degrees(math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))))

def conv_b(q):
    """R = Rz(yaw) Rx(pitch) Ry(roll): pitch about +X, roll about +Y (nose)."""
    w, x, y, z = q
    return (math.degrees(math.asin(clamp(2 * (w * x + y * z)))),
            math.degrees(math.atan2(2 * (w * y - z * x), 1 - 2 * (x * x + y * y))),
            math.degrees(math.atan2(2 * (w * z - x * y), 1 - 2 * (x * x + z * z))))

def compose_a(pitch, roll, yaw):   # R = Rz Ry Rx, q = qz*qy*qx
    return qmul(qz(yaw), qmul(qy(roll), qx(pitch)))

def compose_b(pitch, roll, yaw):   # R = Rz Rx Ry, q = qz*qx*qy
    return qmul(qz(yaw), qmul(qx(pitch), qy(roll)))

def ang_err(got, want, k):
    if k == 0:
        return abs(got - want)
    return abs((got - want + 180.0) % 360.0 - 180.0)

def launch_q(el, az):
    """Exact transcription of six_dof.rs:2208-2240 initial attitude."""
    elr, azr = math.radians(el), math.radians(az)
    rail = (math.cos(elr) * math.sin(azr), math.cos(elr) * math.cos(azr), math.sin(elr))
    dot_y = rail[1]
    if dot_y >= 0.9999:
        return (1.0, 0.0, 0.0, 0.0)
    rx, rz = rail[2], -rail[0]
    norm = math.hypot(rx, rz)
    if norm <= 1e-6:
        return (1.0, 0.0, 0.0, 0.0)
    ang = math.acos(clamp(dot_y))
    sh = math.sin(ang / 2)
    return (math.cos(ang / 2), rx / norm * sh, 0.0, rz / norm * sh)

def rot(q, v):
    r = qmul(qmul(q, (0.0,) + tuple(v)), (q[0], -q[1], -q[2], -q[3]))
    return r[1:]

def run(evidence=None, fixture=None):
    random.seed(20261029)
    print("== 1. shipped quaternion_to_matrix is the standard active body->nav map")
    worst = 0.0
    for _ in range(100):
        q = [random.gauss(0, 1) for _ in range(4)]
        n = math.sqrt(sum(t * t for t in q))
        q = tuple(t / n for t in q)
        m = mat_quat(q)
        for j, v in enumerate([(1, 0, 0), (0, 1, 0), (0, 0, 1)]):
            c = rot(q, v)
            for i in range(3):
                worst = max(worst, abs(m[i][j] - c[i]))
    print("   max |matrix - q v q*| over 100 random q: %.3e\n" % worst)

    print("== 2. composition order and exact extraction")
    p, r, yw = 17.19, 11.46, 28.65
    print("   qz*qy*qx == Rz*Ry*Rx: %.3e" % md(mat_quat(compose_a(p, r, yw)),
                                               mm(mat_axis(2, yw), mm(mat_axis(1, r), mat_axis(0, p)))))
    print("   qz*qx*qy == Rz*Rx*Ry: %.3e" % md(mat_quat(compose_b(p, r, yw)),
                                               mm(mat_axis(2, yw), mm(mat_axis(0, p), mat_axis(1, r)))))
    wa = [0.0, 0.0, 0.0]
    wb = [0.0, 0.0, 0.0]
    for _ in range(3000):
        p = random.uniform(-89, 89)
        r = random.uniform(-89, 89)
        yw = random.uniform(-179, 179)
        a = conv_a(compose_a(p, r, yw))
        b = conv_b(compose_b(p, r, yw))
        for k in range(3):
            wa[k] = max(wa[k], ang_err(a[k], (p, r, yw)[k], k))
            wb[k] = max(wb[k], ang_err(b[k], (p, r, yw)[k], k))
    print("   convention A (Rz Ry Rx) recovery err pitch/roll/yaw: %s" % ["%.2e" % v for v in wa])
    print("   convention B (Rz Rx Ry) recovery err pitch/roll/yaw: %s" % ["%.2e" % v for v in wb])
    print("   (both are exact on their own composition; exactness alone cannot select)\n")

    print("== 3. code-native rail invariant selects B")
    print("   launch attitude aligns body +Y with the rail vector; therefore")
    print("   pitch must read the rail elevation and yaw must read -rail azimuth.")
    wa = [0.0, 0.0]
    wb = [0.0, 0.0]
    for el in (70, 75, 80, 85, 88, 89):
        for az in (-180, -135, -90, -45, -10, 0, 30, 45, 90, 135, 179):
            q = launch_q(el, az)
            a = conv_a(q)
            b = conv_b(q)
            wa = [max(wa[0], abs(a[0] - el)), max(wa[1], ang_err(a[2], -az, 2))]
            wb = [max(wb[0], abs(b[0] - el)), max(wb[1], ang_err(b[2], -az, 2))]
    print("   A max |pitch-elevation| / |yaw+azimuth|: %.3e / %.3e" % tuple(wa))
    print("   B max |pitch-elevation| / |yaw+azimuth|: %.3e / %.3e" % tuple(wb))
    for el, az in ((85, 30), (70, 90), (80, -45)):
        q = launch_q(el, az)
        bx = rot(q, (1, 0, 0))
        nose = rot(q, (0, 1, 0))
        ref = rot(qmul(qz(-az), qx(el)), (1, 0, 0))
        e2 = [nose[1] * ref[2] - nose[2] * ref[1],
              nose[2] * ref[0] - nose[0] * ref[2],
              nose[0] * ref[1] - nose[1] * ref[0]]
        twist = math.degrees(math.atan2(sum(bx[i] * e2[i] for i in range(3)),
                                        sum(bx[i] * ref[i] for i in range(3))))
        print("   el=%d az=%d: B roll %.6f == geometric twist about nose %.6f"
              % (el, az, conv_b(q)[1], twist))
    print()

    print("== 4. shipped triple is not a decomposition (576 interpretations)")
    samples = []
    for _ in range(200):
        q = compose_a(random.uniform(-80, 80), random.uniform(-80, 80), random.uniform(-170, 170))
        samples.append((q, mat_quat(q)))
    import itertools
    axes = list(itertools.permutations([0, 1, 2]))
    maps = list(itertools.permutations([0, 1, 2]))
    signs = [(a, b, c) for a in (1, -1) for b in (1, -1) for c in (1, -1)]
    close = 0
    best = None
    for order in axes:
        for mp in maps:
            for sg in signs:
                for fl in (False, True):
                    mx = 0.0
                    for q, r0 in samples:
                        t = shipped(q)
                        ang = [t[mp[k]] * sg[k] for k in range(3)]
                        r = mat_axis(order[1], ang[1])
                        r = mm(r, mat_axis(order[2], ang[2]))
                        r = mm(mat_axis(order[0], ang[0]), r)
                        if fl:
                            r = [[r[j][i] for j in range(3)] for i in range(3)]
                        mx = max(mx, md(r, r0))
                    if best is None or mx < best[0]:
                        best = (mx, order, mp, sg, fl)
                    if mx < 0.01:
                        close += 1
    print("   best max|dR| over 576 interpretations: %.6f rad (order/map/sign/transpose %s)"
          % (best[0], best[1:]))
    print("   interpretations within 0.01 rad: %d of 576" % close)
    print("   witness (pitch 17.19, roll 11.46, yaw 28.65):")
    q = compose_a(17.19, 11.46, 28.65)
    print("     shipped %s vs true %s" % (["%.4f" % v for v in shipped(q)], [17.19, 11.46, 28.65]))
    print()

    print("== 5. q/-q, lock, clamp")
    worst = 0.0
    for _ in range(2000):
        q = [random.gauss(0, 1) for _ in range(4)]
        n = math.sqrt(sum(t * t for t in q))
        q = tuple(t / n for t in q)
        nq = tuple(-t for t in q)
        for fn in (conv_b, shipped):
            a, b = fn(q), fn(nq)
            worst = max(worst, max(abs(a[i] - b[i]) for i in range(3)))
    print("   q vs -q max deviation (B and shipped): %r" % worst)
    for p in (89.0, 89.9999, 90.0):
        q = compose_b(p, 30.0, 40.0)
        print("   B at pitch %8.4f: %s" % (p, ["%.6f" % v for v in conv_b(q)]))
    base = compose_b(90.0, 30.0, 40.0)
    for eps in (1e-9, 1e-15):
        mx = [0.0, 0.0, 0.0]
        for c in range(4):
            for s in (1, -1):
                q = list(base)
                q[c] += s * eps
                n = math.sqrt(sum(t * t for t in q))
                q = [t / n for t in q]
                a, b = conv_b(tuple(q)), conv_b(base)
                for k in range(3):
                    mx[k] = max(mx[k], abs(a[k] - b[k]))
        print("   lock perturbation |dq|=%.0e -> max |d pitch/roll/yaw| %s" % (eps, ["%.3e" % v for v in mx]))
    q = [t * (1 + 1e-9) for t in qy(90.0)]
    print("   non-unit q (1+1e-9) at pure roll 90: B roll %.9f (clamped, finite)"
          % conv_b(tuple(q))[1])
    print()

    if evidence and os.path.isdir(evidence):
        print("== 6. retained RMP12-knot-split replies (read-only)")
        def load(path):
            return json.load(open(path))["ok"]["telemetry"]
        for case in ("wind0", "wind3"):
            nat = load(os.path.join(evidence, "astraea-%s.native.stdout" % case))
            was = load(os.path.join(evidence, "astraea-%s.wasm.stdout" % case))
            rec = 0.0
            for pt in nat:
                o = shipped((pt["q"]["w"], pt["q"]["x"], pt["q"]["y"], pt["q"]["z"]))
                rec = max(rec, abs(o[0] - pt["pitchDeg"]), abs(o[1] - pt["rollDeg"]),
                          abs(o[2] - pt["yawDeg"]))
            def parity(fn):
                # The wire carries the conversion rounded to 1 decimal
                # (six_dof.rs:2797, sixDofSimulator.ts:1172-1174); compare those.
                cnt = 0
                mx = [0.0, 0.0, 0.0]
                for a, b in zip(nat, was):
                    va = [float("%.1f" % v) for v in
                          fn((a["q"]["w"], a["q"]["x"], a["q"]["y"], a["q"]["z"]))]
                    vb = [float("%.1f" % v) for v in
                          fn((b["q"]["w"], b["q"]["x"], b["q"]["y"], b["q"]["z"]))]
                    for k in range(3):
                        d = abs(va[k] - vb[k])
                        mx[k] = max(mx[k], d)
                        if d > 1e-9 * max(abs(vb[k]), 1.0):
                            cnt += 1
                return cnt, mx
            co, mo = parity(shipped)
            cn, mn = parity(conv_b)
            oldp = [pt["pitchDeg"] for pt in nat]
            newp = [conv_b((pt["q"]["w"], pt["q"]["x"], pt["q"]["y"], pt["q"]["z"]))[0] for pt in nat]
            print("   %s: recorded==shipped max diff %.3e (1-decimal rounding)" % (case, rec))
            print("     shipped parity failing fields %d (max %s)" % (co, ["%.2e" % v for v in mo]))
            print("     B parity failing fields %d (max %s)" % (cn, ["%.2e" % v for v in mn]))
            print("     pitch range shipped [%.2f,%.2f] B [%.2f,%.2f]"
                  % (min(oldp), max(oldp), min(newp), max(newp)))
        print()

    if fixture and os.path.isfile(fixture):
        print("== 7. generated fixture byte deltas (read-only)")
        doc = json.load(open(fixture))
        idx = {n: i for i, n in enumerate(doc["fields"])}
        def r1(x):
            return float("%.1f" % x)
        for case in doc["cases"]:
            rows = case["points"]
            diffs = [0, 0, 0]
            mx = [0.0, 0.0, 0.0]
            for row in rows:
                q = (row[idx["q.w"]], row[idx["q.x"]], row[idx["q.y"]], row[idx["q.z"]])
                new = [r1(v) for v in conv_b(q)]
                old = [row[idx["pitchDeg"]], row[idx["rollDeg"]], row[idx["yawDeg"]]]
                for k in range(3):
                    d = abs(new[k] - old[k]) if k == 0 else ang_err(new[k], old[k], k)
                    if d > 1e-9:
                        diffs[k] += 1
                    mx[k] = max(mx[k], d)
            print("   %s: %d rows; rounded changes pitch/roll/yaw %s; max |delta| %s"
                  % (case["case"], len(rows), diffs, ["%.2f" % v for v in mx]))
        print()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--evidence", default="")
    ap.add_argument("--fixture", default="")
    args = ap.parse_args()
    run(args.evidence, args.fixture)
