# 0.9.0 beta Windows rebuild (2026-11-02)

Local rebuild of the unreleased 0.9.0 beta with the built-up aero panels, in the
Windows 11 acceptance VM (build 26100.1742). Not a release: unsigned
Authenticode, updater signatures made with an ephemeral fixture key (the build
warns that it does not match the configured public key, as expected).

- Source: `git archive` of `main` at `67ebb49`, extracted to `C:\astraea`.
  `67ebb49..bba8e78` changes `docs/` only, so the build matches `bba8e78` code.
- Command: `powershell -NoProfile -ExecutionPolicy Bypass -File C:\astraea-build.ps1`
  (same script as `../build-script.ps1`). Rust release build 5 m 45 s.

| Artifact | Bytes | SHA-256 |
|---|---:|---|
| `Astraea Workstation_0.9.0_x64_en-US.msi` | 6938624 | `DA9F5D606B5203859FE50B0D69A02C1F3E04EE99577483EF1A4D227F5A1669D4` |
| `Astraea Workstation_0.9.0_x64_en-US.msi.sig` | 452 | `5403DA8FFB1ADBBB0198CEE38603D0FCA1C860BCCC702AAD4F66D23EBEC88FAA` |
| `Astraea Workstation_0.9.0_x64-setup.exe` | 5478510 | `E0600E2DD7C2656CB1343532206629543A0B231C3878528CACD467688B72FD6A` |
| `Astraea Workstation_0.9.0_x64-setup.exe.sig` | 452 | `74FFCCC9415D2B30ED1A1FEBFAE5C8FD66F52D618ECA2AA4CBD99728CC3BA8F7` |
| installed `astraea-workstation.exe` (0.9.0) | | `5CFD7F12FD842C439F1DE1B65D500697C496BE7C0C59BDAF647375024C63090C` |

## Smoke

- NSIS `/S` install: exit 0, to `%LOCALAPPDATA%\Astraea Workstation`.
- Interactive launch through a `schtasks /it` task (last result 0): process
  responding, WebView2 browser and renderers attached. First paint took about a
  minute under the VM's software rendering.
- The sample project opens (margin 4.03 cal, apogee 533 m, valid run;
  `screen-aero.jpg`). Aero > Aerodynamic inputs shows the
  "Use built-up aero model (beta)" control, the Mach 0.80-1.20 hybrid
  disclosure and the airfoil refusal, which disables it for the default
  template's airfoil fins (`screen-aero-inputs.jpg`), as designed.

Not exercised here: enabling the beta model on a non-airfoil vehicle, the
provenance dialog, and the uninstall/offline cycles (covered for the earlier
build by RMP16 C01/C02/C05 and in the web beta journey).
