import { describe, expect, it } from 'vitest';
import { AVLAGG, byggAvlagg, traffaAvlagg, nastaEgnaNummer, egnaNummer, visaNummer } from './avlagg';
import {
  LOSSNING, avvisaFraga, lossningManuell, nyDetektor, slutaOppenLossning, stegaDetektor, type DetektorState, type Handelse,
} from './lossning';
import type { Avlagg } from './typer';
import molleryd from './__fixtures__/molleryd_elefanten_2026-10-20.json';
import ljuvadal from './__fixtures__/ljuvadal_wisent_2026-10-20.json';

// 1 m ≈ 0,000009 grader lat
const M = 1 / 111320;
const BAS = { lat: 56.6, lng: 15.8 };
const pos = (nordM: number, ostM = 0) => ({ lat: BAS.lat + nordM * M, lng: BAS.lng + (ostM * M) / Math.cos((BAS.lat * Math.PI) / 180) });
const avl = (nummer: string, nordM: number, ostM = 0): Avlagg => ({ id: `vida:${nummer}`, nummer, kalla: 'vida', ...pos(nordM, ostM) });

/** Kör detektorn över en lista (sek, nordM, ostM) — en fix per sekund mellan punkterna (som en riktig GPS) — och samla händelserna. */
function kor(punkter: Array<[number, number, number?]>, avlagg: Avlagg[], start: DetektorState = nyDetektor(), spar?: number) {
  let st = start;
  const h: Array<Handelse & { vid: number }> = [];
  for (let i = 0; i < punkter.length; i++) {
    const [s, n, o] = punkter[i];
    const till = i + 1 < punkter.length ? punkter[i + 1][0] : s + 1;
    for (let t = s; t < till; t++) {
      const r = stegaDetektor(st, { ...pos(n, o ?? 0), ts: 1_000_000 + t * 1000 }, { avlagg, avstandTillSpar: spar });
      st = r.state;
      if (r.handelse) h.push({ ...r.handelse, vid: t });
    }
  }
  return { st, h };
}
/** Står still (liten brusning) på en plats från `fran` till `till` sekunder. */
const still = (fran: number, till: number, nord: number, ost = 0): Array<[number, number, number]> =>
  Array.from({ length: Math.floor((till - fran) / 2) + 1 }, (_, i) => [fran + i * 2, nord + (i % 2) * 0.5, ost] as [number, number, number]);
/** Kör rakt från A till B på `sek` sekunder. */
const kor_ = (fran: number, sek: number, n0: number, n1: number, ost = 0): Array<[number, number, number]> =>
  Array.from({ length: sek / 2 + 1 }, (_, i) => [fran + i * 2, n0 + ((n1 - n0) * i) / (sek / 2), ost] as [number, number, number]);

const typer = (h: Handelse[]) => h.filter((x) => x.typ === 'lossning').map((x) => (x as { lossning: string }).lossning);

describe('avlägg', () => {
  it('närmaste avlägg inom zonen (50 m), annars inget', () => {
    const a = [avl('2', 0), avl('3', 500)];
    expect(AVLAGG.RADIE_M).toBe(50);
    expect(traffaAvlagg(pos(45), a).narmaste?.nummer).toBe('2');
    expect(traffaAvlagg(pos(60), a).narmaste).toBeNull();
  });
  it('två avlägg inom 50 m från varandra är tvetydiga och listas närmast först', () => {
    const t = traffaAvlagg(pos(5), [avl('2', 0), avl('3', 30)]);
    expect(t.tvetydigt).toBe(true);
    expect(t.kandidater.map((k) => k.nummer)).toEqual(['2', '3']);
  });
  it('avlägg 60 m isär är inte tvetydiga', () => {
    expect(traffaAvlagg(pos(0), [avl('2', 0), avl('3', 60)]).tvetydigt).toBe(false);
  });
  it('Vidas nummer behålls och egna får löpnummer efter det högsta', () => {
    const a = byggAvlagg([{ nummer: 'Avlägg 1', ...BAS }, { nummer: '01-2', ...BAS }], [{ id: '200', ...BAS }, { id: '100', ...BAS }]);
    // '01-2' räknas som 1: egna avlägg får 2 och 3 i skapandeordning (id 100 före 200)
    expect(a.map((x) => x.nummer)).toEqual(['1', '01-2', '3', '2']);
    expect(visaNummer('Avlägg 7')).toBe('7');
  });
  it('sparat nummer på egen markering behålls', () => {
    expect(egnaNummer([], [{ id: '1', ...BAS, nummer: 9 }, { id: '2', ...BAS }]).get('2')).toBe('10');
    expect(nastaEgnaNummer([avl('4', 0)])).toBe('5');
  });
});

