$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$outputDirectory = Join-Path $root 'dist'
$output = Join-Path $outputDirectory 'farmavida-terminal.zip'
$items = @(
  (Join-Path $root 'src'),
  (Join-Path $root 'package.json'),
  (Join-Path $root 'package-lock.json'),
  (Join-Path $root '.env')
)
foreach ($item in $items) {
  if (-not (Test-Path -LiteralPath $item)) { throw "Arquivo necessário não encontrado: $item" }
}
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
Compress-Archive -LiteralPath $items -DestinationPath $output -Force
Write-Output "Pacote criado em: $output"
