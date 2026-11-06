# Build the Windows desktop package on this disposable VM.
# Usage: powershell -ExecutionPolicy Bypass -File C:\astraea-build.ps1
# Requires: Node in Program Files, rustup in the user profile, VS Build Tools.
$ErrorActionPreference = 'Stop'
Start-Transcript -Path C:\astraea-build.log -Force | Out-Null
$env:Path = "C:\Program Files\nodejs;C:\toolchain\pnpm\node_modules\.bin;C:\Users\ak\.cargo\bin;$env:Path"
$env:CARGO_BUILD_JOBS = '1'

# 1. MSVC + Windows SDK environment so rustc can link.
$vswhere = "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw "VS Build Tools with VC tools not found" }
Write-Output "VS: $vs"
Import-Module (Join-Path $vs 'Common7\Tools\Microsoft.VisualStudio.DevShell.dll')
Enter-VsDevShell -VsInstallPath $vs -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64' | Out-Null
Write-Output ("link: " + (Get-Command link.exe -ErrorAction SilentlyContinue).Source)

Set-Location C:\astraea

# 2. Frontend + WASM engine (build script does tsc and vite too).
& node scripts/build-engine.mjs
if ($LASTEXITCODE -ne 0) { throw "engine build failed $LASTEXITCODE" }
& node node_modules\typescript\bin\tsc
if ($LASTEXITCODE -ne 0) { throw "tsc failed $LASTEXITCODE" }
& node node_modules\vite\bin\vite.js build
if ($LASTEXITCODE -ne 0) { throw "vite build failed $LASTEXITCODE" }

# 3. Ephemeral fixture signing key (never the production key).
$keyDir = 'C:\keys'
New-Item -ItemType Directory -Force $keyDir | Out-Null
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = '<ephemeral-fixture-password-redacted>'
if (-not (Test-Path "$keyDir\fixture.key")) {
  & node node_modules\@tauri-apps\cli\tauri.js signer generate -w "$keyDir\fixture.key" --password $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD --force
  if ($LASTEXITCODE -ne 0) { throw "signer generate failed $LASTEXITCODE" }
}
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$keyDir\fixture.key" -Raw
Write-Output ("fixture pubkey: " + (Get-Content "$keyDir\fixture.key.pub" -Raw))

# 4. Bundle the desktop app (NSIS + MSI, updater artifacts) with the fixture key.
& node node_modules\@tauri-apps\cli\tauri.js build --ci
if ($LASTEXITCODE -ne 0) { throw "tauri build failed $LASTEXITCODE" }

# 5. Record what was produced.
$artifacts = Get-ChildItem C:\astraea\src-tauri\target\release\bundle -Recurse -File |
  Where-Object { $_.Extension -in '.exe', '.msi', '.sig' }
$artifacts | ForEach-Object {
  "{0}`t{1}`t{2}" -f $_.FullName, $_.Length, (Get-FileHash $_.FullName -Algorithm SHA256).Hash
} | Set-Content C:\astraea\bundle-hashes.txt
Get-Content C:\astraea\bundle-hashes.txt
