# Updates

Kryvex checks the public GitHub releases in
`XiONDiGiTaL/Kryvex` and, when an installed build is newer, can download and
run the verified installer itself. Portable builds and git checkouts update
differently on purpose.

The feature has no third-party update service, no telemetry and no background
downloader. The renderer asks the main process to check; the main process owns
every URL, file and launch decision.

## What each build does

| Build | Detection | Download | Install |
| --- | --- | --- | --- |
| Installed (NSIS, `Kryvex-Setup-*.exe`) | `app.isPackaged` and no `PORTABLE_EXECUTABLE_FILE` | Setup EXE | **Install and restart** quits Kryvex, then launches the verified Setup EXE interactively |
| Portable (`Kryvex-Portable-*.exe`) | `PORTABLE_EXECUTABLE_FILE` is set by electron-builder | Portable EXE | Never self-replaces; **Show downloaded file** opens Explorer so the user can close Kryvex and run it |
| Git checkout (`pnpm dev:electron`) | `!app.isPackaged` | Never | Reports the release and opens its page; update with `git pull` |

An installed build never runs an installer silently. The setup keeps its normal
wizard, including the install folder and shortcut choices. The app quits first
so Windows can replace locked files.

## Automatic checks

**Settings → Updates** has the switch, default on. When enabled, one check runs
about three seconds after the first window is ready, then every six hours while
the app stays open. A check only reads the latest release metadata; downloads
always require a click.

A newer version also adds an **Update** button to the header and a one-time
toast for that version in the current session. Opening it jumps to the Updates
panel. The preference is stored in the normal state file as
`settings.autoCheckUpdates` and defaults to `true` for existing profiles.

## When there is no update

A check that finds nothing newer is still an answer, so the panel shows one: a
green **UP TO DATE** verdict with a check mark sits beside `Kryvex <version> is
the latest release.`, and the status card picks up the theme's success colour.
Clicking **Check for updates** by hand also raises a success toast naming the
running version, so a click never looks like it did nothing. The same verdict
appears when the running build is ahead of the newest published release (for
example a local build), because no update is available in either case.

## Trust chain

1. The feed URL is fixed to
   `https://api.github.com/repos/XiONDiGiTaL/Kryvex/releases/latest`. The
   renderer cannot supply a URL, owner, repository or asset name.
2. Only a stable release is accepted. Drafts, prereleases, unversioned tags and
   malformed payloads are rejected.
3. Asset URLs must be HTTPS on `github.com`, `*.githubusercontent.com`,
   `objects.githubusercontent.com` or `release-assets.githubusercontent.com`.
   A loopback HTTP origin is allowed only in an unpackaged test build when
   `KRYVEX_UPDATE_FEED` is set explicitly.
4. The installer name must match
   `Kryvex-Setup-<tag version>-x64.exe` (or `Kryvex-Portable-…` in a portable
   build). An asset for another version is ignored.
5. The download is capped at 400 MiB and written to a `.part` file in
   `userData/updates`. Partial files are removed on the next launch.
6. `SHA256SUMS.txt` from the same release is mandatory. The finished file is
   hashed while it streams; a missing entry, mismatch or failed download deletes
   the partial file and leaves nothing installable. A successful download also
   removes installers left by earlier versions, so `userData/updates` keeps only
   the current verified file.
7. `Install and restart` is available only after a successful hash and only in
   a packaged installed build. The path is remembered by the main process, not
   supplied by the renderer.

### What this does not prove

The checksum protects against a corrupted or tampered transport, not against a
compromised GitHub repository or release. Both the installer and its checksum
come from the same release. Builds are currently **unsigned**, so Windows may
show SmartScreen or an unknown-publisher prompt. Verify the hash yourself
against a release you trust, or build from source.

There is no delta update, beta channel, rollback, staged rollout or mandatory
update. A failed check is non-fatal and can be retried from Settings.

## Release procedure

The release workflow is [`.github/workflows/release.yml`](../.github/workflows/release.yml).

1. Update `version` in `package.json`. The app reports this version and compares
   it numerically with the release tag, so the tag and package must match.
2. Run the local checks:

   ```bash
   pnpm typecheck
   pnpm test
   pnpm verify:updater
   ```

