import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  INFO_KOLUMNER, INFO_STANDARD, andradeKolumner, djupLika, infoRadFranVarden, infoVardenFranRad,
  kolumnerSomInteLandade, parseSvNum, utanTidsstamplar, type InfoVarden,
} from './objektInfoSpar';

// ── DB-rader i olika skick ────────────────────────────────────────────────────────────────────────────────────────
// Alla kolumner som laddaren läser. En RIKTIG objekt-rad har NULL i det mesta som ingen fyllt i.
const TOM_RAD: Record<string, unknown> = {
  barighet: null, terrang: null, skordare_band: null, skordare_band_par: null, skordare_manuell_fallning: null,
  skordare_manuell_fallning_text: null, skotare_band: null, skotare_band_par: null, skotare_lastreder_breddat: null,
  skotare_ris_direkt: null, skotare_extra_vagn: null, skotare_konfiguration: null, transport_trailer_in: null,
  transport_kommentar: null, markagare_ska_ha_ved: null, markagare_ved_text: null, info_anteckningar: null,
  prognos_settings: null, manuell_prognos: null, trakt_data: null, stickvag_settings: null, checklist_items: null,
  generellt_tillstand: null, areal: null, volym: null, skordare_maskin_id: null, skordare_utforare: null,
  skordare_utforare_namn: null, skotare_maskin_id: null, skotare_utforare: null, skotare_utforare_namn: null,
  larmkoordinat_lat: null, larmkoordinat_lng: null, larmkoordinat_beskrivning: null, larmkoordinat_kalla: null,
  larmkoordinat_bekraftad: null, skotningsavstand: null, basvag_kravs: null, basvag_timmar: null,
};

const FULL_RAD: Record<string, unknown> = {
  ...TOM_RAD,
  barighet: 'bra', terrang: 'lutande', skordare_maskin_id: 'R64101', skordare_utforare: null, skordare_utforare_namn: null,
  skordare_band: true, skordare_band_par: '2', skordare_manuell_fallning: true, skordare_manuell_fallning_text: 'Stor björk vid vägen',
  skotare_maskin_id: null, skotare_utforare: 'extern', skotare_utforare_namn: 'Nilsson Skog', skotare_band: false, skotare_band_par: null,
  skotare_lastreder_breddat: true, skotare_ris_direkt: false, skotare_extra_vagn: true, skotare_konfiguration: 'smal',
  skotningsavstand: 'medel', basvag_kravs: true, basvag_timmar: 3.5, transport_trailer_in: false, transport_kommentar: 'Bom vid infarten',
  markagare_ska_ha_ved: true, markagare_ved_text: '10 m3 björkved', info_anteckningar: 'Ring innan',
  prognos_settings: { terpipirangSvar: 20, barighetDalig: 10 }, manuell_prognos: { skordare: '38', skotare: '41' },
  trakt_data: { volym: 700, areal: 5.24, beraknad: { medeldiameter: 21, restriktioner: [{ type: 'a', name: 'b' }], beraknadAt: 111, vidaAnalys: { K1: { hits: [], errors: [], at: 222 } } } },
  stickvag_settings: { targetDistance: 30, tolerance: 2, vagbredd: 4 },
  checklist_items: [{ id: 'band', text: 'Behövs band?', answer: true, fixed: true }],
  generellt_tillstand: { lan: 'Kalmar', giltigtTom: '2027-01-01' }, areal: 5.24, volym: 649.5,
  larmkoordinat_lat: 56.357312, larmkoordinat_lng: 15.048, larmkoordinat_beskrivning: 'Möt vid bommen', larmkoordinat_kalla: 'egen', larmkoordinat_bekraftad: true,
};

// Gamla stämplingen: band=false men par='1' (29 objekt bar den i prod), blandat med mättade/udda värden.
const ODD_RAD: Record<string, unknown> = {
  ...TOM_RAD, skordare_band: false, skordare_band_par: '1', skotare_band: false, skotare_band_par: '1', transport_trailer_in: true,
  skotare_konfiguration: 'bred', areal: '5.24', volym: 0, basvag_kravs: false, basvag_timmar: 2, skordare_utforare: 'egen',
  skordare_utforare_namn: 'bör nollas', trakt_data: { volym: 649, areal: 2 }, checklist_items: [], manuell_prognos: {},
};

