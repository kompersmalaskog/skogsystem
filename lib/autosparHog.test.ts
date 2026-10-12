import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { andradeKolumner, delarSomText, djupLika, kolumnerSomInteLandade } from './autosparBaslinje';
import {
  avlaggAttSkriva, avlaggBaslinjeFran, avlaggKolumner, harAnvandarinnehall, mergaAvlagg, AVLAGG_STD_CHECKLISTA, type AvlaggMarkor,
} from './avlaggSpar';
import {
  tmaAttSkriva, tmaBaslinjeFran, tmaKolumner, tmaRisknivå, tmaVagKolumner, tmaVardenFranRader, type TmaRiskSvar, type TmaSamrad,
} from './tmaSpar';
import {
  BRAND_STD_KONTAKTER, brandAttSkriva, brandKolumnerFranVarden, brandVardenFranRader, type BrandVarden,
} from './brandSpar';

// ═════════════════════════════════ bas ═════════════════════════════════
describe('autosparBaslinje', () => {
  it('djupLika: nyckelordning och undefined-nycklar spelar ingen roll, arrayordning gör det', () => {
    expect(djupLika({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1, z: undefined })).toBe(true);
    expect(djupLika([1, 2], [2, 1])).toBe(false);
    expect(djupLika(null, undefined)).toBe(false);
  });
  it('andradeKolumner: bara kolumnerna som skiljer', () => {
    expect(andradeKolumner({ a: 1, b: [1, 2], c: null }, { a: 1, b: [1, 3], c: null })).toEqual({ b: [1, 3] });
    expect(andradeKolumner({ a: 1 }, { a: 1 })).toEqual({});
  });
  it('kolumnerSomInteLandade pekar ut vad som inte kom tillbaka (och allt om ingen rad kom)', () => {
    expect(kolumnerSomInteLandade({ a: 1, b: { x: 1, y: 2 } }, { a: 1, b: { y: 2, x: 1 } })).toEqual([]);
    expect(kolumnerSomInteLandade({ a: 1, b: 2 }, { a: 1, b: 9 })).toEqual(['b']);
    expect(kolumnerSomInteLandade({ a: 1 }, null)).toEqual(['a']);
  });
  it('delarSomText: fast ordning, svenska', () => {
    expect(delarSomText({})).toBe('');
    expect(delarSomText({ tma: true })).toBe('TMA');
    expect(delarSomText({ brand: true, avlagg: true })).toBe('avlägg och brand');
    expect(delarSomText({ tma: true, avlagg: true, brand: true })).toBe('avlägg, brand och TMA');
  });
});

// ═════════════════════════════════ avlägg ═════════════════════════════════
const landing = (id: string, extra: Partial<AvlaggMarkor> & { type?: string } = {}): AvlaggMarkor & { type: string } => ({ id, x: 10, y: 20, type: 'landing', ...extra });
const sokt = { status: 'ok', tillstand: 'sokt', checklist: [true, false, false, false, false, false, false, false, false, false, false] };

describe('avlägg: öppna utan att ändra → ingen skrivning', () => {
  it('oförändrade avlägg (med och utan sparad DB-rad) ger inga skrivningar', () => {
    const markers = [landing('1'), landing('2', { comment: 'bom', roadCheck: sokt as any }), landing('3', { photoData: 'data:image/jpeg;base64,AAAA' })];
    const bas = avlaggBaslinjeFran(markers);
    const { skriv, tystaNya } = avlaggAttSkriva(bas, markers);
    expect(skriv).toEqual([]);
    expect(tystaNya).toEqual([]);
  });
  it('efter att DB-raden flätats in är baslinjen det sammanslagna — fortfarande ingen skrivning', () => {
    const db = [{ marker_id: '1', comment: 'Vändplan', tillstand: 'beviljat', checklist: [true, true, true, true, true, true, true, true, true, true, true] }];
    const merged = mergaAvlagg([landing('1'), landing('2')], db);
    expect(merged[0].comment).toBe('Vändplan');
    expect((merged[0] as any).roadCheck.tillstand).toBe('beviljat');
    const bas = avlaggBaslinjeFran(merged);
    expect(avlaggAttSkriva(bas, merged).skriv).toEqual([]);
  });
  it('vägkontrollens härledda data (nearestRoad m.m.) utlöser ALDRIG en skrivning', () => {
    const m0 = landing('1');
    const bas = avlaggBaslinjeFran([m0]);
    const m1 = { ...m0, roadCheck: { status: 'ok', tillstand: 'ej_sokt', nearestRoad: { name: 'Skogsvägen', type: 'track', maxspeed: 50 }, roadCategory: 'enskild' } } as any;
    expect(avlaggAttSkriva(bas, [m1]).skriv).toEqual([]);
  });
});

