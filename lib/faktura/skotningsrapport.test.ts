// Skotningsrapporten — det Martin skickar till Vidas inköpare.
//
// Rapportens hela värde ligger i att den säger SANT och att talen är desamma
// som fakturans. Testerna vaktar fyra saker:
//
//   1. Rapporten räknar inget eget pris — kronorna och avståndet kommer in.
//   2. Alla fyra måtten står där, med det fakturerade märkt.
//   3. Ett saknat tal sägs rakt ut, aldrig som en nolla eller en gissning.
//   4. Ett mått blandas aldrig med ett annat i samma tal.
//
// FACIT är Skälviken i prod 2026-11-25: 414 m ut, 739 halva cykeln, 660 efter
// vändpunkten, 250 vid avlägget; 12 kr/m³fub på 1 746,35 m³fub = 20 956 kr.
import { describe, it, expect } from 'vitest';
import {
  KARTA_FORKLARING, kartforklaring, kallaMening, kortRad, luckaRad, mattRader, periodText,
  periodMening, saMattStycken, skotningenRader, skotningsrapport, traktFakta, virkeDel,
  type SkotningsrapportIndata,
} from './skotningsrapport';
import type { CykelSammanstallning } from './lassCykel';
import { SKALVIKEN_AVLAGG, SKALVIKEN_RUTOR } from './__fixtures__/skalviken_virke_2026-11-25';

/** toLocaleString('sv-SE') ger hårt mellanslag som tusenavskiljare. */
const txt = (s: string | null | undefined) => s?.replace(/[  ]/g, ' ') ?? s;

const SKALVIKEN_CYKEL: CykelSammanstallning = {
  lass: 85, medCykel: 70, volym: 1553, volymMedCykel: 1278,
  cykelM: 1477, enkelVagM: 738.6, hemMedLassM: 660, vidAvlaggetM: 250,
  ytterstM: 414.4,
  utan: { fonster_for_langt: 14, forsta_lasset: 1 },
};

const SKALVIKEN: SkotningsrapportIndata = {
  trakt: {
    namn: 'Skälviken RP J-Hus -25', voNummer: '11271860', kund: 'Vida',
    avtalsform: 'Rp', arealHa: 7.28,
  },
  skotare: ['Elefant 26'],
  period: { fran: '2026-11-03', till: '2026-11-18' },
  dagar: 11,
  volymM3fub: 1746.35,
  avstandM: 414.4,
  handsatt: false,
  cykel: SKALVIKEN_CYKEL,
  lass: [
    { avstandM: 672, volym: 18, kalla: 'app' },
    { avstandM: 414, volym: 20, kalla: 'app' },
    { avstandM: 40, volym: 19, kalla: 'app' },
  ],
  virke: SKALVIKEN_RUTOR,
  avlagg: [{ ...SKALVIKEN_AVLAGG, namn: '01-1' }],
  pris: { grundavstandM: 200, krPer100m: 4, kronor: 20956.2 },
};

