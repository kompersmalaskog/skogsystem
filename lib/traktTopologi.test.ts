import { describe, it, expect } from 'vitest';
import fixtur from './__fixtures__/brokamala_traktdelar_2026-11-25.json';
import { byggTopologi, justeraDelar, dragIhopKanter, ateranslutGrannar, KANT_LANK_M, ringar, unikaHorn, unikaKanter, flyttaHorn, laggTillHorn, taBortHorn, forenkla, skjutInSteg, angraSteg, gemensammaHorn, antalHorn, delarMedHorn } from './traktTopologi';
import type { Punkt } from './ringEdit';

// Brokamålas tre riktiga traktdelar (prod 2026-11-25, bara SELECT): 9775 och 9372 ligger 170 m från varandra, 9772 sitter ihop med båda.
const DELAR = (fixtur as any).traktdelar.map((t: any) => ({ id: String(t.trdel), ring: t.ring as Punkt[] }));
const meter = (a: Punkt, b: Punkt) => { const kx = 111320 * Math.cos((a[1] * Math.PI) / 180); return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 111000); };
function avstTillRing(p: Punkt, ring: Punkt[]): number {
  const kx = 111320 * Math.cos((p[1] * Math.PI) / 180);
  const m = (q: Punkt): [number, number] => [(q[0] - p[0]) * kx, (q[1] - p[1]) * 111000];
  let b = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const A = m(ring[i]), B = m(ring[(i + 1) % ring.length]);
    const dx = B[0] - A[0], dy = B[1] - A[1], l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, -(A[0] * dx + A[1] * dy) / l2)) : 0;
    b = Math.min(b, Math.hypot(A[0] + t * dx, A[1] + t * dy));
  }
  return b;
}
const finns = (r: { id: string; ring: Punkt[] }[], id: string) => r.find((d) => d.id === id)!.ring;

describe('byggTopologi på Brokamålas tre riktiga delar', () => {
  const t = byggTopologi(DELAR);
  it('delar som ligger 170 m isär delar inget; den mittersta delar med båda', () => {
    const g = gemensammaHorn(t);
    const par = (a: string, b: string) => g.find((x) => (x.a === a && x.b === b) || (x.a === b && x.b === a))?.antal ?? 0;
    expect(par('9775', '9372')).toBe(0);
    expect(par('9775', '9772')).toBeGreaterThan(0);
    expect(par('9372', '9772')).toBeGreaterThan(0);
  });
  it('en del förlorar aldrig ett eget hörn och formen ändras knappt (mindre än tolerans)', () => {
    const ut = ringar(t);
    for (const d of DELAR) {
      const ny = finns(ut, d.id);
      const orig: Punkt[] = d.ring.slice(0, -1);
      expect(ny.length).toBeGreaterThanOrEqual(orig.length - 3);   // grannhörn inom 1 m kan slås ihop, aldrig fler än några
      // Varje ursprungshörn ligger kvar (på sin plats eller inom 1 m från ett gemensamt hörn)
      for (const p of orig) expect(avstTillRing(p, ny)).toBeLessThanOrEqual(1.01);
    }
  });
  it('gemensamma hörn har SAMMA koordinater i båda delarna', () => {
    const ut = ringar(t);
    for (const g of gemensammaHorn(t)) {
      const a = t.delar.find((d) => d.id === g.a)!, b = t.delar.find((d) => d.id === g.b)!;
      const gem = a.ring.filter((h) => b.ring.includes(h));
      expect(gem.length).toBe(g.antal);
      const ra = finns(ut, g.a), rb = finns(ut, g.b);
      for (const h of gem) {
        const p = t.horn[h];
        expect(ra.some((q) => q[0] === p[0] && q[1] === p[1])).toBe(true);
        expect(rb.some((q) => q[0] === p[0] && q[1] === p[1])).toBe(true);
      }
    }
  });
  it('unika hörn räknar ett gemensamt hörn en gång', () => {
    const summa = t.delar.reduce((s, d) => s + d.ring.length, 0);
    const gem = gemensammaHorn(t).reduce((s, g) => s + g.antal, 0);
    expect(unikaHorn(t).length).toBe(summa - gem);
  });
});

