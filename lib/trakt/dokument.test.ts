import { describe, it, expect } from 'vitest';
import { klassificeraDokument, valjStamplingslangd } from './dokument';

const B = new Uint8Array(1);
const pdf = (namn: string) => ({ namn, bytes: B });

// Suffixmatchningen NFC-normaliserar en kopia av filnamnet (lib/trakt/dokument.ts, matchNamn). Prod 2026-10-20: de sju `_ÖK.pdf` som ligger som
// "PDF utan känt suffix" är ALLA redan NFC (U+00D6) och hör till avslutade objekt som importerades i augusti av en äldre importversion — dagens kod
// klassar dem rätt, vilket det här testet pinnar för båda kodningarna.
describe('klassificeraDokument — Ö i suffixet, NFC och NFD', () => {
  for (const [etikett, namn] of [['NFC (U+00D6)', '886981_ÖK.pdf'], ['NFD (O + U+0308)', '886981_ÖK.pdf']] as const) {
    it(`_ÖK.pdf som ${etikett} blir översiktskarta, inte "PDF utan känt suffix"`, () => {
      const k = klassificeraDokument([pdf(namn)]);
      expect(k.oversiktskarta?.namn).toBe(namn); // originalnamnet bevaras oförändrat
      expect(k.ovriga).toHaveLength(0);
      expect(k.varningar).toEqual([]);
    });
  }

  it('_TK och _TD matchas, flera blad sorteras på numret', () => {
    const k = klassificeraDokument([pdf('883966_02_TK.pdf'), pdf('883966_01_TK.pdf'), pdf('883966_TD.pdf')]);
    expect(k.traktkartor.map(b => b.ordning)).toEqual([1, 2]);
    expect(k.traktdirektiv?.namn).toBe('883966_TD.pdf');
  });

  it('en okänd PDF lämnas i ovriga utan varning — varningarna skrivs av valjStamplingslangd, efter att rotposten är känd', () => {
    const a = klassificeraDokument([pdf('Mölleryd.pdf')]);
    expect(a.ovriga.map(o => o.namn)).toEqual(['Mölleryd.pdf']);
    expect(a.varningar).toEqual([]);
  });
});

// Vida märker ALDRIG stämplingslängden i filnamnet — den heter som trakten. Traktdirektiv, traktkarta och vältlapp har suffix och filas rätt
// varje gång, så paketet går jämnt ut: det som blir över ÄR stämplingslängden. Prod 2026-10-25, alla sex envz-rotposter hade TD + VÄLTLAPP och
// exakt en oidentifierad PDF; fem fick den filad, Mölleryd inte — bara för att dess <Info> råkade inte nämna ordet.
describe('valjStamplingslangd — strukturen avgör på en rotpost', () => {
  const utan = (namn: string[]) => ({ stamplingslangd: null, ovriga: namn.map(pdf) });

  it('rotpost med EN oidentifierad PDF: den ÄR stämplingslängden — ingen gissning, ingen varning (Mölleryd)', () => {
    const v = valjStamplingslangd({ ...utan(['Mölleryd.pdf']), rotpost: true });
    expect(v.stamplingslangd?.namn).toBe('Mölleryd.pdf');
    expect(v.kalla).toBe('rotpost');
    expect(v.ovriga).toEqual([]);
    expect(v.varningar).toEqual([]);
  });

  it('Info behövs inte längre: samma utfall med och utan den', () => {
    for (const info of [null, 'Se bifogad stämplingslängd']) {
      const v = valjStamplingslangd({ ...utan(['Skälviken.pdf']), rotpost: true, info });
      expect(v.kalla, String(info)).toBe('rotpost');
      expect(v.varningar, String(info)).toEqual([]);
    }
  });

  it('inte en rotpost: Info-regeln ligger kvar som reserv, och då är raden fortfarande OSÄKER', () => {
    const v = valjStamplingslangd({ ...utan(['Skälviken.pdf']), rotpost: false, info: 'Se bifogad stämplingslängd' });
    expect(v.kalla).toBe('info');
    expect(v.varningar[0]).toMatch(/OSÄKER/);
    expect(valjStamplingslangd({ ...utan(['Skälviken.pdf']), rotpost: false }).stamplingslangd).toBeNull();
  });

  it('flera oidentifierade PDF:er: gissar inte, alla sparas som övrigt', () => {
    const v = valjStamplingslangd({ ...utan(['odensssvalahult gall.pdf', 'odenssvalahultga.pdf']), rotpost: true });
    expect(v.stamplingslangd).toBeNull();
    expect(v.ovriga).toHaveLength(2);
    expect(v.varningar[0]).toMatch(/gissar inte/);
    expect(v.varningar.filter(x => /utan känt suffix/.test(x))).toHaveLength(2);
  });

  it('rotpost utan någon oidentifierad PDF: ett larm med innehåll, inte en fråga om en fil', () => {
    const v = valjStamplingslangd({ stamplingslangd: null, ovriga: [], rotpost: true });
    expect(v.varningar).toEqual(['Rotpost utan stämplingslängd: ingen PDF i leveransen gick att identifiera som en.']);
    expect(valjStamplingslangd({ stamplingslangd: null, ovriga: [], rotpost: false }).varningar).toEqual([]);
  });

  it('ett känt suffix vinner alltid över strukturen', () => {
    const v = valjStamplingslangd({ stamplingslangd: pdf('886465_stamplingslangd.pdf'), ovriga: [pdf('annan.pdf')], rotpost: true });
    expect(v.kalla).toBe('suffix');
    expect(v.stamplingslangd?.namn).toBe('886465_stamplingslangd.pdf');
    expect(v.ovriga.map(o => o.namn)).toEqual(['annan.pdf']);
  });
});