describe('de tre korten — rapportens svar', () => {
  it('avståndet först, prislistan, tillägget', () => {
    const k = kortRad(SKALVIKEN);
    expect(k.map(x => x.etikett)).toEqual(['Skotningsavstånd', 'Prislistan', 'Tillägg']);
    expect(k[0].varde).toBe('414 m');
    expect(k[0].under).toContain('Enkel väg');
    // 20 956,2 / 1 746,35 = 12,00. Enheten står UNDER talet, inte i det —
    // tre kort som alla slutar på ett kort tal läses snabbare, och i stor stil
    // läser pdftotext den upphöjda trean som ett eget ord ("12,00 kr/m fub").
    expect(txt(k[1].varde)).toBe('12,00 kr');
    expect(txt(k[1].under)).toContain('per m³fub');
    expect(txt(k[1].under)).toContain('200 m fritt');
    expect(txt(k[2].varde)).toBe('20 956 kr');
    // Volymen priset vilar på står vid kronorna, så summan går att räkna om.
    expect(txt(k[2].under)).toContain('1 746 m³fub');
  });

  it('saknas avståndet står kortet ändå, med orsaken — aldrig 0 m', () => {
    const k = kortRad({ ...SKALVIKEN, avstandM: null });
    expect(k[0].varde).toBe('—');
    expect(k[0].under).toContain('Inte mätt');
    expect(k[0].varde).not.toContain('0 m');
  });

  it('utan prislista blir det två kort, aldrig ett tomt', () => {
    const k = kortRad({ ...SKALVIKEN, volymM3fub: 0 });
    expect(k.map(x => x.etikett)).toEqual(['Skotningsavstånd', 'Tillägg']);
    expect(JSON.stringify(k)).not.toContain('Infinity');
    expect(JSON.stringify(k)).not.toContain('NaN');
  });

  it('utan prislistans villkor påstås inget villkor, men kronorna står', () => {
    const k = kortRad({ ...SKALVIKEN, pris: { grundavstandM: null, krPer100m: null, kronor: 20956.2 } });
    expect(txt(k[1].varde)).toBe('12,00 kr');
    expect(k[1].under).toBe('per m³fub.');
    expect(k[1].under).not.toContain('fritt');
  });
});

describe('trakten', () => {
  it('nummer, avtalsform, areal, volym och avlägget på en rad', () => {
    expect(txt(traktFakta(SKALVIKEN)))
      .toBe('VO 11271860 · rotpost · 7,28 ha · 1 746 m³fub · avlägg 01-1');
  });

  it('Vidas koder skrivs i klartext, en okänd kod står som den är', () => {
    // 'Rp' betyder inget för den som inte kan Vidas koder; 'LRK' kan vi inte
    // skriva ut utan att gissa, och då står Vidas eget ord kvar.
    expect(traktFakta(SKALVIKEN)).toContain('rotpost');
    expect(traktFakta({ ...SKALVIKEN, trakt: { ...SKALVIKEN.trakt, avtalsform: 'Au' } }))
      .toContain('avverkningsuppdrag');
    expect(traktFakta({ ...SKALVIKEN, trakt: { ...SKALVIKEN.trakt, avtalsform: 'LRK' } }))
      .toContain('LRK');
  });

  it('det som saknas står inte', () => {
    expect(txt(traktFakta({
      ...SKALVIKEN,
      trakt: { ...SKALVIKEN.trakt, avtalsform: null, arealHa: null },
      avlagg: [],
    }))).toBe('VO 11271860 · 1 746 m³fub');
  });

  it('flera avlägg räknas, aldrig ett utpekat av dem', () => {
    const f = traktFakta({
      ...SKALVIKEN,
      avlagg: [{ lat: 1, lng: 1, namn: '01-1' }, { lat: 2, lng: 2, namn: '01-2' }],
    });
    expect(f).toContain('2 avlägg');
    expect(f).not.toContain('01-1');
  });
});

describe('var talet kommer ifrån', () => {
  it('mätt: lassen, täckningen och volymen bakom', () => {
    const m = txt(kallaMening(SKALVIKEN))!;
    expect(m).toContain('70 av 85 lass');
    expect(m).toContain('1 278 m³fub av 1 746 m³fub');
    expect(m).toContain('73 % av traktens volym');
  });

  it('handsatt sägs som handsatt, med lassens mätning bredvid', () => {
    const m = txt(kallaMening({ ...SKALVIKEN, handsatt: true, avstandM: 450 }))!;
    expect(m).toContain('satt för hand');
    expect(m).toContain('414 m');
  });

  it('inget avstånd: säger varför, inte "0"', () => {
    expect(kallaMening({ ...SKALVIKEN, avstandM: null })).toContain('inget av dem har ett mätt körspår');
    expect(kallaMening({ ...SKALVIKEN, avstandM: null, cykel: null })).toContain('inga lass med körspår');
  });
});