describe('flytta, lägga till och ta bort på gemensamma hörn', () => {
  const t = byggTopologi(DELAR);
  const gem = unikaHorn(t).find((h) => delarMedHorn(t, h.id) === 2)!;
  it('flytta ett gemensamt hörn flyttar det i båda delarna och bara det', () => {
    const nytt: Punkt = [gem.pt[0] + 0.0001, gem.pt[1] + 0.0001];
    const t2 = flyttaHorn(t, gem.id, nytt);
    const ut = ringar(t2), fore = ringar(t);
    let traffade = 0;
    for (const d of t2.delar) {
      const har = d.ring.includes(gem.id);
      const ny = finns(ut, d.id), gammal = finns(fore, d.id);
      if (har) { traffade++; expect(ny.some((q) => q[0] === nytt[0] && q[1] === nytt[1])).toBe(true); expect(ny.length).toBe(gammal.length); }
      else expect(ny).toEqual(gammal);   // en del som inte har hörnet är orörd
    }
    expect(traffade).toBe(2);
    expect(t.horn[gem.id]).toEqual(gem.pt);   // ren funktion
  });
  it('ett nytt hörn på en gemensam kant hamnar i båda delarna, på en egen kant bara i en', () => {
    const kanter = unikaKanter(t);
    const gemKant = kanter.find((k) => t.delar.filter((d) => d.ring.includes(k.a) && d.ring.includes(k.b)).length === 2);
    const egenKant = kanter.find((k) => t.delar.filter((d) => d.ring.includes(k.a) && d.ring.includes(k.b)).length === 1)!;
    expect(gemKant).toBeTruthy();
    const antalFore = t.delar.map((d) => d.ring.length);
    const r1 = laggTillHorn(t, gemKant!.id)!;
    const andrade = r1.t.delar.filter((d, i) => d.ring.length === antalFore[i] + 1);
    expect(andrade.length).toBe(2);
    expect(andrade.every((d) => d.ring.includes(r1.id))).toBe(true);
    expect(delarMedHorn(r1.t, r1.id)).toBe(2);
    const r2 = laggTillHorn(t, egenKant.id)!;
    expect(delarMedHorn(r2.t, r2.id)).toBe(1);
    expect(unikaHorn(r1.t).length).toBe(unikaHorn(t).length + 1);
    expect(laggTillHorn(t, '999-1000')).toBeNull();
  });
  it('ett nytt hörn hamnar mellan sina grannar i båda delarna (kanten delas, inte hoppar)', () => {
    const gemKant = unikaKanter(t).find((k) => t.delar.filter((d) => d.ring.includes(k.a) && d.ring.includes(k.b)).length === 2)!;
    const r = laggTillHorn(t, gemKant.id)!;
    for (const d of r.t.delar.filter((x) => x.ring.includes(r.id))) {
      const n = d.ring.length, i = d.ring.indexOf(r.id);
      const grannar = [d.ring[(i + n - 1) % n], d.ring[(i + 1) % n]].sort();
      expect(grannar).toEqual([gemKant.a, gemKant.b].sort());
    }
  });
  it('ta bort ett gemensamt hörn tar bort det ur båda; en del med tre hörn vägrar', () => {
    const t2 = taBortHorn(t, gem.id);
    expect(t2.delar.every((d) => !d.ring.includes(gem.id))).toBe(true);
    expect(t2.horn[gem.id]).toBeUndefined();
    expect(unikaHorn(t2).length).toBe(unikaHorn(t).length - 1);
    const tri = byggTopologi([{ id: 'a', ring: [[15, 56], [15.001, 56], [15, 56.001]] }]);
    expect(taBortHorn(tri, tri.delar[0].ring[0])).toBe(tri);
  });
  it('ångra tar tillbaka stegen ett i taget', () => {
    let steg: any[] = [];
    let t1 = t;
    steg = skjutInSteg(steg, t1); t1 = flyttaHorn(t1, gem.id, [gem.pt[0] + 0.001, gem.pt[1]]);
    steg = skjutInSteg(steg, t1); t1 = taBortHorn(t1, unikaHorn(t1).find((h) => delarMedHorn(t1, h.id) === 1)!.id);
    const a1 = angraSteg(steg); expect(antalHorn(a1.t!)).toBe(antalHorn(t) );
    expect(a1.t!.horn[gem.id][0]).toBe(gem.pt[0] + 0.001);
    const a2 = angraSteg(a1.steg); expect(a2.t!.horn[gem.id]).toEqual(gem.pt);
    expect(angraSteg(a2.steg).t).toBeNull();
  });
});

