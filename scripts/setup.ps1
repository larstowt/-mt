# Opsaetning af AI-medarbejdere paa Windows.
# Koeres med:  powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

Write-Host ''
Write-Host 'AI-medarbejdere - opsaetning' -ForegroundColor White
Write-Host ''

# ---------------------------------------------------------------- 1. Node-tjek
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Host 'Node er ikke installeret.' -ForegroundColor Red
  Write-Host 'Hent LTS-versionen paa https://nodejs.org og koer dette script igen.'
  exit 1
}

$nodeVersion = (node -v)
& node -e 'const [maj, min] = process.versions.node.split(".").map(Number); process.exit(maj > 20 || (maj === 20 && min >= 12) ? 0 : 1)'
if ($LASTEXITCODE -ne 0) {
  Write-Host "Node $nodeVersion er for gammel - der skal bruges 20.12 eller nyere." -ForegroundColor Red
  Write-Host 'Hent LTS-versionen paa https://nodejs.org og koer dette script igen.'
  exit 1
}
Write-Host "OK  Node $nodeVersion" -ForegroundColor Green

# ------------------------------------------------------------------- 2. .env
if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
  Write-Host 'OK  Oprettede .env' -ForegroundColor Green
} else {
  Write-Host 'OK  .env findes allerede' -ForegroundColor Green
}

function Set-EnvKey($name, $value) {
  $lines = Get-Content '.env'
  $done = $false
  $out = foreach ($line in $lines) {
    if ($line -match "^$name=") { "$name=$value"; $done = $true } else { $line }
  }
  if (-not $done) { $out += "$name=$value" }
  Set-Content '.env' $out -Encoding UTF8
}

# ---------------------------------------------------------------- 3. API-noegle
$hasKey = (Get-Content '.env') -match '^(ANTHROPIC_API_KEY|XAI_API_KEY|OPENAI_API_KEY)=.+'
if ($hasKey) {
  Write-Host 'OK  Der er allerede en API-noegle i .env' -ForegroundColor Green
} else {
  Write-Host ''
  Write-Host 'Hvilken model skal medarbejderne bruge?'
  Write-Host '  1) Anthropic - Claude      console.anthropic.com'
  Write-Host '  2) xAI - Grok              console.x.ai'
  Write-Host '  3) OpenAI eller lignende   platform.openai.com'
  Write-Host '  4) Spring over - koer i demo-tilstand med simulerede svar'
  Write-Host ''
  $choice = Read-Host 'Vaelg [1-4]'

  $keyName = switch ($choice) {
    '1' { 'ANTHROPIC_API_KEY' }
    '2' { 'XAI_API_KEY' }
    '3' { 'OPENAI_API_KEY' }
    default { '' }
  }

  if ($keyName) {
    $secure = Read-Host 'Indsaet din noegle (den vises ikke mens du skriver)' -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
    if ($plain -and $plain.Trim()) {
      Set-EnvKey $keyName $plain.Trim()
      Write-Host "OK  Gemte $keyName i .env" -ForegroundColor Green
    } else {
      Write-Host '!   Ingen noegle indtastet - koerer i demo-tilstand' -ForegroundColor Yellow
    }
  } else {
    Write-Host '!   Koerer i demo-tilstand. Du kan altid saette en noegle i .env senere.' -ForegroundColor Yellow
  }
}

# ------------------------------------------------------------------- 4. Start
$port = if ($env:PORT) { $env:PORT } else { '4173' }
$url = "http://127.0.0.1:$port"

Write-Host ''
Write-Host "Klar. Starter paa $url  (Ctrl+C for at stoppe)" -ForegroundColor Green
Write-Host ''

Start-Job -ScriptBlock {
  param($u)
  for ($i = 0; $i -lt 40; $i++) {
    try { Invoke-WebRequest "$u/api/state" -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process $u; break }
    catch { Start-Sleep -Milliseconds 250 }
  }
} -ArgumentList $url | Out-Null

npm start