describe('samma körning, fyra mått', () => {
  it('det fakturerade står FÖRST och är märkt', () => {
    const r = mattRader(SKALVIKEN_CYKEL);
    expect(r.map(x => [x.etikett, txt(x.varde)])).toEqual([
      ['Ut till virket', '414 m · fakturerat'],
      ['Halva cykeln', '739 m'],
      ['Efter vändpunkten', '660 m'],
      ['Vid avlägget', '250 m'],
    ]);
  });

  it('ÄRLIGHETEN: rapporten visar att vi tagit det lägsta transportmåttet', () => {
    const r = mattRader(SKALVIKEN_CYKEL);
    // Halva cykeln (739) är nästan dubbelt — står kvar, med skälet.
    expect(r[1].under).toContain('betald i kubikpriset');
    // Landningsarbetet sägs ligga utanför det vi fakturerar.
    expect(r[3].under).toContain('Inte skotning');
  });

  it('en del som inte gick att mäta får ingen rad', () => {
    const r = mattRader({ ...SKALVIKEN_CYKEL, hemMedLassM: null, vidAvlaggetM: null });
    expect(r.map(x => x.etikett)).toEqual(['Ut till virket', 'Halva cykeln']);
  });

  it('inga app-lass ger inga mått — inte fyra nollor', () => {
    expect(mattRader(null)).toEqual([]);
    expect(mattRader({ ...SKALVIKEN_CYKEL, enkelVagM: null })).toEqual([]);
  });
});

describe('luckan', () => {
  it('säger hur många som mättes och varför de andra inte gjorde det', () => {
    const r = txt(luckaRad(SKALVIKEN_CYKEL))!;
    expect(r).toContain('70 av 85');
    expect(r).toContain('14 lass');
    expect(r).toContain('3 timmar');
    // Ett omätt lass drar inte ner snittet (regeln sedan 2026-11-25).
    expect(r).toContain('drar inte ner snittet');
    expect(r).not.toContain('0 kr');
  });

  it('allt mätt ger ingen rad', () => {
    expect(luckaRad({ ...SKALVIKEN_CYKEL, utan: {} })).toBeNull();
    expect(luckaRad(null)).toBeNull();
  });
});

