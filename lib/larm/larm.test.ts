import { describe, expect, it } from 'vitest';
import { GRUPPER, SYMBOL_GRUPP, type FargGrupp } from './grupper';
import { HYSTERES_NARA_M, MYCKET_NARA_M, NARA_M, TOMT_LARM, arKvitterad, harRing, harSettRad, innehallHash, larmar, markeraSett, stegaLarm, type KvittensKarta, type LarmObjekt, type LarmState } from './larm';

const A = 'forare-A';
const B = 'forare-B';
const INGEN: KvittensKarta = new Map();

const sym = (grupp: FargGrupp, avstandM: number, extra: Partial<LarmObjekt> = {}): LarmObjekt => ({
  id: `s-${grupp}`, kalla: 'symbol', grupp, namn: GRUPPER[grupp].namn, hash: 'h1', avstandM, ...extra,
});
const yta = (grupp: FargGrupp, inne: boolean, forbjuden: boolean, extra: Partial<LarmObjekt> = {}): LarmObjekt => ({
  id: `y-${grupp}-${forbjuden}`, kalla: 'yta', grupp, namn: 'Yta', hash: 'hy', avstandM: null, inne, forbjuden, ...extra,
});
const kv = (o: LarmObjekt, forareId = A, hash = o.hash): KvittensKarta => new Map([[o.id, { hash, forareId }]]);
const steg = (objekt: LarmObjekt[], kvitt: KvittensKarta = INGEN, forareId: string | null = A, state: LarmState = TOMT_LARM) => stegaLarm({ objekt, kvitt, forareId, state });

describe('grupp × kvitterad / okvitterad × annan förare (nära: 30 m)', () => {
  const GRUPPERNA: [FargGrupp, boolean][] = [
    ['fara', true], ['natur', true], ['kultur', true], ['blott', true], ['att_gora', false], ['info', false],
  ];
  for (const [grupp, larmasOkvitterad] of GRUPPERNA) {
    describe(GRUPPER[grupp].namn, () => {
      it('okvitterad: ' + (larmasOkvitterad ? 'kort + ljud' : 'inget kort, inget ljud'), () => {
        const u = steg([sym(grupp, 30)]);
        expect(u.kort !== null).toBe(larmasOkvitterad);
        expect(u.ljud !== null).toBe(larmasOkvitterad);
      });
      const tystKvitterad = grupp === 'natur' || grupp === 'kultur' || grupp === 'blott';
      it('kvitterad av samma förare: ' + (tystKvitterad ? 'inget kort, inget ljud' : grupp === 'fara' ? 'larmar ändå (en gammal kvittens har ingen verkan på en Röd)' : 'som förut (larmar aldrig)'), () => {
        const o = sym(grupp, 30);
        const u = steg([o], kv(o));
        if (tystKvitterad) { expect(u.kort).toBeNull(); expect(u.ljud).toBeNull(); expect(u.settRad).toBeNull(); }
        else if (grupp === 'fara') { expect(u.kort).not.toBeNull(); expect(u.ljud).toBe('nara'); }
        else { expect(u.kort).toBeNull(); expect(u.ljud).toBeNull(); }
      });
      it('kvitterad av en ANNAN förare: fullt larm för mig', () => {
        const o = sym(grupp, 30);
        const u = steg([o], kv(o, B));
        expect(u.kort !== null).toBe(larmasOkvitterad);
        expect(u.ljud !== null).toBe(larmasOkvitterad);
        expect(arKvitterad(o, kv(o, B), A)).toBe(false);
      });
      it('kvitterad med ett annat innehåll (ändrad kommentar) larmar igen', () => {
        const o = sym(grupp, 30);
        const u = steg([o], kv(o, A, 'annan-hash'));
        expect(u.kort !== null).toBe(larmasOkvitterad);
      });
      it('ring när man är nära: ' + (larmasOkvitterad ? 'ja, i gruppens färg, även kvitterad' : 'aldrig'), () => {
        const o = sym(grupp, 30);
        for (const kvitt of [INGEN, kv(o)]) {
          const u = steg([o], kvitt);
          expect(u.ringar.length).toBe(larmasOkvitterad ? 1 : 0);
          if (larmasOkvitterad) expect(u.ringar[0].farg).toBe(GRUPPER[grupp].farg);
        }
      });
    });
  }

  it('ingen förare (inte inloggad): ingen kvittens gäller, fullt larm', () => {
    const o = sym('natur', 30);
    expect(steg([o], kv(o), null).kort).not.toBeNull();
  });
});

