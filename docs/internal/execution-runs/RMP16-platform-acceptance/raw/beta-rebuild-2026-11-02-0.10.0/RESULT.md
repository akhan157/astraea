# 0.10.0 Windows rebuild (2026-11-02)

Built from branch `frontend/design` at `5d8ba53` in the Windows 11 acceptance VM
(build 26100.1742). Unsigned; updater signatures use the ephemeral fixture key
and do not match a release public key.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `Astraea Workstation_0.10.0_x64_en-US.msi` | 6991872 | `192ED1E7F0CEFCEF8958199D2C1082FF14CCAF4A0FA832355404D32CE31293C9` |
| `Astraea Workstation_0.10.0_x64_en-US.msi.sig` | 456 | `97DB555677F5E456B81057514552FD2A954069E5745433B56FDF15D544F46570` |
| `Astraea Workstation_0.10.0_x64-setup.exe` | 5534049 | `CBDE0735F13560E2FA36FE191CB4AC7005C10E9BC86F6E9274922512926A47FE` |
| `Astraea Workstation_0.10.0_x64-setup.exe.sig` | 456 | `B8BFDD748A4F292622B7E8FEB525DC951FAB63AB62FD95AA14E87FA3B1A81D8D` |
| installed `astraea-workstation.exe` (0.10.0) | | `045ED670B797CB5A5802FBE5FD0A0B7B2525721C09B467DD370B90B0B1B9D457` |

Smoke: NSIS `/S` install exit 0; interactive launch via `schtasks /it`; the
sample opens with the Airframe Coupler (the recoded constant-diameter tube) and
a valid run; status bar shows gates 5/0 (the landing-energy gate is gone and
landing speed passes against the Tripoli Level 1 limit). Browser verification of
the new input editors, save/open round-trip and drag change is recorded on the
branch and in the browser smoke.

Not exercised in the VM: enabling the built-up beta on the sample, the
provenance dialog, and uninstall/offline cycles.

## Rebuild with live sliders (2026-11-02, later)

Rebuilt from `main` at `4a914ea` after the live size sliders merged. Same
unsigned/fixture-key caveats. Installer version stays 0.10.0; the previous
hashes above are the pre-slider build and remain historical.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `Astraea Workstation_0.10.0_x64_en-US.msi` | 6991872 | `F1E1CA1A37DF20DF192E8E82F19367916E4CCBA3E1029E9BA2C69278628A367F` |
| `Astraea Workstation_0.10.0_x64_en-US.msi.sig` | 456 | `25254C533F00BF19286030EB09DA7160F96F5D8BDC8F79AAC7CB22E4C8747CA9` |
| `Astraea Workstation_0.10.0_x64-setup.exe` | 5533446 | `90879BD3422EDEDE5F2BC76CA08C7C779837916745EF0869D6B44243408A3C1E` |
| `Astraea Workstation_0.10.0_x64-setup.exe.sig` | 456 | `D035EFE743A4D044CC8FEAD1DD29DF462682E265AEECC5A57DE8F652F8475CF6` |
| installed `astraea-workstation.exe` (0.10.0) | | `59E298D187F63FFC75FA08B83E3C5F7F729260C8BB3EF9AB62F6B87F0C662086` |

Smoke: NSIS `/S` install exit 0; interactive launch via `schtasks /it`; process
responding; the sample opens with the Airframe Coupler and gates 5/0. The slider
UI itself was verified in the browser build (see the branch run): dragging a
body-tube length slider changes the live preview and M2.00 CD.
