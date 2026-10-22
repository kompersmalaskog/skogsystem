// @vitest-environment jsdom
// Gallringsvyn: det som kan gå sönder tyst — svaret som inte står först, en pågående trakt som ser klar ut,
// maskinens koder i stället för virkets namn, en kvittoknapp som syns innan skördningen är klar, eller ett läsfel
// som ser ut som "inga gallringar". Layouten (listan bredvid trakten från 1100 px, två kolumner från 640 px
// trakt-bredd) mäts i riktig Chromium, inte här — jsdom har ingen layout (CLAUDE.md).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { GallringDetalj, GallringRad } from '@/lib/gallring';
import type { PerHaLast as PerHa } from '@/lib/gallring';
import { beraknaGallradYta, type StamPos } from '@/lib/gallradYta';

let sokvag = '/gallring';
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => createElement('a', { href, ...rest }, children) }));
vi.mock('next/navigation', () => ({ usePathname: () => sokvag }));

const hamtaGallringar = vi.fn<() => Promise<GallringRad[]>>();
const hamtaGallring = vi.fn<(vo: string) => Promise<GallringDetalj | null>>();
const hamtaPerHa = vi.fn<(d: GallringRad) => Promise<PerHa>>();
const sparaYtaSvar = vi.fn<(vo: string, nyckel: string, svar: string | null) => Promise<void>>();
vi.mock('@/lib/gallring', async (orig) => ({
  ...(await orig<typeof import('@/lib/gallring')>()),
  aktuelltAr: () => 2026,
  hamtaGallringar: () => hamtaGallringar(),
  hamtaGallring: (vo: string) => hamtaGallring(vo),
  hamtaPerHa: (d: GallringRad) => hamtaPerHa(d),
  sparaYtaSvar: (vo: string, nyckel: string, svar: string | null) => sparaYtaSvar(vo, nyckel, svar),
}));

// Laserdatan (Skogsstyrelsen) nås aldrig från testet: rutorna kommer härifrån.
const hamtaLaserRutor = vi.fn<(p: [number, number][]) => Promise<{ g: number | null; dag: number | null }[]>>();
vi.mock('@/lib/laserGrundyta', () => ({ hamtaLaserRutor: (p: [number, number][]) => hamtaLaserRutor(p) }));

import GallringRam from './GallringRam';
import Trakt from './Trakt';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
async function montera(el: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(el); });
  await act(async () => { await Promise.resolve(); });
  return host;
}
afterEach(async () => {
  if (root) await act(async () => { root!.unmount(); });
  host?.remove(); root = null; host = null;
  document.body.innerHTML = '';
  hamtaGallringar.mockReset(); hamtaGallring.mockReset(); hamtaPerHa.mockReset(); sparaYtaSvar.mockReset(); hamtaLaserRutor.mockReset();
  sokvag = '/gallring';
});

function rad(over: Partial<GallringRad>): GallringRad {
  return {
    vo: '1', namn: 'Trakt', objektIds: [], maskiner: ['Rottne H8E -26'], forare: ['Oskar'], forstaDatum: '2026-10-12', sistaDatum: '2026-10-20',
    antalDagar: 7, volymM3fub: 295.7, stammar: 4285, tradslag: [{ namn: 'Gran', stammar: 3000, volym: 200 }, { namn: 'Tall', stammar: 1285, volym: 95.7 }],
    arealHa: null, skordningAvslutad: '2026-10-20', diameter: null, ...over,
  };
}

const LISTA = [
  rad({ vo: '11266677', namn: 'Intaget gallring', volymM3fub: 41.9, stammar: 1203, sistaDatum: '2026-10-22', antalDagar: 3, skordningAvslutad: null }),
  rad({ vo: '11105602', namn: 'Toftåsa gallring 2026', volymM3fub: 105.4, stammar: 909, forstaDatum: '2026-10-10', sistaDatum: '2026-10-12', antalDagar: 3 }),
  rad({ vo: '11219862', namn: 'Hålabäck 16 ga 2026', volymM3fub: 141.2, stammar: 3180, forstaDatum: '2026-08-27', sistaDatum: '2026-09-02', antalDagar: 5 }),
  rad({ vo: '999', namn: 'Gammal', sistaDatum: '2025-12-01' }),
];

