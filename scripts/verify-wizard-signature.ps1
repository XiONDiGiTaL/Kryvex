# Guards the page-identity rules of the wizard capture in verify-wizard.ps1.
#
# The capture decides a page has advanced by comparing signatures, and a page
# whose readouts move while it is up -- the install-location page re-reading its
# free-space line, a progress percentage ticking -- once signed differently on
# every poll. Every picture it took was then deleted as unphotographable. A page
# is now signed by what it is (its controls, its buttons, its heading) rather
# than by what its readouts currently say, and this is what holds that in place.
#
# It needs no installer, no window and no account. verify-wizard.ps1 cannot be
# dot-sourced whole, because running it starts an installer, so the functions
# under test are taken straight out of it with PowerShell's own parser and
# Get-Text is stubbed: only the signature logic runs here.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-wizard-signature.ps1
#
# Exit code 0 means the page-identity rules hold.
param(
  [string]$Path = ''
)

$ErrorActionPreference = 'Stop'

$failures = 0
function Assert {
  param([bool]$Condition, [string]$Message)
  if ($Condition) {
    Write-Output "PASS $Message"
  } else {
    Write-Output "FAIL $Message"
    $script:failures += 1
  }
}

if (-not $Path) { $Path = Join-Path $PSScriptRoot 'verify-wizard.ps1' }
if (-not (Test-Path -LiteralPath $Path)) {
  Write-Output "FAIL no script at $Path"
  exit 1
}

# Parsing first: it fails loudly if the capture script has stopped being valid
# PowerShell, which is worth knowing before reading functions out of it.
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($Path, [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) {
  $errors | ForEach-Object { Write-Output ("parse error: line " + $_.Extent.StartLineNumber + ": " + $_.Message) }
  Write-Output 'FAIL the wizard capture script parses'
  exit 1
}
Write-Output 'PASS the wizard capture script parses'

foreach ($name in 'ConvertTo-StableText', 'Get-Page') {
  $function = $ast.FindAll({
      param($node)
      $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name
    }, $true) | Select-Object -First 1
  if (-not $function) {
    Write-Output "FAIL verify-wizard.ps1 no longer defines $name"
    exit 1
  }
  Invoke-Expression $function.Extent.Text
}

# The real Get-Page asks the window for its title; no window is involved here.
function Get-Text {
  param([IntPtr]$Handle)
  return ''
}

function Control {
  param([string]$Class, [int]$Id, [string]$Text)
  return [pscustomobject]@{ 'class' = $Class; id = $Id; text = $Text; enabled = $true; top = 0; left = 0 }
}

# The install-location page as it looks twice: the free-space figure has been
# read again, and it reads differently.
$location = @(
  (Control 'Static' 1000 'Choose install location'),
  (Control 'Static' 1001 'Space available: 99.0 GB'),
  (Control 'Button' 1 'Next >'),
  (Control 'Button' 2 'Cancel')
)
$locationReread = @(
  (Control 'Static' 1000 'Choose install location'),
  (Control 'Static' 1001 'Space available: 98.4 GB'),
  (Control 'Button' 1 'Next >'),
  (Control 'Button' 2 'Cancel')
)

# The progress page counts up, and is the page the capture is most likely to see
# change under it.
$progress = @(
  (Control 'Static' 1000 'Installing Kryvex... 12%'),
  (Control 'Static' 1001 'Extracting files'),
  (Control 'Button' 2 'Cancel')
)
$progressLater = @(
  (Control 'Static' 1000 'Installing Kryvex... 47%'),
  (Control 'Static' 1001 'Extracting files'),
  (Control 'Button' 2 'Cancel')
)
$progressWithDetails = @(
  (Control 'Static' 1000 'Installing Kryvex... 12%'),
  (Control 'Static' 1001 'Extracting files'),
  (Control 'Button' 2 'Cancel'),
  (Control 'Button' 7 'Show details')
)

$finish = @(
  (Control 'Static' 1000 'Installation Complete'),
  (Control 'Button' 1 'Finish'),
  (Control 'Button' 2 'Cancel')
)

$zero = [IntPtr]::Zero
$before = Get-Page $zero $location
$after = Get-Page $zero $locationReread
$early = Get-Page $zero $progress
$late = Get-Page $zero $progressLater
$detailed = Get-Page $zero $progressWithDetails
$done = Get-Page $zero $finish

Assert ($before.signature -ne '') 'a page with controls signs itself'
Assert ($before.signature -eq $after.signature) 'a free-space figure that changes still reads as the same page'
Assert ($early.signature -eq $late.signature) 'a progress percentage that ticks still reads as the same page'
Assert ($before.signature -ne $early.signature) 'the install-location page and the progress page are different pages'
Assert ($early.signature -ne $done.signature) 'the progress page and the finish page are different pages'
Assert ($early.signature -ne $detailed.signature) 'a page that grows a button is a different page'
Assert ($before.title -eq 'Choose install location') 'the recorded title stays the page heading, unmasked'
Assert ((ConvertTo-StableText 'Space available: 99.0 GB') -eq (ConvertTo-StableText 'Space available: 98.4 GB')) 'figures are masked, so a re-read figure is the same text'
Assert ((ConvertTo-StableText 'Installing... 12%') -ne (ConvertTo-StableText 'Installation Complete')) 'masking figures does not make different headings equal'

if ($failures -gt 0) {
  Write-Output ("page identity: FAIL (" + $failures + " of 9 checks)")
  exit 1
}
Write-Output 'page identity: PASS (9 checks)'