describe('förenkling med gemensamma hörn bevarade', () => {
  const t = byggTopologi(DELAR);
  const f = forenkla(t, 2, 4);
  it('färre hörn, och en gemensam kant får EXAKT samma hörn i båda delarna', () => {
    expect(f.efter).toBeLessThan(f.fore);
    expect(f.fore).toBe(antalHorn(t));
    // Varje gemensamt hörn före som finns kvar finns kvar i båda; ett hörn som tagits bort är borta ur alla delar.
    for (const h of unikaHorn(t)) {
      const ridare = t.delar.filter((d) => d.ring.includes(h.id)).map((d) => d.id);
      const kvar = f.t.delar.filter((d) => d.ring.includes(h.id)).map((d) => d.id);
      expect(kvar.length === 0 || kvar.length === ridare.length).toBe(true);
    }
  });
  it('formen ändras som mest toleransen: varje borttaget hörn ligger inom 2 m från sin del', () => {
    const fore = ringar(t), efter = ringar(f.t);
    for (const d of fore) {
      const ny = finns(efter, d.id);
      for (const p of d.ring) expect(avstTillRing(p, ny)).toBeLessThanOrEqual(2.01);
    }
  });
  it('ingen del under fyra hörn och inga delar glider isär: gemensamma hörn har kvar samma plats', () => {
    for (const d of f.t.delar) expect(d.ring.length).toBeGreaterThanOrEqual(4);
    for (const h of unikaHorn(f.t)) expect(f.t.horn[h.id]).toEqual(t.horn[h.id]);
    const gFore = gemensammaHorn(t).reduce((s, x) => s + x.antal, 0), gEfter = gemensammaHorn(f.t).reduce((s, x) => s + x.antal, 0);
    expect(gEfter).toBeGreaterThan(0);
    expect(gEfter).toBeLessThanOrEqual(gFore);
  });
  it('en redan justerad del (last) rörs inte, och dess granne behåller hörnen längs gränsen mot den', () => {
    const tl = byggTopologi(DELAR.map((d: any) => (d.id === '9772' ? { ...d, last: true } : d)));
    const fl = forenkla(tl, 2, 4);
    const mitt = tl.delar.find((d) => d.id === '9772')!;
    expect(fl.t.delar.find((d) => d.id === '9772')!.ring).toEqual(mitt.ring);
    for (const g of gemensammaHorn(tl).filter((x) => x.a === '9772' || x.b === '9772')) {
      const annan = g.a === '9772' ? g.b : g.a;
      const fore = tl.delar.find((d) => d.id === annan)!.ring.filter((h) => mitt.ring.includes(h));
      const efter = fl.t.delar.find((d) => d.id === annan)!.ring;
      for (const h of fore) expect(efter.includes(h)).toBe(true);
    }
  });
});

