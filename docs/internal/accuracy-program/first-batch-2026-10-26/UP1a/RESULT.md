# UP1a RESULT: PASS — native check transport only

Source 00e768b2d2dcfc9913b2a9428040a67fd42d3d58; clean isolated worktree, no source changes. The reviewed debug-only compile-time overlay uses http://127.0.0.1:18749/bridge204 and a fixture identifier; updater artifacts disabled. Existing production public key retained; no new key.

Pinned offline image sha256:9c6c230e1d815013fa34fcb6b9174d9a6f9e2a9ec68920b93f345e547c723174, one CPU/4GiB, network=none. Cached config build compiled only astraea-workstation in 20.87 s; build exit 0. No frontend build/download. Every matching verified production dist asset hash unchanged.

Server and real native app ran together under dbus/Xvfb with software rendering. HOME untouched, task XDG paths, ASTRAEA_SMOKE_OUT absent. Launch 2026-10-26T04:20:08.042714Z; one GET /bridge204 at 04:20:09.382642Z received HTTP204. No other requests. Startup trace records root_present_5s at 5618 ms. This proves native updater initialization/global bridge/ACL/check transport for this fixture.

After both observations the harness sent SIGTERM to this fixture process group at 04:20:14.136741Z. Wrapper exit -15; runtime harness exit 0; no forced kill. This is a controlled stop, not successful app completion. No offer, artifact download, installation or relaunch exercised. Preserved original binary inode 548602 and SHA256 d5938bc6a5ee9201695cd67f5f3702b28eccf9641d6eef51d463b5f08873ccfd unchanged. No production config/feed/source changes, external contact, spend, push or packaging.

Files run-build.sh and run-runtime.sh contain complete Docker invocations; build.sh and updater-bridge204.py contain exact build/harness commands. manifest.json hashes commands, overlay, app and frontend manifests. HTTP development warning is expected; no dangerous transport flag enabled.