describe('Manuell fällning larmar inte', () => {
  it('Manuell fällning (Lila) ger varken kort, ljud, ring eller Sett-rad — inte ens på 2 m', () => {
    const grupp = SYMBOL_GRUPP.manualfelling;
    const u = steg([sym(grupp, 2, { typ: 'manualfelling' })]);
    expect(u.kort).toBeNull(); expect(u.ljud).toBeNull(); expect(u.ringar).toEqual([]); expect(u.settRad).toBeNull(); expect(u.vibration).toBeNull();
  });
});

describe('avstånd, ljud och pulsering', () => {
  it('utanför 40 m: ingenting', () => {
    const u = steg([sym('fara', NARA_M + 1)]);
    expect(u.kort).toBeNull(); expect(u.ljud).toBeNull(); expect(u.ringar).toEqual([]);
  });
  it('inom 40 m: kort med namn och meter, ETT ljud, ring', () => {
    const u = steg([sym('fara', 38.4)]);
    expect(u.kort).toMatchObject({ namn: 'Fara', avstandM: 38, pulserar: false, grupp: 'fara', farg: GRUPPER.fara.farg });
    expect(u.ljud).toBe('nara');
    expect(u.ringar).toHaveLength(1);
  });
  it('inom 15 m, Röd: kortet pulserar och ett andra, tydligare ljud', () => {
    const u1 = steg([sym('fara', 30)]);
    const u2 = steg([sym('fara', MYCKET_NARA_M - 1)], INGEN, A, u1.state);
    expect(u2.kort?.pulserar).toBe(true);
    expect(u2.ljud).toBe('mycket_nara');
  });
  it('inom 15 m för Grön: ingen pulsering och inget andra ljud', () => {
    const u1 = steg([sym('natur', 30)]);
    const u2 = steg([sym('natur', 10)], INGEN, A, u1.state);
    expect(u2.kort?.pulserar).toBe(false);
    expect(u2.ljud).toBeNull();
  });
  it('inget upprepat pipande: samma närmande ger ljudet en gång', () => {
    let s = TOMT_LARM; const ljud: (string | null)[] = [];
    for (const d of [39, 35, 30, 25, 20, 16]) { const u = steg([sym('fara', d)], INGEN, A, s); s = u.state; ljud.push(u.ljud); }
    expect(ljud).toEqual(['nara', null, null, null, null, null]);
  });
  it('andra ljudet kommer bara en gång', () => {
    let s = TOMT_LARM; const ljud: (string | null)[] = [];
    for (const d of [30, 14, 10, 8, 12, 14]) { const u = steg([sym('fara', d)], INGEN, A, s); s = u.state; ljud.push(u.ljud); }
    expect(ljud).toEqual(['nara', 'mycket_nara', null, null, null, null]);
  });
  it('rakt in från utsidan till under 15 m ger det tydliga ljudet (ETT ljud, inte två)', () => {
    expect(steg([sym('fara', 10)]).ljud).toBe('mycket_nara');
  });
  it('lämnar man radien (+ marginal) och kommer tillbaka larmar det igen — "larmet kommer ändå nästa gång"', () => {
    let s = TOMT_LARM;
    s = steg([sym('fara', 30)], INGEN, A, s).state;
    s = steg([sym('fara', NARA_M + HYSTERES_NARA_M + 1)], INGEN, A, s).state;     // passerat
    const igen = steg([sym('fara', 30)], INGEN, A, s);
    expect(igen.ljud).toBe('nara');
  });
  it('GPS-brus vid kanten: studsar man mellan 41 och 39 m kommer inget nytt ljud', () => {
    let s = TOMT_LARM; const ljud: (string | null)[] = [];
    for (const d of [39, 41, 39, 42, 38]) { const u = steg([sym('fara', d)], INGEN, A, s); s = u.state; ljud.push(u.ljud); }
    expect(ljud).toEqual(['nara', null, null, null, null]);
  });
  it('meter räknas ner live: avståndet följer varje steg', () => {
    let s = TOMT_LARM; const m: (number | null | undefined)[] = [];
    for (const d of [36, 28, 20]) { const u = steg([sym('natur', d)], INGEN, A, s); s = u.state; m.push(u.kort?.avstandM); }
    expect(m).toEqual([36, 28, 20]);
  });
  it('kortet försvinner av sig självt när man passerat', () => {
    const u1 = steg([sym('natur', 20)]);
    const u2 = steg([sym('natur', 80)], INGEN, A, u1.state);
    expect(u1.kort).not.toBeNull(); expect(u2.kort).toBeNull();
  });
  it('vibration för telefon: ett mönster vid nytt larm, inget vid tysta objekt', () => {
    expect(steg([sym('natur', 20)]).vibration).not.toBeNull();
    const o = sym('natur', 20);
    expect(steg([o], kv(o)).vibration).toBeNull();
  });
});

