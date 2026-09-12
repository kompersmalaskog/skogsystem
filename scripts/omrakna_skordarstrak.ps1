<#
.SYNOPSIS
  Nattlig omräkning av skördarstråk (tabellen `skordarstrak`) ur detalj_gps_spar.

.DESCRIPTION
  Kör som schemalagd uppgift (02:30 dagligen) på import-maskinen. Omräkningen är annars en
  ENGÅNGS-batch (scripts/berakna_skordarstrak.py) som blir stale allt eftersom ny skördare-GPS
  tickar in via importen — nya/pågående objekt saknar stråk tills skriptet körs om. Det här körar-
  skriptet gör om-körningen automatisk.

  Skriptet är:
    - Frånkopplat importflödet (rör inte skogsmaskin_import_version_6.py / auto_import_watch.py).
    - Idempotent (berakna_skordarstrak.py raderar + skriver om per objekt).
    - Loggat: EN rad per körning till logs\skordarstrak_omrakning.log, så en TYST död syns
      (jfr pg_cron-Fortnox som dog tyst utan att någon märkte det).

  Läser Supabase-nycklar ur samma .env.local som importen. Kör python-beräkningen och tolkar dess
  KLART-rad till en kort loggrad: "OK · N objekt · M stråk · K fel".

  Registreras EN gång med Register-ScheduledTask (StartWhenAvailable → kör så snart som möjligt om
  02:30-starten missats, t.ex. om maskinen var av). Se PR-beskrivningen för kommandot.

.NOTES
  Körs INTE av bygget/appen — fristående drift-skript. Ingen påverkan på Next-bygget.
#>
$ErrorActionPreference = 'Stop'

$Root    = 'C:\skogsystem-import'                                   # import-klonen (git reset --hard origin/main → scripts/ finns här)
$Script  = Join-Path $Root 'scripts\berakna_skordarstrak.py'
$EnvFile = Join-Path $Root '.env.local'
$LogDir  = Join-Path $Root 'logs'
$Log     = Join-Path $LogDir 'skordarstrak_omrakning.log'
$Ts      = Get-Date -Format 'yyyy-MM-dd HH:mm'

if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
function Logga([string]$msg) { Add-Content -Path $Log -Value "$Ts · $msg" -Encoding utf8 }

# Hitta python (importen kör pythonw → Python finns; PATH-namnet kan vara python eller py).
function Losa-Python {
    foreach ($c in @('python', 'python3')) {
        $p = (Get-Command $c -ErrorAction SilentlyContinue)
        if ($p) { return $p.Source }
    }
    if (Get-Command 'py' -ErrorAction SilentlyContinue) { return 'py' }   # py-launchern
    return $null
}

try {
    if (-not (Test-Path $Script))  { Logga "FEL · beräkningsskriptet saknas ($Script)"; exit 1 }
    if (-not (Test-Path $EnvFile)) { Logga "FEL · .env.local saknas ($EnvFile)"; exit 1 }
    $py = Losa-Python
    if (-not $py) { Logga "FEL · hittar ingen python på maskinen (python/python3/py)"; exit 1 }

    # Supabase-nycklar ur .env.local (samma nycklar som importen; berakna_skordarstrak.py läser dem).
    foreach ($l in (Get-Content $EnvFile -Encoding utf8)) {
        if ($l -match '^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*(.+?)\s*$')  { $env:NEXT_PUBLIC_SUPABASE_URL  = $matches[1] }
        if ($l -match '^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*(.+?)\s*$') { $env:SUPABASE_SERVICE_ROLE_KEY = $matches[1] }
    }
    if (-not $env:NEXT_PUBLIC_SUPABASE_URL -or -not $env:SUPABASE_SERVICE_ROLE_KEY) {
        Logga "FEL · saknar NEXT_PUBLIC_SUPABASE_URL eller SUPABASE_SERVICE_ROLE_KEY i .env.local"; exit 1
    }

    # Kör beräkningen (alla objekt, idempotent). stderr slås ihop med stdout för loggtolkning.
    $out = & $py $Script 2>&1
    $klart = ($out | Select-String -Pattern '^KLART:' | Select-Object -Last 1)
    $felObjekt = ($out | Select-String -Pattern ': FEL \(').Count   # per-objekt-fel som skriptet hoppade över

    if ($LASTEXITCODE -eq 0 -and $klart) {
        $objekt = '?'; $strak = '?'
        if ($klart.ToString() -match 'KLART:\s*(\d+)\s*objekt,\s*(\d+)\s*stråk') { $objekt = $matches[1]; $strak = $matches[2] }
        Logga "OK · $objekt objekt · $strak stråk · $felObjekt fel-objekt"
        exit 0
    } else {
        $svans = ($out | Select-Object -Last 3) -join ' | '
        Logga "KRASCH · exit=$LASTEXITCODE · $svans"
        exit 1
    }
} catch {
    Logga "UNDANTAG · $($_.Exception.Message)"
    exit 1
}
