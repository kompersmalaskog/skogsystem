<#
.SYNOPSIS
  Deployar importkoden till drift (C:\skogsystem-import) -- ETT kommando i stallet for handarbete.

.DESCRIPTION
  Bakgrund: deploy-klonen hade drivit isar fran main (stod pa #84 med losa handpatchar)
  utan att nagon markte det -- "kod som finns men inte galler". Detta skript gor deployen
  deterministisk och vagrar kasta handpatchar tyst.

  Steg:
    1. git fetch i deploy-klonen
    2. SKYDD: okommitterad diff -> skriv ut och AVBRYT (kor om med -Force for att
       medvetet skriva over). Handpatchar ska upptackas och forklaras, aldrig tyst kastas.
    3. Stoppa enligt watchdog-disciplinen: Disable task (inte bara Stop) ->
       stoppa pythonw -> verifiera 0
    4. git reset --hard origin/main (otrackade/ignorerade filer som .env.local rors inte)
    5. Verifiera att importfilerna ar byte-identiska med origin/main (git hash-object)
    6. Enable + starta tasken, verifiera att den KORANDE watchdogen loggar ratt
       git-sha ("Version: git=...") och att exakt 1 pythonw kor

  Faller nagot steg -> rott besked + exit 1. Ar watchdogen redan stoppad nar felet
  intraffar sags det uttryckligen -- inget halvdeployat lage gar obemarkt.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\deploy_import.ps1
  powershell -ExecutionPolicy Bypass -File .\deploy_import.ps1 -Force
#>
param(
    [switch]$Force,
    [string]$DeployDir = 'C:\skogsystem-import',
    [string]$TaskName  = 'Skogsystem Auto Import'
)

$ErrorActionPreference = 'Stop'

# Filerna som utgor importkoden i drift -- verifieras byte for byte efter reset.
# HALL I SYNK med DRIFT_FILER i gap_check.py.
$ImportFiler = @('skogsmaskin_import_version_6.py', 'import_hpr.py',
                 'auto_import_watch.py', 'gap_check.py')

$script:WatchdogStoppad = $false

function Steg($t) { Write-Host "`n== $t ==" -ForegroundColor Cyan }
function Fel($msg) {
    Write-Host "STOPP: $msg" -ForegroundColor Red
    if ($script:WatchdogStoppad) {
        Write-Host ("OBS: watchdogen AR STOPPAD (tasken '$TaskName' disabled). " +
                    "Atgarda felet och kor om skriptet, eller starta manuellt: " +
                    "Enable-ScheduledTask -TaskName '$TaskName'; Start-ScheduledTask -TaskName '$TaskName'") -ForegroundColor Yellow
    }
    exit 1
}

# -- 0. Forkontroller --
if (-not (Test-Path (Join-Path $DeployDir '.git'))) { Fel "$DeployDir ar inte ett git-repo" }
try { Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop | Out-Null }
catch { Fel "Schemalagda tasken '$TaskName' finns inte" }

# -- 1. Hamta origin/main --
Steg '1/6 git fetch'
git -C $DeployDir fetch origin --quiet
if ($LASTEXITCODE -ne 0) { Fel 'git fetch misslyckades (natverk? credentials?)' }
$mal = (git -C $DeployDir rev-parse --short origin/main).Trim()
Write-Host "origin/main = $mal"

# -- 2. Skydd mot tyst kastade handpatchar --
Steg '2/6 diff-skydd'
$dirty = git -C $DeployDir status --porcelain
if ($dirty) {
    Write-Host 'Deploy-klonen har okommitterade andringar:' -ForegroundColor Yellow
    git -C $DeployDir status --short
    git -C $DeployDir diff --stat
    if (-not $Force) {
        Fel 'Avbryter -- granska diffen ovan (handpatchar kastas ALDRIG tyst). Medvetet overskrivande: kor om med -Force.'
    }
    Write-Host '-Force angivet -- andringarna ovan skrivs over.' -ForegroundColor Yellow
} else {
    Write-Host 'Rent working tree.'
}

# -- 3. Stoppa enligt watchdog-disciplinen --
Steg '3/6 stoppa watchdogen'
$importJobb = Get-CimInstance Win32_Process -Filter "Name='python.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match [regex]::Escape($DeployDir) }
if ($importJobb) { Fel "Ett importjobb kor just nu (python.exe i $DeployDir) -- vanta tills det ar klart och kor om." }
Disable-ScheduledTask -TaskName $TaskName | Out-Null
$script:WatchdogStoppad = $true
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Get-Process pythonw -ErrorAction SilentlyContinue | ForEach-Object {
    Write-Host "Stoppar pythonw PID $($_.Id)"
    Stop-Process -Id $_.Id -Force -Confirm:$false
}
Start-Sleep -Seconds 2
if (@(Get-Process pythonw -ErrorAction SilentlyContinue).Count -ne 0) { Fel 'pythonw kor fortfarande efter stopp' }
Write-Host 'Task disabled, 0 pythonw.'

# -- 4. Reset till origin/main --
Steg '4/6 git reset --hard origin/main'
git -C $DeployDir reset --hard origin/main
if ($LASTEXITCODE -ne 0) { Fel 'git reset misslyckades' }

# -- 5. Verifiera byte-identiskt --
Steg '5/6 verifiera filhashar'
foreach ($f in $ImportFiler) {
    $lokal = (git -C $DeployDir hash-object (Join-Path $DeployDir $f)).Trim()
    $iMain = (git -C $DeployDir rev-parse "origin/main:$f").Trim()
    if ($LASTEXITCODE -ne 0 -or -not $lokal -or $lokal -ne $iMain) {
        Fel "$f avviker fran origin/main efter reset ($lokal vs $iMain)"
    }
    Write-Host "  OK  $f"
}

# -- 6. Starta och verifiera den korande processen --
Steg '6/6 starta watchdogen'
Enable-ScheduledTask -TaskName $TaskName | Out-Null
Start-ScheduledTask -TaskName $TaskName
$script:WatchdogStoppad = $false   # fran och med har ar tasken enabled + startad igen
$logg = Join-Path $DeployDir 'import_logg.txt'
$verifierad = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 3
    $rad = Get-Content $logg -Tail 40 -ErrorAction SilentlyContinue |
        Where-Object { $_ -match 'Version: git=' } | Select-Object -Last 1
    if ($rad -and $rad -match 'git=([0-9a-f]+)') {
        if ($Matches[1] -eq $mal) { $verifierad = $true; break }
        # aldre startrad med annan sha kan ligga kvar i tail:en -- vanta in den nya
    }
}
# Processkontrollen ar backstop for fallet att en gammal loggrad med ratt sha
# rakade matcha fast processen inte kom upp. Rakna bara SJALVA watchdogen
# (auto_import_watch pa kommandoraden) -- direkt efter start kor den ofta en
# import-subprocess som OCKSA ar pythonw och inte far raknas som dubblett.
# Single-instance-laset i watchdogen garanterar anda max 1.
$wd = @(Get-CimInstance Win32_Process -Filter "Name='pythonw.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'auto_import_watch' })
if (-not $verifierad) { Fel "kunde inte verifiera 'Version: git=$mal' i $logg inom 30s (watchdog-processer: $($wd.Count))" }
if ($wd.Count -ne 1) { Fel "vantade exakt 1 auto_import_watch-process efter start, fann $($wd.Count)" }

Write-Host "`nDEPLOY KLAR -- drift kor origin/main ($mal), watchdog igang, version verifierad i loggen." -ForegroundColor Green
exit 0