describe('avlägg: bara det som ändrats skrivs', () => {
  const m0 = landing('1', { comment: 'a', photoData: 'data:FOTO', roadCheck: { status: 'ok', tillstand: 'ej_sokt' } as any });
  const bas = avlaggBaslinjeFran([m0]);
  it('ändrad kommentar → bara comment (fotot laddas INTE upp igen)', () => {
    const { skriv } = avlaggAttSkriva(bas, [{ ...m0, comment: 'b' }]);
    expect(skriv).toHaveLength(1);
    expect(skriv[0].kolumner).toEqual({ comment: 'b' });
    expect(skriv[0].ny).toBe(false);
    expect(skriv[0].flyttad).toBe(false);
    expect('photo_data' in skriv[0].kolumner).toBe(false);
  });
  it('sökt/beviljat och checklista → bara de kolumnerna', () => {
    const { skriv } = avlaggAttSkriva(bas, [{ ...m0, roadCheck: { ...m0.roadCheck, tillstand: 'sokt', checklist: [true, ...AVLAGG_STD_CHECKLISTA.slice(1)] } as any }]);
    expect(Object.keys(skriv[0].kolumner).sort()).toEqual(['checklist', 'tillstand']);
  });
  it('flyttat avlägg → flyttad=true (lat/lon följer med), inga användarkolumner', () => {
    const { skriv } = avlaggAttSkriva(bas, [{ ...m0, x: 99 }]);
    expect(skriv).toHaveLength(1);
    expect(skriv[0].flyttad).toBe(true);
    expect(skriv[0].kolumner).toEqual({});
  });
  it('ändra och ändra tillbaka → ingen skrivning', () => {
    expect(avlaggAttSkriva(bas, [{ ...m0, comment: 'a' }]).skriv).toEqual([]);
  });
  it('bara det ändrade avlägget skrivs, inte de andra', () => {
    const tre = [landing('1'), landing('2'), landing('3')];
    const b = avlaggBaslinjeFran(tre);
    const { skriv } = avlaggAttSkriva(b, [tre[0], { ...tre[1], comment: 'x' }, tre[2]]);
    expect(skriv.map((s) => s.markerId)).toEqual(['2']);
  });
});

describe('avlägg: nya avlägg', () => {
  it('nytt avlägg utan innehåll skrivs inte (hamnar bara i baslinjen)', () => {
    const { skriv, tystaNya } = avlaggAttSkriva(new Map(), [landing('9')]);
    expect(skriv).toEqual([]);
    expect(tystaNya.map(([id]) => id)).toEqual(['9']);
  });
  it('nytt avlägg med kommentar skapas — hela raden', () => {
    const { skriv } = avlaggAttSkriva(new Map(), [landing('9', { comment: 'ny' })]);
    expect(skriv).toHaveLength(1);
    expect(skriv[0].ny).toBe(true);
    expect(Object.keys(skriv[0].kolumner).sort()).toEqual(['checklist', 'comment', 'generellt_tillstand_applied', 'photo_data', 'requires_special_permit', 'tillstand']);
  });
  it('harAnvandarinnehall', () => {
    expect(harAnvandarinnehall(avlaggKolumner(landing('1')))).toBe(false);
    expect(harAnvandarinnehall(avlaggKolumner(landing('1', { comment: 'x' })))).toBe(true);
    expect(harAnvandarinnehall(avlaggKolumner(landing('1', { roadCheck: sokt as any })))).toBe(true);
  });
});