describe('skotningen', () => {
  it('lass, kortaste, längsta och sträckan som en statsrad', () => {
    const r = skotningenRader(SKALVIKEN);
    expect(r.map(x => [x.etikett, txt(x.varde)])).toEqual([
      ['Lass', '85'],
      ['Kortaste lasset', '40 m'],
      ['Längsta lasset', '672 m'],
      ['Lassen tillsammans', '1,1 km'],
    ]);
  });

  it('perioden är en MENING, inte en stat — den är fyra gånger bredare', () => {
    // Uppmätt i den renderade PDF:en: "3 november 2026 – 18 november 2026"
    // som stat sköt in i grannkolumnen och lade sig över dagarnas tal.
    expect(periodMening(SKALVIKEN))
      .toBe('Skotat 3 november 2026 – 18 november 2026 · 11 dagar med lass');
    expect(skotningenRader(SKALVIKEN).map(x => x.etikett)).not.toContain('Skotat');
  });

  it('en dag skrivs "1 dag", utan period finns ingen mening', () => {
    expect(periodMening({ ...SKALVIKEN, dagar: 1 })).toContain('1 dag med lass');
    expect(periodMening({ ...SKALVIKEN, dagar: 0 })).not.toContain('dagar');
    expect(periodMening({ ...SKALVIKEN, period: null })).toBeNull();
  });

  it('SUMMAN PÅSTÅR INTE ATT MASKINEN KÖRDE SÅ LÅNGT', () => {
    // Skissen kallade talet "Körd sträcka". Det håller inte: lassens enkla
    // vägar summerade är ungefär halva det maskinen körde (tur och retur),
    // och ett underlag som inte håller när inköparen räknar efter tappar
    // hela sitt värde. Raden säger därför vad talet ÄR.
    const r = skotningenRader(SKALVIKEN);
    const summa = r.find(x => x.etikett === 'Lassen tillsammans')!;
    expect(summa.under).toContain('Maskinen körde mer än så');
    expect(r.map(x => x.etikett)).not.toContain('Körd sträcka');
  });

  it('ETT MÅTT I TAGET: Optis lass blandas aldrig in bland appens', () => {
    // Optis lass bär halva körsträckan, appens avståndet ut till virket. Ett
    // Opti-lass på 1 198 m skulle annars bli "längsta lasset" — mätt på ett
    // annat sätt än det vi fakturerar.
    const r = skotningenRader({
      ...SKALVIKEN,
      lass: [...SKALVIKEN.lass!, { avstandM: 1198, volym: 20, kalla: 'opti' }],
    });
    expect(txt(r.find(x => x.etikett === 'Längsta lasset')!.varde)).toBe('672 m');
  });

  it('finns bara Opti-lass räknas DE, konsekvent för sig', () => {
    const r = skotningenRader({
      ...SKALVIKEN,
      lass: [{ avstandM: 858, volym: 20, kalla: 'opti' }, { avstandM: 1538, volym: 20, kalla: 'opti' }],
    });
    expect(txt(r.find(x => x.etikett === 'Längsta lasset')!.varde)).toBe('1 538 m');
  });

  it('utan lass står inga längder — aldrig 0 m', () => {
    const r = skotningenRader({ ...SKALVIKEN, lass: [] });
    expect(r.map(x => x.etikett)).toEqual(['Lass']);
    expect(JSON.stringify(r)).not.toContain('0 m');
  });

  // MASKINEN KÖRDE (2026-11-27). Lassens summa är enkel väg och säger inget om
  // hur långt maskinen faktiskt körde. Talet bredvid gör det, och först då går
  // kartans turkosa linje att läsa som en mängd.
  const KORDE = { skotareM: 37836, skordareM: 6797, utanforM: 581 };

  it('MASKINEN KÖRDE står som ett femte tal, sist', () => {
    const r = skotningenRader({ ...SKALVIKEN, korde: KORDE });
    expect(r.map(x => x.etikett)).toEqual([
      'Lass', 'Kortaste lasset', 'Längsta lasset', 'Lassen tillsammans', 'Maskinen körde',
    ]);
    expect(txt(r[4].varde)).toBe('37,8 km');
  });

  it('raden under säger vad SKILLNADEN mellan de två talen är', () => {
    // Utan talet bredvid måste raden säga både vad lassen är och att maskinen
    // körde mer. Med det bredvid vore "Maskinen körde mer än så" samma sak två
    // gånger — och Martins regel är att en sida inte säger samma sak två gånger.
    const med = skotningenRader({ ...SKALVIKEN, korde: KORDE })
      .find(x => x.etikett === 'Lassen tillsammans')!;
    expect(med.under).toContain('Talet bredvid');
    expect(med.under).not.toContain('Maskinen körde mer än så');

    const utan = skotningenRader(SKALVIKEN).find(x => x.etikett === 'Lassen tillsammans')!;
    expect(utan.under).toContain('Maskinen körde mer än så');
  });

  it('utan körspår sägs ingenting om körd sträcka — aldrig en nolla', () => {
    const r = skotningenRader({ ...SKALVIKEN, korde: null });
    expect(r.map(x => x.etikett)).not.toContain('Maskinen körde');
  });
});

describe('var låg virket', () => {
  it('klasserna, summan och måttet sägs', () => {
    const v = virkeDel(SKALVIKEN)!;
    expect(v.rubrik).toBe('Var låg virket?');
    expect(v.under).toContain('Fågelväg');
    expect(txt(v.summa)).toBe('1 746 m³fub');
    expect(v.rader[0].etikett).toBe('under 100 m');
    expect(v.rader.at(-1)!.etikett).toBe('500–600 m');
  });

  it('summan är samma volym som tillägget räknas på', () => {
    // Går de isär står två olika volymer på samma sida, framför inköparen.
    const v = virkeDel(SKALVIKEN)!;
    const kort = kortRad(SKALVIKEN);
    expect(txt(v.summa)).toBe(txt(kort.at(-1)!.under!.replace(' skördad volym', '')));
  });

  it('utan virke eller avlägg finns ingen tabell — aldrig en rad nollor', () => {
    expect(virkeDel({ ...SKALVIKEN, virke: [] })).toBeNull();
    expect(virkeDel({ ...SKALVIKEN, avlagg: [] })).toBeNull();
    expect(virkeDel({ ...SKALVIKEN, virke: undefined, avlagg: undefined })).toBeNull();
  });

  it('stammar utan plats eller volym SÄGS', () => {
    const v = virkeDel({
      ...SKALVIKEN,
      virke: [...SKALVIKEN.virke!.slice(0, 5), { lat: NaN, lng: 15.37, volym: 9 }],
    })!;
    expect(v.not).toContain('1 stam');
    expect(v.not).toContain('räknas inte');
  });
});

