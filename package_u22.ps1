param(
  [string]$OutputPath = "output\ColdKeep-U22-source.zip"
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '.')).Path
$output = Join-Path $root $OutputPath
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ("coldkeep-u22-" + [guid]::NewGuid().ToString('N'))

$excludeNames = @(
  '.git', '.expo', '.bundle', 'node_modules', 'dataset', 'output', 'tmp',
  'build', 'dist', '.gradle', '.cxx', 'Pods', 'DerivedData', 'coverage', '__pycache__'
)
$excludeFiles = @(
  '*.apk', '*.zip', '.env', '.env.*', '*.keystore', '*.jks', '*.p12', '*.pem',
  'google-services.json', 'local.properties'
)

try {
  New-Item -ItemType Directory -Path $stage -Force | Out-Null
  Get-ChildItem -LiteralPath $root -File -Force |
    Where-Object {
      $fileName = $_.Name
      -not ($excludeFiles | Where-Object { $fileName -like $_ })
    } |
    ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $stage $_.Name) -Force }
  foreach ($directoryName in @('.github', 'android', 'expo-go', 'ios', 'ml', 'rust', 'src', '__tests__')) {
    $sourceDirectory = Join-Path $root $directoryName
    if (Test-Path -LiteralPath $sourceDirectory) {
      $destinationDirectory = Join-Path $stage $directoryName
      $excludedDirectories = @(
        Get-ChildItem -LiteralPath $sourceDirectory -Directory -Recurse -Force |
          Where-Object { $excludeNames -contains $_.Name } |
          Select-Object -ExpandProperty FullName
      )
      $robocopyArgs = @(
        $sourceDirectory,
        $destinationDirectory,
        '/E', '/NFL', '/NDL', '/NJH', '/NJS',
        '/XD'
      ) + $excludedDirectories + @('/XF') + $excludeFiles
      & robocopy @robocopyArgs | Out-Null
      if ($LASTEXITCODE -gt 7) {
        throw "Failed to stage $directoryName (robocopy exit $LASTEXITCODE)"
      }
    }
  }
  Get-ChildItem -LiteralPath $stage -Directory -Recurse -Force |
    Where-Object { $excludeNames -contains $_.Name } |
    Sort-Object { $_.FullName.Length } -Descending |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }

  New-Item -ItemType Directory -Path (Split-Path -Parent $output) -Force | Out-Null
  if (Test-Path -LiteralPath $output) {
    Remove-Item -LiteralPath $output -Force
  }
  Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $output -CompressionLevel Optimal
  Get-FileHash -LiteralPath $output -Algorithm SHA256
}
finally {
  if (Test-Path -LiteralPath $stage) {
    Remove-Item -LiteralPath $stage -Recurse -Force
  }
}
