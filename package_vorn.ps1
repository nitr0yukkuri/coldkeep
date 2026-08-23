param(
  [string]$OutputPath = "output\ColdKeep-VORN-source.zip"
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '.')).Path
$packager = Join-Path $root 'package_u22.ps1'

if (-not (Test-Path -LiteralPath $packager)) {
  throw "Shared source packager not found: $packager"
}

# The staging rules are contest-neutral; only the output name is VORN-specific.
& powershell -NoProfile -ExecutionPolicy Bypass -File $packager -OutputPath $OutputPath
if ($LASTEXITCODE -ne 0) {
  throw "VORN source packaging failed with exit code $LASTEXITCODE"
}