describe('så är det mätt', () => {
  it('mätt: körd väg, fågelväg och täckning', () => {
    const s = saMattStycken(SKALVIKEN, true);
    expect(s.map(x => x.rubrik)).toEqual(['Körd väg', 'Fågelväg', 'Täckning']);
    expect(s[0].text).toContain('GPS');
    expect(s[0].text).toContain('viktat på lassens volym');
    // Fågelvägen säger rakt ut att den INTE är den körda vägen.
    expect(s[1].text).toContain('inte hur långt maskinen körde');
  });

  it('handsatt: säger att talet är satt, inte mätt', () => {
    const s = saMattStycken({ ...SKALVIKEN, handsatt: true, avstandM: 450 }, true);
    expect(s[0].rubrik).toBe('Det fakturerade avståndet');
    expect(s[0].text).toContain('Satt för hand');
    expect(s[0].text).not.toContain('GPS');
  });

  it('UTAN tabellen står ingen förklaring till den', () => {
    // Fågelvägs-stycket förklarar "Var låg virket?". Finns tabellen inte på
    // sidan läses förklaringen som att vi glömt tabellen.
    const s = saMattStycken(SKALVIKEN, false);
    expect(s.map(x => x.rubrik)).toEqual(['Körd väg', 'Täckning']);
    for (const x of s) expect(x.text).not.toContain('Var låg virket');
  });

  it('MASKINEN KÖRDE: vad talet omfattar och hur mycket som låg i stråket', () => {
    const s = saMattStycken(
      { ...SKALVIKEN, korde: { skotareM: 37836, skordareM: 6797, utanforM: 581 } }, true);
    const m = s.find(x => x.rubrik === 'Maskinen körde')!;
    expect(m.text).toContain('rådata');
    // Vad som INTE är med är lika viktigt som vad som är det.
    expect(m.text).toContain('resan hem räknas inte');
    expect(m.text).toContain('37,8 km');
    // Andelen i stråket är skälet att stråket är ritat: vägen var given.
    expect(m.text).toContain('98 %');
    expect(m.text).toContain('6,8 km');
  });

  it('utan skördarspår påstås ingen andel — vi vet inte var stråket går', () => {
    const s = saMattStycken(
      { ...SKALVIKEN, korde: { skotareM: 37836, skordareM: null, utanforM: null } }, true);
    const m = s.find(x => x.rubrik === 'Maskinen körde')!;
    expect(m.text).toContain('37,8 km');
    expect(m.text).not.toContain('stråk');
    expect(m.text).not.toContain('%');
  });

  it('utan körspår finns stycket inte alls', () => {
    const s = saMattStycken({ ...SKALVIKEN, korde: null }, true);
    expect(s.map(x => x.rubrik)).not.toContain('Maskinen körde');
  });

  it('... och hela rapporten utan avlägg nämner inte tabellen någonstans', () => {
    const s = skotningsrapport({ ...SKALVIKEN, avlagg: [] });
    expect(s.virke).toBeNull();
    const allt = [s.kalla, s.not, ...s.saMatt.map(x => `${x.rubrik} ${x.text}`)].join(' ');
    expect(allt).not.toContain('Var låg virket');
  });
});