describe('lossningsdetektor — stilla 3 min inom zonen', () => {
  const a = [avl('2', 0)];

  it('3 min stilla vid ett avlägg = nytt lass (första lossningen), lossningen börjar när maskinen stannade', () => {
    const { h } = kor(still(0, 200, 5), a);
    const l = h.filter((x) => x.typ === 'lossning');
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ lossning: 'nytt_lass', ts: 1_000_000 });
    expect(l[0].vid).toBeGreaterThanOrEqual(LOSSNING.STILLA_S - 2);
  });
  it('2 min 50 s räcker inte (Daniels fel 1 och 3: 30 s var för kort — passage och plocka rent gav ruta)', () => {
    expect(kor(still(0, 170, 5), a).h).toHaveLength(0);
  });
  it('en lossning utlöser EN händelse, inte en per fix', () => {
    expect(kor(still(0, 600, 5), a).h.filter((x) => x.typ === 'lossning')).toHaveLength(1);
  });
  it('kör förbi avlägget utan att stanna: ingen lossning', () => {
    expect(kor(kor_(0, 100, -150, 150), a).h).toHaveLength(0);
  });
  it('kryper man 25 m eller mer på 3 min är det inte stilla; under 25 m är det stilla (verklig GPS-drift och omplacering längs högen)', () => {
    const krypa = (m: number) => Array.from({ length: 21 }, (_, i) => [i * 10, 5 + (m * i) / 20] as [number, number]);
    expect(kor(krypa(40), a).h.filter((x) => x.typ === 'lossning')).toHaveLength(0);
    expect(kor(krypa(20), a).h.filter((x) => x.typ === 'lossning')).toHaveLength(1);
  });
  it('Daniels fel 2: stopp 45 m från punkten ger lossning (zonen är 50 m, inte 40)', () => {
    expect(kor(still(0, 200, 45), a).h.filter((x) => x.typ === 'lossning')).toHaveLength(1);
    expect(kor(still(0, 200, 55), a).h.filter((x) => x.typ === 'lossning')).toHaveLength(0);
  });
  it('tvetydigt avlägg flaggas i träffen', () => {
    const { h } = kor(still(0, 200, 5), [avl('2', 0), avl('3', 30)]);
    expect((h.find((x) => x.typ === 'lossning') as { traff: { tvetydigt: boolean } }).traff.tvetydigt).toBe(true);
  });
  it('glapp i loggen längre än 90 s nollställer stillastående', () => {
    // fixar bara vid dessa tider (inget hålls mellan dem): varje glapp är > 90 s
    let st = nyDetektor();
    const h: Handelse[] = [];
    for (const t of [0, 100, 200, 300, 400]) {
      const r = stegaDetektor(st, { ...pos(5), ts: 1_000_000 + t * 1000 }, { avlagg: a });
      st = r.state;
      if (r.handelse) h.push(r.handelse);
    }
    expect(h).toHaveLength(0);
  });

  describe('lossningen tar slut', () => {
    it('lämnar maskinen zonen: slut med hur länge den stod still', () => {
      const { h } = kor([...still(0, 400, 5), ...kor_(402, 40, 5, 200)], a);
      const slut = h.find((x) => x.typ === 'lossning_slut') as { stillaS: number; manuell: boolean } | undefined;
      expect(slut).toBeTruthy();
      expect(slut!.stillaS).toBeGreaterThan(350);
      expect(slut!.manuell).toBe(false);
    });
    it('en kort lossning (strax över 3 min) tar också slut', () => {
      const { h } = kor([...still(0, 220, 5), ...kor_(222, 40, 5, 200)], a);
      const slut = h.find((x) => x.typ === 'lossning_slut') as { stillaS: number; manuell: boolean };
      expect(slut.stillaS).toBeGreaterThanOrEqual(LOSSNING.STILLA_S);
    });
    it('kör iväg inom zonen (rör sig i en minut) → slut, så en kort cykel på en liten trakt syns', () => {
      const { h } = kor([...still(0, 400, 5), ...kor_(402, 100, 5, 45)], a);
      expect(h.filter((x) => x.typ === 'lossning_slut')).toHaveLength(1);
    });
    it('en omplacering på 20 s tar inte slut på lossningen', () => {
      const { h } = kor([...still(0, 300, 5), ...kor_(302, 20, 5, 25), ...still(324, 500, 25)], a);
      expect(h.filter((x) => x.typ === 'lossning_slut')).toHaveLength(0);
    });
    it('under lossningen ger ingen ny lossning, hur länge maskinen än står', () => {
      expect(kor(still(0, 2000, 5), a).h.filter((x) => x.typ === 'lossning')).toHaveLength(1);
    });
  });

  describe('cykelregeln — ingen ny lossning tidigare än 10 min efter förra tog slut', () => {
    const cykel = (mellanSek: number, avlagg = a, nord2 = 5) => {
      const forsta = [...still(0, 400, 5), ...kor_(402, 40, 5, 200)];
      const slutTid = 402 + 20;
      const andra = still(slutTid + mellanSek, slutTid + mellanSek + 300, nord2);
      // från (200 m bort) till nord2 på 30 s innan andra stoppet
      return kor([...forsta, ...kor_(slutTid + mellanSek - 30, 30, 200, nord2), ...andra], avlagg);
    };
    it('står maskinen still igen inom 10 min vid samma avlägg = samma lossning / plocka rent (upprepning, inget nytt lass)', () => {
      expect(typer(cykel(300).h)).toEqual(['nytt_lass', 'upprepning']);
    });
    it('efter 10 min är det ett nytt lass', () => {
      expect(typer(cykel(700).h)).toEqual(['nytt_lass', 'nytt_lass']);
    });
    it('inom 10 min vid ett ANNAT avlägg = samma last på två avlägg (del 2)', () => {
      const tva = [avl('2', 0), avl('3', 200)];
      expect(typer(cykel(250, tva, 205).h)).toEqual(['nytt_lass', 'ny_del']);
    });
    it('upprepningen utlöses en gång per stillastående, inte en per fix', () => {
      expect(cykel(300).h.filter((x) => x.typ === 'lossning' && (x as { lossning: string }).lossning === 'upprepning')).toHaveLength(1);
    });
    it('omladdning mitt i en cykel: förra lossningen räknas som nyss avslutad', () => {
      const start = nyDetektor({ ...pos(5), ts: 1_000_000 - 120_000, avlaggId: 'vida:2' });
      expect(typer(kor(still(0, 200, 5), a, start).h)).toEqual(['upprepning']);
    });
  });

  describe('Lossa här', () => {
    it('öppnar en lossning (föraren tryckte) — och ger ingen dubblett när maskinen sedan står 3 min', () => {
      const st = lossningManuell(nyDetektor(), { ...pos(5), ts: 1_000_000 }, 'vida:2');
      const { h } = kor([...still(0, 400, 5), ...kor_(402, 40, 5, 200)], a, st);
      expect(h.filter((x) => x.typ === 'lossning')).toHaveLength(0);
      const slut = h.find((x) => x.typ === 'lossning_slut') as { manuell: boolean; stillaS: number };
      expect(slut.manuell).toBe(true);
    });
    it('provkörningen kan avsluta en öppen lossning', () => {
      const st = lossningManuell(nyDetektor(), { ...pos(5), ts: 1_000_000 }, 'vida:2');
      const r = slutaOppenLossning(st, 1_000_000 + 10_000, 600);
      expect(r.handelse).toMatchObject({ typ: 'lossning_slut', stillaS: 600 });
      expect(r.state.oppen).toBeNull();
      expect(slutaOppenLossning(nyDetektor(), 1, 1).handelse).toBeNull();
    });
  });

  describe('Nytt avlägg här?', () => {
    it('långt stopp (90 s) utanför avlägg, bort från skördarens spår → fråga', () => {
      const { h } = kor(still(0, 100, 300), a, nyDetektor(), 60);
      expect(h).toEqual([expect.objectContaining({ typ: 'nytt_avlagg_fraga' })]);
    });
    it('okänt avstånd till spår → ingen fråga', () => {
      expect(kor(still(0, 100, 300), a, nyDetektor(), undefined).h).toHaveLength(0);
    });
    it('stopp på skördarens spår (lastning på stickvägen) → ingen fråga', () => {
      expect(kor(still(0, 100, 300), a, nyDetektor(), 5).h).toHaveLength(0);
    });
    it('kort stopp (60 s) → ingen fråga', () => {
      expect(kor(still(0, 60, 300), a, nyDetektor(), 60).h).toHaveLength(0);
    });
    it('avvisad fråga ställs inte igen på samma plats', () => {
      const st = avvisaFraga(nyDetektor(), pos(300));
      expect(kor(still(0, 100, 310), a, st, 60).h).toHaveLength(0);
    });
    it('stopp nära förra lossningen (< 150 m) → ingen fråga', () => {
      const { h } = kor([...still(0, 400, 5), ...kor_(402, 60, 5, 100), ...still(464, 600, 100)], a, nyDetektor(), 60);
      expect(h.filter((x) => x.typ === 'nytt_avlagg_fraga')).toHaveLength(0);
    });
  });

  it('LOSSNING-konstanterna är de specade (Martin 2026-10-20)', () => {
    expect(LOSSNING.STILLA_S).toBe(180);
    expect('SJALVBEKRAFTA_STILLA_S' in LOSSNING).toBe(false);   // ingen självbekräftelse
  });
});

