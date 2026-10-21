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

3. Commit and push a tag:

   ```bash
   git tag v0.6.1
   git push origin v0.6.1
   ```

4. The workflow installs dependencies, typechecks, tests, runs
   `pnpm package:win`, writes `release/SHA256SUMS.txt`, and publishes a GitHub
   release with:

   - `Kryvex-Setup-<version>-x64.exe`
   - `Kryvex-Portable-<version>-x64.exe`
   - `SHA256SUMS.txt`

   It fails if the tag does not match `package.json` or an expected artifact is
   missing.

The GitHub release must remain **stable** (not a draft or prerelease) for the
updater to see it, and it must be the latest stable release.

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
