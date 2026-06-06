@echo off
:: auto_import_watch.bat — Startar auto-import bevakning i bakgrunden.
:: Lägg en genväg till denna fil i shell:startup för autostart vid inloggning.
::
:: Steg för Autostart:
::   1. Tryck Win+R, skriv shell:startup, tryck Enter
::   2. Högerklicka i mappen -> Nytt -> Genväg
::   3. Peka på: C:\Kompersmåla Skog\Kompersmåla Skog\Appen\skogsystem-claude\auto_import_watch.bat
::   4. Namnge: Skogsystem Auto Import
::

cd /d "C:\Kompersmåla Skog\Kompersmåla Skog\Appen\skogsystem-claude"

:: VIKTIGT: kör SPÅRAT — ingen `start`/detach. cmd väntar då på watchdog-processen,
:: så Schemalagd uppgift håller den "Running" och Stop-ScheduledTask dödar hela trädet
:: (.bat + pythonw). pythonw = inget konsolfönster; python (med fönster) som fallback.
where pythonw >nul 2>nul
if %errorlevel%==0 (
    pythonw auto_import_watch.py
) else (
    python auto_import_watch.py
)
