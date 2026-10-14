import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  altNummerAttSkriva, delaIgnorerade, hamtaAltNummer, ignoreradNyckel, nummerbyten, hogarObjektIds, namnLika, namnUrHprFilnamn, nyckelDelar, nyckelHorTillObjekt, okopplatJobb, stamObjektId, troligaObjekt,
  type AltNummerRad, type HprFilRad, type ObjektNamnRad,
} from './objektNummer';

const M = 'PONS20SDJAA270231';
// De fyra riktiga filerna ur produktionen (2026-10-14)
const F_BAGSKYTT: HprFilRad = { filnamn: `Bågskyttebanan RP J-Hus- 25_${M}_20261013082121.hpr`, objekt_nyckel: `${M}:11271849`, fil_datum: '2026-10-13T08:00:00Z', stammar_count: 900 };
const F_MOLLERYD: HprFilRad = { filnamn: `Mölleryd RP J-Hus -25_${M}_20261013091500.hpr`, objekt_nyckel: `${M}:11271883`, fil_datum: '2026-10-13T09:00:00Z', stammar_count: 700 };
const F_VALLUST: HprFilRad = { filnamn: `Gallring Vällust_${M}_20261013101010.hpr`, objekt_nyckel: `${M}:k132`, fil_datum: '2026-10-13T10:00:00Z', stammar_count: 300 };
const F_FLYTT: HprFilRad = { filnamn: `Flyttobjekt_${M}_20261013111111.hpr`, objekt_nyckel: `${M}:k7`, fil_datum: '2026-10-13T11:00:00Z', stammar_count: 2 };
const FILER = [F_BAGSKYTT, F_MOLLERYD, F_VALLUST, F_FLYTT];

const OBJEKT: ObjektNamnRad[] = [
  { id: 'u-bagskytt', namn: 'Bågskyttebanan RP J-Hus- 25', vo_nummer: '11166440' },
  { id: 'u-molleryd', namn: 'Mölleryd RP J-Hus -25', vo_nummer: '11166477' },
  { id: 'u-vallust', namn: 'Vällust RP M-R -25', vo_nummer: '11200001' },
];
const ALIAS_NAMN: AltNummerRad[] = [
  { objekt_id: 'u-bagskytt', nummer: '11271849', maskin_id: null },
  { objekt_id: 'u-molleryd', nummer: '11271883', maskin_id: null },
];

describe('okopplatJobb — de fyra exemplen', () => {
  it('utan extra nummer syns alla fyra (ordernumren matchar inget vo_nummer)', () => {
    const l = okopplatJobb(FILER, OBJEKT, []);
    expect(l.map((j) => j.filnamn).sort()).toEqual(FILER.map((f) => f.filnamn).sort());
  });

  it('efter att importen kopplat de två via namn (alias sparat) återstår Vällust och Flyttobjekt — och syns', () => {
    const l = okopplatJobb(FILER, OBJEKT, ALIAS_NAMN);
    expect(l.map((j) => j.namn)).toEqual(['Flyttobjekt', 'Gallring Vällust']);        // senast först
    expect(l.every((j) => j.kanKopplas)).toBe(true);
  });

  it('en fil vars nummer ÄR objektets vo_nummer är kopplad och syns inte', () => {
    const rad: HprFilRad = { ...F_BAGSKYTT, objekt_nyckel: `${M}:11166440` };
    expect(okopplatJobb([rad], OBJEKT, [])).toEqual([]);
  });

  it('k-nummer är per maskin: aliaset gäller bara maskinen det sparades för', () => {
    const alias: AltNummerRad[] = [{ objekt_id: 'u-vallust', nummer: 'k132', maskin_id: M }];
    expect(okopplatJobb([F_VALLUST], OBJEKT, alias)).toEqual([]);
    const annanMaskin: HprFilRad = { ...F_VALLUST, objekt_nyckel: 'R64101:k132' };
    expect(okopplatJobb([annanMaskin], OBJEKT, alias)).toHaveLength(1);
  });

  it('Vällust kopplas för hand: raden som skrivs är k-numret med maskinen, källa manuell', () => {
    const jobb = okopplatJobb([F_VALLUST], OBJEKT, [])[0];
    expect(altNummerAttSkriva(jobb, 'u-vallust')).toEqual({
      objekt_id: 'u-vallust', nummer: 'k132', maskin_id: M, kalla: 'manuell', filnamn: F_VALLUST.filnamn,
    });
    // ...och därefter försvinner den ur listan
    expect(okopplatJobb([F_VALLUST], OBJEKT, [{ objekt_id: 'u-vallust', nummer: 'k132', maskin_id: M }])).toEqual([]);
  });

  it('kontraktsnummer sparas utan maskin (gäller alla maskiner)', () => {
    const jobb = okopplatJobb([F_BAGSKYTT], OBJEKT, [])[0];
    expect(altNummerAttSkriva(jobb, 'u-bagskytt')).toMatchObject({ nummer: '11271849', maskin_id: null, kalla: 'manuell' });
  });
});

