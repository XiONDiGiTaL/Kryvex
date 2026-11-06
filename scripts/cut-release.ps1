<#
.SYNOPSIS
Cuts a Kryvex release on Windows: checks, build, capture the wizard, gate, tag.

.DESCRIPTION
Runs the cut from docs/UPDATES.md in order and stops at the first failure, so a
release cannot be tagged without the installer capture its tag gates on, cannot
be tagged from a tree that is behind origin/main, and cannot be tagged with a
red suite.

  1. checks             pnpm typecheck and pnpm test, before anything is built:
                        a broken suite should not cost a ten-minute package run
  2. package:win        builds release/Kryvex-Setup-<version>-x64.exe and
                        release/Kryvex-Portable-<version>-x64.exe
  3. wizard capture     runs the installer just built through its own wizard and
                        archives docs/media/releases/<version>-wizard/
  4. record gate        check-release-record.cjs for this version, then --all
  5. commit, push, tag  capture committed and pushed to main first, because the
                        Release workflow checks out the tag, not the branch

The wizard step names the installer explicitly. `pnpm release:wizard` on its own
captures whatever releases/latest serves, which is the previous release, and a
hotfix shares its numeric version with the release it patches; an implicit run
therefore archives over that release's capture and still leaves this one
missing.

Nothing here publishes anything. Pushing the tag starts the Release workflow,
which re-runs typecheck and the suite on windows-latest, packages and publishes;
the doc pass that follows a publish is `pnpm release:sync`.

-Preflight runs before all of it: Node, pnpm and git on PATH, Node and pnpm at
the minimums `package.json`'s `engines` states, on main, a clean tree, HEAD equal
to origin/main, no tag locally or on origin, the service-worker cache name, a
`## Prepared` section, and a README that does not name installers that do not
exist yet.

