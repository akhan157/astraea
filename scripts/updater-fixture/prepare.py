"""Prepare only ephemeral local fixture material; never read production keys."""
import json
import os
from pathlib import Path
import subprocess

root = Path('/workspace/astraea-plan/evidence/updater-verify-20261026')
private = root / 'private'
private.mkdir(parents=True, exist_ok=True, mode=0o700)
os.chmod(private, 0o700)
os.umask(0o077)
key = private / 'fixture.key'
if key.exists():
    raise SystemExit('refusing to replace existing fixture key')
cli = ['node', '/workspace/astraea/node_modules/@tauri-apps/cli/tauri.js']
with (private / 'generate.log').open('w') as log:
    subprocess.run(cli + ['signer', 'generate', '--ci', '--password', '', '--write-keys', str(key)],
                   stdout=log, stderr=subprocess.STDOUT, check=True)
payload = root / 'payload.bin'
payload.write_bytes(bytes((i * 17 + 23) % 251 for i in range(65536)))
os.chmod(payload, 0o600)
with (private / 'sign.log').open('w') as log:
    subprocess.run(cli + ['signer', 'sign', '--private-key-path', str(key), '--password', '',
                          '--app-version', '1.0.1', str(payload)],
                   stdout=log, stderr=subprocess.STDOUT, check=True)
public = key.with_suffix('.key.pub').read_text().strip()
(root / 'fixture-public-key.txt').write_text(public + '\n')
config = {'identifier': 'com.astraea.fixture.updater-verify', 'version': '1.0.0',
          'build': {'beforeBuildCommand': ''},
          'bundle': {'active': False, 'createUpdaterArtifacts': False},
          'plugins': {'updater': {'pubkey': public, 'endpoints': ['http://127.0.0.1:18750/feed'],
                                  'requireSignedVersion': True}}}
(root / 'fixture-config.json').write_text(json.dumps(config, indent=2) + '\n')
print('ephemeral fixture material prepared; private output retained outside Git')
