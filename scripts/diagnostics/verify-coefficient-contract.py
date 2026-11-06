"""Independent algebra checks for the P0 candidate; never runs production aero.

The wind basis is checked against a Gram-Schmidt construction from the velocity,
not against a second transcription of its angle matrix. These are mathematical
contract checks, not empirical validation or Rust/WASM implementation checks.
"""
import argparse
import hashlib
import json
import math
import random
from pathlib import Path


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def add(a, b):
    return tuple(x+y for x, y in zip(a, b))


def scale(k, a):
    return tuple(k*x for x in a)


def unit(a):
    return scale(1/math.sqrt(dot(a, a)), a)


def matrix_basis(alpha, beta):
    sa, ca, sb, cb = math.sin(alpha), math.cos(alpha), math.sin(beta), math.cos(beta)
    return ((cb, -sb*ca, -sb*sa), (sb, cb*ca, cb*sa), (0, -sa, ca))


def verify():
    worst = 0.0
    checks = 0

    def near(a, b, atol=2e-12):
        nonlocal worst, checks
        error = abs(a-b)
        worst = max(worst, error)
        checks += 1
        assert error <= atol, (a, b, error)

    rng = random.Random(20261025)
    for _ in range(200):
        velocity = (rng.uniform(-2, 2), rng.uniform(.1, 3), rng.uniform(-2, 2))
        ey = unit(velocity)
        ex = unit(add((1, 0, 0), scale(-ey[0], ey)))
        ez = cross(ex, ey)
        alpha = math.atan2(velocity[2], velocity[1])
        beta = math.atan2(velocity[0], math.hypot(velocity[1], velocity[2]))
        basis = matrix_basis(alpha, beta)
        for actual, expected in zip(basis, (ex, ey, ez)):
            for x, y in zip(actual, expected):
                near(x, y)
        for i in range(3):
            for j in range(3):
                near(dot(basis[i], basis[j]), float(i == j))
        near(dot(cross(basis[0], basis[1]), basis[2]), 1)
        force = tuple(rng.uniform(-5, 5) for _ in range(3))
        wind = tuple(dot(axis, force) for axis in basis)
        reconstructed = tuple(sum(basis[j][i]*wind[j] for j in range(3)) for i in range(3))
        for x, y in zip(force, reconstructed):
            near(x, y)
        # Unit qS: CD = -F dot eY, so mechanical power = -V*CD.
        near(dot(force, velocity), math.sqrt(dot(velocity, velocity))*wind[1])
        moment = tuple(rng.uniform(-5, 5) for _ in range(3))
        datum_shift = tuple(rng.uniform(-2, 2) for _ in range(3))
        translated = add(moment, cross(datum_shift, force))
        returned = add(translated, cross(scale(-1, datum_shift), force))
        for x, y in zip(moment, returned):
            near(x, y)

    basis = matrix_basis(math.pi/6, 0)
    force = (0, -2, -3)
    near(-dot(basis[1], force), math.sqrt(3)+1.5)
    near(-dot(basis[2], force), 3*math.sqrt(3)/2-1)
    for x, y in zip(add((6, 0, -4), cross((0, 1, 0), (-2, -1, -3))), (3, 0, -2)):
        near(x, y)
    c, j = 2-2, 2*1-2*3
    near(c*.01, 0)
    for cg in (-1, 0, 1, 7):
        near((j-cg*c)*.01, -.04)

    # Cone area A(x)=A_base*(x/l)^2; integrate independently by Simpson rule.
    n, length, area, sref = 100, 3.0, 2.0, 4.0
    step = length/n
    values = [area*(i*step/length)**2 for i in range(n+1)]
    integral = step/3*(values[0]+values[-1]+4*sum(values[1:-1:2])+2*sum(values[2:-1:2]))
    body_c = 2*area/sref
    body_j = 2*(length*area-integral)/sref
    near(body_c, 1)
    near(body_j/body_c, 2*length/3)
    c_one = (2*math.pi/(math.pi/4))/(1+math.sqrt(1+1))
    near(c_one, 8/(1+math.sqrt(2)))
    # Reference changes must preserve both the wrench and reduced-rate response.
    k, h, rate_derivative, omega, speed = 3.0, 2.0, 7.0, .3, 10.0
    moment_old = 2*4*5*rate_derivative*(omega*5/(2*speed))
    derivative_new = rate_derivative/(k*h*h)
    moment_new = 2*(k*4)*(h*5)*derivative_new*(omega*(h*5)/(2*speed))
    near(moment_old, moment_new)
    return {"status": "PASS", "scalarAssertions": checks, "randomCases": 200,
            "seed": 20261025, "maxAbsoluteResidual": worst,
            "scope": "algebra only; no production implementation or empirical accuracy claim"}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    result = verify()
    result["scriptSha256"] = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    if args.report:
        args.report.write_text(json.dumps(result, indent=2)+"\n")
    print(json.dumps(result, indent=2))
