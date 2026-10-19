import { describe, expect, it } from 'vitest';
import { skapaLassKo, skapaMinnesKoLager, vantar } from './ko';
import { lassFranServer, lassTillPayload } from './server';
import type { Lass } from './typer';

const lass = (id: string, nr: number, andrad = '2026-10-19T08:00:00.000Z', objektId = 'o1'): Lass => ({
  id, objektId, voNummer: '555', maskinId: 'M', medarbetareId: null, lassNummer: nr, datum: '2026-10-19', status: 'bekraftat', bekraftadAv: 'forare',
  bekraftadTid: andrad, sparPunkter: [], vagar: [], skapad: `2026-10-19T08:0${nr}:00.000Z`, andrad,
  delar: [{ delNr: 1, avlaggId: 'vida:2', avlaggNummer: '2', lossadTid: andrad, lat: 56.6, lng: 15.8, rader: [{ nyckel: 'tall', namn: 'Tall', m3: 10 }] }],
});

function riggad(natOk: { v: boolean }) {
  const skickade: Lass[] = [];
  const avslut: string[] = [];
  const ko = skapaLassKo({
    lager: skapaMinnesKoLager(),
    skickaLass: async (l) => { if (!natOk.v) return false; skickade.push(l); return true; },
    skickaAvslut: async (o) => { if (!natOk.v) return false; avslut.push(o); return true; },
  });
  return { ko, skickade, avslut };
}

describe('lasskö', () => {
  it('utan täckning: sparat lokalt, inget kastas, väntar', async () => {
    const nat = { v: false };
    const { ko } = riggad(nat);
    await ko.spara(lass('a', 1));
    await expect(ko.kor()).resolves.toMatchObject({ skickade: 0, kvar: 1 });
    expect(await ko.antalVantande()).toBe(1);
    expect((await ko.lassForObjekt('o1')).map((l) => l.id)).toEqual(['a']);
  });
  it('när nätet kommer skickas allt i skapandeordning, en gång', async () => {
    const nat = { v: false };
    const { ko, skickade } = riggad(nat);
    await ko.spara(lass('b', 2));
    await ko.spara(lass('a', 1));
    await ko.kor();
    nat.v = true;
    await ko.kor();
    expect(skickade.map((l) => l.id)).toEqual(['a', 'b']);
    await ko.kor();
    expect(skickade).toHaveLength(2);
    expect(await ko.antalVantande()).toBe(0);
  });
  it('ändring efter skickad skickas igen; ändring under pågående skick blir kvar som oskickad', async () => {
    const nat = { v: true };
    const lager = skapaMinnesKoLager();
    let ko!: ReturnType<typeof skapaLassKo>;
    const skickade: string[] = [];
    ko = skapaLassKo({
      lager,
      skickaLass: async (l) => {
        skickade.push(l.andrad);
        if (skickade.length === 1) await ko.spara({ ...l, andrad: '2026-10-19T09:00:00.000Z' });   // föraren ändrar medan vi skickar
        return nat.v;
      },
      skickaAvslut: async () => true,
    });
    await ko.spara(lass('a', 1));
    await ko.kor();
    expect(await ko.antalVantande()).toBe(1);
    await ko.kor();
    expect(skickade).toEqual(['2026-10-19T08:00:00.000Z', '2026-10-19T09:00:00.000Z']);
    expect(await ko.antalVantande()).toBe(0);
  });
  it('serverns version skriver aldrig över en oskickad lokal ändring, men fyller på nya lass', async () => {
    const nat = { v: false };
    const { ko } = riggad(nat);
    const lokal = lass('a', 1, '2026-10-19T08:00:00.000Z');
    await ko.spara(lokal);
    await ko.tagEmotServer([lass('a', 1, '2026-10-19T10:00:00.000Z'), lass('z', 5, '2026-10-19T07:00:00.000Z')]);
    const alla = await ko.lassForObjekt('o1');
    expect(alla.find((l) => l.id === 'a')?.andrad).toBe('2026-10-19T08:00:00.000Z');
    expect(alla.map((l) => l.id).sort()).toEqual(['a', 'z']);
    expect(await ko.antalVantande()).toBe(1);
  });
  it('serverns nyare version tas emot när lokalt är skickat', async () => {
    const nat = { v: true };
    const { ko } = riggad(nat);
    await ko.spara(lass('a', 1));
    await ko.kor();
    await ko.tagEmotServer([{ ...lass('a', 1, '2026-10-19T10:00:00.000Z'), status: 'struket' }]);
    expect((await ko.lassForObjekt('o1'))[0].status).toBe('struket');
    expect(await ko.antalVantande()).toBe(0);
  });
  it('Färdigskotad väntar tills trakten alla lass nått servern, och skickas sedan en gång', async () => {
    const nat = { v: false };
    const { ko, avslut } = riggad(nat);
    await ko.spara(lass('a', 1));
    await ko.begarAvslut('o1', '2026-10-19T12:00:00.000Z');
    await ko.kor();
    expect(avslut).toEqual([]);
    nat.v = true;
    await ko.kor();
    await ko.kor();
    expect(avslut).toEqual(['o1']);
    expect(await ko.avslutSkickat('o1')).toBe(true);
    expect(await ko.antalVantande()).toBe(0);
  });
  it('ett pågående varv delas av samtidiga anrop', async () => {
    const nat = { v: true };
    const { ko, skickade } = riggad(nat);
    await ko.spara(lass('a', 1));
    await Promise.all([ko.kor(), ko.kor(), ko.kor()]);
    expect(skickade).toHaveLength(1);
  });
  it('vantar(): skickadAndrad skiljer sig från andrad', () => {
    expect(vantar({ id: 'a', objektId: 'o', lass: lass('a', 1), skickadAndrad: null })).toBe(true);
    expect(vantar({ id: 'a', objektId: 'o', lass: lass('a', 1), skickadAndrad: lass('a', 1).andrad })).toBe(false);
  });
});

describe('server-översättning', () => {
  it('payload → serverrad → lass är rundtur', () => {
    const l = lass('a', 1);
    const p = lassTillPayload(l) as any;
    expect(p.lass.objekt_id).toBe('o1');
    expect(p.delar[0].rader[0]).toEqual({ nyckel: 'tall', namn: 'Tall', m3: 10 });
    const rad = {
      id: 'a', objekt_id: 'o1', vo_nummer: '555', maskin_id: 'M', medarbetare_id: null, lass_nummer: 1, datum: '2026-10-19', status: 'bekraftat',
      bekraftad_av: 'forare', bekraftad_tid: l.bekraftadTid, spar: [], vagar: [], skapad: l.skapad, andrad: l.andrad,
      skotar_lass_del: [{ del_nr: 1, avlagg_id: 'vida:2', avlagg_nummer: '2', lossad_tid: l.andrad, lat: 56.6, lng: 15.8, skotar_lass_sortiment: [{ sortiment_nyckel: 'tall', sortiment_namn: 'Tall', m3_forare: '10' }] }],
    };
    expect(lassFranServer(rad)).toEqual(l);
    expect(lassFranServer(null)).toBeNull();
  });
});
