# Captures every page of a Windows installer wizard and its exit code.
#
# NSIS renders its pages as native controls, so Page.captureScreenshot and CDP
# cannot see them: a CDP screenshot of the shell does not include a native child
# window. This script reads the dialog's controls in visual order for each page's
# own text, saves a PNG per distinct page, presses the page's forward button, and
# reports the installer's exit code from a handle opened while the process was
# alive -- which is the part a shell-started process loses.
#
# The forward button is clicked by posting WM_COMMAND with the button's control
# id, so no keystroke needs to land on a focused window. Pressing Enter was tried
# first and stopped at the first page, because focus sat on a radio button.
#
# Two ways in:
#   -Installer <path>     start it here (we own the handle)
#   -ProcessName <name>   attach to one that is already running (the app's own
#                         update path starts the installer detached)
#
# Writes <OutDir>/wizard.json and <OutDir>/pages/*.png. Exit code 0 from this
# script means the capture completed; the installer's own code is in the JSON.
param(
  [string]$Installer,
  [string]$ProcessName,
  [string]$OutDir = '',
  [switch]$NoAdvance,
  [int]$TimeoutSeconds = 420,
  [int]$SettleMilliseconds = 1200
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class KryvexWizard {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc callback, IntPtr lParam);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextLengthW(IntPtr hWnd);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassNameW(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
  [DllImport("user32.dll")] public static extern int GetDlgCtrlID(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint message, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdc, uint flags);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);
  [DllImport("kernel32.dll", SetLastError = true)] public static extern bool GetExitCodeProcess(IntPtr process, out uint code);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
}
"@

$script:pages = New-Object System.Collections.ArrayList
$WM_COMMAND = 0x0111

function Resolve-OutDir {
  param([string]$Requested)
  if ($Requested) { return [System.IO.Path]::GetFullPath($Requested) }
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  return [System.IO.Path]::GetFullPath((Join-Path (Get-Location) ".tmp-self-update\$stamp"))
}

function Get-Text {
  param([IntPtr]$Handle)
  $length = [KryvexWizard]::GetWindowTextLengthW($Handle)
  if ($length -le 0) { return '' }
  $buffer = New-Object System.Text.StringBuilder ($length + 2)
  [void][KryvexWizard]::GetWindowTextW($Handle, $buffer, $buffer.Capacity)
  $text = $buffer.ToString() -replace '\s+', ' '
  return $text.Trim()
}

function Get-Class {
  param([IntPtr]$Handle)
  $buffer = New-Object System.Text.StringBuilder 256
  [void][KryvexWizard]::GetClassNameW($Handle, $buffer, $buffer.Capacity)
  return $buffer.ToString()
}

function Get-Controls {
  param([IntPtr]$Root)
  $controls = New-Object System.Collections.ArrayList
  $callback = [KryvexWizard+EnumProc] {
    param([IntPtr]$child, [IntPtr]$state)
    if (-not [KryvexWizard]::IsWindowVisible($child)) { return $true }
    $rect = New-Object KryvexWizard+RECT
    if (-not [KryvexWizard]::GetWindowRect($child, [ref]$rect)) { return $true }
    [void]$controls.Add([pscustomobject]@{
      handle = $child
      class  = (Get-Class $child)
      id      = [KryvexWizard]::GetDlgCtrlID($child)
      text    = (Get-Text $child)
      enabled = [KryvexWizard]::IsWindowEnabled($child)
      top     = $rect.Top
      left    = $rect.Left
    })
    return $true
  }
  [void][KryvexWizard]::EnumChildWindows($Root, $callback, [IntPtr]::Zero)
  return @($controls | Sort-Object top, left)
}

function Get-Page {
  param([IntPtr]$Root, $Controls)
  $texts = New-Object System.Collections.ArrayList
  $buttons = New-Object System.Collections.ArrayList
  foreach ($control in $Controls) {
    if (-not $control.text) { continue }
    if ($control.class -eq 'Button') {
      [void]$buttons.Add($control.text)
    } else {
      [void]$texts.Add($control.text)
    }
  }
  $uniqueTexts = @($texts | Select-Object -Unique)
  $uniqueButtons = @($buttons | Select-Object -Unique)
  return [pscustomobject]@{
    windowTitle = (Get-Text $Root)
    title       = $(if ($uniqueTexts.Count -gt 0) { $uniqueTexts[0] } else { '' })
    texts       = $uniqueTexts
    buttons     = $uniqueButtons
    controls    = $Controls
    signature   = (($uniqueTexts + $uniqueButtons) -join "`u{1f}")
  }
}

