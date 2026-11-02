# Fills and accepts the native Windows save dialog that belongs to one process.
#
# Two things make this fiddly, and both are handled here:
#
#   * the dialog is a shell window (class `#32770`) owned by the app's process,
#     not a Chromium window, so it is found by walking top-level windows;
#   * its controls are DirectUI. UI Automation reports them — the file name
#     field is a Pane with automation id 1001 and class `Edit`, Save is a Pane
#     with id 1 and class `Button` — but exposes no patterns on either, so
#     neither can be set or invoked. They are clicked at their on-screen
#     rectangles and typed into instead, which is also what makes the dialog
#     active: keystrokes aimed at a window Windows will not raise land wherever
#     the user's focus happens to be.
param(
  [Parameter(Mandatory = $true)][int]$AppPid,
  [string]$TargetPath = ''
)

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class SaveDialogWindow {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr extra);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extra);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] static extern bool AttachThreadInput(uint attach, uint attachTo, bool on);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] static extern bool BringWindowToTop(IntPtr hWnd);

  /**
   * Raise the dialog above whatever is covering it. A process Windows does not
   * consider active cannot do this alone, so it borrows the input of the thread
   * that is; without it the clicks below land on the window on top instead.
   */
  public static void Raise(IntPtr target) {
    uint pid;
    IntPtr current = GetForegroundWindow();
    uint currentThread = GetWindowThreadProcessId(current, out pid);
    uint targetThread = GetWindowThreadProcessId(target, out pid);
    if (currentThread != 0 && targetThread != 0 && currentThread != targetThread) {
      AttachThreadInput(currentThread, targetThread, true);
      BringWindowToTop(target);
      SetForegroundWindow(target);
      AttachThreadInput(currentThread, targetThread, false);
    } else {
      BringWindowToTop(target);
      SetForegroundWindow(target);
    }
  }

  public static IntPtr Find(uint processId) {
    IntPtr found = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr l) {
      uint pid;
      GetWindowThreadProcessId(h, out pid);
      if (pid != processId) return true;
      if (!IsWindowVisible(h)) return true;
      var cls = new StringBuilder(64);
      GetClassName(h, cls, 64);
      if (cls.ToString() == "#32770") {
        found = h;
        return false;
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }

  public static void Click(int x, int y) {
    SetCursorPos(x, y);
    mouse_event(0x0002, 0, 0, 0, UIntPtr.Zero);
    mouse_event(0x0004, 0, 0, 0, UIntPtr.Zero);
  }
}
"@

$descendants = [System.Windows.Automation.TreeScope]::Descendants

# SendKeys treats these as commands, so they are wrapped in braces.
function Escape-Keys {
  param([string]$Text)
  return ($Text -replace '([+^%~()\[\]{}])', '{$1}')
}

# The one control the dialog exposes with this automation id and class.
function Find-Control {
  param($Dialog, [string]$Id, [string]$ClassName)
  $byId = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::AutomationIdProperty, $Id)
  foreach ($element in $Dialog.FindAll($descendants, $byId)) {
    if ($element.Current.ClassName -eq $ClassName) { return $element }
  }
  return $null
}

function Click-Center {
  param($Element)
  $rect = $Element.Current.BoundingRectangle
  if ($rect.Width -le 0 -or $rect.Height -le 0) { return $false }
  [SaveDialogWindow]::Click(
    [int]($rect.Left + $rect.Width / 2), [int]($rect.Top + $rect.Height / 2))
  return $true
}

$deadline = (Get-Date).AddSeconds(45)
$handle = [IntPtr]::Zero

while ((Get-Date) -lt $deadline -and $handle -eq [IntPtr]::Zero) {
  $handle = [SaveDialogWindow]::Find([uint32]$AppPid)
  if ($handle -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 300 }
}

if ($handle -eq [IntPtr]::Zero) {
  Write-Output 'no-dialog'
  exit 2
}

[SaveDialogWindow]::Raise($handle)
Start-Sleep -Milliseconds 400

$dialog = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
$box = Find-Control -Dialog $dialog -Id '1001' -ClassName 'Edit'
if (-not $box) {
  Write-Output 'no-name-box'
  exit 3
}

# The first click on an inactive dialog only raises it, so the field is clicked
# again once it owns the input, and the result is read back: a transfer that
# silently saved somewhere else costs a whole file.
function Set-Field {
  param($Box, [string]$Path)
  $rect = $Box.Current.BoundingRectangle
  $offset = [Math]::Max(10, [Math]::Min(30, $rect.Width / 4))
  $x = [int]($rect.Left + $offset)
  $y = [int]($rect.Top + $rect.Height / 2)
  [SaveDialogWindow]::Click($x, $y)
  Start-Sleep -Milliseconds 400
  [SaveDialogWindow]::Click($x, $y)
  Start-Sleep -Milliseconds 250
  [System.Windows.Forms.SendKeys]::SendWait('^a')
  Start-Sleep -Milliseconds 120
  [System.Windows.Forms.SendKeys]::SendWait((Escape-Keys -Text $Path))
  Start-Sleep -Milliseconds 300
}

# A field holding only a bare file name is the name the app proposed, not the
# destination: a long path scrolls, so the field shows a tail of it instead.
function Field-Holds {
  param([string]$Field, [string]$Path)
  if (-not $Field) { return $false }
  if ($Field -eq $Path) { return $true }
  return ($Path.EndsWith($Field) -and $Field.Length -ge 12 -and $Field.Contains('\'))
}

$field = $box.Current.Name
if ($TargetPath) {
  for ($attempt = 0; $attempt -lt 3; $attempt += 1) {
    Set-Field -Box $box -Path $TargetPath
    $field = $box.Current.Name
    if (Field-Holds -Field $field -Path $TargetPath) { break }
  }
  if (-not (Field-Holds -Field $field -Path $TargetPath)) {
    Write-Output "field-not-set field=[$field]"
    exit 5
  }
}

# What the field holds now: a long path scrolls, so the tail is what it shows.

$save = Find-Control -Dialog $dialog -Id '1' -ClassName 'Button'
if (-not $save -or -not (Click-Center -Element $save)) {
  [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')
}

Write-Output "accepted field=[$field]"
exit 0
