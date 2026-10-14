// @vitest-environment jsdom
// Objektlistan i planeringsvyn (ark under 900 px, panel från 900 px): gruppering efter status, rad och km-knapp, stängning, rörelse.
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
          then: (ok: any, nej: any) => Promise.resolve(svar()).then(ok, nej),
          order: () => b,
          is: () => b,
          range: (fran: number, till: number) => {
            const r: any = svar();
            return Promise.resolve(r.error ? r : { data: (r.data ?? []).slice(fran, till + 1), error: null });
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
  { id: 'a2', namn: 'Äldre avslutat', status: 'avslutat', typ: 'gallring', avslutad_timestamp: '2026-01-01T10:00:00Z' },
];

let rot: Root | null = null;
let behallare: HTMLElement | null = null;
// setTimeout är fejkad (fake timers) — vänta bara på mikrotasks (fake supabase/GPS/OSRM svarar direkt).
const flush = async () => { for (let i = 0; i < 12; i++) await act(async () => { await Promise.resolve(); }); };
const avancera = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });
const q = (id: string) => behallare!.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const klicka = (el: Element | null) => { expect(el).not.toBeNull(); act(() => { (el as HTMLElement).click(); }); };

type Props = { oppen?: boolean; kanStangas?: boolean; valtId?: string | null };
const spion = { valj: [] as string[], nav: [] as string[], stang: 0 };
async function montera(p: Props = {}) {
  behallare = document.createElement('div');
  document.body.appendChild(behallare);
  rot = createRoot(behallare);
  await visa(p);
}
async function visa(p: Props) {
  await act(async () => {
    rot!.render(<ObjektLista oppen={p.oppen ?? true} kanStangas={p.kanStangas ?? true} valtId={p.valtId ?? null}
      onValj={(o) => spion.valj.push(o.id)} onNavigera={(o) => spion.nav.push(o.id)} onStang={() => { spion.stang += 1; }} />);
  });
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  h.rader = RADER; h.fel = false; h.tabeller = {}; h.tabellFel = {}; h.gps = { giltig: true, lat: 56.4, lng: 14.7 };
  spion.valj = []; spion.nav = []; spion.stang = 0;
  sattBredd(1280);
  (globalThis as any).fetch = vi.fn(async (url: string) => {
    const m = /;(-?[\d.]+),(-?[\d.]+)\?/.exec(url);    // OSRM: …/lng,lat;lng,lat?  — vägavstånd = 1 000 × (lat − 56,4)·100 m, bara för att ge ett känt tal
    const lat = m ? parseFloat(m[2]) : 56.4;
    return { json: async () => ({ routes: [{ distance: Math.round((lat - 56.4) * 100 * 1000 + 19800) }] }) };
  });
});
afterEach(async () => { await act(async () => { rot?.unmount(); }); behallare?.remove(); rot = null; vi.useRealTimers(); });

