import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  VARNING_NYCKEL, VARNING_RESERV_FADE_M, VARNING_RESERV_MINOPACITY, VARNING_RESERV_WARN_M, VARNING_STANDARD,
  lasVarningar, skrivVarningar, standardInstallningar, varningsAvstand,
} from './varningsInstallningar';

describe('standardvärden', () => {
  it('12 kategorier (6 symboler + 6 zoner), inklusive zone_fornlamning som saknade UI-rad', () => {
    expect(Object.keys(VARNING_STANDARD)).toHaveLength(12);
    for (const id of ['naturvard', 'kultur', 'avverkning', 'infrastruktur', 'terrang', 'ovrigt', 'zone_wet', 'zone_steep', 'zone_protected', 'zone_culture', 'zone_noentry', 'zone_fornlamning']) {
      expect(VARNING_STANDARD[id]).toBeDefined();
    }
  });
  it('övrigt, kulturmiljö och fornlämning varnar tidigare (50/300), resten 30/200, minOpacity 0,1, på', () => {
    for (const id of ['ovrigt', 'zone_culture', 'zone_fornlamning']) expect(VARNING_STANDARD[id]).toEqual({ warnDist: 50, fadeDist: 300, minOpacity: 0.1, enabled: true });
    for (const id of ['naturvard', 'kultur', 'avverkning', 'infrastruktur', 'terrang', 'zone_wet', 'zone_steep', 'zone_protected', 'zone_noentry']) expect(VARNING_STANDARD[id]).toEqual({ warnDist: 30, fadeDist: 200, minOpacity: 0.1, enabled: true });
  });
  it('samma värden som de gamla hårdkodade (ingen tyst ändring av standard)', () => {
    // Värdena i page.tsx före den här ändringen (zone_fornlamning 50/300 etc.) — tabellen här är kopierad ur den.
    const gammal: Record<string, [number, number]> = { naturvard: [30, 200], kultur: [30, 200], avverkning: [30, 200], infrastruktur: [30, 200], terrang: [30, 200], ovrigt: [50, 300], zone_wet: [30, 200], zone_steep: [30, 200], zone_protected: [30, 200], zone_culture: [50, 300], zone_noentry: [30, 200], zone_fornlamning: [50, 300] };
    for (const [id, [w, f]] of Object.entries(gammal)) expect([VARNING_STANDARD[id].warnDist, VARNING_STANDARD[id].fadeDist]).toEqual([w, f]);
  });
  it('konstanten är fryst men standardInstallningar() ger en föränderlig kopia som inte delar objekt', () => {
    expect(Object.isFrozen(VARNING_STANDARD)).toBe(true);
    const a = standardInstallningar(); const b = standardInstallningar();
    a.naturvard.warnDist = 99;
    expect(b.naturvard.warnDist).toBe(30);
    expect(VARNING_STANDARD.naturvard.warnDist).toBe(30);
  });
});

describe('reservvärdet är 30 m', () => {
  it('kategori utan inställning (t.ex. gallringszonen) → 30 / 200 / 0,1 (förut 40 m)', () => {
    expect(VARNING_RESERV_WARN_M).toBe(30);
    expect(varningsAvstand(standardInstallningar(), 'zone_gallring')).toEqual({ warnDist: 30, fadeDist: VARNING_RESERV_FADE_M, minOpacity: VARNING_RESERV_MINOPACITY });
  });
  it('en känd kategori använder sina egna värden', () => {
    const i = standardInstallningar(); i.naturvard = { warnDist: 80, fadeDist: 500, minOpacity: 0.4, enabled: true };
    expect(varningsAvstand(i, 'naturvard')).toEqual({ warnDist: 80, fadeDist: 500, minOpacity: 0.4 });
  });
  it('warnDist 0 faller tillbaka på 30 (||), men minOpacity 0 bevaras (??)', () => {
    const i = standardInstallningar(); i.kultur = { warnDist: 0, fadeDist: 0, minOpacity: 0, enabled: true };
    expect(varningsAvstand(i, 'kultur')).toEqual({ warnDist: 30, fadeDist: 200, minOpacity: 0 });
  });
});

