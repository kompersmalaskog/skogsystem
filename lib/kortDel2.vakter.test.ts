// Vakter för Kortet del 2 (2026-10-21): sidans koppling till kortet. Beteendet prövas i KartKort.del2.render.test.tsx och TraktAnalysRad.render.test.tsx — här bara
// det som bor i app/planering/page.tsx (för stor att rendera): planeringsknappar bara i planeringsläget, grindkoden låst i maskinen, ikonraden borta, Vidas text som kommentar.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { byggTraktKort } from './traktGeometri';

const sida = readFileSync(join(process.cwd(), 'app/planering/page.tsx'), 'utf8');
const traktKort = sida.slice(sida.indexOf('const bet = traktKortBetydelse(traktInfo)'), sida.indexOf('{larmPopupOpen && ('));
const markerKort = sida.slice(sida.indexOf('{markerMenuOpen && (() => {'), sida.indexOf('{/* === REDIGERA-DIALOG === */}'));

describe('Kortet del 2 — planeringsläge mot maskinläge', () => {
  it('"Beräkna volym" och "Justera gräns" (och Redigera hörn, Radera, Nummer) finns bara bakom planeringsläget (objektListaVal = inte maskinläge, inte körvy, inte testläge)', () => {
    expect(sida).toMatch(/const objektListaVal = anvandObjektLista\(\{ maskinlage, maskinSom: !!maskinSomParam, korvyActive \}\)/);
    const volym = traktKort.indexOf('trakt-kort-berakna-volym');
    const grupp = traktKort.lastIndexOf('{objektListaVal && (\n                        <KortAtgarder>', volym);
    expect(volym).toBeGreaterThan(-1);
    expect(grupp).toBeGreaterThan(-1);
    for (const id of ['trakt-kort-justera-gran', 'trakt-kort-redigera-horn', 'trakt-kort-radera']) expect(traktKort.indexOf(id), id).toBeGreaterThan(grupp);
    // Nummerredigeringen likaså.
    expect(traktKort).toMatch(/\{objektListaVal && boundaryId != null && isAdminRiktig && objektNumrering\.visaGransNummer/);
  });
  it('"Numrera om basvägar" är en global planeringsåtgärd: bara i planeringsläget', () => {
    expect(markerKort).toMatch(/\{objektListaVal && marker\.isLine && marker\.lineType === 'mainRoad' && \(\s*<KortKnapp testid="marker-kort-numrera-om"/);
  });
  it('grindkoden är skrivskyddad i maskinläget (readOnly, onChange ändrar inget) och koden frågas bara efter i planeringsläget', () => {
    expect(markerKort).toMatch(/readOnly=\{!objektListaVal\}/);
    expect(markerKort).toMatch(/if \(!objektListaVal\) return;\s*const v = rensaGrindKod/);
    expect(sida).toMatch(/if \(objektListaVal && typ === GRIND_TYP\) setKodPrompt\(String\(id\)\)/);
  });
});

describe('Kortet del 2 — linjekortet', () => {
  it('den gamla ikonraden (runda 48 px-knappar med +, penna, droppe, papperskorg) är borta; åtgärderna är ord via KortKnapp', () => {
    expect(markerKort).not.toContain('M12 20h9M16.5 3.5a2.12');          // pennan
    expect(markerKort).not.toContain('M3 6h18M19 6v14a2 2 0 01-2 2H7');   // papperskorgen
    expect(markerKort).not.toContain('M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0');   // droppen
    expect(markerKort).not.toMatch(/width: '48px',\s*height: '48px',\s*borderRadius: '24px'/);
    for (const id of ['marker-kort-forlang', 'marker-kort-risa', 'marker-kort-numrera-om', 'marker-kort-ta-bort']) expect(markerKort, id).toContain(id);
  });
});

describe('Kortet del 2 — Vidas text är kommentaren', () => {
  it('båda korten skickar Vidas text till kortet; hänsynsytans ATGARD når kortet som vidaKommentar, inte som en lös textrad', () => {
    expect(traktKort).toContain("vidaKommentar={traktInfo.kategori === 'punkt' ? undefined : traktInfo.vidaKommentar}");   // avlägg: Vidas ATGARD är ett namn (visas i namnraden), aldrig en kommentar
    // Hänsynsytan/Övrigt: kortet byggs av byggTraktKort (Vidas ATGARD som vidaKommentar, namnet som kartans etikett) och sidan lägger bara på källan "Vida".
    expect(sida).toContain("kort = { ...kort, kalla: 'Vida', nr: '' };");
  });
  it('byggTraktKort: ATGARD på hänsynsyta och avlägg är Vidas kommentar; traktdelens FLBESKR ("Första gallring") är åtgärden, ingen kommentar', () => {
    expect(byggTraktKort({ _lager: 'L_TILLAGGSYTOR', _typ: 'hansyn', LOPNR: '3', FLBESKR: 'Övrigt', ATGARD: 'avverkning av frötallar.\r\nLämn kantzon mot sjön.' }).vidaKommentar).toBe('avverkning av frötallar.\r\nLämn kantzon mot sjön.');
    expect(byggTraktKort({ _lager: 'L_TILLAGGSPUNKTER', _typ: 'punkt', EXTRA_LABE: '01-1', FLBESKR: 'Virkesavlägg', ATGARD: 'skbv n ekamålavägen' }).vidaKommentar).toBe('skbv n ekamålavägen');
    const td = byggTraktKort({ _lager: 'L_TRAKTDEL', _typ: 'traktdel', TRDEL_NR_K: '0526', FLBESKR: 'Första gallring' });
    expect(td.vidaKommentar).toBeUndefined();
    expect(td.rader).toEqual([{ text: 'Första gallring' }]);   // åtgärdens namn är en textrad (som förut), inte en "Vida · traktdirektiv"-kommentar
    expect(byggTraktKort({ _lager: 'L_TILLAGGSYTOR', _typ: 'hansyn', LOPNR: '1', FLBESKR: 'Kant mot vatten O' }).vidaKommentar).toBeUndefined();
  });
});
