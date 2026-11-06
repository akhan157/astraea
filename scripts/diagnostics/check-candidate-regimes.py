#!/usr/bin/env python3
"""RMP12c: frozen six profile + one legacy calls; zero retries.

Usage: check-candidate-regimes.py PROFILE_EXAMPLE LEGACY_EXAMPLE OUTPUT_DIR
Requires reviewed RUN-SEAL.json. Does not build or modify native binaries.
Unique invocation records survive preflight failures outside OUTPUT_DIR.
Integrity and provisional reserves are separate; no default recommendation,
convergence/global-bound/physical/mission/WASM qualification follows.
"""
import datetime
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import traceback

ROOT = Path(__file__).resolve().parents[2]
RUN_DIR = ROOT / 'docs/internal/execution-runs/RMP12c-regime-expansion'
DEPENDENCIES = ('scripts/diagnostics/check-candidate-controls.py',
                'scripts/diagnostics/check-candidate-numerics.py')
RUNNER_FILES = ('scripts/diagnostics/check-candidate-regimes.py',
                'scripts/diagnostics/test_candidate_regimes.py')
CASE_IDS = ('A-dt020', 'C-dt020', 'A-dt010', 'C-dt010', 'A-dt005', 'C-dt005')
METRICS = ('railTimeErrorS', 'maxPositionErrorM', 'maxVelocityErrorMps')
REFERENCE_CHECKS = ('referencePositionDeltaM', 'referenceVelocityDeltaMps', 'referenceRailDeltaS')


def require(condition, message):
    # Unlike assert, these execution guards remain active under python -O.
    if not condition:
        raise ValueError(message)


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def encode(value):
    return (json.dumps(value, indent=2, allow_nan=False) + '\n').encode()


def durable_bytes(path, raw, exclusive=False):
    with Path(path).open('xb' if exclusive else 'wb') as handle:
        handle.write(raw)
        handle.flush()
        os.fsync(handle.fileno())
    # Durability includes the directory entry, not just file contents.
    fd = os.open(Path(path).parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)
    return sha(raw)


def durable_json(path, value, exclusive=False):
    return durable_bytes(path, encode(value), exclusive)


def checked(path, digest):
    raw = Path(path).read_bytes()
    require(isinstance(digest, str) and len(digest) == 64 and sha(raw) == digest,
            f'hash mismatch: {path}')
    return raw


def load_reference(plan, root=ROOT):
    """Verify BOTH files before executing dependency code; no sys.path mutation
    or bytecode-cache execution. Compile precisely the verified source bytes in
    a module made by importlib with the exact resolved __file__ path."""
    dep = plan['reusedChecker']
    old = dep['equationGateDependency']
    require((dep['path'], old['path']) == DEPENDENCIES, 'unexpected dependency path')
    path = (root / dep['path']).resolve()
    raw = checked(path, dep['sha256'])
    checked(root / old['path'], old['sha256'])
    spec = importlib.util.spec_from_file_location('rmp12c_pinned_reference', path)
    module = importlib.util.module_from_spec(spec)
    exec(compile(raw, str(path), 'exec'), module.__dict__)
    require(module.equation_block_identity() is True, 'equation block gate failed')
    return module


