import { describe, it, expect } from 'vitest';
import {
  startFas, flygKlar, startCoverSynlig, startOverlaySynlig, startKameraLas, startRadText,
  SVART_MAX_MS, REVEAL_MS, FLY_MS, RAD_MS, FIX_TIMEOUT_MS, SVART_INFO_MS, SVART_STATUS_MS,
  svartInfo, svartVad, SVART_VAD_TEXT, type StartIn,
} from './maskinstart';

// Bas: sekvensen startade vid 0, inget har hänt än.
const bas: StartIn = { startMs: 0, nuMs: 0, kartaRedoMs: null, ingenKarta: false, posMs: null, flygStartMs: null };
const i = (p: Partial<StartIn>): StartIn => ({ ...bas, ...p });

describe('startFas — svart tills kartan är redo', () => {
  it('svart så länge kartan laddar (ingen logga, ingen text)', () => {
    expect(startFas(i({ nuMs: 0 }))).toBe('svart');
    expect(startFas(i({ nuMs: SVART_MAX_MS - 1 }))).toBe('svart');
  });

  it('en fix före kartan ändrar inget — fortfarande svart', () => {
    expect(startFas(i({ nuMs: 3000, posMs: 500 }))).toBe('svart');
  });

  it('kartan redo → översikt (kartan tonar upp)', () => {
    expect(startFas(i({ nuMs: 2500, kartaRedoMs: 2000 }))).toBe('oversikt');
  });
});

describe('startFas — släpp svart istället för en död skärm', () => {
  it('kartan blev aldrig redo på SVART_MAX_MS → klar (det som ligger under visas)', () => {
    expect(startFas(i({ nuMs: SVART_MAX_MS }))).toBe('klar');
    expect(startFas(i({ nuMs: SVART_MAX_MS + 5000, posMs: 100 }))).toBe('klar');
  });
  it('beslutet blev förarlista (ingen karta) → klar direkt, inte 10 s svart', () => {
    expect(startFas(i({ nuMs: 300, ingenKarta: true }))).toBe('klar');
  });
  it('en karta som blir redo i tid slår ingenKarta/timeout inte', () => {
    expect(startFas(i({ nuMs: 9000, kartaRedoMs: 8000 }))).toBe('oversikt');
  });
});

describe('flygKlar — EN flyTo, först när kartan tonat upp OCH vi har fix', () => {
  it('ingen fix → ingen flygning, hur länge man än väntar', () => {
    expect(flygKlar(i({ nuMs: 20000, kartaRedoMs: 2000 }))).toBe(false);
  });
  it('fix men kartan tonar fortfarande upp (< REVEAL_MS) → vänta', () => {
    expect(flygKlar(i({ nuMs: 2000 + REVEAL_MS - 1, kartaRedoMs: 2000, posMs: 900 }))).toBe(false);
  });
  it('fix + REVEAL_MS passerat → flyg', () => {
    expect(flygKlar(i({ nuMs: 2000 + REVEAL_MS, kartaRedoMs: 2000, posMs: 900 }))).toBe(true);
  });
  it('fixen kommer sent (efter översikten) → flyger så fort den kommer', () => {
    expect(flygKlar(i({ nuMs: 12000, kartaRedoMs: 2000, posMs: 11900 }))).toBe(true);
  });
  it('flyger redan → ingen andra flygning (EN flyTo)', () => {
    expect(flygKlar(i({ nuMs: 4000, kartaRedoMs: 2000, posMs: 900, flygStartMs: 3000 }))).toBe(false);
  });
  it('inte i svart', () => {
    expect(flygKlar(i({ nuMs: 4000, posMs: 100 }))).toBe(false);
  });
  it('SENAST KÄNDA position (känd redan vid start, posMs = startMs) → flyger REVEAL_MS efter att kartan blev redo, utan att vänta på fix', () => {
    expect(flygKlar(i({ nuMs: 800 + REVEAL_MS - 1, kartaRedoMs: 800, posMs: 0 }))).toBe(false);
    expect(flygKlar(i({ nuMs: 800 + REVEAL_MS, kartaRedoMs: 800, posMs: 0 }))).toBe(true);
  });
  it('svart kapas först EFTER att den hunnit förklara sig (status efter 10 s) — annars kapas en långsam men levande laddning', () => {
    expect(SVART_MAX_MS).toBeGreaterThan(SVART_STATUS_MS);
  });
  it('en karta som blir redo efter 6 s (långsamt nät) får sin sekvens — den kapas inte vid 5 s längre', () => {
    expect(startFas(i({ nuMs: 6000 }))).toBe('svart');
    expect(startFas(i({ nuMs: 6100, kartaRedoMs: 6000, posMs: 0 }))).toBe('oversikt');
  });
});