function Save-WindowImage {
  param([IntPtr]$Root, [string]$Path)
  $rect = New-Object KryvexWizard+RECT
  if (-not [KryvexWizard]::GetWindowRect($Root, [ref]$rect)) { return $false }
  $width = $rect.Right - $rect.Left
  $height = $rect.Bottom - $rect.Top
  if ($width -lt 8 -or $height -lt 8) { return $false }
  $bitmap = New-Object System.Drawing.Bitmap $width, $height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $hdc = $graphics.GetHdc()
  try {
    # 2 = PW_RENDERFULLCONTENT, which also captures composited children.
    $ok = [KryvexWizard]::PrintWindow($Root, $hdc, 2)
  } finally {
    $graphics.ReleaseHdc($hdc)
    $graphics.Dispose()
  }
  if (-not $ok) {
    $bitmap.Dispose()
    return $false
  }
  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()
  return $true
}

function Get-SafeName {
  param([string]$Text)
  $clean = ($Text -replace '[^\w\- ]', ' ' -replace '\s+', ' ').Trim()
  if (-not $clean) { return 'page' }
  if ($clean.Length -gt 40) { return $clean.Substring(0, 40).Trim() }
  return $clean
}

# The page's own forward action: "Next >", "Install", "Finish", "I Agree", or
# the dialog's IDOK. Clicked through WM_COMMAND so no window needs focus, and
# only while it is enabled: during the install page the button is disabled, and
# clicking it anyway skipped the file copy in the first version of this script.
function Invoke-Forward {
  param([IntPtr]$Root, $Controls)
  $forward = $null
  foreach ($control in $Controls) {
    if ($control.class -ne 'Button' -or -not $control.text) { continue }
    if (-not $control.enabled) { continue }
    if ($control.text -match '^\s*(&?Next|&?Install|&?Finish|&?I Agree|&?Yes|&?Continue)') {
      if ($null -eq $forward -or $control.id -eq 1) { $forward = $control }
      if ($control.id -eq 1) { break }
    }
  }
  if ($null -eq $forward) {
    foreach ($control in $Controls) {
      if ($control.class -eq 'Button' -and $control.id -eq 1 -and $control.enabled) {
        $forward = $control
        break
      }
    }
  }
  if ($null -eq $forward) { return $null }
  [void][KryvexWizard]::SendMessage($Root, $WM_COMMAND, [IntPtr]$forward.id, $forward.handle)
  return $forward.text
}

# ---------------------------------------------------------------------------

if (-not $Installer -and -not $ProcessName) { Write-Error 'Pass either -Installer <path> or -ProcessName <name>.' }
if ($Installer -and $ProcessName) { Write-Error 'Pass one of -Installer or -ProcessName, not both.' }

$out = Resolve-OutDir $OutDir
$pagesDir = Join-Path $out 'pages'
New-Item -ItemType Directory -Force -Path $pagesDir | Out-Null
$startedAt = Get-Date

$process = $null
$handle = [IntPtr]::Zero
$startedHere = $false

if ($Installer) {
  $installerPath = [System.IO.Path]::GetFullPath($Installer)
  if (-not (Test-Path -LiteralPath $installerPath)) { Write-Error "Installer not found: $installerPath" }
  $startedHere = $true
  $process = Start-Process -FilePath $installerPath -PassThru
  $handle = [KryvexWizard]::OpenProcess(0x00100000 -bor 0x1000, $false, $process.Id) # SYNCHRONIZE | QUERY_LIMITED_INFORMATION
} else {
  $deadline = (Get-Date).AddSeconds(90)
  while ((Get-Date) -lt $deadline) {
    $candidates = @(Get-Process -ErrorAction SilentlyContinue | Where-Object {
      $_.ProcessName -eq $ProcessName -or $_.ProcessName -like "$ProcessName*"
    })
    if ($candidates.Count -gt 0) {
      $process = $candidates | Sort-Object StartTime -Descending | Select-Object -First 1
      $handle = [KryvexWizard]::OpenProcess(0x00100000 -bor 0x1000, $false, $process.Id)
      break
    }
    Start-Sleep -Milliseconds 300
  }
  if (-not $process) { Write-Error "No process named '$ProcessName' appeared within 90 s." }
}

Write-Output ("wizard: watching '" + $process.ProcessName + "' pid " + $process.Id + " (" + $(if ($startedHere) { 'started by this script' } else { 'attached' }) + ")")

