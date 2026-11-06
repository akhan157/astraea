"""Reference-method checks only; these tests execute zero native trajectories."""
import copy
import importlib.util
import json
import math
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("candidate_reference", ROOT / "scripts/diagnostics/check-candidate-numerics.py")
m = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(m)


def advance(rhs, y, stop, h):
    t = 0.0
    while t < stop:
        end = min(t + h, stop)
        y = m.rk4(rhs, t, y, end - t)
        t = end
    return y


class ReferenceTests(unittest.TestCase):
    def setUp(self):
        self.plan = json.loads((ROOT / m.PLAN).read_text())
        self.base = json.loads((ROOT / self.plan["fixture"]).read_text())
        self.request = m.request_for(self.base, self.plan["cases"][0])

    def reference(self):
        return m.VerticalReference(self.request, self.plan["reference"])

    def test_constant_acceleration_exact_polynomial(self):
        y = advance(lambda t, y: (y[1], -9.80665), (3.0, 20.0), 1.234, .003)
        self.assertAlmostEqual(y[0], 3 + 20 * 1.234 - .5 * 9.80665 * 1.234 ** 2, delta=2e-12)
        self.assertAlmostEqual(y[1], 20 - 9.80665 * 1.234, delta=2e-12)

    def test_quadratic_drag_analytic_solution(self):
        # z'=v,v'=a-b*v² has a closed solution from rest, independent
        # of any trajectory/event implementation or table interpolation.
        a, b, t = 5.0, .03, 2.0
        y = advance(lambda t, y: (y[1], a - b * y[1] ** 2), (0.0, 0.0), t, .001)
        expected_v = math.sqrt(a / b) * math.tanh(math.sqrt(a * b) * t)
        expected_z = math.log(math.cosh(math.sqrt(a * b) * t)) / b
        self.assertAlmostEqual(y[0], expected_z, delta=2e-11)
        self.assertAlmostEqual(y[1], expected_v, delta=2e-11)

    def test_reference_rhs_matches_constant_mass_drag_closed_solution(self):
        ref = self.reference()
        # Constant density/thrust/mass isolate the dimensional RHS, rather
        # than only validating the generic RK4 stepping formula.
        mass, thrust, density = 2.0, 40.0, 1.2
        a = thrust / mass - ref.g
        b = .5 * density * ref.area * ref.ca / mass
        with patch.object(ref, "mass", return_value=mass), patch.object(ref, "thrust", return_value=thrust), patch.object(ref, "density", return_value=density):
            y = advance(ref.rhs, (0.0, 0.0), 2.0, .001)
        self.assertAlmostEqual(y[0], math.log(math.cosh(math.sqrt(a * b) * 2)) / b, delta=2e-11)
        self.assertAlmostEqual(y[1], math.sqrt(a / b) * math.tanh(math.sqrt(a * b) * 2), delta=2e-11)

    def test_exact_linear_segment_impulse_and_depletion(self):
        ref = self.reference()
        ref.curve = [(0.0, 0.0), (1.0, 10.0), (2.0, 0.0)]
        ref.motor = {"burnTime": 2.0, "dryMass": 1.0, "propellantMass": .2}
        ref.total_impulse, ref.dry = 10.0, 1.0
        self.assertEqual(ref.impulse(-1), 0)
        self.assertEqual(ref.impulse(.5), 1.25)
        self.assertEqual(ref.impulse(1), 5)
        self.assertEqual(ref.impulse(1.5), 8.75)
        self.assertEqual(ref.impulse(3), 10)
        self.assertAlmostEqual(ref.mass(.5), 2.175, delta=1e-15)
        self.assertEqual(ref.mass(3), 2)
        self.assertEqual(ref.thrust(.5), 5)
        self.assertEqual(ref.thrust(2), 0)

    def test_liftoff_contact_and_consumption(self):
        ref = self.reference()
        self.assertAlmostEqual(ref.thrust(ref.liftoff), ref.mass(ref.liftoff) * ref.g, delta=2e-13)
        self.assertLess(ref.mass(ref.liftoff), ref.mass(0))
        times = [0, ref.liftoff / 2, ref.liftoff, ref.liftoff + .01]
        values, rail = ref.integrate(times, .0001)
        self.assertIsNone(rail)
        for t in times[:-1]:
            self.assertEqual(values[t], (0, 0))
        self.assertGreater(values[times[-1]][0], 0)
        self.assertGreater(values[times[-1]][1], 0)

    def test_pressure_uses_launch_msl_plus_agl(self):
        ref = self.reference()
        expected = 100000 * .8 ** .1 / (287.05287 * 300)
        self.assertAlmostEqual(ref.density(0), expected, delta=1e-14)
        self.assertLess(ref.density(50), ref.density(0))
        with self.assertRaises(AssertionError):
            ref.density(1000)

    def test_zero_wind_and_vertical_reference_domain(self):
        self.request["candidate"]["launch"]["railElevationDeg"] = 85
        with self.assertRaises(AssertionError):
            self.reference()
        self.request["candidate"]["launch"]["railElevationDeg"] = 90
        self.request["environmentSelection"]["profile"]["knots"][0]["windTowardEnuMps"]["up"] = 1
        with self.assertRaises(AssertionError):
            self.reference()

    def test_frozen_mutations_and_repeat_are_exact(self):
        repeat = m.request_for(self.base, self.plan["cases"][6])
        original = m.request_for(self.base, self.plan["cases"][4])
        self.assertEqual(repeat, original)
        self.assertEqual(self.base["candidate"]["launch"]["railElevationDeg"], 85)
        expiry = m.request_for(self.base, self.plan["cases"][7])
        self.assertEqual(expiry["environmentSelection"]["profile"]["validity"]["untilUtcUnixS"], expiry["environmentSelection"]["launchTimeUtcUnixS"] + 2)
        coverage = m.request_for(self.base, self.plan["cases"][8])
        self.assertEqual(coverage["environmentSelection"]["profile"]["knots"][-1]["altitudeM"], 100)
        self.assertEqual(len(self.plan["cases"]), self.plan["nativeCallBudget"])

    def test_offgrid_reference_and_rail_refinement(self):
        ref = self.reference()
        coarse, cr = ref.integrate([0, .1, 1.86, 2.003], .0002)
        fine, fr = ref.integrate([0, .1, 1.86, 2.003], .0001)
        self.assertEqual(set(fine), {0, .1, 1.86, 2.003})
        self.assertLess(abs(cr["estimateS"] - fr["estimateS"]), 1e-7)
        self.assertLessEqual(fr["bracketWidthS"], .0001 + 1e-15)
        for t in fine:
            self.assertLess(abs(coarse[t][0] - fine[t][0]), 1e-7)
            self.assertLess(abs(coarse[t][1] - fine[t][1]), 1e-7)


if __name__ == "__main__":
    unittest.main()
