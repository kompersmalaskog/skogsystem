// @vitest-environment jsdom
// Objektlistan skickar objekten som prickar till kartan (lib/objektKarta): rätt prickar och färger, Avslutade-vyn, 50 %-arket och ingen fångst.
// Verkligt DOM-beteende (jsdom) med en fake supabase/GPS/OSRM. Planeringssidan själv monteras inte (22 000 rader).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Fake supabase: `objekt` (rader/fel) plus de övriga tabellerna listan läser (skotning kvar + traktgränser). Utan data = tomma rader, inget fel.
const h = vi.hoisted(() => ({
  rader: [] as any[], fel: false,
  tabeller: {} as Record<string, any[]>, tabellFel: {} as Record<string, boolean>,
  gps: { giltig: true, lat: 56.4, lng: 14.7 } as any,
  vantaPa: {} as Record<string, Promise<void> | undefined>,   // håller tillbaka en tabells svar tills testet släpper det
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (tabell: string) => ({
      select: () => {
        const svar = () => {
          if (tabell === 'objekt') return h.fel ? { data: null, error: { message: 'nät' } } : { data: h.rader, error: null };
          return h.tabellFel[tabell] ? { data: null, error: { message: 'nät' } } : { data: h.tabeller[tabell] ?? [], error: null };
        };
        // Byggaren är både väntbar (objekt: .order() → await) och sidindelad (.range(), som lib/supabaseAlla använder).
        const b: any = {
          then: (ok: any, nej: any) => Promise.resolve(h.vantaPa[tabell]).then(svar).then(ok, nej),
          order: () => b,
          is: () => b,
          range: (fran: number, till: number) => {
            return Promise.resolve(h.vantaPa[tabell]).then(() => {
              const r: any = svar();
              return r.error ? r : { data: (r.data ?? []).slice(fran, till + 1), error: null };
            });
          },
        };
        return b;
      },
    }),
  },
}));
vi.mock('@/lib/gpsKalla', () => ({ hamtaEnGpsFix: () => Promise.resolve(h.gps) }));

import ObjektLista from './ObjektLista';
import { sattBredd } from './PlusRad.testhjalp';
import { RORELSE } from '@/lib/design/tokens';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const RADER = [
  { id: 'v', vo_nummer: 'VO-V', namn: 'Vällust RP M-R -25', status: 'avslutat', typ: 'slutavverkning', bolag: 'Södra', volym: 900, lat: 56.5, lng: 14.8, ar: 2025, manad: 11, avslutad_timestamp: '2026-09-01T10:00:00Z' },
  { id: 'e', namn: 'Ekeby', status: 'planerad', typ: 'slutavverkning', bolag: 'Södra', volym: 1200, lat: 56.45, lng: 14.75, ar: 2026, manad: 10 },
  { id: 'g', namn: 'GROT Hjorthult', status: 'planerad', typ: 'grot', bolag: 'Vida', volym: 80, lat: 56.9, lng: 15.1 },
  { id: 'p', namn: 'Gallring Sjö', status: 'pagaende', typ: 'gallring', bolag: 'Södra', volym: 300, lat: 56.41, lng: 14.71 },
  { id: 'n', namn: 'Energi Norra', status: 'pagaende', typ: 'energiklippning', lat: 57.0, lng: 14.0 },
  { id: 'o', namn: 'Privat jobb', status: null, typ: 'gallring' },
  { id: 'o2', namn: 'Oplanerad med plats', status: null, typ: 'gallring', lat: 56.3, lng: 14.6 },
  { id: 'a2', namn: 'Äldre avslutat', status: 'avslutat', typ: 'gallring', avslutad_timestamp: '2026-01-01T10:00:00Z' },
];

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
// setTimeout är fejkad (fake timers) — vänta bara på mikrotasks (fake supabase/GPS/OSRM svarar direkt).
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); }); };
const avancera = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const q = (id: string) => behallare!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const klicka = (el: Element | null) => { expect(el).not.toBeNull(); act(() => { (el as HTMLElement).click(); }); };


import type { KartPrickar } from '@/lib/objektKarta';