describe('okopplatJobb — övrigt', () => {
  it('en rad per nyckel: den senaste filen', () => {
    const gammal: HprFilRad = { ...F_VALLUST, filnamn: 'Gallring Vällust_X_20261001000000.hpr', fil_datum: '2026-10-01T00:00:00Z' };
    const l = okopplatJobb([gammal, F_VALLUST], OBJEKT, []);
    expect(l).toHaveLength(1);
    expect(l[0].filnamn).toBe(F_VALLUST.filnamn);
  });

  it('fil utan nyckel försvinner inte — den visas men kan inte kopplas här', () => {
    const l = okopplatJobb([{ filnamn: 'Gammal fil.hpr', objekt_nyckel: null, fil_datum: null, stammar_count: 5 }], OBJEKT, []);
    expect(l).toHaveLength(1);
    expect(l[0].kanKopplas).toBe(false);
    expect(altNummerAttSkriva(l[0], 'u-bagskytt')).toBeNull();
  });

  it('nyckel med form tabellen inte tillåter kan inte kopplas (skrivningen skulle avvisas)', () => {
    const l = okopplatJobb([{ filnamn: 'X.hpr', objekt_nyckel: `${M}:abc`, fil_datum: null }], OBJEKT, []);
    expect(l[0].kanKopplas).toBe(false);
  });

  it('inga filer → tom lista', () => {
    expect(okopplatJobb([], OBJEKT, [])).toEqual([]);
  });
});

describe('troligaObjekt — namn utan skillnad i mellanslag/versaler', () => {
  it('de två namnkopplade exemplen hittar sitt objekt', () => {
    const [b] = okopplatJobb([F_BAGSKYTT], OBJEKT, []);
    expect(troligaObjekt(b, OBJEKT).map((o) => o.id)).toEqual(['u-bagskytt']);
    const [m] = okopplatJobb([F_MOLLERYD], OBJEKT, []);
    expect(troligaObjekt(m, OBJEKT).map((o) => o.id)).toEqual(['u-molleryd']);
  });
  it('Vällust och Flyttobjekt har inga träffar', () => {
    for (const f of [F_VALLUST, F_FLYTT]) expect(troligaObjekt(okopplatJobb([f], OBJEKT, [])[0], OBJEKT)).toEqual([]);
  });
  it('namnLika: mellanslag och versaler, inte skiljetecken', () => {
    expect(namnLika('Mölleryd  RP J-hus -25', 'Mölleryd RP J-Hus -25')).toBe(true);
    expect(namnLika('J-Hus -25', 'J Hus 25')).toBe(false);
    expect(namnLika('', '')).toBe(false);
    expect(namnLika(null, 'x')).toBe(false);
  });
});

describe('läsarna: nyckel och högar tar med extra nummer', () => {
  it('nyckelDelar', () => {
    expect(nyckelDelar(`${M}:11271849`)).toEqual({ maskin: M, ident: '11271849' });
    expect(nyckelDelar('inget')).toBeNull();
    expect(nyckelDelar(':123')).toBeNull();
    expect(nyckelDelar('M:')).toBeNull();
    expect(nyckelDelar(null)).toBeNull();
  });
  it('nyckelHorTillObjekt: vo_nummer ELLER extra nummer', () => {
    const alt = [{ nummer: '11271849', maskin_id: null }];
    expect(nyckelHorTillObjekt(`${M}:11166440`, '11166440', alt)).toBe(true);     // som förut
    expect(nyckelHorTillObjekt(`${M}:11271849`, '11166440', alt)).toBe(true);     // extra nummer
    expect(nyckelHorTillObjekt(`${M}:11271849`, '11166440', [])).toBe(false);     // utan alias: som förut
    expect(nyckelHorTillObjekt(`${M}:11999999`, '11166440', alt)).toBe(false);
    expect(nyckelHorTillObjekt(null, '11166440', alt)).toBe(false);
  });
  it('k-nummer gäller bara sin maskin', () => {
    const alt = [{ nummer: 'k132', maskin_id: M }];
    expect(nyckelHorTillObjekt(`${M}:k132`, '11200001', alt)).toBe(true);
    expect(nyckelHorTillObjekt('R64101:k132', '11200001', alt)).toBe(false);
  });
  it('hogarObjektIds: vo + kontraktsnummer-alias + maskinens id för k-nummer; inga dubbletter', () => {
    expect(hogarObjektIds('11166440', [])).toEqual(['11166440']);
    expect(hogarObjektIds('11166440', [{ nummer: '11271849', maskin_id: null }, { nummer: '11271849', maskin_id: null }, { nummer: '11166440', maskin_id: null }]))
      .toEqual(['11166440', '11271849']);
    expect(hogarObjektIds('11200001', [{ nummer: 'k132', maskin_id: M }])).toEqual(['11200001', `${M}_132`]);
    expect(stamObjektId({ nummer: 'k132', maskin_id: M })).toBe(`${M}_132`);          // importens make_objekt_id: maskin_id + '_' + ObjectKey
  });
});