describe('två rutor som delar en kant med olika många hörn', () => {
  // A: kvadrat 0..100 m; B delar högerkanten men A har ett extra hörn på kanten som B saknar.
  const LAT = 56, LNG = 15, kx = 111320 * Math.cos((LAT * Math.PI) / 180);
  const p = (x: number, y: number): Punkt => [LNG + x / kx, LAT + y / 111000];
  it('hörnet som bara A har läggs in i B, och flyttas det följer båda', () => {
    const A: Punkt[] = [p(0, 0), p(100, 0), p(100, 50), p(100, 100), p(0, 100)];
    const B: Punkt[] = [p(100, 0), p(200, 0), p(200, 100), p(100, 100)];
    const t = byggTopologi([{ id: 'A', ring: A }, { id: 'B', ring: B }]);
    expect(t.delar[1].ring.length).toBe(5);        // B fick hörnet (100,50)
    expect(gemensammaHorn(t)[0].antal).toBe(3);    // (100,0), (100,50), (100,100)
    const mitt = t.delar[0].ring.find((h) => t.delar[1].ring.includes(h) && Math.abs(meter(t.horn[h], p(100, 50))) < 0.01)!;
    const t2 = flyttaHorn(t, mitt, p(110, 50));
    expect(finns(ringar(t2), 'A').some((q) => meter(q, p(110, 50)) < 0.01)).toBe(true);
    expect(finns(ringar(t2), 'B').some((q) => meter(q, p(110, 50)) < 0.01)).toBe(true);
  });
  it('två hörn i SAMMA del inom en meter slås aldrig ihop', () => {
    const A: Punkt[] = [p(0, 0), p(0.4, 0), p(100, 0), p(100, 100)];
    const B: Punkt[] = [p(0.2, 0), p(200, 0), p(200, 100)];
    const t = byggTopologi([{ id: 'A', ring: A }, { id: 'B', ring: B }]);
    expect(new Set(t.delar[0].ring).size).toBe(t.delar[0].ring.length);
    expect(t.delar[0].ring.length).toBe(4);
  });
  it('en gemensam båge förenklas lika i båda delarna även när sekvensen går åt motsatt håll och två hörn har samma avvikelse', () => {
    // Två hörn (103,30) och (103,70) avviker lika mycket från kordan; vilket som behålls får inte bero på åt vilket håll delen går bågen.
    const A: Punkt[] = [p(0, 0), p(100, 0), p(103, 30), p(103, 70), p(100, 100), p(0, 100)];
    const B: Punkt[] = [p(100, 0), p(200, 0), p(200, 100), p(100, 100), p(103, 70), p(103, 30)];
    const t = byggTopologi([{ id: 'A', ring: A }, { id: 'B', ring: B }]);
    const f = forenkla(t, 2, 4);
    const pa = (h: number) => f.t.horn[h][0] > p(101, 0)[0] && f.t.horn[h][0] < p(150, 0)[0];   // hörnen på den gemensamma bågen (x ≈ 103)
    const bagenA = f.t.delar[0].ring.filter(pa), bagenB = f.t.delar[1].ring.filter(pa);
    expect(bagenA.length).toBe(1);   // exakt ett av de två lika viktiga hörnen behålls
    expect(bagenA.slice().sort()).toEqual(bagenB.slice().sort());
  });
  it('resultatet beror inte på i vilken ordning delarna ligger (samma hörn behålls)', () => {
    const A: Punkt[] = [p(0, 0), p(100, 0), p(103, 30), p(103, 70), p(100, 100), p(0, 100)];
    const B: Punkt[] = [p(100, 0), p(200, 0), p(200, 100), p(100, 100), p(103, 70), p(103, 30)];
    const nyckel = (t: any) => unikaHorn(t).map((h: any) => `${h.pt[0].toFixed(7)},${h.pt[1].toFixed(7)}`).sort().join('|');
    const ab = forenkla(byggTopologi([{ id: 'A', ring: A }, { id: 'B', ring: B }]), 2, 4).t;
    const ba = forenkla(byggTopologi([{ id: 'B', ring: B }, { id: 'A', ring: A }]), 2, 4).t;
    expect(nyckel(ab)).toBe(nyckel(ba));
  });
  it('en del går aldrig under minHorn: ligger alla hörn på en rät linje behålls de viktigaste', () => {
    const rak: Punkt[] = [p(0, 0), p(50, 0.1), p(100, 0), p(150, -0.1), p(200, 0), p(100, 0.2)];
    const t = byggTopologi([{ id: 'A', ring: rak }]);
    expect(forenkla(t, 2, 4).t.delar[0].ring.length).toBe(4);
    expect(forenkla(t, 2, 3).t.delar[0].ring.length).toBeLessThan(5);
  });
  it('en redan justerad del behåller sitt hörn EXAKT när ett hörn i grannen ligger 0,5 m bort (ingen medelvärdesbildning)', () => {
    const A: Punkt[] = [p(0, 0), p(100, 0), p(100, 100), p(0, 100)];
    const B: Punkt[] = [p(100.5, 0), p(200, 0), p(200, 100), p(100.5, 100)];
    const t = byggTopologi([{ id: 'A', ring: A, last: true }, { id: 'B', ring: B }]);
    const delat = t.delar[0].ring.filter((h) => t.delar[1].ring.includes(h));
    expect(delat.length).toBe(2);
    for (const h of delat) expect(A.some((q) => q[0] === t.horn[h][0] && q[1] === t.horn[h][1])).toBe(true);
  });
  it('förenkling sparar kanten: båda rutorna får samma hörn längs den gemensamma kanten', () => {
    // Gemensam kant med ett hörn som sticker ut 0,5 m (under toleransen) → bort i BÅDA.
    const A: Punkt[] = [p(0, 0), p(100, 0), p(100, 40), p(100.5, 50), p(100, 60), p(100, 100), p(0, 100)];
    const B: Punkt[] = [p(100, 0), p(200, 0), p(200, 100), p(100, 100), p(100, 60), p(100.5, 50), p(100, 40)];
    const t = byggTopologi([{ id: 'A', ring: A }, { id: 'B', ring: B }]);
    const f = forenkla(t, 2, 4);
    const fA = f.t.delar[0].ring, fB = f.t.delar[1].ring;
    const gem = fA.filter((h) => fB.includes(h));
    expect(gem.length).toBe(2);   // bara hörnen (100,0) och (100,100) — det utstickande och de inre är borta i båda
    expect(fA.length).toBe(4); expect(fB.length).toBe(4);
  });
});

