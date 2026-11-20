import { describe, it, expect } from 'vitest';
import {
  ligganMaskinens,
  valjSenasteSpar,
  senastePunkt,
  tolkaSparadPosition,
  valjStartPosition,
  senasteKurs,
  sparObjektGiltigt,
  valjPosObjekt,
  valjTilldelatObjekt,
  valjFlygPos,
  type HyttsparIndexRad,
  type ObjektTilldelning,
} from './maskinPosition';
import { objektInnehallerPunkt, valjObjektForPosition, type TraktGeometriFC, type ObjektForVal } from './objektPlats';
import { avgorMaskindatorStart } from './maskindatorStart';
import fixtur from './__fixtures__/hyttspar_index_2026-10-02.json';
import halabackTraktdel from './__fixtures__/halaback_au2025_traktdel.json';

// RIKTIG prod-data (service-REST 2026-10-02): hyttspar-index (utan points), objektens tilldelning, sista punkterna i
// senaste skotar-passet. I prod är hyttspar.maskin_id NULL på ALLA rader — spåret är maskinens via roll + objekt.
const INDEX = fixtur.index as HyttsparIndexRad[];
const OBJEKT = fixtur.objekt as (ObjektTilldelning & { namn: string; status: string })[];
const HB = halabackTraktdel as unknown as TraktGeometriFC;
const HALABACK_ID = '0a57ddbb-1bae-4080-ab56-d0972512525f';
const DANIELS_SKOTARE = 'A130743';

describe('fixturen är den data vi påstår (guard mot att någon byter ut den mot något påhittat)', () => {
  it('ingen rad har maskin_id → roll+objekt är enda vägen', () => {
    expect(INDEX.length).toBeGreaterThan(30);
    expect(INDEX.filter((r) => r.maskin_id).length).toBe(0);
  });
  it('Hålabäck au 2025 är avslutat men tilldelat A130743 som skotare', () => {
    const hb = OBJEKT.find((o) => o.id === HALABACK_ID)!;
    expect(hb.namn).toBe('Hålabäck au 2025');
    expect(hb.status).toBe('avslutat');
    expect(hb.skotare_maskin_id).toBe(DANIELS_SKOTARE);
  });
});

