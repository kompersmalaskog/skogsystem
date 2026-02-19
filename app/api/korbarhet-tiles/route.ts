import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const MARKFUKT_SERVICE =
  'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Markfuktighet_SLU_2_0/ImageServer';
const LUTNING_SERVICE =
  'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Lutning_1_0/ImageServer';

// renderingRule=None → raw pixel values (no server-side colormap)
const NONE_RULE = encodeURIComponent(JSON.stringify({ rasterFunction: 'None' }));

// Browser-like UA required — Skogsstyrelsens WAF blocks custom User-Agents
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ---------- Fetch helper ----------

async function fetchPng(
  url: string,
  label: string,
  headers: Record<string, string>,
): Promise<Buffer> {
  console.log(`[korbarhet-tiles] Fetching ${label}: ${url}`);

  const res = await fetch(url, { headers });
  const contentType = res.headers.get('content-type') ?? '';

  console.log(
    `[korbarhet-tiles] ${label} response: status=${res.status} content-type="${contentType}"`,
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '(could not read body)');
    console.error(
      `[korbarhet-tiles] ${label} HTTP error ${res.status}: ${body.slice(0, 500)}`,
    );
    throw new Error(`${label} returned HTTP ${res.status}`);
  }

  if (!contentType.includes('image/')) {
    const body = await res.text().catch(() => '(could not read body)');
    console.error(
      `[korbarhet-tiles] ${label} unexpected content-type "${contentType}": ${body.slice(0, 500)}`,
    );
    throw new Error(
      `${label} returned content-type "${contentType}", expected image/png`,
    );
  }

  const arrayBuf = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  if (
    buf.length < 8 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47
  ) {
    console.error(
      `[korbarhet-tiles] ${label} not a valid PNG. Size=${buf.length}, first bytes: ${buf.subarray(0, 16).toString('hex')}`,
    );
    throw new Error(`${label} response is not a valid PNG (bad magic bytes)`);
  }

  console.log(`[korbarhet-tiles] ${label} OK — ${buf.length} bytes`);
  return buf;
}

