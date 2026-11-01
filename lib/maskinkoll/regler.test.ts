import { describe, it, expect } from 'vitest';
import { arDags, bildArGammal, deadlineFor, enManadSenare, exifTid, fragorFor, fotoSokvag, lage, tolkaExifTid, type Fraga } from './regler';

const f = (kod: string, ordning: number, maskin_typ: string | null = null): Fraga =>
  ({ id: kod, kod, text: kod, hjalptext: null, maskin_typ, foto_url: null, ordning, stopp: false, foto_vid_ja: false });

describe('maskinkoll — regler', () => {
  it('frågorna: alla maskiner + maskinens typ, sorterade på ordning', () => {
    const alla = [f('S1', 110, 'Harvester'), f('G2', 20), f('K1', 210, 'Forwarder'), f('G1', 10)];
    expect(fragorFor(alla, 'Forwarder').map((x) => x.kod)).toEqual(['G1', 'G2', 'K1']);
    expect(fragorFor(alla, 'Harvester').map((x) => x.kod)).toEqual(['G1', 'G2', 'S1']);
    expect(fragorFor(alla, null).map((x) => x.kod)).toEqual(['G1', 'G2']);
  });

  it('en kalendermånad senare klipper månadsslutet', () => {
    expect(enManadSenare(new Date(2026, 0, 31)).getDate()).toBe(28);
    expect(enManadSenare(new Date(2026, 0, 31)).getMonth()).toBe(1);
    expect(enManadSenare(new Date(2026, 9, 31)).getMonth()).toBe(10);
    expect(enManadSenare(new Date(2026, 9, 31)).getDate()).toBe(30);
  });

  it('dags: ingen koll → ja; samma dag nästa månad → ja; dagen före → nej', () => {
    expect(arDags(null)).toBe(true);
    const klar = new Date(2026, 9, 12, 14, 0);
    expect(arDags(klar, new Date(2026, 10, 11, 23, 0))).toBe(false);
    expect(arDags(klar, new Date(2026, 10, 12, 6, 0))).toBe(true);
  });

  it('bilden: äldre än 10 minuter är gammal; okänd tid är det inte', () => {
    const nu = new Date(2026, 9, 31, 18, 0);
    expect(bildArGammal(new Date(2026, 9, 31, 17, 55), nu)).toBe(false);
    expect(bildArGammal(new Date(2026, 9, 31, 17, 49), nu)).toBe(true);
    expect(bildArGammal(nu.getTime() - 11 * 60_000, nu)).toBe(true);
    expect(bildArGammal(null, nu)).toBe(false);
    expect(bildArGammal(0, nu)).toBe(false);
  });

  it('EXIF-tiden läses ur en JPEG (DateTimeOriginal går före DateTime)', () => {
    expect(tolkaExifTid('2026:10:31 17:59:12')?.getMinutes()).toBe(59);
    expect(tolkaExifTid('0000:00:00 00:00:00')).toBeNull();
    const jpeg = byggJpeg('2026:10:31 16:40:00', '2026:10:31 17:59:12');
    const d = exifTid(jpeg)!;
    expect([d.getHours(), d.getMinutes()]).toEqual([16, 40]);
    expect(exifTid(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toBeNull();
  });

  it('åtgärdens sista dag: stopp idag, annars en vecka', () => {
    const nu = new Date(2026, 9, 31, 18, 0);
    expect(deadlineFor(true, nu)).toBe('2026-10-31');
    expect(deadlineFor(false, nu)).toBe('2026-11-07');
  });

  it('fotots sökväg börjar med medarbetarens id (RLS) och är unik per foto', () => {
    const a = fotoSokvag('med-1', 'koll-1', 'fraga-1', 1);
    expect(a.split('/')[0]).toBe('med-1');
    expect(a).not.toBe(fotoSokvag('med-1', 'koll-1', 'fraga-1', 2));
  });

  it('läget: besvarade, kvar och första obesvarade', () => {
    const fr = [f('G1', 10), f('G2', 20), f('G3', 30)];
    expect(lage(fr, [{ fraga_id: 'G1', ok: true, foto_url: null, kommentar: null }])).toEqual({ besvarade: 1, kvar: 2, forstaObesvarade: 1 });
    expect(lage(fr, [])).toEqual({ besvarade: 0, kvar: 3, forstaObesvarade: 0 });
  });
});

/** Minimal JPEG: SOI + APP1 Exif (big-endian TIFF) med IFD0 (DateTime + pekare) och Exif-IFD (DateTimeOriginal). */
function byggJpeg(original: string, datetime: string): ArrayBuffer {
  const tiff: number[] = [];
  const u16 = (n: number) => tiff.push((n >> 8) & 255, n & 255);
  const u32 = (n: number) => tiff.push((n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255);
  const str = (s: string) => { for (const c of s) tiff.push(c.charCodeAt(0)); tiff.push(0); };
  // header
  tiff.push(0x4d, 0x4d); u16(42); u32(8);
  // IFD0 at 8: 2 entries
  const ifd0 = 8, exifIfd = ifd0 + 2 + 2 * 12 + 4, exifData = exifIfd + 2 + 12 + 4, dtData = exifData + 20;
  u16(2);
  u16(0x0132); u16(2); u32(20); u32(dtData);
  u16(0x8769); u16(4); u32(1); u32(exifIfd);
  u32(0);
  u16(1);
  u16(0x9003); u16(2); u32(20); u32(exifData);
  u32(0);
  str(original);
  str(datetime);
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const len = app1.length + 2;
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (len >> 8) & 255, len & 255, ...app1, 0xff, 0xd9];
  return new Uint8Array(bytes).buffer;
}