def build_cases(base_raw, plan, cc):
    require(encode(json.loads(base_raw)) == base_raw, 'BASE-INPUT does not round-trip byte-exactly')
    require(tuple(c['id'] for c in plan['cases']) == CASE_IDS, 'matrix/order differs')
    require((plan['nativeProfileProcessBudget'], plan['legacyProcessBudget'],
             plan['totalProcessBudget'], plan['retries'], plan['perProcessTimeoutS']) == (6, 1, 7, 0, 30),
            'attempt limits differ')
    base = json.loads(base_raw)
    require('diagnosticNumerics' not in base and 'diagnosticNumerics' not in base['candidate'],
            'base must omit controls entirely')
    cases, deltas = {}, {}
    for case in plan['cases']:
        cid = case['id']
        request = json.loads(base_raw)
        request['candidate']['launch']['timeStepS'] = case['macroStepS']
        if case['controls'] is not None:
            require(case['controls'] == {
                'schemaId': 'candidate-native-diagnostic-controls/1.0.0',
                'absoluteTolerancePolicy': 'inherited', 'splitAtThrustKnots': True},
                f'unexpected controls: {cid}')
            request['candidate']['diagnosticNumerics'] = case['controls'].copy()
        observed = set(cc.changed_leaves(base, request))
        declared = plan['caseDeltaSets'][cid]
        expected = cc.expand_declared(base, request, declared)
        require(observed == expected, f'undeclared/missing request changes: {cid}')
        deltas[cid] = {'declared': declared, 'observed': sorted(observed),
                       'expected': sorted(expected), 'match': True}
        cases[cid] = request
    for series in ('A', 'C'):
        require(sha(encode(cases[series + '-dt020'])) == plan['anchorInputSha256'][series],
                f'{series} 20 ms request differs from prior input bytes')
    return cases, deltas


def verify_anchors(plan):
    prior = Path(plan['priorRun']['path'])
    ledger = json.loads(checked(prior / 'attempts.json', plan['priorRun']['attemptsSha256']))
    proof = {}
    for series, cid in plan['priorRun']['anchorRowIds'].items():
        rows = [r for r in ledger if r['id'] == cid]
        require(len(rows) == 1, f'prior row missing/duplicated: {cid}')
        for suffix, field, frozen in (
                ('.input.json', 'inputSha256', plan['anchorInputSha256'][series]),
                ('.stdout', 'stdoutSha256', plan['anchorStdoutSha256'][series])):
            require(rows[0][field] == frozen, f'anchor ledger differs: {cid} {field}')
            checked(prior / (cid + suffix), frozen)
        proof[series] = {'rowId': cid, 'inputSha256': rows[0]['inputSha256'],
                         'stdoutSha256': rows[0]['stdoutSha256'], 'verified': True}
    require(set(proof) == {'A', 'C'}, 'missing anchor series')
    return proof


def preflight(profile, legacy, output):
    require(not output.exists(), 'output must be fresh; never reuse a run directory')
    plan_raw = (RUN_DIR / 'EXPERIMENT.json').read_bytes()
    plan = json.loads(plan_raw)
    seal_raw = (RUN_DIR / 'RUN-SEAL.json').read_bytes()
    seal = json.loads(seal_raw)
    require(seal['experimentSha256'] == sha(plan_raw), 'plan changed after seal')
    checked(RUN_DIR / 'CONTRACT.md', seal['contractSha256'])
    require(seal['review']['contract'] == 'ACCEPT' and seal['review']['implementation'] == 'ACCEPT',
            'both reviews required before experiment')
    require(set(seal['checker']) == set(DEPENDENCIES + RUNNER_FILES), 'incomplete checker seal')
    require({'crates/astraea-core/src/six_dof.rs', 'crates/astraea-core/src/flight_provider.rs',
             'crates/astraea-engine/src/native_candidate.rs', 'crates/astraea-engine/src/profile_candidate.rs',
             'crates/astraea-engine/examples/profile_candidate_flight.rs',
             'crates/astraea-engine/examples/legacy_flight_snapshot.rs'} <= set(seal['sources']),
            'incomplete source seal')
    for group in ('sources', 'checker', 'reviewFiles'):
        require(bool(seal[group]), f'empty seal group: {group}')
        for rel, digest in seal[group].items():
            path = Path(rel) if Path(rel).is_absolute() else ROOT / rel
            checked(path, digest)
    # Known hashes in the frozen plan must agree with the separate runtime seal.
    for dep in (plan['reusedChecker'], plan['reusedChecker']['equationGateDependency']):
        require(seal['checker'][dep['path']] == dep['sha256'], 'dependency seal differs from frozen plan')
    for label, binary in (('profileExample', profile), ('legacyExample', legacy)):
        require(seal['binaries'][label]['sha256'] == plan['binarySha256'][label], 'binary not prior sealed bytes')
        checked(binary, plan['binarySha256'][label])
    toolchain = {name: subprocess.check_output([name, '--version'], text=True).strip()
                 for name in ('rustc', 'cargo')}
    require(toolchain == seal['toolchain'], 'toolchain differs')
    base = checked(RUN_DIR / plan['baseInput'], plan['baseInputSha256'])
    legacy_raw = checked(RUN_DIR / plan['legacy']['input'], plan['legacy']['inputSha256'])
    checked(ROOT / plan['sourceFixture'], plan['sourceFixtureSha256'])
    anchors = verify_anchors(plan)
    cc = load_reference(plan)
    cases, deltas = build_cases(base, plan, cc)
    return plan, seal, plan_raw, seal_raw, legacy_raw, cc, cases, deltas, anchors