describe('ytor man inte får köra in i larmar ALLTID vid inkörning', () => {
  for (const [namn, grupp] of [['Hänsyn', 'natur'], ['Nyckelbiotop', 'natur'], ['Fornlämning', 'kultur'], ['Ej framkomlig', 'fara']] as [string, FargGrupp][]) {
    it(`${namn}: okvitterad och kvitterad, samma förare, ger kortet "Du är inne i ytan, kör inte här" och ljud`, () => {
      const o = yta(grupp, true, true, { namn });
      for (const kvitt of [INGEN, kv(o), kv(o, B)]) {
        const u = steg([o], kvitt);
        expect(u.kort).toMatchObject({ namn, text: 'Du är inne i ytan, kör inte här', forbjuden: true, avstandM: null });
        expect(u.ljud).toBe('nara');
      }
    });
  }
  it('utanför ytan: inget', () => {
    const u = steg([yta('kultur', false, true)]);
    expect(u.kort).toBeNull(); expect(u.ljud).toBeNull();
  });
  it('ljudet kommer en gång per inkörning, och på nytt efter att man lämnat och kört in igen', () => {
    let s = TOMT_LARM;
    const a = steg([yta('natur', true, true)], INGEN, A, s); s = a.state;
    const b = steg([yta('natur', true, true)], INGEN, A, s); s = b.state;
    const c = steg([yta('natur', false, true)], INGEN, A, s); s = c.state;
    const d = steg([yta('natur', true, true)], INGEN, A, s);
    expect([a.ljud, b.ljud, c.ljud, d.ljud]).toEqual(['nara', null, null, 'nara']);
  });
  it('Blött och Brant följer sin färggrupp: Blött tystas av kvittens, Brant (Röd) gör det inte', () => {
    const blott = yta('blott', true, false, { id: 'y-blott' });
    const brant = yta('fara', true, false, { id: 'y-brant' });
    expect(steg([blott], kv(blott)).kort).toBeNull();
    expect(steg([blott]).kort).toMatchObject({ text: 'Du är inne i ytan' });
    expect(steg([brant], kv(brant)).kort).not.toBeNull();
  });
  it('Kulturmiljö (Brun, inte förbjuden) följer grupp: tills kvitterat', () => {
    const o = yta('kultur', true, false);
    expect(steg([o]).kort).not.toBeNull();
    expect(steg([o], kv(o)).kort).toBeNull();
  });
  it('yta ger ingen symbolring (ringen hör till symboler och linjer)', () => {
    expect(steg([yta('natur', true, true)]).ringar).toEqual([]);
  });
});