describe('avlägg: mergaAvlagg', () => {
  it('tom DB → samma array; markör utan rad och icke-avlägg orörda; DB fyller i det markören saknar', () => {
    const ms = [landing('1'), { id: '5', x: 0, y: 0, type: 'gate' } as any];
    expect(mergaAvlagg(ms, [])).toBe(ms);
    const r = mergaAvlagg(ms, [{ marker_id: '5', comment: 'ska ignoreras' }, { marker_id: '2', comment: 'ingen markör' }]);
    expect(r[0]).toBe(ms[0]);
    expect(r[1]).toBe(ms[1]);
    const r2 = mergaAvlagg([landing('1', { comment: 'lokal' })], [{ marker_id: '1', comment: null, photo_data: 'FOTO', tillstand: 'sokt' }]);
    expect(r2[0].comment).toBe('lokal');
    expect(r2[0].photoData).toBe('FOTO');
    expect((r2[0] as any).roadCheck.tillstand).toBe('sokt');
  });
});

// ═════════════════════════════════ TMA ═════════════════════════════════
const IDAG = '2026-10-05';
const svar = (...v: (boolean | null)[]): TmaRiskSvar => v;
const SEX = svar(false, false, false, false, false, false, false);
const samrad = (extra: Partial<TmaSamrad> = {}): TmaSamrad => ({ fallare: 'Anders', tmaBil: true, checkboxes: [true, true, false, false, false, false], datum: '2026-09-01', kvitterad: true, kvitteradDatum: '2026-09-02', ...extra });

describe('TMA: ladda och öppna utan att ändra → ingen skrivning', () => {
  const rader = [
    { boundary_id: 'g1', risk_answers: SEX, samrad_data: samrad() },
    { boundary_id: 'g2', risk_answers: null, samrad_data: {} },          // rad finns men tom
    { boundary_id: 'g3', risk_answers: svar(true, null, null, null, null, null, null), samrad_data: null },
  ];
  it('formuläret direkt efter laddning ger inga skrivningar (även för tomma/halva rader)', () => {
    const { risk, samrad: sam } = tmaVardenFranRader(rader, IDAG);
    const bas = tmaBaslinjeFran(risk, sam);
    expect(tmaAttSkriva(bas, risk, sam)).toEqual([]);
  });
  it('tom DB → tomma objekt (aldrig föregående objekts gränser)', () => {
    expect(tmaVardenFranRader([], IDAG)).toEqual({ risk: {}, samrad: {} });
  });
  it('rad med samrad_data {} får normaliserade standardvärden med dagens datum', () => {
    const { samrad: sam } = tmaVardenFranRader(rader, IDAG);
    expect(sam.g2).toEqual({ fallare: '', tmaBil: null, checkboxes: [false, false, false, false, false, false], datum: IDAG, kvitterad: false, kvitteradDatum: '' });
  });
});

