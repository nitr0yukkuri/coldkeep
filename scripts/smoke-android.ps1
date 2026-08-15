[CmdletBinding()]
param(
  [string]$ApkPath = 'output\ColdKeep-u22-current-preview.apk',
  [string]$Serial,
  [switch]$ResetApp,
  [string]$EvidenceDirectory = 'tmp\android-smoke'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$resolvedApk = (Resolve-Path (Join-Path $root $ApkPath)).Path
$evidence = Join-Path $root $EvidenceDirectory
$packageName = 'com.anonymous.coldkeep'

$adbCommand = Get-Command adb -ErrorAction SilentlyContinue
if (-not $adbCommand -and $env:ANDROID_HOME) {
  $androidAdb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'
  if (Test-Path -LiteralPath $androidAdb) {
    $adbCommand = Get-Command $androidAdb
  }
}
if (-not $adbCommand) {
  throw 'adb is required. Add Android platform-tools to PATH or set ANDROID_HOME.'
}
$adb = $adbCommand.Source

New-Item -ItemType Directory -Force -Path $evidence | Out-Null
$suffix = if ($Serial) { "-$Serial" } else { '' }
$reportPath = Join-Path $evidence ("smoke-report$suffix.txt")
$logPath = Join-Path $evidence ("logcat$suffix.txt")
$screenshotPath = Join-Path $evidence ("screen$suffix.png")

function Invoke-Adb {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)
  $effective = @()
  if ($Serial) {
    $effective += @('-s', $Serial)
  }
  $effective += $Arguments
  $previousErrorAction = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $result = @(& $adb @effective 2>&1)
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorAction
  }
  if ($exitCode -ne 0) {
    throw "adb $($Arguments -join ' ') failed: $($result -join [Environment]::NewLine)"
  }
  return $result | ForEach-Object { $_.ToString() }
}

$state = (Invoke-Adb @('get-state') | Select-Object -First 1).ToString().Trim()
if ($state -ne 'device') {
  throw "Selected Android target is not online (state: '$state'). Run 'adb devices' and wait for 'device'."
}

$apkHash = Get-FileHash -LiteralPath $resolvedApk -Algorithm SHA256
if ($ResetApp) {
  Invoke-Adb @('uninstall', $packageName) | Out-Null
}
Invoke-Adb @('install', '-r', $resolvedApk) | Out-Null
Invoke-Adb @('shell', 'monkey', '-p', $packageName, '1') | Out-Null
Start-Sleep -Seconds 3

$activity = Invoke-Adb @('shell', 'dumpsys', 'activity', 'activities') |
  Select-String -Pattern $packageName | Select-Object -First 3
Invoke-Adb @('logcat', '-d', '-t', '300') | Set-Content -LiteralPath $logPath -Encoding utf8

$remoteScreenshot = '/sdcard/coldkeep-smoke.png'
Invoke-Adb @('shell', 'screencap', '-p', $remoteScreenshot) | Out-Null
Invoke-Adb @('pull', $remoteScreenshot, $screenshotPath) | Out-Null
Invoke-Adb @('shell', 'rm', $remoteScreenshot) | Out-Null

@(
  "timestamp_utc=$([DateTime]::UtcNow.ToString('o'))"
  "serial=$Serial"
  "package=$packageName"
  "apk=$resolvedApk"
  "apk_sha256=$($apkHash.Hash)"
  "activity_matches=$($activity -join ' | ')"
  "screenshot=$screenshotPath"
  "logcat=$logPath"
) | Set-Content -LiteralPath $reportPath -Encoding utf8

Write-Host "Android smoke passed: $reportPath" -ForegroundColor Green
Write-Host "Screenshot: $screenshotPath" -ForegroundColor Green
Write-Host "Logcat: $logPath" -ForegroundColor Green