describe('svartInfo — vad svart skärm säger om sig själv', () => {
  const vad = 'karta' as const;
  it('under 1 s: INGENTING (varken namn, förloppsrad eller text)', () => {
    expect(svartInfo({ sedanNavigeringMs: 0, namn: 'Elefant 26', vad })).toEqual({ namn: null, forlopp: false, text: null });
    expect(svartInfo({ sedanNavigeringMs: SVART_INFO_MS - 1, namn: 'Elefant 26', vad })).toEqual({ namn: null, forlopp: false, text: null });
  });
  it('från 1 s: maskinens namn + förloppsrad, ännu ingen statustext', () => {
    expect(svartInfo({ sedanNavigeringMs: SVART_INFO_MS, namn: 'Elefant 26', vad })).toEqual({ namn: 'Elefant 26', forlopp: true, text: null });
    expect(svartInfo({ sedanNavigeringMs: SVART_STATUS_MS - 1, namn: 'Elefant 26', vad })).toEqual({ namn: 'Elefant 26', forlopp: true, text: null });
  });
  it('från 10 s: också vad som dröjer — namn och förloppsrad står kvar', () => {
    expect(svartInfo({ sedanNavigeringMs: SVART_STATUS_MS, namn: 'Elefant 26', vad: 'karta' })).toEqual({ namn: 'Elefant 26', forlopp: true, text: 'Hämtar karta' });
    expect(svartInfo({ sedanNavigeringMs: 60000, namn: 'Elefant 26', vad: 'nat' }).text).toBe('Väntar på nät');
    expect(svartInfo({ sedanNavigeringMs: 60000, namn: 'Elefant 26', vad: 'position' }).text).toBe('Hämtar position');
  });
  it('namnet är inte känt än → förloppsraden visas ändå, utan namn (ingen "null"/tom rad)', () => {
    expect(svartInfo({ sedanNavigeringMs: 2000, namn: null, vad })).toEqual({ namn: null, forlopp: true, text: null });
    expect(svartInfo({ sedanNavigeringMs: 2000, namn: '   ', vad })).toEqual({ namn: null, forlopp: true, text: null });
    expect(svartInfo({ sedanNavigeringMs: 2000, namn: undefined, vad }).namn).toBeNull();
  });
});

describe('svartInfo — INVARIANT: ren svart skärm står aldrig över 1 s (alla namn × orsaker × tider)', () => {
  it('från SVART_INFO_MS finns alltid innehåll (gran/förloppsrad); från SVART_STATUS_MS även en text', () => {
    const tider = [0, 1, 999, 1000, 1001, 2500, 9999, 10000, 10001, 30000, 120000];
    for (const namn of [null, undefined, '', '   ', 'Elefant 26']) {
      for (const vad of ['nat', 'position', 'karta'] as const) {
        for (const t of tider) {
          const i = svartInfo({ sedanNavigeringMs: t, namn, vad });
          if (t >= SVART_INFO_MS) expect(i.forlopp, `${String(namn)}/${vad}/${t}`).toBe(true);
          if (t >= SVART_STATUS_MS) expect(i.text, `${String(namn)}/${vad}/${t}`).toBeTruthy();
          if (t < SVART_INFO_MS) expect(i).toEqual({ namn: null, forlopp: false, text: null });
        }
      }
    }
  });
});

describe('svartVad — vad dröjer?', () => {
  it('utan nät är det nätet, oavsett annat', () => {
    expect(svartVad({ online: false, kartaFinns: false })).toBe('nat');
    expect(svartVad({ online: false, kartaFinns: true })).toBe('nat');
  });
  it('med nät: finns ingen karta än hämtas position/objekt, annars hämtas kartan', () => {
    expect(svartVad({ online: true, kartaFinns: false })).toBe('position');
    expect(svartVad({ online: true, kartaFinns: true })).toBe('karta');
  });
  it('texterna är förarens ord', () => {
    expect(SVART_VAD_TEXT).toEqual({ nat: 'Väntar på nät', position: 'Hämtar position', karta: 'Hämtar karta' });
  });
});

