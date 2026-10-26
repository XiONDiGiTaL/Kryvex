# Fills and accepts the native Windows save dialog that belongs to one process.
#
# The dialog is found by walking top-level windows with Win32 (class `#32770`,
# owned by the app's process) rather than through UI Automation, which does not
# reliably report shell dialogs. Once the handle is known the dialog is driven
# with UI Automation: put a path in its file-name field and invoke Save. If that
# fails, the window is brought forward and Enter accepts the name the app
# proposed. The caller reads the saved path back from the app either way.
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
using System.Collections.Generic;
public class DialogFind {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr extra);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr hWnd, StringBuilder sb, int max);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);

  public static IntPtr FindDialog(uint processId) {
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
}
"@

$descendants = [System.Windows.Automation.TreeScope]::Descendants

function Invoke-Save {
  param($Dialog)

  if ($TargetPath) {
    $editCondition = New-Object System.Windows.Automation.PropertyCondition(
      [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
      [System.Windows.Automation.ControlType]::Edit
    )
    foreach ($edit in $Dialog.FindAll($descendants, $editCondition)) {
      $value = $null
      if ($edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$value)) {
        $value.SetValue($TargetPath)
        break
      }
    }
  }

  $buttonCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Button
  )
  foreach ($button in $Dialog.FindAll($descendants, $buttonCondition)) {
    $name = ($button.Current.Name -replace '&', '').Trim()
    if (@('Save', 'Speichern', 'Guardar', 'Enregistrer') -contains $name) {
      $invoke = $null
      if ($button.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$invoke)) {
        $invoke.Invoke()
        return $true
      }
    }
  }
  return $false
}

$deadline = (Get-Date).AddSeconds(45)
$handle = [IntPtr]::Zero

while ((Get-Date) -lt $deadline -and $handle -eq [IntPtr]::Zero) {
  $handle = [DialogFind]::FindDialog([uint32]$AppPid)
  if ($handle -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 300 }
}

if ($handle -eq [IntPtr]::Zero) {
  Write-Output 'no-dialog'
  exit 2
}

try {
  $dialog = [System.Windows.Automation.AutomationElement]::FromHandle($handle)
  if (Invoke-Save -Dialog $dialog) {
    Write-Output 'accepted-uia'
    exit 0
  }
} catch {
  # Fall through to the keyboard route.
}

[void][DialogFind]::SetForegroundWindow($handle)
Start-Sleep -Milliseconds 500
[System.Windows.Forms.SendKeys]::SendWait("{ENTER}")
Write-Output 'accepted-keys'
exit 0