def attempt(binary, digest, cid, raw, output, ledger, expected, legacy=False):
    """Only spawn seam. Reservation and pending ledger fsynced BEFORE the call.
    A spawn error/timeout consumes its reservation and is never retried."""
    require(not any(r['id'] == cid for r in ledger), f'duplicate attempt: {cid}')
    require(len(ledger) < 7, 'attempt budget exhausted')
    checked(binary, digest)  # Once per attempt, not just startup.
    input_path = output / (cid + '.input.json')
    input_sha = durable_bytes(input_path, raw, exclusive=True)
    require(sha(input_path.read_bytes()) == input_sha, 'input write differs')
    reservation = {'id': cid, 'inputSha256': input_sha,
                   'binarySha256': digest, 'expectedKind': expected}
    reservation_sha = durable_json(output / 'reservations' / (cid + '.reservation.json'), reservation, True)
    row = {'id': cid, 'inputSha256': input_sha, 'binarySha256': digest,
           'reservationSha256': reservation_sha, 'expected': expected,
           'pass': False, 'state': 'reserved-before-spawn'}
    ledger.append(row)
    durable_json(output / 'attempts.json', ledger)
    stdout, stderr = b'', b''
    try:
        argv = [str(binary), str(input_path) if legacy else '-']
        proc = subprocess.run(argv, input=None if legacy else raw, capture_output=True, timeout=30)
        stdout, stderr = proc.stdout, proc.stderr
        row.update(exitCode=proc.returncode, state='process-returned')
    except subprocess.TimeoutExpired as exc:
        stdout, stderr = exc.stdout or b'', exc.stderr or b''
        row.update(state='timeout-killed-and-waited', error='30 s exceeded; zero retries')
    except OSError as exc:
        row.update(state='spawn-error', error=repr(exc))
    row['stdoutSha256'] = durable_bytes(output / (cid + '.stdout'), stdout, True)
    row['stderrSha256'] = durable_bytes(output / (cid + '.stderr'), stderr, True)
    durable_json(output / 'attempts.json', ledger)
    return row, stdout, stderr


