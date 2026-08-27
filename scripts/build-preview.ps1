[CmdletBinding()]
param(
  [string]$OutputPath = 'output\ColdKeep-u22-current-preview.apk'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$gradle = Join-Path $root 'android\gradlew.bat'
$apk = Join-Path $root 'android\app\build\outputs\apk\preview\app-preview.apk'
$resolvedOutput = Join-Path $root $OutputPath

if (-not (Test-Path -LiteralPath $gradle)) {
  throw "Gradle wrapper not found: $gradle"
}

$keytoolCommand = Get-Command keytool -ErrorAction SilentlyContinue
$keytoolCandidates = @()
if ($env:JAVA_HOME) {
  $keytoolCandidates += Join-Path $env:JAVA_HOME 'bin\keytool.exe'
}
$keytoolCandidates += 'C:\Program Files\Android\Android Studio\jbr\bin\keytool.exe'
if (-not $keytoolCommand) {
  foreach ($candidate in $keytoolCandidates) {
    if (Test-Path -LiteralPath $candidate) {
      $keytoolCommand = Get-Command $candidate
      break
    }
  }
}
if (-not $keytoolCommand) {
  throw 'keytool is required. Install a JDK or set JAVA_HOME.'
}

$temporaryDirectory = Join-Path ([IO.Path]::GetTempPath()) ("coldkeep-preview-" + [guid]::NewGuid().ToString('N'))
$storeFile = Join-Path $temporaryDirectory 'coldkeep-preview.jks'
$storePasswordBytes = New-Object byte[] 32
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $random.GetBytes($storePasswordBytes)
} finally {
  $random.Dispose()
}
$storePassword = [BitConverter]::ToString($storePasswordBytes).Replace('-', '').ToLowerInvariant()

New-Item -ItemType Directory -Force -Path $temporaryDirectory | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $resolvedOutput) | Out-Null

try {
  $previousAppMode = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_APP_MODE', 'Process')
  $previousMlPreview = [Environment]::GetEnvironmentVariable('EXPO_PUBLIC_ML_PREVIEW', 'Process')
  $previousNativeBundle = [Environment]::GetEnvironmentVariable('COLDKEEP_NATIVE_BUNDLE', 'Process')
  # Preview is an explicitly labelled research demo; production builds never set these.
  $env:EXPO_PUBLIC_APP_MODE = 'demo'
  $env:EXPO_PUBLIC_ML_PREVIEW = 'research'
  $env:COLDKEEP_NATIVE_BUNDLE = '1'
  & $keytoolCommand.Source -genkeypair -v `
    -keystore $storeFile `
    -storepass $storePassword `
    -keypass $storePassword `
    -alias coldkeep-preview `
    -keyalg RSA `
    -keysize 2048 `
    -validity 1 `
    -dname 'CN=ColdKeep Local Preview,OU=ColdKeep,O=ColdKeep,C=JP'
  if ($LASTEXITCODE -ne 0) {
    throw "keytool failed with exit code $LASTEXITCODE"
  }

  $env:COLDKEEP_PREVIEW_STORE_FILE = $storeFile
  $env:COLDKEEP_PREVIEW_STORE_PASSWORD = $storePassword
  $env:COLDKEEP_PREVIEW_KEY_ALIAS = 'coldkeep-preview'
  $env:COLDKEEP_PREVIEW_KEY_PASSWORD = $storePassword

  Push-Location (Join-Path $root 'android')
  try {
    & $gradle :app:assemblePreview --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) {
      throw "Gradle Preview build failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  if (-not (Test-Path -LiteralPath $apk)) {
    throw "Preview APK was not generated: $apk"
  }
  Copy-Item -LiteralPath $apk -Destination $resolvedOutput -Force
  $hash = Get-FileHash -LiteralPath $resolvedOutput -Algorithm SHA256
  $hashFile = "$resolvedOutput.sha256.txt"
  "$($hash.Hash)  $([IO.Path]::GetFileName($resolvedOutput))" | Set-Content -LiteralPath $hashFile -Encoding ascii

  Write-Host "Preview APK: $resolvedOutput" -ForegroundColor Green
  Write-Host "SHA-256: $($hash.Hash)" -ForegroundColor Green
} finally {
  Remove-Item Env:COLDKEEP_PREVIEW_STORE_FILE -ErrorAction SilentlyContinue
  Remove-Item Env:COLDKEEP_PREVIEW_STORE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:COLDKEEP_PREVIEW_KEY_ALIAS -ErrorAction SilentlyContinue
  Remove-Item Env:COLDKEEP_PREVIEW_KEY_PASSWORD -ErrorAction SilentlyContinue
  if ($null -eq $previousAppMode) {
    Remove-Item Env:EXPO_PUBLIC_APP_MODE -ErrorAction SilentlyContinue
  } else {
    $env:EXPO_PUBLIC_APP_MODE = $previousAppMode
  }
  if ($null -eq $previousNativeBundle) {
    Remove-Item Env:COLDKEEP_NATIVE_BUNDLE -ErrorAction SilentlyContinue
  } else {
    $env:COLDKEEP_NATIVE_BUNDLE = $previousNativeBundle
  }
  if ($null -eq $previousMlPreview) {
    Remove-Item Env:EXPO_PUBLIC_ML_PREVIEW -ErrorAction SilentlyContinue
  } else {
    $env:EXPO_PUBLIC_ML_PREVIEW = $previousMlPreview
  }
  if (Test-Path -LiteralPath $temporaryDirectory) {
    Remove-Item -LiteralPath $temporaryDirectory -Recurse -Force
  }
}
