import { describe, expect, it } from 'vitest';
import { byggEgenkontroll, certLage, saknarKommentar, type Fakta, type Svar, type VidaFraga } from './vidaEgenkontroll';

// Vidas mallar ur prod 2026-11-10 (objekt.checklist_items). "!" = alternativet larmar.
const q = (sektion: string, fraga: string, ...a: string[]): VidaFraga => ({ sektion, fraga, svarsalternativ: a.map((t) => ({ text: t.replace(/!$/, ''), larmar: t.endsWith('!') })) });
const HT = ['Hänsyn tagen', 'Avvikelse!', 'Ej aktuell'];
const CERT = ['FSC/PEFC', 'PEFC', 'Avvikelse!', 'Ej aktuell'];
const EDESTAD: VidaFraga[] = [
  q('5 Avverkningsplanering', 'Fanns samtliga trakthandlingar för att utföra arbetet på ett korrekt och säkert sätt?', 'Ja', 'Nej!'),
  q('5 Avverkningsplanering', 'Var beståndsgränser och nödvändig hänsyn utmärkt i fält?', 'Ja', 'Nej!'),
  q('1 Träd och trädsamlingar', 'Sparade naturvärdesträd enligt krav?', 'Ja', 'Nej', 'Skotare'),
  q('1 Träd och trädsamlingar', 'Sparade utvecklingsträd enligt krav?', ...CERT),
  q('1 Träd och trädsamlingar', 'Grova toppar lämnade? (Endast FSC)', ...HT),
  q('2 kantzoner', 'Funktionell kantzon lämnad mot sjö/vattendrag?', ...HT),
  q('2 kantzoner', 'Funktionell kantzon lämnad mot skogligt impediment?', ...HT),
  q('2 kantzoner', 'Funktionell kantzon lämnad mot jordbruksmark/ övrig mark?', ...HT),
  q('2 kantzoner', 'Hänsynskrävande biotoper lämnade orörda och utan skador?', ...HT),
  q('3 Hänsyn till Kultur/ Fornminne', 'Är alla kultur och fornlämningar lämnade oskadade?', ...HT),
  q('3 Hänsyn till Kultur/ Fornminne', 'Är kulturstubbar ställda runt kultur och fornminnen, där det är lämpligt?', ...HT),
  q('3 Hänsyn till Kultur/ Fornminne', 'Upptäcktes ej registrerade lämningar?', 'Ja', 'Nej'),
  q('4 Grot', 'Grotanpassad Avverkning?', 'Ja', 'Nej'),
  q('4 Grot', 'Finns grot kvar att skota ut?', 'Ja', 'Nej', 'Groten är utskotad'),
  q('99Slutresultat', 'Är trakten avverkad utan körskador?', 'Ja', 'Nej!'),
  q('99Slutresultat', 'Har anpassningar gjorts för att undvika körskador?', 'Ja', 'Nej'),
  q('99Slutresultat', 'Har bro samt risning använts vid passage över vatten?', ...HT),
  q('99Slutresultat', 'Är kraven för certifiering uppfyllda?', ...CERT),
  q('99Slutresultat', 'Uppfyller avverkningen Vidas krav?', 'Ja', 'Nej!'),
  q('99Slutresultat', 'Övriga kommentarer?'),
  q('Övrigt', 'Övrigt'),
  q('99Slutresultat', 'Lever åtgärden upp till Vidas krav?', 'Ja', 'Nej!'),
];
const FAKTA: Fakta = { cert: 'FSC PEFC', grot: true, evighetstrad: 21, evighetstradKrav: 21 };

const allaOk = (e: NonNullable<ReturnType<typeof byggEgenkontroll>>): Record<string, Svar> =>
  Object.fromEntries([...e.skordare, ...e.skotare].map((f) => [f.nyckel, { varde: 'ok' }]));

describe('certLage', () => {
  it('läser traktens cert', () => {
    expect(certLage('FSC PEFC')).toBe('fsc_pefc');
    expect(certLage('PEFC')).toBe('pefc');
    expect(certLage('FSC')).toBe('fsc');
    expect(certLage('Ej certifierad')).toBe('ingen');
    expect(certLage('None')).toBe('ingen');
    expect(certLage('Not known')).toBe('okand');
    expect(certLage(null)).toBe('okand');
  });
});

