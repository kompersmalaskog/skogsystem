import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  VARNING_NYCKEL, VARNING_RESERV_WARN_M, VARNING_STANDARD,
  lasVarningar, skrivVarningar, standardInstallningar, varningsAvstand,
} from './varningsInstallningar';

describe('standardvärden', () => {
  it('12 kategorier (6 symboler + 6 zoner), inklusive zone_fornlamning', () => {
    expect(Object.keys(VARNING_STANDARD)).toHaveLength(12);
    for (const id of ['naturvard', 'kultur', 'avverkning', 'infrastruktur', 'terrang', 'ovrigt', 'zone_wet', 'zone_steep', 'zone_protected', 'zone_culture', 'zone_noentry', 'zone_fornlamning']) {
      expect(VARNING_STANDARD[id]).toBeDefined();
    }
  });
  it('övrigt, kulturmiljö och fornlämning varnar tidigare (50 m), resten 30 m — och inget annat än warnDist finns kvar', () => {
    for (const id of ['ovrigt', 'zone_culture', 'zone_fornlamning']) expect(VARNING_STANDARD[id]).toEqual({ warnDist: 50 });
    for (const id of ['naturvard', 'kultur', 'avverkning', 'infrastruktur', 'terrang', 'zone_wet', 'zone_steep', 'zone_protected', 'zone_noentry']) expect(VARNING_STANDARD[id]).toEqual({ warnDist: 30 });
  });
  it('samma varningsavstånd som före borttagningen av körläget (ingen tyst ändring av körvyns radie)', () => {
    const gammal: Record<string, number> = { naturvard: 30, kultur: 30, avverkning: 30, infrastruktur: 30, terrang: 30, ovrigt: 50, zone_wet: 30, zone_steep: 30, zone_protected: 30, zone_culture: 50, zone_noentry: 30, zone_fornlamning: 50 };
    for (const [id, w] of Object.entries(gammal)) expect(VARNING_STANDARD[id].warnDist).toBe(w);
  });
  it('konstanten är fryst men standardInstallningar() ger en föränderlig kopia som inte delar objekt', () => {
    expect(Object.isFrozen(VARNING_STANDARD)).toBe(true);
    const a = standardInstallningar(); const b = standardInstallningar();
    a.naturvard.warnDist = 99;
    expect(b.naturvard.warnDist).toBe(30);
    expect(VARNING_STANDARD.naturvard.warnDist).toBe(30);
  });
});

describe('varningsAvstand — det körvyns kort läser', () => {
  it('reservvärdet är 30 m: kategori utan inställning (t.ex. gallringszonen)', () => {
    expect(VARNING_RESERV_WARN_M).toBe(30);
    expect(varningsAvstand(standardInstallningar(), 'zone_gallring')).toEqual({ warnDist: 30 });
  });
  it('en känd kategori använder sitt eget värde', () => {
    const i = standardInstallningar(); i.naturvard = { warnDist: 80 };
    expect(varningsAvstand(i, 'naturvard')).toEqual({ warnDist: 80 });
  });
  it('warnDist 0 faller tillbaka på 30', () => {
    const i = standardInstallningar(); i.kultur = { warnDist: 0 };
    expect(varningsAvstand(i, 'kultur')).toEqual({ warnDist: 30 });
  });
});