// ── Daniels riktiga spår: Elefanten A130743, Mölleryd, 2026-10-20 ─────────────────────────────────────────────────────────────────────────────────────
// Hyttspåret (punkter ≥ 2 m isär) hålls mellan punkterna, en fix per sekund. Appens egna 17 lass den dagen kom av den gamla regeln (30 s, 40 m) och är INTE facit:
// Daniel strök bara lass 1 och fyllde bara i lass 3. Facit är Optis lass för dagen (FPR kommer kvällen 2026-10-20) — jämförelsen görs när filen kommit.
describe('Daniels Mölleryd 2026-10-20 (hyttspår → lossningar)', () => {
  const avlagg = molleryd.avlagg as Avlagg[];
  const punkter = molleryd.spar.split(';').map((r) => { const [t, la, ln] = r.split(','); return { ts: Number(t) * 1000, lat: Number(la), lng: Number(ln) }; });
  const KL = (iso: string) => Date.parse(`2026-10-20T${iso}Z`);

  function replay(fran = '07:40:00') {
    let st = nyDetektor();
    const ut: Array<{ typ: string; lossning?: string; start: number; avlagg?: string; stillaS?: number; vid: number }> = [];
    for (let i = 0; i < punkter.length; i++) {
      const p = punkter[i];
      const till = i + 1 < punkter.length ? punkter[i + 1].ts : p.ts + 1000;
      for (let t = p.ts; t < till; t += 1000) {
        if (t < KL(fran)) continue;
        const r = stegaDetektor(st, { lat: p.lat, lng: p.lng, ts: t }, { avlagg });
        st = r.state;
        const h = r.handelse;
        if (h?.typ === 'lossning') ut.push({ typ: h.typ, lossning: h.lossning, start: h.ts, avlagg: h.traff.narmaste?.nummer, vid: t });
        if (h?.typ === 'lossning_slut') ut.push({ typ: h.typ, start: h.lassTs, stillaS: h.stillaS, vid: t });
      }
    }
    return ut;
  }
  const lass = (ut: ReturnType<typeof replay>) => ut.filter((x) => x.typ === 'lossning' && x.lossning !== 'upprepning');
  const nara = (l: { start: number }, hhmm: string, minuter: number) => Math.abs(l.start - KL(`${hhmm}:00`)) <= minuter * 60_000;

  it('inget lass på de korta stoppen (lass 1: 59 s, lass 4: 44 s, lass 12: 40 s) — passage och plocka rent ger ingen ruta', () => {
    const l = lass(replay());
    expect(l.some((x) => nara(x, '07:47', 2))).toBe(false);
    expect(l.some((x) => nara(x, '08:50', 2) && x.start > KL('08:49:50'))).toBe(false);
    expect(l.some((x) => nara(x, '09:28', 2))).toBe(false);
  });

  it('Daniels äkta lass 3 (stoppet 08:34–08:49, han fyllde själv i det) hittas — 13 min efter förra lossningens slut, därför är cykeln 10 min och inte 15', () => {
    const l = lass(replay());
    expect(l.some((x) => nara(x, '08:31', 4))).toBe(true);
  });

  it('lunchen (45 min stilla vid punkten) ger ingen egen lossning', () => {
    const l = lass(replay());
    // lunchen 09:54–10:39 UTC: inget lass startar mitt i den
    expect(l.filter((x) => x.start > KL('09:56:00') && x.start < KL('10:37:00'))).toHaveLength(0);
  });

  it('ett lass per äkta cykel: 7 lass och en del 2 mot appens 16 (gamla regeln)', () => {
    const l = lass(replay());
    expect(l.filter((x) => x.lossning === 'nytt_lass')).toHaveLength(7);
    expect(l.filter((x) => x.lossning === 'ny_del')).toHaveLength(1);
  });

  it('mot Optis sju lass samma dag: lika många nya lass (7) — Optis tider är registreringstider (tre i en klump 11:46–11:48) och räknas inte som facit på minuten', () => {
    const l = lass(replay()).filter((x) => x.lossning === 'nytt_lass');
    expect((molleryd as any).opti).toHaveLength(7);
    expect(l).toHaveLength((molleryd as any).opti.length);
  });

  it('varje lossning tar slut (då går obesvarade lass till väntelistan)', () => {
    const slut = replay().filter((x) => x.typ === 'lossning_slut');
    expect(slut.length).toBeGreaterThanOrEqual(7);
  });
});