def service_evidence(report, sidecar):
    """Population counts only; no inference of global denominators/brackets."""
    tr = report['trajectory']
    rail = next(e['timeS'] for e in report['events'] if e['name'] == 'Launch Rail Departure')
    ts = [s['timeS'] for s in tr['samples']]
    require(ts == sorted(set(ts)), 'sample times not strictly increasing')
    before, after = [t for t in ts if t <= rail], [t for t in ts if t >= rail]
    require(bool(before) and bool(after), 'no committed interval containing rail event')
    lo, hi = max(before), min(after)
    window = sidecar['stepWindowTrials']
    require(all(0.18 <= p['trialStartS'] <= 0.25 for p in window), 'window population differs')
    counts = {}
    for field in ('straddledTrials', 'clippedTrials'):
        events = sidecar[field]
        local = [p for p in events if 0.18 <= p['trialStartS'] <= 0.25]
        # The driver records at most the first strictly-interior knot per
        # proposal. Rejected proposals may reuse a start time, so distinct
        # starts are not a count of trial attempts; these remain raw events.
        counts[field] = {'globalRawKnotEvents': len(events), 'windowKnotEvents': len(local),
                         'windowDistinctTrialStarts': len({p['trialStartS'] for p in local})}
    return {'railEventTimeS': rail, 'containingCommittedIntervalS': [lo, hi],
            'configuredRefinementWidthLimitS': sidecar['driverLimits']['eventRootWidthS'],
            'observedFinalCandidateRefinementBracket': 'unavailable in sealed binary',
            'totalAdaptiveTrialCount': 'unavailable in sealed binary',
            'totalIntegrationCallCount': 'unavailable in sealed binary',
            'committedSampleCount': len(ts), 'windowTrialAttemptsIncludingRejected': len(window),
            'windowS': [0.18, 0.25], 'counts': counts,
            'populationNote': 'local only; straddles and clips are different event types; no global rate/efficiency comparison'}


def validate_sidecar(cc, raw, case):
    require(sum(line.startswith(cc.SIDECAR_PREFIX.encode()) for line in raw.splitlines()) == 1,
            'mechanism sidecar missing or duplicated')
    side = cc.parse_sidecar(raw)
    require(side is not None, 'mechanism sidecar missing')
    require(side['schemaId'] == 'candidate-native-diagnostic-mechanism-sidecar/1.0.0', 'sidecar schema differs')
    split = case['controls'] is not None
    require(side['splitAtThrustKnots'] is split, 'split policy not applied')
    require(side['appliedAbsoluteTolerances'] == cc.INHERITED_LITERALS, 'tolerances differ')
    require(side['absoluteTolerancePolicy'] == ('inherited' if split else 'inherited-absent-default'),
            'tolerance policy differs')
    require(side['numericalPolicyId'] == ('candidate-native-diagnostic-numerics/1.0.0' if split
                                         else 'inherited-candidate-driver-numerics/1.0.0'), 'policy ID differs')
    require(not side['straddledTrials'] if split else not side['clippedTrials'], 'unexpected mechanism events')
    require(side['driverLimits']['eventRootWidthS'] == 1e-5, 'configured root width differs')
    return side


def audit_outputs(output, ledger):
    """Recompute actual evidence hashes, including reservations; missing files
    and absent expected hashes fail rather than passing an empty all()."""
    checks = []
    for row in ledger:
        cid = row['id']
        for rel, field in ((cid + '.input.json', 'inputSha256'), (cid + '.stdout', 'stdoutSha256'),
                           (cid + '.stderr', 'stderrSha256'),
                           ('reservations/' + cid + '.reservation.json', 'reservationSha256')):
            path = output / rel
            expected = row.get(field)
            observed = sha(path.read_bytes()) if path.is_file() else None
            state = ('not-recorded' if not expected else 'missing-file' if observed is None
                     else 'match' if observed == expected else 'mismatch')
            checks.append({'path': rel, 'expected': expected, 'observed': observed, 'state': state})
    return {'allMatch': bool(checks) and all(c['state'] == 'match' for c in checks), 'checks': checks}


def reference_ok(metrics):
    return all(metrics.get('checks', {}).get(k, {}).get('pass') is True for k in REFERENCE_CHECKS)