describe('grupperna utgår från status', () => {
  it('Pågår först (grön prick), sedan Planerade och Oplanerade (grå prick); Avslutade är EN rad längst ner', async () => {
    await montera();
    const rubriker = Array.from(behallare!.querySelectorAll('[data-testid^="objekt-grupp-"]')).map((e) => e.textContent);
    expect(rubriker).toEqual(['Pågår', 'Planerade', 'Oplanerade']);
    const ordning = Array.from(behallare!.querySelectorAll('[data-testid^="objekt-rad-"]')).map((e) => e.getAttribute('data-testid')!.replace('objekt-rad-', ''));
    expect(ordning.slice(0, 2).sort()).toEqual(['n', 'p']);                  // Pågår
    expect(ordning.slice(2, 4).sort()).toEqual(['e', 'g']);                  // Planerade
    expect(ordning[4]).toBe('o');                                            // Oplanerade
    expect(ordning).toHaveLength(5);
    expect(q('objekt-lista-avslutade')!.textContent).toContain('Avslutade');
    expect(q('objekt-lista-avslutade')!.textContent).toContain('(2)');
    // prickar: Pågår = grön, övriga = grå
    const prickar = (id: string) => q(`objekt-rad-${id}`)!.querySelector('[data-testid^="objekt-prick-"]')!.getAttribute('data-testid');
    expect(prickar('p')).toBe('objekt-prick-gron');
    expect(prickar('n')).toBe('objekt-prick-gron');
    expect(prickar('e')).toBe('objekt-prick-gra');
    expect(prickar('o')).toBe('objekt-prick-gra');
  });

  it('Vällust RP M-R -25 (avslutat) syns ALDRIG under Planerade — bara under Avslutade, även med planerad månad satt', async () => {
    await montera();
    expect(q('objekt-rad-v')).toBeNull();
    klicka(q('objekt-lista-avslutade'));
    expect(q('objekt-rad-v')).not.toBeNull();                                // Slutavverkning (förvald: lika många, fast ordning)
    expect(q('objekt-rad-a2')).toBeNull();                                   // Gallring ligger under sin egen växlarknapp
    klicka(q('avslutade-typ-gallring'));
    expect(q('objekt-rad-a2')).not.toBeNull();
    expect(q('objekt-rad-e')).toBeNull();                                    // aktiva syns inte i Avslutade-vyn
    expect(q('objekt-lista')!.textContent).toContain('Avslutade');
    klicka(q('objekt-lista-tillbaka'));
    expect(q('objekt-rad-e')).not.toBeNull();
    expect(q('objekt-rad-v')).toBeNull();
  });

  it('GROT och energiklippning syns bland de aktiva; inga typknappar eller flikar', async () => {
    await montera();
    expect(q('objekt-rad-g')!.textContent).toContain('GROT Hjorthult');
    expect(q('objekt-rad-g')!.textContent).toContain('Grot');
    expect(q('objekt-rad-n')!.textContent).toContain('Energiklippning');
    const knappar = Array.from(behallare!.querySelectorAll('button')).map((b) => b.textContent);
    for (const typ of ['Alla', 'Slutavverkning', 'Gallring']) expect(knappar).not.toContain(typ);
    expect(behallare!.querySelector('[role="tab"]')).toBeNull();
    expect(behallare!.querySelector('[aria-pressed]')).toBeNull();
  });

  it('inom gruppen närmast först (km ur GPS-positionen)', async () => {
    await montera();
    const planerade = Array.from(behallare!.querySelectorAll('[data-testid^="objekt-rad-"]')).map((e) => e.getAttribute('data-testid')!.replace('objekt-rad-', '')).filter((i) => ['e', 'g'].includes(i));
    expect(planerade).toEqual(['e', 'g']);                                   // Ekeby 0,05° bort, GROT Hjorthult 0,5° bort
  });
});

// Traktgräns (L_TRAKTDEL) som kvadrat runt en punkt — samma form som objekt_geometri.geometri.
const kvadrat = (lat: number, lng: number, d: number) => ({
  type: 'FeatureCollection',
  features: [{ properties: { _lager: 'L_TRAKTDEL' }, geometry: { type: 'Polygon', coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]] } }],
});
const radIdn = () => Array.from(behallare!.querySelectorAll('[data-testid^="objekt-rad-"]')).map((e) => e.getAttribute('data-testid')!.replace('objekt-rad-', ''));
const rubriker = () => Array.from(behallare!.querySelectorAll('[data-testid^="objekt-grupp-"]')).map((e) => e.textContent);

// Vällust-formen: status avslutat, planerad månad satt. Skördat 900 m³, skotat 600 → 300 m³ kvar på backen.
const vallustSkotning = (skotat: number, extra: Record<string, unknown> = {}) => {
  h.tabeller = {
    dim_objekt: [{ objekt_id: 'v', vo_nummer: 'VO-V', skotning_avslutad: null, egen_skotning: false, ...extra }],
    vy_uppf_prod_per_objekt: [{ objekt_id: 'v', volym_m3sub: 900 }],
    vy_uppf_lass_per_objekt: [{ objekt_id: 'v', volym_m3sub: skotat }],
  };
};