describe('listan', () => {
  it('svaret först: årets volym som summan av de visade raderna, och hur många som pågår', async () => {
    hamtaGallringar.mockResolvedValue(LISTA);
    const h = await montera(createElement(GallringRam, null, createElement('div')));
    expect(h.querySelector('[data-svar]')?.textContent).toBe('288,5 m³fub'); // 41,9 + 105,4 + 141,2
    expect(h.textContent).toContain('3 trakter · 1 pågår');
    expect(h.textContent).toContain('1 trakt från tidigare år visas inte');
  });

  it('pågående trakt står under Pågår, de klara per månad', async () => {
    hamtaGallringar.mockResolvedValue(LISTA);
    const h = await montera(createElement(GallringRam, null, createElement('div')));
    const sektioner = Array.from(h.querySelectorAll('section')).map((s) => [s.getAttribute('aria-label'), Array.from(s.querySelectorAll('[data-trakt-rad]')).map((a) => a.getAttribute('data-trakt-rad'))]);
    expect(sektioner).toEqual([
      ['Pågår', ['11266677']],
      ['Oktober', ['11105602']],
      ['September', ['11219862']],
    ]);
    const intaget = h.querySelector('[data-trakt-rad="11266677"]')!;
    expect(intaget.textContent).toContain('Senast');
    expect(intaget.textContent).toContain('41,9 m³');
    expect(h.querySelector('[data-trakt-rad="11105602"]')!.textContent).toContain('10–12 okt · 3 dagar');
  });

  it('vald trakt är markerad i listan (listan bredvid på bred skärm)', async () => {
    hamtaGallringar.mockResolvedValue(LISTA);
    sokvag = '/gallring/11105602';
    const h = await montera(createElement(GallringRam, null, createElement('div')));
    expect(h.querySelector('[aria-current="page"]')?.getAttribute('data-trakt-rad')).toBe('11105602');
    expect(h.querySelector('.gr-trakt-vy')).not.toBeNull();
  });

  it('ett läsfel är ett fel med Försök igen — aldrig en tom lista', async () => {
    hamtaGallringar.mockRejectedValueOnce(new Error('nät')).mockResolvedValueOnce(LISTA);
    const h = await montera(createElement(GallringRam, null, createElement('div')));
    expect(h.textContent).toContain('Kunde inte läsa gallringarna');
    expect(h.querySelector('[data-tom]')).toBeNull();
    const knapp = Array.from(h.querySelectorAll('button')).find((b) => b.textContent === 'Försök igen')!;
    await act(async () => { knapp.click(); });
    await act(async () => { await Promise.resolve(); });
    expect(h.querySelector('[data-svar]')).not.toBeNull();
  });

  it('kvittot ritas utan ram och utan lista', async () => {
    sokvag = '/gallring/11105602/kvitto';
    const h = await montera(createElement(GallringRam, null, createElement('p', { id: 'kvitto' }, 'kvitto')));
    expect(h.querySelector('#kvitto')).not.toBeNull();
    expect(h.querySelector('[data-gallring-lista]')).toBeNull();
    expect(hamtaGallringar).not.toHaveBeenCalled();
  });
});

const DETALJ: GallringDetalj = {
  ...rad({ vo: '11183108', namn: 'Sandåsen gallring 2025', skordningAvslutad: null }),
  sortiment: [
    { grupp: 'Massa', namn: 'BmavFall_V3', stockar: 900, volym: 200 },
    { grupp: 'Massaved', namn: 'Bjork mav3m', stockar: 100, volym: 36 },
    { grupp: 'Kubb', namn: 'Alvesta275_V3', stockar: 80, volym: 36 },
    { grupp: 'Energi', namn: 'AvkapGran_V3', stockar: 40, volym: 23.7 },
  ],
  dagar: [{ datum: '2026-10-12', stammar: 600, volym: 40 }, { datum: '2026-10-13', stammar: 700, volym: 45 }],
  diameter: {
    matta: 4000, dgvMm: 142, medelMm: 130, medianMm: 128, minMm: 60, maxMm: 290, grundytaM2: 5,
    klasser: [{ franMm: 80, tillMm: 100, antal: 500 }, { franMm: 100, tillMm: 120, antal: 1500 }, { franMm: 280, tillMm: null, antal: 10 }],
  },
};