describe('linjer (Stenmur, Kraftledning) larmar på avstånd till närmaste punkt', () => {
  const linje = (grupp: FargGrupp, d: number): LarmObjekt => ({ id: `l-${grupp}`, kalla: 'linje', grupp, namn: grupp === 'fara' ? 'Kraftledning' : 'Stenmur', hash: 'hl', avstandM: d });
  it('Stenmur (Grön) på 35 m: kort, ljud, ring; kvitterad: tyst men ring', () => {
    const o = linje('natur', 35);
    const u = steg([o]);
    expect(u.kort).toMatchObject({ namn: 'Stenmur', avstandM: 35 }); expect(u.ljud).toBe('nara');
    const k = steg([o], kv(o));
    expect(k.kort).toBeNull(); expect(k.ringar).toHaveLength(1);
  });
  it('Kraftledning (Röd) inom 15 m pulserar och ger det tydliga ljudet, och kvittens tystar inte', () => {
    const o = linje('fara', 12);
    const u = steg([o], kv(o));
    expect(u.kort).toMatchObject({ namn: 'Kraftledning', pulserar: true });
    expect(u.ljud).toBe('mycket_nara');
  });
  it('en linje utan punkter inom räckhåll (oändligt avstånd) larmar inte', () => {
    expect(steg([linje('fara', Infinity)]).kort).toBeNull();
  });
});

describe('vem får kortet, och "Sett"-raden', () => {
  it('ett kort i taget: Röd före förbjuden yta före övrigt, annars närmast', () => {
    const natur = sym('natur', 5, { id: 'n' });
    const fara = sym('fara', 30, { id: 'f' });
    const zon = yta('natur', true, true, { id: 'z' });
    expect(steg([natur, fara, zon]).kort?.id).toBe('f');
    expect(steg([natur, zon]).kort?.id).toBe('z');
    expect(steg([natur, fara]).kort?.id).toBe('f');
    expect(steg([sym('natur', 30, { id: 'a' }), sym('kultur', 10, { id: 'b' })]).kort?.id).toBe('b');
  });
  it('ETT ljud även när flera kommer in samtidigt, och det tydligaste vinner', () => {
    expect(steg([sym('natur', 30, { id: 'n' }), sym('fara', 10, { id: 'f' })]).ljud).toBe('mycket_nara');
    expect(steg([sym('natur', 30, { id: 'n' }), sym('kultur', 20, { id: 'k' })]).ljud).toBe('nara');
  });
  it('Sett-raden visas för Grön, Brun, Blå — aldrig för Röd, Lila och Mörk (Martin 2026-10-22: ingen Sett på fara)', () => {
    for (const g of ['natur', 'kultur', 'blott'] as FargGrupp[]) expect(steg([sym(g, 20)]).settRad, g).toMatchObject({ id: `s-${g}` });
    for (const g of ['fara', 'att_gora', 'info'] as FargGrupp[]) expect(steg([sym(g, 20)]).settRad, g).toBeNull();
  });
  it('ingen Sett på en Röd av NÅGOT slag: symbol, linje, yta (Brant) och förbjuden yta (Ej framkomlig)', () => {
    const symbol = sym('fara', 20);
    const linje: LarmObjekt = { id: 'l-fara', kalla: 'linje', grupp: 'fara', namn: 'El-ledning', hash: 'hl', avstandM: 20 };
    const brant = yta('fara', true, false, { id: 'y-brant', namn: 'Brant' });
    const ejFramkomlig = yta('fara', true, true, { id: 'y-ej', namn: 'Ej framkomlig' });
    for (const o of [symbol, linje, brant, ejFramkomlig]) {
      const u = steg([o]);
      expect(u.kort, o.namn).not.toBeNull();
      expect(u.settRad, o.namn).toBeNull();
      expect(harSettRad(o), o.namn).toBe(false);
    }
  });
  it('för Röd: ingen Sett-rad, kortet står kvar och försvinner först när man passerat; ett forcerat sett ändrar ingenting', () => {
    const o = sym('fara', 30);
    let u = steg([o]);
    expect(u.settRad).toBeNull(); expect(u.kort).not.toBeNull();
    // även om något ändå markerade den som sedd (hook/minne) tystnar och sjunker den aldrig
    u = steg([o], INGEN, A, markeraSett(u.state, o.id));
    expect(u.settRad).toBeNull(); expect(u.kort).not.toBeNull(); expect(u.kort?.okvitterad).toBe(true);
    expect(u.state.sett[o.id]).toBeUndefined();
    // passerat: kortet försvinner, och kommer igen med ljud nästa gång
    const ute = steg([sym('fara', 100)], INGEN, A, u.state);
    expect(ute.kort).toBeNull();
    const igen = steg([o], INGEN, A, ute.state);
    expect(igen.kort).not.toBeNull(); expect(igen.ljud).toBe('nara'); expect(igen.settRad).toBeNull();
  });
  it('en gammal kvittens på en Röd (sparad före 2026-10-22) rörs inte men har ingen verkan: kortet står kvar, ingen Sett-rad', () => {
    const o = sym('fara', 30);
    expect(steg([o], kv(o)).settRad).toBeNull();
  });
  it('förbjuden yta får Sett-rad (bevis) men tystas aldrig', () => {
    const o = yta('kultur', true, true);
    expect(steg([o]).settRad).not.toBeNull();
    expect(steg([o], kv(o)).kort).not.toBeNull();
  });
});

