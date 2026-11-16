// @vitest-environment jsdom
// Min plan monterad på riktigt (jsdom, kartkommentar i minnet): körordningen, valet, frågorna och tillbaka.
// Layouten (sidokolumn från 1100 px, två kolumner frågor) mäts i Chromium — jsdom har ingen layout.
// MINPLAN_HTML=<fil> skriver sidans HTML så att den kan öppnas i en riktig webbläsare.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { writeFileSync } from 'node:fs';

const h = vi.hoisted(() => ({ kommentarer: [] as { objekt_id: string; yta_nyckel: string; text: string; skapad_at: string }[], fel: false }));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: (_k: string, ids: string[]) => ({
          order: () => Promise.resolve(h.fel ? { data: null, error: { message: 'nej' } } : { data: h.kommentarer.filter((k) => ids.includes(k.objekt_id)), error: null }),
        }),
      }),
    }),
  },
}));

import { MinPlan } from './MinPlan';
import { lasTraktAnalys } from './traktanalys';
const ANALYS_EXEMPEL = lasTraktAnalys({ trakt_analys: { at: '2026-11-06T12:00:00Z', fel: [], fynd: [
  { type: 'fornlamning', name: 'Fossil åker (Väckelsång 192:1)' }, { type: 'vattenskydd', name: 'Ryd' }, { type: 'nyckelbiotop', name: 'Karsamåla' }] } });
import type { MaskinForslag } from './nasta-v2';
import type { OversiktObjekt } from './oversikt-types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const obj = (id: string, namn: string, over: Record<string, unknown> = {}) => ({ id, namn, status: 'planerad', typ: 'slutavverkning', ...over }) as unknown as OversiktObjekt;
// Prod 2026-11-05: Giant på Bondeskog, kön Lidhem Britteberg → Lidhem Bondagård.
const bondeskog = obj('b', 'Bondeskog AU 2026', { status: 'pagaende', areal: 6.2, volym: 900 });
const britteberg = obj('l', 'Lidhem rp 2025 Britteberg', {
  areal: 4.1, volym: 628, barighet: 'dalig', transport_trailer_in: false, markagare: 'Johannishus Godsförvaltning Ab', markagare_tel: '0457-123 45', markagare_ska_ha_ved: true,
  anteckningar: 'OBS! Fossil åker.', traktdirektiv_url: 'https://x/td.pdf', sortiment: ['Gran timmer · Urshult'],
  riskbedomning: { godkand: { at: 'x', underlag: 'kraftledning=Kraftledning|Fäll aldrig mot ledningen.' } },
});
const bondagard = obj('g', 'Lidhem RP 2025 Bondagård');
const f: MaskinForslag = {
  maskinId: 'GIANT', typ: 'skordare', koordinat: null, positionAlder: 0, nuObjekt: bondeskog, manuellKo: false, skal: '',
  ko: [{ objekt: britteberg, troligt: false, kalla: 'ko' }, { objekt: bondagard, troligt: false, kalla: 'ko' }],
};

let rot: Root; let el: HTMLDivElement;
let kartan = 0;
const rendera = async (ff: MaskinForslag = f, startTrakt: string | null = null) => {
  await act(async () => {
    rot.render(<MinPlan f={ff} namn="Giant" legs={[44, 3]} varning={(id) => (id === 'l' ? { faror: [{ label: 'Kraftledning', kommentar: 'Kör inte under med kranen uppe' }], hansyn: [] } : { faror: [], hansyn: [] })}
      korDit={() => <a data-kordit="">Kör dit</a>} posFel={false} forman={false} onKarta={() => { kartan += 1; }} startTrakt={startTrakt}
      analysFor={(o) => (o.id === 'l' ? ANALYS_EXEMPEL : o.id === 'g' ? { lage: 'fel', at: 'x' } : { lage: 'klar', at: 'x', fynd: [], ofullstandig: false })} />);
  });
  await act(async () => { await Promise.resolve(); });
};
const trakt = () => el.querySelector('.mp-trakt') as HTMLElement;
const rader = () => [...el.querySelectorAll('.mp-lista button[data-rad]')] as HTMLButtonElement[];

beforeEach(() => {
  h.kommentarer = [
    { objekt_id: 'l', yta_nyckel: 'punkt:01-1', text: 'Kör på riset ut med vägen för avlägget', skapad_at: '1' },
    { objekt_id: 'l', yta_nyckel: 'traktdel:130666:0', text: 'På denna trakten finns det fossil åker', skapad_at: '2' },
    { objekt_id: 'b', yta_nyckel: 'marker:1793605827552', text: 'Fäll inte ut i denna föryngringen', skapad_at: '3' },
  ];
  h.fel = false;
  el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el);
});
afterEach(() => { act(() => rot.unmount()); el.remove(); });

