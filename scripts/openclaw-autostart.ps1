[CmdletBinding()]
param(
  [switch]$Ensure,
  [switch]$Status,
  [switch]$Quiet
)

if (-not $Ensure -and -not $Status) {
  $Ensure = $true
}

$ErrorActionPreference = "Stop"

$BridgeScriptPath = Join-Path $env:USERPROFILE "openclaw-http-bridge.cjs"
$BridgeHost = "127.0.0.1"
$BridgePort = 18888
$TunnelConfigPath = Join-Path $env:USERPROFILE ".cloudflared\config-openclaw.yml"
$TunnelName = "xiaoma-openclaw"
$PublicProbeUrl = "https://ai.xiaoma.cyou/v1/chat/completions"

$NodeBin = "node"
if ($env:OPENCLAW_NODE_BIN -and (Test-Path $env:OPENCLAW_NODE_BIN)) {
  $NodeBin = $env:OPENCLAW_NODE_BIN
} elseif (Test-Path "C:\Program Files\nodejs\node.exe") {
  $NodeBin = "C:\Program Files\nodejs\node.exe"
}

$CloudflaredBin = "cloudflared"
if ($env:OPENCLAW_CLOUDFLARED_BIN -and (Test-Path $env:OPENCLAW_CLOUDFLARED_BIN)) {
  $CloudflaredBin = $env:OPENCLAW_CLOUDFLARED_BIN
} elseif (Test-Path "C:\Program Files\cloudflared\cloudflared.exe") {
  $CloudflaredBin = "C:\Program Files\cloudflared\cloudflared.exe"
}

function Write-Log([string]$Message) {
  if (-not $Quiet) {
    Write-Host "[openclaw-autostart] $Message"
  }
}

function Test-TcpPort {
  param(
    [string]$TargetHost,
    [int]$Port,
    [int]$TimeoutMs = 1400
  )

  $client = New-Object Net.Sockets.TcpClient
  try {
    $asyncResult = $client.BeginConnect($TargetHost, $Port, $null, $null)
    if (-not $asyncResult.AsyncWaitHandle.WaitOne($TimeoutMs, $false)) {
      return $false
    }
    $null = $client.EndConnect($asyncResult)
    return $true
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Get-CloudflaredTunnelProcess {
  Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -match "config-openclaw\.yml" -and
      $_.CommandLine -match "xiaoma-openclaw"
    }
}

function Start-BridgeIfNeeded {
  if (Test-TcpPort -TargetHost $BridgeHost -Port $BridgePort) {
    Write-Log "Bridge already listening on $BridgeHost`:$BridgePort"
    return $true
  }

  if (-not (Test-Path $BridgeScriptPath)) {
    Write-Log "Bridge script not found: $BridgeScriptPath"
    return $false
  }

  Write-Log "Starting OpenClaw bridge..."
  try {
    Start-Process -FilePath $NodeBin -ArgumentList "`"$BridgeScriptPath`"" -WindowStyle Hidden | Out-Null
  } catch {
    Write-Log "Bridge start failed: $($_.Exception.Message)"
    return $false
  }
  Start-Sleep -Seconds 2

  if (Test-TcpPort -TargetHost $BridgeHost -Port $BridgePort) {
    Write-Log "Bridge started"
    return $true
  }

  Write-Log "Bridge failed to start"
  return $false
}

function Start-TunnelIfNeeded {
  $running = Get-CloudflaredTunnelProcess
  if ($running) {
    Write-Log "Tunnel process already running"
    return $true
  }

  if (-not (Test-Path $TunnelConfigPath)) {
    Write-Log "Tunnel config not found: $TunnelConfigPath"
    return $false
  }

  Write-Log "Starting Cloudflare tunnel..."
  try {
    Start-Process -FilePath $CloudflaredBin -ArgumentList "tunnel", "--config", $TunnelConfigPath, "run", $TunnelName -WindowStyle Hidden | Out-Null
  } catch {
    Write-Log "Tunnel start failed: $($_.Exception.Message)"
    return $false
  }
  Start-Sleep -Seconds 2

  if (Get-CloudflaredTunnelProcess) {
    Write-Log "Tunnel started"
    return $true
  }

  Write-Log "Tunnel failed to start"
  return $false
}

function Test-PublicProbe {
  try {
    $response = Invoke-WebRequest -Uri $PublicProbeUrl -Method GET -TimeoutSec 10 -UseBasicParsing
    if ($response) {
      $statusCode = [int]$response.StatusCode
      return ($statusCode -ge 200 -and $statusCode -lt 500)
    }
    return $true
  } catch {
    $response = $_.Exception.Response
    if ($response) {
      try {
        $statusCode = [int]$response.StatusCode
      } catch {
        $statusCode = 0
      }

      if ($statusCode -in 401, 404, 405) {
        return $true
      }
    }
    return $false
  }
}

function Show-Status {
  $bridgeOk = Test-TcpPort -TargetHost $BridgeHost -Port $BridgePort
  $tunnelOk = [bool](Get-CloudflaredTunnelProcess)
  $publicOk = Test-PublicProbe

  [PSCustomObject]@{
    BridgePort               = "$BridgeHost`:$BridgePort"
    BridgeListening          = $bridgeOk
    TunnelProcessRunning     = $tunnelOk
    PublicEndpointReachable  = $publicOk
  } | Format-List | Out-String | Write-Host

  if ($bridgeOk -and $tunnelOk) {
    return 0
  }
  return 1
}

if ($Status) {
  exit (Show-Status)
}

$bridgeStarted = Start-BridgeIfNeeded
$tunnelStarted = Start-TunnelIfNeeded
Start-Sleep -Seconds 2
$publicReady = Test-PublicProbe

if ($bridgeStarted -and $tunnelStarted) {
  if (-not $publicReady) {
    Write-Log "Public endpoint probe is unstable, but local stack is running"
  }
  Write-Log "OpenClaw stack is healthy"
  exit 0
}

if (-not $publicReady) {
  Write-Log "Public endpoint probe failed: $PublicProbeUrl"
}

Write-Log "OpenClaw stack is not fully healthy"
exit 1
