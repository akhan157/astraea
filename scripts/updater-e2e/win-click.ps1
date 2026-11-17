# win-click.ps1 -Label <button name> -TimeoutSec <n>
# Finds a button by its accessible name in the Astraea window through Windows
# UI Automation (the accessibility tree WebView2 exposes) and invokes it.
# Prints "clicked" or "absent".
param([Parameter(Mandatory)] [string] $Label, [int] $TimeoutSec = 90)
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes
$A = [System.Windows.Automation.AutomationElement]
$deadline = (Get-Date).AddSeconds($TimeoutSec)
do {
  $procs = Get-Process astraea-workstation -ErrorAction SilentlyContinue
  foreach ($proc in $procs) {
    $cond = New-Object System.Windows.Automation.PropertyCondition($A::ProcessIdProperty, $proc.Id)
    $windows = $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, $cond)
    foreach ($w in $windows) {
      $buttonCond = New-Object System.Windows.Automation.AndCondition(
        (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)),
        (New-Object System.Windows.Automation.PropertyCondition($A::NameProperty, $Label)))
      $b = $w.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $buttonCond)
      if ($b) {
        $b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern).Invoke()
        'clicked'
        exit 0
      }
    }
  }
  Start-Sleep -Seconds 1
} while ((Get-Date) -lt $deadline)
'absent'
