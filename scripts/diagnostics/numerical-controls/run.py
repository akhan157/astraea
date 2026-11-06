#!/usr/bin/env python3
"""Reviewed N1 flight runner. verify is read-only and runs zero flights.

run requires the coordinator-approved SHA-256 of review-manifest.json. Every
launch is counted durably first, including engine errors, process failures,
timeouts and parity failures. It never retries an attempted ordinal.
"""
import argparse
import fcntl
import hashlib
import json
import math
import os
import re
from pathlib import Path
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path('/workspace/astraea-plan/evidence/accuracy-first-batch-20261025/N1')
if not __debug__:
    raise RuntimeError('N1 verification requires Python assertions; do not use -O')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def load(path):
    return json.loads(path.read_text())


def atomic_json(path, value):
    temporary = path.with_suffix(path.suffix + '.tmp')
    with temporary.open('w') as stream:
        json.dump(value, stream, indent=2, sort_keys=True)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary,path)
    descriptor = os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def verify():
    review = load(EVIDENCE/'review-manifest.json')
    plan = load(EVIDENCE/'call-manifest.json')
    assert sha((EVIDENCE/'call-manifest.json').read_bytes()) == review['callManifestSha256']
    assert sha((EVIDENCE/'target/debug/examples/n1_numerical').read_bytes()) == review['binarySha256']
    for relative, expected in plan['sourceHashesBefore'].items():
        assert sha((ROOT/relative).read_bytes()) == expected, f'Production source changed: {relative}'
    for relative, expected in plan['sourceHashesAfter'].items():
        assert sha((EVIDENCE/'generated'/relative).read_bytes()) == expected, f'Generated source changed: {relative}'
    for relative, expected in review['reviewedDiagnosticSourceSha256'].items():
        assert sha((ROOT/relative).read_bytes()) == expected, f'Diagnostic driver changed: {relative}'
    for name, expected in review['retainedEvidenceSha256'].items():
        assert sha((EVIDENCE/name).read_bytes()) == expected, f'Retained evidence changed: {name}'
    for case in plan['cases']:
        assert sha(Path(case['wirePath']).read_bytes()) == case['wireFileSha256']
        assert sha(Path(case['expectedPath']).read_bytes()) == case['expectedFileSha256']
    assert len(plan['calls']) == plan['maximumNativeFlightAttempts'] == 20
    assert [c['ordinal'] for c in plan['calls']] == list(range(1,21))
    assert [c['experiment'] for c in plan['calls'][:4]] == ['default-parity']*4
    validate_ledger(plan, sha((EVIDENCE/'review-manifest.json').read_bytes()))
    return plan, review


def validate_ledger(plan, approved_sha):
    """Validate all persisted state; a lost reservation is consumed, never retried."""
    ledger = load(EVIDENCE/'ledger.json')
    attempts = ledger['attempts']
    assert type(ledger['totalNativeFlightAttempts']) is int
    assert ledger['totalNativeFlightAttempts'] == len(attempts) <= 20
    assert [a['ordinal'] for a in attempts] == list(range(1,len(attempts)+1)), 'Noncontiguous/duplicate ledger ordinal'
    known = set()
    for attempt, call in zip(attempts,plan['calls']):
        for key,value in call.items():
            assert attempt[key] == value, f'Ledger differs from planned call: {key}'
        assert attempt['reviewManifestSha256'] == approved_sha
        ordinal = attempt['ordinal']
        case = next(c for c in plan['cases'] if c['caseId']==call['caseId'])
        request = EVIDENCE/f'{ordinal:02d}.request.json'
        assert sha(request.read_bytes()) == attempt['requestSha256']
        assert load(request) == {'controls':call['controls'],'wire':load(Path(case['wirePath']))}
        known.add(request.name)
        if attempt.get('status') in ['complete-parity-pass','complete']:
            assert (attempt['status']=='complete-parity-pass') == (call['experiment']=='default-parity')
            assert attempt['exitCode'] == 0
            required = [f'{ordinal:02d}.native.json',f'{ordinal:02d}.stderr']
            if call['experiment']=='default-parity':
                required.append(f'{ordinal:02d}.parity.json')
            assert set(attempt['evidenceSha256']) == set(required)
            for name in required:
                assert sha((EVIDENCE/name).read_bytes()) == attempt['evidenceSha256'][name]
            native = load(EVIDENCE/f'{ordinal:02d}.native.json')
            assert native['error'] is None and native['result'] is not None
            if call['experiment']=='default-parity':
                assert load(EVIDENCE/f'{ordinal:02d}.parity.json') == {'withinDeclaredBudgets':True,'differences':[]}
                assert not compare(load(Path(case['expectedPath'])),native['result'])
            known.update(required)
        else:
            # Files belonging to an interrupted/failed attempt are retained and
            # its reservation remains charged. run stops before launching more.
            known.update(p.name for p in EVIDENCE.glob(f'{ordinal:02d}.*'))
    numbered = {p.name for p in EVIDENCE.iterdir() if re.match(r'^\d{2}\.',p.name)}
    assert numbered <= known, f'Unledgered flight artifacts: {sorted(numbered-known)}'
    return ledger