describe('lasVarningar — inläsning från enheten', () => {
  it('inget sparat → standardvärden, status "tom"', () => {
    for (const raw of [null, undefined, '']) {
      const l = lasVarningar(raw as any);
      expect(l.status).toBe('tom');
      expect(l.installningar).toEqual(standardInstallningar());
      expect(l.visaAlla).toBe(false);
    }
  });
  it('trasig JSON, fel version eller fel form → standardvärden, status "trasig", aldrig undantag', () => {
    for (const raw of ['{trasig', 'null', '[]', '"x"', '{"v":2,"kategorier":{}}', '{"v":1}', '{"v":1,"kategorier":"x"}', '{"naturvard":{"warnDist":80},"_showAll":true}' /* gamla DB-formen */]) {
      const l = lasVarningar(raw);
      expect(l.status).toBe('trasig');
      expect(l.installningar).toEqual(standardInstallningar());
      expect(l.visaAlla).toBe(false);
    }
  });
  it('skriv → läs ger exakt samma inställningar tillbaka (rundtur)', () => {
    const i = standardInstallningar();
    i.naturvard = { warnDist: 80, fadeDist: 500, minOpacity: 0.4, enabled: false };
    i.zone_fornlamning = { warnDist: 50, fadeDist: 250, minOpacity: 0.7, enabled: true };
    const l = lasVarningar(skrivVarningar(i, true));
    expect(l.status).toBe('ok');
    expect(l.installningar).toEqual(i);
    expect(l.visaAlla).toBe(true);
  });
  it('bara de sparade fälten åsidosätter standardvärdena; övrigt står kvar', () => {
    const l = lasVarningar(JSON.stringify({ v: 1, kategorier: { kultur: { warnDist: 80 } }, visaAlla: false }));
    expect(l.installningar.kultur).toEqual({ warnDist: 80, fadeDist: 200, minOpacity: 0.1, enabled: true });
    expect(l.installningar.naturvard).toEqual(VARNING_STANDARD.naturvard);
  });
  it('ogiltiga fält (fel typ, utanför intervall, NaN) → standardvärdet för just det fältet', () => {
    const l = lasVarningar(JSON.stringify({ v: 1, kategorier: { terrang: { warnDist: 'x', fadeDist: -5, minOpacity: 7, enabled: 'ja' }, kultur: { warnDist: 2 }, avverkning: { warnDist: 99999 } } }));
    expect(l.installningar.terrang).toEqual(VARNING_STANDARD.terrang);
    expect(l.installningar.kultur.warnDist).toBe(30);       // under 5 m
    expect(l.installningar.avverkning.warnDist).toBe(30);   // över 1000 m
  });
  it('fadeDist som inte ligger ovanför warnDist skulle ge noll/negativt fade-intervall → justeras uppåt', () => {
    const l = lasVarningar(JSON.stringify({ v: 1, kategorier: { naturvard: { warnDist: 300, fadeDist: 100 } } }));
    expect(l.installningar.naturvard.warnDist).toBe(300);
    expect(l.installningar.naturvard.fadeDist).toBeGreaterThan(300);
  });
  it('okända kategorier ignoreras; visaAlla är bara true för booleanen true', () => {
    const l = lasVarningar(JSON.stringify({ v: 1, kategorier: { finns_inte: { warnDist: 80 } }, visaAlla: 'true' }));
    expect(Object.keys(l.installningar)).toHaveLength(12);
    expect(l.visaAlla).toBe(false);
    expect(lasVarningar(JSON.stringify({ v: 1, kategorier: {}, visaAlla: true })).visaAlla).toBe(true);
  });
});

describe('skrivVarningar', () => {
  it('fast nyckelordning → samma inställningar ger alltid samma sträng (så "oförändrat" går att avgöra)', () => {
    const a = standardInstallningar();
    const b: any = {}; for (const id of Object.keys(a).reverse()) b[id] = { enabled: a[id].enabled, minOpacity: a[id].minOpacity, fadeDist: a[id].fadeDist, warnDist: a[id].warnDist };
    expect(skrivVarningar(b, false)).toBe(skrivVarningar(a, false));
  });
  it('innehåller version 1 och alla 12 kategorier även om några saknas i indata', () => {
    const o = JSON.parse(skrivVarningar({}, false));
    expect(o.v).toBe(1);
    expect(Object.keys(o.kategorier)).toHaveLength(12);
    expect(o.kategorier.zone_fornlamning).toEqual(VARNING_STANDARD.zone_fornlamning);
    expect(o.visaAlla).toBe(false);
  });
  it('nyckeln är varningar_v1', () => expect(VARNING_NYCKEL).toBe('varningar_v1'));
});

// ── Vakt mot att de döda DB-anropen / det falska "Sparade" kommer tillbaka ──────────────────────────────────────
describe('planeringsvyn: varningsinställningar per enhet, inga döda DB-anrop', () => {
  const src = readFileSync(new URL('../app/planering/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  it('inga anrop mot warning_settings / warning_acknowledgments och inget falskt "Sparade … Supabase"', () => {
    expect(src).not.toMatch(/from\('warning_(settings|acknowledgments)'\)/);
    expect(src).not.toContain('Sparade inställningar till Supabase');
    expect(src).not.toContain('Kvittering loggad för');
    expect(src).not.toContain('warningSettingsLoadedRef');
  });
  it('läser och skriver localStorage via lib (nyckel varningar_v1), men först efter inläsning (varningarLaddade) och bara vid ändring', () => {
    expect(src).toContain('localStorage.getItem(VARNING_NYCKEL)');
    expect(src).toContain('localStorage.setItem(VARNING_NYCKEL, nu)');
    expect(src).toContain('if (!varningarLaddade) return;');
    expect(src).toContain('if (nu === varningarSenastRef.current) return;');
    expect(src).toContain('setVarningarLaddade(true);');
  });
  it('reservvärdet kommer ur lib (30 m), inte ur ett hårdkodat || 40', () => {
    expect(src).toContain('varningsAvstand(warningSettings, getWarningCategoryId(m))');
    expect(src).not.toMatch(/warnDist:\s*settings\?\.warnDist \|\| 40/);
  });
  it('fornlämningszonen har en rad i varningsskärmen; kulturmiljö-raden heter Kulturmiljö (inte "Fornlämningszon")', () => {
    expect(src).toMatch(/\{ id: 'zone_fornlamning',\s*name: 'Fornlämning'/);
    expect(src).toMatch(/\{ id: 'zone_culture',\s*name: 'Kulturmiljö'/);
    expect(src).not.toContain("name: 'Fornlämningszon'");
  });
  it('kvittering av varningskortet är synkron och bara i minnet', () => {
    expect(src).toMatch(/const acknowledgeWarning = \(\) => \{\n\s*if \(activeWarning\) \{\n\s*setAcknowledgedWarnings/);
  });
  it('körläget är orört (härleds fortfarande ur kvittot och kan slås på manuellt)', () => {
    expect(src).toContain('setDrivingMode(!!minRollKvitto?.kvitterat_at);');
    expect(src).toContain('setDrivingMode(!drivingMode);');
  });
});