describe('Skotning kvar — avslutat där skotningen inte är klar ligger under Pågår', () => {
  it('Vällust-formen (avslutat, virke kvar): under Pågår med etiketten "Skotning kvar", inte under Planerade och inte bland Avslutade', async () => {
    vallustSkotning(600);
    await montera();
    expect(rubriker()).toEqual(['Pågår', 'Planerade', 'Oplanerade']);
    const pagar = radIdn().slice(0, 3);
    expect(pagar).toContain('v');
    expect(pagar.sort()).toEqual(['n', 'p', 'v']);
    expect(q('objekt-skotning-kvar-v')!.textContent).toBe('Skotning kvar');
    expect(q('objekt-rad-v')!.querySelector('[data-testid="objekt-prick-gron"]')).not.toBeNull();   // Pågår = grön prick
    expect(q('objekt-lista-avslutade')!.textContent).toContain('(1)');                                  // bara "Äldre avslutat" är kvar
    klicka(q('objekt-lista-avslutade'));
    expect(q('objekt-rad-v')).toBeNull();
    expect(q('objekt-rad-a2')).not.toBeNull();
  });

  it('etiketten sitter bara på det objektet — inte på de andra Pågår-raderna', async () => {
    vallustSkotning(600);
    await montera();
    expect(behallare!.querySelectorAll('[data-testid^="objekt-skotning-kvar-"]')).toHaveLength(1);
    expect(q('objekt-rad-p')!.textContent).not.toContain('Skotning kvar');
  });

  it('skotningen klar (≤ 5 m³ kvar) → Avslutade, ingen etikett', async () => {
    vallustSkotning(897);
    await montera();
    expect(q('objekt-rad-v')).toBeNull();
    expect(behallare!.querySelector('[data-testid^="objekt-skotning-kvar-"]')).toBeNull();
    expect(q('objekt-lista-avslutade')!.textContent).toContain('(2)');
    klicka(q('objekt-lista-avslutade'));
    expect(q('objekt-rad-v')).not.toBeNull();
  });

  it('skotning_avslutad satt eller egen skotning → Avslutade, även med virke "kvar" i siffrorna', async () => {
    vallustSkotning(100, { skotning_avslutad: '2026-09-20' });
    await montera();
    expect(q('objekt-rad-v')).toBeNull();
    await act(async () => { rot?.unmount(); }); behallare?.remove();
    vallustSkotning(100, { egen_skotning: true });
    await montera();
    expect(q('objekt-rad-v')).toBeNull();
    expect(behallare!.querySelector('[data-testid^="objekt-skotning-kvar-"]')).toBeNull();
  });

  it('underlaget går inte att hämta → ingen gissning: avslutat förblir Avslutade', async () => {
    vallustSkotning(600);
    h.tabellFel.vy_uppf_lass_per_objekt = true;
    await montera();
    expect(q('objekt-rad-v')).toBeNull();
    expect(behallare!.querySelector('[data-testid^="objekt-skotning-kvar-"]')).toBeNull();
  });

  it('en planerad/pågående rad får aldrig etiketten, hur mycket virke det än är kvar', async () => {
    h.tabeller = {
      dim_objekt: [{ objekt_id: 'p', vo_nummer: 'VO-P', skotning_avslutad: null, egen_skotning: false }],
      vy_uppf_prod_per_objekt: [{ objekt_id: 'p', volym_m3sub: 900 }],
      vy_uppf_lass_per_objekt: [],
    };
    h.rader = RADER.map((r) => (r.id === 'p' ? { ...r, vo_nummer: 'VO-P' } : r));
    await montera();
    expect(behallare!.querySelector('[data-testid^="objekt-skotning-kvar-"]')).toBeNull();
  });
});

