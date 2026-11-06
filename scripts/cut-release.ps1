<#
.SYNOPSIS
Cuts a Kryvex release on Windows: build, capture the wizard, gate, tag.

.DESCRIPTION
Runs the cut from docs/UPDATES.md in order and stops at the first failure, so a
release cannot be tagged without the installer capture its tag gates on, and
cannot be tagged from a tree that is behind origin/main.

  1. package:win        builds release/Kryvex-Setup-<version>-x64.exe and
                        release/Kryvex-Portable-<version>-x64.exe
  2. wizard capture     runs the installer just built through its own wizard and
                        archives docs/media/releases/<version>-wizard/
  3. record gate        check-release-record.cjs for this version, then --all
  4. commit, push, tag  capture committed and pushed to main first, because the
                        Release workflow checks out the tag, not the branch

The wizard step names the installer explicitly. `pnpm release:wizard` on its own
captures whatever releases/latest serves, which is the previous release, and a
hotfix shares its numeric version with the release it patches; an implicit run
therefore archives over that release's capture and still leaves this one
missing.

Nothing here publishes anything. Pushing the tag starts the Release workflow,
which builds on windows-latest and publishes; the doc pass that follows a
publish is step 7 of the release procedure and is not automated.

Typecheck and the unit suite are not run here: the tag's workflow runs them
before it packages, and a failure there publishes nothing.

.PARAMETER SkipBuild
Use the EXEs already in release/ instead of running package:win.

.PARAMETER ReuseCapture
Keep an existing docs/media/releases/<version>-wizard/ capture instead of
recapturing.

.PARAMETER SkipPush
Do everything up to and including the gate, then stop and print the exact
commands to push. The tag is not created.

.EXAMPLE
pnpm release:cut

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cut-release.ps1 -SkipPush

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cut-release.ps1 -ReuseCapture
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$ReuseCapture,
  [switch]$SkipPush
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

function Write-Step([string]$text) {
  Write-Host ''
  Write-Host "==> $text" -ForegroundColor Cyan
}

function Write-Detail([string]$text) {
  Write-Host "    $text"
}

function Fail([string]$text) {
  Write-Host ''
  Write-Host "cut: FAIL $text" -ForegroundColor Red
  exit 1
}

function Invoke-Checked([string]$label, [string]$exe, [string[]]$arguments) {
  Write-Detail "$exe $($arguments -join ' ')"
  $global:LASTEXITCODE = 0
  & $exe @arguments
  if ($LASTEXITCODE -ne 0) { Fail "$label exited $LASTEXITCODE" }
}

function Get-Command-Sha([string]$command, [string[]]$arguments) {
  $global:LASTEXITCODE = 0
  $value = & $command @arguments 2>$null
  if ($LASTEXITCODE -ne 0) { return '' }
  return (($value | Out-String).Trim())
}

# ---------------------------------------------------------------- preflight

Write-Step 'Preflight'

foreach ($tool in @('node', 'pnpm', 'git')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
    Fail "$tool is not on PATH; the cut needs Node 22+, pnpm 10 and git."
  }
}

$package = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
$version = [string]$package.version
if (-not $version) { Fail 'package.json has no version.' }
$tag = "v$version"
Write-Detail "version $version, tag $tag"

$record = "docs/RELEASE_$version.md"
$capture = "docs/media/releases/$version-wizard"
$setup = "release/Kryvex-Setup-$version-x64.exe"
$portable = "release/Kryvex-Portable-$version-x64.exe"

if (-not (Test-Path -LiteralPath $record)) {
  Fail "$record does not exist; a release needs its record before its tag."
}

$branch = Get-Command-Sha git @('rev-parse', '--abbrev-ref', 'HEAD')
if ($branch -ne 'main') { Fail "on branch '$branch'; the tag must be cut from main." }

$dirty = & git status --porcelain
if ($LASTEXITCODE -ne 0) { Fail 'git status failed.' }
if (($dirty | Measure-Object).Count -gt 0) {
  Write-Host $dirty
  Fail 'the tree has uncommitted changes; commit or stash them first.'
}

& git fetch --quiet origin main
if ($LASTEXITCODE -ne 0) { Fail 'git fetch origin main failed.' }

