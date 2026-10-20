import { describe, expect, it } from 'vitest';
import { kravKundRuta, lassForslagText, lassKmText, lassMaskinText, lassPlatsNot, lassRuttText, lassSamtidigaRader, lassTidText, redanText, saknasForSvar, tolkaSvar, type LassRad } from './lass';
import { lasLassId } from './url';

const rad = (o: Partial<LassRad> = {}): LassRad => ({
  id: 'l1', status: 'vantar_maskin', status_orsak: 'sakerhet', fran_namn: 'Östra-Hoka 1:7', till_namn: 'Bågskyttebanan RP',
  lassning_tid: '2026-10-12T10:23:00Z', lossning_tid: '2026-10-12T11:46:00Z', km: 45.7,
  forslag_maskin_id: 'A130743', sakerhet: 'medel',
  kandidater: [
    { maskin_id: 'A130743', poang: 6, utesluten: false, skal: [{ kod: 'kedja_fran', dag: '2026-10-12', trakt: 'Östra-Hoka' }] },
    { maskin_id: 'PONS', poang: 0, utesluten: true, skal: [{ kod: 'foljer_inte', medianM: 7000 }] },
  ],
  bevis: { km_osaker: false }, kund: 'Vida', till_plats_id: null, besvarad_av: null, besvarad_tid: null, skapad_tid: '2026-10-12T12:00:00Z', ...o,
});

describe('texter', () => {
  it('rutten, tiden och sträckan', () => {
    expect(lassRuttText(rad())).toBe('Östra-Hoka 1:7 → Bågskyttebanan RP');
    expect(lassTidText(rad())).toBe('mån 12 okt · 12:23 → 13:46');
    expect(lassKmText(rad())).toBe('45,7 km');
  });
  it('sträckan är "cirka" när bilen inte stod stilla i båda ändar — och "saknas" när den inte går att räkna', () => {
    expect(lassKmText(rad({ bevis: { km_osaker: true } }))).toBe('cirka 45,7 km');
    expect(lassKmText(rad({ km: null }))).toBe('sträcka saknas');
  });
  it('förslaget: hur säkert + skälen; ingen förslagsmaskin = ingen rad', () => {
    expect(lassForslagText(rad())).toBe('Troligen · Skotade Östra-Hoka 12 okt');
    expect(lassForslagText(rad({ forslag_maskin_id: null, sakerhet: 'okand' }))).toBeNull();
  });
  it('en maskin som inte följde bilen säger det', () => {
    expect(lassMaskinText(rad(), 'PONS')).toBe('Följde inte bilen');
    expect(lassMaskinText(rad(), 'A130743')).toBe('Skotade Östra-Hoka 12 okt');
    expect(lassMaskinText(rad(), 'okänd')).toBeNull();
  });
  it('platsnoten bara när platsen är osäker eller flytten inte kunde skapas', () => {
    expect(lassPlatsNot(rad())).toBeNull();
    expect(lassPlatsNot(rad({ status_orsak: 'plats_osaker' }))).toContain('Platsen är osäker');
    expect(lassPlatsNot(rad({ bevis: { km_osaker: true } }))).toContain('Kontrollera Från, Till och sträckan');
    expect(lassPlatsNot(rad({ status_orsak: 'auto_misslyckades' }))).toContain('kunde inte skapas');
  });
  it('redan besvarat: vem och när', () => {
    expect(redanText({ status: 'auto_flytt', av: 'Joacim Ringberg', tid: '2026-10-14T10:40:00Z' })).toBe('Joacim svarade 12:40. Flytten ligger under Att godkänna.');
    expect(redanText({ status: 'auto_flytt', av: 'auto', tid: null })).toContain('skapades redan av sig själv');
    expect(redanText({ status: 'matchad_manuell', av: 'matchad', tid: null })).toContain('Föraren hade redan registrerat');
    expect(redanText({ status: 'avvisad', av: 'Martin Lindqvist', tid: '2026-10-14T10:40:00Z' })).toBe('Martin markerade det som ingen maskinflytt 12:40.');
  });
});

