# Free website hosting and release setup

The site serves the product landing page at `/` and the web app at `/app/`
(the desktop shell opens `/app/` directly). Astraea's browser and desktop app use the same Rust engine, compiled to
WebAssembly and run in background workers. The website is static: no paid
server, database, account system or cloud-project service is needed for v1.
Browser projects stay on the device in IndexedDB; export `.astraea.json` files
for backups and transfers. Clearing site data removes local projects.

**Live (2026-11-08, owner-directed):** production is https://astraea-5e2.pages.dev/
(landing) and `/app/` (workstation), deployed from `astraea-dev` `main` by the
`Website` workflow on every push. The 0.10 beta is public as a pre-release.
**Release hold:** the draft v1.0.0 desktop release and a general v1 tag stay held
until independent flight validation and desktop acceptance. See
[preview readiness](preview-readiness.md) and
[the publish record](execution-runs/website-publish/RECORD.md).

## Cloudflare Pages (one-time setup)

1. Create a free Cloudflare account (GitHub sign-in works). The first
   deploy creates a Pages project named `astraea` (production branch `main`)
   if the account has none by that name; to use another name, change
   `--project-name` and the create step in `.github/workflows/website.yml`.
2. Create an API token scoped to that account with **Account → Cloudflare
   Pages → Edit**. No domain purchase or DNS permission is needed.
3. In GitHub repository Settings → Secrets and variables → Actions, add:

   | Repository secret | Value (left unset until supplied by owner) |
   | --- | --- |
   | `CLOUDFLARE_API_TOKEN` | Cloudflare Pages API token |
   | `CLOUDFLARE_ACCOUNT_ID` | Account ID from Cloudflare dashboard |

   Do not commit either value or paste the token into chat.
4. After owner approval to push, run **Website** from GitHub Actions and
   select `release/v1` for a preview deploy. Pushes to `main` deploy production;
   manual dispatch uses the selected branch, not a hard-coded production
   branch. Use the URL returned by Cloudflare (normally `<project>.pages.dev`).

The workflow builds the engine and site, then runs a real Chromium flight
under the production content security policy before deploying. `public/_headers`
sets that policy, disables framing and unnecessary browser permissions, and
caches only hashed assets immutably. No service worker/offline cache is shipped;
installed desktop builds are the offline option.

Cloudflare setup guide:
https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/

## Local website check

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec playwright install chromium
pnpm test:browser
# Or use an existing Chromium:
CHROMIUM_PATH=/usr/bin/chromium pnpm test:browser
```

The check serves `dist/`, applies the built Pages CSP to browser responses,
runs the default NASA Student Launch case through the real UI and WebAssembly
workers, and checks its rounded apogee against the packaged desktop baseline
(~534 m). This is a regression check, not independent flight validation or a
live Cloudflare deployment test. The same command additionally exercises
editing, stale-result refusal, IndexedDB persistence, imports, all ten export
downloads, Monte Carlo completion/cancellation, telemetry units and motor tools.
It also runs all presets, a full 1,000-flight ensemble, seed reproducibility,
WebGL loss/recovery and two-tab stale-write protection. CI reuses the built site
on one runner for Chromium, Firefox and WebKit acceptance, without artifact uploads.
Browser save dialogs are disabled only in that isolated test profile to exercise
the download fallback without OS interaction.

To test the deployed preview with its actual response security policy:

```sh
ASTRAEA_PREVIEW_URL=https://release-v1.astraea-5e2.pages.dev/ \
  CHROMIUM_PATH=/usr/bin/chromium pnpm test:browser
```

Select another installed browser engine with `ASTRAEA_BROWSER=firefox` or
`ASTRAEA_BROWSER=webkit`; default is Chromium. Install matching Playwright browser
binaries/dependencies first. These are engine tests, not native Safari/macOS or
Windows Edge acceptance.

## Desktop releases and remaining gates

`.github/workflows/release.yml` builds platform installers into a **draft**
GitHub Release after an approved `v*` tag push, or manual dispatch against a
selected branch. The first manual `release/v1` build passed on Windows, Linux,
and both macOS architectures; installers remain draft, not accepted for launch.
Public downloads require a
public repository/release; while private, links require repository access.
Do not make the repo public, push or tag without owner approval.

Installers are not code-signed for v1 (free-only decision), so Windows and
macOS may display security warnings on first install.

**Auto-updates are configured and signed.** The desktop app checks
`https://github.com/akhan157/astraea/releases/download/update-feed/latest.json`
(then `releases/latest/...` as a fallback) once per launch and offers a newer version; it installs only when the user clicks.
Updates are verified against the public key in `src-tauri/tauri.conf.json`.
One-time setup — add two more repository secrets:

| Repository secret | Value |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of `~/.tauri/astraea-updater.key` on the machine that generated it |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Empty (the key was generated without a password) |

Back up `~/.tauri/astraea-updater.key` somewhere safe and private. If it is
lost, already-installed apps can never accept another update; if it leaks,
anyone can sign updates they will accept. Never commit it.

Beta releases are GitHub prereleases, which `releases/latest` ignores. So
publishing any release (prerelease or stable) runs `update-feed.yml`, which
copies that release's `latest.json` onto a fixed `update-feed` release. The
feed only resolves once the repository is public and a release is
**published** by hand (drafts never feed). Installs built before this change
only poll `releases/latest` and need one manual reinstall. Linux updates apply
to the AppImage install only; `.deb`/`.rpm` installs update through
reinstalling. No paid signing, R2 bucket, custom domain or cloud accounts are
configured.

Before release: owner Windows/macOS desktop acceptance, CI platform builds,
review of repository contents before making public, and final push/tag approval.
Deferred product work: accounts/cloud projects/team sharing, launch-lug and
rail-button drag with validation, design-direction review, optional offline
website support, and double-click file association (needs a dedicated project
extension such as `.astraea`; `.astraea.json` would claim every `.json`).
Track these beyond v1, not as shipped.
