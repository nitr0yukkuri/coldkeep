[CmdletBinding()]
param(
  [switch]$SkipAndroid,
  [switch]$SkipPackaging
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

function Invoke-Checked {
  param(
    [string]$Label,
    [scriptblock]$Command
  )
  Write-Host "== $Label" -ForegroundColor Cyan
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Label failed with exit code $LASTEXITCODE"
  }
}

Push-Location $root
try {
  Invoke-Checked 'TypeScript typecheck' { npx tsc --noEmit }
  Invoke-Checked 'ESLint' { npm run lint }
  Invoke-Checked 'Jest' { npm test -- --runInBand --silent }

  $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
  if ($pythonCommand) {
    $pythonPath = $pythonCommand.Source
  } else {
    $pyLauncher = Get-Command py -ErrorAction SilentlyContinue
    if ($pyLauncher) {
      $pythonPath = $pyLauncher.Source
    } else {
      $bundled = 'C:\Users\2250126\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
      if (Test-Path -LiteralPath $bundled) {
        $pythonPath = $bundled
      } else {
        throw 'Python 3 is required for ML verification.'
      }
    }
  }
  Invoke-Checked 'Python ML tests' { & $pythonPath -m unittest discover -s ml -p 'test_*.py' }

  $cargoCommand = Get-Command cargo -ErrorAction SilentlyContinue
  if ($cargoCommand) {
    Push-Location (Join-Path $root 'rust/coldkeep_ml')
    try {
      Invoke-Checked 'Rust tests' { & $cargoCommand.Source test --manifest-path (Join-Path (Get-Location).Path 'Cargo.toml') }
    } finally {
      Pop-Location
    }
  } else {
    Write-Host '== Rust tests (skipped: cargo is not installed)' -ForegroundColor Yellow
  }

  Push-Location (Join-Path $root 'expo-go')
  try {
    Invoke-Checked 'Expo Go typecheck' { npm run typecheck }
    Invoke-Checked 'Expo Go iOS export' { npx expo export --platform ios }
    Invoke-Checked 'Expo Go Android export' { npx expo export --platform android }
  } finally {
    Pop-Location
  }

  if (-not $SkipAndroid) {
    Push-Location (Join-Path $root 'android')
    try {
      Invoke-Checked 'Android debug APK' {
        & .\gradlew.bat :app:assembleDebug --no-daemon --console=plain
      }
    } finally {
      Pop-Location
    }
  } else {
    Write-Host '== Android APK (skipped)' -ForegroundColor Yellow
  }

  if (-not $SkipPackaging) {
    Invoke-Checked 'Submission source ZIP' {
      & powershell -ExecutionPolicy Bypass -File (Join-Path $root 'package_u22.ps1')
    }
    $zip = Join-Path $root 'output\ColdKeep-U22-source.zip'
    $entries = @(tar -tf $zip)
    $forbidden = $entries | Where-Object {
      $_ -match '(^|/)(node_modules|dataset|output|tmp|\.git|\.expo|\.bundle|__pycache__|build|dist)(/|$)' -or
      $_ -match '(^|/)(local\.properties|\.env(\..*)?|google-services\.json)$' -or
      $_ -match '\.(apk|zip|keystore|jks|p12|pem)$'
    }
    if ($forbidden) {
      $forbidden | ForEach-Object { Write-Error "Forbidden ZIP entry: $_" }
      throw 'Submission ZIP contains excluded files.'
    }
    $required = @(
      'SUBMISSION_README.md',
      'README.md',
      'SECURITY.md',
      'U22_ARCHITECTURE.md',
      'U22_EVALUATION_REPORT.md',
      'U22_LICENSES.md',
      'U22_VIDEO_SCRIPT.md',
      'ml/artifacts/public_audio_baseline.json',
      'android/app/src/main/AndroidManifest.xml',
      'expo-go/App.tsx',
      'expo-go/package-lock.json',
      'ios/ColdKeep/Info.plist',
      'rust/coldkeep_ml/Cargo.toml',
      '.github/workflows/quality.yml',
      'package-lock.json'
    )
    $missing = $required | Where-Object { $entries -notcontains $_ }
    if ($missing) {
      $missing | ForEach-Object { Write-Error "Missing required ZIP entry: $_" }
      throw 'Submission ZIP is missing a required source or evidence file.'
    }
    Write-Host "Verified source ZIP entries ($($entries.Count) files)." -ForegroundColor Green
    Get-FileHash -LiteralPath $zip -Algorithm SHA256
  } else {
    Write-Host '== Submission source ZIP (skipped)' -ForegroundColor Yellow
  }

  Write-Host 'Submission verification completed.' -ForegroundColor Green
} finally {
  Pop-Location
}