const RADER: [string, Record<string, unknown>][] = [['tom (allt NULL)', TOM_RAD], ['fullt ifylld', FULL_RAD], ['udda/gammal stämpling', ODD_RAD], ['bara {}', {}]];

const baslinje = (rad: Record<string, unknown>) => infoRadFranVarden(infoVardenFranRad(rad));
const med = (v: InfoVarden, andring: Partial<InfoVarden>): InfoVarden => ({ ...v, ...andring });

describe('öppna utan att röra något → ingen skillnad (ingen skrivning)', () => {
  for (const [namn, rad] of RADER) {
    it(`${namn}: formuläret direkt efter laddning ger tom skillnad mot baslinjen`, () => {
      const v = infoVardenFranRad(rad);
      expect(andradeKolumner(baslinje(rad), infoRadFranVarden(v))).toEqual({});
    });
  }

  it('den GAMLA metoden skulle ha skrivit om kolumner på en tom rad — nya skriver 0', () => {
    // Bevis på vad som skulle gått ut: alla kolumner, och flera av dem med värden som aldrig fanns i DB.
    const gammalPayload = infoRadFranVarden(infoVardenFranRad(TOM_RAD));
    const iDb = TOM_RAD;
    const uppfunna = Object.keys(gammalPayload).filter((k) => !djupLika(gammalPayload[k], iDb[k] ?? null));
    expect(Object.keys(gammalPayload)).toHaveLength(INFO_KOLUMNER.length);
    expect(uppfunna).toEqual(expect.arrayContaining(['skordare_band', 'skotare_konfiguration', 'transport_trailer_in', 'trakt_data', 'checklist_items']));
    expect(uppfunna.length).toBeGreaterThanOrEqual(10);
    expect(andradeKolumner(baslinje(TOM_RAD), gammalPayload)).toEqual({});
  });

  it('en rad där DB-värdet inte är "standard" (trailer = false, band-par kvar fast band av) rörs inte heller', () => {
    expect(andradeKolumner(baslinje(FULL_RAD), infoRadFranVarden(infoVardenFranRad(FULL_RAD)))).toEqual({});
    expect(andradeKolumner(baslinje(ODD_RAD), infoRadFranVarden(infoVardenFranRad(ODD_RAD)))).toEqual({});
  });
});

describe('ändra ETT fält → bara det fältets kolumn(er)', () => {
  const v0 = infoVardenFranRad(FULL_RAD);
  const bas = baslinje(FULL_RAD);
  const skillnad = (a: Partial<InfoVarden>) => andradeKolumner(bas, infoRadFranVarden(med(v0, a)));

  it('bärighet', () => expect(skillnad({ barighet: 'dålig' })).toEqual({ barighet: 'dålig' }));
  it('anteckning', () => expect(skillnad({ anteckningar: 'Ring innan 07' })).toEqual({ info_anteckningar: 'Ring innan 07' }));
  it('tom anteckning → null (inte tom sträng)', () => expect(skillnad({ anteckningar: '' })).toEqual({ info_anteckningar: null }));
  it('areal med decimalkomma', () => expect(skillnad({ areal: '6,5' })).toEqual({ areal: 6.5 }));
  it('areal rensat → null', () => expect(skillnad({ areal: '' })).toEqual({ areal: null }));
  it('areal ogiltig text → null, aldrig 0', () => expect(skillnad({ areal: 'abc' })).toEqual({ areal: null }));
  it('manuell prognos (json)', () => expect(skillnad({ manuellPrognos: { skordare: '40', skotare: '41' } })).toEqual({ manuell_prognos: { skordare: '40', skotare: '41' } }));
  it('larm bekräftad', () => expect(skillnad({ larmBekraftad: false })).toEqual({ larmkoordinat_bekraftad: false }));
  it('band av → band + par (de hör ihop) men inget annat', () => {
    expect(skillnad({ skordareBand: false })).toEqual({ skordare_band: false, skordare_band_par: null });
  });
  it('byt från extern till egen skotning → utförare + namn, inget annat', () => {
    expect(skillnad({ skotareUtforare: 'egen' })).toEqual({ skotare_utforare: 'egen', skotare_utforare_namn: null });
  });
  it('ändra och ändra tillbaka → ingen skillnad', () => {
    expect(andradeKolumner(bas, infoRadFranVarden(med(med(v0, { barighet: 'dålig' }), { barighet: 'bra' })))).toEqual({});
  });
  it('två fält → exakt två kolumner', () => {
    expect(Object.keys(skillnad({ terrang: 'flack', skotareKonfig: 'bred' })).sort()).toEqual(['skotare_konfiguration', 'terrang']);
  });
});