describe('valjSenasteSpar — maskinens senaste spår (roll + objekt)', () => {
  it('KODBEVIS: A130743 → Hålabäck au 2025, skotar-spåret 2026-10-02 (Daniels senaste)', () => {
    const rad = valjSenasteSpar({ maskinId: DANIELS_SKOTARE, index: INDEX, objekt: OBJEKT });
    expect(rad).not.toBeNull();
    expect(rad!.objekt_id).toBe(HALABACK_ID);
    expect(rad!.roll).toBe('skotare');
    expect(rad!.datum).toBe('2026-10-02');
    expect(rad!.antal_punkter).toBeGreaterThan(0);
  });

  it('roll måste matcha tilldelningen: ett SKÖRDAR-spår på ett objekt där maskinen bara är skotare är inte dess', () => {
    // 2026-09-23 skordare-raden på Östra-Hoka (skotare = A130743, skördare = Scorpion).
    const bara = INDEX.filter((r) => r.roll === 'skordare' && r.datum === '2026-09-23');
    expect(bara.length).toBeGreaterThan(0);
    expect(valjSenasteSpar({ maskinId: DANIELS_SKOTARE, index: bara, objekt: OBJEKT })).toBeNull();
  });

  it('skördaren får SKÖRDAR-rader (Scorpion → ett skordare-spår på objekt där den är skördare)', () => {
    const rad = valjSenasteSpar({ maskinId: 'PONS20SDJAA270231', index: INDEX, objekt: OBJEKT });
    expect(rad).not.toBeNull();
    expect(rad!.roll).toBe('skordare');
    const o = OBJEKT.find((x) => x.id === rad!.objekt_id)!;
    expect(o.skordare_maskin_id).toBe('PONS20SDJAA270231');
  });

  it('okänd maskin → null (ingen spår-rad är dess)', () => {
    expect(valjSenasteSpar({ maskinId: 'FINNS_INTE', index: INDEX, objekt: OBJEKT })).toBeNull();
  });

  it('tomma spår (antal_punkter 0/null) räknas inte — de har ingen position', () => {
    const objekt: ObjektTilldelning[] = [{ id: 'o1', skotare_maskin_id: 'M1' }];
    const index: HyttsparIndexRad[] = [
      { id: 'a', objekt_id: 'o1', roll: 'skotare', datum: '2026-10-02', antal_punkter: 0 },
      { id: 'b', objekt_id: 'o1', roll: 'skotare', datum: '2026-10-01', antal_punkter: null },
      { id: 'c', objekt_id: 'o1', roll: 'skotare', datum: '2026-09-30', antal_punkter: 12 },
    ];
    expect(valjSenasteSpar({ maskinId: 'M1', index, objekt })?.id).toBe('c');
  });

  it('samma datum: den senast uppdaterade raden vinner', () => {
    const objekt: ObjektTilldelning[] = [{ id: 'o1', skotare_maskin_id: 'M1' }, { id: 'o2', skotare_maskin_id: 'M1' }];
    const index: HyttsparIndexRad[] = [
      { id: 'tidig', objekt_id: 'o1', roll: 'skotare', datum: '2026-10-02', antal_punkter: 5, uppdaterad_at: '2026-10-02T08:00:00Z' },
      { id: 'sen', objekt_id: 'o2', roll: 'skotare', datum: '2026-10-02', antal_punkter: 5, uppdaterad_at: '2026-10-02T15:00:00Z' },
    ];
    expect(valjSenasteSpar({ maskinId: 'M1', index, objekt })?.id).toBe('sen');
  });

  it('rad med maskin_id satt: exakt match räknas utan objekt-koppling, och någon annans maskin_id aldrig', () => {
    const index: HyttsparIndexRad[] = [
      { id: 'min', objekt_id: null, roll: 'skotare', datum: '2026-10-02', antal_punkter: 3, maskin_id: 'M1' },
      { id: 'annans', objekt_id: 'o1', roll: 'skotare', datum: '2026-10-03', antal_punkter: 3, maskin_id: 'M2' },
    ];
    const objekt: ObjektTilldelning[] = [{ id: 'o1', skotare_maskin_id: 'M1' }];   // M1 är tilldelad o1, men raden är märkt M2
    expect(valjSenasteSpar({ maskinId: 'M1', index, objekt })?.id).toBe('min');
  });

  it('ligganMaskinens: objekt saknas i listan / ingen roll → false', () => {
    const tom = new Map<string, ObjektTilldelning>();
    expect(ligganMaskinens({ objekt_id: 'x', roll: 'skotare', maskin_id: null }, 'M1', tom)).toBe(false);
    expect(ligganMaskinens({ objekt_id: null, roll: 'skotare', maskin_id: null }, 'M1', tom)).toBe(false);
    const m = new Map([['o1', { id: 'o1', skotare_maskin_id: 'M1' }]]);
    expect(ligganMaskinens({ objekt_id: 'o1', roll: null, maskin_id: null }, 'M1', m)).toBe(false);
  });
});

describe('senastePunkt', () => {
  const sista5 = fixtur.senasteSkotarPass.sista5;

  it('riktig data: sista punkten i 2026-10-02-passet', () => {
    const p = senastePunkt(sista5)!;
    expect(p.lat).toBeCloseTo(56.3573062, 6);
    expect(p.lng).toBeCloseTo(15.0479767, 6);
    expect(p.tid).toBe('2026-10-02T13:24:44.886Z');
  });

  it('hoppar över ogiltiga svans-punkter och tar den sista GILTIGA', () => {
    const p = senastePunkt([{ lat: 1, lng: 2 }, { lat: 3, lng: 4 }, { lat: null, lng: 5 }, { lat: NaN, lng: 6 }, null]);
    expect(p).toEqual({ lat: 3, lng: 4, tid: null });
  });

  it('tomt / inte en array → null', () => {
    expect(senastePunkt([])).toBeNull();
    expect(senastePunkt(null)).toBeNull();
    expect(senastePunkt({ lat: 1, lng: 2 })).toBeNull();
  });
});