describe('undantag och hjälpare', () => {
  it('förarens egna prickar och symboler han själv satt larmar aldrig', () => {
    const u = steg([sym('natur', 5, { undantagen: true })]);
    expect(u.kort).toBeNull(); expect(u.ljud).toBeNull(); expect(u.ringar).toEqual([]);
  });
  it('larmar / harRing', () => {
    expect(larmar(sym('fara', 1), true)).toBe(true);
    expect(larmar(sym('natur', 1), true)).toBe(false);
    expect(larmar(sym('info', 1), false)).toBe(false);
    expect(harRing(sym('info', 1))).toBe(false);
    expect(harRing(sym('kultur', 1))).toBe(true);
  });
  it('hashen följer typ och kommentar', () => {
    expect(innehallHash({ type: 'wet', comment: 'a' })).toBe(innehallHash({ type: 'wet', comment: 'a' }));
    expect(innehallHash({ type: 'wet', comment: 'a' })).not.toBe(innehallHash({ type: 'wet', comment: 'b' }));
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// FLERA LARM SAMTIDIGT: ETT stort kort, en liten rad under, pulsen på rätt objekt
// ---------------------------------------------------------------------------------------------------------------------------------
describe('flera larm samtidigt', () => {
  const rod = (id: string, d: number, extra: Partial<LarmObjekt> = {}) => sym('fara', d, { id, namn: id, ...extra });
  const gron = (id: string, d: number, extra: Partial<LarmObjekt> = {}) => sym('natur', d, { id, namn: id, ...extra });

  it('två röda: det NÄRMASTE är det stora kortet, det andra står i den lilla raden', () => {
    const u = steg([rod('Varning', 18), rod('Kraftledning', 13)]);
    expect(u.kort).toMatchObject({ namn: 'Kraftledning', avstandM: 13 });
    expect(u.fler).toHaveLength(1);
    expect(u.fler[0]).toMatchObject({ namn: 'Varning', avstandM: 18, grupp: 'fara' });
  });

  it('röd + grön: RÖD vinner även när den ligger längre bort; grönt blir raden', () => {
    const u = steg([gron('Hänsyn', 5), rod('Varning', 35)]);
    expect(u.kort).toMatchObject({ namn: 'Varning', grupp: 'fara' });
    expect(u.fler.map((f) => f.namn)).toEqual(['Hänsyn']);
  });

  it('inom samma grupp närmast först', () => {
    const u = steg([gron('A', 30), gron('B', 10), gron('C', 20)]);
    expect([u.kort?.namn, ...u.fler.map((f) => f.namn)]).toEqual(['B', 'C', 'A']);
  });

  it('tre samtidigt: ETT stort kort och "+2 till" (aldrig flera stora kort) — fler är de två andra i ordning', () => {
    const u = steg([rod('R', 12), gron('G', 20), gron('G2', 30)]);
    expect(u.kort?.namn).toBe('R');
    expect(u.fler).toHaveLength(2);
    expect(u.fler.map((f) => f.namn)).toEqual(['G', 'G2']);
  });

  it('en kommentar följer med till raden; ytor har ingen meter', () => {
    const u = steg([rod('El-ledning', 10), gron('Evighetsträd', 20, { kommentar: 'Spara åt markägaren' }), yta('kultur', true, false, { namn: 'Kulturmiljö' })]);
    expect(u.fler.find((f) => f.namn === 'Evighetsträd')).toMatchObject({ text: 'Spara åt markägaren', avstandM: 20 });
    expect(u.fler.find((f) => f.namn === 'Kulturmiljö')).toMatchObject({ kalla: 'yta', avstandM: null, text: 'inne i ytan' });
  });

  it('Röd går före en förbjuden yta man står i — Röd är faran (både inom och utanför 15 m)', () => {
    for (const d of [5, 20]) {
      const u = steg([rod('Varning', d), yta('natur', true, true, { namn: 'Hänsyn' })]);
      expect(u.kort).toMatchObject({ namn: 'Varning' });
      expect(u.fler[0].namn).toBe('Hänsyn');
    }
  });
  it('förbjuden yta går före övrigt', () => {
    const u = steg([gron('Naturhörna', 5), yta('natur', true, true, { namn: 'Hänsyn' })]);
    expect(u.kort).toMatchObject({ namn: 'Hänsyn', forbjuden: true });
  });

  describe('Röd ligger alltid överst och har aldrig Sett — Sett gäller första av de andra', () => {
    it('Röd inom 15 m: stort kort, ingen Sett på den; Sett gäller första i +-raden (med eller utan gammal kvittens)', () => {
      const r = rod('Varning', 8);
      const g = gron('Hänsyn', 20);
      for (const kvitt of [INGEN, kv(r)]) {
        const u = steg([g, r], kvitt);
        expect(u.kort).toMatchObject({ namn: 'Varning', pulserar: true });
        expect(u.fler.map((f) => f.namn)).toEqual(['Hänsyn']);
        expect(u.settRad).toMatchObject({ id: g.id, namn: 'Hänsyn' });
      }
    });
    it('Sett på grönt under en Röd: Röd står kvar överst, raden försvinner', () => {
      const r = rod('Varning', 8);
      const g = gron('Hänsyn', 20);
      const s0 = steg([g, r]);
      expect(s0.settRad?.id).toBe(g.id);
      const s1 = markeraSett(s0.state, g.id);
      const u = steg([g, r], new Map([[g.id, { hash: g.hash, forareId: A }]]), A, s1);
      expect(u.kort?.namn).toBe('Varning');
      expect(u.settRad).toBeNull();
    });
    it('Röd ensam: kortet står kvar, ingen Sett-rad (okvitterad, kvitterad eller forcerat sett)', () => {
      const r = rod('Varning', 8);
      for (const kvitt of [INGEN, kv(r)]) {
        const u = steg([r], kvitt);
        expect(u.kort?.namn).toBe('Varning');
        expect(u.settRad).toBeNull();
      }
    });
    it('en gammal kvittens på en Röd UTANFÖR 15 m sänker den INTE under en okvitterad grön (Röd tystnar aldrig)', () => {
      const r = rod('Varning', 25);
      const g = gron('Hänsyn', 30);
      const u = steg([g, r], kv(r));
      expect(u.kort?.namn).toBe('Varning');
      expect(u.fler.map((f) => f.namn)).toEqual(['Hänsyn']);
      expect(u.settRad?.id).toBe(g.id);
    });
    it('okvitterad Röd utanför 15 m vinner som förut över grön', () => {
      const u = steg([gron('Hänsyn', 5), rod('Varning', 30)]);
      expect(u.kort?.namn).toBe('Varning');
    });
    it('två röda inom 15 m: närmast först, ingen Sett för någon av dem (även med gammal kvittens på den ena)', () => {
      const a = rod('A', 6);
      const b = rod('B', 12);
      for (const kvitt of [INGEN, kv(a)]) {
        const u = steg([a, b], kvitt);
        expect(u.kort?.namn).toBe('A');
        expect(u.fler.map((f) => f.namn)).toEqual(['B']);
        expect(u.settRad).toBeNull();
      }
    });
  });

  it('passerat: när det stora lämnat radien flyttar nästa upp (och raden försvinner)', () => {
    let u = steg([rod('R', 12), gron('G', 20)]);
    expect(u.kort?.namn).toBe('R');
    u = steg([rod('R', 80), gron('G', 25)], INGEN, A, u.state);          // R är utom radien (40 + 10 m)
    expect(u.kort?.namn).toBe('G');
    expect(u.fler).toEqual([]);
  });

  it('"Sett" gäller det stora: efter Sett flyttar nästa OKVITTERADE upp, och Sett-raden hör till det nya kortet', () => {
    const r = gron('Hänsyn', 10), g = gron('Stenmur', 25);
    let u = steg([r, g]);
    expect(u.kort?.namn).toBe('Hänsyn');
    expect(u.settRad).toMatchObject({ id: 'Hänsyn', namn: 'Hänsyn' });
    // föraren trycker Sett → kvittensen sparas (hook) och passagen märks
    const kvitt = new Map([['Hänsyn', { hash: r.hash, forareId: A }]]);
    u = steg([r, g], kvitt, A, markeraSett(u.state, 'Hänsyn'));
    expect(u.kort?.namn).toBe('Stenmur');
    expect(u.settRad).toMatchObject({ id: 'Stenmur', namn: 'Stenmur' });
    expect(u.fler).toEqual([]);                                           // kvitterad grön larmar inte mer → ingen rad
  });

  it('ett forcerat sett på en RÖD UTANFÖR 15 m ändrar ingenting: den sjunker inte under en grön, Sett-raden hör till den gröna', () => {
    const r = rod('Varning', 22), g = gron('Hänsyn', 25);
    let u = steg([r, g]);
    expect(u.kort?.namn).toBe('Varning');
    u = steg([r, g], new Map([['Varning', { hash: r.hash, forareId: A }]]), A, markeraSett(u.state, 'Varning'));
    expect(u.kort?.namn).toBe('Varning');
    expect(u.fler.map((f) => f.namn)).toEqual(['Hänsyn']);
    expect(u.settRad?.namn).toBe('Hänsyn');
  });

  it('Sett på en röd när inget annat väntar: kortet står kvar (röd tystas aldrig), ingen Sett-rad', () => {
    const r = rod('Varning', 8);
    let u = steg([r]);
    u = steg([r], new Map([['Varning', { hash: r.hash, forareId: A }]]), A, markeraSett(u.state, 'Varning'));
    expect(u.kort?.namn).toBe('Varning');
    expect(u.settRad).toBeNull();
  });

  it('ringarna: det stora kortets objekt är "stor" (pulserar), det ENDA i "+"-raden är "nasta" (lyser, pulserar inte), övriga "ovrig"', () => {
    const u = steg([rod('R', 12), gron('G', 20)]);
    expect(u.ringar.find((r) => r.id === 'R')?.roll).toBe('stor');
    expect(u.ringar.find((r) => r.id === 'G')?.roll).toBe('nasta');
    const v = steg([rod('R', 12), gron('G', 20), gron('H', 30)]);
    expect(v.ringar.find((r) => r.id === 'R')?.roll).toBe('stor');
    expect(v.ringar.filter((r) => r.roll === 'nasta')).toEqual([]);       // "+2 till" har inget namngivet objekt
    expect(v.ringar.filter((r) => r.roll === 'ovrig').map((r) => r.id).sort()).toEqual(['G', 'H']);
  });

  it('ett enda larm: ingen rad', () => {
    expect(steg([rod('R', 12)]).fler).toEqual([]);
  });
});