describe('Min plan — körordningen till vänster, trakten till höger', () => {
  it('listan: Här nu, Nästa, 2:a — i körordning', async () => {
    await rendera();
    const t = rader().map((b) => b.textContent);
    expect(t[0]).toContain('Här nu'); expect(t[0]).toContain('Bondeskog');
    expect(t[1]).toContain('Nästa'); expect(t[1]).toContain('Britteberg'); expect(t[1]).toContain('44 km från Bondeskog');
    expect(t[2]).toContain('Sedan'); expect(t[2]).toContain('Bondagård');
    if (process.env.MINPLAN_HTML) writeFileSync(process.env.MINPLAN_HTML, el.innerHTML);
  });

  it('trakten man står på är vald från början, och pekar på Nästa', async () => {
    await rendera();
    expect(trakt().textContent).toContain('Bondeskog AU 2026');
    expect(trakt().textContent).toContain('Här nu');
    expect(trakt().querySelector('[data-kordit]')).toBeNull();            // man är redan där
    // en kommentar på en plats listas inte — den kommer upp i hytten där; sidan säger att den finns
    expect(trakt().textContent).not.toContain('Fäll inte ut i denna föryngringen');
    expect(trakt().textContent).toContain('1 sak är märkt på kartan');
    expect(trakt().textContent).toContain('Förbered dig för nästa');
  });

  it('ett tryck på Nästa: boardingkortet — Farligt, Skyddat, Innan du åker, När du är där, Mer', async () => {
    await rendera();
    await act(async () => { rader()[1].click(); });
    const t = () => trakt().textContent ?? '';
    expect(el.firstElementChild?.className).toContain('mp-vy-trakt');      // telefon: trakten är skärmen
    expect(trakt().querySelector('[data-kordit]')).not.toBeNull();
    expect(trakt().querySelector('[data-testid=oppna-trakten]')?.getAttribute('href')).toBe('/planering?objekt=l&fran=oversikt&plan=GIANT');
    const rubriker = [...trakt().querySelectorAll('h3')].map((x) => x.textContent);
    expect(rubriker).toEqual(['Farligt', 'Skyddat på trakten', 'Innan du åker', 'När du är där']);
    expect(t().match(/Kraftledning/g)?.length).toBe(1);
    expect(t()).toContain('Fäll aldrig mot ledningen.');
    expect(t()).toContain('Kör inte under med kranen uppe');
    // traktanalysen: märkena som rader
    expect(t()).toContain('Fossil åker · barmark'); expect(t()).toContain('Vattenskydd'); expect(t()).toContain('Nyckelbiotop');
    // innan du åker: det som är varning + ved, högst tre
    expect(t()).toContain('Bärighet dålig'); expect(t()).toContain('Trailern kan inte köra in'); expect(t()).toContain('Markägaren ska ha ved');
    // när du är där: Vidas text och traktdelens kommentar; platsens kommentar bara som antal
    expect(t()).toContain('OBS!');
    expect(t()).toContain('På denna trakten finns det fossil åker');
    expect(t()).not.toContain('Kör på riset ut med vägen för avlägget');
    expect(t()).toContain('1 sak är märkt på kartan');
    expect(trakt().querySelectorAll('a[href^="/planering?objekt="]')).toHaveLength(1);   // EN väg till kartan: knappen högst upp
    expect(t()).not.toContain('Sortiment');
    // Mer om trakten är stängt; ett tryck visar markägaren och papperen
    expect(t()).not.toContain('Traktdirektiv');
    await act(async () => { ([...trakt().querySelectorAll('button')].find((b) => b.textContent?.includes('Mer om trakten')) as HTMLButtonElement).click(); });
    expect(t()).toContain('Traktdirektiv'); expect(t()).toContain('Johannishus');
    if (process.env.MINPLAN_HTML) writeFileSync(process.env.MINPLAN_HTML.replace('.html', '-trakt.html'), el.innerHTML);
    await act(async () => { (trakt().querySelector('.mp-bara-smal') as HTMLButtonElement).click(); });
    expect(el.firstElementChild?.className).toContain('mp-vy-lista');
  });

  it('traktanalysen: kunde inte köras = "Ej kontrollerad"; inget hittat = ingen rubrik alls', async () => {
    await rendera();
    await act(async () => { rader()[2].click(); });                       // Bondagård: fel
    expect(trakt().textContent).toContain('Ej kontrollerad');
    await act(async () => { rader()[0].click(); });                       // Bondeskog: inget hittat
    expect(trakt().textContent).not.toContain('Skyddat på trakten');
  });

  it('ingen riskbedömning sägs i orange; kartan som inte gick att läsa sägs', async () => {
    h.fel = true;
    await rendera();
    await act(async () => { rader()[2].click(); });
    const t = trakt().textContent ?? '';
    expect(t).toContain('Riskbedömningen är inte gjord än');
    expect(t).not.toContain('Inga särskilda risker');
    expect(t).toContain('Kunde inte läsa det som står på kartan');
  });

  it('‹ Kartan står överst och går till kartan; tillbaka från Planeringen öppnar samma trakt', async () => {
    kartan = 0;
    await rendera(f, 'g');
    expect(el.firstElementChild?.className).toContain('mp-vy-trakt');
    expect(trakt().textContent).toContain('Bondagård');
    await act(async () => { ([...el.querySelectorAll('.mp-lista button')].find((b) => b.textContent === '‹ Kartan') as HTMLButtonElement).click(); });
    expect(kartan).toBe(1);
  });

  it('maskinen kommer till en ny trakt → valet hoppar dit', async () => {
    await rendera();
    await act(async () => { rader()[2].click(); });
    expect(trakt().textContent).toContain('Bondagård');
    await rendera({ ...f, nuObjekt: britteberg, ko: [{ objekt: bondagard, troligt: false, kalla: 'ko' }] });
    expect(trakt().textContent).toContain('Britteberg');
    expect(trakt().textContent).toContain('Här nu');
  });
});