describe('senasteKurs — körriktningen ur spårets sista rörelse', () => {
  it('riktig data (Daniels sista punkter 2026-10-02): kör mot nord-nordväst, ≈ 338°', () => {
    const k = senasteKurs(fixtur.senasteSkotarPass.sista5)!;
    expect(k).toBeGreaterThan(335);
    expect(k).toBeLessThan(341);
  });
  it('de fyra väderstrecken', () => {
    const pt = (lat: number, lng: number) => ({ lat, lng });
    expect(senasteKurs([pt(56, 15), pt(56.0003, 15)])).toBeCloseTo(0, 0);        // norr
    expect(senasteKurs([pt(56, 15), pt(56, 15.0005)])).toBeCloseTo(90, 0);       // öster
    expect(senasteKurs([pt(56.0003, 15), pt(56, 15)])).toBeCloseTo(180, 0);      // söder
    expect(senasteKurs([pt(56, 15.0005), pt(56, 15)])).toBeCloseTo(270, 0);      // väster
  });
  it('stillastående (alla punkter inom 8 m) → null — ingen påhittad riktning', () => {
    expect(senasteKurs([{ lat: 56, lng: 15 }, { lat: 56.00002, lng: 15.00001 }, { lat: 56.00001, lng: 15 }])).toBeNull();
  });
  it('för få/ogiltiga punkter → null; ogiltiga punkter i svansen hoppas över', () => {
    expect(senasteKurs([])).toBeNull();
    expect(senasteKurs(null)).toBeNull();
    expect(senasteKurs([{ lat: 56, lng: 15 }])).toBeNull();
    expect(senasteKurs([{ lat: 56, lng: 15 }, { lat: 56.0003, lng: 15 }, { lat: null, lng: 1 }, { lat: NaN, lng: 2 }])).toBeCloseTo(0, 0);
  });
  it('bara de senaste punkterna räknas (maxBak) — en gammal rörelse påverkar inte slutriktningen', () => {
    const rad = [{ lat: 56, lng: 15 }, { lat: 56, lng: 15.001 }];                       // öster (gammalt)
    for (let k = 0; k < 90; k++) rad.push({ lat: 56, lng: 15.001 });                    // 90 stillastående punkter
    rad.push({ lat: 56.0003, lng: 15.001 });                                            // sista: norrut
    expect(senasteKurs(rad)).toBeCloseTo(0, 0);
  });
});

describe('KODBEVIS: spårets sista punkt ligger UTANFÖR traktgränsen → objektet måste komma ur spårets egen koppling', () => {
  const punkt = senastePunkt(fixtur.senasteSkotarPass.sista5)!;
  const hb = OBJEKT.find((o) => o.id === HALABACK_ID)!;

  it('sista punkten är inte inne i Hålabäcks L_TRAKTDEL (en träff-i-polygon-kontroll hittar inget)', () => {
    expect(objektInnehallerPunkt(HB, punkt.lat, punkt.lng)).toBe(false);
  });

  it('och Hålabäck är avslutat: ett val bland planerade/pågående objekt hade aldrig hittat det', () => {
    const pool: ObjektForVal[] = [{ id: hb.id, status: 'planerad', geometri: HB, skotare_maskin_id: DANIELS_SKOTARE }];   // även som planerad: utanför
    expect(valjObjektForPosition({ lat: punkt.lat, lng: punkt.lng, maskinId: DANIELS_SKOTARE, objekt: pool }).traff).toBeNull();
  });

  it('valjStartPosition (testflik, ingen lokal position) → spårets punkt + objekt-koppling → startbeslut = körvy på Hålabäck', () => {
    const rad = valjSenasteSpar({ maskinId: DANIELS_SKOTARE, index: INDEX, objekt: OBJEKT })!;
    const start = valjStartPosition({ lokalPos: null, spar: { rad, punkt } })!;
    expect(start.kalla).toBe('hyttspar');
    expect(start.objektId).toBe(HALABACK_ID);
    expect(start.roll).toBe('skotare');
    expect(start.lat).toBeCloseTo(56.3573062, 6);
    expect(start.lon).toBeCloseTo(15.0479767, 6);
    // Spårets objekt = tilldelat (valt via roll+objekt) → körvy direkt, ingen fråga, inte förarlistan.
    const atgard = avgorMaskindatorStart({
      enhetRoll: 'skotare', harFix: true, posObjektId: start.objektId, posTilldelad: true, tilldelatObjektId: null, redanFragat: false,
    });
    expect(atgard).toEqual({ typ: 'korvy', objektId: HALABACK_ID, roll: 'skotare' });
  });
});

