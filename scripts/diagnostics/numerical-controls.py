#!/usr/bin/env python3
"""N1 external-source preparation/build/analytic checks; no flight sweep here.

Production source is read-only. Generated source and full evidence stay outside
Git. A separately reviewed runner will consume call-manifest.json, reserving
each actual native flight attempt durably before invoking the binary.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import resource
import signal
import shutil
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
APPENDIX = ROOT / 'scripts/diagnostics/numerical-controls/kernel_appendix.rs'
MAIN = ROOT / 'scripts/diagnostics/numerical-controls/main.rs'
EVIDENCE = Path('/workspace/astraea-plan/evidence/accuracy-first-batch-20261025/N1')
PRIOR = Path('/workspace/astraea-plan/evidence/accuracy-execution-20261025')
BASE = '00e768b'
WASM_SHA = 'c1a1a177d56b73e4f5862d29098743e0bc31f51499d1c7534776b34ba2e8c4fe'
IDS = ['cosmic-cargo-2986', 'mini-dx3-g69n-2017-06-30', 'top-shot-e12-2017-12-14', 'adventurer-j510w-2021-04-17']


def sha(data):
    return hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + '\n')


def prepare():
    assert subprocess.check_output(['git', 'rev-parse', BASE], cwd=ROOT, text=True).strip() == subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(), 'Prepare only on pinned base plus uncommitted diagnostic files'
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    shadow = EVIDENCE / 'generated'
    assert not shadow.exists(), 'Never overwrite prepared evidence; coordinator must select a fresh location'
    before = {}
    for crate in ['astraea-core', 'astraea-engine']:
        source = ROOT / 'crates' / crate
        destination = shadow / 'crates' / crate
        destination.mkdir(parents=True)
        for item in ['src', 'data', 'Cargo.toml', 'Cargo.lock']:
            path = source / item
            if path.exists():
                if path.is_dir():
                    shutil.copytree(path, destination / item)
                else:
                    shutil.copy2(path, destination / item)
        for path in sorted(destination.rglob('*')):
            if path.is_file():
                before[str(path.relative_to(shadow))] = sha(path.read_bytes())
    source_path = shadow / 'crates/astraea-core/src/six_dof.rs'
    original = source_path.read_text()
    transformed = original
    edits = []

    def replace(label, anchor, replacement, count=1):
        nonlocal transformed
        assert transformed.count(anchor) == count, f'{label}: expected {count} exact source anchor(s)'
        transformed = transformed.replace(anchor, replacement)
        edits.append({'label': label, 'count': count, 'before': anchor, 'after': replacement})

    tol = '    let tol = AdaptiveTolerances { r: 1e-3, v: 1e-2, q: 1e-5, w: 1e-3 };'
    assert transformed.count(tol) == 2
    # Explicit order anchors distinguish the full-flight and root reintegration
    # declarations, even though their default numeric vectors are identical.
    first = transformed.index(tol)
    second = transformed.index(tol, first + len(tol))
    assert transformed.index('pub fn simulate_flight(') < first < transformed.index('fn refine_crossing(') < second
    transformed = transformed[:second] + transformed[second:].replace(tol, '    let tol = n1_tolerances(true);', 1)
    transformed = transformed[:first] + transformed[first:].replace(tol, '    let tol = n1_tolerances(false);', 1)
    edits.append({'label': 'separate ordinary/event tolerance declarations', 'count': 2, 'before': tol, 'after': ['    let tol = n1_tolerances(false);', '    let tol = n1_tolerances(true);']})
    replace('ordinary endpoint path counter context', 'integrate_rigid_adaptive(&b_state, &loads, b_t, t,', 'n1_integrate(false, &b_state, &loads, b_t, t,')
    replace('burnout exact-time reintegration counter context', 'integrate_rigid_adaptive(&b_state, &loads, b_t, motor.burn_time,', 'n1_integrate(false, &b_state, &loads, b_t, motor.burn_time,')
    replace('crossing reintegration counter context', 'integrate_rigid_adaptive(base, &loads, t0, t1,', 'n1_integrate(true, base, &loads, t0, t1,')
    replace('event root time control', '    let tol_t = 1e-5;', '    let tol_t = n1_event_time_tolerance();')
    replace('attempt counter', '    while t < t_end {\n', '    while t < t_end {\n        n1_count(0);\n')
    replace('accepted counter', '            steps += 1;\n', '            steps += 1;\n            n1_count(1);\n')
    replace('rejected counters, finite and nonfinite paths', '            rejected += 1;\n', '            rejected += 1;\n            n1_count(2);\n', 2)
    replace('event root iteration counter', '    while b - a > tol_t {\n', '    while b - a > tol_t {\n        n1_root_iteration();\n')
    norm = '    let qn = (st.q.w * st.q.w + st.q.x * st.q.x + st.q.y * st.q.y + st.q.z * st.q.z).sqrt();\n'
    replace('read-only norm observer', norm, norm + '    n1_observe_norm(qn);\n')
    # Recover original byte-for-byte after removing every declared edit. This
    # checks the complete generated production prefix, not a selected RHS alone.
    recovered = transformed
    for edit in reversed(edits):
        after = edit['after']
        if isinstance(after, list):
            for text in after:
                assert recovered.count(text) == 1
                recovered = recovered.replace(text, edit['before'])
        else:
            assert recovered.count(after) == edit['count']
            recovered = recovered.replace(after, edit['before'])
    assert recovered == original, 'Undeclared generated production-source difference'
    root_start = original.index('    let mut a = t0;\n', original.index('fn refine_crossing('))
    root_end = original.index('    Ok(Refined {', root_start)
    root_body = original[root_start:root_end]
    appendix = APPENDIX.read_text()
    assert appendix.count('__N1_VERBATIM_ROOT_SEARCH__') == 1
    appendix = appendix.replace('    __N1_VERBATIM_ROOT_SEARCH__\n', root_body)
    source_path.write_text(transformed + appendix)
    example = shadow / 'crates/astraea-engine/examples/n1_numerical.rs'
    example.parent.mkdir()
    example.write_bytes(MAIN.read_bytes())
    after = {str(path.relative_to(shadow)): sha(path.read_bytes()) for path in sorted(shadow.rglob('*')) if path.is_file()}
    expected_changed = ['crates/astraea-core/src/six_dof.rs']
    assert [key for key in before if before[key] != after[key]] == expected_changed
    assert set(after) - set(before) == {'crates/astraea-engine/examples/n1_numerical.rs'}
    # These functions and their entire compilation units remain byte-identical;
    # the generated six_dof prefix inverse assertion covers its loads function.
    for relative in before:
        if relative != expected_changed[0]:
            assert before[relative] == after[relative]
    prior_results = json.loads((PRIOR / 'results.json').read_text())
    assert prior_results['flightCalls'] == 20
    assert sha((PRIOR / 'frozen.wasm').read_bytes()) == WASM_SHA
    cases = []
    (EVIDENCE / 'frozen').mkdir()
    for case_id in IDS:
        record = next(row for row in prior_results['runs'] if row['caseId'] == case_id and row['experiment'] == 'baseline')
        raw = (PRIOR / f'{case_id}.baseline.raw.json').read_bytes()
        assert sha(raw) == record['rawSha256']
        baseline = json.loads(raw)
        # Copy wire and expected DTO only. No observed trajectory/source CSV is
        # needed or admitted into this numerical experiment.
        wire_path = EVIDENCE / 'frozen' / f'{case_id}.wire.json'
        expected_path = EVIDENCE / 'frozen' / f'{case_id}.expected.json'
        write_json(wire_path, baseline['wire'])
        write_json(expected_path, baseline['result'])
        assert baseline['wire']['options'].get('timeStep', .01) == .01
        cases.append({'caseId': case_id, 'priorRawSha256': record['rawSha256'], 'wirePath': str(wire_path), 'wireFileSha256': sha(wire_path.read_bytes()), 'expectedPath': str(expected_path), 'expectedFileSha256': sha(expected_path.read_bytes()), 'telemetryPoints': len(baseline['result']['telemetry']), 'telemetryTimesSha256': sha(json.dumps([x['time'] for x in baseline['result']['telemetry']], separators=(',', ':')).encode()), 'eventNames': [x['name'] for x in baseline['result']['events']]})
    calls = []
    for tag, ordinary_scale, event_scale, root_tolerance in [('default-parity', 1., 1., 1e-5), ('integration-0.1', .1, .1, 1e-5), ('integration-0.01', .01, .01, 1e-5), ('event-root-1e-6', .01, .01, 1e-6), ('event-root-1e-7', .01, .01, 1e-7)]:
        for case in cases:
            calls.append({'ordinal': len(calls)+1, 'caseId': case['caseId'], 'experiment': tag, 'macroTimeStepS': .01, 'controls': {'ordinaryScale': ordinary_scale, 'eventScale': event_scale, 'eventTimeToleranceS': root_tolerance}, 'wireFileSha256': case['wireFileSha256'], 'requiresAllDefaultsParity': tag != 'default-parity'})
    manifest = {'schema': 'N1-native-plan-v1', 'sourceCommit': subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(), 'frozenWasmSha256': WASM_SHA, 'previousProductionFlightCalls': 20, 'newNativeFlightCallsExecuted': 0, 'maximumNativeFlightAttempts': 20, 'ordinaryDefaultTolerance': {'r': .001, 'v': .01, 'q': .00001, 'w': .001}, 'eventIntegrationDefaultTolerance': {'r': .001, 'v': .01, 'q': .00001, 'w': .001}, 'defaultEventRootToleranceS': .00001, 'maximumAdaptiveStepS': .05, 'initialAdaptiveStepS': .005, 'denseOutput': 'piecewise cubic Hermite using endpoints and endpoint derivatives; normalized quaternion interpolation; no assumed DP quartic dense extension', 'cases': cases, 'calls': calls,
                'parityPolicy': {'purpose': 'computational native/WASM reproduction, not physical accuracy or a numerical error bound', 'structural': 'exact key sets/array lengths, booleans, strings, event names/order, telemetry index correspondence', 'numericCoarseAndTerminal': {'absolute': 1e-8, 'relative': 1e-10, 'units': 'native declared units per scalar'}, 'telemetryTimes': {'absoluteS': 1e-9, 'relative': 1e-12}, 'telemetryQuaternion': {'absolute': 2e-12, 'relative': 0.0}, 'roundedNonterminalTelemetryFields': 'exact numeric values; any rounding-cell change stops for explanation', 'comparisonFields': 'every field of expected full production DTO, including events and all retained telemetry timestamps/state/load display channels', 'stop': 'retain and report every out-of-budget/default schema difference; do not launch tight calls until all four defaults pass or root reviews and explains differences', 'unobservedLimit': 'frozen WASM does not expose unrounded local loads; source identity and earlier load parity support that assembly, not a newly measured unrounded WASM RHS comparison'},
                'ledgerPolicy': 'append/fsync attempted record before process launch, record success/error/trap/resource result; never repeat failed or completed calls silently; failures consume the 20-attempt budget; no sweep authorized until root seam review', 'counterPolicy': 'attempted/accepted/rejected counts per ordinary endpoint/burnout path and event crossing reintegration; includes probes later discarded by event restart, measures work not uniquely committed steps; counters do not mutate states, controls, iteration order, random inputs or numerical decisions', 'analyticPlan': {'fixtures': ['ballistic-apogee', 'constant-acceleration-rail', 'spherical-torque-free', 'principal-axis-torque-free', 'damped-oscillator'], 'toleranceScales': [1., .1, .01], 'maximumStepsS': [.2, .05, .0125], 'offNodeFractionsPerAcceptedStep': [.173, .371, .733], 'rootTolerancesS': [1e-5, 1e-6, 1e-7], 'correctnessGates': {'maxPositionM': .001, 'maxVelocityMs': .01, 'maxAttitudeRad': .0001, 'maxRateRadS': 1e-10, 'rootRightEndpointS': '[-1e-10, tolerance+1e-10] relative to analytic root'}, 'interpretation': 'endpoint and off-node dense/root errors separate; no assumed monotonicity or universal convergence order'}, 'edits': edits, 'sourceHashesBefore': before, 'sourceHashesAfter': after, 'verbatimRootSearchSha256': sha(root_body.encode()), 'diagnosticSourceSha256': {str(p.relative_to(ROOT)): sha(p.read_bytes()) for p in [Path(__file__),APPENDIX,MAIN]}}
    write_json(EVIDENCE / 'call-manifest.json', manifest)
    write_json(EVIDENCE / 'ledger.json', {'attempts': [], 'totalNativeFlightAttempts': 0})
    print(json.dumps({'prepared': str(EVIDENCE), 'sourceFiles': len(before), 'nativeFlights': 0, 'planned': len(calls)}))


def execute(mode):
    manifest = EVIDENCE / 'generated/crates/astraea-engine/Cargo.toml'
    binary = EVIDENCE / 'target/debug/examples/n1_numerical'
    env = os.environ.copy()
    env['CARGO_BUILD_JOBS'] = '1'
    env['CARGO_TARGET_DIR'] = str(EVIDENCE / 'target')
    commands = {'build': ['cargo','build','--locked','--offline','--manifest-path',str(manifest),'--example','n1_numerical'], 'analytic': [str(binary),'analytic']}
    started = time.monotonic()
    with (EVIDENCE / f'{mode}.stdout').open('w') as stdout, (EVIDENCE / f'{mode}.stderr').open('w') as stderr:
        process = subprocess.Popen(['taskset','-c','1']+commands[mode],cwd=ROOT,env=env,stdout=stdout,stderr=stderr,start_new_session=True)
        peak_rss = 0
        while process.poll() is None:
            # Aggregate this process tree's resident pages to enforce the lease,
            # not RLIMIT_AS (WASM/native toolchains can reserve sparse VA).
            processes = {}
            for status_path in Path('/proc').glob('[0-9]*/status'):
                try:
                    fields = dict(line.split(':',1) for line in status_path.read_text().splitlines() if ':' in line)
                    processes[int(fields['Pid'])] = (int(fields['PPid']), int(fields.get('VmRSS','0 kB').split()[0]))
                except (FileNotFoundError,ProcessLookupError,StopIteration):
                    pass
            pending = [process.pid]
            rss = 0
            while pending:
                pid = pending.pop()
                rss += processes.get(pid,(0,0))[1]
                pending.extend(child for child,(parent,_) in processes.items() if parent == pid)
            peak_rss = max(peak_rss,rss)
            if rss > 2 * 1024 * 1024:
                os.killpg(process.pid,signal.SIGTERM)
                process.wait(timeout=10)
                raise RuntimeError('N1 aggregate RSS exceeded 2 GiB lease; job stopped')
            time.sleep(.1)
    stats = {'mode': mode, 'exitCode': process.returncode, 'elapsedSeconds': time.monotonic()-started, 'observedAggregatePeakRssKiB': peak_rss, 'childMaxRssKiB': resource.getrusage(resource.RUSAGE_CHILDREN).ru_maxrss, 'cpuAffinity': [1], 'nativeFlightAttempts': 0}
    if mode == 'build' and process.returncode == 0:
        stats['binarySha256'] = sha(binary.read_bytes())
        stats['rustcVersion'] = subprocess.check_output(['rustc','--version','--verbose'],env=env,text=True)
    write_json(EVIDENCE / f'{mode}.resource.json',stats)
    print(json.dumps(stats))
    assert process.returncode == 0, f'{mode} failed; inspect retained stderr'
    if mode == 'analytic':
        output = json.loads((EVIDENCE / 'analytic.stdout').read_text())
        assert output['wholeFlightCalls'] == 0
        write_json(EVIDENCE / 'analytic-results.json',output)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['prepare','build','analytic'])
    args = parser.parse_args()
    prepare() if args.mode == 'prepare' else execute(args.mode)
