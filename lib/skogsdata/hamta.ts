// SKOGSDATA — hämtningen på servern (Skogsstyrelsens ImageServer, samma inloggning som /api/laser-grundyta och Ritad).
// Laserdatan krävs; lutning och markfuktighet kan falla var för sig och står då i `fel` — aldrig en gissning.
// Bandnumren (0-baserade, samma som lib/skoglig-berakning.ts): 0 volym m³sk/ha, 1 medelhöjd dm, 2 grundyta m²/ha, 3 medeldiameter cm, 7 skanningsdag.

import { fromArrayBuffer } from 'geotiff';
import { tolkaFuktBand } from '@/lib/ritadKarta/mark';
import { packaLaser, packaLutning, type Plan, type Rutnat } from './rutnat';

const BAS = 'https://geodata.skogsstyrelsen.se/arcgis/rest/services/Publikt';
const SGD = `${BAS}/SkogligaGrunddata_3_1/ImageServer`;
const MARKFUKT = `${BAS}/Markfuktighet_SLU_2_0/ImageServer`;
const LUTNING = `${BAS}/Lutning_1_0/ImageServer`;
const NODATA = -9999;
const TIDSGRANS_MS = 20_000;
const NONE_RULE = JSON.stringify({ rasterFunction: 'None' });
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type Tiff = { band: ArrayLike<number>[]; nodata: number | null };

async function exportTiff(service: string, p: Plan, auth: Record<string, string>, extra: Record<string, string>): Promise<Tiff> {
  const { u } = p;
  const params = new URLSearchParams({
    bbox: `${u.minX},${u.minY},${u.maxX},${u.maxY}`, bboxSR: '3006', imageSR: '3006', size: `${u.bredd},${u.hojd}`,
    format: 'tiff', interpolation: 'RSP_NearestNeighbor', f: 'image', ...extra,
  });
  const styr = new AbortController();
  const t = setTimeout(() => styr.abort(), TIDSGRANS_MS);
  try {
    const r = await fetch(`${service}/exportImage?${params}`, { headers: auth, signal: styr.signal });
    const typ = r.headers.get('content-type') ?? '';
    if (!r.ok || !typ.includes('tif')) throw new Error(`svar ${r.status}: ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 80) || typ}`);
    const bild = await (await fromArrayBuffer(await r.arrayBuffer())).getImage();
    if (bild.getWidth() !== u.bredd || bild.getHeight() !== u.hojd) throw new Error('fel storlek');
    return { band: (await bild.readRasters()) as unknown as ArrayLike<number>[], nodata: bild.getGDALNoData() };
  } finally {
    clearTimeout(t);
  }
}

export type HamtaSvar = { nat: Rutnat; fel: string[] };

/** Ett utsnitt: laser (krävs — kastar annars), lutning och fukt (var för sig; ett fel står i `fel`). */
export async function hamtaUtsnitt(p: Plan): Promise<HamtaSvar> {
  const user = process.env.SKS_WMS_USER, pass = process.env.SKS_WMS_PASS;
  if (!user || !pass) throw new Error('Inloggningen till Skogsstyrelsen saknas på servern.');
  const auth = { Authorization: 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64'), 'User-Agent': UA };
  const n = p.u.bredd * p.u.hojd;

  const [laser, lut, fukt] = await Promise.allSettled([
    exportTiff(SGD, p, auth, { pixelType: 'F32', bandIds: '0,1,2,3,7', noData: String(NODATA), noDataInterpretation: 'esriNoDataMatchAny' }),
    exportTiff(LUTNING, p, auth, { renderingRule: NONE_RULE }),
    exportTiff(MARKFUKT, p, auth, { renderingRule: NONE_RULE }),
  ]);
  if (laser.status === 'rejected') throw new Error(`laserdata: ${String((laser.reason as Error)?.message ?? laser.reason)}`);
  const b = laser.value.band;
  if (b.length < 5) throw new Error('laserdata: för få band');
  const nat = packaLaser(p, { volym: b[0], hojd: b[1], grundyta: b[2], diameter: b[3], dag: b[4] }, laser.value.nodata ?? NODATA);

  const fel: string[] = [];
  if (lut.status === 'fulfilled') {
    try { nat.lutning = packaLutning(lut.value.band[0], n); } catch (e) { fel.push(`lutning: ${(e as Error).message}`); }
  } else fel.push(`lutning: ${String((lut.reason as Error)?.message ?? lut.reason).slice(0, 100)}`);
  if (fukt.status === 'fulfilled') {
    try { nat.fukt = tolkaFuktBand(fukt.value.band).koder; } catch (e) { fel.push(`markfuktighet: ${(e as Error).message.slice(0, 100)}`); }
  } else fel.push(`markfuktighet: ${String((fukt.reason as Error)?.message ?? fukt.reason).slice(0, 100)}`);
  return { nat, fel };
}