describe('Edestad (slutavverkning, FSC PEFC, GROT)', () => {
  const e = byggEgenkontroll(EDESTAD, FAKTA, {})!;

  it('skördaren får 7 frågor, skotaren 4', () => {
    expect(e.skordare.map((f) => f.text)).toEqual([
      'Var gränser och hänsyn utmärkta i skogen?', 'Sparade du utvecklingsträd?', 'Lämnade du grova toppar?',
      'Lämnade du kantzon mot vatten, åker och myr?', 'Är hänsynsytor och fornlämningar orörda?', 'Ställde du kulturstubbar vid fornlämningarna?',
      'Hittade du en lämning som inte fanns på kartan?',
    ]);
    expect(e.skotare.map((f) => f.text)).toEqual(['Är all grot utskotad?', 'Blev det några körskador?', 'Körde du runt eller risade där det var blött?', 'Användes bro och ris över vattnet?']);
  });

  it('appen svarar bara på det den vet: handlingar, naturvärdesträd (räknade mot kravet), grotanpassad', () => {
    expect(e.appen.map((a) => [a.fraga.split(' ')[0], a.svar])).toEqual([['Fanns', 'Ja'], ['Sparade', 'Ja'], ['Grotanpassad', 'Ja']]);
    expect(e.appen[1].varifran).toBe('21 evighetsträd satta · kravet är 21');
  });

  it('för få evighetsträd satta → föraren får frågan, appen svarar aldrig Nej', () => {
    const f = byggEgenkontroll(EDESTAD, { ...FAKTA, evighetstrad: 5 }, {})!;
    expect(f.skordare.some((x) => x.text === 'Sparade du naturvärdesträd?')).toBe(true);
    expect(f.appen.some((a) => a.fraga.startsWith('Sparade naturvärdes'))).toBe(false);
  });

  it('Vidas hela formulär byggs med Vidas egna alternativ och rätt cert', () => {
    const r = byggEgenkontroll(EDESTAD, FAKTA, allaOk(e))!.rapport;
    const svar = Object.fromEntries(r.map((x) => [x.fraga, x.svar]));
    expect(r).toHaveLength(22);
    expect(svar['Sparade utvecklingsträd enligt krav?']).toBe('FSC/PEFC');
    expect(svar['Funktionell kantzon lämnad mot skogligt impediment?']).toBe('Hänsyn tagen');
    expect(svar['Är alla kultur och fornlämningar lämnade oskadade?']).toBe('Hänsyn tagen');
    expect(svar['Upptäcktes ej registrerade lämningar?']).toBe('Nej');
    expect(svar['Finns grot kvar att skota ut?']).toBe('Groten är utskotad');
    expect(svar['Är trakten avverkad utan körskador?']).toBe('Ja');
    expect(svar['Är kraven för certifiering uppfyllda?']).toBe('FSC/PEFC');
    expect(svar['Uppfyller avverkningen Vidas krav?']).toBe('Ja');
    expect(svar['Lever åtgärden upp till Vidas krav?']).toBe('Ja');
    expect(r.filter((x) => x.avvikelse)).toHaveLength(0);
  });

  it('bara PEFC: ingen toppfråga, utvecklingsträd skrivs PEFC', () => {
    const p = byggEgenkontroll(EDESTAD, { ...FAKTA, cert: 'PEFC' }, {})!;
    expect(p.skordare.some((x) => x.nyckel === 'toppar')).toBe(false);
    const r = byggEgenkontroll(EDESTAD, { ...FAKTA, cert: 'PEFC' }, allaOk(p))!.rapport;
    expect(r.find((x) => x.fraga.startsWith('Grova toppar'))!.svar).toBe('Ej aktuell');
    expect(r.find((x) => x.fraga.startsWith('Sparade utvecklingsträd'))!.svar).toBe('PEFC');
    expect(r.find((x) => x.fraga.startsWith('Är kraven för certifiering'))!.svar).toBe('PEFC');
  });

  it('inte certifierad: inga cert-frågor, Ej aktuell', () => {
    const p = byggEgenkontroll(EDESTAD, { ...FAKTA, cert: 'Ej certifierad', evighetstradKrav: null }, {})!;
    expect(p.skordare.map((x) => x.nyckel)).not.toContain('utveckling');
    expect(p.skordare.map((x) => x.nyckel)).not.toContain('toppar');
    expect(p.skordare.map((x) => x.nyckel)).toContain('naturvarde');
  });

  it('en avvikelse kräver kommentar och slår igenom på Vidas slutfrågor', () => {
    const s = { ...allaOk(e), korskador: { varde: 'av', kommentar: 'Spår vid bäcken' } };
    const k = byggEgenkontroll(EDESTAD, FAKTA, s)!;
    expect(k.avvikelser).toBe(1);
    const svar = Object.fromEntries(k.rapport.map((x) => [x.fraga, x]));
    expect(svar['Är trakten avverkad utan körskador?'].svar).toBe('Nej');
    expect(svar['Är trakten avverkad utan körskador?'].avvikelse).toBe(true);
    expect(svar['Är kraven för certifiering uppfyllda?'].svar).toBe('Avvikelse');
    expect(svar['Uppfyller avverkningen Vidas krav?'].svar).toBe('Nej');
    expect(svar['Övriga kommentarer?'].svar).toContain('Spår vid bäcken');
    const korsk = k.skotare.find((f) => f.nyckel === 'korskador')!;
    expect(saknarKommentar(korsk, { varde: 'av' })).toBe(true);
    expect(saknarKommentar(korsk, { varde: 'av', kommentar: 'x' })).toBe(false);
    expect(saknarKommentar(korsk, { varde: 'ok' })).toBe(false);
  });

  it('slutfrågorna väntar tills alla förarfrågor är besvarade', () => {
    const r = byggEgenkontroll(EDESTAD, FAKTA, { grans: { varde: 'ok' } })!.rapport;
    expect(r.find((x) => x.fraga.startsWith('Uppfyller'))!.svar).toBeNull();
  });
});