// ---------- Main handler ----------

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox');
  const width = parseInt(req.nextUrl.searchParams.get('width') ?? '256', 10);
  const height = parseInt(req.nextUrl.searchParams.get('height') ?? '256', 10);
  const bboxSR = req.nextUrl.searchParams.get('bboxSR') ?? '4326';

  if (!bbox) {
    return NextResponse.json(
      { error: 'Missing bbox parameter (e.g. bbox=15.8,56.6,15.9,56.7)' },
      { status: 400 },
    );
  }

  const user = process.env.SKS_WMS_USER;
  const pass = process.env.SKS_WMS_PASS;
  if (!user || !pass) {
    console.error('[korbarhet-tiles] SKS_WMS_USER / SKS_WMS_PASS not set');
    return NextResponse.json(
      { error: 'Credentials not configured' },
      { status: 500 },
    );
  }

  const authHeaders: Record<string, string> = {
    Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
    'User-Agent': UA,
  };

  const sizeParam = `${width},${height}`;

  // Markfuktighet: band 1 = MarkfuktighetKlassad (1-4), renderingRule=None for raw values
  const fuktUrl =
    `${MARKFUKT_SERVICE}/exportImage?` +
    `bbox=${bbox}&bboxSR=${bboxSR}&imageSR=${bboxSR}` +
    `&size=${sizeParam}&format=png&transparent=true` +
    `&bandIds=1&renderingRule=${NONE_RULE}&f=image`;

  // Lutning: single band = slope degrees (0-90), renderingRule=None for raw values
  const lutUrl =
    `${LUTNING_SERVICE}/exportImage?` +
    `bbox=${bbox}&bboxSR=${bboxSR}&imageSR=${bboxSR}` +
    `&size=${sizeParam}&format=png&transparent=true` +
    `&renderingRule=${NONE_RULE}&f=image`;

  console.log('[korbarhet-tiles] === Request ===');
  console.log(`[korbarhet-tiles] bbox=${bbox} bboxSR=${bboxSR} size=${width}x${height}`);
  console.log(`[korbarhet-tiles] Markfuktighet URL: ${fuktUrl}`);
  console.log(`[korbarhet-tiles] Lutning URL:       ${lutUrl}`);

  try {
    const [fuktBuf, lutBuf] = await Promise.all([
      fetchPng(fuktUrl, 'Markfuktighet', authHeaders),
      fetchPng(lutUrl, 'Lutning', authHeaders),
    ]);

    // Decode to raw RGBA using sharp
    const [fuktRaw, lutRaw] = await Promise.all([
      sharp(fuktBuf).ensureAlpha().resize(width, height, { fit: 'fill' }).raw().toBuffer(),
      sharp(lutBuf).ensureAlpha().resize(width, height, { fit: 'fill' }).raw().toBuffer(),
    ]);

    // Build output RGBA buffer
    const output = Buffer.alloc(width * height * 4);

    for (let i = 0; i < width * height; i++) {
      // Markfuktighet band 1 (MarkfuktighetKlassad) is in the R channel
      //   1 = Torr (dry), 2 = Frisk-Fuktig (fresh-moist),
      //   3 = Blöt (wet), 4 = Öppet vatten (open water)
      const fuktKlass = fuktRaw[i * 4];      // R channel
      const fuktAlpha = fuktRaw[i * 4 + 3];

      // Lutning: slope in degrees (0-90) in the R channel
      const slopeDeg = lutRaw[i * 4];         // R channel
      const slopeAlpha = lutRaw[i * 4 + 3];

      // No data → transparent
      if (fuktAlpha === 0 && slopeAlpha === 0) continue;

      let r = 0, g = 0, b = 0, a = 0;

      // Slope classification: 0 = flat, 1 = moderate, 2 = steep
      let slopeClass = 0;
      if (slopeAlpha > 0 && slopeDeg >= 25) slopeClass = 2;
      else if (slopeAlpha > 0 && slopeDeg >= 20) slopeClass = 1;

      // Steep slope (>25°) → always red
      if (slopeClass === 2) {
        r = 220; g = 0; b = 0; a = 140;
      }
      // Öppet vatten (class 4) → red
      else if (fuktKlass === 4) {
        r = 220; g = 0; b = 0; a = 180;
      }
      // Blöt (class 3) → red
      else if (fuktKlass === 3) {
        r = 220; g = 0; b = 0; a = 140;
      }
      // Frisk-Fuktig (class 2)
      else if (fuktKlass === 2) {
        if (slopeClass === 1) { r = 220; g = 0; b = 0; a = 140; }    // 20-25° = red
        else { r = 220; g = 180; b = 0; a = 140; }                    // <20° = yellow
      }
      // Torr (class 1) — best trafficability
      else if (fuktKlass === 1) {
        if (slopeClass === 1) { r = 220; g = 180; b = 0; a = 140; }  // 20-25° = yellow
        else { r = 0; g = 180; b = 0; a = 140; }                      // <20° = green
      }
      // Unknown / no fukt data but has slope
      else if (slopeAlpha > 0) {
        if (slopeClass === 1) { r = 220; g = 180; b = 0; a = 100; }
        else { r = 0; g = 180; b = 0; a = 100; }
      }

      output[i * 4] = r;
      output[i * 4 + 1] = g;
      output[i * 4 + 2] = b;
      output[i * 4 + 3] = a;
    }

    const pngBuffer = await sharp(output, {
      raw: { width, height, channels: 4 },
    })
      .png()
      .toBuffer();

    console.log(
      `[korbarhet-tiles] Output PNG: ${pngBuffer.length} bytes (${width}x${height})`,
    );

    return new NextResponse(pngBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[korbarhet-tiles] ERROR: ${message}`);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
