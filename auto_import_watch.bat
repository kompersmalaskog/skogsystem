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

:: Starta med pythonw (ingen konsolfönster) om tillgängligt, annars python
where pythonw >nul 2>nul
if %errorlevel%==0 (
    start "" /B pythonw auto_import_watch.py
) else (
    start "" /MIN python auto_import_watch.py
)