// Traktgräns (L_TRAKTDEL) som kvadrat runt en punkt — samma form som objekt_geometri.geometri.
const kvadrat = (lat: number, lng: number, d: number) => ({
  type: 'FeatureCollection',
  features: [{ properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]] } }],
});

type Props = { oppen?: boolean; kanStangas?: boolean; kartaTryck?: boolean };
const sand: Array<KartPrickar | null> = [];
const spion = { valj: [] as string[], stang: 0 };
async function montera(p: Props = {}) {
  behallare = document.createElement('div');
  document.body.appendChild(behallare);
  rot = createRoot(behallare);
  await visa(p);
}
async function visa(p: Props) {
  await act(async () => {
    rot!.render(<ObjektLista oppen={p.oppen ?? true} kanStangas={p.kanStangas ?? true} valtId={null} kartaTryck={p.kartaTryck ?? true}
      onValj={(o) => spion.valj.push(o.id)} onNavigera={() => {}} onStang={() => { spion.stang += 1; }} onPrickar={(x) => sand.push(x)} />);
  });
  await flush();
}
const senaste = () => { for (let i = sand.length - 1; i >= 0; i--) if (sand[i]) return sand[i]!; return null; };
const prickar = () => Object.fromEntries((senaste()?.prickar ?? []).map((p) => [p.id, p]));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  h.rader = RADER; h.fel = false; h.tabeller = {}; h.tabellFel = {}; h.gps = { giltig: true, lat: 56.4, lng: 14.7 };
  spion.valj = []; spion.stang = 0; sand.length = 0;
  sattBredd(1280);
  (globalThis as any).fetch = vi.fn(async () => ({ json: async () => ({ routes: [{ distance: 20000 }] }) }));
});
afterEach(async () => { await act(async () => { rot?.unmount(); }); behallare?.remove(); rot = null; vi.useRealTimers(); });

describe('prickar till kartan när listan är öppen', () => {
  it('Pågår = grön, Planerade = grå, Oplanerade = ihålig grå ring; avslutade och objekt utan koordinat ritas inte', async () => {
    await montera();
    const p = prickar();
    expect(Object.keys(p).sort()).toEqual(['e', 'g', 'n', 'o2', 'p']);
    expect(p.o2.farg).toBe('ihalig');
    expect(p.p.farg).toBe('gron');
    expect(p.n.farg).toBe('gron');
    expect(p.e.farg).toBe('gra');
    expect(p.g.farg).toBe('gra');
    expect(p.v).toBeUndefined();          // avslutat
    expect(p.o).toBeUndefined();          // oplanerad men utan koordinat: bara listan
    expect(senaste()!.nyckel).toBe('aktiva');
  });

  it('Skotning kvar (avslutat med virke kvar) är grön, som under Pågår i listan', async () => {
    h.tabeller = {
      dim_objekt: [{ objekt_id: 'v', vo_nummer: 'VO-V', skotning_avslutad: null, egen_skotning: false }],
      vy_uppf_prod_per_objekt: [{ objekt_id: 'v', volym_m3sub: 900 }],
      vy_uppf_lass_per_objekt: [{ objekt_id: 'v', volym_m3sub: 600 }],
    };
    await montera();
    expect(prickar().v).toMatchObject({ farg: 'gron', har: false });
  });

  it('objektet man står på (GPS innanför traktgränsen) har blå ring', async () => {
    h.tabeller = { objekt_geometri: [{ objekt_id: 'p', geometri: kvadrat(56.4, 14.7, 0.01) }, { objekt_id: 'e', geometri: kvadrat(56.45, 14.75, 0.01) }] };
    await montera();
    const p = prickar();
    expect(p.p.har).toBe(true);
    expect(p.p.farg).toBe('gron');         // behåller statusfärgen
    expect(p.e.har).toBe(false);
    expect(Object.values(p).filter((x) => x.har)).toHaveLength(1);
  });

  it('ingen "Här" utan fix eller utan laddade gränser → ingen ring', async () => {
    h.gps = { giltig: false };
    h.tabeller = { objekt_geometri: [{ objekt_id: 'p', geometri: kvadrat(56.4, 14.7, 0.5) }] };
    await montera();
    expect(Object.values(prickar()).some((x) => x.har)).toBe(false);
  });

  it('inget skickas förrän skotning-kvar-frågan är besvarad — aldrig prickar med fel färg, och inga prickar som hoppar in efteråt', async () => {
    let slapp!: () => void;
    h.vantaPa.dim_objekt = new Promise<void>((r) => { slapp = r; });
    h.tabeller = {
      dim_objekt: [{ objekt_id: 'v', vo_nummer: 'VO-V', skotning_avslutad: null, egen_skotning: false }],
      vy_uppf_prod_per_objekt: [{ objekt_id: 'v', volym_m3sub: 900 }],
      vy_uppf_lass_per_objekt: [{ objekt_id: 'v', volym_m3sub: 600 }],
    };
    await montera();
    expect(q('objekt-rad-p')).not.toBeNull();        // objekten är lästa och syns i listan …
    expect(senaste()).toBeNull();                    // … men kartan får inget förrän skotning kvar är känt
    await act(async () => { slapp(); });
    await flush();
    expect(prickar().v).toMatchObject({ farg: 'gron' });   // Vällust med i sin rätta färg första gången
  });

  it('sökning flyttar inte prickarna (kartan följer inte sökfältet)', async () => {
    await montera();
    const fore = JSON.stringify(senaste()!.prickar);
    const sok = q('objekt-lista-sok') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(sok, 'Ekeby'); sok.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
    expect(JSON.stringify(senaste()!.prickar)).toBe(fore);
    expect(q('objekt-rad-p')).toBeNull();      // men listan är filtrerad
  });

  it('prickens valj() = trycket på raden: objektet öppnas via onValj', async () => {
    await montera();
    act(() => { senaste()!.valj('e'); });
    expect(spion.valj).toEqual(['e']);
    act(() => { senaste()!.valj('finns-inte'); });
    expect(spion.valj).toEqual(['e']);
  });

  it('stängs listan skickas null (kartan ska inte ha kvar prickar), och nästa öppning börjar om', async () => {
    await montera();
    expect(senaste()).not.toBeNull();
    await visa({ oppen: false });
    expect(sand[sand.length - 1]).toBeNull();
    await visa({ oppen: true });
    expect(sand[sand.length - 1]).not.toBeNull();
    expect(senaste()!.nyckel).toBe('aktiva');
  });
});