def summarize(plan, ledger, deltas, anchors, manufactured):
    profiles = {r['id']: r for r in ledger if r['id'] in CASE_IDS}
    complete_metrics = set(profiles) == set(CASE_IDS) and all('metrics' in r for r in profiles.values())
    controls_ok = (manufactured.get('pass') is True and complete_metrics
                   and all(reference_ok(r['metrics']) for r in profiles.values()))
    pairs = {}
    for suffix in ('020', '010', '005'):
        a, c = (profiles.get(series + '-dt' + suffix, {}) for series in ('A', 'C'))
        if 'metrics' in a and 'metrics' in c:
            pairs[suffix] = {k: c['metrics'][k] - a['metrics'][k] for k in METRICS}
            pairs[suffix]['modelMismatchFloorMps2'] = plan['modelMismatchFloorMps2']
    integrity = (len(ledger) == 7 and tuple(r['id'] for r in ledger) == CASE_IDS + ('H-legacy',)
                 and all(r['pass'] for r in ledger) and controls_ok and len(pairs) == 3)
    return {'schema': 'rmp12c-regime-expansion-result/1.0.0',
            'integrityStatus': 'complete' if integrity else 'incomplete',
            'comparisonsUnresolved': not controls_ok,
            'totalProcessAttempts': len(ledger), 'retries': 0,
            'reserveStatus': {cid: (r['metrics']['diagnosticPass'] if controls_ok and 'metrics' in r else 'unresolved')
                              for cid, r in profiles.items()},
            'anyProvisionalReserveFailed': (any(r['metrics']['anyReserveFailed'] for r in profiles.values())
                                            if controls_ok else None),
            'retained20msDefaultFailureReproduced': (not profiles['A-dt020']['metrics']['checks']['railTimeErrorS']['pass']
                                                    if controls_ok else None),
            'deltaSets': deltas, 'anchorProvenance': anchors,
            'referenceControls': {'manufacturedCrossing': manufactured, 'allSixCoarseFineChecksPass': controls_ok},
            'fixedStepPairwiseCMinusA': pairs,
            'seriesTables': {series: [dict(id=series + '-dt' + suffix,
                                          **{k: profiles.get(series + '-dt' + suffix, {}).get(k)
                                             for k in ('metrics', 'serviceEvidence')})
                                      for suffix in ('020', '010', '005')] for series in ('A', 'C')},
            'confounds': plan['confounds'], 'unavailableEvidence': plan['unavailableEvidence'],
            'unavailablePolicy': plan['unavailablePolicy'], 'modelMismatchFloorMps2': plan['modelMismatchFloorMps2'],
            'reserveInterpretation': 'Provisional software diagnostics only. Passing ANY row never waives retained 20 ms failure/RMP12-C02 and is not a default recommendation.',
            'mismatchInterpretation': 'Acceleration mismatch is pointwise, not a proved propagated state-error floor or bound.',
            'nonClaims': plan['nonClaims'], 'cases': ledger}


