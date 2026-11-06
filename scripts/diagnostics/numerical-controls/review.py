#!/usr/bin/env python3
"""Seal retained N1 preparation evidence for root review; never runs a flight."""
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path('/workspace/astraea-plan/evidence/accuracy-first-batch-20261025/N1')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def seal():
    plan = json.loads((EVIDENCE/'call-manifest.json').read_text())
    assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip() == plan['sourceCommit']
    assert json.loads((EVIDENCE/'ledger.json').read_text()) == {'attempts':[],'totalNativeFlightAttempts':0}
    assert not list(EVIDENCE.glob('[0-9][0-9].*')), 'Flight artifacts already exist'
    historical_mismatches = []
    for relative, expected in plan['diagnosticSourceSha256'].items():
        current = sha((ROOT/relative).read_bytes())
        if current != expected:
            # The interrupted packet already had this preparer discrepancy on
            # resume. Preserve it; reconstruct the actual generated source
            # independently below. The compiled harness must still match.
            assert relative == 'scripts/diagnostics/numerical-controls.py', 'Original compiled harness changed'
            historical_mismatches.append({'path':relative,'atPreparationSha256':expected,'retainedOnResumeSha256':current,'explanation':'Historical preparer bytes unavailable; mismatch predates this resume. Actual generated source is independently reconstructed and matched to base Git.'})
    for relative, expected in plan['sourceHashesBefore'].items():
        original = (ROOT/relative).read_bytes()
        assert sha(original) == expected
        assert subprocess.check_output(['git','show',f"{plan['sourceCommit']}:{relative}"],cwd=ROOT) == original
    for relative, expected in plan['sourceHashesAfter'].items():
        assert sha((EVIDENCE/'generated'/relative).read_bytes()) == expected
    generated_inventory = {str(p.relative_to(EVIDENCE/'generated')) for p in (EVIDENCE/'generated').rglob('*') if p.is_file()}
    assert generated_inventory == set(plan['sourceHashesAfter'])
    relative = 'crates/astraea-core/src/six_dof.rs'
    original = (ROOT/relative).read_text()
    generated = (EVIDENCE/'generated'/relative).read_text()
    root_start = original.index('    let mut a = t0;\n',original.index('fn refine_crossing('))
    root_end = original.index('    Ok(Refined {',root_start)
    root_body = original[root_start:root_end]
    assert sha(root_body.encode()) == plan['verbatimRootSearchSha256']
    appendix = (ROOT/'scripts/diagnostics/numerical-controls/kernel_appendix.rs').read_text().replace('    __N1_VERBATIM_ROOT_SEARCH__\n',root_body)
    assert generated.endswith(appendix)
    recovered = generated[:-len(appendix)]
    for edit in reversed(plan['edits']):
        after = edit['after']
        if isinstance(after,list):
            for text in after:
                assert recovered.count(text) == 1
                recovered = recovered.replace(text,edit['before'])
        else:
            assert recovered.count(after) == edit['count']
            recovered = recovered.replace(after,edit['before'])
    assert recovered == original, 'Undeclared generated production-prefix change'
    assert (EVIDENCE/'generated/crates/astraea-engine/examples/n1_numerical.rs').read_bytes() == (ROOT/'scripts/diagnostics/numerical-controls/main.rs').read_bytes()
    build = json.loads((EVIDENCE/'build.resource.json').read_text())
    analytic_resource = json.loads((EVIDENCE/'analytic.resource.json').read_text())
    analytic = json.loads((EVIDENCE/'analytic-results.json').read_text())
    assert build['exitCode'] == analytic_resource['exitCode'] == 0
    assert build['nativeFlightAttempts'] == analytic_resource['nativeFlightAttempts'] == analytic['wholeFlightCalls'] == 0
    assert analytic == json.loads((EVIDENCE/'analytic.stdout').read_text())
    rows = analytic['analyticCases']
    expected_grid = {(phase,scale,step,fixture) for phase in ['ordinary','event'] for scale in [1.,.1,.01] for step in [.2,.05,.0125] for fixture in plan['analyticPlan']['fixtures']}
    assert len(rows) == 90
    assert {(r['integrationPhase'],r['toleranceScale'],r['maxStepS'],r['fixture']) for r in rows} == expected_grid
    limits = {'positionM':.001,'velocityMs':.01,'attitudeRad':.0001,'rateRadS':1e-10}
    for row in rows:
        for group in ['endpointMaxError','offNodeMaxError']:
            assert all(0 <= row[group][key] < limit for key,limit in limits.items())
        for phase in ['ordinary','event']:
            counts = row['counts'][phase]
            assert counts['attempted'] == counts['accepted'] + counts['rejected']
            if phase != row['integrationPhase']:
                assert counts['attempted'] == 0
        for root in row['rootChecks']:
            assert -1e-10 <= root['signedErrorS'] <= root['toleranceS'] + 1e-10
    binary_sha = sha((EVIDENCE/'target/debug/examples/n1_numerical').read_bytes())
    assert binary_sha == build['binarySha256']
    retained = ['call-manifest.json','build.resource.json','build.stdout','build.stderr','analytic.resource.json','analytic.stdout','analytic.stderr','analytic-results.json']
    diagnostic = ['scripts/diagnostics/numerical-controls.py'] + [str(p.relative_to(ROOT)) for p in sorted(Path(__file__).parent.glob('*')) if p.is_file()]
    review = {
        'schema':'N1-seam-review-v1','sourceCommit':plan['sourceCommit'],
        'callManifestSha256':sha((EVIDENCE/'call-manifest.json').read_bytes()),'binarySha256':binary_sha,
        'reviewedDiagnosticSourceSha256':{name:sha((ROOT/name).read_bytes()) for name in diagnostic},
        'retainedEvidenceSha256':{name:sha((EVIDENCE/name).read_bytes()) for name in retained},
        'proofs':{'productionSourceMatchesGit':True,'generatedSourceInventoryExact':True,'allDeclaredEditsReversedByteForByte':True,'allOtherProductionFilesUnchanged':True,'nativeHarnessEqualsRetainedSource':True,'verbatimAnalyticRootBodySha256':sha(root_body.encode())},
        'analyticSummary':{'cases':len(rows),'rootChecks':sum(len(r['rootChecks']) for r in rows),'wholeFlightCalls':0,'maxima':{group:{key:max(r[group][key] for r in rows) for key in limits} for group in ['endpointMaxError','offNodeMaxError']}},
        'initialLedger':{'attempts':[],'totalNativeFlightAttempts':0},
        'historicalProvenanceDiscrepancies':historical_mismatches,
        'approvalState':'pending-root-review; digest is an identity, not permission',
        'attemptBudget':{'defaults':4,'tighterIntegration':8,'tighterEventRoot':8,'maximum':20},
        'limitations':['Native/WASM parity is pending and gates every tightened call.','Synthetic fixtures exercise production integrator/dense output and copied root bisection, not full physical loads.','Analytic root iteration count is not instrumented; whole-flight event root counts are instrumented.','Sampled resource peaks are observations; one CPU is enforced by taskset, RSS is polled every 20 ms during flights.','Frozen WASM exposes full retained DTO, not an unrounded local RHS.','No physical accuracy or universal convergence-order claim.']}
    destination = EVIDENCE/'review-manifest.json'
    assert not destination.exists(), 'Never overwrite an existing review seal'
    with destination.open('x') as stream:
        json.dump(review,stream,indent=2,sort_keys=True)
        stream.write('\n')
    print(json.dumps({'reviewManifestSha256':sha(destination.read_bytes()),'analyticCases':len(rows),'actualNativeAttempts':0}))


if __name__ == '__main__':
    seal()
