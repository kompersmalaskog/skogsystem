import { NextRequest, NextResponse } from 'next/server';
import * as zlib from 'zlib';

const MARKFUKT_SERVICE = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Markfuktighet_SLU_2_0/ImageServer';
const LUTNING_SERVICE = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt/Lutning_1_0/ImageServer';

// ---------- Minimal PNG decoder ----------

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePNG(buf: Buffer): { width: number; height: number; data: Uint8Array } {
  // Verify signature
  if (buf[0] !== 137 || buf[1] !== 80 || buf[2] !== 78 || buf[3] !== 71) {
    throw new Error('Not a PNG');
  }

  let pos = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Buffer[] = [];
  let palette: number[][] | null = null;
  let trns: Uint8Array | null = null;

  while (pos < buf.length) {
    const length = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const chunkData = buf.subarray(pos + 8, pos + 8 + length);

    if (type === 'IHDR') {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
    } else if (type === 'PLTE') {
      palette = [];
      for (let i = 0; i < chunkData.length; i += 3) {
        palette.push([chunkData[i], chunkData[i + 1], chunkData[i + 2]]);
      }
    } else if (type === 'tRNS') {
      trns = new Uint8Array(chunkData);
    } else if (type === 'IDAT') {
      idatChunks.push(Buffer.from(chunkData));
    } else if (type === 'IEND') {
      break;
    }

    pos += 12 + length;
  }

  const compressed = Buffer.concat(idatChunks);
  const decompressed = zlib.inflateSync(compressed);

  let bpp: number;
  switch (colorType) {
    case 0: bpp = 1; break;
    case 2: bpp = 3; break;
    case 3: bpp = 1; break;
    case 4: bpp = 2; break;
    case 6: bpp = 4; break;
    default: throw new Error(`Unsupported color type ${colorType}`);
  }
  if (bitDepth === 16) bpp *= 2;

  const stride = width * bpp;
  const raw = new Uint8Array(height * stride);

  for (let y = 0; y < height; y++) {
    const filterType = decompressed[y * (stride + 1)];
    const rowOff = y * (stride + 1) + 1;
    const outOff = y * stride;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? raw[outOff + x - bpp] : 0;
      const b = y > 0 ? raw[outOff - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? raw[outOff - stride + x - bpp] : 0;
      const val = decompressed[rowOff + x];

      switch (filterType) {
        case 0: raw[outOff + x] = val; break;
        case 1: raw[outOff + x] = (val + a) & 0xff; break;
        case 2: raw[outOff + x] = (val + b) & 0xff; break;
        case 3: raw[outOff + x] = (val + ((a + b) >> 1)) & 0xff; break;
        case 4: raw[outOff + x] = (val + paeth(a, b, c)) & 0xff; break;
      }
    }
  }

  // Convert to RGBA
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    switch (colorType) {
      case 0:
        pixels[i * 4] = raw[i]; pixels[i * 4 + 1] = raw[i]; pixels[i * 4 + 2] = raw[i]; pixels[i * 4 + 3] = 255;
        break;
      case 2:
        pixels[i * 4] = raw[i * 3]; pixels[i * 4 + 1] = raw[i * 3 + 1]; pixels[i * 4 + 2] = raw[i * 3 + 2]; pixels[i * 4 + 3] = 255;
        break;
      case 3: {
        const idx = raw[i];
        if (palette && idx < palette.length) {
          pixels[i * 4] = palette[idx][0]; pixels[i * 4 + 1] = palette[idx][1]; pixels[i * 4 + 2] = palette[idx][2];
          pixels[i * 4 + 3] = trns && idx < trns.length ? trns[idx] : 255;
        }
        break;
      }
      case 4:
        pixels[i * 4] = raw[i * 2]; pixels[i * 4 + 1] = raw[i * 2]; pixels[i * 4 + 2] = raw[i * 2]; pixels[i * 4 + 3] = raw[i * 2 + 1];
        break;
      case 6:
        pixels[i * 4] = raw[i * 4]; pixels[i * 4 + 1] = raw[i * 4 + 1]; pixels[i * 4 + 2] = raw[i * 4 + 2]; pixels[i * 4 + 3] = raw[i * 4 + 3];
        break;
    }
  }

  return { width, height, data: pixels };
}

// ---------- Minimal PNG encoder ----------

function crc32(buf: Buffer): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const buf = Buffer.alloc(12 + data.length);
  buf.writeUInt32BE(data.length, 0);
  buf.write(type, 4, 4, 'ascii');
  data.copy(buf, 8);
  const crcData = Buffer.alloc(4 + data.length);
  crcData.write(type, 0, 4, 'ascii');
  data.copy(crcData, 4);
  buf.writeUInt32BE(crc32(crcData), 8 + data.length);
  return buf;
}