describe('perioden', () => {
  it('två dagar blir ett spann, en dag blir en dag', () => {
    expect(periodText({ fran: '2026-11-03', till: '2026-11-18' })).toBe('3 november 2026 – 18 november 2026');
    expect(periodText({ fran: '2026-11-03', till: '2026-11-03' })).toBe('3 november 2026');
    expect(periodText(null)).toBeNull();
  });
});

describe('hela sidan', () => {
  it('skissens delar, i skissens ordning', () => {
    const s = skotningsrapport(SKALVIKEN);
    expect(s.titel).toBe('Skotningsrapport');
    expect(s.filnamn).toBe('skotningsrapport-11271860');
    expect(s.avsandare).toContain('Kompersmåla Skog AB');
    expect(s.avsandare).toContain('till Vida');
    expect(s.traktNamn).toBe('Skälviken RP J-Hus -25');
    expect(s.kort).toHaveLength(3);
    expect(s.virke).not.toBeNull();
    expect(s.skotningen.length).toBeGreaterThan(0);
    expect(s.matt.length).toBe(4);
    expect(s.saMatt.length).toBe(3);
    expect(s.not).toContain('Elefant 26');
  });

  // Hittat 2026-11-25 när render-testet körde den riktiga PDF:en: med ett
  // handsatt avstånd stod "Ut till virket 414 m · fakturerat" medan fakturan
  // vilade på 450, källmeningen saknades helt och noten sa "Mätt ur GPS:en".
  // En inköpare hade läst fel tal som priset. Det får inte komma tillbaka.
  it('HANDSATT: det handsatta talet är det fakturerade, och det SÄGS', () => {
    const s = skotningsrapport({ ...SKALVIKEN, handsatt: true, avstandM: 450 });
    expect(s.kort[0].varde).toBe('450 m');
    // Det handsatta står först bland måtten och är det enda märkta.
    expect([s.matt[0].etikett, txt(s.matt[0].varde)]).toEqual(['Satt för hand', '450 m · fakturerat']);
    expect(s.matt.filter(r => r.varde.includes('fakturerat'))).toHaveLength(1);
    expect(txt(s.matt[1].varde)).toBe('414 m'); // mätt, men inte fakturerat
    // ... och raden påstår INTE att tillägget räknas på den.
    expect(s.matt[1].under).not.toContain('räknas tillägget på');
    // Källan står på sidan, inte bara i en funktion ingen anropar.
    expect(s.kalla).toContain('satt för hand');
    expect(s.saMatt[0].text).toContain('Satt för hand');
  });

  it('MÄTT: källmeningen står på sidan även där', () => {
    const s = skotningsrapport(SKALVIKEN);
    expect(txt(s.kalla)).toContain('70 av 85 lass');
    expect(s.matt.filter(r => r.varde.includes('fakturerat'))).toHaveLength(1);
  });

  it('en trakt utan app-lass får inga mått, men behåller svaret och källan', () => {
    const s = skotningsrapport({ ...SKALVIKEN, cykel: null, lass: [], handsatt: true, avstandM: 450 });
    expect(s.matt).toEqual([]);
    expect(s.kalla).toContain('satt för hand');
    expect(s.kort[0].varde).toBe('450 m');
    // Täckningsstycket finns inte utan lass — ingen tom rubrik.
    expect(s.saMatt.map(x => x.rubrik)).not.toContain('Täckning');
  });

  it('utan kund står inget "till" i avsändaren, utan skotare ingen maskin i foten', () => {
    const s = skotningsrapport({
      ...SKALVIKEN,
      trakt: { ...SKALVIKEN.trakt, kund: null },
      skotare: [],
    });
    expect(s.avsandare).not.toContain('till');
    expect(s.not).toBe('Kompersmåla Skog AB.');
  });

  it('teckenförklaringen står i ord — färg är aldrig ensam bärare', () => {
    // Varje sak på kartan ska ha ett FORMORD, inte bara en färg: rapporten
    // skrivs ofta ut i svartvitt, och då är "röd" och "gul" samma gråton.
    // Traktgränsen är randig, körspåret ett band, avlägget en symbol.
    for (const form of ['randig', 'band', 'symbol']) expect(KARTA_FORKLARING).toContain(form);
    expect(KARTA_FORKLARING).toContain('Norr är uppåt');
    // Och den säger FÄRGERNA som faktiskt ritas: skördarens stråk lila,
    // skotarens körning turkos (2026-11-27). Stod det kvar "i vitt" — hyttens
    // mittlinje, som aldrig ritas vid den här utzoomningen — vore
    // teckenförklaringen en lögn, och då litar ingen på resten av rapporten
    // heller. Ritningen mäts i `skotningsrapportPdf.test.ts`.
    expect(KARTA_FORKLARING).toContain('lila');
    expect(KARTA_FORKLARING).toContain('turkos');
    expect(KARTA_FORKLARING).not.toContain('vitt');
  });
});