describe('valjStartPosition — källornas ordning', () => {
  const rad: HyttsparIndexRad = { id: 'r', objekt_id: 'o1', roll: 'skordare', datum: '2026-10-01', antal_punkter: 4 };
  const punkt = { lat: 56.1, lng: 15.1, tid: null };

  it('lokal position (riktig maskindator) går före hyttspåret', () => {
    const s = valjStartPosition({ lokalPos: { lat: 57, lon: 16 }, spar: { rad, punkt } })!;
    expect(s).toEqual({ lat: 57, lon: 16, kalla: 'lokal', objektId: null, datum: null, roll: null, kurs: null });
  });
  it('utan lokal position (testfliken) → hyttspåret', () => {
    const s = valjStartPosition({ lokalPos: null, spar: { rad, punkt } })!;
    expect(s).toMatchObject({ lat: 56.1, lon: 15.1, kalla: 'hyttspar', objektId: 'o1', datum: '2026-10-01', roll: 'skordare' });
  });
  it('ingen av dem → null (maskinen har aldrig lämnat en position)', () => {
    expect(valjStartPosition({ lokalPos: null, spar: null })).toBeNull();
  });
});

describe('tolkaSparadPosition (maskinPos_v1_<maskin_id>)', () => {
  it('giltig {lat, lon}', () => { expect(tolkaSparadPosition('{"lat":56.3,"lon":15.0}')).toEqual({ lat: 56.3, lon: 15 }); });
  it('saknas / trasig / fel form → null', () => {
    expect(tolkaSparadPosition(null)).toBeNull();
    expect(tolkaSparadPosition('')).toBeNull();
    expect(tolkaSparadPosition('{trasig')).toBeNull();
    expect(tolkaSparadPosition('{"lat":"56","lon":15}')).toBeNull();
    expect(tolkaSparadPosition('{"lat":56,"lng":15}')).toBeNull();   // spåret använder lng, den sparade positionen lon
  });
});

// ───────────── Startbeslutets delar ─────────────
const INNE = { lat: 56.3524, lon: 15.0509 };   // facit-koordinat INNE i Hålabäck au 2025 (samma som objektPlats.test.ts)
const UTE = { lat: 56.40, lon: 15.20 };
const hbKand = (over: Partial<ObjektForVal> = {}): ObjektForVal => ({ id: HALABACK_ID, status: 'planerad', geometri: HB, skotare_maskin_id: DANIELS_SKOTARE, ...over });

describe('sparObjektGiltigt — vem får öppna ett avslutat objekt?', () => {
  const avslutat = { status: 'avslutat' };
  it('testfliken visar vad maskinen senast gjorde, även på ett avslutat objekt (Hålabäck au 2025)', () => {
    expect(sparObjektGiltigt({ kalla: 'hyttspar', sparObjektId: HALABACK_ID, sparObjekt: avslutat, arTestflik: true })).toBe(true);
  });
  it('en RIKTIG maskin öppnar aldrig av sig själv körvy på ett avslutat objekt', () => {
    expect(sparObjektGiltigt({ kalla: 'hyttspar', sparObjektId: HALABACK_ID, sparObjekt: avslutat, arTestflik: false })).toBe(false);
  });
  it('pågående/planerat objekt går alltid', () => {
    expect(sparObjektGiltigt({ kalla: 'hyttspar', sparObjektId: 'o', sparObjekt: { status: 'pagaende' }, arTestflik: false })).toBe(true);
    expect(sparObjektGiltigt({ kalla: 'hyttspar', sparObjektId: 'o', sparObjekt: { status: 'planerad' }, arTestflik: false })).toBe(true);
  });
  it('bara ett HYTTSPÅR bär objektet (lokal/fix → positionsval); saknat objekt/id → false', () => {
    expect(sparObjektGiltigt({ kalla: 'lokal', sparObjektId: 'o', sparObjekt: { status: 'pagaende' }, arTestflik: true })).toBe(false);
    expect(sparObjektGiltigt({ kalla: 'fix', sparObjektId: null, sparObjekt: null, arTestflik: true })).toBe(false);
    expect(sparObjektGiltigt({ kalla: 'hyttspar', sparObjektId: 'o', sparObjekt: null, arTestflik: true })).toBe(false);
    expect(sparObjektGiltigt({ kalla: 'hyttspar', sparObjektId: null, sparObjekt: { status: 'pagaende' }, arTestflik: true })).toBe(false);
  });
});