3. Capture the installer wizard and archive it beside the release record. The
   wizard is the installer's own native dialog, so this has to run on Windows,
   and it must be pointed at the EXE you just built:

   ```powershell
   node scripts/verify-self-update.cjs --no-app --installer "release\Kryvex-Setup-<version>-x64.exe" --version <version> --archive
   ```

   The pages, their text and the installer's exit code land in
   `docs/media/releases/<version>-wizard/`. Reference that directory from a
   `## Wizard capture` section in `docs/RELEASE_<version>.md` before committing.

   Don't reach for bare `pnpm release:wizard` here: without `--installer` it
   captures whatever `releases/latest` serves, which is the previous release,
   and a hotfix keeps the numeric version of the release it patches — so its
   capture would be archived over that release's directory and this one would
   still be missing. `scripts/cut-release.ps1` (`pnpm release:cut`) runs
   `pnpm typecheck` and `pnpm test`, then steps 1–4, in order, and stops at the
   first failure. `-DryRun` prints every preflight guard's verdict and the
   ordered plan without building, capturing or tagging.

   No Windows machine at hand is no longer a dead end: run the **Wizard
   capture** workflow (`.github/workflows/capture.yml`, from the Actions tab).
   It builds the installers on a `windows-latest` runner, runs the same command
   above against the Setup EXE it just built, refuses the result unless
   `pnpm release:check` accepts it, and commits
   `docs/media/releases/<version>-wizard/` to `main`. It does not tag or publish
   — the tag stays a push you make on purpose — so the capture can come from a
   runner while the decision to release stays yours.

4. Commit and push a tag:

   ```bash
   git tag v0.6.1
   git push origin v0.6.1
   ```

5. The workflow installs dependencies, typechecks, tests, runs
   `pnpm package:win`, writes `release/SHA256SUMS.txt`, and publishes a GitHub
   release with:

   - `Kryvex-Setup-<version>-x64.exe`
   - `Kryvex-Portable-<version>-x64.exe`
   - `SHA256SUMS.txt`

   It fails if the tag does not match `package.json`, if the record has no
   wizard capture (`pnpm release:check`), or if an expected artifact is missing.
   Before it builds anything it also re-runs `pnpm audit:deps` and sweeps every
   older record with `node scripts/check-release-record.cjs --all`, so a
   historical capture that lost a page or a screenshot fails this cut instead of
   sitting broken — the single-version check only ever reads the tag being cut.

   The same gate refuses a cut whose previous release was never closed: that
   record must have no `recorded after the cut` row, both of its Artifacts
   digests, a `## Released` section in `PROJECT_STATUS.md`, and its installers
   named on the README's front page. `pnpm release:sync` is what fills those
   four, so the next cut cannot ship on top of last release's stale docs.
6. Two jobs follow the Windows one. `docs` closes the record (step 7) from the
   release it just published, and `web` builds `dist-web/` and force-pushes it
   to `gh-pages`, so the site at
   `https://xiondigital.net/Kryvex/` and the phone's installable client carry the
   same release. Both run after the Windows job, so a tag that fails its checks
   neither closes an unpublished release nor replaces the live site, and
   nothing needs doing by hand.
7. **Closing the record is a job, not a memory.** A release is not finished when
   the workflow goes green: the docs still have to name the files people can
   download. Doing this before the tag would advertise artifacts that do not
   exist yet. The `docs` job waits for `releases/latest` to answer with the new
   tag, runs `pnpm release:sync` against the release that job just uploaded, and
   commits the result to `main`. Four places move together:

   | File | What changes |
   | --- | --- |
   | `README.md`, **Install on Windows** | Both artifact names take the new version: `Kryvex-Setup-<version>-x64.exe` and `Kryvex-Portable-<version>-x64.exe`, with the published size |
   | `README.md`, **Release history** | A new first row for `<version>` linking `docs/RELEASE_<version>.md`, above the previous release |
   | `docs/RELEASE_<version>.md`, **Artifacts** | Replace the `recorded after the cut` placeholder with the published size in bytes and SHA-256 of each EXE |
   | `PROJECT_STATUS.md` | The version's `## Prepared (<date>, <version>)` section becomes `## Released (<date>, <version>)`, above the previous release's section, naming the publish time, the tag `releases/latest` now answers, and the same artifact table |

   Read the digests from the release's own asset metadata or the published
   `SHA256SUMS.txt`, and the sizes from the uploaded assets. A local build hashes
   differently from the CI build, so it is never a substitute for either.

   `node scripts/sync-published-release.cjs` (`pnpm release:sync`) makes all
   four edits from the tag's own release payload: it reads the sizes and
   digests off the assets, takes the date from `published_at`, and flips the
   `## Prepared` section itself. It refuses to write a digest the API did not
   report, and it prints whatever it cannot settle — a sentence further down a
   `## Released` section that still says nothing is published needs a person.

   Those notes do not stay in the run log. The `docs` job hands them to
   `gh issue create`, so prose that still says nothing is published becomes an
   open issue titled *Release paperwork that still needs a human* — a later
   release comments on that issue instead of filing a second — and the run's own
   summary carries the same list. Working the issue down is part of closing the
   release; it is the one part no script can defer for you.

   Run this by hand when the job could not: a release published before the job
   existed, a `main` that refuses the bot's push, or a re-sync after an asset
   was corrected (`pnpm release:sync 0.9.5-hotfix.9`). `pnpm release:check` is
   the other half of the rule: it runs before the next tag, and in the workflow,
   and fails when the previous release's four facts are still unwritten, so a
   close that never happened stops the next cut instead of looking fine.

