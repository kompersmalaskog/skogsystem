import { describe, expect, it } from 'vitest';
import { extractText, getDocumentProxy } from 'unpdf';
import { byggRapportVy, slug } from './vy';
import { projicera, sanera, skapaMarkagarPdf, tillMercator } from './pdf';
import type { MarkagarRapport } from './types';

const data: MarkagarRapport = {
  objekt: { objekt_id: '11124938', namn: 'Husjönäs 1:18 JE-G LRK -25', skogsagare: 'Anna Svensson', atgard: null, forsta_datum: '2026-02-16', operator: '–', maskin: '–' },
  oversikt: { yta_ha: null, yta_kalla: null, stammar: 1349, volym_m3sub: 678.4, virkesvarde_kr: 433163.2 },
  karta: {
    stammar: Array.from({ length: 3000 }, (_, i) => ({
      lat: 56.6 + (i % 60) * 0.0001, lng: 15.4 + Math.floor(i / 60) * 0.0002, dbh_mm: 150 + (i % 300),
      rot_typ: i % 9 === 0 ? 'bmav' : null, tradslag: ['GRAN', 'TALL', 'BJÖRK'][i % 3],
    })),
  },
  tradslag: [
    { namn: 'Gran', volym_m3sub: 424.8, andel_pct: 62.6, stammar: 924, medeldiameter_cm: 25.2 },
    { namn: 'Tall', volym_m3sub: 239.4, andel_pct: 35.3, stammar: 359, medeldiameter_cm: 31.1 },
    { namn: 'Björk', volym_m3sub: 14.2, andel_pct: 2.1, stammar: 66, medeldiameter_cm: 18 },
  ],
  rotrota: { stammar_med_rot: 235, bmav_count: 207, avkap_count: 28, grade9_count: 0, gran_stammar: 924, gran_med_rot: 235, pct_av_gran: 25.4, rotpaverkad_volym_m3: 0, rotpaverkad_pct: 0, vardeforlust_kr: -26382, vardeforlust_pct: 0, rotandel_pct: 0 },
  avkap_skicklighet: { totalt: 28, lyckade: 23, raddat_kr: 2597.4, raddad_volym_m3: 0, utfall: { lyckad: 23, misslyckad: 0, avkap_igen: 0, ovrigt: 5 } },
  fordelning: [
    { grupp: 'Timmer', volym_m3sub: 378.8, volym_andel_pct: 0, varde_kr: 0, varde_andel_pct: 0 },
    { grupp: 'Kubb', volym_m3sub: 135, volym_andel_pct: 0, varde_kr: 0, varde_andel_pct: 0 },
    { grupp: 'Massa', volym_m3sub: 146.8, volym_andel_pct: 0, varde_kr: 0, varde_andel_pct: 0 },
    { grupp: 'Energi', volym_m3sub: 17.8, volym_andel_pct: 0, varde_kr: 0, varde_andel_pct: 0 },
  ],
  timmer_top2: [],
  stubbar: { behandlade: 0, totalt: 0 },
  sortiment: [{ sortiment_id: 'Timmer: Gran', namn: 'Timmer: Gran', tradslag: 'GRAN', klass: null, stockar: 900, volym_m3sub: 300, varde_kr: 195000 }],
};

async function texten(bytes: Uint8Array): Promise<{ text: string; sidor: number }> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });
  return { text: text.replace(/\s+/g, ' '), sidor: totalPages };
}