describe('TMA: bara det som ändrats skrivs', () => {
  const { risk, samrad: sam } = tmaVardenFranRader([{ boundary_id: 'g1', risk_answers: SEX, samrad_data: samrad() }, { boundary_id: 'g2', risk_answers: SEX, samrad_data: samrad({ kvitterad: false }) }], IDAG);
  const bas = tmaBaslinjeFran(risk, sam);

  it('ett riskfråge-svar på g1 → bara g1, risk_answers + risk_level (samrådet rörs inte)', () => {
    const r2 = { ...risk, g1: svar(true, ...SEX.slice(1)) };
    const s = tmaAttSkriva(bas, r2, sam);
    expect(s.map((x) => x.boundaryId)).toEqual(['g1']);
    expect(Object.keys(s[0].kolumner).sort()).toEqual(['risk_answers', 'risk_level']);
    expect('samrad_data' in s[0].kolumner).toBe(false);
  });
  it('kvittera samrådet på g2 → bara samrad_data', () => {
    const s = tmaAttSkriva(bas, risk, { ...sam, g2: { ...sam.g2, kvitterad: true } });
    expect(s).toHaveLength(1);
    expect(Object.keys(s[0].kolumner)).toEqual(['samrad_data']);
  });
  it('en NY gräns som besvaras skapas med alla tre kolumnerna', () => {
    const s = tmaAttSkriva(bas, { ...risk, g9: svar(true, null, null, null, null, null, null) }, sam);
    expect(s).toHaveLength(1);
    expect(s[0].ny).toBe(true);
    expect(Object.keys(s[0].kolumner).sort()).toEqual(['risk_answers', 'risk_level', 'samrad_data']);
    expect(s[0].kolumner.samrad_data).toEqual({});
  });
  it('ändra och ändra tillbaka → ingen skrivning', () => {
    expect(tmaAttSkriva(bas, { ...risk, g1: svar(true, ...SEX.slice(1)) }, sam)).not.toEqual([]);
    expect(tmaAttSkriva(bas, { ...risk, g1: [...SEX] }, sam)).toEqual([]);
  });
});

describe('TMA: vägkolumnerna (road_*)', () => {
  it('kontrollen laddar / felar / är klar utan väg → INGA vägkolumner alls (aldrig NULL som skriver över sparat)', () => {
    expect(tmaVagKolumner(undefined)).toEqual({});
    expect(tmaVagKolumner({ status: 'loading', roads: [] })).toEqual({});
    expect(tmaVagKolumner({ status: 'error', roads: [] })).toEqual({});
    expect(tmaVagKolumner({ status: 'done', roads: [] })).toEqual({});
  });
  it('klar med väg → fyra kolumner (ref · namn)', () => {
    expect(tmaVagKolumner({ status: 'done', roads: [{ ref: '123', name: 'Storvägen', maxspeed: 70, type: 'secondary', distance: 12 }] }))
      .toEqual({ road_name: '123 · Storvägen', road_speed: 70, road_type: 'secondary', distance_to_road: 12 });
  });
});

describe('TMA: risknivå (oförändrad logik)', () => {
  it('null tills alla sju är besvarade', () => expect(tmaRisknivå(svar(true, null, null, null, null, null, null))).toBeNull());
  it('alla nej → low; ett ja → medium; tre ja eller fråga 2 ja → high', () => {
    expect(tmaRisknivå(SEX)).toBe('low');
    expect(tmaRisknivå(svar(true, false, false, false, false, false, false))).toBe('medium');
    expect(tmaRisknivå(svar(true, true, false, false, false, false, false))).toBe('high');
    expect(tmaRisknivå(svar(true, false, true, true, false, false, false))).toBe('high');
  });
  it('vind (fråga 5) höjer ett steg', () => {
    expect(tmaRisknivå(svar(false, false, false, false, true, false, false))).toBe('high');   // 1 ja = medium → high
  });
  it('tmaKolumner med inga svar ger sju null och risk_level null', () => {
    expect(tmaKolumner(undefined, undefined)).toEqual({ risk_answers: [null, null, null, null, null, null, null], risk_level: null, samrad_data: {} });
  });
});

// ═════════════════════════════════ brand ═════════════════════════════════
const NU = '2026-10-05T09:30';
const SAM = { utrustning: [true, false, false, false], larm_checklista: [true, true, false, false, false], fwi_value: null };
const KONT = { uppdragsgivare_namn: 'Skog AB', uppdragsgivare_tel: '070-1', forsakringsbolag: 'Länsförsäkringar', forsakringsnummer: '123', raddningstjanst_namn: 'RTJ', raddningstjanst_tel: '112' };
const EK = { datum: '2026-09-01T10:00:00+00:00', noteringar: 'Ok', kvitterad: true };
const bas = (v: BrandVarden) => brandKolumnerFranVarden(v);

