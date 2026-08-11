[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$defaultReleaseDir = Join-Path $env:LOCALAPPDATA 'ColdKeep\release'
$storeFile = if ($env:COLDKEEP_RELEASE_STORE_FILE) {
  $env:COLDKEEP_RELEASE_STORE_FILE
} else {
  Join-Path $defaultReleaseDir 'coldkeep-release.keystore'
}

if (-not (Test-Path -LiteralPath $storeFile)) {
  throw "Release keystore was not found: $storeFile"
}

$storePassword = $env:COLDKEEP_RELEASE_STORE_PASSWORD
if (-not $storePassword) {
  $passwordFile = Join-Path $defaultReleaseDir 'password.dpapi'
  if (-not (Test-Path -LiteralPath $passwordFile)) {
    throw 'Set COLDKEEP_RELEASE_STORE_PASSWORD or provide the DPAPI password file.'
  }

  $protectedPassword = (Get-Content -LiteralPath $passwordFile -Raw).Trim()
  $securePassword = ConvertTo-SecureString -String $protectedPassword
  $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
  try {
    $storePassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
  }
}

$previous = @{
  COLDKEEP_RELEASE_STORE_FILE = $env:COLDKEEP_RELEASE_STORE_FILE
  COLDKEEP_RELEASE_STORE_PASSWORD = $env:COLDKEEP_RELEASE_STORE_PASSWORD
  COLDKEEP_RELEASE_KEY_ALIAS = $env:COLDKEEP_RELEASE_KEY_ALIAS
  COLDKEEP_RELEASE_KEY_PASSWORD = $env:COLDKEEP_RELEASE_KEY_PASSWORD
}

try {
  $env:COLDKEEP_RELEASE_STORE_FILE = $storeFile
  $env:COLDKEEP_RELEASE_STORE_PASSWORD = $storePassword
  if (-not $env:COLDKEEP_RELEASE_KEY_ALIAS) {
    $env:COLDKEEP_RELEASE_KEY_ALIAS = 'coldkeep'
  }
  if (-not $env:COLDKEEP_RELEASE_KEY_PASSWORD) {
    $env:COLDKEEP_RELEASE_KEY_PASSWORD = $storePassword
  }

  Push-Location (Join-Path $repoRoot 'android')
  try {
    & .\gradlew.bat :app:assembleRelease --no-daemon --console=plain
    if ($LASTEXITCODE -ne 0) {
      throw "Gradle release build failed with exit code $LASTEXITCODE"
    }
  } finally {
    Pop-Location
  }

  $apk = Join-Path $repoRoot 'android\app\build\outputs\apk\release\app-release.apk'
  Get-FileHash -LiteralPath $apk -Algorithm SHA256
} finally {
  foreach ($name in $previous.Keys) {
    if ($null -eq $previous[$name]) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item "Env:$name" $previous[$name]
    }
  }
  Remove-Variable storePassword -ErrorAction SilentlyContinue
}
