#!/bin/bash
# Konvertera SLU Skogskarta GeoTIFF till Cloud Optimized GeoTIFF (COG)
# COG-format möjliggör HTTP range requests — bara de tiles som behövs laddas ner.
#
# Krav: GDAL >= 3.1 (för COG-driver)
#   Windows: conda install -c conda-forge gdal
#   Mac:     brew install gdal
#   Linux:   sudo apt install gdal-bin
#
# Kör: bash scripts/convert-to-cog.sh

set -e

INPUT_DIR="data/slu-skogskarta"
OUTPUT_DIR="data/slu-cog"
mkdir -p "$OUTPUT_DIR"

# Mapping: original filename → COG filename
declare -A FILES
FILES=(
  ["SLUskogskarta_volTall.tif"]="tall.tif"
  ["SLUskogskarta_volGran.tif"]="gran.tif"
  ["SLUskogskarta_volBjork.tif"]="bjork.tif"
  ["SLUskogskarta_volContorta.tif"]="contorta.tif"
  ["SLUskogskarta_volBok.tif"]="bok.tif"
  ["SLUskogskarta_volEk.tif"]="ek.tif"
  ["SLUskogskarta_volOvrigtLov.tif"]="ovrigt.tif"
)

for SRC in "${!FILES[@]}"; do
  DST="${FILES[$SRC]}"
  INPUT="$INPUT_DIR/$SRC"
  OUTPUT="$OUTPUT_DIR/$DST"

  if [ ! -f "$INPUT" ]; then
    echo "SKIP: $INPUT finns inte"
    continue
  fi

  if [ -f "$OUTPUT" ]; then
    echo "SKIP: $OUTPUT finns redan"
    continue
  fi

  echo "Konverterar $SRC → $DST ..."
  gdal_translate \
    -of COG \
    -co COMPRESS=DEFLATE \
    -co BLOCKSIZE=512 \
    -co OVERVIEW_RESAMPLING=NEAREST \
    -co NUM_THREADS=ALL_CPUS \
    "$INPUT" "$OUTPUT"

  echo "  Klar: $(du -h "$OUTPUT" | cut -f1)"
done

echo ""
echo "=== Alla COG-filer ==="
ls -lh "$OUTPUT_DIR"/*.tif 2>/dev/null || echo "(inga filer)"
echo ""
echo "Nästa steg: ladda upp alla .tif i $OUTPUT_DIR/ till Cloudflare R2."
echo "Se instruktioner i scripts/upload-to-r2.sh"
