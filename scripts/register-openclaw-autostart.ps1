[CmdletBinding()]
param(
  [switch]$Unregister,
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

$taskName = "XiaomaOpenClawAutoStart"
$runnerPath = Join-Path $PSScriptRoot "openclaw-autostart.ps1"
$startupFolder = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup"
$startupLauncherPath = Join-Path $startupFolder "xiaoma-openclaw-autostart.cmd"

if (-not (Test-Path $runnerPath)) {
  throw "Runner script not found: $runnerPath"
}

if ($Unregister) {
  $deleteOk = $false
  try {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $null = & schtasks /Delete /TN $taskName /F 2>$null
    $deleteOk = ($LASTEXITCODE -eq 0)
  } catch {
    $deleteOk = $false
  } finally {
    $ErrorActionPreference = $previousPreference
  }

  if ($deleteOk) {
    Write-Host "Removed scheduled task: $taskName"
  } else {
    Write-Host "Task not found or cannot be removed: $taskName"
  }

  if (Test-Path $startupLauncherPath) {
    Remove-Item -Path $startupLauncherPath -Force
    Write-Host "Removed startup launcher: $startupLauncherPath"
  }
  exit 0
}

$taskCommand = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$runnerPath`" -Ensure -Quiet"

$createOk = $false
try {
  $previousPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  $createOutput = & schtasks /Create /TN $taskName /TR $taskCommand /SC ONLOGON /F 2>&1
  $createOk = ($LASTEXITCODE -eq 0)
} catch {
  $createOutput = $_.Exception.Message
  $createOk = $false
} finally {
  $ErrorActionPreference = $previousPreference
}

if ($createOk) {
  Write-Host "Scheduled task is ready: $taskName"
} else {
  Write-Host "Scheduled task creation failed, fallback to Startup folder launcher"
  if (-not (Test-Path $startupFolder)) {
    New-Item -Path $startupFolder -ItemType Directory -Force | Out-Null
  }

  $launcherLines = @(
    "@echo off",
    "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runnerPath`" -Ensure -Quiet"
  )
  Set-Content -Path $startupLauncherPath -Value $launcherLines -Encoding ASCII
  Write-Host "Startup launcher is ready: $startupLauncherPath"
}

if ($RunNow) {
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $runnerPath -Ensure -Quiet
  Write-Host "Executed autostart script once for immediate verification"
}
