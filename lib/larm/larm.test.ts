import { describe, expect, it } from 'vitest';
import { GRUPPER, SYMBOL_GRUPP, type FargGrupp } from './grupper';
import { HYSTERES_NARA_M, MYCKET_NARA_M, NARA_M, TOMT_LARM, arKvitterad, harRing, innehallHash, larmar, markeraSett, stegaLarm, type KvittensKarta, type LarmObjekt, type LarmState } from './larm';

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
      it('kvitterad av samma förare: ' + (tystKvitterad ? 'inget kort, inget ljud' : grupp === 'fara' ? 'larmar ändå (bevis, tystar inte)' : 'som förut (larmar aldrig)'), () => {
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
  it('Sett-raden visas för Röd, Grön, Brun, Blå — aldrig för Lila och Mörk', () => {
    for (const g of ['fara', 'natur', 'kultur', 'blott'] as FargGrupp[]) expect(steg([sym(g, 20)]).settRad, g).toMatchObject({ id: `s-${g}` });
    for (const g of ['att_gora', 'info'] as FargGrupp[]) expect(steg([sym(g, 20)]).settRad, g).toBeNull();
  });
  it('för Röd: efter Sett försvinner raden men larmet står kvar och kommer igen nästa gång', () => {
    const o = sym('fara', 30);
    let u = steg([o]);
    expect(u.settRad).not.toBeNull();
    u = steg([o], INGEN, A, markeraSett(u.state, o.id));
    expect(u.settRad).toBeNull(); expect(u.kort).not.toBeNull();
    const ute = steg([sym('fara', 100)], INGEN, A, u.state);
    const igen = steg([o], INGEN, A, ute.state);
    expect(igen.settRad).not.toBeNull(); expect(igen.ljud).toBe('nara');
  });
  it('Sett-raden visas inte för en redan kvitterad Röd (beviset finns)', () => {
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

describe('flera larm samtidigt: ETT stort kort, en liten +-rad', () => {
  const fara = (d: number, extra: Partial<LarmObjekt> = {}) => sym('fara', d, { id: `f${d}`, namn: 'Kraftledning', ...extra });
  const natur = (d: number, extra: Partial<LarmObjekt> = {}) => sym('natur', d, { id: `n${d}`, namn: 'Stenmur', ...extra });

  it('två röda: den närmaste är det stora kortet, den andra står i +-raden med meter', () => {
    const u = steg([fara(30, { id: 'lang' }), fara(13, { id: 'nar' })]);
    expect(u.kort?.id).toBe('nar');
    expect(u.nasta).toMatchObject({ fler: 0, rad: { id: 'lang', namn: 'Kraftledning', avstandM: 30 } });
  });
  it('röd + grön: Röd vinner även när Grön är närmare', () => {
    const u = steg([natur(5), fara(35)]);
    expect(u.kort?.id).toBe('f35');
    expect(u.nasta?.rad).toMatchObject({ id: 'n5', namn: 'Stenmur', avstandM: 5 });
  });
  it('+-raden bär kommentaren om det finns en (Varning med planerarens text)', () => {
    const u = steg([fara(10), natur(20, { kommentar: 'Gammal mur' })]);
    expect(u.nasta?.rad).toMatchObject({ namn: 'Stenmur', text: 'Gammal mur' });
    expect(steg([fara(10), natur(20)]).nasta?.rad?.text).toBeNull();
  });
  it('tre samtidigt: bara "+2 till" i raden, inget namn', () => {
    const u = steg([fara(10), natur(20), sym('kultur', 25, { id: 'k' })]);
    expect(u.kort?.id).toBe('f10');
    expect(u.nasta).toEqual({ rad: null, fler: 2 });
  });
  it('ett enda larm: ingen +-rad', () => {
    expect(steg([fara(10)]).nasta).toBeNull();
    expect(steg([]).nasta).toBeNull();
  });
  it('det som inte larmar (kvitterad Grön, Lila) räknas inte i +-raden', () => {
    const n = natur(20);
    expect(steg([fara(10), n], kv(n)).nasta).toBeNull();
    expect(steg([fara(10), sym('att_gora', 5, { id: 'l' })]).nasta).toBeNull();
  });
  it('inom samma grupp närmast först, bland övriga grupper också', () => {
    expect(steg([natur(30, { id: 'a' }), natur(10, { id: 'b' })]).kort?.id).toBe('b');
    expect(steg([natur(30, { id: 'a' }), sym('blott', 10, { id: 'b' })]).kort?.id).toBe('b');
  });
  it('Sett gäller det stora; därefter flyttar nästa okvitterade upp och får Sett-raden', () => {
    const a = fara(10); const b = natur(20);
    let u = steg([a, b]);
    expect(u.kort?.id).toBe(a.id);
    expect(u.settRad?.id).toBe(a.id);
    u = steg([a, b], INGEN, A, markeraSett(u.state, a.id));
    expect(u.kort?.id).toBe(b.id);              // den okvitterade Gröna flyttar upp…
    expect(u.settRad?.id).toBe(b.id);           // …och Sett-knappen gäller nu den
    expect(u.nasta?.rad?.id).toBe(a.id);        // Röd är kvar i raden: den larmar fortfarande, bara inte som stort kort
    u = steg([a, b], INGEN, A, markeraSett(u.state, b.id));
    expect(u.kort?.id).toBe(a.id);              // allt kvitterat: det viktigaste står kvar, utan Sett-rad
    expect(u.settRad).toBeNull();
  });
  it('Sett på det stora ändrar inget ljud (ingen ny sak kom)', () => {
    const a = fara(10); const b = natur(20);
    const u0 = steg([a, b]);
    expect(steg([a, b], INGEN, A, markeraSett(u0.state, a.id)).ljud).toBeNull();
  });
  it('när det stora passerats (lämnat 40 m) flyttar nästa upp', () => {
    const f = fara(10); const n = natur(20);
    const u0 = steg([f, n]);
    const u1 = steg([fara(60), n], INGEN, A, u0.state);
    expect(u1.kort?.id).toBe(n.id);
    expect(u1.nasta).toBeNull();
  });
  it('ringarnas roll: stor = kortets objekt, plus = +-radens objekt, övriga som förut', () => {
    const r = steg([fara(10), natur(20), sym('kultur', 25, { id: 'k' })]).ringar;
    expect(r.find((x) => x.id === 'f10')?.roll).toBe('stor');
    expect(r.filter((x) => x.roll === 'plus')).toHaveLength(0);       // tre larm: raden säger bara "+2 till", ingen namngiven
    expect(r.filter((x) => x.roll === 'ovrig').map((x) => x.id).sort()).toEqual(['k', 'n20']);
    const tva = steg([fara(10), natur(20)]).ringar;
    expect(tva.find((x) => x.id === 'n20')?.roll).toBe('plus');
  });
  it('en kvitterad Grön (utan kort) har ring men ingen roll i larmet: övrig', () => {
    const n = natur(20);
    const u = steg([fara(10), n], kv(n));
    expect(u.ringar.find((x) => x.id === n.id)?.roll).toBe('ovrig');
  });
  it('förbjuden yta är inte Röd: Röd vinner, ytan hamnar i +-raden', () => {
    const z = yta('natur', true, true, { id: 'z', namn: 'Hänsyn' });
    const u = steg([z, fara(20)]);
    expect(u.kort?.id).toBe('f20');
    expect(u.nasta?.rad).toMatchObject({ id: 'z', text: 'Du är inne i ytan, kör inte här', avstandM: null });
  });
});