def run(profile, legacy, output):
    plan, seal, plan_raw, seal_raw, legacy_raw, cc, cases, deltas, anchors = preflight(profile, legacy, output)
    output.mkdir(parents=True, exist_ok=False)
    (output / 'reservations').mkdir()
    durable_bytes(output / 'experiment.json', plan_raw, True)
    durable_bytes(output / 'run-seal.json', seal_raw, True)
    # Reference controls do not call the native executable; failures stay unresolved.
    try:
        manufactured = dict(pass_=True, **cc.manufactured_crossing_check())
        manufactured['pass'] = manufactured.pop('pass_')
    except (AssertionError, ValueError) as exc:
        manufactured = {'pass': False, 'error': repr(exc)}
    ledger = []
    for case in plan['cases']:
        cid = case['id']
        row, stdout, stderr = attempt(profile, plan['binarySha256']['profileExample'], cid,
                                      encode(cases[cid]), output, ledger, case['expected'])
        row['deltaSet'] = deltas[cid]
        try:
            require(row.get('exitCode') == 0, 'profile did not return success')
            report = json.loads(stdout)
            require('error' not in report, 'error reply instead of report')
            require(not any(k in report for k in ('mechanism', 'cutKnotsS', 'clippedTrials', 'stepWindowTrials')),
                    'sidecar leaked into compared report')
            require(cc.changed_leaves(report['effectiveInputs'], cases[cid]) == [], 'effective inputs differ bitwise')
            row['sidecar'] = validate_sidecar(cc, stderr, case)
            metrics = cc.compare_case(report, cases[cid], plan)
            # Keep the old helper's window explicitly distinct from bracketing evidence.
            metrics['diagnosticPlusMinus20msSampleWindowS'] = metrics.pop('railRootAtSampleTimes')
            for check in metrics['checks'].values():
                check['modelMismatchFloorMps2'] = plan['modelMismatchFloorMps2']
            row['metrics'] = metrics
            row['serviceEvidence'] = service_evidence(report, row['sidecar'])
            if cid in ('A-dt020', 'C-dt020'):
                expected = plan['anchorStdoutSha256'][cid[0]]
                row['determinism'] = {'expectedSha256': expected, 'match': sha(stdout) == expected}
                require(row['determinism']['match'], '20 ms stdout determinism mismatch; retained, never retried')
            row['pass'] = True  # integrity/disposition only, NOT provisional reserve verdict
        except (AssertionError, ValueError, KeyError, TypeError, IndexError, OverflowError, StopIteration) as exc:
            row['error'] = repr(exc)
        durable_json(output / 'attempts.json', ledger)
    row, stdout, stderr = attempt(legacy, plan['binarySha256']['legacyExample'], 'H-legacy',
                                  legacy_raw, output, ledger, plan['legacy']['purpose'], legacy=True)
    try:
        require(row.get('exitCode') == 0, 'legacy call failed')
        require(sha(stdout) == plan['legacy']['expectedStdoutSha256'], 'legacy bytes changed')
        require(cc.parse_sidecar(stderr) is None, 'legacy emitted diagnostic mechanism sidecar')
        row['pass'] = True
    except (AssertionError, ValueError, KeyError) as exc:
        row['error'] = repr(exc)
    durable_json(output / 'attempts.json', ledger)
    result = summarize(plan, ledger, deltas, anchors, manufactured)
    result['fileHashAudit'] = audit_outputs(output, ledger)
    if not result['fileHashAudit']['allMatch']:
        result['integrityStatus'] = 'incomplete'
    result.update(planSha256=sha(plan_raw), contractSha256=seal['contractSha256'],
                  runSealSha256=sha(seal_raw), checkerSha256=sha(Path(__file__).read_bytes()),
                  toolchain=seal['toolchain'], equationBlockIdentity=True)
    durable_json(output / 'result.json', result)
    return result


def main(profile, legacy, output_dir):
    output = Path(output_dir).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    existed_at_start = output.exists()
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S.%fZ')
    invocation = output.parent / f'{output.name}.invocation-{stamp}-{os.getpid()}.json'
    record = {'output': str(output), 'startedUtc': stamp, 'phase': 'preflight',
              'nativeReservations': 0, 'attemptPolicy': 'zero retries; reservation consumes attempt'}
    durable_json(invocation, record, True)
    try:
        require(sys.flags.optimize == 0, 'python -O disables assertions in the frozen dependency; refusing')
        result = run(Path(profile).resolve(), Path(legacy).resolve(), output)
        record.update(phase='finished', nativeReservations=result['totalProcessAttempts'],
                      integrityStatus=result['integrityStatus'])
        durable_json(invocation, record)
        print(json.dumps({'integrityStatus': result['integrityStatus'],
                          'comparisonsUnresolved': result['comparisonsUnresolved'],
                          'reserveStatus': result['reserveStatus'], 'invocation': str(invocation)}, indent=2))
        return 0 if result['integrityStatus'] == 'complete' else 1
    except Exception:
        reservations = output / 'reservations'
        record.update(phase='failed', traceback=traceback.format_exc(),
                      nativeReservations=(len(list(reservations.glob('*.reservation.json')))
                                          if not existed_at_start and reservations.exists() else 0))
        durable_json(invocation, record)
        print(record['traceback'], file=sys.stderr)
        return 1


if __name__ == '__main__':
    if len(sys.argv) != 4:
        print(__doc__)
        sys.exit(2)
    sys.exit(main(*sys.argv[1:]))
