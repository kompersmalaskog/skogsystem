@echo off
:: setup_autostart.bat — Skapar en schemalagd uppgift i Windows Task Scheduler
:: som startar auto_import_watch.py vid inloggning.
::
:: Kör som administratör: högerklicka -> Kör som administratör
::

echo ============================================
echo  Skogsystem — Setup Autostart
echo ============================================
echo.

:: Ta bort eventuell befintlig uppgift
schtasks /Delete /TN "SkogsystemImport" /F >nul 2>nul

:: Skapa ny schemalagd uppgift
schtasks /Create ^
  /TN "SkogsystemImport" ^
  /TR "py \"C:\Kompersmåla Skog\Kompersmåla Skog\Appen\skogsystem-claude\auto_import_watch.py\"" ^
  /SC ONLOGON ^
  /DELAY 0001:00 ^
  /RL HIGHEST ^
  /F

if %errorlevel%==0 (
    echo.
    echo OK! Schemalagd uppgift "SkogsystemImport" skapad.
    echo   - Trigger: vid inloggning
    echo   - Fordrojning: 60 sekunder
    echo   - Kor: auto_import_watch.py
    echo.
    echo Verifiera med: schtasks /Query /TN "SkogsystemImport" /V
) else (
    echo.
    echo FEL: Kunde inte skapa uppgiften.
    echo Prova att kora som administrator.
)

echo.
pause
