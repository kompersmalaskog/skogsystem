# Importens dedikerade worktree — setup & återställning

MOM/HPR/HQC/FPR-importen körs från en **dedikerad git-worktree**, skild från repo-roten
(som används för feature-utveckling). Syfte: importens kod kör alltid från en **känd,
committad commit på `main`** — aldrig från en arbetsgren mitt i pågående utveckling.
(Det orsakade flera incidenter: dubbel watchdog, oincheckade fixar, fel branch.)

## Var den körs
| | |
|---|---|
| Worktree | `C:\skogsystem-import` (gren `prod-import`, ff:as till `origin/main`) |
| Schemalagd task | `Skogsystem Auto Import` → `pythonw auto_import_watch.py`, WorkingDirectory `C:\skogsystem-import` |
| Python | `C:\Users\lindq\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe` |
| Data (delad) | `…\Maskindata - Dokument\MOM-filer\{Inkommande,Behandlade}` (OneDrive, hårdkodade vägar) |
| Loggar (lokala) | `import_logg.txt`, `hpr_import_logg.txt` i worktreen (gitignorerade) |
| Single-instance | localhost-port `49281` (binds av watchdoggen) |

## ⚠ .env.local måste provisioneras manuellt
En ny worktree får **inte** gitignorerade/ospårade filer. `.env.local` (Supabase
service-role-nyckel) är gitignorerad → följer **inte** med `git worktree add`.
Saknas den → importern får `401` / RLS-fel och skriver inget.

## Återställning (om worktreen måste återskapas)
```powershell
$repo = 'C:\Kompersmåla Skog\Kompersmåla Skog\Appen\skogsystem-claude'

# 1. Skapa worktree på prod-import + hämta senaste main
git -C "$repo" worktree add C:\skogsystem-import prod-import
git -C C:\skogsystem-import pull --ff-only origin main

# 2. OBLIGATORISKT: provisionera creds (annars 401)
Copy-Item "$repo\.env.local" C:\skogsystem-import\.env.local

# 3. Peka schemalagda tasken hit (admin-PowerShell)
$a = New-ScheduledTaskAction -Execute 'C:\Users\lindq\AppData\Local\Python\pythoncore-3.14-64\pythonw.exe' `
                             -Argument 'auto_import_watch.py' -WorkingDirectory 'C:\skogsystem-import'
Set-ScheduledTask -TaskName 'Skogsystem Auto Import' -Action $a

# 4. Starta + verifiera: EN process, stämpel-hash, port 49281
Start-ScheduledTask -TaskName 'Skogsystem Auto Import'
Get-CimInstance Win32_Process -Filter "Name='pythonw.exe'" | Where-Object { $_.CommandLine -match 'auto_import_watch' } | Select-Object ProcessId,ExecutablePath
Get-NetTCPConnection -LocalPort 49281 | Select-Object OwningProcess
```

## Uppdatera importen till senaste main
```powershell
Stop-ScheduledTask -TaskName 'Skogsystem Auto Import'
git -C C:\skogsystem-import pull --ff-only origin main
Start-ScheduledTask -TaskName 'Skogsystem Auto Import'
```

## Relaterat
- #73 störst-per-objekt (timeout >600s), #75 service-role-nyckel (RLS/401), #77 logg av OneDrive + Safe-handlers (Errno 22).
- Versionsstämpeln i loggen (`Version: git=… | script=…`) visar exakt vilken commit + skript som kör. Vid felsökning: bekräfta att `script=C:\skogsystem-import\…`.