// ── Facit mot Opti, andra dagen: Max (Wisent), Ljuvadal Camping, 2026-10-20 ───────────────────────────────────────────────────────────────────────────
// Privat jobb utan Vida-geometri: inga avlägg fanns förrän Max själv satte markering 1 klockan 13:21. Han lossar på VÄGEN, och landningen är ett ca 100 m långt
// stråk: de fem lossningarna ligger 0,3–1,4 m från den väg han kör på, men 6–58 m från markering 1. Optis tid är när han registrerade (0–4 min efter att han lämnat).
describe('Max Ljuvadal 2026-10-20 (hyttspår → lossningar mot Optis fem lass)', () => {
  const max = ljuvadal as any;
  const pts = max.spar.split(';').map((r: string) => { const [t, la, ln] = r.split(','); return { ts: Number(t) * 1000, lat: Number(la), lng: Number(ln) }; });
  function replay(avlagg: Avlagg[]) {
    let st = nyDetektor();
    const lossningar: Array<{ start: number; slut: number | null; lossning: string }> = [];
    for (let i = 0; i < pts.length; i++) {
      const till = i + 1 < pts.length ? pts[i + 1].ts : pts[i].ts + 1000;
      for (let t = pts[i].ts; t < till; t += 1000) {
        const r = stegaDetektor(st, { lat: pts[i].lat, lng: pts[i].lng, ts: t }, { avlagg });
        st = r.state;
        const h = r.handelse;
        if (h?.typ === 'lossning' && h.lossning !== 'upprepning') lossningar.push({ start: h.ts, slut: null, lossning: h.lossning });
        if (h?.typ === 'lossning_slut' && lossningar.length) lossningar[lossningar.length - 1].slut = t;
      }
    }
    return lossningar;
  }
  const optiTider: number[] = max.opti.map((t: string) => Date.parse(t));

  it('inga avlägg (som för Max före 13:21): inga lossningar — appen vet inte var landningen är', () => {
    expect(replay([])).toEqual([]);
  });
  it('ETT avlägg mitt på landningen: fem lossningar, en per Opti-lass, och Optis tid ligger 0–20 min efter lossningens början/slut', () => {
    const l = replay([{ id: 'x', nummer: '1', kalla: 'egen', ...max.landningsmitt }]);
    expect(l.filter((x) => x.lossning === 'nytt_lass')).toHaveLength(5);
    expect(l.filter((x) => x.lossning === 'ny_del')).toHaveLength(0);
    optiTider.forEach((t, i) => {
      expect(l[i].start, `lass ${i + 1}`).toBeLessThanOrEqual(t);
      expect(t - (l[i].slut ?? t), `lass ${i + 1}`).toBeLessThanOrEqual(20 * 60_000);
    });
  });
  it('bara Maxs egen markering 1 (55–60 m från tre av landningarna) ger två av fem — ett avlägg måste ligga mitt på stråket', () => {
    const l = replay([max.avlaggMarker as Avlagg]);
    expect(l.filter((x) => x.lossning === 'nytt_lass')).toHaveLength(2);
  });
});
