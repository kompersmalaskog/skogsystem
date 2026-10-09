import { describe, expect, it } from 'vitest';
import {
  DETENT_TARSKEL_PX, FLIKAR, arAndrad, arFlikId, dragHojd, flyttaPlats, laggTillPlats, ligger, platsUnderFinger, redigeringTillState,
  startaRedigering, taBortPlats, valjDetent,
} from './plusArk';
import { MAX_FASTA, STANDARD_ORDNING, type PlusPost, type PlusRadState } from './plusRad';

const sym = (id: string): PlusPost => ({ typ: 'symbol', id });
const nycklar = (l: PlusPost[]) => l.map((p) => `${p.typ}:${p.id}`);

describe('flikarna', () => {
  it('är exakt fyra, i den ordning Martin bad om', () => {
    expect(FLIKAR.map((f) => f.etikett)).toEqual(['Symboler', 'Ytor', 'Spårning', 'Lager']);
  });
  it('arFlikId släpper bara igenom riktiga flikar', () => {
    expect(arFlikId('lager')).toBe(true);
    expect(arFlikId('rita')).toBe(false);
    expect(arFlikId(undefined)).toBe(false);
  });
});

describe('valjDetent — arket halv ↔ hel', () => {
  it('halvt ark dras uppåt över tröskeln → helt', () => {
    expect(valjDetent('halv', -DETENT_TARSKEL_PX)).toBe('hel');
    expect(valjDetent('halv', -300)).toBe('hel');
  });
  it('halvt ark dras uppåt under tröskeln → far tillbaka', () => {
    expect(valjDetent('halv', -(DETENT_TARSKEL_PX - 1))).toBe('halv');
  });
  it('halvt ark dras NEDÅT stänger inte, det blir kvar halvt', () => {
    expect(valjDetent('halv', 400)).toBe('halv');
  });
  it('helt ark dras nedåt över tröskeln → halvt, under tröskeln → kvar helt', () => {
    expect(valjDetent('hel', DETENT_TARSKEL_PX)).toBe('halv');
    expect(valjDetent('hel', DETENT_TARSKEL_PX - 1)).toBe('hel');
    expect(valjDetent('hel', -200)).toBe('hel');
  });
});

describe('dragHojd', () => {
  it('följer fingret', () => { expect(dragHojd(400, -100, 800)).toBe(500); expect(dragHojd(400, 100, 800)).toBe(300); });
  it('aldrig över fönstret och aldrig under 30 %', () => { expect(dragHojd(400, -900, 800)).toBe(800); expect(dragHojd(400, 900, 800)).toBe(240); });
});

