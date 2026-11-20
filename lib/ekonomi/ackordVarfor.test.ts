// Ackord – varför. Facit är tre skogar ur prod 2026-11-20 (Skälviken,
// Edestad, Arvidstorp): volymer, G15-sekunder, prislista och tillägg är
// prodens, och delarna är hopsatta med prisets egna regler. Testerna vaktar
// det som kan gå sönder tyst: talet överst som inte är listans, en orange rad
// som inte är den största orsaken, och en mätning som visas fast den saknas.
import { describe, expect, it } from 'vitest';
import type { MaskinDel, ObjektRad } from './objektJamforelse';
import { objektKr, skogRader, maskinRader } from './ackordVy';
import { skogVarfor, maskinVanligastOrsak, INGET_MATT, MAX_VARFOR, type Matt } from './ackordVarfor';
import type { CykelSammanstallning } from '@/lib/faktura/lassCykel';
import type { Tillaggspost } from './prisPerM3';

const GIANT = 'PONS20SDJAA270231', ELEFANT = 'A130743';
const namn = (id: string) => (id === GIANT ? 'Giant' : 'Elefant 26');

function del(roll: MaskinDel['roll'], volym: number, grund: number, tillagg: number, avstandKr: number, sek: number): MaskinDel {
  const timpris = roll === 'skördare' ? 1930 : 1295; // inkl. ForestLink 10 kr
  const timmar = sek / 3600;
  return {
    maskin_id: roll === 'skördare' ? GIANT : ELEFANT, roll, volym,
    ackord: volym * (grund + tillagg) + avstandKr, timpeng: timmar * timpris, timmar, timpris,
    forestlinkKr: 10, manuellTid: false,
    pris: { volymAckord: volym, grundKrPerM3: grund, tillaggKrPerM3: tillagg, avstandKr, undantagKr: 0 },
  };
}
function skog(id: string, namnet: string, medelstam: number, maskiner: MaskinDel[], tillagg: Tillaggspost[], manuellM: number | null): ObjektRad {
  const ackord = maskiner.reduce((s, d) => s + d.ackord, 0), timpeng = maskiner.reduce((s, d) => s + d.timpeng, 0);
  return {
    objekt_id: id, namn: namnet, volym: maskiner[0].volym, medelstam, klass: 0.6, ackord, timpeng, diff: ackord - timpeng,
    krPerM3: null, egenSkotning: false, ejJamforbarOrsak: null, grund: [], maskiner,
    detalj: {
      voNummer: id, avraknad: '2026-11-13', stammar: 0, tillagg,
      avstand: { manuellM, lassM: null, regel: { grundavstand_m: 200, kr_per_100m: 4 } },
      skotadManuell: true, terrangKr: 0, dieselBas: 19.5, massa3mKr: 10,
    },
  };
}
const KRONT: Tillaggspost = { etikett: 'Krönt', belopp: 1.5, mottagare: 'skordare' };
const storlek = (kr: number): Tillaggspost => ({ etikett: 'Storlek', belopp: kr, mottagare: 'delas' });

// Skälviken: klass 0,60 (56/44), storlek −1 (−0,5 var), krönt 1,5, sortiment 7 grupper = +2, avstånd 450 m = 12 kr/m³.
const skalviken = skog('11271860', 'Skälviken RP J-Hus -25', 0.614, [
  del('skördare', 1725.24, 56, 1.0, 0, 167592),
  del('skotare', 1725, 44, 1.5, 12 * 1725, 368556),
], [KRONT, storlek(-1), { etikett: 'Sortiment', belopp: 2, mottagare: 'skotare' }], 450);
// Edestad: storlek +2 (1 var), avstånd 350 m = 8 kr/m³.
const edestad = skog('11277898', 'Edestad RP J-Hus -25', 0.76, [
  del('skördare', 588.23, 56, 2.5, 0, 53194),
  del('skotare', 588, 44, 1, 8 * 588, 96809),
], [KRONT, storlek(2)], 350);
// Arvidstorp: inget avstånd räknat alls.
const arvidstorp = skog('11277905', 'Arvidstorp RP J-Hus -25', 0.775, [
  del('skördare', 627.7, 56, 2.5, 0, 49531),
  del('skotare', 628, 44, 1, 0, 88977),
], [KRONT, storlek(2)], null);