describe('lasVarningar — inläsning från enheten', () => {
  it('inget sparat → standardvärden, status "tom"', () => {
    for (const raw of [null, undefined, '']) {
      const l = lasVarningar(raw as any);
      expect(l.status).toBe('tom');
      expect(l.installningar).toEqual(standardInstallningar());
    }
  });
  it('trasig JSON, fel version eller fel form → standardvärden, status "trasig", aldrig undantag', () => {
    for (const raw of ['{trasig', 'null', '[]', '"x"', '{"v":2,"kategorier":{}}', '{"v":1}', '{"v":1,"kategorier":"x"}', '{"naturvard":{"warnDist":80},"_showAll":true}' /* gamla DB-formen */]) {
      const l = lasVarningar(raw);
      expect(l.status).toBe('trasig');
      expect(l.installningar).toEqual(standardInstallningar());
    }
  });
  it('skriv → läs ger exakt samma inställningar tillbaka (rundtur)', () => {
    const i = standardInstallningar();
    i.naturvard = { warnDist: 80 };
    i.zone_fornlamning = { warnDist: 30 };
    const l = lasVarningar(skrivVarningar(i));
    expect(l.status).toBe('ok');
    expect(l.installningar).toEqual(i);
  });
  it('BAKÅTKOMPATIBELT: en sträng som den äldre versionen sparade (fadeDist/minOpacity/enabled/visaAlla) läses, warnDist behålls, resten ignoreras', () => {
    const gammal = JSON.stringify({ v: 1, kategorier: { naturvard: { warnDist: 80, fadeDist: 500, minOpacity: 0.4, enabled: false }, kultur: { warnDist: 50, fadeDist: 250, minOpacity: 0.7, enabled: true } }, visaAlla: true });
    const l = lasVarningar(gammal);
    expect(l.status).toBe('ok');
    expect(l.installningar.naturvard).toEqual({ warnDist: 80 });
    expect(l.installningar.kultur).toEqual({ warnDist: 50 });
    expect(l.installningar.avverkning).toEqual(VARNING_STANDARD.avverkning);
    expect(skrivVarningar(l.installningar)).not.toMatch(/fadeDist|minOpacity|enabled|visaAlla/);   // nästa skrivning är den nya, korta formen
  });
  it('bara de sparade kategorierna åsidosätter standardvärdena; övrigt står kvar', () => {
    const l = lasVarningar(JSON.stringify({ v: 1, kategorier: { kultur: { warnDist: 80 } } }));
    expect(l.installningar.kultur).toEqual({ warnDist: 80 });
    expect(l.installningar.naturvard).toEqual(VARNING_STANDARD.naturvard);
  });
  it('ogiltiga värden (fel typ, utanför intervall, NaN) → standardvärdet för just den kategorin', () => {
    const l = lasVarningar(JSON.stringify({ v: 1, kategorier: { terrang: { warnDist: 'x' }, kultur: { warnDist: 2 }, avverkning: { warnDist: 99999 }, naturvard: { warnDist: null }, infrastruktur: 7 } }));
    expect(l.installningar.terrang).toEqual(VARNING_STANDARD.terrang);
    expect(l.installningar.kultur.warnDist).toBe(30);          // under 5 m
    expect(l.installningar.avverkning.warnDist).toBe(30);      // över 1000 m
    expect(l.installningar.naturvard).toEqual(VARNING_STANDARD.naturvard);
    expect(l.installningar.infrastruktur).toEqual(VARNING_STANDARD.infrastruktur);
  });
  it('okända kategorier ignoreras', () => {
    const l = lasVarningar(JSON.stringify({ v: 1, kategorier: { finns_inte: { warnDist: 80 } } }));
    expect(Object.keys(l.installningar)).toHaveLength(12);
  });
});

describe('skrivVarningar', () => {
  it('fast nyckelordning → samma inställningar ger alltid samma sträng (så "oförändrat" går att avgöra)', () => {
    const a = standardInstallningar();
    const b: any = {}; for (const id of Object.keys(a).reverse()) b[id] = { warnDist: a[id].warnDist };
    expect(skrivVarningar(b)).toBe(skrivVarningar(a));
  });
  it('innehåller version 1 och alla 12 kategorier även om några saknas i indata — bara warnDist', () => {
    const o = JSON.parse(skrivVarningar({}));
    expect(o.v).toBe(1);
    expect(Object.keys(o.kategorier)).toHaveLength(12);
    expect(o.kategorier.zone_fornlamning).toEqual({ warnDist: 50 });
    expect(o.visaAlla).toBeUndefined();
  });
  it('nyckeln är fortfarande varningar_v1 (befintliga enheter behåller sitt val)', () => expect(VARNING_NYCKEL).toBe('varningar_v1'));
});