$head = Get-Command-Sha git @('rev-parse', 'HEAD')
$remote = (& git ls-remote origin refs/heads/main | Select-Object -First 1)
if ($LASTEXITCODE -ne 0 -or -not $remote) { Fail 'could not read origin/main.' }
$remote = ($remote -split '\s+')[0]
if ($remote -ne $head) {
  Fail "HEAD $head is not origin/main $remote; push or pull first."
}

if (& git tag --list $tag) { Fail "tag $tag already exists locally." }
$remoteTag = & git ls-remote --tags origin "refs/tags/$tag"
if ($LASTEXITCODE -ne 0) { Fail 'could not list remote tags.' }
if (($remoteTag | Measure-Object).Count -gt 0) {
  Fail "tag $tag already exists on origin; a published tag cannot be re-cut."
}

$sw = Get-Content -LiteralPath 'public/sw.js' -Raw
if ($sw -notmatch [regex]::Escape("kryvex-web-$version-")) {
  Fail "public/sw.js does not carry the kryvex-web-$version cache name; the web job publishes from this tag."
}

$status = Get-Content -LiteralPath 'PROJECT_STATUS.md' -Raw
if ($status -notmatch [regex]::Escape($version)) {
  Fail "PROJECT_STATUS.md does not mention $version."
}
$prepared = '(?m)^## Prepared\s*\([^)]*' + [regex]::Escape($version) + '\)'
if ($status -notmatch $prepared) {
  Fail "PROJECT_STATUS.md has no '## Prepared (..., $version)' section; the record stage is missing or already flipped to Released."
}

$readme = Get-Content -LiteralPath 'README.md' -Raw
if ($readme -match [regex]::Escape("Kryvex-Setup-$version-x64.exe")) {
  Fail "README.md already names the $version installers, which do not exist yet. That is the post-publish doc pass (UPDATES.md step 7)."
}

Write-Detail 'preflight passed'

# -------------------------------------------------------------------- build

Write-Step "Build ($version)"
if ($SkipBuild) {
  Write-Detail 'skipped: -SkipBuild'
} else {
  $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  Invoke-Checked 'package:win' 'pnpm' @('package:win')
}

foreach ($artifact in @($setup, $portable)) {
  if (-not (Test-Path -LiteralPath $artifact)) {
    Fail "$artifact was not built. Run without -SkipBuild, or check the electron-builder output."
  }
  $size = (Get-Item -LiteralPath $artifact).Length
  if ($size -lt 1MB) { Fail "$artifact is only $size bytes." }
  Write-Detail ("{0}  {1:N0} B" -f $artifact, $size)
}
Write-Detail 'local sizes only; the published sizes and digests come from the release, not from this build'

# ------------------------------------------------------------------- wizard

Write-Step 'Capture the installer wizard'
if ($ReuseCapture -and (Test-Path -LiteralPath (Join-Path $capture 'wizard.json'))) {
  Write-Detail "skipped: reusing $capture"
} else {
  Invoke-Checked 'wizard capture' 'node' @(
    'scripts/verify-self-update.cjs',
    '--no-app',
    '--installer', $setup,
    '--version', $version,
    '--archive'
  )
}

$manifestPath = Join-Path $capture 'wizard.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
  Fail "no capture at $capture/wizard.json; the wizard run has to finish before the gate can pass."
}
$manifestPath = (Resolve-Path -LiteralPath $manifestPath).ProviderPath
$manifest = ([System.IO.File]::ReadAllText($manifestPath)).TrimStart([char]0xFEFF) | ConvertFrom-Json

if ([string]$manifest.version -ne $version) {
  Fail "the capture says version '$($manifest.version)', not $version."
}
if ([int]$manifest.exitCode -ne 0) { Fail "the installer exited $($manifest.exitCode)." }
if ([int]$manifest.pageCount -lt 2) { Fail "only $($manifest.pageCount) wizard page(s) captured." }

