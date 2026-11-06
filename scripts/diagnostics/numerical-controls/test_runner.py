"""Flight-free checks for semantic DTO comparison and charged-attempt resume."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('n1_runner',Path(__file__).with_name('run.py'))
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


class ComparatorTests(unittest.TestCase):
    def test_entire_frozen_dtos_and_nested_changes(self):
        # Uses only the four already frozen production DTOs, with no simulation.
        for path in (runner.EVIDENCE/'frozen').glob('*.expected.json'):
            expected = runner.load(path)
            self.assertEqual(runner.compare(expected,copy.deepcopy(expected)),[])
            changed = copy.deepcopy(expected)
            changed['events'][0]['name'] += '-changed'
            self.assertTrue(runner.compare(expected,changed))
            changed = copy.deepcopy(expected)
            changed['telemetry'][0]['q']['w'] += 1e-10
            self.assertTrue(runner.compare(expected,changed))
            changed = copy.deepcopy(expected)
            changed['telemetry'][0]['altitude'] += 1e-10
            self.assertTrue(runner.compare(expected,changed))
            changed = copy.deepcopy(expected)
            changed['telemetry'][-1]['time'] += 1e-6
            self.assertTrue(runner.compare(expected,changed))

    def test_types_schema_and_declared_budgets(self):
        for a,b in [(True,1),(False,0),(None,False),('1',1),([],{}),({'x':1},{'x':1,'extra':2})]:
            self.assertTrue(runner.compare(a,b))
        self.assertTrue(runner.compare(1.,float('nan')))
        self.assertTrue(runner.compare(1.,float('inf')))
        self.assertEqual(runner.compare(1.,1.+1e-9),[])
        self.assertTrue(runner.compare(1.,1.+1e-6))


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.original = runner.EVIDENCE
        runner.EVIDENCE = Path(self.temporary.name)
        self.sha = 'test-review-digest'
        self.call = {'ordinal':1,'caseId':'fixture','experiment':'default-parity','controls':{'ordinaryScale':1.,'eventScale':1.,'eventTimeToleranceS':1e-5}}
        self.wire = runner.EVIDENCE/'wire.json'
        self.expected = runner.EVIDENCE/'expected.json'
        runner.atomic_json(self.wire,{'frozen':True})
        runner.atomic_json(self.expected,{'result':1.})
        self.plan = {'calls':[self.call],'cases':[{'caseId':'fixture','wirePath':str(self.wire),'expectedPath':str(self.expected)}]}
        self.request = runner.EVIDENCE/'01.request.json'
        runner.atomic_json(self.request,{'controls':self.call['controls'],'wire':{'frozen':True}})
        self.attempt = {**self.call,'status':'attempted','requestSha256':runner.sha(self.request.read_bytes()),'reviewManifestSha256':self.sha}

    def tearDown(self):
        runner.EVIDENCE = self.original
        self.temporary.cleanup()

    def persist(self,attempts,total=None):
        runner.atomic_json(runner.EVIDENCE/'ledger.json',{'attempts':attempts,'totalNativeFlightAttempts':len(attempts) if total is None else total})

    def test_interruption_keeps_charged_reservation(self):
        self.persist([self.attempt])
        result = runner.validate_ledger(self.plan,self.sha)
        self.assertEqual(result['totalNativeFlightAttempts'],1)
        self.assertEqual(result['attempts'][0]['status'],'attempted')
        # run's gate must stop this state before any launch or retry.
        self.assertTrue(any(a.get('status') not in ['complete-parity-pass','complete'] for a in result['attempts']))

    def test_duplicate_and_orphan_evidence_stop(self):
        self.persist([self.attempt,self.attempt])
        with self.assertRaises(AssertionError):
            runner.validate_ledger(self.plan,self.sha)
        self.persist([])
        with self.assertRaises(AssertionError):
            runner.validate_ledger(self.plan,self.sha)

    def test_completed_resume_requires_all_artifact_hashes(self):
        runner.atomic_json(runner.EVIDENCE/'01.native.json',{'error':None,'result':{'result':1.}})
        (runner.EVIDENCE/'01.stderr').write_text('')
        runner.atomic_json(runner.EVIDENCE/'01.parity.json',{'withinDeclaredBudgets':True,'differences':[]})
        self.attempt.update(status='complete-parity-pass',exitCode=0,evidenceSha256={name:runner.sha((runner.EVIDENCE/name).read_bytes()) for name in ['01.native.json','01.stderr','01.parity.json']})
        self.persist([self.attempt])
        self.assertEqual(runner.validate_ledger(self.plan,self.sha)['totalNativeFlightAttempts'],1)
        (runner.EVIDENCE/'01.native.json').write_text('{}')
        with self.assertRaises(AssertionError):
            runner.validate_ledger(self.plan,self.sha)


if __name__ == '__main__':
    unittest.main()
