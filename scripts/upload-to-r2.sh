#!/bin/bash
# Ladda upp COG-filer till Cloudflare R2
#
# Förutsättningar:
#   1. Wrangler CLI: npm install -g wrangler
#   2. Inloggad:     wrangler login
#
# Bucket: slu-skogskarta
# Publik URL: https://pub-34a728ec09b04898b17779b0dfc4d9d6.r2.dev
#
# Kör: bash scripts/upload-to-r2.sh

set -e

BUCKET="slu-skogskarta"
COG_DIR="data/slu-cog"

if [ ! -d "$COG_DIR" ]; then
  echo "Kör först: bash scripts/convert-to-cog.sh"
  exit 1
fi

for FILE in "$COG_DIR"/*.tif; do
  BASENAME=$(basename "$FILE")
  echo "Laddar upp $BASENAME ..."
  wrangler r2 object put "$BUCKET/$BASENAME" --file "$FILE" --content-type "image/tiff"
  echo "  OK"
done

echo ""
echo "=== Uppladdning klar ==="
echo "Verifiera: wrangler r2 object list $BUCKET"
echo ""
echo "Publik URL: https://pub-34a728ec09b04898b17779b0dfc4d9d6.r2.dev"
echo "Testa:      curl -I https://pub-34a728ec09b04898b17779b0dfc4d9d6.r2.dev/gran.tif"
echo ""
echo "Vercel env var (om ej redan satt):"
echo "  SLU_COG_BASE_URL=https://pub-34a728ec09b04898b17779b0dfc4d9d6.r2.dev"