// ── Vakter mot att det gamla körläget / de döda DB-anropen kommer tillbaka ──────────────────────────────────────
describe('planeringsvyn: bara varningsavstånd per kategori, inget körläge', () => {
  const src = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  it('inga anrop mot warning_settings / warning_acknowledgments', () => {
    expect(src).not.toMatch(/from\('warning_(settings|acknowledgments)'\)/);
    expect(src).not.toContain('Sparade inställningar till Supabase');
  });
  it('läser och skriver localStorage via lib (nyckel varningar_v1), men först efter inläsning (varningarLaddade) och bara vid ändring', () => {
    expect(src).toContain('localStorage.getItem(VARNING_NYCKEL)');
    expect(src).toContain('localStorage.setItem(VARNING_NYCKEL, nu)');
    expect(src).toContain('if (!varningarLaddade) return;');
    expect(src).toContain('if (nu === varningarSenastRef.current) return;');
    expect(src).toContain('setVarningarLaddade(true);');
  });
  it('körvyns kort läser varningsavstånd ur lib (getWarningDistances behålls), med reservvärdet 30 m', () => {
    expect(src).toContain('const getWarningDistances = (m: Marker) => varningsAvstand(warningSettings, getWarningCategoryId(m));');
    expect(src).toContain('const warnDist = getWarningDistances(m).warnDist;');
    expect(src).toMatch(/const getWarningCategoryId = \(m: Marker\): string => \{/);
  });
  it('varningsskärmen har en rad per kategori, inklusive fornlämning; kulturmiljö-raden heter Kulturmiljö', () => {
    expect(src).toMatch(/\{ id: 'zone_fornlamning',\s*name: 'Fornlämning'/);
    expect(src).toMatch(/\{ id: 'zone_culture',\s*name: 'Kulturmiljö'/);
    expect(src).not.toContain("name: 'Fornlämningszon'");
  });
  it('det gamla körläget är BORTA: ingen drivingMode, inga varningskort/pip, ingen avståndsdämpning', () => {
    for (const bort of ['drivingMode', 'setDrivingMode', 'acknowledgedWarnings', 'activeWarning', 'playedWarningsRef', 'getMarkerOpacity', 'getActiveWarnings',
      'acknowledgeWarning', 'effectiveUserPos', 'calculateDistanceMeters', 'proximityTick', 'lastProximityDebugRef', 'warningShowAll', 'WARNING_DISTANCE', 'FADE_START_DISTANCE', 'KÖRLÄGE VARNING']) {
      expect(src, bort).not.toContain(bort);
    }
    expect(src).not.toContain('fadeDist');
    expect(src).not.toContain('minOpacity');
  });
  it('geofence-frågan och körspårningen är BORTA (inga gps_tracks-skrivningar för körspår, ingen 60 s-pollning)', () => {
    for (const bort of ['geofencePrompt', 'handleGeofenceStart', 'handleGeofenceDismiss', 'geofence_dismissed', 'planneradeObjektRef', 'startKorspårning', 'stopKorspårning', 'korspårActive', 'korspårTracks', "'korspår'", 'GEOFENCING MODAL']) {
      expect(src, bort).not.toContain(bort);
    }
  });
  it('simulerad position och debugpanelen är BORTA', () => {
    for (const bort of ['simulatedPos', 'setSimulatedPos', 'showSimPosMenu', 'setShowSimPosMenu', 'showDebugPanel', 'SIM-POSITION', 'PROXIMITY DEBUG']) {
      expect(src, bort).not.toContain(bort);
    }
  });
  it('men det som INTE hör till borttagningen står kvar: GPS-linjeinspelning, haversineM, fullscreenPhoto, briefing/kvittering, körvyns kvittens', () => {
    for (const kvar of ['const startGpsTracking = ', 'function haversineM(', 'const [fullscreenPhoto,', 'const [briefingMode,', 'const kvitteraKorvySymbol', 'trackingPathRef', 'lastGpsTrackSaveCountRef']) {
      expect(src, kvar).toContain(kvar);
    }
  });
});