function encodePNG(width: number, height: number, pixels: Uint8Array): Buffer {
  // Build raw scanlines with filter type 0 (None)
  const rawLen = height * (1 + width * 4);
  const raw = Buffer.alloc(rawLen);
  for (let y = 0; y < height; y++) {
    const off = y * (1 + width * 4);
    raw[off] = 0; // filter: None
    for (let x = 0; x < width * 4; x++) {
      raw[off + 1 + x] = pixels[y * width * 4 + x];
    }
  }

  const compressed = zlib.deflateSync(raw);

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- Rendering rules for raw pixel values ----------

// Markfuktighet: Colormap som ger R=klassId (1-5), nodata = transparent
const FUKT_RULE = JSON.stringify({
  rasterFunction: 'Colormap',
  rasterFunctionArguments: {
    Colormap: [[1, 10, 0, 0], [2, 20, 0, 0], [3, 30, 0, 0], [4, 40, 0, 0], [5, 50, 0, 0]],
  },
});

// Lutning: Remap till 3 klasser, sedan Colormap för identifikation
const LUTNING_RULE = JSON.stringify({
  rasterFunction: 'Colormap',
  rasterFunctionArguments: {
    Colormap: [[1, 10, 0, 0], [2, 20, 0, 0], [3, 30, 0, 0]],
    Raster: {
      rasterFunction: 'Remap',
      rasterFunctionArguments: {
        InputRanges: [0, 20, 20, 25, 25, 90],
        OutputValues: [1, 2, 3],
      },
    },
  },
});

// ---------- Tile generation ----------

export async function GET(req: NextRequest) {
  const bbox = req.nextUrl.searchParams.get('bbox');
  const size = req.nextUrl.searchParams.get('size') || '256,256';

  if (!bbox) return NextResponse.json({ error: 'Missing bbox' }, { status: 400 });

  const user = process.env.SKS_WMS_USER;
  const pass = process.env.SKS_WMS_PASS;
  if (!user || !pass) return NextResponse.json({ error: 'Credentials not configured' }, { status: 500 });

  const headers = {
    'Authorization': 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'),
    'User-Agent': 'Mozilla/5.0 (Skogsystem Korbarhet Tiles)',
  };

  try {
    const fuktUrl = `${MARKFUKT_SERVICE}/exportImage?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=${size}&format=png&transparent=true&renderingRule=${encodeURIComponent(FUKT_RULE)}&f=image`;
    const lutUrl = `${LUTNING_SERVICE}/exportImage?bbox=${bbox}&bboxSR=3857&imageSR=3857&size=${size}&format=png&transparent=true&renderingRule=${encodeURIComponent(LUTNING_RULE)}&f=image`;

    const [fuktResp, lutResp] = await Promise.all([
      fetch(fuktUrl, { headers }),
      fetch(lutUrl, { headers }),
    ]);

    if (!fuktResp.ok || !lutResp.ok) {
      return NextResponse.json({ error: `Upstream ${fuktResp.status}/${lutResp.status}` }, { status: 502 });
    }

    const fuktBuf = Buffer.from(await fuktResp.arrayBuffer());
    const lutBuf = Buffer.from(await lutResp.arrayBuffer());

    const fukt = decodePNG(fuktBuf);
    const lut = decodePNG(lutBuf);

    const w = fukt.width;
    const h = fukt.height;
    const output = new Uint8Array(w * h * 4);

    for (let i = 0; i < w * h; i++) {
      const fR = fukt.data[i * 4];     // R-kanal = fuktklassens kodvärde
      const fA = fukt.data[i * 4 + 3]; // Alpha = 0 för nodata
      const lR = lut.data[i * 4];      // R-kanal = lutningsklassens kodvärde
      const lA = lut.data[i * 4 + 3];

      // Inget data → transparent
      if (fA === 0 && lA === 0) continue;

      // Avkoda klasser från Colormap-kodning (R=10→klass1, R=20→klass2, etc.)
      const fuktKlass = fA > 0 ? Math.round(fR / 10) : 0;  // 1-5 eller 0
      const lutKlass = lA > 0 ? Math.round(lR / 10) : 1;   // 1-3, default <20°

      let r = 0, g = 0, b = 0, a = 0;

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
          if (lutKlass === 1) { r = 220; g = 180; b = 0; a = 140; }  // <20° = gul
          else { r = 220; g = 0; b = 0; a = 140; }                    // 20-25° = röd
        }
        // Torr/Frisk (klass 1-2)
        else {
          if (lutKlass === 1) { r = 0; g = 180; b = 0; a = 140; }    // <20° = grön
          else if (lutKlass === 2) { r = 220; g = 180; b = 0; a = 140; } // 20-25° = gul
          else { r = 220; g = 0; b = 0; a = 140; }                    // >25° = röd
        }
      }

      output[i * 4] = r;
      output[i * 4 + 1] = g;
      output[i * 4 + 2] = b;
      output[i * 4 + 3] = a;
    }

    const png = encodePNG(w, h, output);

    return new NextResponse(png, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Tile generation failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