describe('förarens gamla värden skriver inte över planerarens ändring', () => {
  it('planeraren ändrar bärighet i DB EFTER att föraren laddat; föraren ändrar bara terräng → bärighet skickas aldrig', () => {
    const laddat = { ...FULL_RAD };                                   // förarens laddning (bärighet = 'bra')
    const bas = baslinje(laddat);
    const vForare = med(infoVardenFranRad(laddat), { terrang: 'flack' });
    const skickas = andradeKolumner(bas, infoRadFranVarden(vForare));
    expect(Object.keys(skickas)).toEqual(['terrang']);                // planerarens 'dålig' i DB rörs inte (förut: bärighet='bra' skickades med)
  });
});

describe('appens egen analys-cache (trakt_data)', () => {
  const bas = baslinje(FULL_RAD);
  const nuMedTraktData = (td: unknown) => infoRadFranVarden(med(infoVardenFranRad(FULL_RAD), { traktData: td }));

  it('omkörning med SAMMA resultat (bara nya tidsstämplar) → ingen skrivning', () => {
    const td = JSON.parse(JSON.stringify((FULL_RAD as any).trakt_data));
    td.beraknad.beraknadAt = 999999; td.beraknad.restriktionerAnalyseradAt = 999999; td.beraknad.vidaAnalys.K1.at = 999999;
    expect(andradeKolumner(bas, nuMedTraktData(td))).toEqual({});
  });
  it('nytt analysresultat → bara trakt_data skrivs', () => {
    const td = JSON.parse(JSON.stringify((FULL_RAD as any).trakt_data));
    td.beraknad.restriktioner = [{ type: 'x', name: 'Ny restriktion' }];
    expect(Object.keys(andradeKolumner(bas, nuMedTraktData(td)))).toEqual(['trakt_data']);
  });
  it('utanTidsstamplar tar bort på alla djup men rör inget annat', () => {
    expect(utanTidsstamplar({ a: 1, beraknadAt: 5, b: { at: 1, c: [{ at: 2, d: 3 }] } })).toEqual({ a: 1, b: { c: [{ d: 3 }] } });
  });
});

describe('laddning av jsonb-fält: inget läcker mellan objekt', () => {
  it('saknas jsonb i DB → INFO_STANDARD, aldrig föregående objekts värden', () => {
    const v = infoVardenFranRad(TOM_RAD);
    expect(v.prognosSettings).toBe(INFO_STANDARD.prognosSettings);
    expect(v.manuellPrognos).toBe(INFO_STANDARD.manuellPrognos);
    expect(v.traktData).toBe(INFO_STANDARD.traktData);
    expect(v.stickvagSettings).toBe(INFO_STANDARD.stickvagSettings);
    expect(v.checklistItems).toBe(INFO_STANDARD.checklistItems);
    expect(v.generelltTillstand).toBeNull();
  });
  it('byte A → B: baslinjen för B beror bara på B:s rad', () => {
    expect(baslinje(TOM_RAD)).toEqual(infoRadFranVarden(infoVardenFranRad({ ...TOM_RAD })));
    expect(baslinje(FULL_RAD).trakt_data).not.toEqual(baslinje(TOM_RAD).trakt_data);
  });
  it('INFO_STANDARD är fryst (en delad referens får inte muteras av misstag)', () => {
    expect(Object.isFrozen(INFO_STANDARD)).toBe(true);
    expect(Object.isFrozen(INFO_STANDARD.checklistItems)).toBe(true);
    expect(INFO_STANDARD.checklistItems).toHaveLength(8);
  });
});