const PER_HA: PerHa = {
  lage: 'ok', arealHa: 8.834, vidaHa: 8.834, yta: null, svarSparas: true, volymPerHa: 22.4, stammarPerHa: 347.2, grundytaPerHa: 4.2, andelUtanfor: 0.284,
  stickvag: { lage: 'ok', andel: 0.24, avstandM: 16.7, roller: ['skordare', 'skotare'] },
};

describe('trakten', () => {
  beforeEach(() => {
    hamtaPerHa.mockResolvedValue(PER_HA);
    hamtaLaserRutor.mockResolvedValue([]);
  });

  it('svaret först, status i ord, maskinens namn och ingen kvittoknapp medan den pågår', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    const svar = h.querySelector('[data-svar]')!;
    expect(svar.textContent).toContain('VO 11183108 · Pågår');
    expect(svar.textContent).toContain('295,7 m³fub');
    expect(svar.textContent).toContain('medelstam 0,069 m³');
    expect(svar.textContent).toContain('Rottne H8E -26');
    expect(h.querySelector('[data-kvitto]')).toBeNull();
    expect(h.textContent).toContain('Kvitto kan skapas när skördningen är klar');
  });

  it('kvittot är vyns enda handling när skördningen är klar', async () => {
    hamtaGallring.mockResolvedValue({ ...DETALJ, skordningAvslutad: '2026-10-20' });
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    expect(h.textContent).toContain('Klar 20 okt');
    expect(h.querySelector('[data-kvitto]')?.getAttribute('href')).toBe('/gallring/11183108/kvitto');
  });

  it('virket i fyra grupper — maskinens koder syns aldrig', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    const virket = h.querySelector('section[aria-label="Vad blev virket?"]')!;
    expect(virket.textContent).toContain('Massaved');
    expect(virket.textContent).toContain('236,0 m³');
    expect(virket.textContent).toContain('Kubb');
    expect(h.textContent).not.toContain('BmavFall');
    expect(h.textContent).not.toContain('Alvesta275');
  });

  it('Dgv i cm, en gång', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    expect(h.textContent!.match(/Dgv \d/g)).toEqual(['Dgv 1']);
    expect(h.textContent).toContain('Dgv 14,2 cm');
    expect(h.textContent!.replace(/\u00a0/g, ' ')).toContain('Bygger på 4 000 av 4 285 stammar');
  });

  it('trädslag och dagar ligger bakom en rad som öppnar ett ark', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    const mer = h.querySelector('[data-mer]') as HTMLButtonElement;
    expect(mer.textContent).toContain('Trädslag och dagar');
    expect(mer.textContent).toContain('Gran 68 % · Tall 32 %');
    await act(async () => { mer.click(); });
    const ark = document.querySelector('[role="dialog"]')!;
    expect(ark.textContent).toContain('Vilka träd togs ut?');
    expect(ark.textContent).toContain('mån 12 okt');
  });

  it('per hektar på Vidas traktgräns: rader, stammar utanför och stickvägarna i ord', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    const s = h.querySelector('section[aria-label="Hur hårt gallrades det?"]')!;
    const t = s.textContent!.replace(/\u00a0/g, ' ');
    expect(t).toContain('22,4 m³fub/ha');
    expect(t).toContain('347 st/ha');
    expect(t).toContain('4,2 m²/ha');
    expect(t).toContain('ca 24 %');
    expect(t).toContain('ca 17 m isär');
    expect(t).toContain('8,8 ha enligt Vidas traktgräns.');
    expect(t).toContain('28 % av stammarna står utanför (väg in eller enstaka träd) och räknas inte per hektar.');
    expect(t).toContain('skördarens och skotarens GPS-spår');
    // Per hektar står på ETT ställe: inte också i huvudet (där kom det ur objekt.areal, som var fel på Sandåsen).
    expect(h.querySelector('[data-svar]')!.textContent).not.toContain('st/ha');
  });

  it('stickvägar utan spår eller med ofullständigt spår säger varför — aldrig ett tal', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    hamtaPerHa.mockResolvedValue({ ...PER_HA, andelUtanfor: 0.01, stickvag: { lage: 'ofullstandigt', andel: 0.04, roller: ['skotare'] } } as PerHa);
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    const rad = h.querySelector('[data-stickvag]')!;
    expect(rad.getAttribute('data-stickvag')).toBe('ofullstandigt');
    expect(rad.textContent).toContain('GPS-spåret täcker bara en del av trakten');
    expect(rad.textContent).not.toContain('%');
    expect(h.textContent).not.toContain('utanför (väg');
  });

  // En gräns 200 × 100 m och gallring utanför den (Sandåsen i litet format) — räknad av den riktiga modulen.
  function ytaMedBitUtanfor() {
    const g = (x: number, y: number) => [15 + x / (Math.cos((56.4 * Math.PI) / 180) * 111320), 56.4 + y / 110540];
    const ringar = [[g(0, 0), g(200, 0), g(200, 100), g(0, 100), g(0, 0)]] as [number, number][][];
    const stammar: StamPos[] = [];
    let id = 1;
    for (let x = 3; x <= 290; x += 6) for (let y = 3; y <= 97; y += 6) {
      if (x > 197 && x < 210) continue;
      const [lng, lat] = g(x, y);
      stammar.push({ id: id++, lat, lng, dbhMm: 120 });
    }
    return beraknaGallradYta({ ringar, stammar })!;
  }

  it('den gallrade ytan: raden säger hur den skiljer sig från Vidas gräns, och kartan öppnas i ett ark', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const yta = ytaMedBitUtanfor();
    hamtaPerHa.mockResolvedValue({ ...PER_HA, arealHa: yta.gallradHa, vidaHa: yta.vidaHa, yta });
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    const rad = h.querySelector('[data-gallrad-yta]') as HTMLElement;
    const t = rad.textContent!.replace(/\u00a0/g, ' ');
    expect(t).toContain('Gallrat');
    expect(t).toContain('Vidas gräns 2,0 ha');
    expect(t).toMatch(/\d,\d ha utanför/);
    expect(h.textContent).toContain('marken som gallrades');
    await act(async () => { (rad.querySelector('button, a') as HTMLElement ?? rad).click(); });
    const ark = document.querySelector('[role="dialog"]')!;
    expect(ark.textContent).toContain('Var gallrades det?');
    expect(ark.textContent).toContain('Gallrat, räknas');
    expect(ark.querySelector('[data-gallrad-karta]')).not.toBeNull();
    const bit = ark.querySelector('[data-bit]')!;
    expect(bit.textContent).toContain('Utanför gränsen');
    expect(bit.textContent).toContain('Gallring vi kört');
    expect(bit.textContent).toContain('appens bedömning');
  });

  it('kartan: flygfoto på från början, avverkade stammar går att tända, och valet sparas på enheten', async () => {
    window.localStorage.clear();
    hamtaGallring.mockResolvedValue(DETALJ);
    const yta = ytaMedBitUtanfor();
    hamtaPerHa.mockResolvedValue({ ...PER_HA, arealHa: yta.gallradHa, vidaHa: yta.vidaHa, yta });
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    const rad = h.querySelector('[data-gallrad-yta]') as HTMLElement;
    await act(async () => { (rad.querySelector('button, a') as HTMLElement ?? rad).click(); });
    const ark = document.querySelector('[role="dialog"]')!;
    const foto = ark.querySelector('[data-lager="flygfoto"]') as HTMLButtonElement;
    const stam = ark.querySelector('[data-lager="stammar"]') as HTMLButtonElement;
    expect(foto.getAttribute('role')).toBe('switch');
    expect(foto.getAttribute('aria-checked')).toBe('true');
    expect(stam.getAttribute('aria-checked')).toBe('false');
    expect(ark.textContent).not.toContain('Avverkad stam');
    expect(ark.querySelector('[data-gallrad-karta]')!.getAttribute('data-stammar')).toBe('nej');
    // jsdom har ingen canvas: inget foto hämtas och inget fel sägs.
    expect(ark.querySelector('[data-flygfoto-fel]')).toBeNull();
    await act(async () => { stam.click(); });
    expect(stam.getAttribute('aria-checked')).toBe('true');
    expect(ark.querySelector('[data-gallrad-karta]')!.getAttribute('data-stammar')).toBe('ja');
    expect(ark.textContent).toContain('Avverkad stam');
    expect(ark.textContent).toContain(`${yta.karta.stammar.length} stammar med position`);
    await act(async () => { foto.click(); });
    expect(foto.getAttribute('aria-checked')).toBe('false');
    expect(JSON.parse(window.localStorage.getItem('gallring_karta_lager_v1')!)).toEqual({ flygfoto: false, stammar: true });
  });

  it('kvar efter gallringen: före − uttaget = kvar, går att räkna med det som står, och spannet syns', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const yta = ytaMedBitUtanfor();
    hamtaPerHa.mockResolvedValue({ ...PER_HA, arealHa: yta.gallradHa, vidaHa: yta.vidaHa, yta, grundytaPerHa: 7.24 });
    // Skannat 2022-10-12, exakt 4 år före skördarens första dag (DETALJ.dagar: 2026-10-12).
    const dag = Math.floor(Date.parse('2022-10-12T00:00:00Z') / 86_400_000);
    hamtaLaserRutor.mockResolvedValue(Array.from({ length: 20 }, () => ({ g: 22, dag })));
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    await act(async () => { await Promise.resolve(); });
    // Provpunkterna ligger i den gallrade ytan.
    const punkter = hamtaLaserRutor.mock.calls[0][0];
    expect(punkter.length).toBeGreaterThan(0);
    expect(punkter.every(([lng, lat]) => yta.innehaller(lng, lat))).toBe(true);

    const kort = h.querySelector('[data-kvar="ok"]') as HTMLElement;
    const t = kort.textContent!.replace(/\u00a0/g, ' ');
    // 22 × 1,03^4 = 24,76 → 24,8; uttag 7,24 → 7,2; kvar = 24,8 − 7,2 = 17,6 — det som står går att räkna.
    // (Det oavrundade 24,76 − 7,24 = 17,52 skulle visas 17,5 och inte gå ihop med raderna ovanför.)
    expect(t).toContain('ca 24,8 m²/ha');
    expect(t).toContain('7,2 m²/ha');
    expect(t).toContain('ca 17,6 m²/ha');
    expect(t).toMatch(/troligen 16–19/);
    expect(t).toContain('Laserskanning 2022');
    expect(h.textContent).toContain('uppräknad 4 år med ca 3 % tillväxt per år (2–4 % ger spannet under Kvar)');
    // Skanningsåret står en gång (i raden), inte också i noten.
    expect(h.textContent!.split('2022').length - 1).toBe(1);
    expect(h.textContent).toContain('Uttaget mätte skördaren');
  });

  it('kvar: läsfel är ett fel med Försök igen, och utan underlag sägs varför — aldrig ett tal', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const yta = ytaMedBitUtanfor();
    hamtaPerHa.mockResolvedValue({ ...PER_HA, arealHa: yta.gallradHa, vidaHa: yta.vidaHa, yta, grundytaPerHa: 7 });
    const dagFore = Math.floor(Date.parse('2021-06-01T00:00:00Z') / 86_400_000);
    hamtaLaserRutor.mockRejectedValueOnce(new Error('Skogsstyrelsen svarade inte i tid.'))
      .mockResolvedValueOnce(Array.from({ length: 10 }, () => ({ g: 20, dag: dagFore })));
    let h = await montera(createElement(Trakt, { vo: '11183108' }));
    await act(async () => { await Promise.resolve(); });
    const fel = h.querySelector('[data-kvar-fel]') as HTMLElement;
    expect(fel.textContent).toContain('Kunde inte hämta laserdatan');
    expect(h.querySelector('[data-kvar-tal]')).toBeNull();
    await act(async () => { (fel.querySelector('button') as HTMLElement).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(h.querySelector('[data-kvar="ok"]')).not.toBeNull();

    const fall: [{ g: number | null; dag: number | null }[], string, string][] = [
      [Array.from({ length: 10 }, () => ({ g: null, dag: null })), 'saknas', 'ingen laserdata'],
      [Array.from({ length: 10 }, () => ({ g: 12, dag: dagFore + 2000 })), 'skannad-efter', 'efter att skördaren började'],
      [Array.from({ length: 10 }, () => ({ g: 3, dag: dagFore })), 'stammer-inte', 'tog ut mer än'],
    ];
    for (const [rutor, lage, text] of fall) {
      if (root) await act(async () => { root!.unmount(); });
      document.body.innerHTML = '';
      hamtaLaserRutor.mockResolvedValue(rutor);
      h = await montera(createElement(Trakt, { vo: '11183108' }));
      await act(async () => { await Promise.resolve(); });
      const el = h.querySelector(`[data-kvar="${lage}"]`) as HTMLElement;
      expect(el, lage).not.toBeNull();
      expect(el.textContent).toContain(text);
      expect(h.querySelector('[data-kvar-tal]')).toBeNull();
    }
  });

  it('kvar visas inte utan stampositioner (ingen gallrad yta) — och laserdatan hämtas inte', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    await act(async () => { await Promise.resolve(); });
    expect(h.querySelector('[data-kvar]')).toBeNull();
    expect(hamtaLaserRutor).not.toHaveBeenCalled();
  });

  it('ett svar sparas och talen läses om; utan tabellen sparas inget och det sägs', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    const yta = ytaMedBitUtanfor();
    hamtaPerHa.mockResolvedValue({ ...PER_HA, arealHa: yta.gallradHa, vidaHa: yta.vidaHa, yta });
    sparaYtaSvar.mockResolvedValue();
    const h = await montera(createElement(Trakt, { vo: '11183108' }));
    const rad = h.querySelector('[data-gallrad-yta]') as HTMLElement;
    await act(async () => { (rad.querySelector('button, a') as HTMLElement ?? rad).click(); });
    await act(async () => { (document.querySelector('[data-bit] button, [data-bit]') as HTMLElement).click(); });
    const vag = document.querySelector('[data-svar="vag"]')!;
    expect(document.querySelector('[role="dialog"]')!.textContent).toContain('Appen bedömde: Gallring vi kört');
    await act(async () => { ((vag.querySelector('button') ?? vag) as HTMLElement).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(sparaYtaSvar).toHaveBeenCalledWith('11183108', yta.utanfor[0].nyckel, 'vag');
    expect(hamtaPerHa).toHaveBeenCalledTimes(2);

    await act(async () => { root!.unmount(); }); root = null; host?.remove(); document.body.innerHTML = '';
    hamtaPerHa.mockResolvedValue({ ...PER_HA, arealHa: yta.gallradHa, vidaHa: yta.vidaHa, yta, svarSparas: false });
    sparaYtaSvar.mockReset();
    const h2 = await montera(createElement(Trakt, { vo: '11183108' }));
    const rad2 = h2.querySelector('[data-gallrad-yta]') as HTMLElement;
    await act(async () => { (rad2.querySelector('button, a') as HTMLElement ?? rad2).click(); });
    await act(async () => { (document.querySelector('[data-bit] button, [data-bit]') as HTMLElement).click(); });
    expect(document.querySelector('[data-svar-sparas-inte]')).not.toBeNull();
    const vag2 = document.querySelector('[data-svar="vag"]')!;
    await act(async () => { ((vag2.querySelector('button') ?? vag2) as HTMLElement).click(); });
    expect(sparaYtaSvar).not.toHaveBeenCalled();
  });

  it('utan traktgräns inget per hektar, och ett läsfel är ett fel med Försök igen', async () => {
    hamtaGallring.mockResolvedValue(DETALJ);
    hamtaPerHa.mockResolvedValue({ lage: 'ingen-grans', svarSparas: true });
    let h = await montera(createElement(Trakt, { vo: '11183108' }));
    expect(h.querySelector('[data-perha-ingen-grans]')).not.toBeNull();
    expect(h.textContent).not.toContain('/ha');
    await act(async () => { root!.unmount(); }); root = null; host?.remove();
    hamtaPerHa.mockRejectedValueOnce(new Error('nät')).mockResolvedValueOnce(PER_HA);
    h = await montera(createElement(Trakt, { vo: '11183108' }));
    const fel = h.querySelector('[data-perha-fel]')!;
    expect(fel.textContent).toContain('Kunde inte räkna per hektar');
    await act(async () => { (fel.querySelector('button') as HTMLButtonElement).click(); });
    await act(async () => { await Promise.resolve(); });
    expect(h.querySelector('[data-perha]')).not.toBeNull();
  });

  it('"hittades inte" och "kunde inte läsa" skrivs olika', async () => {
    hamtaGallring.mockResolvedValue(null);
    let h = await montera(createElement(Trakt, { vo: 'x' }));
    expect(h.textContent).toContain('Ingen gallring med VO x');
    await act(async () => { root!.unmount(); }); root = null; host?.remove();
    hamtaGallring.mockRejectedValue(new Error('nät'));
    h = await montera(createElement(Trakt, { vo: 'x' }));
    expect(h.textContent).toContain('Kunde inte läsa trakten');
    expect(h.querySelector('a[href="/gallring"]')).not.toBeNull();
  });
});