/**
 * Hänsynen och marken (Martin 2026-11-25: "hänsyner ska vara med och om det är
 * blött eller brant så dom förstå varför vi måste kört som vi gjort").
 *
 * Teckenförklaringen får bara nämna det som FAKTISKT ritas — appens regel från
 * "Vad betyder kartan". En förklaring till något som inte står på papperet
 * läses som att vi glömt det.
 */
describe('kartforklaring — bara det som ritas', () => {
  it('utan hänsyn och mark är det bara grundraden', () => {
    expect(kartforklaring()).toBe(KARTA_FORKLARING);
    expect(kartforklaring({ zoner: [], mark: [] })).toBe(KARTA_FORKLARING);
  });

  it('hänsynen nämns med sitt namn, en gång, utan att snedstreckningen förklaras', () => {
    const s = kartforklaring({ zoner: ['protected', 'protected'], mark: [] });
    expect(s).toContain('Ytor vi inte kört i: hänsyn.');
    expect(s.match(/hänsyn/g)).toHaveLength(1);
  });

  it('flera sorters ytor blir "a, b och c" — aldrig en kommalista', () => {
    const s = kartforklaring({ zoner: ['protected', 'fornlamning', 'wet'], mark: [] });
    expect(s).toMatch(/Ytor vi inte kört i: .+, .+ och .+\./);
  });

  it('MÖNSTRET står i orden: blått vågrätt, rött snedstreckat', () => {
    const blott = kartforklaring({ zoner: [], mark: ['fuktigt', 'blott'] });
    expect(blott).toContain('Fuktig mark och blöt mark i blå vågräta streck');
    expect(blott).toContain('Skogsstyrelsens och SLU:s kartor');
    const brant = kartforklaring({ zoner: [], mark: ['brant'] });
    expect(brant).toContain('Brant i röda snedstreck');
    const bada = kartforklaring({ zoner: [], mark: ['blott', 'mycket_brant'] });
    expect(bada).toContain('blå vågräta streck');
    expect(bada).toContain('röda snedstreck');
  });

  it('meningen börjar med stor bokstav — listan gemenar, men inte först', () => {
    const s = kartforklaring({ zoner: [], mark: ['blott'] });
    const efterGrund = s.slice(KARTA_FORKLARING.length).trim();
    expect(efterGrund[0]).toBe(efterGrund[0].toUpperCase());
  });

  it('SÄGER ALDRIG vad skotaren gjorde åt marken — det har vi inte mätt', () => {
    const s = kartforklaring({ zoner: ['protected'], mark: ['blott', 'brant'] });
    expect(s).not.toMatch(/körde (skotaren )?runt|undvek|valde/i);
  });
});

describe('FACIT: rapporten säger samma tal som fakturan', () => {
  it('Skälviken: 414 m, 12 kr/m³fub, 20 956 kr', () => {
    const text = txt(JSON.stringify(skotningsrapport(SKALVIKEN)))!;
    expect(text).toContain('414 m');
    expect(text).toContain('20 956 kr');
    expect(text).toContain('12,00 kr');
    expect(text).toContain('per m³fub');
    // Och halva cykeln står som jämförelse, inte som pris.
    expect(text).toContain('739 m');
    expect(text).not.toContain('41 9');
  });
});