describe('Avslutade-vyn på kartan', () => {
  it('bara den valda typens avslutade syns (inga aktiva); byter man typ byts prickarna och nyckeln', async () => {
    await montera();
    klicka(q('objekt-lista-avslutade'));
    await flush();
    const n = senaste()!;
    expect(n.nyckel).toMatch(/^avslutade:/);
    const forsta = n.nyckel;
    expect(n.prickar.length).toBeGreaterThan(0);
    expect(n.prickar.every((p) => p.farg === 'gra' && !p.har)).toBe(true);
    expect(n.prickar.map((p) => p.id)).not.toContain('p');    // inget aktivt
    // 'a2' (gallring) har ingen koordinat → ritas inte; 'v' (slutavverkning) ritas
    const typer = Array.from(behallare!.querySelectorAll('[data-testid^="avslutade-typ-"]')).map((e) => e.getAttribute('data-testid')!.replace('avslutade-typ-', ''));
    expect(typer.length).toBeGreaterThan(1);
    const annan = typer.find((t) => `avslutade:${t}` !== forsta)!;
    klicka(q(`avslutade-typ-${annan}`));
    await flush();
    expect(senaste()!.nyckel).toBe(`avslutade:${annan}`);
    expect(senaste()!.nyckel).not.toBe(forsta);
  });

  it('tillbaka till listan → de aktiva prickarna igen', async () => {
    await montera();
    klicka(q('objekt-lista-avslutade')); await flush();
    klicka(q('objekt-lista-tillbaka')); await flush();
    expect(senaste()!.nyckel).toBe('aktiva');
    expect(Object.keys(prickar()).sort()).toEqual(['e', 'g', 'n', 'o2', 'p']);
  });

  it('Avslutade-vyns val nollställs vid ny öppning (kartan börjar med de aktiva)', async () => {
    await montera();
    klicka(q('objekt-lista-avslutade')); await flush();
    await visa({ oppen: false });
    await visa({ oppen: true });
    expect(senaste()!.nyckel).toBe('aktiva');
  });
});