def compare(expected, actual, path='', last_telemetry_index=None):
    differences = []
    if isinstance(expected,dict):
        if not isinstance(actual,dict) or expected.keys() != actual.keys():
            return [{'path':path,'reason':'object key/schema difference'}]
        for key,value in expected.items():
            differences.extend(compare(value,actual[key],f'{path}.{key}' if path else key,last_telemetry_index))
    elif isinstance(expected,list):
        if not isinstance(actual,list) or len(expected) != len(actual):
            return [{'path':path,'reason':'array length/type difference','expectedLength':len(expected),'actualLength':len(actual) if isinstance(actual,list) else None}]
        for index,value in enumerate(expected):
            differences.extend(compare(value,actual[index],f'{path}.{index}',len(expected)-1 if path=='telemetry' else last_telemetry_index))
    elif isinstance(expected,(int,float)) and not isinstance(expected,bool):
        if not isinstance(actual,(int,float)) or isinstance(actual,bool) or not math.isfinite(actual):
            return [{'path':path,'reason':'nonfinite/non-numeric value'}]
        absolute, relative = 1e-8, 1e-10
        if path.startswith('telemetry.'):
            parts = path.split('.')
            if parts[2] == 'time':
                absolute,relative = 1e-9,1e-12
            elif parts[2] == 'q':
                absolute,relative = 2e-12,0.
            elif int(parts[1]) != last_telemetry_index:
                absolute,relative = 0.,0.
        delta = actual-expected
        budget = absolute+relative*max(abs(actual),abs(expected))
        if abs(delta)>budget:
            differences.append({'path':path,'expected':expected,'actual':actual,'signedDelta':delta,'allowedAbsolutePlusRelative':budget})
    elif type(expected) is not type(actual) or expected != actual:
        differences.append({'path':path,'reason':'discrete/string difference','expected':expected,'actual':actual})
    return differences


def aggregate_rss(pid):
    processes = {}
    for status_path in Path('/proc').glob('[0-9]*/status'):
        try:
            fields = dict(line.split(':',1) for line in status_path.read_text().splitlines() if ':' in line)
            processes[int(fields['Pid'])] = (int(fields['PPid']),int(fields.get('VmRSS','0 kB').split()[0]))
        except (FileNotFoundError,ProcessLookupError):
            pass
    pending,rss = [pid],0
    while pending:
        parent = pending.pop()
        rss += processes.get(parent,(0,0))[1]
        pending.extend(child for child,(ppid,_) in processes.items() if ppid==parent)
    return rss


def stop_process(process):
    if process is not None and process.poll() is None:
        os.killpg(process.pid,signal.SIGTERM)
        try:
            process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid,signal.SIGKILL)
            process.wait(timeout=2)