describe('Här — enhetens GPS innanför ett objekts traktgräns', () => {
  it('GPS innanför Gallring Sjö → "Här" överst med bara det objektet; det står inte också under Pågår', async () => {
    h.tabeller = { objekt_geometri: [{ objekt_id: 'p', geometri: kvadrat(56.4, 14.7, 0.01) }, { objekt_id: 'e', geometri: kvadrat(56.45, 14.75, 0.01) }] };
    await montera();
    expect(rubriker()).toEqual(['Här', 'Pågår', 'Planerade', 'Oplanerade']);
    expect(radIdn()[0]).toBe('p');
    expect(radIdn().filter((i) => i === 'p')).toHaveLength(1);              // exakt en grupp
    const harRubrik = q('objekt-grupp-har')!;
    const efterHar = harRubrik.nextElementSibling as HTMLElement;
    expect(efterHar.getAttribute('data-testid')).toBe('objekt-rad-p');
    expect((efterHar.nextElementSibling as HTMLElement).getAttribute('data-testid')).toBe('objekt-grupp-pagar');
  });

  it('oavsett status: ett PLANERAT objekt man står i hamnar också i Här', async () => {
    h.tabeller = { objekt_geometri: [{ objekt_id: 'e', geometri: kvadrat(56.4, 14.7, 0.01) }] };
    await montera();
    expect(rubriker()[0]).toBe('Här');
    expect(radIdn()[0]).toBe('e');
    expect(q('objekt-rad-e')!.querySelector('[data-testid="objekt-prick-gra"]')).not.toBeNull();     // prick efter status, inte efter grupp
  });

  it('avslutat UTAN virke kvar → aldrig Här, även när GPS:en står i dess gräns', async () => {
    h.tabeller = { objekt_geometri: [{ objekt_id: 'v', geometri: kvadrat(56.4, 14.7, 0.01) }] };
    await montera();
    expect(rubriker()).not.toContain('Här');
    expect(q('objekt-rad-v')).toBeNull();
  });

  it('avslutat MED virke kvar och GPS i gränsen → Här, med etiketten Skotning kvar', async () => {
    vallustSkotning(600);
    h.tabeller.objekt_geometri = [{ objekt_id: 'v', geometri: kvadrat(56.4, 14.7, 0.01) }];
    await montera();
    expect(rubriker()[0]).toBe('Här');
    expect(radIdn()[0]).toBe('v');
    expect(q('objekt-skotning-kvar-v')).not.toBeNull();
    expect(radIdn().filter((i) => i === 'v')).toHaveLength(1);
  });

  it('GPS utanför alla gränser → ingen "Här"', async () => {
    h.tabeller = { objekt_geometri: [{ objekt_id: 'p', geometri: kvadrat(56.9, 15.5, 0.01) }] };
    await montera();
    expect(rubriker()).toEqual(['Pågår', 'Planerade', 'Oplanerade']);
  });

  it('ingen GPS-fix → ingen "Här" — verksamhetens mitt (reserven för avstånden) räknas aldrig som en position', async () => {
    h.gps = { giltig: false };
    h.tabeller = { objekt_geometri: [{ objekt_id: 'p', geometri: kvadrat(56.4, 14.7, 0.5) }] };   // reservpunkten (56,40; 14,70) ligger mitt i gränsen
    await montera();
    expect(rubriker()).not.toContain('Här');
    expect(q('objekt-rad-p')).not.toBeNull();                                // objektet ligger kvar i sin vanliga grupp
  });

  it('traktgränserna kunde inte läsas (fel eller tomt svar) → ingen "Här" — aldrig en 300 m-gissning på alla objekt', async () => {
    // lat/lng på Gallring Sjö ligger ~1 km från GPS:en, Ekeby inom 300 m om punktregeln fick gälla
    h.rader = RADER.map((r) => (r.id === 'e' ? { ...r, lat: 56.4005, lng: 14.7005 } : r));
    h.tabeller = {};                                                         // objekt_geometri tomt, utan fel (utgången session)
    await montera();
    expect(rubriker()).not.toContain('Här');
    await act(async () => { rot?.unmount(); }); behallare?.remove();
    h.tabellFel.objekt_geometri = true;
    await montera();
    expect(rubriker()).not.toContain('Här');
  });

  it('objekt utan traktgräns bland laddade gränser: inom 300 m från punkten gäller (som förarlistans Här)', async () => {
    h.rader = RADER.map((r) => (r.id === 'e' ? { ...r, lat: 56.4005, lng: 14.7005 } : r));
    h.tabeller = { objekt_geometri: [{ objekt_id: 'p', geometri: kvadrat(56.9, 15.5, 0.01) }] };   // någon annans gräns finns → laddat
    await montera();
    expect(rubriker()[0]).toBe('Här');
    expect(radIdn()[0]).toBe('e');
  });

  it('sökning filtrerar även Här', async () => {
    h.tabeller = { objekt_geometri: [{ objekt_id: 'p', geometri: kvadrat(56.4, 14.7, 0.01) }] };
    await montera();
    expect(rubriker()[0]).toBe('Här');
    await act(async () => {
      const sok = q('objekt-lista-sok') as HTMLInputElement;
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      set.call(sok, 'Ekeby');
      sok.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(rubriker()).not.toContain('Här');
    expect(q('objekt-rad-e')).not.toBeNull();
  });
});

// ---- Avslutade: växlare per typ, senast avslutade först, avslutsdatum på raden -------------------------------------------------------
const AVS = (id: string, namn: string, typ: string | null, ts: string | null, extra: Record<string, unknown> = {}) =>
  ({ id, namn, status: 'avslutat', typ, bolag: 'Södra', volym: 500, avslutad_timestamp: ts, ...extra });
const AVSLUTADE_RADER = [
  AVS('s1', 'Slut Ä', 'slutavverkning', '2026-08-01T10:00:00Z'),
  AVS('s2', 'Slut B', 'slutavverkning', '2026-10-05T08:30:00Z'),
  AVS('s3', 'Slut C', 'slutavverkning', '2026-09-15T12:00:00Z'),
  AVS('s4', 'Slut D (utan datum)', 'slutavverkning', null),
  AVS('g1', 'Gall A', 'gallring', '2026-10-01T10:00:00Z'),
  AVS('g2', 'Gall B', 'gallring', '2026-07-01T10:00:00Z'),
  AVS('t1', 'Grot A', 'grot', '2026-09-20T10:00:00Z'),
  { id: 'p1', namn: 'Pågår-objekt', status: 'pagaende', typ: 'gallring', lat: 56.41, lng: 14.71 },
  { id: 'pl', namn: 'Planerat-objekt', status: 'planerad', typ: 'slutavverkning', lat: 56.45, lng: 14.75 },
];
const oppnaAvslutade = async () => { await montera(); klicka(q('objekt-lista-avslutade')); };
const avslutadeIdn = () => radIdn();
const sokText = async (t: string) => {
  await act(async () => {
    const sok = q('objekt-lista-sok') as HTMLInputElement;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(sok, t);
    sok.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('Avslutade — växlare per typ', () => {
  beforeEach(() => { h.rader = AVSLUTADE_RADER; });

  it('överst en växlare med bara de typer som finns, flest först, antal på varje: "Slutavverkning 4 · Gallring 2 · GROT 1"', async () => {
    await oppnaAvslutade();
    const v = q('avslutade-typvaxlare')!;
    expect(Array.from(v.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Slutavverkning4', 'Gallring2', 'GROT1']);
    expect(q('avslutade-typ-energiklippning')).toBeNull();                   // typer som inte finns visas inte
    expect(q('avslutade-typ-okand')).toBeNull();
  });

  it('förvald är typen med flest; bara dess objekt visas', async () => {
    await oppnaAvslutade();
    expect(q('avslutade-typ-slutavverkning')!.getAttribute('aria-checked')).toBe('true');
    expect(q('avslutade-typ-gallring')!.getAttribute('aria-checked')).toBe('false');
    expect(avslutadeIdn().sort()).toEqual(['s1', 's2', 's3', 's4']);
  });

  it('förvald följer antalet, inte en fast ordning: flest Gallring → Gallring förvald', async () => {
    h.rader = [...AVSLUTADE_RADER, AVS('g3', 'Gall C', 'gallring', '2026-06-01T10:00:00Z'), AVS('g4', 'Gall D', 'gallring', '2026-05-01T10:00:00Z'), AVS('g5', 'Gall E', 'gallring', '2026-04-01T10:00:00Z')];
    await oppnaAvslutade();
    const v = q('avslutade-typvaxlare')!;
    expect(Array.from(v.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Gallring5', 'Slutavverkning4', 'GROT1']);
    expect(q('avslutade-typ-gallring')!.getAttribute('aria-checked')).toBe('true');
    expect(avslutadeIdn()).toContain('g5');
    expect(avslutadeIdn()).not.toContain('s1');
  });

  it('tryck på en annan typ byter listan — och bara listan (växlaren ligger kvar)', async () => {
    await oppnaAvslutade();
    klicka(q('avslutade-typ-grot'));
    expect(avslutadeIdn()).toEqual(['t1']);
    expect(q('avslutade-typ-grot')!.getAttribute('aria-checked')).toBe('true');
    expect(q('avslutade-typ-slutavverkning')!.getAttribute('aria-checked')).toBe('false');
    klicka(q('avslutade-typ-gallring'));
    expect(avslutadeIdn().sort()).toEqual(['g1', 'g2']);
  });

  it('inom vald typ: senast avslutade först, objekt utan datum sist', async () => {
    await oppnaAvslutade();
    expect(avslutadeIdn()).toEqual(['s2', 's3', 's1', 's4']);                // 2026-10-05, 09-15, 08-01, utan datum
    klicka(q('avslutade-typ-gallring'));
    expect(avslutadeIdn()).toEqual(['g1', 'g2']);                            // 2026-10-01, 07-01
  });

  it('avslutsdatumet står på raden som i dagens "Avslutat 2026-10-05"; utan datum står ett streck, aldrig ett påhittat datum', async () => {
    await oppnaAvslutade();
    expect(q('objekt-rad-s2')!.textContent).toContain('Avslutat 2026-10-05');
    expect(q('objekt-rad-s1')!.textContent).toContain('Avslutat 2026-08-01');
    expect(q('objekt-rad-s4')!.textContent).toContain('Avslutat —');
    expect(q('objekt-rad-s2')!.textContent).toContain('Södra');             // källa och m³ finns kvar
    expect(q('objekt-rad-s2')!.textContent).toMatch(/500\s*m³/);               // volymText använder hårt mellanrum
  });

  it('Sök söker i alla typer: växlaren göms, träffar från flera typer visas, senast avslutat först, och typen står på raden', async () => {
    await oppnaAvslutade();
    await sokText('Södra');                                                  // alla sju avslutade har källan Södra
    expect(q('avslutade-typvaxlare')).toBeNull();
    expect(avslutadeIdn()).toEqual(['s2', 'g1', 't1', 's3', 's1', 'g2', 's4']);
    expect(q('objekt-rad-g1')!.textContent).toContain('Gallring');
    expect(q('objekt-rad-t1')!.textContent).toContain('Grot');
    expect(q('objekt-rad-g1')!.textContent).toContain('Avslutat 2026-10-01');
    await sokText('Gall B');
    expect(avslutadeIdn()).toEqual(['g2']);                                  // en träff i en annan typ än den förvalda
  });

  it('töms sökningen kommer växlaren tillbaka med samma val', async () => {
    await oppnaAvslutade();
    klicka(q('avslutade-typ-gallring'));
    await sokText('Slut');
    expect(q('avslutade-typvaxlare')).toBeNull();
    await sokText('');
    expect(q('avslutade-typ-gallring')!.getAttribute('aria-checked')).toBe('true');
    expect(avslutadeIdn().sort()).toEqual(['g1', 'g2']);
  });

  it('Energiklippning och okänd typ får egna segment när de finns — okänd typ gissas aldrig som Gallring', async () => {
    h.rader = [...AVSLUTADE_RADER, AVS('e1', 'Energi A', 'energiklippning', '2026-09-01T10:00:00Z'), AVS('o1', 'Okänd A', null, '2026-09-02T10:00:00Z')];
    await oppnaAvslutade();
    const v = q('avslutade-typvaxlare')!;
    expect(Array.from(v.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Slutavverkning4', 'Gallring2', 'GROT1', 'Energiklippning1', 'Okänd typ1']);
    klicka(q('avslutade-typ-okand'));
    expect(avslutadeIdn()).toEqual(['o1']);
    klicka(q('avslutade-typ-energiklippning'));
    expect(avslutadeIdn()).toEqual(['e1']);
  });

  it('Pågår och Planerade berörs inte, och "Avslutade (N)" räknar alla typer', async () => {
    await montera();
    expect(Array.from(behallare!.querySelectorAll('[data-testid^="objekt-grupp-"]')).map((e) => e.textContent)).toEqual(['Pågår', 'Planerade']);
    expect(radIdn().sort()).toEqual(['p1', 'pl']);
    expect(behallare!.querySelector('[role="radiogroup"]')).toBeNull();      // ingen växlare i huvudlistan
    expect(q('objekt-lista-avslutade')!.textContent).toContain('(7)');
    expect(q('objekt-rad-p1')!.textContent).not.toContain('Avslutat');
  });

  it('varje öppning börjar om: förvald typ igen', async () => {
    await oppnaAvslutade();
    klicka(q('avslutade-typ-grot'));
    await visa({ oppen: false });
    await avancera(RORELSE.byte + 100);
    await visa({ oppen: true });
    klicka(q('objekt-lista-avslutade'));
    expect(q('avslutade-typ-slutavverkning')!.getAttribute('aria-checked')).toBe('true');
  });

  it('växlarknapparna är träffytor på minst 36 px höga (40 px med ramen) och går att nå med tangentbord', async () => {
    await oppnaAvslutade();
    const b = q('avslutade-typ-gallring') as HTMLButtonElement;
    expect(b.tagName).toBe('BUTTON');
    expect(parseInt(b.style.minHeight, 10)).toBeGreaterThanOrEqual(36);
  });
});

describe('raden', () => {
  it('namn (fet) och under den typ · källa · m³', async () => {
    await montera();
    const rad = q('objekt-rad-e')!;
    expect(rad.textContent).toContain('Ekeby');
    expect(rad.textContent).toContain('Slutavverkning · Södra · 1 200 m³');
    expect(q('objekt-rad-n')!.textContent).toContain('Energiklippning');      // ingen källa/volym → bara typ, inget "–"
  });

  it('knappen till höger visar avståndet med decimalkomma och bil — och startar navigeringen, inte objektet', async () => {
    await montera();
    const km = q('objekt-km-e')!;
    expect(km.textContent).toMatch(/\d+,\d km/);
    expect(km.querySelector('svg')).not.toBeNull();
    klicka(km);
    expect(spion.nav).toEqual(['e']);
    expect(spion.valj).toEqual([]);
  });

  it('tryck på resten av raden öppnar objektet direkt (och startar ingen navigering)', async () => {
    await montera();
    klicka(q('objekt-rad-e'));
    expect(spion.valj).toEqual(['e']);
    expect(spion.nav).toEqual([]);
  });

  it('ingen koordinat → ingen km-knapp; raden går ändå att öppna', async () => {
    await montera();
    expect(q('objekt-km-o')).toBeNull();
    klicka(q('objekt-rad-o'));
    expect(spion.valj).toEqual(['o']);
  });

  it('det öppna objektet markeras (aria-current)', async () => {
    await montera({ valtId: 'e' });
    expect(q('objekt-rad-e')!.getAttribute('aria-current')).toBe('true');
    expect(q('objekt-rad-g')!.getAttribute('aria-current')).toBeNull();
  });
});

describe('sökning', () => {
  it('filtrerar på namn, källa och typ; tom träff säger vad som söktes', async () => {
    await montera();
    const sok = q('objekt-lista-sok') as HTMLInputElement;
    const skriv = (v: string) => act(() => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!; set.call(sok, v); sok.dispatchEvent(new Event('input', { bubbles: true })); });
    skriv('eke');
    expect(q('objekt-rad-e')).not.toBeNull();
    expect(q('objekt-rad-g')).toBeNull();
    skriv('vida');
    expect(q('objekt-rad-g')).not.toBeNull();
    expect(q('objekt-rad-e')).toBeNull();
    skriv('xyz');
    expect(q('objekt-lista-innehall')!.textContent).toContain('Inget objekt matchar "xyz"');
  });
});

describe('tomma tillstånd', () => {
  it('inga objekt alls förklarar varför och vad som fyller listan', async () => {
    h.rader = [];
    await montera();
    expect(q('objekt-lista-innehall')!.textContent).toContain('Inga objekt ännu');
  });
  it('hämtfel säger vad man gör', async () => {
    h.fel = true;
    await montera();
    expect(q('objekt-lista-innehall')!.textContent).toContain('öppna den igen');
  });
});

describe('ark under 900 px, panel från 900 px — samma regel som plus-arket', () => {
  it.each([[1280, 'panel'], [1440, 'panel'], [900, 'panel'], [899, 'ark'], [390, 'ark']] as const)('%i px → %s', async (bredd, lage) => {
    sattBredd(bredd);
    await montera();
    expect(q('objekt-lista')!.getAttribute('data-lage')).toBe(lage);
    await avancera(50);
    const st = q('objekt-lista')!.style;
    if (lage === 'panel') { expect(st.right).toBe('8px'); expect(st.transform).toBe('translateX(0)'); }
    else { expect(st.bottom).toBe('0px'); expect(st.transform).toBe('translateY(0)'); expect(st.borderRadius).toBe('16px 16px 0 0'); }
  });

  it('samma rörelse som plus-arket: RORELSE.byte med RORELSE.kurva (inget överskjut), och ingen mörk bakgrund över kartan', async () => {
    await montera();
    await avancera(50);
    expect(q('objekt-lista')!.style.transition).toBe(`transform ${RORELSE.byte}ms ${RORELSE.kurva}`);
    expect(RORELSE.kurva).toBe('cubic-bezier(0.2, 0, 0, 1)');
    const fangst = q('objekt-lista-bakgrund')!;
    expect(fangst.style.background).toBe('');
    expect(fangst.style.opacity).toBe('');
  });

  it('bredden läses vid varje öppning (stängd på bred → smal → nästa öppning = ark)', async () => {
    await montera();
    expect(q('objekt-lista')!.getAttribute('data-lage')).toBe('panel');
    await visa({ oppen: false });
    await avancera(RORELSE.byte + 100);
    expect(q('objekt-lista')).toBeNull();
    sattBredd(820);
    await visa({ oppen: true });
    expect(q('objekt-lista')!.getAttribute('data-lage')).toBe('ark');
  });
});

describe('stängning', () => {
  it('× stänger', async () => {
    await montera();
    klicka(q('objekt-lista-stang'));
    expect(spion.stang).toBe(1);
  });
  it('Esc stänger', async () => {
    await montera();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(spion.stang).toBe(1);
  });
  it('tryck på kartan stänger — men inte i samma stund som listan öppnades (spöktryck)', async () => {
    await montera();
    klicka(q('objekt-lista-bakgrund'));
    expect(spion.stang).toBe(0);
    await avancera(500);
    klicka(q('objekt-lista-bakgrund'));
    expect(spion.stang).toBe(1);
  });
  it('utan valt objekt är listan det enda som finns: ingen ×, ingen fångst, Esc stänger inget', async () => {
    await montera({ kanStangas: false });
    expect(q('objekt-lista-stang')).toBeNull();
    expect(q('objekt-lista-bakgrund')).toBeNull();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(spion.stang).toBe(0);
  });
  it('stängd (oppen=false) glider den ut och försvinner ur DOM; Esc lyssnar inte längre', async () => {
    await montera();
    await visa({ oppen: false });
    expect(q('objekt-lista')!.getAttribute('data-oppen')).toBe('0');
    expect(q('objekt-lista')!.style.transform).toContain('translateX(calc(100%');
    expect(q('objekt-lista')!.style.pointerEvents).toBe('none');
    expect(q('objekt-lista-bakgrund')).toBeNull();
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(spion.stang).toBe(0);
    await avancera(RORELSE.byte + 100);
    expect(q('objekt-lista')).toBeNull();
  });
  it('monterad stängd (sidan lämnar den monterad) ritar ingenting', async () => {
    await montera({ oppen: false });
    expect(behallare!.innerHTML).toBe('');
  });
  it('varje öppning börjar rent: tom sökning och aktiva objekt', async () => {
    await montera();
    klicka(q('objekt-lista-avslutade'));
    expect(q('objekt-lista')!.textContent).toContain('Avslutade');
    await visa({ oppen: false });
    await avancera(RORELSE.byte + 100);
    await visa({ oppen: true });
    expect(q('objekt-rad-e')).not.toBeNull();
    expect((q('objekt-lista-sok') as HTMLInputElement).value).toBe('');
  });
});

describe('källvakt: designtokens, inga literaler', () => {
  it('ObjektLista importerar tokens och har inga färgliteraler eller egna textstorlekar', () => {
    const kalla = readFileSync(resolve(process.cwd(), 'components/planering/ObjektLista.tsx'), 'utf8');
    expect(kalla).toContain("from '@/lib/design/tokens'");
    expect(kalla.match(/#[0-9a-fA-F]{3,8}\b/g)).toBeNull();
    expect(kalla.match(/fontSize:\s*\d/g)).toBeNull();
  });
});