describe('valjPosObjekt — positionsval, och ingen fråga på en gammal position', () => {
  const bas = { maskinId: DANIELS_SKOTARE, klararTyp: null };
  it('riktig fix inne i ett tilldelat objekt → objektet, tilldelat (→ körvy utan fråga)', () => {
    expect(valjPosObjekt({ ...bas, pos: INNE, kalla: 'fix', kandidater: [hbKand()] })).toEqual({ posObjektId: HALABACK_ID, posTilldelad: true });
  });
  it('gammal position (lokal) inne i ett tilldelat objekt → objektet', () => {
    expect(valjPosObjekt({ ...bas, pos: INNE, kalla: 'lokal', kandidater: [hbKand()] })).toEqual({ posObjektId: HALABACK_ID, posTilldelad: true });
  });
  it('riktig fix inne i ett EJ tilldelat objekt → objektet, ej tilldelat (→ "Börja skota här?")', () => {
    expect(valjPosObjekt({ ...bas, pos: INNE, kalla: 'fix', kandidater: [hbKand({ skotare_maskin_id: 'ANNAN' })] })).toEqual({ posObjektId: HALABACK_ID, posTilldelad: false });
  });
  it('GAMMAL position inne i ett EJ tilldelat objekt → ingen träff (maskinen kan ha flyttats sedan dess — fråga inte om fel ställe)', () => {
    expect(valjPosObjekt({ ...bas, pos: INNE, kalla: 'lokal', kandidater: [hbKand({ skotare_maskin_id: 'ANNAN' })] })).toEqual({ posObjektId: null, posTilldelad: false });
    expect(valjPosObjekt({ ...bas, pos: INNE, kalla: 'hyttspar', kandidater: [hbKand({ skotare_maskin_id: null })] })).toEqual({ posObjektId: null, posTilldelad: false });
  });
  it('utanför alla traktgränser → ingen träff', () => {
    expect(valjPosObjekt({ ...bas, pos: UTE, kalla: 'fix', kandidater: [hbKand()] })).toEqual({ posObjektId: null, posTilldelad: false });
  });
});

describe('valjTilldelatObjekt', () => {
  const k = (id: string, status: string, over: Partial<ObjektForVal> = {}) => ({ id, status, skotare_maskin_id: DANIELS_SKOTARE, ...over });
  it('pågående före planerad före övrigt', () => {
    expect(valjTilldelatObjekt([k('a', 'planerad'), k('b', 'pagaende'), k('c', 'avslutat')], DANIELS_SKOTARE)).toBe('b');
    expect(valjTilldelatObjekt([k('c', 'avslutat'), k('a', 'planerad')], DANIELS_SKOTARE)).toBe('a');
    expect(valjTilldelatObjekt([k('c', 'avslutat')], DANIELS_SKOTARE)).toBe('c');
  });
  it('skördar- ELLER skotarplatsen räknas; andras objekt gör det inte; inga → null', () => {
    expect(valjTilldelatObjekt([k('s', 'planerad', { skotare_maskin_id: null, skordare_maskin_id: DANIELS_SKOTARE })], DANIELS_SKOTARE)).toBe('s');
    expect(valjTilldelatObjekt([k('x', 'pagaende', { skotare_maskin_id: 'ANNAN' })], DANIELS_SKOTARE)).toBeNull();
    expect(valjTilldelatObjekt([], DANIELS_SKOTARE)).toBeNull();
  });
});

