param(
  [string[]]$Architectures = @('arm64-v8a', 'armeabi-v7a', 'x86_64')
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$crate = Join-Path $PSScriptRoot 'coldkeep_ml'
$destination = Join-Path $root 'android/app/src/main/jniLibs'

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  throw 'Rust/Cargo is required. Install rustup from https://rustup.rs/.'
}
if (-not (Get-Command cargo-ndk -ErrorAction SilentlyContinue)) {
  throw 'cargo-ndk is required: cargo install cargo-ndk'
}

foreach ($architecture in $Architectures) {
  Push-Location $crate
  try {
    cargo ndk -t $architecture -o $destination build --release
    if ($LASTEXITCODE -ne 0) {
      throw "Rust Android build failed for $architecture"
    }
  } finally {
    Pop-Location
  }
}

Write-Output "Rust libraries written to $destination"
