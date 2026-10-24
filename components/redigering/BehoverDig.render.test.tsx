// @vitest-environment jsdom
// Behöver dig: svaret först, förslaget förvalt, en sak i taget, och att "2 av 3" inte hoppar när en sak försvinner.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import { act, useState } from 'react';
import BehoverDig from './BehoverDig';
import { byggSaker, type BehoverGrupp, type Sak } from '@/lib/redigering/behoverDig';
import type { HarledRad } from '@/lib/redigering/harledning';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const rad = (objekt_id: string, object_name: string, extra: Partial<HarledRad> = {}): HarledRad =>
  ({ objekt_id, object_name, vo_nummer: objekt_id, huvudtyp: null, avtalsform: null, bolag: null, cutting_method: null, ...extra });
const grupp = (r: HarledRad, keys: string[]): BehoverGrupp =>
  ({ nyckel: r.objekt_id, rep: r, ids: [r.objekt_id], varningar: keys.map(key => ({ key, text: key === 'skogsagare' ? 'Saknar markägare' : key })) });

const SKALVIKEN = rad('11271860', 'Skälviken RP J-Hus -25', { huvudtyp: 'Slutavverkning', bolag: 'Vida', cutting_method: 'ClearCutting' });
const VALLUST = rad('P-1024', 'Vällust Löv Ga');
const ULF = rad('11217445', 'Ulfsnäs AU 2026', { huvudtyp: 'Slutavverkning', bolag: 'Vida', avtalsform: 'Au' });

function bygg(rader: HarledRad[], varn: Record<string, string[]>): Sak[] {
  return byggSaker({ grupper: rader.map(r => grupp(r, varn[r.objekt_id] ?? [])), alla: rader, filJobb: [], bolagVal: ['Vida'] });
}

let root: Root | null = null;
let el: HTMLDivElement;
afterEach(() => { act(() => root?.unmount()); root = null; el?.remove(); });

/** Vyn som i Redigering: en sparad sak försvinner ur listan. */
function Vy({ spara }: { spara: (nyckel: string, v: string) => Promise<boolean> }) {
  const [varn, setVarn] = useState<Record<string, string[]>>({ '11271860': ['avtalsform'], 'P-1024': ['huvudtyp'], '11217445': ['skogsagare'] });
  const saker = bygg([SKALVIKEN, VALLUST, ULF], varn);
  return (
    <BehoverDig saker={saker} antalObjekt={133}
      onSparaFalt={async (s, v) => {
        const ok = await spara(s.nyckel, v);
        if (ok) setVarn(p => ({ ...p, [s.grupp.nyckel]: p[s.grupp.nyckel].filter(k => k !== s.falt) }));
        return ok;
      }}
      onKoppla={async () => true} onIgnorera={async () => true} sokObjekt={() => []} onOppnaObjekt={() => {}} />
  );
}

const rendera = (spara = vi.fn(async () => true)) => {
  el = document.createElement('div'); document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(<Vy spara={spara} />));
  return spara;
};
const knapp = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.includes(text)) as HTMLButtonElement;
const klick = async (b: HTMLElement) => { await act(async () => { b.click(); }); };