describe('Avslutade-vyn: prickarna är det listan visar', () => {
  const skriv = async (text: string) => {
    const sok = q('objekt-lista-sok') as HTMLInputElement;
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(sok, text); sok.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await flush();
  };
  it('sök i Avslutade söker i alla typer — och då har alla träffar en prick (nyckeln ändras inte per tecken)', async () => {
    h.rader = [...RADER, { id: 'g2', namn: 'Vällust Gallring', status: 'avslutat', typ: 'gallring', lat: 56.7, lng: 14.9, avslutad_timestamp: '2026-08-01T10:00:00Z' }];
    await montera();
    klicka(q('objekt-lista-avslutade')); await flush();
    const typNyckel = senaste()!.nyckel;
    expect(typNyckel).toMatch(/^avslutade:(slutavverkning|gallring)$/);
    expect(senaste()!.prickar.map((p) => p.id)).not.toContain(typNyckel.endsWith('gallring') ? 'v' : 'g2');   // bara vald typ utan sökning
    await skriv('Vällust');
    expect(senaste()!.nyckel).toBe('avslutade:sok');
    expect(senaste()!.prickar.map((p) => p.id).sort()).toEqual(['g2', 'v']);                                    // båda typerna: allt listan visar
    await skriv('Vällust G');
    expect(senaste()!.nyckel).toBe('avslutade:sok');
    expect(senaste()!.prickar.map((p) => p.id)).toEqual(['g2']);
    await skriv('');
    expect(senaste()!.nyckel).toBe(typNyckel);
  });
});

describe('ark och fångst när kartan tar trycken', () => {
  it('telefon: arket är nedre halvan (kartan syns ovanför) och ingen fångst ligger över kartan', async () => {
    sattBredd(390);
    await montera({ kartaTryck: true });
    expect(q('objekt-lista')!.getAttribute('data-lage')).toBe('ark');
    expect(q('objekt-lista')!.style.height).toBe('50%');
    expect(q('objekt-lista-bakgrund')).toBeNull();
  });
  it('bred skärm: panelen oförändrad (380 px från höger), ingen fångst', async () => {
    await montera({ kartaTryck: true });
    expect(q('objekt-lista')!.getAttribute('data-lage')).toBe('panel');
    expect(q('objekt-lista-bakgrund')).toBeNull();
  });
  it('utan kartaTryck (kartläge igång, eller sidan utan karta): 85 %, ingen grepp, och fångsten över kartan stänger INTE listan', async () => {
    sattBredd(390);
    await montera({ kartaTryck: false });
    expect(q('objekt-lista')!.style.height).toBe('85%');
    expect(q('objekt-lista-grepp')).toBeNull();
    expect(q('objekt-lista-bakgrund')).not.toBeNull();
    klicka(q('objekt-lista-bakgrund'));
    await avancera(1000);
    klicka(q('objekt-lista-bakgrund'));
    expect(spion.stang).toBe(0);
  });
  it('utan onPrickar (maskinläge/andra anrop) skickas inget och inget går sönder', async () => {
    behallare = document.createElement('div'); document.body.appendChild(behallare); rot = createRoot(behallare);
    await act(async () => { rot!.render(<ObjektLista oppen kanStangas valtId={null} onValj={() => {}} onNavigera={() => {}} onStang={() => {}} />); });
    await flush();
    expect(q('objekt-lista')).not.toBeNull();
    expect(sand).toHaveLength(0);
  });
});

// ── Telefon: arket öppnas på halv höjd, dras upp till nästan full och ner igen; ett halvt ark som dras ned stängs ──
const peka = (el: Element, typ: 'pointerdown' | 'pointermove' | 'pointerup', clientY: number) =>
  act(() => { el.dispatchEvent(new MouseEvent(typ, { bubbles: true, cancelable: true, clientY })); });
const grepp = () => q('objekt-lista-grepp')!;
const hojd = () => q('objekt-lista')!.style.height;
// jsdom skriver om calc()-strängen; det som ska gälla är: hela fönstret minus statusraden (safe-area-inset-top) och en liten marginal.
const arHel = () => { const h = hojd(); return h.startsWith('calc(100%') && h.includes('safe-area-inset-top'); };
const dra = async (fran: number, till: number) => { await peka(grepp(), 'pointerdown', fran); await peka(grepp(), 'pointermove', (fran + till) / 2); await peka(grepp(), 'pointermove', till); await peka(grepp(), 'pointerup', till); };