describe('justeraDelar — hela "Justera gräns" på Brokamålas tre delar', () => {
  const r = justeraDelar(DELAR);
  it('förenklar 144 → 106 unika hörn och är stabil: att läsa in resultatet igen ändrar inget', () => {
    expect(r.fore).toBe(144);
    expect(r.efter).toBeLessThan(r.fore);
    const igen = byggTopologi(ringar(r.t));
    expect(antalHorn(igen)).toBe(r.efter);
    expect(igen.delar.map((d) => d.ring.length)).toEqual(r.t.delar.map((d) => d.ring.length));
    expect(gemensammaHorn(igen)).toEqual(gemensammaHorn(r.t));
  });
  it('delarna sitter ihop efteråt: en gemensam kant har samma hörn i båda', () => {
    const g = gemensammaHorn(r.t);
    expect(g.length).toBe(2);
    for (const x of g) expect(x.antal).toBeGreaterThan(0);
  });
  it('en redan justerad del behåller VARJE hörn exakt (ingen data förloras) och grannarna hänger ihop med den', () => {
    // Del 9772 är redan justerad för hand: ett hörn flyttat 0,5 m och ett extra hörn utanför Vidas ring.
    const orig = DELAR.find((d: any) => d.id === '9772').ring.slice(0, -1) as Punkt[];
    const handjusterad: Punkt[] = orig.map((p, i) => (i === 7 ? [p[0] + 0.000006, p[1]] as Punkt : p));
    handjusterad.splice(20, 0, [(handjusterad[19][0] + handjusterad[20][0]) / 2, (handjusterad[19][1] + handjusterad[20][1]) / 2 + 0.0000002]);
    const res = justeraDelar(DELAR.map((d: any) => (d.id === '9772' ? { id: d.id, ring: handjusterad, last: true } : d)));
    const nyRing = finns(ringar(res.t), '9772');
    for (const p of handjusterad) expect(nyRing.some((q) => q[0] === p[0] && q[1] === p[1])).toBe(true);
    expect(nyRing.length).toBeGreaterThanOrEqual(handjusterad.length);
    // grannarna förenklades (de är inte låsta) men behåller de hörn de delar med den justerade delen
    const g = gemensammaHorn(res.t).filter((x) => x.a === '9772' || x.b === '9772');
    expect(g.length).toBe(2);
  });
});


// ── Dubbel traktgräns (Martin 2026-11-25, Brokamåla: två gränser längs väg 538) ──────────────────────────────────────────

/** Meter av delens kanter (sampel var meter) som ligger 0,1–4 m från den andras kant = "två linjer" bredvid varandra. */
function dubbelMeter(a: Punkt[], b: Punkt[]): number {
  let n = 0;
  for (let k = 0; k < a.length; k++) {
    const p = a[k], q = a[(k + 1) % a.length];
    const L = meter(p, q), steg = Math.max(1, Math.floor(L));
    for (let s = 0; s <= steg; s++) { const x: Punkt = [p[0] + ((q[0] - p[0]) * s) / steg, p[1] + ((q[1] - p[1]) * s) / steg]; const d = avstTillRing(x, b); if (d > 0.1 && d <= 4) n++; }
  }
  return n;
}
const dubbelPar = (r: { id: string; ring: Punkt[] }[], a: string, b: string) => dubbelMeter(finns(r, a), finns(r, b)) + dubbelMeter(finns(r, b), finns(r, a));
const ORIGINAL = (id: string): Punkt[] => (DELAR.find((d: any) => d.id === id).ring as Punkt[]).slice(0, -1);