const cykel = (enkelVagM: number, lass: number, medCykel: number): CykelSammanstallning => ({
  lass, medCykel, volym: 0, volymMedCykel: 0, cykelM: enkelVagM * 2, enkelVagM,
  hemMedLassM: null, vidAvlaggetM: null, ytterstM: null, utan: {},
});
const matt = (m: Partial<Matt>): Matt => ({ ...INGET_MATT, flyttar: 0, ...m });
const SKALVIKEN_MATT = matt({
  cykel: cykel(739, 85, 70),
  tider: { lass: 70, lastaMin: 28.5, koraMin: 21.3, avlaggMin: 12 },
  lass: { lass: 85, snittM3: 18.3, breddade: 0 },
});

describe('talet överst = talet i listan', () => {
  it('facit ur prod: Skälviken −24 899, Edestad +2 234, Arvidstorp +6 419', () => {
    expect(skogVarfor(skalviken, namn).kr).toBe(-24899);
    expect(skogVarfor(edestad, namn).kr).toBe(2234);
    expect(skogVarfor(arvidstorp, namn).kr).toBe(6419);
  });

  it('för alla skogar, med och utan mätningar: samma tal som listans rad', () => {
    const alla = [skalviken, edestad, arvidstorp];
    const lista = skogRader(alla);
    for (const o of alla) {
      const rad = lista.find(r => r.nyckel === o.objekt_id)!;
      for (const m of [INGET_MATT, SKALVIKEN_MATT]) {
        const v = skogVarfor(o, namn, m);
        expect(v.kr).toBe(rad.kr);
        expect(v.kr).toBe(objektKr(o));
        // Skärmen går att räkna ihop: ackord − timpeng, och maskinerna var för sig.
        expect(v.ackord - v.timpeng).toBe(v.kr);
        expect(v.maskiner.reduce((s, k) => s + k.kr, 0)).toBe(v.kr);
        for (const k of v.maskiner) {
          expect(k.ackord - k.timpeng.kr).toBe(k.kr);
          expect(k.ackordRader.reduce((s, r) => s + r.kr, 0)).toBe(k.ackord);
        }
      }
    }
  });

  it('Skälviken uppdelat: skördaren +8 491, skotaren −33 390', () => {
    const v = skogVarfor(skalviken, namn);
    expect(Object.fromEntries(v.maskiner.map(m => [m.roll, m.kr]))).toEqual({ 'skördare': 8491, skotare: -33390 });
    const skotare = v.maskiner.find(m => m.roll === 'skotare')!;
    expect(skotare.ackordUttryck.replace(/\s/g, ' ')).toBe('1 725 m³fub × 57,50 kr');
    expect(skotare.ackordRader.find(r => r.titel === 'Skotningsavstånd')!.kr).toBe(20700);
    expect(Math.round(skotare.perTimme!.ackord)).toBe(969);
    expect(Math.round(skotare.perTimme!.diff)).toBe(-326);
  });
});

