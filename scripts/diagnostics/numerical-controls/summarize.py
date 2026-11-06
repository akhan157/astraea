#!/usr/bin/env python3
"""Summarize retained N1 results, without launching any native/WASM process."""
import importlib.util
import argparse
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('n1_runner',HERE/'run.py')
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
ROOT = HERE.parents[2]
OUTPUT = ROOT/'docs/internal/accuracy-program/diagnostics/N1-numerical-controls-2026-10-26.json'
CHANNELS = {'altitude':'m AGL','speed':'m/s airspeed','mach':'dimensionless','acceleration':'m/s^2','dynamicPressure':'Pa','drag':'N','thrust':'N','angleOfAttackDeg':'degrees','angularRateNorm':'rad/s from displayed p,q,r'}


def coarse_scalars(dto):
    values = {}
    def walk(value,path):
        if isinstance(value,dict):
            for key,item in value.items():
                walk(item,f'{path}.{key}' if path else key)
        elif isinstance(value,(int,float)) and not isinstance(value,bool):
            values[path] = value
    for key,value in dto.items():
        if key not in ['telemetry','events','runManifest']:
            walk(value,key)
    return values


def peaks(dto):
    result = {}
    for channel,unit in CHANNELS.items():
        def value(point):
            if channel=='angularRateNorm':
                return math.sqrt(sum(v*v for v in point['angularVelocity'].values()))
            return point[channel]
        index,point = max(enumerate(dto['telemetry']),key=lambda item:value(item[1]))
        result[channel] = {'value':value(point),'timeS':point['time'],'retainedIndex':index,'unit':unit}
    return result


def attitude_comparison(dto,reference):
    """Sign-invariant relative-quaternion angle at exactly common sample times."""
    ref = {p['time']:p['q'] for p in reference['telemetry']}
    maximum = 0.
    at_time = None
    common = 0
    norm_error = 0.
    for point in dto['telemetry']:
        q = point['q']
        norm_error = max(norm_error,abs(math.sqrt(sum(v*v for v in q.values()))-1.))
        if point['time'] not in ref:
            continue
        common += 1
        a,b = ref[point['time']],q
        # conjugate(a) * b. atan2 avoids acos loss near zero; quaternion
        # normalization cancels in this ratio. abs(w) handles q and -q.
        w=a['w']*b['w']+a['x']*b['x']+a['y']*b['y']+a['z']*b['z']
        x=a['w']*b['x']-a['x']*b['w']-a['y']*b['z']+a['z']*b['y']
        y=a['w']*b['y']+a['x']*b['z']-a['y']*b['w']-a['z']*b['x']
        z=a['w']*b['z']-a['x']*b['y']+a['y']*b['x']-a['z']*b['w']
        angle=2*math.atan2(math.sqrt(x*x+y*y+z*z),abs(w))
        if angle>maximum:
            maximum,at_time=angle,point['time']
    return {'exactCommonRetainedTimes':common,'currentUnmatchedTimes':len(dto['telemetry'])-common,'referenceUnmatchedTimes':len(reference['telemetry'])-common,'maxRelativeAttitudeRad':maximum,'maxRelativeAttitudeTimeS':at_time,'maxRetainedQuaternionNormError':norm_error,'method':'sign-invariant conjugate(reference)*current; 2*atan2(vector norm, abs scalar); exact common timestamps only, no interpolation'}