The GitHub release must remain **stable** (not a draft or prerelease) for the
updater to see it, and it must be the latest stable release.

### Versioning below 1.0

1.0 is reserved for the first release whose features all work out of the box, so
the version line is held still and a small fix does not move it. A fix ships as
a **hotfix of the release it patches**, with a `-hotfix.N` suffix:

| Part | Example |
| --- | --- |
| `package.json` | `"version": "0.9.3-hotfix.1"` |
| Tag | `v0.9.3-hotfix.1` |
| Record | `docs/RELEASE_0.9.3-hotfix.1.md` |
| Capture | `docs/media/releases/0.9.3-hotfix.1-wizard/` |
| Assets | `Kryvex-Setup-0.9.3-hotfix.1-x64.exe` and its Portable twin |

The workflow already checks the tag against `package.json`, and
`scripts/check-release-record.cjs` accepts a hotfix record both for the current
version and when it scans every record with `--all`. Three rules make it reach
users:

- **Publish it as a stable release, not a prerelease.** The updater reads
  `releases/latest`, which skips drafts and prereleases, and rejects any payload
  marked `prerelease: true` regardless of its tag.
- **The updater ranks the hotfix above its base.** `compareVersions()` treats
  `0.9.3-hotfix.1` as newer than `0.9.3`, so an installed 0.9.3 is offered it,
  while ordering it below the next version line (`0.9.4`) and above the previous
  one (`0.9.2`). Hotfixes of the same release order by number.
- **Expect the Windows version resource to read the version line.** A
  `0.9.3-hotfix.1` payload packages as `ProductVersion 0.9.3.0` with the suffix
  in `FileVersion`, so `scripts/verify-self-update.cjs` compares a hotfix build
  on its version line. The app itself reports the full
  `0.9.3-hotfix.1` from `package.json` in its header and Updates panel.

**A fourth number is not an option.** `0.9.5.1` was asked for and cannot be
built: `electron-builder` validates `package.json`'s `version` as strict semver
and stops with `Invalid version: "0.9.5.1"` before it packages anything, and npm
rejects the same string. The `-hotfix.N` suffix exists for that case and the
updater already ranks the result above its base, so a patch of a line ships as
`0.9.5-hotfix.4` rather than `0.9.5.1`.

Only a release that adds features moves `0.9.3` to `0.9.4`; 1.0 is the last
step and is not reached by accumulation.

To build locally:

```bash
pnpm package:win
pnpm release:checksums
```

`release:checksums` refuses to write a list when neither installer exists.

## Testing without a release

`scripts/verify-updater.cjs` runs the real app against a loopback feed and
proves four things:

- an installed-mode build finds the release and selects the Setup asset;
- a wrong SHA-256 rejects the download and leaves no ready file;
- a correct SHA-256 yields `ready`, the bytes on disk hash correctly, and the
  unpackaged harness refuses to launch an installer;
- a git checkout reports the release but selects no binary and refuses to
  download; a missing release is reported as `no-release`.

```bash
pnpm verify:updater
```

To check the whole chain against an installation, `pnpm verify:self-update`
drives the installed build through the live feed and captures the NSIS wizard
page by page, including the installer's exit code:

```bash
pnpm verify:self-update
pnpm verify:self-update --wizard   # capture the wizard even when up to date
```

The wizard pages are read from the dialog's native controls and saved as text and
PNGs under `.tmp-self-update/wizard/`; the run reports every check in
`.tmp-self-update/report.json`. [TESTING.md](TESTING.md) records the results.

Test-only environment variables, both ignored in a packaged build:

| Variable | Effect |
| --- | --- |
| `KRYVEX_UPDATE_FEED` | Loopback or HTTPS base URL; the harness appends `/latest` |
| `KRYVEX_UPDATE_MODE=installed` | Simulates installed mode so the download path can run without packaging |

## Manual checks in a packaged build

1. Install the previous release, publish a newer tag, launch the installed app.
2. Confirm the header shows **Update** and Settings reports the new version.
3. Download and confirm the size, then confirm `userData/updates` holds the
   EXE and `SHA256SUMS.txt` matches `certutil -hashfile <file> SHA256`.
4. Choose **Install and restart**. The app quits, the setup wizard appears, and
   the updated version is reported after relaunch. Settings, services, tabs and
   the state file survive. `pnpm verify:self-update` performs this step and
   records what the wizard showed.
5. Repeat with the portable build: it must offer the EXE in Explorer, not run
   it, and the old EXE must keep working until the user replaces it.
