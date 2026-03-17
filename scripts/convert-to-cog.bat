@echo off
REM Konvertera SLU Skogskarta GeoTIFF till Cloud Optimized GeoTIFF (COG)
REM COG-format mojliggor HTTP range requests — bara de tiles som behovs laddas ner.
REM
REM Krav: GDAL >= 3.1 (for COG-driver), installerat via OSGeo4W
REM Kor: oppna OSGeo4W Shell och kor:  scripts\convert-to-cog.bat
REM

setlocal enabledelayedexpansion

set "INPUT_DIR=data\slu-skogskarta"
set "OUTPUT_DIR=data\slu-cog"

if not exist "%OUTPUT_DIR%" mkdir "%OUTPUT_DIR%"

REM Filnamn-mappning: original -> COG
set "FILES=SLUskogskarta_volTall.tif:tall.tif SLUskogskarta_volGran.tif:gran.tif SLUskogskarta_volBjork.tif:bjork.tif SLUskogskarta_volContorta.tif:contorta.tif SLUskogskarta_volBok.tif:bok.tif SLUskogskarta_volEk.tif:ek.tif SLUskogskarta_volOvrigtLov.tif:ovrigt.tif"

for %%P in (%FILES%) do (
    for /f "tokens=1,2 delims=:" %%A in ("%%P") do (
        set "SRC=%%A"
        set "DST=%%B"
        set "INPUT=%INPUT_DIR%\%%A"
        set "OUTPUT=%OUTPUT_DIR%\%%B"

        if not exist "!INPUT!" (
            echo SKIP: !INPUT! finns inte
        ) else if exist "!OUTPUT!" (
            echo SKIP: !OUTPUT! finns redan
        ) else (
            echo Konverterar !SRC! -^> !DST! ...
            gdal_translate -of COG -co COMPRESS=DEFLATE -co BLOCKSIZE=512 -co OVERVIEW_RESAMPLING=NEAREST -co NUM_THREADS=ALL_CPUS "!INPUT!" "!OUTPUT!"
            if errorlevel 1 (
                echo FEL: Konvertering misslyckades for !SRC!
            ) else (
                echo   Klar: !OUTPUT!
            )
        )
    )
)

echo.
echo === Alla COG-filer ===
dir "%OUTPUT_DIR%\*.tif" 2>nul || echo (inga filer)
echo.
echo Nasta steg: ladda upp alla .tif i %OUTPUT_DIR%\ till Cloudflare R2.

endlocal
