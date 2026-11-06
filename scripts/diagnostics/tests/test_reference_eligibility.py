"""Fault injection for the retained RMP02 exclusion/custody contract."""
from copy import deepcopy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("reference_gate", ROOT / "scripts/diagnostics/check-reference-eligibility.py")
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


class EligibilityTests(unittest.TestCase):
    def setUp(self):
        self.ledger = gate.strict_json(ROOT / gate.LEDGER)

    def refused(self, mutation, message):
        ledger = deepcopy(self.ledger)
        mutation(ledger)
        with self.assertRaisesRegex(gate.Refusal, message):
            gate.check(ROOT, ledger)

    def test_retained_custody_is_not_qualification(self):
        result = gate.check(ROOT, self.ledger)
        self.assertEqual(result["custody_status"], "pass")
        self.assertEqual(result["manifest_artifact_entries_verified"], 64)
        self.assertEqual(result["original_pdfs_verified"], 0)
        self.assertEqual(result["qualified_cases"], 0)
        self.assertEqual(len(result["cases"]), 5)
        self.assertTrue(all(not c["native_qualification"] for c in result["cases"]))
        self.assertEqual(result["cases"][0]["mach_status"], "within-Mach-only-other-conditions-open")
        self.assertEqual(result["cases"][1]["mach_status"], "outside-SB1-Mach-domain")

    def test_global_qualification_claim_refused(self):
        self.refused(lambda x: x.update(qualification_claim=True), "cannot certify")

    def test_case_qualification_claim_refused(self):
        self.refused(lambda x: x["cases"][0].update(native_qualification=True), "promoted")

    def test_integer_zero_is_not_false_claim(self):
        self.refused(lambda x: x.update(qualification_claim=0), "cannot certify")

    def test_approximate_geometry_cannot_be_closed(self):
        self.refused(lambda x: x["cases"][0]["features"]["nose_profile"].update(status="exact"), "new reviewed contract")

    def test_missing_feature_refused(self):
        self.refused(lambda x: x["cases"][0]["features"].pop("fin_roots_attachments"), "feature coverage")

    def test_convention_gap_cannot_be_erased(self):
        self.refused(lambda x: x["cases"][0]["convention_gaps"].update(moment_station=""), "open convention")

    def test_fake_axial_extraction_refused(self):
        self.refused(lambda x: x["cases"][0]["quantities"].update(CA="retained-provisional"), "availability changed")

    def test_cp_cannot_replace_independent_moment(self):
        self.refused(lambda x: x["cases"][0]["quantities"].update(CP="retained-provisional"), "paired quantities")

    def test_missing_moment_is_not_zero_filled(self):
        self.refused(lambda x: x["cases"][0]["quantities"].pop("Cm"), "paired quantities")

    def test_unselected_condition_cannot_inherit_title_mach(self):
        self.refused(lambda x: x["cases"][3].update(mach=0.6), "frozen case changed")

    def test_changed_native_basis_refuses(self):
        self.refused(lambda x: x["native_source"][0].update(sha256="0" * 64), "changed/invalid artifact")

    def test_missing_native_basis_refuses(self):
        self.refused(lambda x: x["native_source"].pop(), "duplicate/missing basis")

    def test_duplicate_basis_refuses(self):
        self.refused(lambda x: x["basis"].append(deepcopy(x["basis"][0])), "duplicate/missing basis")

    def test_source_pdf_identity_is_not_local_availability(self):
        self.refused(lambda x: x["sources"][0].update(original_pdf_status="available"), "separately verified")

    def test_original_pdf_hash_cannot_be_changed(self):
        self.refused(lambda x: x["sources"][0].update(pdf_sha256="0" * 64), "PDF identity changed")

    def test_rights_basis_cannot_be_invented(self):
        self.refused(lambda x: x["sources"][0].update(rights_basis="unrestricted"), "rights provenance changed")

    def test_duplicate_source_refused(self):
        self.refused(lambda x: x["sources"].append(deepcopy(x["sources"][0])), "duplicate source")

    def test_missing_case_refused(self):
        self.refused(lambda x: x["cases"].pop(), "missing frozen case")

    def test_unknown_field_refused(self):
        self.refused(lambda x: x.update(accuracy_pass=True), "unknown fields")

    def test_retained_artifact_tamper_refused(self):
        original = gate.identity
        def tamper(root, name):
            result = original(root, name)
            if name.endswith("19670020050-pdf-p11.png"):
                result["sha256"] = "0" * 64
            return result
        with patch.object(gate, "identity", side_effect=tamper):
            with self.assertRaisesRegex(gate.Refusal, "custody mismatch"):
                gate.check(ROOT, self.ledger)

    def test_duplicate_manifest_and_escape_refused(self):
        name = sorted(gate.MANIFESTS)[0]
        original = gate.strict_json(ROOT / name)
        for mutation, message in [
            (lambda x: x["files"].append(deepcopy(x["files"][0])), "duplicate manifest artifact"),
            (lambda x: x["files"][0].update(path="../private.json"), "manifest path escapes"),
        ]:
            modified = deepcopy(original)
            mutation(modified)
            with self.subTest(message=message), patch.object(gate, "strict_json", return_value=modified):
                with self.assertRaisesRegex(gate.Refusal, message):
                    gate.manifest_files(ROOT, name)

    def test_nonfinite_and_duplicate_json_refused(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.json"
            for raw, message in [(' {"x":1,"x":2}', "duplicate JSON key"), ('{"x":NaN}', "nonfinite JSON")]:
                path.write_text(raw)
                with self.subTest(raw=raw), self.assertRaisesRegex(gate.Refusal, message):
                    gate.strict_json(path)

    def test_path_escape_and_unleased_files_refused(self):
        for name in ["../private.json", "/etc/passwd", "docs/internal/../secret", "package.json", "docs\\private.json"]:
            with self.subTest(name=name), self.assertRaises(gate.Refusal):
                gate.local(ROOT, name)

    def test_symlink_cannot_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            docs = root / "docs/internal"
            docs.mkdir(parents=True)
            (docs / "linked").symlink_to("/etc/passwd")
            with self.assertRaisesRegex(gate.Refusal, "symlink escapes"):
                gate.local(root, "docs/internal/linked")


if __name__ == "__main__":
    unittest.main()
