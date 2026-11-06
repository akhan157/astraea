"""Offline loopback transport and controlled lifetime for the native fixture."""
import base64
import datetime
import hashlib
import http.server
import json
import os
from pathlib import Path
import signal
import subprocess
import threading
import time

ROOT = Path('/evidence')
requests = []
signature = (ROOT / 'payload.bin.sig').read_text().strip()
bad = base64.b64decode(signature).decode().splitlines()
line = bytearray(base64.b64decode(bad[1]))
line[-1] ^= 1
bad[1] = base64.b64encode(line).decode()
bad_signature = base64.b64encode(('\n'.join(bad) + '\n').encode()).decode()
payload = (ROOT / 'payload.bin').read_bytes()
tampered = bytearray(payload)
tampered[-1] ^= 1
(ROOT / 'payload-tampered.bin').write_bytes(tampered)
os.chmod(ROOT / 'payload-tampered.bin', 0o600)
(ROOT / 'bad-signature.sig').write_text(bad_signature + '\n')
feeds = {}
for case in ['defer', 'valid', 'bad-signature', 'tampered', 'version-mismatch']:
    feeds[case] = json.dumps({
        'version': '1.0.2' if case == 'version-mismatch' else '1.0.1',
        'notes': 'Isolated non-executable updater verification fixture',
        'platforms': {'linux-x86_64': {
            'url': 'http://127.0.0.1:18750/artifact/' + case,
            'signature': bad_signature if case == 'bad-signature' else signature,
        }},
    }, sort_keys=True).encode()
    (ROOT / ('feed-' + case + '.json')).write_bytes(feeds[case])


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        case = self.headers.get('X-Astraea-Fixture-Case')
        data = b''
        code = 404
        if self.path == '/feed':
            code = 200 if case in feeds else 204
            data = feeds.get(case, b'')
        elif self.path.startswith('/artifact/'):
            code = 200
            data = bytes(tampered) if self.path == '/artifact/tampered' else payload
        record = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  'method': 'GET', 'path': self.path, 'caseHeader': case,
                  'status': code, 'bytes': len(data), 'client': self.client_address[0]}
        requests.append(record)
        with (ROOT / 'requests.jsonl').open('a') as out:
            out.write(json.dumps(record) + '\n')
        self.send_response(code)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Content-Type', 'application/json' if self.path == '/feed' else 'application/octet-stream')
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *_args):
        pass


server = http.server.HTTPServer(('127.0.0.1', 18750), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
env = os.environ.copy()
assert 'ASTRAEA_SMOKE_OUT' not in env
env.update({'LIBGL_ALWAYS_SOFTWARE': '1', 'WEBKIT_DISABLE_COMPOSITING_MODE': '1',
            'XDG_CACHE_HOME': '/evidence/xdg/cache', 'XDG_CONFIG_HOME': '/evidence/xdg/config',
            'XDG_DATA_HOME': '/evidence/xdg/data', 'XDG_RUNTIME_DIR': '/evidence/xdg/runtime'})
Path(env['XDG_RUNTIME_DIR']).mkdir(parents=True, exist_ok=True)
os.chmod(env['XDG_RUNTIME_DIR'], 0o700)
start = time.monotonic()
with (ROOT / 'app.log').open('w') as log:
    process = subprocess.Popen(['dbus-run-session', '--', 'xvfb-run', '-a', '/evidence/fixture-debug'],
                               env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    while time.monotonic() - start < 45 and process.poll() is None:
        if (ROOT / 'native-report.json').exists():
            break
        time.sleep(.2)
    before = process.poll()
    forced = False
    if before is None:
        os.killpg(process.pid, signal.SIGTERM)
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            forced = True
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
server.shutdown()
server.server_close()
native = json.loads((ROOT / 'native-report.json').read_text()) if (ROOT / 'native-report.json').exists() else {}
artifacts = [r['path'] for r in requests if r['path'].startswith('/artifact/')]
result = {'nativeReportOk': native.get('ok', False), 'artifactGets': artifacts,
          'deferArtifactGets': artifacts.count('/artifact/defer'), 'exitBeforeStop': before,
          'controlledStop': 'SIGTERM process group' if before is None else 'early exit',
          'wrapperExitCode': process.returncode, 'forcedKill': forced,
          'elapsedSeconds': time.monotonic() - start,
          'scope': 'offer/defer and signature-verified download only; no apply or relaunch'}
cases = {case['name']: case for case in native.get('cases', [])}
expected_paths = ['/artifact/' + case for case in ['valid', 'bad-signature', 'tampered', 'version-mismatch']]
crypto_errors = all(cases.get(case, {}).get('error') == 'The signature verification failed'
                    for case in ['bad-signature', 'tampered'])
version_error = cases.get('version-mismatch', {}).get('error', '')
result['specificErrorsMatch'] = crypto_errors and version_error.startswith(
    'The update was signed for version 1.0.1 but the update endpoint announced version 1.0.2.')
result['fullArtifactBytes'] = all(r['status'] == 200 and r['bytes'] == 65536
                                  for r in requests if r['path'].startswith('/artifact/'))
result['nativeReceivedBytes'] = {
    case['name']: sum(event.get('data', {}).get('chunkLength', 0)
                      for event in case['events'] if event['event'] == 'Progress')
    for case in native.get('cases', [])}
result['nativeByteCountsMatch'] = result['nativeReceivedBytes'] == {
    'defer': 0, 'valid': 65536, 'bad-signature': 65536, 'tampered': 65536, 'version-mismatch': 65536}
result['ok'] = (result['nativeReportOk'] and not result['deferArtifactGets'] and
                artifacts == expected_paths and result['specificErrorsMatch'] and
                result['fullArtifactBytes'] and result['nativeByteCountsMatch'] and not forced and before is None)
(ROOT / 'runtime-result.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
raise SystemExit(0 if result['ok'] else 1)
