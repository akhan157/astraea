#!/usr/bin/env python3
"""Pure RMP12c harness checks. ZERO native process calls.
Mock subprocesses test accounting only; they are not numerical experiment rows.
Usage: python3 scripts/diagnostics/test_candidate_regimes.py
"""
import copy
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import subprocess
import tempfile
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve()
spec = importlib.util.spec_from_file_location('regimes_under_test', HERE.with_name('check-candidate-regimes.py'))
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
PLAN = json.loads((r.RUN_DIR / 'EXPERIMENT.json').read_bytes())
BASE = (r.RUN_DIR / 'BASE-INPUT.json').read_bytes()
CC = r.load_reference(PLAN)  # verified read-only equations, no native execution


class HarnessTests(unittest.TestCase):
    def test_pinned_equations_and_manufactured_crossing(self):
        self.assertTrue(CC.equation_block_identity())
        control = CC.manufactured_crossing_check()
        self.assertLessEqual(control['bracketWidthS'], 1e-8)
        self.assertLessEqual(abs(control['estimateS'] - control['exactS']), control['bracketWidthS'])

    def test_exact_matrix_deltas_and_anchor_request_bytes(self):
        cases, deltas = r.build_cases(BASE, PLAN, CC)
        self.assertEqual(tuple(cases), r.CASE_IDS)
        for cid, request in cases.items():
            self.assertNotIn('diagnosticNumerics', request)
            self.assertEqual('diagnosticNumerics' in request['candidate'], cid.startswith('C'))
            self.assertEqual(deltas[cid]['observed'], sorted(CC.expand_declared(
                cases['A-dt020'], request, PLAN['caseDeltaSets'][cid])))
        for series in ('A', 'C'):
            self.assertEqual(r.sha(r.encode(cases[series + '-dt020'])), PLAN['anchorInputSha256'][series])
        self.assertEqual(r.encode(cases['A-dt020']), BASE)

    def test_undeclared_or_missing_changes_refuse(self):
        p = copy.deepcopy(PLAN)
        p['caseDeltaSets']['A-dt010'] = []
        with self.assertRaisesRegex(ValueError, 'undeclared/missing'):
            r.build_cases(BASE, p, CC)
        p = copy.deepcopy(PLAN)
        p['caseDeltaSets']['A-dt020'] = ['candidate.motor.dryMass']
        with self.assertRaisesRegex(ValueError, 'undeclared/missing'):
            r.build_cases(BASE, p, CC)

    def test_stale_anchor_and_noncanonical_json_refuse(self):
        p = copy.deepcopy(PLAN)
        p['anchorInputSha256']['C'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'prior input bytes'):
            r.build_cases(BASE, p, CC)
        with self.assertRaisesRegex(ValueError, 'round-trip'):
            r.build_cases(json.dumps(json.loads(BASE)).encode(), PLAN, CC)

    def test_prior_anchor_provenance_verified_without_native_calls(self):
        with patch.object(r.subprocess, 'run', side_effect=AssertionError('native calls forbidden')):
            proof = r.verify_anchors(PLAN)
            self.assertEqual(set(proof), {'A', 'C'})
            self.assertTrue(all(p['verified'] for p in proof.values()))

    def test_both_dependencies_verified_before_any_execution(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            dep = root / r.DEPENDENCIES[0]
            old = root / r.DEPENDENCIES[1]
            dep.parent.mkdir(parents=True)
            marker = root / 'executed'
            raw = f"from pathlib import Path\nPath({str(marker)!r}).write_text('BAD')\ndef equation_block_identity(): return True\n".encode()
            dep.write_bytes(raw)
            old.write_bytes(b'original')
            p = copy.deepcopy(PLAN)
            p['reusedChecker']['sha256'] = r.sha(raw)
            p['reusedChecker']['equationGateDependency']['sha256'] = r.sha(b'different')
            with self.assertRaisesRegex(ValueError, 'hash mismatch'):
                r.load_reference(p, root)
            self.assertFalse(marker.exists(), 'first dependency executed before second hash verified')

    def test_missing_dependency_not_vacuous_pass(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(FileNotFoundError):
                r.load_reference(PLAN, Path(temp))

    def test_service_evidence_uses_nearest_interval_and_local_population(self):
        report = {'events': [{'name': 'Launch Rail Departure', 'timeS': .505}],
                  'trajectory': {'samples': [{'timeS': t} for t in (.48, .50, .51, .52)]}}
        side = {'driverLimits': {'eventRootWidthS': 1e-5},
                'stepWindowTrials': [{'trialStartS': t} for t in (.18, .20, .25)],
                'straddledTrials': [{'trialStartS': .20}, {'trialStartS': .20}, {'trialStartS': .26}],
                'clippedTrials': []}
        evidence = r.service_evidence(report, side)
        self.assertEqual(evidence['containingCommittedIntervalS'], [.50, .51])
        self.assertEqual(evidence['windowTrialAttemptsIncludingRejected'], 3)
        self.assertEqual(evidence['counts']['straddledTrials'], {
            'globalRawKnotEvents': 3, 'windowKnotEvents': 2, 'windowDistinctTrialStarts': 1})
        self.assertIn('unavailable', evidence['totalAdaptiveTrialCount'])
        self.assertEqual(evidence['configuredRefinementWidthLimitS'], 1e-5)
        side['stepWindowTrials'][0]['trialStartS'] = .17
        with self.assertRaisesRegex(ValueError, 'window population'):
            r.service_evidence(report, side)

    def test_sidecar_missing_duplicate_and_policy_mismatch_refuse(self):
        with self.assertRaisesRegex(ValueError, 'missing or duplicated'):
            r.validate_sidecar(CC, b'', PLAN['cases'][0])
        side = self.sidecar(False)
        stderr = (CC.SIDECAR_PREFIX + json.dumps(side) + '\n').encode()
        with self.assertRaisesRegex(ValueError, 'missing or duplicated'):
            r.validate_sidecar(CC, stderr * 2, PLAN['cases'][0])
        with self.assertRaisesRegex(ValueError, 'split policy'):
            r.validate_sidecar(CC, stderr, PLAN['cases'][1])
        self.assertEqual(r.validate_sidecar(CC, stderr, PLAN['cases'][0]), side)

    @staticmethod
    def sidecar(split):
        return {'location': 'per-attempt sidecar outside the compared candidate report',
                'schemaId': 'candidate-native-diagnostic-mechanism-sidecar/1.0.0',
                'splitAtThrustKnots': split, 'appliedAbsoluteTolerances': CC.INHERITED_LITERALS,
                'absoluteTolerancePolicy': 'inherited' if split else 'inherited-absent-default',
                'numericalPolicyId': 'candidate-native-diagnostic-numerics/1.0.0' if split else 'inherited-candidate-driver-numerics/1.0.0',
                'straddledTrials': [], 'clippedTrials': [], 'stepWindowTrials': [],
                'driverLimits': {'eventRootWidthS': 1e-5}}

    def test_reservation_and_ledger_exist_before_mock_spawn_and_duplicate_refuses(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            (output / 'reservations').mkdir()
            binary = output / 'dummy-binary'
            binary.write_bytes(b'not executable')
            ledger = []
            def mocked(argv, **kwargs):
                reservation = json.loads((output / 'reservations/X.reservation.json').read_bytes())
                self.assertEqual(reservation['inputSha256'], r.sha(b'input'))
                self.assertEqual(json.loads((output / 'attempts.json').read_bytes())[0]['state'], 'reserved-before-spawn')
                self.assertEqual(kwargs['timeout'], 30)
                return subprocess.CompletedProcess(argv, 0, b'out', b'err')
            with patch.object(r.subprocess, 'run', side_effect=mocked) as spawn:
                row, stdout, stderr = r.attempt(binary, r.sha(binary.read_bytes()), 'X', b'input', output, ledger, 'mock')
                self.assertEqual(spawn.call_count, 1)
                self.assertEqual((stdout, stderr), (b'out', b'err'))
                self.assertEqual(row['stdoutSha256'], r.sha(b'out'))
                with self.assertRaisesRegex(ValueError, 'duplicate attempt'):
                    r.attempt(binary, r.sha(binary.read_bytes()), 'X', b'input', output, ledger, 'mock')
                self.assertEqual(spawn.call_count, 1)

    def test_output_audit_recomputes_reservations_and_rejects_missing_or_empty(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            (output / 'reservations').mkdir()
            row = {'id': 'X'}
            paths = [('X.input.json', 'inputSha256'), ('X.stdout', 'stdoutSha256'),
                     ('X.stderr', 'stderrSha256'), ('reservations/X.reservation.json', 'reservationSha256')]
            for path, field in paths:
                (output / path).write_bytes(path.encode())
                row[field] = r.sha(path.encode())
            self.assertTrue(r.audit_outputs(output, [row])['allMatch'])
            (output / paths[-1][0]).write_text('tampered reservation')
            self.assertFalse(r.audit_outputs(output, [row])['allMatch'])
            self.assertEqual(r.audit_outputs(output, [row])['checks'][-1]['state'], 'mismatch')
            (output / paths[0][0]).unlink()
            self.assertEqual(r.audit_outputs(output, [row])['checks'][0]['state'], 'missing-file')
            del row['stderrSha256']
            self.assertEqual(r.audit_outputs(output, [row])['checks'][2]['state'], 'not-recorded')
            self.assertFalse(r.audit_outputs(output, [])['allMatch'])

    def test_no_seal_or_unapproved_review_prevents_native_or_toolchain_calls(self):
        with tempfile.TemporaryDirectory() as temp:
            run_dir = Path(temp)
            (run_dir / 'EXPERIMENT.json').write_bytes(r.encode(PLAN))
            contract = b'unit-test contract'
            (run_dir / 'CONTRACT.md').write_bytes(contract)
            with patch.object(r, 'RUN_DIR', run_dir), \
                    patch.object(r.subprocess, 'run') as spawn, \
                    patch.object(r.subprocess, 'check_output') as toolchain:
                with self.assertRaises(FileNotFoundError):
                    r.preflight(Path('missing'), Path('missing'), run_dir / 'fresh')
                seal = {'experimentSha256': r.sha(r.encode(PLAN)), 'contractSha256': r.sha(contract),
                        'review': {'contract': 'ACCEPT', 'implementation': 'REQUEST_CHANGES'}}
                (run_dir / 'RUN-SEAL.json').write_bytes(r.encode(seal))
                with self.assertRaisesRegex(ValueError, 'both reviews required'):
                    r.preflight(Path('missing'), Path('missing'), run_dir / 'fresh')
                spawn.assert_not_called()
                toolchain.assert_not_called()

    def test_timeout_and_spawn_error_are_retained_once(self):
        for error, state in [(subprocess.TimeoutExpired(['mock'], 30, output=b'partial', stderr=b'err'),
                              'timeout-killed-and-waited'), (OSError('mock fail'), 'spawn-error')]:
            with self.subTest(state=state), tempfile.TemporaryDirectory() as temp:
                output = Path(temp)
                (output / 'reservations').mkdir()
                binary = output / 'dummy'
                binary.write_bytes(b'not executable')
                ledger = []
                with patch.object(r.subprocess, 'run', side_effect=error) as spawn:
                    row, _, _ = r.attempt(binary, r.sha(binary.read_bytes()), 'X', b'input', output, ledger, 'mock')
                self.assertEqual(spawn.call_count, 1)
                self.assertEqual(row['state'], state)
                self.assertFalse(row['pass'])
                self.assertEqual(len(ledger), 1)
                self.assertEqual(len(list((output / 'reservations').iterdir())), 1)
                for suffix in ('stdout', 'stderr'):
                    self.assertEqual(row[suffix + 'Sha256'], r.sha((output / ('X.' + suffix)).read_bytes()))

    def test_binary_mismatch_blocks_before_reservation(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp)
            (output / 'reservations').mkdir()
            binary = output / 'dummy'
            binary.write_bytes(b'changed')
            with patch.object(r.subprocess, 'run') as spawn, self.assertRaisesRegex(ValueError, 'hash mismatch'):
                r.attempt(binary, '0' * 64, 'X', b'input', output, [], 'mock')
            spawn.assert_not_called()
            self.assertEqual(list((output / 'reservations').iterdir()), [])

    def test_preflight_failures_have_unique_logs_and_zero_new_reservations(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / 'existing-run'
            (output / 'reservations').mkdir(parents=True)
            (output / 'reservations/OLD.reservation.json').write_text('{}')
            with patch.object(r.subprocess, 'run') as spawn, patch.object(r.sys, 'stderr'):
                self.assertEqual(r.main('missing', 'missing', str(output)), 1)
                self.assertEqual(r.main('missing', 'missing', str(output)), 1)
            spawn.assert_not_called()
            logs = list(Path(temp).glob('existing-run.invocation-*.json'))
            self.assertEqual(len(logs), 2)
            for log in logs:
                record = json.loads(log.read_text())
                self.assertEqual(record['phase'], 'failed')
                self.assertEqual(record['nativeReservations'], 0)
                self.assertIn('output must be fresh', record['traceback'])

    def test_absent_metrics_or_reference_failure_cannot_pass_vacuously(self):
        empty = r.summarize(PLAN, [], {}, {}, {'pass': True})
        self.assertTrue(empty['comparisonsUnresolved'])
        self.assertEqual(empty['integrityStatus'], 'incomplete')
        self.assertIsNone(empty['anyProvisionalReserveFailed'])
        ledger = [{'id': cid, 'pass': True, 'metrics': self.metrics()} for cid in r.CASE_IDS]
        ledger.append({'id': 'H-legacy', 'pass': True})
        full = r.summarize(PLAN, ledger, {}, {}, {'pass': True})
        self.assertEqual(full['integrityStatus'], 'complete')
        ledger[2]['metrics']['checks']['referenceRailDeltaS']['pass'] = False
        failed = r.summarize(PLAN, ledger, {}, {}, {'pass': True})
        self.assertEqual(failed['integrityStatus'], 'incomplete')
        self.assertTrue(failed['comparisonsUnresolved'])
        self.assertTrue(all(value == 'unresolved' for value in failed['reserveStatus'].values()))

    @staticmethod
    def metrics():
        return dict({key: 0.0 for key in r.METRICS},
                    checks={k: {'pass': True} for k in r.REFERENCE_CHECKS + ('railTimeErrorS',)},
                    diagnosticPass=True, anyReserveFailed=False)

    def test_saved_20ms_reports_are_compatible_without_new_predictions(self):
        cases, _ = r.build_cases(BASE, PLAN, CC)
        prior = Path(PLAN['priorRun']['path'])
        for series, cid in PLAN['priorRun']['anchorRowIds'].items():
            report = json.loads((prior / (cid + '.stdout')).read_bytes())
            request = cases[series + '-dt020']
            with patch.object(r.subprocess, 'run', side_effect=AssertionError('native calls forbidden')):
                metrics = CC.compare_case(report, request, PLAN)
                side = r.validate_sidecar(CC, (prior / (cid + '.stderr')).read_bytes(),
                                         PLAN['cases'][0 if series == 'A' else 1])
                evidence = r.service_evidence(report, side)
            self.assertTrue(r.reference_ok(metrics))
            self.assertEqual(metrics['diagnosticPass'], series == 'C')
            self.assertEqual(evidence['containingCommittedIntervalS'],
                             [0.5000000000000001, 0.5200000000000001])

    def test_whole_runner_reserves_exactly_seven_with_mock_processes(self):
        # Synthetic harness-only replies; compare_case is mocked. This checks
        # the complete execution/accounting path, NOT numerical behavior.
        p = copy.deepcopy(PLAN)
        cases, deltas = r.build_cases(BASE, p, CC)
        replies = {}
        for cid, request in cases.items():
            replies[cid] = r.encode({'effectiveInputs': request,
                'events': [{'name': 'Launch Rail Departure', 'timeS': .505}],
                'trajectory': {'samples': [{'timeS': t} for t in (.50, .51)]}})
        p['anchorStdoutSha256'] = {s: r.sha(replies[s + '-dt020']) for s in ('A', 'C')}
        legacy_reply = b'mock legacy reply'
        p['legacy']['expectedStdoutSha256'] = r.sha(legacy_reply)
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            binary = root / 'dummy'
            binary.write_bytes(b'not executable')
            digest = r.sha(binary.read_bytes())
            p['binarySha256'] = dict(profileExample=digest, legacyExample=digest)
            output = root / 'mock-run'
            def mock_process(argv, **kwargs):
                rows = json.loads((output / 'attempts.json').read_bytes())
                cid = rows[-1]['id']
                self.assertEqual(rows[-1]['state'], 'reserved-before-spawn')
                self.assertEqual(len(list((output / 'reservations').iterdir())), len(rows))
                if cid == 'H-legacy':
                    self.assertIsNone(kwargs['input'])
                    self.assertEqual(Path(argv[1]).read_bytes(), b'mock legacy input')
                    return subprocess.CompletedProcess(argv, 0, legacy_reply, b'')
                side = self.sidecar(cid.startswith('C'))
                return subprocess.CompletedProcess(argv, 0, replies[cid],
                    (CC.SIDECAR_PREFIX + json.dumps(side) + '\n').encode())
            def mock_compare(*args):
                return dict(self.metrics(), railRootAtSampleTimes=[.50, .51])
            seal = {'contractSha256': '0' * 64, 'toolchain': {'mock': 'only'}}
            pre = (p, seal, r.encode(p), r.encode(seal), b'mock legacy input', CC, cases, deltas, {})
            with patch.object(r, 'preflight', return_value=pre), \
                    patch.object(CC, 'compare_case', side_effect=mock_compare), \
                    patch.object(r.subprocess, 'run', side_effect=mock_process) as spawn:
                result = r.run(binary, binary, output)
            self.assertEqual(spawn.call_count, 7)
            self.assertEqual(result['integrityStatus'], 'complete')
            self.assertEqual(tuple(row['id'] for row in result['cases']), r.CASE_IDS + ('H-legacy',))
            for row in result['cases']:
                self.assertTrue(row['pass'])
                self.assertEqual(row['inputSha256'], r.sha((output / (row['id'] + '.input.json')).read_bytes()))
            self.assertTrue((output / 'result.json').exists())

    def test_integrity_does_not_require_reserve_pass_and_rail_failure_is_specific(self):
        ledger = [{'id': cid, 'pass': True, 'metrics': self.metrics()} for cid in r.CASE_IDS]
        ledger.append({'id': 'H-legacy', 'pass': True})
        metric = ledger[0]['metrics']
        metric.update(anyReserveFailed=True, diagnosticPass=False)
        result = r.summarize(PLAN, ledger, {}, {}, {'pass': True})
        self.assertEqual(result['integrityStatus'], 'complete')
        self.assertFalse(result['retained20msDefaultFailureReproduced'])
        metric['checks']['railTimeErrorS']['pass'] = False
        self.assertTrue(r.summarize(PLAN, ledger, {}, {}, {'pass': True})['retained20msDefaultFailureReproduced'])
        ledger[0]['pass'] = False
        self.assertEqual(r.summarize(PLAN, ledger, {}, {}, {'pass': True})['integrityStatus'], 'incomplete')


if __name__ == '__main__':
    unittest.main(verbosity=2)