describe('GROT-trakt (Sibbesson)', () => {
  const GROT: VidaFraga[] = [
    q('4 Grot', 'Vältan är täckt med papp', 'Ja', 'Nej'),
    q('4 Grot', 'Torrträd, naturvärdesträd och lågor sparade', ...HT),
    q('4 Grot', 'Hänsyn vid kultur eller fornlämning', ...HT, 'Hänsyn tagen', 'Avvikelse', 'Ej aktuell'),
    q('4 Grot', 'Antal Vältor'),
    q('FLISNING', 'Föroreningar i Groten?'),
    q('99Slutresultat', 'Lever åtgärden upp till Vidas krav?', 'Ja', 'Nej!'),
  ];
  const e = byggEgenkontroll(GROT, { cert: 'None', grot: true, evighetstrad: 0, evighetstradKrav: null }, {}, true)!;
  it('okända frågor går till skotaren med Vidas egna alternativ, utan dubbletter', () => {
    expect(e.skordare).toHaveLength(0);
    expect(e.skotare.map((f) => f.text)).toEqual(['Vältan är täckt med papp', 'Torrträd, naturvärdesträd och lågor sparade', 'Hänsyn vid kultur eller fornlämning']);
    expect(e.skotare[2].knappar.map((k) => k.text)).toEqual(['Hänsyn tagen', 'Avvikelse', 'Ej aktuell']);
  });
  it('fritext och flisning frågas inte', () => {
    expect(e.rapport.find((r) => r.fraga === 'Antal Vältor')!.kalla).toBe('ingen');
    expect(e.rapport.find((r) => r.fraga.startsWith('Föroreningar'))!.varifran).toBe('Görs av den som flisar');
  });
});

it('planeringens egna åtta frågor (inte Vidas mall) ger ingen egenkontroll', () => {
  expect(byggEgenkontroll([{ id: 'band', text: 'Behövs band?', answer: null }], FAKTA, {})).toBeNull();
  expect(byggEgenkontroll(null, FAKTA, {})).toBeNull();
});
