/**
 * Källvakter för notiserna i hytten: kopplingarna som inga beteendetester ser. Ändrar någon dem tyst ska det synas här.
 */
import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const las = (f: string) => fs.readFileSync(path.resolve(__dirname, '../..', f), 'utf8');
/** Källtext utan kommentarer — vakterna ska titta på koden, inte på förklaringarna. */
const kod = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const sida = las('app/planering/page.tsx');
const notiser = las('lib/hytt/notiser.ts');
const visa = las('lib/hytt/notisVisa.ts');
const sw = las('public/sw.js');
const flush = las('app/api/notis/flush/route.ts');
const hook = las('lib/hooks/useHyttNotiser.ts');
const kort = las('components/planering/HyttNotiserKort.tsx');

describe('kopplingen i planeringsvyn', () => {
  it('notiserna körs bara i maskinläget OCH när enhetsbrytaren är på', () => {
    expect(sida).toMatch(/useHyttNotiser\(\{\s*aktiv: instruktionerAktiv && hyttNotiserPa,/);
  });
  it('besöken läses i bakgrunden bara när brytaren är på', () => {
    expect(sida).toMatch(/bakgrund: hyttNotiserPa,/);
  });
  it('matas bara med fara (Röd), besök som maskinen inte kvitterat och väntande områdeskort — aldrig med info', () => {
    expect(sida).toContain('fara: farorUrLarm(larm.kort, larm.fler)');
    expect(sida).toContain('besok: besokHytt.vantar');
    expect(sida).toContain('omrade: omradeUrKort(inst.vantandeKort)');
  });
  it('kortet i Inställningar visas bara på maskindatorn (Web Serial), som GPS-källa-kortet', () => {
    expect(sida).toContain('{webSerialStott && <HyttNotiserKort />}');
  });
});

describe('notisens innehåll', () => {
  it('ingen personuppgift i en notis: inget telefonnummer, ingen förare, inga id utöver det service workern behöver', () => {
    expect(kod(notiser)).not.toMatch(/telefon|forare|förare/i);
  });
  it('notisen visas av service workern (bara så får den knappar) och bär data.hytt så andra notiser aldrig stängs', () => {
    expect(visa).toContain('reg.showNotification');
    expect(visa).toContain('if (!d?.hytt) continue;');
  });
  it('bara tre sorter ger notis i appens logik: fara, besök, område (+ test)', () => {
    expect(notiser).toContain("export type NotisTyp = 'fara' | 'besok' | 'omrade' | 'test';");
  });
  it('ordningen är område, besök, fara: den senast skapade hamnar överst i Windows', () => {
    expect(notiser).toContain("const RANG: Record<NotisTyp, number> = { omrade: 0, besok: 1, fara: 2, test: 3 };");
  });
});

describe('service workern', () => {
  it('Uppfattat i notisen kvitterar mot SAMMA serverrutt som kortet i hytten', () => {
    expect(sw).toContain("const HYTT_KVITTERA = '/api/besok/hytt/kvittera';");
    expect(las('lib/hooks/useBesokHytt.ts')).toContain("'/api/besok/hytt/kvittera'");
  });
  it('workern skickar aldrig roll, förare eller tid — servern avgör', () => {
    const delen = kod(sw.slice(sw.indexOf('async function hyttUppfattat'), sw.indexOf("self.addEventListener('notificationclick'")));
    expect(delen).not.toMatch(/\broll\b|forare|kvitterad_at/);
    expect(delen).toContain('besok_id: data.besokId, maskin_id: data.maskinId');
  });
});

describe('servern: maskinen har inte sett besöket', () => {
  it('flush köar och skickar typen, och byggs färskt', () => {
    expect(flush).toContain('koaBesokEjSett(supabase)');
    expect(flush).toContain('arBesokEjSett(n.typ)');
    expect(flush).toContain('byggEjSettNotis(n, hamtaEjSett)');
  });
  it('besökssidan och pushen använder SAMMA regel för vilka maskiner som ska ha sett besöket', () => {
    expect(las('lib/besok/server.ts')).toContain('maskinerPaObjekt');
    expect(las('lib/besok/ejsett-ko.ts')).toContain('maskinerPaObjekt');
  });
  it('besökssidan läcker aldrig maskin-id eller förare i raderna per maskin', () => {
    const s = las('lib/besok/server.ts');
    const rad = kod(s.slice(s.indexOf('export type PublikBesokMaskin'), s.indexOf('// ---- GET /api/besok/<token>')));
    const typen = rad.slice(0, rad.indexOf('export async function minAnmalan'));
    expect(typen).not.toMatch(/maskin_id|forare|maskinId/);
    // objektet som returneras bär bara etikett, roll och tid
    expect(rad).toContain('return { id: d.id, besokstid: d.besokstid, kvitteringar: kv, maskiner };');
  });
});

describe('hooken är ett tillägg', () => {
  it('alla anrop mot notisvisandet är skyddade av try/catch, så ett fel aldrig fäller larmet, besökskortet eller sidan', () => {
    expect(hook).toContain('catch { /* en notis som inte kunde visas får aldrig fälla något */ }');
  });
  it('brytaren är PÅ som standard på en maskin (enhet_maskin_id) och AV på övriga; ett uttryckligt val gäller före standarden; inget test krävs för att slå på den', () => {
    expect(kort).not.toContain('kanPa');
    expect(kort).not.toContain('disabled={!kanPa');
    const inst = las('lib/hytt/notisInstallning.ts');
    expect(inst).toContain('hamtaEnhetMaskin() != null');
    expect(inst).toContain("v === 'pa' || v === 'av'");
  });
});