describe('brand: öppna utan att ändra → ingen skrivning', () => {
  for (const [namn, s, k, e] of [['alla rader finns', SAM, KONT, EK], ['inga rader alls', null, null, null], ['bara efterkontroll', null, null, EK], ['bara samråd', SAM, null, null]] as [string, any, any, any][]) {
    it(`${namn}: formuläret direkt efter laddning ger inga skrivningar`, () => {
      const v = brandVardenFranRader(s, k, e, NU);
      expect(brandAttSkriva(bas(v), v, null)).toEqual([]);
    });
  }
  it('saknade rader → defaults (kontakter från föregående objekt kan inte ligga kvar)', () => {
    const v = brandVardenFranRader(null, null, null, NU);
    expect(v.kontakter).toEqual(BRAND_STD_KONTAKTER);
    expect(v.utrustning).toEqual([false, false, false, false]);
    expect(v.larmChecklista).toEqual([false, false, false, false, false]);
    expect(v.efterkontroll).toEqual({ datum: NU, noteringar: '', kvitterad: false });
  });
  it('rad utan datum → efterkontrollens förval (nuDatum); med datum → ISO utan sekunder', () => {
    expect(brandVardenFranRader(null, null, { datum: null }, NU).efterkontroll.datum).toBe(NU);
    expect(brandVardenFranRader(null, null, EK, NU).efterkontroll.datum).toBe('2026-09-01T10:00');
  });
});

describe('brand: bara det som ändrats skrivs', () => {
  const v0 = brandVardenFranRader(SAM, KONT, EK, NU);
  const b0 = bas(v0);
  it('ändrat kontaktfält → bara brand_kontakter, bara den kolumnen', () => {
    const s = brandAttSkriva(b0, { ...v0, kontakter: { ...v0.kontakter, raddningstjanstTel: '0471-12345' } }, null);
    expect(s).toEqual([{ tabell: 'brand_kontakter', kolumner: { raddningstjanst_tel: '0471-12345' } }]);
  });
  it('ändrad utrustning → bara brand_samrad {utrustning}', () => {
    const s = brandAttSkriva(b0, { ...v0, utrustning: [true, true, false, false] }, null);
    expect(s).toEqual([{ tabell: 'brand_samrad', kolumner: { utrustning: [true, true, false, false] } }]);
  });
  it('kvittera efterkontroll → bara brand_efterkontroll {kvitterad}', () => {
    const s = brandAttSkriva(b0, { ...v0, efterkontroll: { ...v0.efterkontroll, kvitterad: false } }, null);
    expect(s).toEqual([{ tabell: 'brand_efterkontroll', kolumner: { kvitterad: false } }]);
  });
  it('tömt kontaktfält → null (inte tom sträng)', () => {
    const s = brandAttSkriva(b0, { ...v0, kontakter: { ...v0.kontakter, forsakringsnummer: '' } }, null);
    expect(s[0].kolumner).toEqual({ forsakringsnummer: null });
  });
});

describe('brand: fwi_value', () => {
  const v0 = brandVardenFranRader(SAM, KONT, EK, NU);
  const b0 = bas(v0);
  it('utlöser ALDRIG en sparning av sig själv (inget ändrat + ett FWI-värde → ingen skrivning)', () => {
    expect(brandAttSkriva(b0, v0, 17.3)).toEqual([]);
  });
  it('följer med brand_samrad när den ändå skrivs och ett värde finns', () => {
    const s = brandAttSkriva(b0, { ...v0, utrustning: [true, true, true, true] }, 17.3);
    expect(s[0].kolumner).toEqual({ utrustning: [true, true, true, true], fwi_value: 17.3 });
  });
  it('skrivs ALDRIG som null: panelen inte klar (null) → ingen fwi_value-nyckel', () => {
    const s = brandAttSkriva(b0, { ...v0, utrustning: [true, true, true, true] }, null);
    expect('fwi_value' in s[0].kolumner).toBe(false);
  });
  it('FWI 0 är ett riktigt värde och skrivs', () => {
    const s = brandAttSkriva(b0, { ...v0, utrustning: [true, true, true, true] }, 0);
    expect(s[0].kolumner.fwi_value).toBe(0);
  });
  it('fwi följer inte med andra tabeller', () => {
    const s = brandAttSkriva(b0, { ...v0, kontakter: { ...v0.kontakter, uppdragsgivareNamn: 'Ny AB' } }, 17.3);
    expect(s).toHaveLength(1);
    expect('fwi_value' in s[0].kolumner).toBe(false);
  });
});

