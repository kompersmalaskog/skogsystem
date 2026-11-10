import { describe, expect, it } from 'vitest';
import { BILD_B, BILD_H, DEL_ORDNING, TRAFF_RADIE, bildTyp, delNamn, delar, franLagring, tillLagring, tryck, valjDel } from './maskinBild';
import { felText } from './atgarder';

describe('maskinbilden', () => {
  it('maskintypen avgör teckningen; okänd typ ger ingen', () => {
    expect(bildTyp('Harvester')).toBe('skordare');
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
    for (const typ of ['skordare', 'skotare'] as const) {
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
  });
});