describe('varför', () => {
  it('Skälviken: avståndet är den orange raden — 20 700 kr av minuset', () => {
    const v = skogVarfor(skalviken, namn, SKALVIKEN_MATT);
    const orange = v.varfor.filter(r => r.orange);
    expect(orange).toHaveLength(1);
    expect(orange[0].nyckel).toBe('avstand');
    expect(orange[0].forklararKr).toBe(20700); // 739 m = 6 steg × 4 kr = 24 kr/m³ mot räknade 12
    expect(orange[0].titel).toContain('räknat 450 m (satt för hand) · kört 739 m');
    expect(orange[0].under).toContain('vi kanske borde fått – inte dålig körning');
    expect(orange[0].under).toContain('Mätt på 70 av 85 lass');
    expect(v.orsak).toBe('Skotningsavståndet – kört 739 m, räknat 450 m');
  });

  it('den orange raden är alltid den som förklarar mest', () => {
    for (const m of [INGET_MATT, SKALVIKEN_MATT, matt({ cykel: cykel(460, 85, 85) })]) {
      const v = skogVarfor(skalviken, namn, m);
      const max = Math.max(...v.varfor.map(r => r.forklararKr));
      expect(v.varfor.filter(r => r.orange).map(r => r.forklararKr)).toEqual([max]);
    }
  });

  it('utan körspår: skotarens takt är orsaken, och det körda avståndet visas inte', () => {
    const v = skogVarfor(skalviken, namn, matt({}));
    expect(v.orsak).toBe('Skotaren under – 17 m³/h, behöver 23');
    expect(v.varfor.find(r => r.orange)!.nyckel).toBe(`takt:${ELEFANT}`);
    const text = JSON.stringify(v.varfor);
    expect(text).not.toContain('kört');
    expect(text).not.toContain('Per lass');
    expect(text).not.toContain('Snittlass');
    expect(v.varfor.find(r => r.nyckel === 'avstand')!.titel).toBe('Skotningsavstånd: räknat 450 m (satt för hand)');
  });

  it('m³/h mot behovet: timpriset delat med maskinens ackord per m³', () => {
    const v = skogVarfor(skalviken, namn);
    expect(v.varfor.find(r => r.nyckel === `takt:${GIANT}`)!.titel).toBe('Skördaren 37 m³/h · behöver 34');
    expect(v.varfor.find(r => r.nyckel === `takt:${ELEFANT}`)!.titel).toBe('Skotaren 17 m³/h · behöver 23');
  });

  it('lasta, köra, avlägg och snittlass står med när de är mätta', () => {
    const v = skogVarfor(skalviken, namn, SKALVIKEN_MATT);
    expect(v.varfor.find(r => r.nyckel === 'tider')!.titel).toBe('Per lass: lastar ca 29 min · kör ca 21 min · avlägg ca 12 min');
    expect(v.varfor.find(r => r.nyckel === 'lass')!.titel).toBe('Snittlass 18,3 m³ · kördes smal');
    expect(v.varfor.length).toBeLessThanOrEqual(MAX_VARFOR);
  });

  it('en skog i plus har ingen orange rad och ingen orsak i listan', () => {
    const v = skogVarfor(edestad, namn, matt({ cykel: cykel(557, 31, 28) }));
    expect(v.varfor.some(r => r.orange)).toBe(false);
    expect(v.orsak).toBeNull();
    // Avståndet sägs ändå: 557 m = 16 kr/m³ mot räknade 8.
    expect(v.varfor.find(r => r.nyckel === 'avstand')!.forklararKr).toBe(4704);
  });

  it('Arvidstorp: inget avstånd räknat alls — hela tillägget är pengar vi kanske borde fått', () => {
    const v = skogVarfor(arvidstorp, namn, matt({ cykel: cykel(516, 22, 19) }));
    const rad = v.varfor.find(r => r.nyckel === 'avstand')!;
    expect(rad.titel).toBe('Skotningsavstånd: inget avstånd räknat · kört 516 m');
    expect(rad.forklararKr).toBe(16 * 628);
  });
});

describe('inte med än', () => {
  it('Edestad: flytten saknas — sägs i klartext', () => {
    const v = skogVarfor(edestad, namn, matt({ flyttar: 0 }));
    expect(v.inteMed.map(r => r.titel)).toContain('Ingen flytt är registrerad hit');
    expect(v.inteMed.map(r => r.titel)).toContain('Dieselklausulen är inte räknad');
    expect(v.inteMed.map(r => r.titel)).toContain('Tillägg för 3 m massaved är inte räknat');
  });

  it('flyttarna olästa: ingen rad; kunde inte läsas: sägs; aldrig "ingen flytt" på en gissning', () => {
    const titlar = (f: Matt['flyttar']) => skogVarfor(edestad, namn, matt({ flyttar: f })).inteMed.map(r => r.titel).join('|');
    expect(titlar('laser')).not.toContain('lytt');
    expect(titlar(null)).toContain('Flyttersättningen är inte med');
    expect(titlar(null)).not.toContain('Ingen flytt');
    expect(titlar(2)).not.toContain('Ingen flytt');
  });
});

describe('gemensamt och maskin-fliken', () => {
  it('tilläggen står för sig med vem de går till', () => {
    const g = skogVarfor(skalviken, namn).gemensamt;
    expect(g.map(r => [r.etikett, r.kr, r.till])).toEqual([
      ['Kvalitetssäkring', 2588, 'hela till skördaren'],
      ['Traktstorlek', -1725, 'delas mellan maskinerna'],
      ['Sortiment', 3450, 'hela till skotaren'],
    ]);
  });

  it('maskinens vanligaste orsak över skogarna', () => {
    const alla = [skalviken, edestad, arvidstorp];
    const maskiner = maskinRader(alla, namn);
    const varfor = new Map(alla.map(o => [o.objekt_id, skogVarfor(o, namn, o === skalviken ? SKALVIKEN_MATT : matt({}))] as const));
    const elefant = maskiner.find(m => m.maskin_id === ELEFANT)!;
    expect(maskinVanligastOrsak(elefant, varfor)).toBe('Oftast för få m³ per timme · 2 av 3 skogar under');
    expect(maskinVanligastOrsak(maskiner.find(m => m.maskin_id === GIANT)!, varfor)).toBeNull();
  });
});
