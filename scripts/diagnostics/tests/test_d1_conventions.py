"""Fault injection for the retained D1 conventions and near-zero floor guard."""
from copy import deepcopy
import importlib.util
import math
from pathlib import Path
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location(
    "d1_conventions", ROOT / "scripts/diagnostics/check-d1-conventions.py")
conventions = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(conventions)


class ConventionsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.base, cls.provenance = conventions.load_records(ROOT)

    def setUp(self):
        self.data = deepcopy(self.base)

    def refused(self, mutation, message):
        data = deepcopy(self.base)
        mutation(data)
        with self.assertRaisesRegex(conventions.Refusal, message):
            conventions.evaluate(data)

    def test_result_reports_computational_work_not_qualification(self):
        result = conventions.evaluate(self.base)
        self.assertEqual(result["conventions_status"],
                         "computational-invariance-verified-signs-open")
        self.assertEqual(result["qualified_cases"], 0)
        self.assertEqual(len(result["paired_wrenches"]), 7)
        self.assertEqual(len(result["reference_invariance"]), 28)
        self.assertEqual(len(result["datum_translation"]), 14)
        self.assertEqual(len(result["guards_exercised"]), 5)
        self.assertEqual(len(result["nearzero_floor"]), 22)
        self.assertEqual(result["axial"]["status"],
                         "blocked-unresolved-base-correction-sign-and-uncertainty-term")
        self.assertIsNone(result["axial"]["corrected_ca_bound"])


    def test_every_retained_coefficient_enters_a_paired_wrench(self):
        result = conventions.evaluate(self.base)
        consumed = set()
        for pair in result["paired_wrenches"]:
            consumed.add(pair["cn"])
            consumed.add(pair["cm"])
        points = self.base["normalized"]
        normalized = {point["reading"]["value"] for point in points}
        sb1 = {reader["coefficient"]
               for pair in self.base["sb1_comparison"]["pairs"]
               for reader in (pair["first_reader"], pair["independent_root_reader"])}
        self.assertTrue(normalized <= consumed)
        self.assertTrue(sb1 <= consumed)

    def test_record_digest_must_match_its_manifest(self):
        index = conventions.manifest_index(ROOT)
        target = conventions.FILES["normalized"]
        index[target] = {"path": "normalized-reading-points.json",
                         "bytes": index[target]["bytes"],
                         "sha256": "0" * 64}
        with patch.object(conventions, "manifest_index", return_value=index):
            with self.assertRaisesRegex(conventions.Refusal, "retained custody mismatch"):
                conventions.load_records(ROOT)

    def test_unattested_record_refused(self):
        index = conventions.manifest_index(ROOT)
        index.pop(conventions.FILES["sb1_comparison"])
        with patch.object(conventions, "manifest_index", return_value=index):
            with self.assertRaisesRegex(conventions.Refusal, "not attested"):
                conventions.load_records(ROOT)

    def test_every_normalized_record_must_be_consumed(self):
        self.refused(lambda data: data["normalized"].pop(), "must be consumed")

    def test_every_comparison_record_must_be_consumed(self):
        self.refused(lambda data: data["first_comparison"]["comparisons"].pop(),
                     "must be consumed")

    def test_every_sb1_pair_must_be_consumed(self):
        self.refused(lambda data: data["sb1_comparison"]["pairs"].pop(), "must be consumed")

    def test_excluded_zero_targets_cannot_disappear(self):
        self.refused(lambda data: data["sb1_comparison"]["nearzero_disposition"].pop("CN"),
                     "excluded near-zero targets missing")

    def test_raw_ca_bound_cannot_become_corrected_uncertainty(self):
        with self.assertRaisesRegex(conventions.Refusal, "must not be transferred"):
            conventions.corrected_uncertainty(0.004, None)
        self.assertEqual(conventions.corrected_uncertainty(0.004, 0.002), 0.006)

    def test_axial_merge_requires_an_evidenced_sign(self):
        with self.assertRaisesRegex(conventions.Refusal, "base-correction sign"):
            conventions.corrected_axial(0.1, 0.02, None)
        self.assertAlmostEqual(conventions.corrected_axial(0.1, 0.02, -1), 0.08)

    def test_fake_axial_extraction_refused(self):
        def mutation(data):
            for entry in data["first_subset"]["series"]:
                if entry["id"] == "d4013-cacorr-m1p20":
                    entry["status"] = "extracted"
        self.refused(mutation, "must remain unextracted")

    def test_direct_cross_source_moment_merge_refused(self):
        with self.assertRaisesRegex(conventions.Refusal, "moment-station conflation"):
            conventions.merge_cm_direct("19670020050", "19670020031")


    def test_translation_matches_p0_known_value_fixture(self):
        result = conventions.evaluate(self.base)
        fixture = result["translation_fixtures"]["p0_known_value_fixture"]
        self.assertEqual(fixture["expected_moment"], [3.0, 0.0, -2.0])
        for computed, expected in zip(fixture["computed_moment"],
                                      fixture["expected_moment"]):
            self.assertAlmostEqual(computed, expected, places=12)
        forward = result["translation_fixtures"]["d4013_datum_forward_fixture"]
        self.assertAlmostEqual(forward["expected_shift"], 1.2166666666666666, places=12)
        self.assertAlmostEqual(forward["scalar_forward_pitch_moment"],
                               1.7166666666666666, places=12)
        self.assertAlmostEqual(forward["scalar_forward_pitch_moment"],
                               forward["full_cross_forward_pitch_moment"], places=12)

    def test_forward_value_tracks_the_retained_moment(self):
        result = conventions.evaluate(self.base)
        baseline = {row["pair"]: row["forward_pitch_moment"]
                    for row in result["datum_translation"]
                    if row["reference"] == "drawing-2.25in"}
        data = deepcopy(self.base)
        point = next(point for point in data["normalized"]
                     if point["point_id"] == "d4013-cm-m1p20-alpha-2")
        point["reading"]["value"] += 0.1
        moved = {row["pair"]: row["forward_pitch_moment"]
                 for row in conventions.evaluate(data)["datum_translation"]
                 if row["reference"] == "drawing-2.25in"}
        self.assertAlmostEqual(moved["d4013-m1p20-nominal--2"]
                               - baseline["d4013-m1p20-nominal--2"], 0.1, places=12)

    def test_datum_translation_starts_at_recorded_d4013_datum(self):
        result = conventions.evaluate(self.base)
        for row in result["datum_translation"]:
            datum = result["d4013_datums"][row["reference"]]["drawing_station_m"]
            self.assertEqual(row["source_station_m"], datum)
            self.assertTrue(row["roundtrip_recovered_moment"])
            self.assertTrue(row["scalar_matches_full_cross"])

    def test_reference_invariance_is_exact_on_retained_wrenches(self):
        result = conventions.evaluate(self.base)
        self.assertTrue(all(row["force_preserved"] and row["moment_preserved"]
                            for row in result["reference_invariance"]))
        self.assertTrue(any(row["ratio_cp_reason"] == "UncertaintyContainsZero"
                            for row in result["reference_invariance"]))

    def test_sb1_difference_is_recomputed(self):
        self.refused(
            lambda data: data["sb1_comparison"]["pairs"][0]["root_minus_first"].__setitem__(
                "coefficient", 0.0),
            "sb1 coefficient difference")

    def test_sb1_interval_must_contain_its_reading(self):
        self.refused(
            lambda data: data["sb1_comparison"]["pairs"][0][
                "independent_root_reader"].__setitem__("coefficient_read_interval", [0.5, 0.6]),
            "does not contain")

    def test_sb1_reader_intervals_must_overlap(self):
        def mutation(data):
            entry = data["sb1_comparison"]["pairs"][1]
            entry["independent_root_reader"]["coefficient"] = 0.9
            entry["independent_root_reader"]["coefficient_read_interval"] = [0.8, 1.0]
            entry["root_minus_first"]["coefficient"] = (
                0.9 - entry["first_reader"]["coefficient"])
        self.refused(mutation, "must overlap")

    def test_nearzero_relative_residual_refused(self):
        point = next(point for point in conventions.normalized_points(self.base)
                     if point["point_id"] == "d4013-cn-m1p20-alpha0")
        self.assertTrue(point["interval"][0] <= 0.0 <= point["interval"][1])
        with self.assertRaisesRegex(conventions.Refusal, "absolute uncertainty governs"):
            conventions.relative_residual(point["value"], point["interval"], 0.2)
        bounded = next(point for point in conventions.normalized_points(self.base)
                       if point["point_id"] == "d4013-cn-m1p20-alpha2")
        residual = conventions.relative_residual(bounded["value"], bounded["interval"], 0.6)
        self.assertTrue(math.isfinite(residual))

    def test_cp_guard_mirrors_native_uncertainty_contains_zero(self):
        self.assertEqual(conventions.cp_reason(0.05, (-0.02, 0.12)),
                         "UncertaintyContainsZero")
        self.assertEqual(conventions.cp_reason(0.0, None), "ZeroDenominator")
        self.assertEqual(conventions.cp_reason(1.0, None, 1e16),
                         "NumericallyIllConditioned")
        self.assertIsNone(conventions.cp_reason(0.6, (0.4, 0.8), 1.0))
        with self.assertRaisesRegex(conventions.Refusal, "UncertaintyContainsZero"):
            conventions.equivalent_station(0.1, 0.05, (-0.02, 0.12), 0.7, 0.05715)
        with self.assertRaisesRegex(conventions.Refusal, "must enclose"):
            conventions.cp_reason(0.2, (-0.02, 0.12))

    def test_nearzero_table_covers_every_retained_record(self):
        result = conventions.evaluate(self.base)
        rows = result["nearzero_floor"]
        normalized = [row for row in rows
                      if row["record"] == "normalized-reading-points.json"]
        comparison = [row for row in rows
                      if row["record"] == "first-batch comparison.json"]
        sb1 = [row for row in rows if row["record"] == "sb1 comparison.json"]
        self.assertEqual((len(normalized), len(comparison), len(sb1)), (6, 6, 10))
        self.assertEqual(sum(1 for row in normalized if row["interval_encloses_zero"]), 2)
        self.assertEqual(sum(1 for row in sb1
                             if row["relative_residual"] == "not-computable-no-measured-center"), 2)
        self.assertTrue(all(row["relative_residual"] == "refused-absolute-floor-governs"
                            for row in normalized if row["interval_encloses_zero"]))

    def test_nonfinite_reading_refused(self):
        def mutation(data):
            data["normalized"][0]["reading"]["value"] = float("nan")
        self.refused(mutation, "finite number required")


if __name__ == "__main__":
    unittest.main()