$pages = @($manifest.pages)
if ($pages.Count -ne [int]$manifest.pageCount) {
  Fail "the manifest lists $($pages.Count) pages but claims $($manifest.pageCount)."
}
foreach ($page in $pages) {
  if (-not $page.image) { Fail "wizard page $($page.index) has no screenshot." }
  $file = Join-Path $capture ($page.image -replace '/', '\')
  if (-not (Test-Path -LiteralPath $file)) { Fail "wizard page $($page.index) is missing $($page.image)." }
  if ((Get-Item -LiteralPath $file).Length -lt 1024) { Fail "wizard page $($page.index) screenshot is under 1 KB." }
}
Write-Detail "$($manifest.pageCount) pages, exit 0, archived in $capture"

# --------------------------------------------------------------------- gate

Write-Step 'Record gate'
Invoke-Checked 'release:check' 'node' @('scripts/check-release-record.cjs')
Invoke-Checked 'release:check --all' 'node' @('scripts/check-release-record.cjs', '--all')

# --------------------------------------------------------- commit and push

Write-Step 'Commit the capture'
& git add -- $capture $record
if ($LASTEXITCODE -ne 0) { Fail 'git add failed.' }

$global:LASTEXITCODE = 0
& git diff --cached --quiet
$staged = $LASTEXITCODE -ne 0

if (-not $staged) {
  Write-Detail 'nothing to commit; the capture is already in the tree'
} else {
  $message = @(
    "Capture the $version installer wizard",
    '',
    "$($manifest.pageCount) pages from $($manifest.installer), exit code $($manifest.exitCode),",
    'archived beside the release record so the tag has the capture its gate',
    'checks for and the record shows what the installer actually displayed.'
  ) -join "`n"
  $messageFile = Join-Path $env:TEMP "kryvex-cut-$version.txt"
  [System.IO.File]::WriteAllText($messageFile, $message + "`n", (New-Object System.Text.UTF8Encoding($false)))
  $global:LASTEXITCODE = 0
  & git commit --quiet -F $messageFile
  $commitStatus = $LASTEXITCODE
  Remove-Item -LiteralPath $messageFile -Force -ErrorAction SilentlyContinue
  if ($commitStatus -ne 0) { Fail "git commit exited $commitStatus" }
  Write-Detail ((& git log -1 --format='%h %s') -join '')
}

if ($SkipPush) {
  Write-Host ''
  Write-Host 'Cut: staged and gated, not pushed (-SkipPush).' -ForegroundColor Green
  Write-Host "  git push origin main"
  Write-Host "  git tag -a $tag -m `"Kryvex $version`""
  Write-Host "  git push origin $tag"
  exit 0
}

Write-Step 'Push main'
Invoke-Checked 'git push origin main' 'git' @('push', 'origin', 'main')

$headAfter = Get-Command-Sha git @('rev-parse', 'HEAD')
$remoteAfter = (& git ls-remote origin refs/heads/main | Select-Object -First 1)
$remoteAfter = ($remoteAfter -split '\s+')[0]
if ($remoteAfter -ne $headAfter) { Fail "origin/main is $remoteAfter after the push, local HEAD is $headAfter." }
Write-Detail "origin/main is $headAfter"

# ---------------------------------------------------------------------- tag

Write-Step "Tag $tag"
Invoke-Checked 'git tag' 'git' @('tag', '-a', $tag, '-m', "Kryvex $version")
Invoke-Checked "git push origin $tag" 'git' @('push', 'origin', $tag)

$pushedTag = (& git ls-remote --tags origin "refs/tags/$tag" | Select-Object -First 1)
if (-not $pushedTag) { Fail "tag $tag is not on origin after the push." }

Write-Host ''
Write-Host "Cut: $tag pushed." -ForegroundColor Green
Write-Host 'The Release workflow now typechecks, tests, packages and publishes;'
Write-Host 'the web job republishes gh-pages after it succeeds.'
Write-Host '  https://github.com/XiONDiGiTaL/Kryvex/actions/workflows/release.yml'
Write-Host ''
Write-Host 'Nothing is published until that run finishes. Once it does, close the'
Write-Host 'record (docs/UPDATES.md, step 7) - nothing checks these four edits:'
Write-Host '  README.md, Install on Windows      both artifact names and the published size'
Write-Host '  README.md, Release history         a new first row for this version'
Write-Host "  $record"
Write-Host '                                     replace "recorded after the cut" with the'
Write-Host '                                     published size and SHA-256 of each EXE'
Write-Host '  PROJECT_STATUS.md                  ## Prepared -> ## Released'
