[CmdletBinding()]
param(
  [switch]$SkipPackaging,
  [switch]$SkipPython
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
  $requiredDocuments = @(
    'VORN_SUBMISSION_PLAN.md',
    'VORN_APPLICATION_DRAFT.md',
    'VORN_VIDEO_SCRIPT.md',
    'VORN_ARCHITECTURE.md',
    'VORN_EVALUATION_REPORT.md',
    'VORN_LICENSES.md',
    'VORN_SECURITY_REVIEW.md',
    'VORN_SUBMISSION_README.md',
    'README.md',
    'SECURITY.md',
    'package-lock.json',
    'scripts/build-preview.ps1',
    'scripts/smoke-android.ps1'
  )
  $missingDocuments = $requiredDocuments | Where-Object {
    -not (Test-Path -LiteralPath (Join-Path $root $_))
  }
  if ($missingDocuments) {
    throw "Missing VORN submission documents: $($missingDocuments -join ', ')"
  }

  Invoke-Checked 'TypeScript typecheck' { npx tsc --noEmit }
  Invoke-Checked 'ESLint' { npm run lint }
  Invoke-Checked 'Jest' { npm test -- --runInBand --silent }

  if (-not $SkipPython) {
    $pythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if (-not $pythonCommand) {
      $pythonCommand = Get-Command py -ErrorAction SilentlyContinue
    }
    $pythonPath = $pythonCommand.Source
    if (-not $pythonPath) {
      $bundledPython = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
      if (Test-Path -LiteralPath $bundledPython) {
        $pythonPath = $bundledPython
      }
    }
    if (-not $pythonPath) {
      throw 'Python 3 is required for ML verification, or pass -SkipPython.'
    }
    Invoke-Checked 'Python ML tests' {
      & $pythonPath -m unittest discover -s ml -p 'test_*.py'
    }
  } else {
    Write-Host '== Python ML tests (skipped)' -ForegroundColor Yellow
  }

  $artifactPaths = @(
    'ml/artifacts/shake_fill_level_pilot.json',
    'ml/artifacts/shake_ice_amount_pilot.json'
  )
  foreach ($artifactPath in $artifactPaths) {
    $artifact = Get-Content (Join-Path $root $artifactPath) -Raw | ConvertFrom-Json
    if ($artifact.status -ne 'untrained' -and $artifact.status -ne 'experimental' -and $artifact.status -ne 'trained') {
      throw "$artifactPath must be explicit untrained, experimental, or trained, found: $($artifact.status)"
    }
    if ($artifact.status -eq 'trained') {
      if ($null -eq $artifact.model) {
        throw "$artifactPath is marked trained but has no model payload."
      }
      if ($null -eq $artifact.audit -or $artifact.audit.readyForTraining -ne $true) {
        throw "$artifactPath is marked trained without a passing audit.readyForTraining gate."
      }
      if ($null -eq $artifact.evaluation -or [double]$artifact.evaluation.balanced_accuracy -lt 0.67) {
        throw "$artifactPath is marked trained without balanced accuracy >= 0.67."
      }
    }
  }

  if (-not $SkipPackaging) {
    $output = Join-Path $root 'output\ColdKeep-VORN-source.zip'
    Invoke-Checked 'VORN source ZIP' {
      & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'package_vorn.ps1') -OutputPath 'output\ColdKeep-VORN-source.zip'
    }
    if (-not (Test-Path -LiteralPath $output)) {
      throw "VORN source ZIP was not generated: $output"
    }
    $entries = @(tar -tf $output)
    $requiredEntries = @(
      'VORN_SUBMISSION_PLAN.md',
      'VORN_APPLICATION_DRAFT.md',
      'VORN_VIDEO_SCRIPT.md',
      'VORN_ARCHITECTURE.md',
      'VORN_EVALUATION_REPORT.md',
      'VORN_LICENSES.md',
      'VORN_SECURITY_REVIEW.md',
      'VORN_SUBMISSION_README.md',
      'ml/artifacts/shake_fill_level_pilot.json',
      'ml/artifacts/shake_ice_amount_pilot.json',
      'ICE_AUDIO_RESEARCH.md',
      'ICE_FEATURE_ANALYSIS.md',
      'package-lock.json'
    )
    $missingEntries = $requiredEntries | Where-Object { $entries -notcontains $_ }
    if ($missingEntries) {
      throw "VORN source ZIP is missing: $($missingEntries -join ', ')"
    }
    $forbiddenEntries = $entries | Where-Object {
      $_ -match '(^|/)(node_modules|dataset|output|tmp|\.git|\.expo|\.bundle|__pycache__|build|dist|jniLibs)(/|$)' -or
      $_ -match '(^|/)(local\.properties|\.env(\..*)?|google-services\.json)$' -or
      $_ -match '\.(apk|zip|keystore|jks|p12|pem)$'
    }
    if ($forbiddenEntries) {
      throw "VORN source ZIP contains forbidden entries: $($forbiddenEntries -join ', ')"
    }
    Get-FileHash -LiteralPath $output -Algorithm SHA256
  } else {
    Write-Host '== VORN source ZIP (skipped)' -ForegroundColor Yellow
  }

  Write-Host 'VORN submission verification completed.' -ForegroundColor Green
} finally {
  Pop-Location
}
