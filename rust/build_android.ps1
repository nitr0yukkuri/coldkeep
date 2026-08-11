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
  cargo ndk -t $architecture -o $destination build --manifest-path (Join-Path $crate 'Cargo.toml') --release
  if ($LASTEXITCODE -ne 0) {
    throw "Rust Android build failed for $architecture"
  }
}

Write-Output "Rust libraries written to $destination"
