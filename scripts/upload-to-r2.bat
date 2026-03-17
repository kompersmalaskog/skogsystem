@echo off
REM Ladda upp COG-filer till Cloudflare R2
REM
REM Förutsättningar:
REM   1. Wrangler CLI: npm install -g wrangler
REM   2. Inloggad:     wrangler login
REM
REM Bucket: slu-skogskarta
REM Publik URL: https://pub-34a728ec09b04898b17779b0dfc4d9d6.r2.dev

set BUCKET=slu-skogskarta
set COG_DIR=data\slu-cog

if not exist "%COG_DIR%" (
    echo Kor forst: bash scripts/convert-to-cog.sh
    echo Eller konvertera manuellt med GDAL, se nedan.
    exit /b 1
)

for %%F in (%COG_DIR%\*.tif) do (
    echo Laddar upp %%~nxF ...
    call wrangler r2 object put "%BUCKET%/%%~nxF" --file "%%F" --content-type "image/tiff"
    echo   OK
)

echo.
echo === Uppladdning klar ===
echo Verifiera: wrangler r2 object list %BUCKET%
echo.
echo Publik URL: https://pub-34a728ec09b04898b17779b0dfc4d9d6.r2.dev
echo Testa:      curl -I https://pub-34a728ec09b04898b17779b0dfc4d9d6.r2.dev/gran.tif
echo.
echo Vercel env var (om ej redan satt):
echo   SLU_COG_BASE_URL=https://pub-34a728ec09b04898b17779b0dfc4d9d6.r2.dev
