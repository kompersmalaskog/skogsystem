import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';

const MARKFUKT_SERVICE =
  'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Markfuktighet_SLU_2_0/ImageServer';
const LUTNING_SERVICE =
  'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Lutning_1_0/ImageServer';

// ---------- Rendering rules ----------

// Markfuktighet: Colormap som ger R=klassId*10 (10-50), nodata = transparent
const FUKT_RULE = JSON.stringify({
  rasterFunction: 'Colormap',
  rasterFunctionArguments: {
    Colormap: [
      [1, 10, 0, 0],
      [2, 20, 0, 0],
      [3, 30, 0, 0],
      [4, 40, 0, 0],
      [5, 50, 0, 0],
    ],
  },
});

// Lutning: Remap till 3 klasser, sedan Colormap
const LUTNING_RULE = JSON.stringify({
  rasterFunction: 'Colormap',
  rasterFunctionArguments: {
    Colormap: [
      [1, 10, 0, 0],
      [2, 20, 0, 0],
      [3, 30, 0, 0],
    ],
    Raster: {
      rasterFunction: 'Remap',
      rasterFunctionArguments: {
        InputRanges: [0, 20, 20, 25, 25, 90],
        OutputValues: [1, 2, 3],
      },
    },
  },
});

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

  // Verify content-type is an image
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

  // Verify PNG magic bytes (89 50 4E 47)
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
    'User-Agent': 'Mozilla/5.0 (Skogsystem Korbarhet Tiles)',
  };

  const sizeParam = `${width},${height}`;

  const fuktUrl =
    `${MARKFUKT_SERVICE}/exportImage?` +
    `bbox=${bbox}&bboxSR=${bboxSR}&imageSR=${bboxSR}` +
    `&size=${sizeParam}&format=png&transparent=true` +
    `&renderingRule=${encodeURIComponent(FUKT_RULE)}&f=image`;

  const lutUrl =
    `${LUTNING_SERVICE}/exportImage?` +
    `bbox=${bbox}&bboxSR=${bboxSR}&imageSR=${bboxSR}` +
    `&size=${sizeParam}&format=png&transparent=true` +
    `&renderingRule=${encodeURIComponent(LUTNING_RULE)}&f=image`;

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
      const fR = fuktRaw[i * 4];      // R channel = fuktklassens kodvärde
      const fA = fuktRaw[i * 4 + 3];  // Alpha
      const lR = lutRaw[i * 4];       // R channel = lutningsklassens kodvärde
      const lA = lutRaw[i * 4 + 3];

      // Inget data → transparent
      if (fA === 0 && lA === 0) continue;

      // Avkoda klasser från Colormap-kodning (R=10→klass1, R=20→klass2, etc.)
      const fuktKlass = fA > 0 ? Math.round(fR / 10) : 0; // 1-5 eller 0
      const lutKlass = lA > 0 ? Math.round(lR / 10) : 1;  // 1-3, default <20°

      let r = 0,
        g = 0,
        b = 0,
        a = 0;

      if (fuktKlass >= 1) {
        // Lutning >25° → alltid röd
        if (lutKlass === 3) {
          r = 220; g = 0; b = 0; a = 140;
        }
        // Blöt (klass 5)
        else if (fuktKlass === 5) {
          r = 220; g = 0; b = 0; a = 180;
        }
        // Fuktig (klass 4)
        else if (fuktKlass === 4) {
          r = 220; g = 0; b = 0; a = 140;
        }
        // Frisk-fuktig (klass 3)
        else if (fuktKlass === 3) {
          if (lutKlass === 1) { r = 220; g = 180; b = 0; a = 140; }
          else { r = 220; g = 0; b = 0; a = 140; }
        }
        // Torr/Frisk (klass 1-2)
        else {
          if (lutKlass === 1) { r = 0; g = 180; b = 0; a = 140; }
          else if (lutKlass === 2) { r = 220; g = 180; b = 0; a = 140; }
          else { r = 220; g = 0; b = 0; a = 140; }
        }
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