.PARAMETER DryRun
Run every guard, print its verdict, then print the ordered plan and stop.
Nothing is typechecked, built, captured, gated or tagged, and nothing is
written: no fetch, no commit, no tag. Exit code is 1 if a guard failed, because
a real cut would stop there.

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
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cut-release.ps1 -DryRun

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cut-release.ps1 -SkipPush

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/cut-release.ps1 -ReuseCapture
#>
[CmdletBinding()]
param(
  [switch]$SkipBuild,
  [switch]$ReuseCapture,
  [switch]$SkipPush,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$script:problems = 0

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

# A guard is a question with a verdict, not an instruction to die: in -DryRun
# every one of them is asked and reported, so the answer is "these five things
# are wrong" instead of "the first thing is wrong".
function Assert([bool]$condition, [string]$ok, [string]$problem) {
  if ($condition) {
    Write-Detail "ok    $ok"
    return
  }
  $script:problems += 1
  if (-not $DryRun) { Fail $problem }
  Write-Detail "FAIL  $problem"
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

# Node 22 and pnpm 10 are the pair the Release workflow packages the shipped
# installers with, and package.json's `engines` is where that is written down;
# the README points at it instead of repeating numbers a second time. Being on
# PATH is not the same as being new enough: an old Node gets as far as
# electron-builder and fails at something that reads like a build bug.
function ConvertTo-VersionParts([string]$text) {
  $match = [regex]::Match([string]$text, '(?<!\d)(\d+)\.(\d+)\.(\d+)')
  if (-not $match.Success) { return $null }
  return [int[]]@([int]$match.Groups[1].Value, [int]$match.Groups[2].Value, [int]$match.Groups[3].Value)
}

function ConvertFrom-MinimumRange([string]$range) {
  $match = [regex]::Match([string]$range, '^\s*>=\s*(\d+)\.(\d+)\.(\d+)\s*$')
  if (-not $match.Success) { return $null }
  return [int[]]@([int]$match.Groups[1].Value, [int]$match.Groups[2].Value, [int]$match.Groups[3].Value)
}

function Compare-VersionParts([int[]]$left, [int[]]$right) {
  for ($index = 0; $index -lt 3; $index += 1) {
    if ($left[$index] -lt $right[$index]) { return -1 }
    if ($left[$index] -gt $right[$index]) { return 1 }
  }
  return 0
}

function Get-EngineRange($engines, [string]$tool) {
  if ($null -eq $engines) { return '' }
  $property = $engines.PSObject.Properties[$tool]
  if ($null -eq $property) { return '' }
  return [string]$property.Value
}

# A verdict, not a verdict plus a print: -DryRun has to be able to report this
# like every other guard, and the message has to say which of the three things is
# wrong (no engines entry, a range this check cannot read, a version too old).
function Get-ToolchainVerdict([string]$tool, [string]$reported, [string]$range, [string]$hint) {
  if ([string]::IsNullOrWhiteSpace($range)) {
    return @{ Ok = $false; OkText = ''; Problem = "package.json has no engines.$tool, so the cut cannot check the version it packages with." }
  }
  $wanted = ConvertFrom-MinimumRange $range
  if (-not $wanted) {
    return @{ Ok = $false; OkText = ''; Problem = "package.json's engines.$tool is '$range'; this check reads a minimum such as '>=22.0.0'." }
  }
  $have = ConvertTo-VersionParts $reported
  if (-not $have) {
    return @{ Ok = $false; OkText = ''; Problem = "$tool on PATH printed no version ('$reported'); reinstall it or fix PATH." }
  }
  $haveText = $have -join '.'
  if ((Compare-VersionParts $have $wanted) -lt 0) {
    return @{ Ok = $false; OkText = ''; Problem = "$tool $haveText is below engines.$tool $range, the pair the shipped installers are packaged with; $hint." }
  }
  return @{ Ok = $true; OkText = "$tool $haveText satisfies engines.$tool $range"; Problem = '' }
}

# ---------------------------------------------------------------- preflight

Write-Step 'Preflight'

$missing = @()
foreach ($tool in @('node', 'pnpm', 'git')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { $missing += $tool }
}
Assert ($missing.Count -eq 0) 'node, pnpm and git are on PATH' "$($missing -join ', ') is not on PATH; the cut needs Node 22+, pnpm 10 and git."

$package = Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json
$version = [string]$package.version
Assert (-not [string]::IsNullOrWhiteSpace($version)) "package.json names $version" 'package.json has no version.'

foreach ($requirement in @(
    @{ tool = 'node'; hint = 'upgrade Node (fnm, nvm or the installer) to the version CI builds with' },
    @{ tool = 'pnpm'; hint = 'activate the pinned major with `corepack prepare pnpm@10 --activate`' }
  )) {
  # A tool that is not on PATH is already the guard above; asking it --version
  # would only fail again with a worse message.
  if ($missing -contains $requirement.tool) { continue }
  $reported = Get-Command-Sha $requirement.tool @('--version')
  $range = Get-EngineRange $package.engines $requirement.tool
  $verdict = Get-ToolchainVerdict $requirement.tool $reported $range $requirement.hint
  Assert $verdict.Ok $verdict.OkText $verdict.Problem
}

$tag = "v$version"

$record = "docs/RELEASE_$version.md"
$capture = "docs/media/releases/$version-wizard"
$setup = "release/Kryvex-Setup-$version-x64.exe"
$portable = "release/Kryvex-Portable-$version-x64.exe"
Write-Detail "version $version, tag $tag"

Assert (Test-Path -LiteralPath $record) "$record exists" "$record does not exist; a release needs its record before its tag."

$branch = Get-Command-Sha git @('rev-parse', '--abbrev-ref', 'HEAD')
Assert ($branch -eq 'main') 'on main' "on branch '$branch'; the tag must be cut from main."

$dirty = & git status --porcelain
Assert ($LASTEXITCODE -eq 0) 'git reads the tree' 'git status failed.'
if (($dirty | Measure-Object).Count -gt 0) { Write-Host $dirty }
Assert ((($dirty | Measure-Object).Count -eq 0)) 'the tree is clean' 'the tree has uncommitted changes; commit or stash them first.'

# -DryRun leaves .git alone, so it compares against the remote directly.
if (-not $DryRun) {
  & git fetch --quiet origin main
  Assert ($LASTEXITCODE -eq 0) 'fetched origin/main' 'git fetch origin main failed.'
}

$head = Get-Command-Sha git @('rev-parse', 'HEAD')
$remoteLine = (& git ls-remote origin refs/heads/main | Select-Object -First 1)
$remote = ''
if ($remoteLine) { $remote = ($remoteLine -split '\s+')[0] }
$remoteText = 'unreadable'
if ($remote) { $remoteText = $remote }
Assert ($remote -and $remote -eq $head) "HEAD is origin/main ($head)" "HEAD $head is not origin/main $remoteText; push or pull first."

Assert (-not (& git tag --list $tag)) "tag $tag does not exist locally" "tag $tag already exists locally."
$remoteTag = & git ls-remote --tags origin "refs/tags/$tag"
Assert ($LASTEXITCODE -eq 0) 'origin tags are readable' 'could not list remote tags.'
Assert (($remoteTag | Measure-Object).Count -eq 0) "tag $tag does not exist on origin" "tag $tag already exists on origin; a published tag cannot be re-cut."

$sw = Get-Content -LiteralPath 'public/sw.js' -Raw
Assert ($sw -match [regex]::Escape("kryvex-web-$version-")) "public/sw.js carries kryvex-web-$version-" "public/sw.js does not carry the kryvex-web-$version cache name; the web job publishes from this tag."

$status = Get-Content -LiteralPath 'PROJECT_STATUS.md' -Raw
$prepared = '(?m)^## Prepared\s*\([^)]*' + [regex]::Escape($version) + '\)'
Assert ($status -match $prepared) "PROJECT_STATUS.md has a '## Prepared (..., $version)' section" "PROJECT_STATUS.md has no '## Prepared (..., $version)' section; the record stage is missing or already flipped to Released."

$readme = Get-Content -LiteralPath 'README.md' -Raw
Assert ($readme -notmatch [regex]::Escape("Kryvex-Setup-$version-x64.exe")) "README.md does not name the $version installers yet" "README.md already names the $version installers, which do not exist yet. That is the post-publish doc pass (pnpm release:sync)."

# ------------------------------------------------------------------- dry run

function Show-Plan {
  Write-Host ''
  Write-Host 'Plan: what a real cut would run, in this order. Nothing below ran.' -ForegroundColor Cyan

  Write-Host ''
  Write-Host '  1. checks'
  Write-Host '       pnpm typecheck'
  Write-Host '       pnpm test'

  Write-Host ''
  Write-Host "  2. build ($version)"
  if ($SkipBuild) {
    Write-Host "       skipped: -SkipBuild, using $setup and $portable"
  } else {
    Write-Host '       pnpm package:win'
    Write-Host "       then $setup and $portable are checked for size"
  }

  Write-Host ''
  Write-Host '  3. capture the installer wizard'
  if ($ReuseCapture -and (Test-Path -LiteralPath (Join-Path $capture 'wizard.json'))) {
    Write-Host "       skipped: -ReuseCapture, keeping $capture"
  } else {
    Write-Host "       node scripts/verify-self-update.cjs --no-app --installer $setup --version $version --archive"
    Write-Host "       then $capture/wizard.json is read: version, exit code and every page image"
  }

  Write-Host ''
  Write-Host '  4. record gate'
  Write-Host '       node scripts/check-release-record.cjs'
  Write-Host '       node scripts/check-release-record.cjs --all'

  Write-Host ''
  Write-Host '  5. commit the capture'
  Write-Host "       git add -- $capture $record"
  Write-Host "       git commit -F <capture message>   (only if something is staged)"

  if ($SkipPush) {
    Write-Host ''
    Write-Host '  6. push and tag'
    Write-Host '       stopped: -SkipPush, prints the three push commands instead'
  } else {
    Write-Host ''
    Write-Host '  6. push main'
    Write-Host '       git push origin main'
    Write-Host ''
    Write-Host "  7. tag $tag"
    Write-Host "       git tag -a $tag -m `"Kryvex $version`""
    Write-Host "       git push origin $tag"
    Write-Host ''
    Write-Host '       that push starts the Release workflow, which publishes.'
  }
}

if ($DryRun) {
  Show-Plan
  Write-Host ''
  if ($script:problems -gt 0) {
    Write-Host "dry run: $($script:problems) guard(s) failed, so a real cut would stop in preflight and run none of the above." -ForegroundColor Yellow
    exit 1
  }
  Write-Host 'dry run: every guard passed. Nothing was typechecked, built, captured or tagged.' -ForegroundColor Green
  exit 0
}

# ------------------------------------------------------------------ checks

Write-Step 'Typecheck and the unit suite'
Invoke-Checked 'typecheck' 'pnpm' @('typecheck')
Invoke-Checked 'test' 'pnpm' @('test')

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
Write-Host 'The Release workflow now re-runs typecheck and the suite, packages and'
Write-Host 'publishes; the web job republishes gh-pages after it succeeds.'
Write-Host '  https://github.com/XiONDiGiTaL/Kryvex/actions/workflows/release.yml'
Write-Host ''
Write-Host 'Nothing is published until that run finishes. Once it does, close the'
Write-Host 'record from the release itself:'
Write-Host '  pnpm release:sync'
Write-Host '    fills the README install table and history row, the record Artifacts'
Write-Host '    sizes and digests, and the PROJECT_STATUS flip, from the release'
Write-Host '    assets; read the notes it prints, the prose was written pre-tag'