describe('markägarrapportens PDF', () => {
  it('bär samma svar och frågor som sidan, och kartan på en egen sida', async () => {
    const vy = byggRapportVy(data);
    const { text, sidor } = await texten(await skapaMarkagarPdf(vy, data.karta.stammar, '2026-10-21'));
    expect(sidor).toBe(2);
    for (const s of ['Till Anna Svensson · 21 oktober 2026', 'Virket från skogen är värt', '433 163 kr',
      'Vad blev virket?', 'blir papper', 'Vilka träd växte här?', 'Björk', 'Var granarna friska?', '3 av 4 granar var friska',
      '-26 382 kr', 'Föraren sparade', 'Här växte träden', 'Röta i roten', 'sida 2 av 2']) {
      expect(text).toContain(s);
    }
  });

  it('facktermerna är inte med — de hör till Mer på skärmen', async () => {
    const { text } = await texten(await skapaMarkagarPdf(byggRapportVy(data), data.karta.stammar, '2026-10-21'));
    expect(text).not.toContain('Timmer: Gran');
    expect(text).not.toContain('Bmav');
  });

  it('utan positioner blir det ingen kartsida', async () => {
    const { text, sidor } = await texten(await skapaMarkagarPdf(byggRapportVy(data), [], '2026-10-21'));
    expect(sidor).toBe(1);
    expect(text).not.toContain('Här växte träden');
  });

  it('utan skogsägare står bara datumet', async () => {
    const d = { ...data, objekt: { ...data.objekt, skogsagare: null } };
    const { text } = await texten(await skapaMarkagarPdf(byggRapportVy(d), [], '2026-10-21'));
    expect(text).not.toContain('Till ');
    expect(text).toContain('21 oktober 2026');
  });

  it('filnamn, tecken och kartans skala', () => {
    expect(slug('Husjönäs 1:18 JE-G LRK -25')).toBe('husjonas-1-18-je-g-lrk-25');
    expect(byggRapportVy(data).filnamn).toBe('markagarrapport-husjonas-1-18-je-g-lrk-25');
    expect(sanera('−26 382 m³ · ✓')).toBe('-26 382 m³ · ?');
    // Lika skala i båda led: en trakt dubbelt så bred som hög (i meter) blir dubbelt så bred som hög.
    const cos = Math.cos((56.6 * Math.PI) / 180);
    const { punkter, h } = projicera([
      { lat: 56.6, lng: 15.4, dbh_mm: 200, rot_typ: null, tradslag: 'GRAN' },
      { lat: 56.601, lng: 15.4 + 0.002 / cos, dbh_mm: 200, rot_typ: null, tradslag: 'GRAN' },
    ], 420, 600);
    const b = punkter[1].x - punkter[0].x;
    const hh = punkter[0].y - punkter[1].y;
    expect(b / hh).toBeCloseTo(2, 3);
    expect(h).toBeLessThanOrEqual(600);
  });

  it('flygfotot hämtas för exakt kartans ruta och ligger bakom prickarna', async () => {
    const anrop: { ruta: number[]; b: number; h: number }[] = [];
    const jpg = Uint8Array.from(Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAAGAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDhKKKK4DzD/9k=', 'base64'));
    const bytes = await skapaMarkagarPdf(byggRapportVy(data), data.karta.stammar, '2026-10-21', async (ruta, b, h) => {
      anrop.push({ ruta, b, h });
      return jpg;
    });
    expect(anrop).toHaveLength(1);
    const { ruta, b, h } = anrop[0];
    // Fotot har samma form som rutan (ingen förvrängning) och 2 px per punkt.
    expect((ruta[2] - ruta[0]) / (ruta[3] - ruta[1])).toBeCloseTo(b / h, 2);
    expect(b).toBe(Math.round((595.28 - 96) * 2));
    // Varje stam ligger inne i fotots ruta.
    for (const s of data.karta.stammar) {
      const [x, y] = tillMercator(s.lng, s.lat);
      expect(x).toBeGreaterThan(ruta[0]); expect(x).toBeLessThan(ruta[2]);
      expect(y).toBeGreaterThan(ruta[1]); expect(y).toBeLessThan(ruta[3]);
    }
    const lib = await import('pdf-lib');
    const doc = await lib.PDFDocument.load(bytes);
    const bilder = doc.context.enumerateIndirectObjects().filter(([, o]) => (o as any)?.dict?.get?.(lib.PDFName.of('Subtype')) === lib.PDFName.of('Image'));
    expect(bilder).toHaveLength(1);
    expect((await texten(bytes)).text).not.toContain('Flygfotot gick inte');
  });

  it('går flygfotot inte att hämta ritas kartan ändå, och det står', async () => {
    const { text, sidor } = await texten(await skapaMarkagarPdf(byggRapportVy(data), data.karta.stammar, '2026-10-21', async () => null));
    expect(sidor).toBe(2);
    expect(text).toContain('Här växte träden');
    expect(text).toContain('Flygfotot gick inte att hämta');
    const kastar = await texten(await skapaMarkagarPdf(byggRapportVy(data), data.karta.stammar, '2026-10-21', async () => { throw new Error('nät'); }));
    expect(kastar.text).toContain('Flygfotot gick inte att hämta');
  });
});