describe('namnUrHprFilnamn', () => {
  it('Ponsse och Rottne', () => {
    expect(namnUrHprFilnamn(F_BAGSKYTT.filnamn, M)).toBe('Bågskyttebanan RP J-Hus- 25');
    expect(namnUrHprFilnamn('Hössjömåla AU 2026-10-13 0753.hpr', 'R64101')).toBe('Hössjömåla AU');
    expect(namnUrHprFilnamn(`${M}_20261013082121.hpr`, M)).toBeNull();
  });
});

describe('hamtaAltNummer — fel är aldrig ett kast', () => {
  const klient = (svar: any) => ({ from: () => ({ select: () => ({ eq: () => Promise.resolve(svar) }) }) }) as any;
  it('läser objektets extra nummer', async () => {
    expect(await hamtaAltNummer(klient({ data: [{ nummer: '11271849', maskin_id: null }], error: null }), 'u')).toEqual([{ nummer: '11271849', maskin_id: null }]);
  });
  it('tabellen saknas (migrationen ej körd) eller läsfel → [] — appen beter sig som förut', async () => {
    const varna = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await hamtaAltNummer(klient({ data: null, error: { message: 'relation does not exist' } }), 'u')).toEqual([]);
    expect(await hamtaAltNummer({ from: () => { throw new Error('boom'); } } as any, 'u')).toEqual([]);
    varna.mockRestore();
  });
  it('inget objekt-id → [] utan att fråga', async () => {
    expect(await hamtaAltNummer({ from: () => { throw new Error('ska inte anropas'); } } as any, null)).toEqual([]);
  });
});

describe('källvakt: planeringsvyn läser objektets extra nummer', () => {
  const page = readFileSync(resolve(__dirname, '../app/planering/page.tsx'), 'utf8');
  it('produktionshögarna läses på vo + extra nummer, inte bara vo', () => {
    expect(page).toContain("const hogarIds = hogarObjektIds(vo, await hamtaAltNummer(supabase, valtObjekt.id));");
    expect(page).toContain(".in('objekt_id', hogarIds).not('latitude', 'is', null);");
    expect(page).toContain(".in('objekt_id', hogarIds)\n            .not('latitude', 'is', null)");
    expect(page).not.toContain(".eq('objekt_id', vo)");
  });
  it('"kvar att köra" väljer filen på vo ELLER extra nummer', () => {
    expect(page).toContain('.filter(f => nyckelHorTillObjekt(f.objekt_nyckel, vo, altNummer))');
    expect(page).not.toContain("split(':')[1] === vo");
  });
});

describe('nummerbyten — importen bytte objekt.vo_nummer', () => {
  it('bara rader med byte_till är byten; namnet ur objektet; vanliga extra nummer är det inte', () => {
    const alias: AltNummerRad[] = [
      { id: 'a1', objekt_id: 'u-bagskytt', nummer: '11166440', maskin_id: null, byte_till: '11271849' },
      { id: 'a2', objekt_id: 'u-molleryd', nummer: '11271883', maskin_id: null },
      { id: 'a3', objekt_id: 'u-vallust', nummer: 'k132', maskin_id: M, byte_till: null },
    ];
    expect(nummerbyten(alias, OBJEKT)).toEqual([{ aliasId: 'a1', objektId: 'u-bagskytt', objektNamn: 'Bågskyttebanan RP J-Hus- 25', gammalt: '11166440', nytt: '11271849' }]);
  });
  it('rad utan id kan inte ångras och visas inte', () => {
    expect(nummerbyten([{ objekt_id: 'u', nummer: '1', maskin_id: null, byte_till: '2' }], OBJEKT)).toEqual([]);
  });
  it('ett bytt gamla nummer räknas som extra nummer: filer under det gamla numret är kopplade', () => {
    const alias: AltNummerRad[] = [{ id: 'a1', objekt_id: 'u-bagskytt', nummer: '11166440', maskin_id: null, byte_till: '11271849' }];
    const gammalFil: HprFilRad = { ...F_BAGSKYTT, objekt_nyckel: `${M}:11166440` };
    expect(okopplatJobb([gammalFil, F_BAGSKYTT], [{ id: 'u-bagskytt', namn: 'B', vo_nummer: '11271849' }], alias)).toEqual([]);
  });
});

describe('Ignorera — döljer, rör inget', () => {
  it('nyckeln är objekt_nyckel, eller fil:<filnamn> utan nyckel', () => {
    expect(ignoreradNyckel({ nyckel: `${M}:k7`, filnamn: 'x.hpr' })).toBe(`${M}:k7`);
    expect(ignoreradNyckel({ nyckel: null, filnamn: 'Gammal fil.hpr' })).toBe('fil:Gammal fil.hpr');
  });
  it('delaIgnorerade: synliga och ignorerade, inget försvinner', () => {
    const jobb = okopplatJobb(FILER, OBJEKT, []);
    const d = delaIgnorerade(jobb, new Set([`${M}:k7`]));
    expect(d.ignorerade.map((j) => j.namn)).toEqual(['Flyttobjekt']);
    expect(d.synliga).toHaveLength(3);
    expect(d.synliga.length + d.ignorerade.length).toBe(jobb.length);
    expect(delaIgnorerade(jobb, new Set()).ignorerade).toEqual([]);
  });
});