// ═════════════════════════════════ vakt mot att hel-rad-sparningen återinförs ═════════════════════════════════
// Själva beteendet bevisas i riktig sida (testselen, PR-texten). Det här fångar bara den uppenbara regressionen i planeringsvyn.
describe('planeringsvyns avlägg/brand/TMA-autospar använder baslinje + ändrade kolumner', () => {
  const src = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const del = (start: string, slut: string) => { const a = src.indexOf(start); expect(a).toBeGreaterThan(0); return src.slice(a, src.indexOf(slut, a)); };
  const avlagg = del('// === AVLÄGG: Ladda sparad data från Supabase ===', '// === KARTA ===');
  const brand = del('// === BRAND: Ladda sparad data från Supabase ===', '// === TMA: Ladda sparad data från Supabase ===');
  const tma = del('// === TMA: Ladda sparad data från Supabase ===', '// === Varningsinställningar: Ladda från Supabase ===');

  it('avlägg: baslinje, objekt-id-vakt, testlägesvakt, bara ändrade rader; inga gamla ref-flaggor eller hel-upsert', () => {
    expect(avlagg).toContain('avlaggAttSkriva(ab.bas, landingMarkers)');
    expect(avlagg).toContain('markersObjektIdRef.current !== valtObjekt.id');
    expect(avlagg).toContain('testlageAktivRef.current');
    expect(avlagg).toContain("markeraAutosparFel('avlagg', true)");
    expect(avlagg).not.toContain('avlaggLoadedRef');
    expect(avlagg).not.toMatch(/\.upsert\(rows/);
  });
  it('brand: baslinje + ändrade tabeller; fwi_value skrivs aldrig ur brandRisk?.… || null; läsfel = ingen baslinje', () => {
    expect(brand).toContain('brandAttSkriva(bb.bas');
    expect(brand).toContain('testlageAktivRef.current');
    expect(brand).toContain("markeraAutosparFel('brand', true)");
    expect(brand).not.toContain('brandLoadedRef');
    expect(brand).not.toMatch(/fwi_value:\s*brandRisk/);
    expect(brand).not.toMatch(/from\('brand_(samrad|kontakter|efterkontroll)'\)\.upsert\(/);
  });
  it('TMA: baslinje + ändrade gränser; väginfo bara när klar; tmaResults utlöser aldrig sparning (inte i deps)', () => {
    expect(tma).toContain('tmaAttSkriva(tb.bas, tmaRisk, tmaSamrad)');
    expect(tma).toContain('tmaVagKolumner(tmaResults[s.boundaryId])');
    expect(tma).toContain('testlageAktivRef.current');
    expect(tma).toContain("markeraAutosparFel('tma', true)");
    expect(tma).toContain('[tmaRisk, tmaSamrad, valtObjekt?.id]');
    expect(tma).not.toContain('tmaLoadedRef');
    expect(tma).not.toMatch(/samrad_data:\s*samrad \|\| \{\}/);
  });
  it('varningen vid läsfel finns (data-testid) och markörladdningen nollar markersLoaded vid varje objektbyte', () => {
    expect(src).toContain('data-testid="autospar-fel"');
    expect(src).toMatch(/setMarkersLoaded\(false\);[^\n]*\n\s*if \(!valtObjekt\?\.id\) return;/);
  });
});
