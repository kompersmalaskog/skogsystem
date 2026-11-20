import { describe, expect, it } from 'vitest';
import { BILD_B, BILD_H, DEL_ORDNING, TRAFF_RADIE, bildTyp, bytSida, delNamn, delar, franLagring, sidaText, tillLagring, tryck, valjDel } from './maskinBild';
import { felText } from './atgarder';

describe('maskinbilden', () => {
  it('maskintypen avgör teckningen; okänd typ ger ingen', () => {
    expect(bildTyp('Harvester')).toBe('skordare');
    expect(bildTyp('Harvester', 'H8E')).toBe('skordare');
    expect(bildTyp('Harvester', 'PONSSE Scorpion Giant 8W')).toBe('skordare8');
    expect(delNamn('kran', 'skordare8')).toBe('Kran och aggregat');
    expect(bildTyp('Forwarder')).toBe('skotare');
    expect(bildTyp('Truck')).toBeNull();
    expect(bildTyp(null)).toBeNull();
  });

  it('delarna är Martins lista plus band och kran, i förarens ord', () => {
    expect(delar('skordare').map(d => d.namn)).toEqual([
      'Kran och aggregat', 'Lampa och ruta', 'Stege och handtag', 'Släckare', 'Nödstopp och brytare', 'Läckage', 'Slang och kabel', 'Band och kedjor',
    ]);
    expect(delNamn('kran', 'skotare')).toBe('Kran och grip');
    expect(delNamn('annat', 'skotare')).toBe('Annat ställe');
  });

  it('varje del ligger på teckningen och två delar är aldrig så nära att ett tryck blir tvetydigt', () => {
    for (const typ of ['skordare', 'skordare8', 'skotare'] as const) {
      const d = delar(typ);
      for (const a of d) {
        expect(a.x).toBeGreaterThan(0); expect(a.x).toBeLessThan(BILD_B);
        expect(a.y).toBeGreaterThan(0); expect(a.y).toBeLessThan(BILD_H);
        for (const b of d) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(TRAFF_RADIE * 1.5);
      }
    }
  });

  it('ett tryck nära en del väljer delen på delens plats; längre bort blir det Annat ställe där man tryckte', () => {
    const band = delar('skotare').find(d => d.id === 'band')!;
    expect(tryck('skotare', band.x + 10, band.y - 5)).toEqual({ del: 'band', x: band.x, y: band.y });
    expect(tryck('skotare', 380, 60)).toEqual({ del: 'annat', x: 380, y: 60 });
    expect(tryck('skotare', -1, 60)).toBeNull();
    expect(tryck('skotare', 10, BILD_H + 1)).toBeNull();
  });

  it('knapp och tryck ger samma val', () => {
    const k = delar('skordare').find(d => d.id === 'stege')!;
    expect(valjDel('skordare', 'stege')).toEqual(tryck('skordare', k.x, k.y));
  });

  it('lagras som 0..1 och läses tillbaka; trasigt värde ger ingen prick', () => {
    const v = { del: 'annat' as const, x: 200, y: 120 };
    const l = tillLagring(v);
    expect(l).toEqual({ maskin_del: 'annat', maskin_x: 0.5, maskin_y: 0.5 });
    expect(franLagring(l.maskin_del, l.maskin_x, l.maskin_y)).toEqual(v);
    expect(franLagring('motorn', 0.5, 0.5)).toBeNull();
    expect(franLagring('band', 1.2, 0.5)).toBeNull();
    expect(franLagring('band', null, 0.5)).toBeNull();
    for (const id of DEL_ORDNING) expect(franLagring(id, 0.1, 0.1)).not.toBeNull();
  });

  it('åtgärdens text får delen först', () => {
    const plats = { typ: 'skotare' as const, val: valjDel('skotare', 'band') };
    expect(felText({ beskrivning: 'Länk lös', plats })).toBe('Band och kedjor · Länk lös');
    expect(felText({ beskrivning: 'Fel rapporterat av föraren', plats })).toBe('Band och kedjor');
    expect(felText({ beskrivning: 'Länk lös', plats: null })).toBe('Länk lös');
    expect(felText({ beskrivning: 'Länk lös', plats: { typ: 'skotare', val: valjDel('skotare', 'band', 'hoger') } })).toBe('Band och kedjor, höger sida · Länk lös');
  });
});

describe('höger och vänster sida', () => {
  it('höger sida är vänster spegelvänd, samma höjd', () => {
    for (const typ of ['skordare', 'skordare8', 'skotare'] as const) {
      const v = delar(typ, 'vanster'), h = delar(typ, 'hoger');
      h.forEach((d, i) => { expect(d.x).toBe(BILD_B - v[i].x); expect(d.y).toBe(v[i].y); });
    }
  });
  it('ett tryck på höger sida väljer delen där den syns på höger sida', () => {
    const band = delar('skotare', 'hoger').find(d => d.id === 'band')!;
    expect(tryck('skotare', band.x, band.y, 'hoger')).toEqual({ del: 'band', x: band.x, y: band.y, sida: 'hoger' });
    expect(tryck('skotare', 380, 60, 'hoger')).toEqual({ del: 'annat', x: 380, y: 60, sida: 'hoger' });
  });
  it('byte av sida tar med delen, men inte "Annat ställe"', () => {
    expect(bytSida('skordare8', valjDel('skordare8', 'band', 'vanster'), 'hoger')).toEqual(valjDel('skordare8', 'band', 'hoger'));
    expect(bytSida('skordare8', { del: 'annat', x: 10, y: 10, sida: 'vanster' }, 'hoger')).toBeNull();
    expect(bytSida('skordare8', null, 'hoger')).toBeNull();
  });
  it('sidan sparas och läses tillbaka; okänd sida sägs aldrig', () => {
    const v = valjDel('skotare', 'stege', 'hoger');
    const l = tillLagring(v);
    expect(l.maskin_sida).toBe('hoger');
    const tillbaka = franLagring(l.maskin_del, l.maskin_x, l.maskin_y, l.maskin_sida)!;
    expect(tillbaka.del).toBe('stege');
    expect(tillbaka.sida).toBe('hoger');
    expect(tillbaka.x).toBeCloseTo(v.x, 0);
    expect(tillLagring({ del: 'band', x: 10, y: 10 })).not.toHaveProperty('maskin_sida');
    expect(franLagring('band', 0.1, 0.1, 'fram')!.sida).toBeUndefined();
    expect(sidaText({ sida: 'hoger' })).toBe('höger sida');
    expect(sidaText({})).toBeNull();
  });
});