describe('telefon: arket halv ↔ hel, dras ned för att stänga', () => {
  beforeEach(() => { sattBredd(390); (window as any).innerHeight = 800; });

  it('öppnas på halv höjd och har ett grepp (som plus-arket)', async () => {
    await montera({ kartaTryck: true });
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('halv');
    expect(hojd()).toBe('50%');
    expect(grepp()).not.toBeNull();
    expect(grepp().getAttribute('aria-label')).toBe('Dra upp listan');
  });

  it('dras upp över tröskeln → nästan full höjd (under statusraden); dras ned igen → halv', async () => {
    await montera({ kartaTryck: true });
    await dra(500, 300);
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('hel');
    expect(arHel()).toBe(true);
    expect(grepp().getAttribute('aria-label')).toBe('Dra ned listan');
    await dra(100, 300);
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('halv');
    expect(hojd()).toBe('50%');
    expect(spion.stang).toBe(0);
  });

  it('ett kort drag (under tröskeln) far tillbaka', async () => {
    await montera({ kartaTryck: true });
    await dra(500, 470);
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('halv');
    expect(hojd()).toBe('50%');
    expect(spion.stang).toBe(0);
  });

  it('under draget följer höjden fingret (aldrig under 30 % eller över fönstret)', async () => {
    await montera({ kartaTryck: true });
    q('objekt-lista')!.getBoundingClientRect = () => ({ height: 400 } as DOMRect);
    await peka(grepp(), 'pointerdown', 500);
    await peka(grepp(), 'pointermove', 400);
    expect(hojd()).toBe('500px');
    await peka(grepp(), 'pointermove', -900);
    expect(hojd()).toBe('800px');
    await peka(grepp(), 'pointerup', -900);
  });

  it('ett halvt ark som dras ned över tröskeln STÄNGS (onStang) — plus-arket gör inte det, listan gör det', async () => {
    await montera({ kartaTryck: true });
    await dra(500, 600);
    expect(spion.stang).toBe(1);
  });

  it('ett helt ark som dras ned går först till halv — stänger inte', async () => {
    await montera({ kartaTryck: true });
    await dra(500, 300);
    await dra(100, 400);
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('halv');
    expect(spion.stang).toBe(0);
  });

  it('tryck på greppet (utan drag) växlar halv ↔ hel', async () => {
    await montera({ kartaTryck: true });
    await peka(grepp(), 'pointerdown', 500); await peka(grepp(), 'pointerup', 500);
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('hel');
    await peka(grepp(), 'pointerdown', 100); await peka(grepp(), 'pointerup', 100);
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('halv');
  });

  it('nästa öppning börjar alltid på halv höjd', async () => {
    await montera({ kartaTryck: true });
    await dra(500, 300);
    expect(arHel()).toBe(true);
    await visa({ oppen: false });
    await visa({ oppen: true });
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('halv');
    expect(hojd()).toBe('50%');
  });

  it('inget objekt valt (kanStangas=false): drag upp fungerar, drag ned stänger inget (far tillbaka)', async () => {
    await montera({ kartaTryck: true, kanStangas: false });
    await dra(500, 600);
    expect(spion.stang).toBe(0);
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('halv');
    await dra(500, 300);
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBe('hel');
  });

  it('× och Esc stänger fortfarande', async () => {
    await montera({ kartaTryck: true });
    klicka(q('objekt-lista-stang'));
    expect(spion.stang).toBe(1);
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(spion.stang).toBe(2);
  });

  it('bred skärm (panel): inget grepp, ingen halv/hel — panelen är oförändrad och tryck på kartan stänger inte', async () => {
    sattBredd(1280);
    await montera({ kartaTryck: true });
    expect(q('objekt-lista')!.getAttribute('data-lage')).toBe('panel');
    expect(q('objekt-lista-grepp')).toBeNull();
    expect(q('objekt-lista')!.getAttribute('data-detent')).toBeNull();
    expect(q('objekt-lista-bakgrund')).toBeNull();
  });
});