$lastSignature = ''
$advanceAttempts = 0
$nextAdvance = Get-Date
$deadline = $startedAt.AddSeconds($TimeoutSeconds)
$handleZero = $handle -eq [IntPtr]::Zero
$closedByUs = $false

while ((Get-Date) -lt $deadline) {
  $alive = $true
  if ($handleZero -eq $false) {
    if ([KryvexWizard]::WaitForSingleObject($handle, 0) -eq 0) { $alive = $false }
  } else {
    try { $alive = -not $process.HasExited } catch { $alive = $false }
  }
  if (-not $alive) { break }

  try { $process.Refresh() } catch { }
  $window = [IntPtr]::Zero
  try { $window = $process.MainWindowHandle } catch { $window = [IntPtr]::Zero }
  # A dialog that has just closed reports no main window at all, and the null
  # then fails IsWindow's IntPtr conversion after the finish page.
  if ($null -eq $window) { $window = [IntPtr]::Zero }

  if ($window -ne [IntPtr]::Zero -and [KryvexWizard]::IsWindow($window)) {
    $controls = Get-Controls $window
    $page = Get-Page $window $controls

    $hasContent = ($page.texts.Count + $page.buttons.Count) -gt 0
    if ($hasContent -and $page.signature -and $page.signature -ne $lastSignature) {
      $index = $script:pages.Count + 1
      $image = Join-Path $pagesDir ("{0:d2}-{1}.png" -f $index, (Get-SafeName $page.title))
      $saved = Save-WindowImage $window $image
      [void]$script:pages.Add([pscustomobject]@{
        index       = $index
        windowTitle = $page.windowTitle
        title       = $page.title
        texts       = $page.texts
        buttons     = $page.buttons
        image       = $(if ($saved) { $image } else { $null })
        at          = (Get-Date).ToUniversalTime().ToString('o')
      })
      $lastSignature = $page.signature
      $advanceAttempts = 0
      $nextAdvance = (Get-Date).AddSeconds(1.5)
      Write-Output ("page " + $index + ": " + $page.title)
    }

    if (-not $NoAdvance -and $lastSignature -and (Get-Date) -ge $nextAdvance -and $advanceAttempts -lt 25) {
      $label = Invoke-Forward $window $controls
      if ($label) {
        $advanceAttempts += 1
        Write-Output ("  advanced with '" + $label + "' (attempt " + $advanceAttempts + ")")
        $nextAdvance = (Get-Date).AddSeconds(3.5)
      } else {
        # A progress page has no forward button; wait for it to finish.
        $nextAdvance = (Get-Date).AddSeconds(2)
      }
    }
  }
  Start-Sleep -Milliseconds 300
}

$exitCode = $null
$timedOut = $false
if ($handleZero -eq $false) {
  $remaining = [Math]::Max(1000, ($TimeoutSeconds * 1000) - [int]((Get-Date) - $startedAt).TotalMilliseconds)
  $state = [KryvexWizard]::WaitForSingleObject($handle, [uint32]$remaining)
  if ($state -eq 0) {
    $code = [uint32]0
    if ([KryvexWizard]::GetExitCodeProcess($handle, [ref]$code)) { $exitCode = [int64]$code }
  } else {
    $timedOut = $true
  }
  [void][KryvexWizard]::CloseHandle($handle)
} else {
  try {
    if (-not $process.HasExited) { [void]$process.WaitForExit(5000) }
    if ($process.HasExited) { $exitCode = $process.ExitCode }
  } catch { }
}

$result = [pscustomobject]@{
  installer   = $(if ($Installer) { [System.IO.Path]::GetFullPath($Installer) } else { $null })
  processName = $process.ProcessName
  startedHere = $startedHere
  pageCount   = $script:pages.Count
  pages       = $script:pages
  exitCode    = $exitCode
  timedOut    = $timedOut
  advanced    = (-not $NoAdvance)
  outDir      = $out
  durationMs  = [int]((Get-Date) - $startedAt).TotalMilliseconds
}

$jsonPath = Join-Path $out 'wizard.json'
$result | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $jsonPath -Encoding UTF8
Write-Output ("pages captured: " + $script:pages.Count)
Write-Output ("exit code: " + $(if ($null -eq $exitCode) { 'unavailable' } else { $exitCode }))
Write-Output ("wrote " + $jsonPath)
if ($timedOut) { exit 2 }
exit 0