describe('Behöver dig', () => {
  it('svaret först: frågan, antalet, meningen och EN vit knapp', () => {
    rendera();
    const svar = document.querySelector('[data-svar]')!;
    expect(svar.textContent).toContain('Behöver något dig?');
    expect(svar.textContent).toContain('3 saker');
    expect(svar.textContent).toContain('Resten av 133 objekt är kopplat och ifyllt.');
    expect(knapp('Gå igenom dem')).toBeTruthy();
  });

  it('raderna visar förslaget med frågetecken, förslag först och det man öppnar objektet för sist', () => {
    rendera();
    const rader = [...document.querySelectorAll('[data-sak]')].map(r => r.textContent);
    expect(rader[0]).toContain('Skälviken'); expect(rader[0]).toContain('Rp?');
    expect(rader[1]).toContain('Vällust'); expect(rader[1]).toContain('Gallring?');
    expect(rader[2]).toContain('Ulfsnäs'); expect(rader[2]).toContain('Öppna');
  });

  it('arket tar en sak i taget med förslaget förvalt, och räknaren hoppar inte när den sparade försvinner', async () => {
    const spara = rendera();
    await klick(knapp('Gå igenom dem'));
    expect(document.querySelector('[role=dialog]')!.getAttribute('aria-label')).toBe('1 av 3');
    expect(document.querySelector('[data-svar-ark]')!.textContent).toBe('Rotpost');
    expect(document.querySelector('[role=radio][aria-checked=true]')!.textContent).toContain('Rotpost');

    await klick(knapp('Spara Rotpost och ta nästa'));
    expect(spara).toHaveBeenCalledWith('11271860:avtalsform', 'Rp');
    expect(document.querySelector('[role=dialog]')!.getAttribute('aria-label')).toBe('2 av 3');
    expect(document.querySelector('[data-svar-ark]')!.textContent).toBe('Gallring');

    await klick(knapp('Hoppa över'));
    expect(document.querySelector('[role=dialog]')!.getAttribute('aria-label')).toBe('3 av 3');
    expect(knapp('Öppna objektet')).toBeTruthy();

    await klick(knapp('Hoppa över'));
    expect(document.querySelector('[data-allt-rattat]')!.textContent).toContain('1 sparade · 2 hoppade du över');
  });

  it('ett annat val går att välja, och ett fel stoppar flödet med en rad som säger vad man gör', async () => {
    const spara = rendera(vi.fn(async () => false));
    await klick(document.querySelector('[data-sak="11271860:avtalsform"]') as HTMLElement);
    const au = [...document.querySelectorAll('[role=radio]')].find(r => r.textContent?.includes('Avverkningsuppdrag')) as HTMLElement;
    await klick(au);
    await klick(knapp('Spara Avverkningsuppdrag och ta nästa'));
    expect(spara).toHaveBeenCalledWith('11271860:avtalsform', 'Au');
    expect(document.querySelector('[role=alert]')!.textContent).toContain('Det sparades inte');
    expect(document.querySelector('[role=dialog]')!.getAttribute('aria-label')).toBe('1 av 3');
  });

  it('Special går att välja som svar på avtalsformen och sparas som Special', async () => {
    const spara = rendera();
    await klick(document.querySelector('[data-sak="11271860:avtalsform"]') as HTMLElement);
    const sp = [...document.querySelectorAll('[role=radio]')].find(r => r.textContent?.startsWith('Special')) as HTMLElement;
    expect(sp.textContent).toContain('Vindfälle, storm eller annat som inte går att jämföra');
    await klick(sp);
    await klick(knapp('Spara Special och ta nästa'));
    expect(spara).toHaveBeenCalledWith('11271860:avtalsform', 'Special');
  });

  it('en fil: troligast först, sök annat objekt, eller "Hör inte till något objekt"', async () => {
    const koppla = vi.fn(async () => true);
    const ignorera = vi.fn(async () => true);
    const fil = { typ: 'fil' as const, nyckel: 'fil:R64428:k53', namn: 'Görgen Gustafsson Trolleboda', under: 'H8E -26 · 23 okt · 350 stammar · inget objekt',
      jobb: { nyckel: 'R64428:k53', namn: 'Görgen Gustafsson Trolleboda', vo: 'k53', stammar: 350, maskinNamn: 'H8E -26', datum: '2026-10-23',
        kandidater: [{ objekt_id: 'a', vo_nummer: 'P-1025', object_name: 'Görgen Gustafsson Trolleboda' }] } };
    el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el);
    act(() => root!.render(<BehoverDig saker={[fil]} antalObjekt={10} onSparaFalt={async () => true} onKoppla={koppla} onIgnorera={ignorera}
      sokObjekt={(q) => q ? [{ objekt_id: 'c', vo_nummer: '11166477', object_name: 'Mölleryd RP J-Hus -25' }] : []} onOppnaObjekt={() => {}} />));
    await klick(document.querySelector('[data-sak="fil:R64428:k53"]') as HTMLElement);
    expect(document.querySelector('[role=dialog]')!.textContent).toContain('Vilket objekt hör filen till?');
    await klick(knapp('Koppla till Görgen Gustafsson Trolleboda'));
    expect(koppla).toHaveBeenCalledWith(fil.jobb, fil.jobb.kandidater[0]);
  });

  it('en fil utan förslag: sök fram objektet, eller dölj filen', async () => {
    const ignorera = vi.fn(async () => true);
    const fil = { typ: 'fil' as const, nyckel: 'fil:x', namn: 'Test avsluta', under: 'H8E -23 · inget objekt',
      jobb: { nyckel: 'x', namn: 'Test avsluta', vo: 'k9', stammar: 2, maskinNamn: 'H8E -23', kandidater: [] } };
    el = document.createElement('div'); document.body.appendChild(el);
    root = createRoot(el);
    act(() => root!.render(<BehoverDig saker={[fil]} antalObjekt={10} onSparaFalt={async () => true} onKoppla={async () => true} onIgnorera={ignorera}
      sokObjekt={() => []} onOppnaObjekt={() => {}} />));
    await klick(document.querySelector('[data-sak="fil:x"]') as HTMLElement);
    expect(knapp('Välj ett objekt').disabled).toBe(true);
    await klick(document.querySelector('[data-ignorera]') as HTMLElement);
    expect(ignorera).toHaveBeenCalledWith(fil.jobb);
  });

  it('utan något att göra: en lugn svarsrad, ingen knapp', () => {
    el = document.createElement('div'); document.body.appendChild(el); root = createRoot(el);
    act(() => root!.render(<BehoverDig saker={[]} antalObjekt={133} onSparaFalt={async () => true} onKoppla={async () => true} onIgnorera={async () => true} sokObjekt={() => []} onOppnaObjekt={() => {}} />));
    expect(el.textContent).toContain('Allt kopplat och ifyllt');
    expect(knapp('Gå igenom')).toBeUndefined();
  });
});