describe('hela tidslinjen: svart → översikt → flyger → landat → klar', () => {
  // karta redo 1200, fix 800 → flygningen börjar 1200+700=1900 → landar 3400 → raden borta 8400
  const tl = (nuMs: number, flygStartMs: number | null) => i({ nuMs, kartaRedoMs: 1200, posMs: 800, flygStartMs });

  it('följer ordningen och tiderna', () => {
    expect(startFas(i({ nuMs: 1000, posMs: 800 }))).toBe('svart');        // kartan laddar
    expect(startFas(tl(1200, null))).toBe('oversikt');                    // tonar upp
    expect(flygKlar(tl(1899, null))).toBe(false);
    expect(flygKlar(tl(1900, null))).toBe(true);                          // → page startar flyTo, flygStartMs=1900
    expect(startFas(tl(1900, 1900))).toBe('flyger');
    expect(startFas(tl(1900 + FLY_MS - 1, 1900))).toBe('flyger');
    expect(startFas(tl(1900 + FLY_MS, 1900))).toBe('landat');             // kameran har landat
    expect(startFas(tl(1900 + FLY_MS + RAD_MS - 1, 1900))).toBe('landat');
    expect(startFas(tl(1900 + FLY_MS + RAD_MS, 1900))).toBe('klar');
  });
});

describe('startCoverSynlig / startOverlaySynlig / startKameraLas', () => {
  it('svart täckskikt ogenomskinligt bara i svart', () => {
    expect(startCoverSynlig('svart')).toBe(true);
    for (const f of ['oversikt', 'flyger', 'landat', 'klar'] as const) expect(startCoverSynlig(f)).toBe(false);
  });
  it('overlay renderas i alla faser utom klar', () => {
    for (const f of ['svart', 'oversikt', 'flyger', 'landat'] as const) expect(startOverlaySynlig(f)).toBe(true);
    expect(startOverlaySynlig('klar')).toBe(false);
  });
  it('kameran är låst i svart/översikt/flygning, släppt vid landning (körvyns följ tar över)', () => {
    for (const f of ['svart', 'oversikt', 'flyger'] as const) expect(startKameraLas(f)).toBe(true);
    for (const f of ['landat', 'klar'] as const) expect(startKameraLas(f)).toBe(false);
    expect(startKameraLas(null)).toBe(false);   // ingen sekvens (vanliga appen) → aldrig låst
  });
});

describe('startRadText', () => {
  const ctx = (p: Partial<Parameters<typeof startRadText>[1]>) => ({ posMs: null, kartaRedoMs: 1000, nuMs: 1000, objekt: null, ...p });

  it('utzoomad utan fix: "Söker GPS", sedan "Ingen GPS-fix" (står kvar)', () => {
    expect(startRadText('oversikt', ctx({ nuMs: 5000 }))).toBe('Söker GPS');
    expect(startRadText('oversikt', ctx({ nuMs: 1000 + FIX_TIMEOUT_MS - 1 }))).toBe('Söker GPS');
    expect(startRadText('oversikt', ctx({ nuMs: 1000 + FIX_TIMEOUT_MS }))).toBe('Ingen GPS-fix');
    expect(startRadText('oversikt', ctx({ nuMs: 1000 + FIX_TIMEOUT_MS * 3 }))).toBe('Ingen GPS-fix');
  });
  it('fix finns → ingen rad i översikten (flygningen startar strax)', () => {
    expect(startRadText('oversikt', ctx({ posMs: 900 }))).toBeNull();
  });
  it('objekt-raden först när kameran landat, m³ avrundat', () => {
    expect(startRadText('landat', ctx({ objekt: { namn: 'Hålabäck au 2025', m3kvar: 1343.8 } }))).toBe('Hålabäck au 2025 – 1344 m³ kvar');
    expect(startRadText('landat', ctx({ objekt: { namn: 'Betet', m3kvar: null } }))).toBe('Betet');
    expect(startRadText('landat', ctx({ objekt: { namn: '', m3kvar: 10 } }))).toBe('Objekt – 10 m³ kvar');
  });
  it('INGEN text i svart, under flygningen eller när det är klart', () => {
    const o = { namn: 'X', m3kvar: 5 };
    for (const f of ['svart', 'flyger', 'klar'] as const) expect(startRadText(f, ctx({ objekt: o }))).toBeNull();
  });
});