def run(approved_sha, through):
    assert approved_sha == sha((EVIDENCE/'review-manifest.json').read_bytes()), 'Root approval must bind this exact review manifest'
    # Lock plus durable attempt reservation prevents concurrent drivers and
    # uncounted retries after crashes. Interrupted attempts stop for root review.
    with (EVIDENCE/'runner.lock').open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        plan,_ = verify()
        ledger_path = EVIDENCE/'ledger.json'
        ledger = validate_ledger(plan,approved_sha)
        if any(a.get('status') not in ['complete-parity-pass','complete'] for a in ledger['attempts']):
            raise RuntimeError('An earlier attempt failed/interrupted/parity-stopped; root must review, no automatic retry')
        for call in plan['calls']:
            ordinal = call['ordinal']
            if ordinal>through:
                break
            if any(a['ordinal']==ordinal for a in ledger['attempts']):
                continue
            if call['requiresAllDefaultsParity']:
                defaults = [a for a in ledger['attempts'] if a['experiment']=='default-parity']
                assert len(defaults)==4 and all(a['status']=='complete-parity-pass' for a in defaults)
            assert len(ledger['attempts'])<20
            case = next(c for c in plan['cases'] if c['caseId']==call['caseId'])
            request = {'controls':call['controls'],'wire':load(Path(case['wirePath']))}
            request_path = EVIDENCE/f'{ordinal:02d}.request.json'
            assert not list(EVIDENCE.glob(f'{ordinal:02d}.*')), 'Never overwrite flight evidence'
            atomic_json(request_path,request)
            attempt = {**call,'status':'attempted','requestSha256':sha(request_path.read_bytes()),'reviewManifestSha256':approved_sha,'startedUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
            ledger['attempts'].append(attempt)
            ledger['totalNativeFlightAttempts'] = len(ledger['attempts'])
            atomic_json(ledger_path,ledger)  # consumes budget before process creation
            stdout_path,stderr_path = EVIDENCE/f'{ordinal:02d}.native.json',EVIDENCE/f'{ordinal:02d}.stderr'
            started,peak_rss,process = time.monotonic(),0,None
            try:
                with request_path.open('r') as stdin, stdout_path.open('w') as stdout, stderr_path.open('w') as stderr:
                    process = subprocess.Popen(['taskset','-c','1',str(EVIDENCE/'target/debug/examples/n1_numerical'),'flight'],stdin=stdin,stdout=stdout,stderr=stderr,start_new_session=True)
                    while process.poll() is None:
                        peak_rss=max(peak_rss,aggregate_rss(process.pid))
                        if peak_rss>2*1024*1024 or time.monotonic()-started>120:
                            stop_process(process)
                            raise RuntimeError('2 GiB resident-memory or 120-second single-flight limit exceeded')
                        time.sleep(.02)
                attempt.update({'exitCode':process.returncode,'observedAggregatePeakRssKiB':peak_rss,'elapsedSeconds':time.monotonic()-started,'rawOutputSha256':sha(stdout_path.read_bytes())})
                assert process.returncode==0,'Native process failed'
                native = load(stdout_path)
                assert native['error'] is None,'Native engine error: '+str(native['error'])
                for phase in ['ordinary','event']:
                    counts=native['counts'][phase]
                    assert counts['attempted']==counts['accepted']+counts['rejected'],'Incomplete adaptive trial accounting'
                if call['experiment']=='default-parity':
                    differences=compare(load(Path(case['expectedPath'])),native['result'])
                    atomic_json(EVIDENCE/f'{ordinal:02d}.parity.json',{'withinDeclaredBudgets':not differences,'differences':differences})
                    attempt['status']='complete-parity-pass' if not differences else 'parity-stop'
                    if differences:
                        atomic_json(ledger_path,ledger)
                    assert not differences,'Native/WASM default parity difference; tight calls blocked pending root explanation'
                else:
                    attempt['status']='complete'
                evidence_names = [stdout_path.name,stderr_path.name]
                if call['experiment']=='default-parity':
                    evidence_names.append(f'{ordinal:02d}.parity.json')
                attempt['evidenceSha256'] = {name:sha((EVIDENCE/name).read_bytes()) for name in evidence_names}
                atomic_json(ledger_path,ledger)
                print(json.dumps({'ordinal':ordinal,'caseId':call['caseId'],'experiment':call['experiment'],'status':attempt['status']}),flush=True)
            except BaseException as error:
                stop_process(process)
                if attempt['status']=='attempted':
                    attempt['status']='failed'
                attempt['error']=str(error)
                attempt['elapsedSeconds']=time.monotonic()-started
                attempt['observedAggregatePeakRssKiB']=peak_rss
                atomic_json(ledger_path,ledger)
                raise


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode',choices=['verify','run'])
    parser.add_argument('--approved-manifest')
    parser.add_argument('--through',type=int,choices=range(1,21),default=20)
    args=parser.parse_args()
    if args.mode=='verify':
        plan,review=verify()
        print(json.dumps({'sourceAndFrozenArtifactsVerified':True,'plannedNativeCalls':len(plan['calls']),'actualNativeAttempts':load(EVIDENCE/'ledger.json')['totalNativeFlightAttempts'],'reviewManifestSha256':sha((EVIDENCE/'review-manifest.json').read_bytes())}))
    else:
        assert args.approved_manifest,'Explicit root review/approval of manifest required'
        run(args.approved_manifest,args.through)