describe('Redigera — arbetskopian', () => {
  const sex = STANDARD_ORDNING.slice();

  it('startar som dockans platser, högst sex, bara dock-poster, utan dubbletter', () => {
    expect(nycklar(startaRedigering(sex))).toEqual(nycklar(sex));
    expect(startaRedigering([...sex, sym('bridge')])).toHaveLength(MAX_FASTA);
    expect(startaRedigering([sym('wet'), sym('wet'), sym('steep')])).toHaveLength(2);
    // Högstubbe/Evighetsträd bor i pillen — de får aldrig ligga i dockan
    expect(startaRedigering([sym('highstump'), sym('eternitytree'), sym('wet')])).toEqual([sym('wet')]);
    // lager / rita / mät är inga dock-poster
    expect(startaRedigering([{ typ: 'lager', id: 'x' }, { typ: 'rita', id: 'linje' }, { typ: 'matning', id: 'yta' }])).toEqual([]);
  });

  it('rött minus tar bort exakt den platsen och ingen annan', () => {
    const ut = taBortPlats(sex, 'symbol:steep');
    expect(nycklar(ut)).toEqual(nycklar(sex).filter((k) => k !== 'symbol:steep'));
    expect(taBortPlats(sex, 'symbol:finnsinte')).toEqual(sex);
  });

  it('grönt plus lägger sist; full docka byter inte ut något i smyg', () => {
    const fem = sex.slice(0, 5);
    const r = laggTillPlats(fem, sym('bridge'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(nycklar(r.lista)).toEqual([...nycklar(fem), 'symbol:bridge']);
    expect(laggTillPlats(sex, sym('bridge'))).toEqual({ ok: false, skal: 'full' });
  });

  it('plus på en som redan ligger i dockan, eller på en pill-symbol, ger inget', () => {
    expect(laggTillPlats(sex, sym('wet'))).toEqual({ ok: false, skal: 'finns' });
    expect(laggTillPlats([], sym('highstump'))).toEqual({ ok: false, skal: 'ej-symbol' });
    expect(ligger(sex, sym('wet'))).toBe(true);
    expect(ligger(sex, sym('bridge'))).toBe(false);
  });

  it('dra: flytta fram, flytta bak, övriga glider; ogiltigt index rör inget', () => {
    const l = ['a', 'b', 'c', 'd'].map(sym);
    expect(nycklar(flyttaPlats(l, 0, 2))).toEqual(['symbol:b', 'symbol:c', 'symbol:a', 'symbol:d']);
    expect(nycklar(flyttaPlats(l, 3, 0))).toEqual(['symbol:d', 'symbol:a', 'symbol:b', 'symbol:c']);
    expect(flyttaPlats(l, 1, 1)).toBe(l);
    expect(flyttaPlats(l, 9, 0)).toBe(l);
    expect(flyttaPlats(l, -1, 0)).toBe(l);
    // till utanför ändarna → klipps till ändarna
    expect(nycklar(flyttaPlats(l, 0, 99))).toEqual(['symbol:b', 'symbol:c', 'symbol:d', 'symbol:a']);
    // ingen post försvinner eller dubbleras
    expect(nycklar(flyttaPlats(l, 1, 3)).sort()).toEqual(nycklar(l).sort());
  });

  it('platsUnderFinger väljer närmaste mittpunkt — en rad (bred skärm) och två rader (smal)', () => {
    const rad = [50, 150, 250].map((x) => ({ x, y: 100 }));
    expect(platsUnderFinger(10, 100, rad)).toBe(0);
    expect(platsUnderFinger(160, 90, rad)).toBe(1);
    expect(platsUnderFinger(999, 100, rad)).toBe(2);
    expect(platsUnderFinger(5, 5, [])).toBe(-1);
    // 3 kolumner × 2 rader: index 0–2 överst, 3–5 nederst
    const grid = [0, 1, 2, 3, 4, 5].map((i) => ({ x: 50 + (i % 3) * 100, y: 40 + Math.floor(i / 3) * 90 }));
    expect(platsUnderFinger(60, 45, grid)).toBe(0);
    expect(platsUnderFinger(250, 50, grid)).toBe(2);
    expect(platsUnderFinger(60, 140, grid)).toBe(3);
    expect(platsUnderFinger(240, 120, grid)).toBe(5);
    expect(platsUnderFinger(160, 100, grid)).toBe(4);
  });

  it('Klar: arbetskopian blir FASTA platser, användningen rörs inte, ogiltigt kastas', () => {
    const s: PlusRadState = { fasta: [sym('wet')], anv: { 'symbol:landing': 7 } };
    const ny = redigeringTillState(s, [sym('steep'), sym('highstump'), sym('wet'), sym('steep')]);
    expect(nycklar(ny.fasta)).toEqual(['symbol:steep', 'symbol:wet']);
    expect(ny.anv).toBe(s.anv);
  });

  it('arAndrad: samma ordning = oförändrad, annan ordning eller längd = ändrad', () => {
    expect(arAndrad(sex, sex.slice())).toBe(false);
    expect(arAndrad(sex, sex.slice().reverse())).toBe(true);
    expect(arAndrad(sex, sex.slice(0, 5))).toBe(true);
  });
});
