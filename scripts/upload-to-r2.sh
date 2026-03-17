#!/bin/bash
# Ladda upp COG-filer till Cloudflare R2
#
# Förutsättningar:
#   1. Cloudflare-konto med R2 aktiverat
#   2. Wrangler CLI installerad: npm install -g wrangler
#   3. Inloggad: wrangler login
#
# Setup:
#   1. Skapa R2-bucket:
#      wrangler r2 bucket create slu-skogskarta
#
#   2. Aktivera publik åtkomst via Cloudflare Dashboard:
#      R2 → slu-skogskarta → Settings → Public access → Allow Access
#      Välj "Custom Domain" eller "R2.dev subdomain"
#      Kopiera URL:en (t.ex. https://slu-skogskarta.<account>.r2.dev)
#
#   3. Lägg till i Vercel miljövariabler:
#      SLU_COG_BASE_URL=https://slu-skogskarta.<account>.r2.dev
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
echo ""
echo "Verifiera med: wrangler r2 object list $BUCKET"
echo ""
echo "Lägg sedan till i Vercel → Settings → Environment Variables:"
echo "  SLU_COG_BASE_URL = https://slu-skogskarta.<ditt-account-id>.r2.dev"