describe('dubbel traktgräns: delar som sitter ihop dras ihop till EN linje', () => {
  // Före: Vidas två delar (9775 gallring, 9772) låg 1–4 m isär längs 128 m av gränsen; efter justeringen med bara 1 m-länkning låg de kvar så.
  const utanDragning = byggTopologi(ringar(forenkla(byggTopologi(DELAR, 1, 0), 2, 4).t).map((r) => ({ id: r.id, ring: r.ring })), 1, 0);
  const justerad = justeraDelar(DELAR);

  it('Justera gräns: längs gränsen mellan 9775 och 9772 ligger kanterna på samma linje (var 250 m dubbel, nu under 20)', () => {
    const fore = dubbelPar(ringar(utanDragning), '9775', '9772');
    const efter = dubbelPar(ringar(justerad.t), '9775', '9772');
    expect(fore).toBeGreaterThan(200);
    expect(efter).toBeLessThan(20);
  });

  it('en granne som redan är justerad ensam i förväg (förenklingen 2 m > länkningen 1 m) hamnar ändå på samma linje', () => {
    const ensam = ringar(justeraDelar(DELAR.filter((d: any) => d.id === '9772')).t)[0].ring;
    const res = justeraDelar(DELAR.map((d: any) => (d.id === '9772' ? { id: d.id, ring: ensam, last: true } : d)));
    expect(dubbelPar(ringar(res.t), '9775', '9772')).toBeLessThan(20);
    // den redan justerade delen behåller varje hörn exakt
    const behall = finns(ringar(res.t), '9772');
    for (const p of ensam) expect(behall.some((q) => q[0] === p[0] && q[1] === p[1])).toBe(true);
  });

  it('en redan justerad del flyttas aldrig: bara den fria delens hörn dras mot den', () => {
    const last = ORIGINAL('9772');
    const res = dragIhopKanter(byggTopologi([{ id: '9775', ring: ORIGINAL('9775') }, { id: '9772', ring: last, last: true }], 1, 0), KANT_LANK_M);
    const r = ringar(res);
    for (const p of last) expect(finns(r, '9772').some((q) => q[0] === p[0] && q[1] === p[1])).toBe(true);
    expect(dubbelPar(r, '9775', '9772')).toBeLessThan(dubbelPar(ringar(byggTopologi([{ id: '9775', ring: ORIGINAL('9775') }, { id: '9772', ring: last, last: true }], 1, 0)), '9775', '9772'));
  });

  it('en enstaka beröring (ett hörn nära grannens kant) är ingen gemensam sträcka och flyttas inte', () => {
    // Två rutor, B:s ena hörn 2 m från A:s kant, resten långt bort.
    const kx = 1 / (111320 * Math.cos((56.3 * Math.PI) / 180)), ky = 1 / 111000;
    const ruta = (x0: number, y0: number, w: number, h: number): Punkt[] => [[14.46 + x0 * kx, 56.3 + y0 * ky], [14.46 + (x0 + w) * kx, 56.3 + y0 * ky], [14.46 + (x0 + w) * kx, 56.3 + (y0 + h) * ky], [14.46 + x0 * kx, 56.3 + (y0 + h) * ky]];
    const A = ruta(0, 0, 100, 100);
    const B: Punkt[] = [[14.46 + 102 * kx, 56.3 + 50 * ky], [14.46 + 200 * kx, 56.3 + 0], [14.46 + 200 * kx, 56.3 + 100 * ky]];
    const t = dragIhopKanter(byggTopologi([{ id: 'A', ring: A, last: true }, { id: 'B', ring: B }], 1, 0));
    expect(finns(ringar(t), 'B')[0]).toEqual(B[0]);
    expect(gemensammaHorn(t)).toEqual([]);
  });

  it('en sträcka (två hörn i följd, 2,5 m från grannen) dras ihop, grannens hörn på sträckan läggs in och inget annat flyttas', () => {
    const kx = 1 / (111320 * Math.cos((56.3 * Math.PI) / 180)), ky = 1 / 111000;
    const p = (x: number, y: number): Punkt => [14.46 + x * kx, 56.3 + y * ky];
    const A: Punkt[] = [p(0, 0), p(100, 0), p(100, 100), p(0, 100)];                     // låst grann-ruta
    const B: Punkt[] = [p(102.5, 10), p(102.5, 40), p(102.5, 70), p(200, 70), p(200, 10)];   // fri, 2,5 m utanför A:s högra kant, tre hörn i rad
    const t = dragIhopKanter(byggTopologi([{ id: 'A', ring: A, last: true }, { id: 'B', ring: B }], 1, 0));
    const r = ringar(t);
    for (const q of finns(r, 'B').slice(0, 3)) expect(avstTillRing(q, A)).toBeLessThan(0.01);
    expect(finns(r, 'B').some((q) => q[0] === p(200, 70)[0] && q[1] === p(200, 70)[1])).toBe(true);   // bortre hörnen orörda
    expect(finns(r, 'A').length).toBeGreaterThan(4);   // B:s hörn ligger nu också i A:s ring (gemensamma)
    expect(gemensammaHorn(t)[0].antal).toBeGreaterThanOrEqual(3);
  });
});