describe('verifiering av vad som landade', () => {
  it('alla skickade kolumner tillbaka med samma värde → inget saknas', () => {
    expect(kolumnerSomInteLandade({ terrang: 'flack', manuell_prognos: { a: 1, b: 2 } }, { terrang: 'flack', manuell_prognos: { b: 2, a: 1 } })).toEqual([]);
  });
  it('värde som inte landade pekas ut vid namn', () => {
    expect(kolumnerSomInteLandade({ terrang: 'flack', barighet: 'bra' }, { terrang: 'flack', barighet: 'dålig' })).toEqual(['barighet']);
  });
  it('ingen rad tillbaka → allt räknas som ej landat', () => {
    expect(kolumnerSomInteLandade({ terrang: 'flack' }, null)).toEqual(['terrang']);
  });
});

describe('småsaker', () => {
  it('parseSvNum', () => {
    expect(parseSvNum('5,24')).toBe(5.24); expect(parseSvNum(' 3 ')).toBe(3); expect(parseSvNum('')).toBeNull(); expect(parseSvNum('x')).toBeNull(); expect(parseSvNum(null)).toBeNull();
  });
  it('djupLika: nyckelordning och undefined-nycklar spelar ingen roll, arrayordning gör det', () => {
    expect(djupLika({ a: 1, b: { c: 2 } }, { b: { c: 2 }, a: 1, z: undefined })).toBe(true);
    expect(djupLika([1, 2], [2, 1])).toBe(false);
    expect(djupLika(null, undefined)).toBe(false);
  });
  it('INFO_KOLUMNER = 39 kolumner, inga dubbletter, samma mängd som den gamla sparningen skrev', () => {
    expect(new Set(INFO_KOLUMNER).size).toBe(INFO_KOLUMNER.length);
    expect(INFO_KOLUMNER).toHaveLength(39);   // verifierat mot den gamla update-objektet i origin/main (39 av 39, ingen skillnad)
    for (const k of ['barighet', 'trakt_data', 'larmkoordinat_bekraftad', 'basvag_timmar', 'skordare_band_par']) expect(INFO_KOLUMNER).toContain(k);
    expect(INFO_KOLUMNER).not.toContain('anteckningar');   // Vidas direktiv (objekt.anteckningar) är skrivskyddat härifrån
  });
});

// ── Vakt mot att någon återinför "skriv hela raden" ────────────────────────────────────────────────────────────────
// Själva beteendet bevisas i riktig sida (testselen, PR-texten). Det här fångar bara den uppenbara regressionen: en update med
// ett helt objekt-literal i saveInfoToDb, eller att laddaren åter sätter jsonb-fält bara `om data.x`.
describe('planeringsvyns autospar använder dirty-kolumner', () => {
  const src = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const a = src.indexOf('const saveInfoToDb = useCallback(');
  const block = src.slice(a, src.indexOf('saveInfoRef.current = saveInfoToDb;', a));

  it('saveInfoToDb finns och jämför mot baslinjen', () => {
    expect(a).toBeGreaterThan(0);
    expect(block).toContain('andradeKolumner(bas.rad, nu)');
    expect(block).toContain('uppdateraVerifierat');
    expect(block).toContain('bas.id !== valtObjekt.id');
  });
  it('ingen update med ett helt objekt-literal (barighet: …) i saveInfoToDb', () => {
    expect(block).not.toMatch(/\.update\(\{/);
    expect(block).not.toMatch(/skordare_maskin_id:\s*infoSkordareMaskinId/);   // kolumn-nyckeln i den gamla payloaden (nya bygger formulärvärden, inte kolumner)
  });
  it('laddaren sätter jsonb-fälten ovillkorligt och nollar infoLoaded vid varje objektbyte', () => {
    expect(src).not.toMatch(/if \(data\.prognos_settings\) setPrognosSettings/);
    expect(src).not.toMatch(/if \(data\.trakt_data\) setTraktData/);
    expect(src).toContain('setPrognosSettings(v.prognosSettings);');
    const laddare = src.slice(src.indexOf('const infoBasRef = useRef'));
    expect(laddare.indexOf('setInfoLoaded(false);')).toBeGreaterThan(0);
    expect(laddare.indexOf('setInfoLoaded(false);')).toBeLessThan(laddare.indexOf('if (!valtObjekt?.id) return;'));
  });
  it('ett misslyckat läs-anrop räknas inte som laddat', () => {
    expect(src).toContain('if (laddat) setInfoLoaded(true);');
    expect(src).not.toMatch(/^\s*setInfoLoaded\(true\);/m);
  });
});
