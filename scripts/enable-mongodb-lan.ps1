param([string]$ServerName)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$logPath = Join-Path $root '.mongo-lan-setup.log'
$configPath = 'C:\Program Files\MongoDB\Server\8.0\bin\mongod.cfg'
$backupPath = "$configPath.farmavida-backup"
$keyPath = 'C:\Program Files\MongoDB\Server\8.0\bin\farmavida.key'

try {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Execute como administrador.'
  }
  if ($ServerName -notmatch '^[A-Za-z0-9-]+$') { throw 'Nome de servidor inválido.' }
  if (-not (Test-Path -LiteralPath $configPath)) { throw 'mongod.cfg não encontrado.' }
  if (Test-Path -LiteralPath $backupPath) { throw 'Já existe um backup da configuração. Verifique antes de repetir.' }
  $service = Get-Service -Name MongoDB -ErrorAction Stop
  $original = Get-Content -LiteralPath $configPath -Raw
  if ($original -match '(?m)^security:\s*$') { throw 'A segurança do MongoDB já está configurada.' }
  if ($original -notmatch '(?m)^\s+bindIp:\s*127\.0\.0\.1\s*$') { throw 'A configuração bindIp mudou. Verifique manualmente.' }

  Copy-Item -LiteralPath $configPath -Destination $backupPath
  $keyBytes = [byte[]]::new(384)
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($keyBytes)
  $rng.Dispose()
  [IO.File]::WriteAllText($keyPath, [Convert]::ToBase64String($keyBytes), [Text.Encoding]::ASCII)
  $updated = [regex]::Replace($original, '(?m)^\s+bindIp:\s*127\.0\.0\.1\s*$', "  bindIp: 127.0.0.1,$ServerName")
  $updated = $updated.TrimEnd() + "`r`nsecurity:`r`n  keyFile: 'C:/Program Files/MongoDB/Server/8.0/bin/farmavida.key'`r`n"

  try {
    if ($service.Status -ne 'Stopped') { Stop-Service -Name MongoDB -Force }
    [IO.File]::WriteAllText($configPath, $updated, [Text.UTF8Encoding]::new($false))
    Start-Service -Name MongoDB
    $service = Get-Service -Name MongoDB
    $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
  } catch {
    Copy-Item -LiteralPath $backupPath -Destination $configPath -Force
    Start-Service -Name MongoDB -ErrorAction SilentlyContinue
    throw "Falha ao reiniciar com autenticação. Configuração restaurada: $($_.Exception.Message)"
  }

  if (-not (Get-NetFirewallRule -DisplayName 'FarmaVida MongoDB LAN' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'FarmaVida MongoDB LAN' -Direction Inbound -Action Allow `
      -Protocol TCP -LocalPort 27017 -RemoteAddress LocalSubnet -Program 'C:\Program Files\MongoDB\Server\8.0\bin\mongod.exe' | Out-Null
  }
  "OK: MongoDB em execução e porta liberada apenas para a sub-rede local. Backup: $backupPath" | Set-Content -LiteralPath $logPath
} catch {
  "ERRO: $($_.Exception.Message)" | Set-Content -LiteralPath $logPath
  exit 1
}
