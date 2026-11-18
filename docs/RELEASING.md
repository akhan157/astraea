# Releasing Astraea

Work happens in the private `astraea-dev` repository. The public
`akhan157/astraea` repository receives one export commit per change and is
where tags, releases and the update feed live.

## 1. Prepare the version (in astraea-dev)

```sh
node scripts/bump-version.mjs 0.11.2            # package.json, Cargo.toml, Cargo.lock, README links, CHANGELOG heading
$EDITOR CHANGELOG.md                            # replace the placeholder with the user-facing changes
node scripts/release-preflight.mjs --tag v0.11.2
```

Open a PR, merge it, and wait for the **Website** run on `main` (build, browser
acceptance, deploy) to pass.

The CHANGELOG section becomes the GitHub release notes word for word. Put
anything users must do before updating at the top of it.

## 2. Export and tag (public repo)

```sh
scripts/export-public.sh "Astraea 0.11.2: <summary>"          # dry run: check the file list
scripts/export-public.sh "Astraea 0.11.2: <summary>" --push
```

Wait for public **CI** on that commit, then tag it:

```sh
git fetch https://github.com/akhan157/astraea.git main
# The tag object is public: tag with the no-reply identity, never a personal email.
GIT_COMMITTER_NAME='Adnan Khan' GIT_COMMITTER_EMAIL='72093369+akhan157@users.noreply.github.com' \
  git tag -a v0.11.2 -m "Astraea v0.11.2 beta" FETCH_HEAD
git push https://github.com/akhan157/astraea.git v0.11.2
```

The tag starts **Release**: `preflight` (versions agree, notes from the
CHANGELOG) → `ci` (the full suite at the tag) → bundles for Linux, Windows and
macOS (arm64 and x64) on a **draft** pre-release. Either check failing builds
nothing. The tag also runs the Windows and macOS packaged smoke tests.

## 3. Check the draft, then publish

- The release body: the CHANGELOG section, with anything users must do first at the top.
- 17 assets, the same set as the previous release.
- `latest.json`: `version` is the new version, every URL is under the new tag,
  every signature's key id is the app's updater key.

Publish the draft right after the export: README download links already point at the new tag and 404 until it is published (`gh release edit v0.11.2 -R akhan157/astraea --draft=false`).
**Update feed** then copies its `latest.json` to the `update-feed` release that
installed apps poll, and installed apps offer the update on their next launch. Check that
`https://github.com/akhan157/astraea/releases/download/update-feed/latest.json` now names the new version.

## 4. Prove the update path

```sh
gh workflow run updater-e2e.yml -R akhan157/astraea-dev -f from=0.11.1 -f to=0.11.2
```

On Linux, Windows and macOS this installs the previous published release,
takes the live offer, presses **Later**, then **Install and restart**, and
checks from outside the app that the new version is installed.

## Pulling a bad update

Point the feed back at the last good release. Nobody older is offered the bad
version any more; apps that already updated stay on it until a fixed release.

```sh
gh workflow run update-feed.yml -R akhan157/astraea -f tag=v0.11.1
```

Then ship the fix as a new patch version. The updater never offers a downgrade.