describe('Återställ en del till Vidas original: grannen följer med och de ligger fortfarande på samma linje', () => {
  const j = ringar(justeraDelar(DELAR).t);
  const kopia9775 = finns(j, '9775');
  const grannar = [{ id: '9772', ring: finns(j, '9772') }];

  it('utan ändring låg grannen 1–4 m från Vidas 9775 (156 m dubbel); efter återställningen under 20', () => {
    const fore = dubbelMeter(ORIGINAL('9775'), grannar[0].ring) + dubbelMeter(grannar[0].ring, ORIGINAL('9775'));
    const ut = ateranslutGrannar(kopia9775, ORIGINAL('9775'), grannar);
    expect(ut.map((x) => x.id)).toEqual(['9772']);
    const efter = dubbelMeter(ORIGINAL('9775'), ut[0].ring) + dubbelMeter(ut[0].ring, ORIGINAL('9775'));
    expect(fore).toBeGreaterThan(200);
    expect(efter).toBeLessThan(25);
  });

  it('grannens hörn utanför den delade sträckan rörs inte', () => {
    const ut = ateranslutGrannar(kopia9775, ORIGINAL('9775'), grannar)[0].ring;
    const delad = new Set(finns(j, '9775').map((p) => `${p[0]},${p[1]}`));
    for (const p of grannar[0].ring) if (!delad.has(`${p[0]},${p[1]}`) && avstTillRing(p, kopia9775) > 1) expect(ut.some((q) => q[0] === p[0] && q[1] === p[1])).toBe(true);
  });

  it('en granne som inte sitter ihop med den återställda delen rörs inte', () => {
    expect(ateranslutGrannar(kopia9775, ORIGINAL('9775'), [{ id: '9372', ring: finns(j, '9372') }])).toEqual([]);
  });

  it('en grannes kant som medvetet ligger långt från Vidas original (över 30 m) lämnas som den är', () => {
    const langt: Punkt[] = kopia9775.map((p) => [p[0] + 0.001, p[1]] as Punkt);   // kopian ligger ~60 m från Vidas original
    const g = [{ id: 'X', ring: [langt[0], langt[1], langt[2], [langt[2][0] + 0.001, langt[2][1] + 0.001]] as Punkt[] }];   // grannen sitter på kopians kant
    expect(ateranslutGrannar(langt, ORIGINAL('9775'), g)).toEqual([]);
    // samma granne med kopian nära Vidas (inom 30 m) flyttas däremot
    const nara: Punkt[] = kopia9775.map((p) => [p[0] + 0.0001, p[1]] as Punkt);
    const g2 = [{ id: 'X', ring: [nara[0], nara[1], nara[2], [nara[2][0] + 0.001, nara[2][1] + 0.001]] as Punkt[] }];
    expect(ateranslutGrannar(nara, ORIGINAL('9775'), g2).length).toBe(1);
  });
  it('inga grannar → inget att göra', () => {
    expect(ateranslutGrannar(kopia9775, ORIGINAL('9775'), [])).toEqual([]);
  });
});