def summarize(output=OUTPUT,evidence_output=None):
    plan,review = runner.verify()
    evidence = runner.EVIDENCE
    ledger = runner.load(evidence/'ledger.json')
    assert ledger['totalNativeFlightAttempts'] == 20
    assert all(a['status'] in ['complete','complete-parity-pass'] for a in ledger['attempts'])
    native = {a['ordinal']:runner.load(evidence/f"{a['ordinal']:02d}.native.json") for a in ledger['attempts']}
    calls = {(a['caseId'],a['experiment']):a for a in ledger['attempts']}
    rows = []
    for attempt in ledger['attempts']:
        dto = native[attempt['ordinal']]['result']
        reference_experiment = 'integration-0.01' if attempt['experiment'].startswith('event-root') else 'default-parity'
        reference = calls[(attempt['caseId'],reference_experiment)]
        ref_dto = native[reference['ordinal']]['result']
        scalars,ref_scalars = coarse_scalars(dto),coarse_scalars(ref_dto)
        retained,ref_retained = peaks(dto),peaks(ref_dto)
        event_names = [x['name'] for x in dto['events']]
        reference_names = [x['name'] for x in ref_dto['events']]
        assert event_names == reference_names, 'Event ordering differs; do not silently align'
        events = [{'name':event['name'],'timeS':event['time'],'signedTimeDeltaS':event['time']-ref_event['time'],'signedAltitudeDeltaM':event['altitude']-ref_event['altitude'],'signedVelocityDeltaMs':event['velocity']-ref_event['velocity']} for event,ref_event in zip(dto['events'],ref_dto['events'])]
        for channel,peak in retained.items():
            peak['signedValueDelta'] = peak['value']-ref_retained[channel]['value']
            peak['signedPeakTimeDeltaS'] = peak['timeS']-ref_retained[channel]['timeS']
        discrete = {key:value for key,value in dto.items() if isinstance(value,(str,bool)) or value is None}
        discrete['enveloped'] = dto['enveloped']
        discrete['offNominalExcursion'] = dto['offNominalExcursion']
        rows.append({'ordinal':attempt['ordinal'],'caseId':attempt['caseId'],'experiment':attempt['experiment'],'controls':attempt['controls'],'referenceOrdinal':reference['ordinal'],'referenceExperiment':reference_experiment,'status':attempt['status'],'productionDisposition':discrete,'dispositionMatchesReference':all(value==ref_dto[key] for key,value in discrete.items()),'coarseScalars':scalars,'signedScalarDeltas':{key:value-ref_scalars[key] for key,value in scalars.items()},'events':events,'eventNamesOrderMatchesReference':True,'retainedTelemetry':{'points':len(dto['telemetry']),'atWireCap':len(dto['telemetry'])==5000,'firstTimeS':dto['telemetry'][0]['time'],'lastTimeS':dto['telemetry'][-1]['time'],'terminalTimeMatchesDuration':dto['telemetry'][-1]['time']==dto['flightDuration'],'pointCountMatchesReference':len(dto['telemetry'])==len(ref_dto['telemetry']),'timestampArrayMatchesReference':[p['time'] for p in dto['telemetry']]==[p['time'] for p in ref_dto['telemetry']]},'retainedSamplePeaks':retained,'counts':native[attempt['ordinal']]['counts'],'resource':{key:attempt[key] for key in ['elapsedSeconds','observedAggregatePeakRssKiB']},'evidenceSha256':attempt['evidenceSha256']})
        rows[-1]['attitudeAtCommonRetainedTimes'] = attitude_comparison(dto,ref_dto)
    experiments = []
    for tag in ['integration-0.1','integration-0.01','event-root-1e-6','event-root-1e-7']:
        subset = [r for r in rows if r['experiment']==tag]
        experiments.append({'experiment':tag,'referenceExperiment':subset[0]['referenceExperiment'],'scalarMaximumAbsoluteDeltas':{key:max(abs(row['signedScalarDeltas'][key]) for row in subset) for key in subset[0]['signedScalarDeltas']},'maximumAbsoluteEventTimeDeltaS':max(abs(event['signedTimeDeltaS']) for row in subset for event in row['events']),'retainedPeakMaximumAbsoluteValueDeltas':{channel:max(abs(row['retainedSamplePeaks'][channel]['signedValueDelta']) for row in subset) for channel in CHANNELS}})
        experiments[-1]['maximumRelativeAttitudeAtExactCommonRetainedTimesRad'] = max(row['attitudeAtCommonRetainedTimes']['maxRelativeAttitudeRad'] for row in subset)
    result = {'schema':'N1-numerical-controls-results-v1','sourceCommit':plan['sourceCommit'],'reviewManifestSha256':runner.sha((evidence/'review-manifest.json').read_bytes()),'binarySha256':review['binarySha256'],'frozenWasmSha256':plan['frozenWasmSha256'],'historicalRecipeIdentity':'unverified; preparation-time script hash differs from retained script; actual generated source and recorded binary build hash independently verified','historicalProvenanceDiscrepancies':review['historicalProvenanceDiscrepancies'],'ledgerSha256':runner.sha((evidence/'ledger.json').read_bytes()),'nativeFlightAttempts':20,'failedOrRetriedAttempts':0,'newWasmCalls':0,'priorWasmCallsReused':20,'allTerminated':all(r['productionDisposition']['terminated'] for r in rows),'allDefaultParityPass':all(r['status']=='complete-parity-pass' for r in rows[:4]),'defaultParity':runner.load(evidence/'default-parity-summary.json'),'analyticSummary':review['analyticSummary'],'experiments':experiments,'runs':rows,'limitations':['Computational sensitivity on four frozen wire DTOs; no observed trajectory data or physical accuracy inference.','Both ordinary and event integration tolerances change together; root-only probes retain integration scale 0.01.','Coarse production scalars and event quantities use their existing engine definitions; no canonical continuous-time peak recomputation.','Telemetry uses display cadence (every fifth macro step before apogee, every macro step before rail exit/after apogee), display rounding, and decimation to at most 5000 retained samples.','Telemetry is bounded/decimated, not silently truncated; original full-series point counts cannot be recovered from these DTOs. All retained runs cover touchdown.','Retained-sample peak differences include rounding and changing sample selection; no index-aligned trajectory norm or continuous maximum is inferred.','No monotonic-convergence or universal numerical/physical error bound.','Production PASS validity and safety flags retain their legacy meanings; this diagnostic does not certify primary use.','RSS is sampled process-tree resident memory, not a kernel-enforced memory cap.']}
    evidence_output = evidence_output or evidence/'results-summary.json'
    assert not output.exists() and not evidence_output.exists(), 'Select fresh summary output paths to preserve prior evidence'
    runner.atomic_json(output,result)
    runner.atomic_json(evidence_output,result)
    print(json.dumps({'output':str(output),'nativeFlightAttempts':20,'allTerminated':result['allTerminated'],'experimentMaxima':experiments},indent=2))


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=OUTPUT)
    parser.add_argument('--evidence-output',type=Path)
    args=parser.parse_args()
    summarize(args.output,args.evidence_output)
