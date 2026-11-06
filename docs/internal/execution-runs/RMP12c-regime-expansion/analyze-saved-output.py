#!/usr/bin/env python3
"""Post-outcome analysis of retained RMP12c files only. ZERO native calls and
no new reference grids/equations/configurations. Never alters run-1 artifacts.
Usage: python3 analyze-saved-output.py /path/to/retained/run-1 > metrics.json
"""
import hashlib
import json
from pathlib import Path
import sys


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def analyze(root):
    checks = []

    def verify(rel, expected):
        path = root / rel
        actual = sha(path.read_bytes()) if path.is_file() else None
        state = ('not-recorded' if not expected else 'missing-file' if actual is None
                 else 'match' if actual == expected else 'mismatch')
        checks.append(dict(path=rel, expected=expected, observed=actual, state=state))

    result_raw = (root / 'result.json').read_bytes()
    ledger_raw = (root / 'attempts.json').read_bytes()
    result = json.loads(result_raw)
    ledger = json.loads(ledger_raw)
    assert result['cases'] == ledger, 'result and final ledger differ'
    assert tuple(row['id'] for row in ledger) == (
        'A-dt020', 'C-dt020', 'A-dt010', 'C-dt010', 'A-dt005', 'C-dt005', 'H-legacy')
    verify('experiment.json', result['planSha256'])
    verify('run-seal.json', result['runSealSha256'])
    table = []
    for row in ledger:
        cid = row['id']
        for suffix, field in (('.input.json', 'inputSha256'), ('.stdout', 'stdoutSha256'),
                              ('.stderr', 'stderrSha256')):
            verify(cid + suffix, row.get(field))
        res_path = 'reservations/' + cid + '.reservation.json'
        verify(res_path, row.get('reservationSha256'))
        reservation = json.loads((root / res_path).read_bytes())
        for field in ('inputSha256', 'binarySha256'):
            assert reservation[field] == row[field], (cid, field)
        if cid == 'H-legacy':
            continue
        report = json.loads((root / (cid + '.stdout')).read_bytes())
        lines = (root / (cid + '.stderr')).read_text().splitlines()
        sidecars = [json.loads(line.split(':', 1)[1]) for line in lines
                    if line.startswith('MECHANISM_SIDECAR_JSON:')]
        assert sidecars == [row['sidecar']], cid
        request = json.loads((root / (cid + '.input.json')).read_bytes())
        assert report['effectiveInputs'] == request, cid
        metrics = row['metrics']
        samples = report['trajectory']['samples']
        assert len(samples) == row['serviceEvidence']['committedSampleCount'], cid
        final = report['trajectory']['finalState']
        floor = result['modelMismatchFloorMps2']
        table.append(dict(id=cid, macroStepS=request['candidate']['launch']['timeStepS'],
            splitAtThrustKnots=row['sidecar']['splitAtThrustKnots'],
            reservePass=metrics['diagnosticPass'],
            railTimeErrorS=metrics['railTimeErrorS'],
            maxPositionErrorM=metrics['maxPositionErrorM'],
            maxVelocityErrorMps=metrics['maxVelocityErrorMps'],
            finalPositionErrorM=abs(final['positionM'][2]-metrics['finalReference']['zM']),
            finalVelocityErrorMps=abs(final['velocityMps'][2]-metrics['finalReference']['vzMps']),
            modelMismatchFloorMps2=floor,
            serviceEvidence=row['serviceEvidence'],
            lastThreeSampleTimesS=[s['timeS'] for s in samples[-3:]],
            referenceChecks={k: metrics['checks'][k] for k in (
                'referencePositionDeltaM', 'referenceVelocityDeltaMps', 'referenceRailDeltaS')},
            failedChecks=[k for k, v in metrics['checks'].items() if not v['pass']],
            determinism=row.get('determinism'),
            inputSha256=row['inputSha256'], stdoutSha256=row['stdoutSha256']))
    paired = []
    for suffix in ('020', '010', '005'):
        a = next(row for row in table if row['id'] == 'A-dt' + suffix)
        c = next(row for row in table if row['id'] == 'C-dt' + suffix)
        paired.append(dict(macroStepS=a['macroStepS'],
            AOverCErrorRatios={key: a[key]/c[key] if c[key] != 0 else None for key in
                              ('railTimeErrorS', 'maxPositionErrorM', 'maxVelocityErrorMps')},
            CMinusA=result['fixedStepPairwiseCMinusA'][suffix],
            modelMismatchFloorMps2=result['modelMismatchFloorMps2']))
    return dict(schema='rmp12c-saved-output-analysis/1.0.0',
        scope='post-outcome saved-output arithmetic/hash checks only; zero native calls or new reference solves',
        originalResultSha256=sha(result_raw), originalAttemptsSha256=sha(ledger_raw),
        integrityStatus=result['integrityStatus'], totalProcessAttempts=len(ledger), retries=result['retries'],
        comparisonsUnresolved=result['comparisonsUnresolved'],
        retained20msDefaultFailureReproduced=result['retained20msDefaultFailureReproduced'],
        anyProvisionalReserveFailed=result['anyProvisionalReserveFailed'],
        hashChecksAllMatch=bool(checks) and all(c['state'] == 'match' for c in checks),
        hashChecks=checks, table=table, paired=paired,
        originalReferenceControls=result['referenceControls'],
        note='Sample counts are retained metrics, cross-checked against the saved arrays; terminal sample times are listed per case, including near-horizon/exact-horizon entries. Nothing is deduplicated.',
        confounds=result['confounds'], unavailablePolicy=result['unavailablePolicy'],
        mismatchInterpretation=result['mismatchInterpretation'], nonClaims=result['nonClaims'])


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    if sys.flags.optimize:
        raise SystemExit('Refusing -O: saved-output consistency checks use assertions')
    output = analyze(Path(sys.argv[1]))
    print(json.dumps(output, indent=2, allow_nan=False))
    raise SystemExit(0 if output['hashChecksAllMatch'] else 1)
