// @vitest-environment jsdom
// Min plan monterad på riktigt (jsdom, kartkommentar i minnet): körordningen, valet, frågorna och tillbaka.
// Layouten (sidokolumn från 1100 px, två kolumner frågor) mäts i Chromium — jsdom har ingen layout.
// MINPLAN_HTML=<fil> skriver sidans HTML så att den kan öppnas i en riktig webbläsare.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { writeFileSync } from 'node:fs';

const h = vi.hoisted(() => ({ kommentarer: [] as { objekt_id: string; text: string; skapad_at: string }[], fel: false }));
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
const rendera = async (ff: MaskinForslag = f) => {
  await act(async () => {
    rot.render(<MinPlan f={ff} namn="Giant" legs={[44, 3]} varning={(id) => (id === 'l' ? { faror: [{ label: 'Kraftledning', kommentar: 'Kör inte under med kranen uppe' }], hansyn: [] } : { faror: [], hansyn: [] })}
      korDit={() => <a data-kordit="">Kör dit</a>} posFel={false} forman={false} onKarta={() => {}} />);
  });
  await act(async () => { await Promise.resolve(); });
};
const trakt = () => el.querySelector('.mp-trakt') as HTMLElement;
const rader = () => [...el.querySelectorAll('.mp-lista button[aria-current], .mp-lista button')].filter((b, i, a) => a.indexOf(b) === i) as HTMLButtonElement[];

beforeEach(() => {
  h.kommentarer = [
    { objekt_id: 'l', text: 'Kör på riset ut med vägen för avlägget', skapad_at: '1' },
    { objekt_id: 'b', text: 'Fäll inte ut i denna föryngringen', skapad_at: '2' },
  ];
  h.fel = false;
  el = document.createElement('div'); document.body.appendChild(el); rot = createRoot(el);
});
afterEach(() => { act(() => rot.unmount()); el.remove(); });

describe('Min plan — körordningen till vänster, trakten till höger', () => {
  it('listan: Här nu, Nästa, 2:a — i körordning', async () => {
    await rendera();
    const t = [...el.querySelectorAll('.mp-lista button')].map((b) => b.textContent);
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
    expect(trakt().textContent).toContain('Fäll inte ut i denna föryngringen');
    expect(trakt().textContent).toContain('Förbered dig för nästa');
  });

  it('ett tryck på Nästa: frågorna, faran en gång med åtgärd + kartans kommentar, aldrig sortiment', async () => {
    await rendera();
    await act(async () => { rader()[1].click(); });
    const t = trakt().textContent ?? '';
    expect(el.firstElementChild?.className).toContain('mp-vy-trakt');      // telefon: trakten är skärmen
    expect(trakt().querySelector('[data-kordit]')).not.toBeNull();
    const rubriker = [...trakt().querySelectorAll('h3')].map((x) => x.textContent);
    expect(rubriker).toEqual(['Vad är farligt?', 'Vad ska du tänka på?', 'Hur är det att köra där?', 'Vem äger skogen?', 'Papper om trakten']);
    expect(t.match(/Kraftledning/g)?.length).toBe(1);
    expect(t).toContain('Fäll aldrig mot ledningen.');
    expect(t).toContain('Kör inte under med kranen uppe');
    expect(t).toContain('Kör på riset ut med vägen för avlägget');
    expect(t).toContain('Trailern kan inte köra in');
    expect(t).toContain('Markägaren ska ha ved');
    expect(t).not.toContain('Sortiment');
    if (process.env.MINPLAN_HTML) writeFileSync(process.env.MINPLAN_HTML.replace('.html', '-trakt.html'), el.innerHTML);
    await act(async () => { (trakt().querySelector('.mp-bara-smal') as HTMLButtonElement).click(); });
    expect(el.firstElementChild?.className).toContain('mp-vy-lista');
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

  it('maskinen kommer till en ny trakt → valet hoppar dit', async () => {
    await rendera();
    await act(async () => { rader()[2].click(); });
    expect(trakt().textContent).toContain('Bondagård');
    await rendera({ ...f, nuObjekt: britteberg, ko: [{ objekt: bondagard, troligt: false, kalla: 'ko' }] });
    expect(trakt().textContent).toContain('Britteberg');
    expect(trakt().textContent).toContain('Här nu');
  });
});