describe('vad som krävs för ett svar', () => {
  const v = (o: Partial<{ maskinId: string | null; extern: string; kund: string }> = {}) => ({ maskinId: null, extern: '', kund: '', ...o });
  it('kundruta: maskin som inte är vår alltid; egen maskin bara när flytten faktureras och traktens kund saknas', () => {
    expect(kravKundRuta(rad(), v({ extern: 'X' }))).toBe(true);
    expect(kravKundRuta(rad(), v({ maskinId: 'A130743' }))).toBe(false);                       // traktens kund finns
    expect(kravKundRuta(rad({ kund: null }), v({ maskinId: 'A130743' }))).toBe(true);           // 45,7 km faktureras, kund saknas
    expect(kravKundRuta(rad({ kund: null, km: 12 }), v({ maskinId: 'A130743' }))).toBe(false);  // under 30 km: ingen faktura
  });
  it('Skapa är grå tills allt krävs är ifyllt, och säger vad som saknas', () => {
    expect(saknasForSvar(rad(), v(), false)).toBe('Välj maskin');
    expect(saknasForSvar(rad(), v({ maskinId: 'A130743' }), false)).toBeNull();
    expect(saknasForSvar(rad({ kund: null }), v({ maskinId: 'A130743' }), false)).toBe('Välj kund — flytten faktureras');
    expect(saknasForSvar(rad({ kund: null }), v({ maskinId: 'A130743', kund: 'Vida' }), false)).toBeNull();
    expect(saknasForSvar(rad(), v({ extern: '' }), true)).toBe('Skriv maskinens namn');
    expect(saknasForSvar(rad(), v({ extern: 'Kunds Ponsse' }), true)).toBe('Välj kund — flytten faktureras');
    expect(saknasForSvar(rad(), v({ extern: 'Kunds Ponsse', kund: 'Anders' }), true)).toBeNull();
  });
});

describe('tolkaSvar — ett svar ser aldrig lyckat ut när det inte var det', () => {
  it('ok:true → klart', () => expect(tolkaSvar({ ok: true, flytt_id: 'f1' }, null)).toEqual({ typ: 'klart', flyttId: 'f1' }));
  it('redan besvarat → redan, med vem', () => {
    expect(tolkaSvar({ ok: false, redan: true, status: 'auto_flytt', av: 'Martin', tid: 't' }, null)).toEqual({ typ: 'redan', status: 'auto_flytt', av: 'Martin', tid: 't' });
  });
  it('databasfelet visas som det är', () => {
    expect(tolkaSvar(null, { message: 'Välj kund — flytten faktureras' })).toEqual({ typ: 'fel', fel: 'Välj kund — flytten faktureras' });
  });
  it('ok:false utan förklaring och tomt svar är fel, aldrig klart', () => {
    expect(tolkaSvar({ ok: false }, null).typ).toBe('fel');
    expect(tolkaSvar(null, null).typ).toBe('fel');
    expect(tolkaSvar({ skapad: false, orsak: 'finns_redan' }, null).typ).toBe('fel');
  });
});

describe('lasLassId — länken i notisen', () => {
  it('ett uuid går igenom', () => expect(lasLassId('?flik=nu&lass=11111111-1111-4111-8111-111111111111')).toBe('11111111-1111-4111-8111-111111111111'));
  it('skräp och tomt är som om det inte stod där', () => {
    expect(lasLassId('?lass=<script>')).toBeNull();
    expect(lasLassId('?lass=')).toBeNull();
    expect(lasLassId('')).toBeNull();
  });
});

describe('lassSamtidigaRader — "En flytt med X finns samma tid"', () => {
  const namn = (id: string) => ({ A030353: 'Wisent', R64428: 'H8E -23' } as Record<string, string>)[id] ?? null;
  const flytt = (o = {}) => ({ flytt_id: 'f1', maskin_id: 'R64428', extern_maskin: null, avbruten: false, skal: 'annan_plats' as const, ...o });
  it('en rad per flytt, med maskinens visningsnamn', () => {
    expect(lassSamtidigaRader(rad({ bevis: { flytt_samma_tid: [flytt(), flytt({ flytt_id: 'f2', maskin_id: 'A030353' })] } }), namn))
      .toEqual(['En flytt med H8E -23 finns samma tid', 'En flytt med Wisent finns samma tid']);
  });
  it('avbruten flytt säger det; maskin som inte är vår visar namnet den skrevs med; okänt namn blir "en maskin", aldrig ett maskin_id', () => {
    expect(lassSamtidigaRader(rad({ bevis: { flytt_samma_tid: [flytt({ avbruten: true, skal: 'avbruten' })] } }), namn)).toEqual(['En avbruten flytt med H8E -23 finns samma tid']);
    expect(lassSamtidigaRader(rad({ bevis: { flytt_samma_tid: [flytt({ maskin_id: null, extern_maskin: 'Ponsse X' })] } }), namn)).toEqual(['En flytt med Ponsse X finns samma tid']);
    expect(lassSamtidigaRader(rad({ bevis: { flytt_samma_tid: [flytt({ maskin_id: 'OKAND_1' })] } }), namn)).toEqual(['En flytt med en maskin finns samma tid']);
  });
  it('inget bevis, ingen lista eller skräp i jsonb-kolumnen → inga rader, ingen krasch', () => {
    expect(lassSamtidigaRader(rad({ bevis: null }), namn)).toEqual([]);
    expect(lassSamtidigaRader(rad({ bevis: { km_osaker: false } }), namn)).toEqual([]);
    expect(lassSamtidigaRader(rad({ bevis: { flytt_samma_tid: 'x' as any } }), namn)).toEqual([]);
    expect(lassSamtidigaRader(rad({ bevis: { flytt_samma_tid: [null, 5, {}] as any } }), namn)).toEqual([]);
  });
});