describe('valjFlygPos — dit kameran flyger', () => {
  const pos = { lat: 56.1, lon: 15.1 };
  const objekt = { lat: 56.2, lng: 15.2 };
  it('tilldelat objekt utan riktig fix (lokal/hyttspår/ingen) → objektet självt (gammal position ligger inte nödvändigtvis i det)', () => {
    expect(valjFlygPos({ atgardTyp: 'tilldelat', kalla: 'lokal', pos, objekt })).toEqual({ lat: 56.2, lon: 15.2 });
    expect(valjFlygPos({ atgardTyp: 'tilldelat', kalla: null, pos: null, objekt })).toEqual({ lat: 56.2, lon: 15.2 });
  });
  it('tilldelat objekt MED riktig fix → maskinens position', () => {
    expect(valjFlygPos({ atgardTyp: 'tilldelat', kalla: 'fix', pos, objekt })).toEqual(pos);
  });
  it('körvy/fråga (position i objektet) → maskinens position', () => {
    expect(valjFlygPos({ atgardTyp: 'korvy', kalla: 'hyttspar', pos, objekt })).toEqual(pos);
    expect(valjFlygPos({ atgardTyp: 'fraga', kalla: 'fix', pos, objekt })).toEqual(pos);
  });
  it('objektet saknar/har ogiltiga koordinater → faller tillbaka på positionen (aldrig lat 0)', () => {
    expect(valjFlygPos({ atgardTyp: 'tilldelat', kalla: 'lokal', pos, objekt: { lat: null, lng: 15 } })).toEqual(pos);
    expect(valjFlygPos({ atgardTyp: 'tilldelat', kalla: 'lokal', pos, objekt: { lat: 'x', lng: 15 } })).toEqual(pos);
    expect(valjFlygPos({ atgardTyp: 'tilldelat', kalla: 'lokal', pos, objekt: null })).toEqual(pos);
  });

  it('förarens senast valda objekt utan riktig fix → flyg till objektet självt (som tilldelat); med riktig fix → maskinens position', () => {
    expect(valjFlygPos({ atgardTyp: 'senaste', kalla: 'lokal', pos, objekt })).toEqual({ lat: 56.2, lon: 15.2 });
    expect(valjFlygPos({ atgardTyp: 'senaste', kalla: 'hyttspar', pos, objekt })).toEqual({ lat: 56.2, lon: 15.2 });
    expect(valjFlygPos({ atgardTyp: 'senaste', kalla: null, pos: null, objekt })).toEqual({ lat: 56.2, lon: 15.2 });
    expect(valjFlygPos({ atgardTyp: 'senaste', kalla: 'fix', pos, objekt })).toEqual(pos);
    expect(valjFlygPos({ atgardTyp: 'tilldelat', kalla: null, pos: null, objekt: { lat: undefined, lng: undefined } })).toBeNull();
  });
});

describe('KODBEVIS i ett svep: testfliken /maskin?som=A130743 (ingen lokal position, datorns GPS aldrig) → körvy på Hålabäck au 2025', () => {
  it('spår → sparObjektGiltigt → avgorMaskindatorStart = korvy Hålabäck; flygmålet = Daniels sista punkt (utanför traktgränsen)', () => {
    const rad = valjSenasteSpar({ maskinId: DANIELS_SKOTARE, index: INDEX, objekt: OBJEKT })!;
    const punkt = senastePunkt(fixtur.senasteSkotarPass.sista5)!;
    const start = valjStartPosition({ lokalPos: null, spar: { rad, punkt } })!;
    const hb = OBJEKT.find((o) => o.id === HALABACK_ID)!;
    expect(sparObjektGiltigt({ kalla: start.kalla, sparObjektId: start.objektId, sparObjekt: hb, arTestflik: true })).toBe(true);
    const atgard = avgorMaskindatorStart({ enhetRoll: 'skotare', harFix: true, posObjektId: start.objektId, posTilldelad: true, tilldelatObjektId: null, redanFragat: false });
    expect(atgard).toEqual({ typ: 'korvy', objektId: HALABACK_ID, roll: 'skotare' });
    const mal = valjFlygPos({ atgardTyp: atgard.typ, kalla: start.kalla, pos: { lat: start.lat, lon: start.lon }, objekt: hb as any });
    expect(mal!.lat).toBeCloseTo(56.3573062, 6);
    expect(mal!.lon).toBeCloseTo(15.0479767, 6);
  });
});
