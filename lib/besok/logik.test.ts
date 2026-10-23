import { describe, expect, it } from 'vitest';
import { arBesoksSida, arBesoksApi, arGiltigtToken, arOffentligBesokSokvag, besoksUrl } from './offentlig';
import { arMobil, besokSmsText, fastighetText, markagareFornamn, narOrd, smsNummer } from './sms';
import { arBesokAktivt, arKlockslag, arRimligBesokstid, besokstid, klockslag, kommerText, loggTid } from './tid';
import { HUVUDREGEL, SKOTARARK_TEXT, sakerhetsRader } from './sakerhet';
import { besokNamn } from './namn';
import { KLART_CA_FORKLARING, beraknaFramsteg, dagText, framstegText, hallandeTakt, plusArbetsdagar, takt, utforareText } from './framsteg';
import { byggBesokNotis, valjPaminnelser, type PaminnelseObjekt } from './paminnelse';
import { aktivaBesok, ejKvitterade, ringAktiv } from './hytt';
import { kvitteringsRader, harKvitterat, besokRubrik } from './status';
import { loggRader, smsLage, smsStatusText } from './planerare';
import { BESOK_RING_M, HYTT_RING_M } from './konstanter';

const TOKEN = 'a'.repeat(32) + 'B_-9';
// 2026-10-22 12:00 svensk tid (sommartid, UTC+2)
const NU = new Date('2026-10-22T10:00:00Z');

describe('öppna adresser: exakt besökssidan och dess tre rutter med lång token', () => {
  it('släpper igenom sidan och de tre rutterna', () => {
    expect(arBesoksSida(`/besok/${TOKEN}`)).toBe(true);
    expect(arBesoksApi(`/api/besok/${TOKEN}`)).toBe(true);
    expect(arBesoksApi(`/api/besok/${TOKEN}/anmal`)).toBe(true);
    expect(arBesoksApi(`/api/besok/${TOKEN}/karta`)).toBe(true);
    expect(arOffentligBesokSokvag(`/besok/${TOKEN}/`)).toBe(true);
  });
  it('släpper INTE igenom något annat', () => {
    for (const s of ['/besok', '/besok/', '/besok/kort', `/besok/${'a'.repeat(31)}`, `/besok/${TOKEN}/extra`, `/api/besok/${TOKEN}/lank`, `/api/besok/${TOKEN}/anmal/x`, `/api/besok`, '/api/objekt', '/planering', `/besok/${TOKEN}.json`, `/besok/${TOKEN}/../admin`, `/api/besok/${'x'.repeat(200)}`, `/besok/${TOKEN}%2e`])
      expect(arOffentligBesokSokvag(s), s).toBe(false);
  });
  it('token: minst 32 tecken, bara url-säkra', () => {
    expect(arGiltigtToken(TOKEN)).toBe(true);
    expect(arGiltigtToken('a'.repeat(31))).toBe(false);
    expect(arGiltigtToken('a'.repeat(31) + '.')).toBe(false);
    expect(arGiltigtToken(null)).toBe(false);
  });
  it('länken byggs på adressen appen körs på', () => { expect(besoksUrl('https://x.se/', 'T')).toBe('https://x.se/besok/T'); });
});

describe('SMS till markägaren', () => {
  const full = { markagare: 'Kerstin Olsson', fastighet: 'HÅLABÄCK 1:13', nar: 'i morgon', lank: 'https://x.se/besok/T', avsandareNamn: 'Martin Lindqvist', avsandareTelefon: '070-111 22 33' };
  it('texten är beställd ord för ord', () => {
    expect(besokSmsText(full)).toBe([
      'Hej Kerstin!',
      'Jag heter Martin och är från Kompersmåla Skog. Vi är entreprenör åt Vida och börjar avverka på din fastighet Hålabäck 1:13 i morgon.',
      '',
      'Här kan du följa arbetet och se var maskinerna är:',
      'https://x.se/besok/T',
      '',
      'Vill du komma ut? Anmäl dig i länken först, så får förarna veta att du kommer. Gå aldrig fram till en maskin som arbetar förrän föraren har sett dig och stannat.',
      '',
      'Hälsningar',
      'Martin, Kompersmåla Skog',
      '070-111 22 33',
    ].join('\n'));
  });
  it('saknas namn: "Hej!". Bolag och dödsbon får inget förnamn', () => {
    expect(besokSmsText({ ...full, markagare: null }).startsWith('Hej!\n')).toBe(true);
    expect(markagareFornamn('Johannishus Godsförvaltning Ab')).toBeNull();
    expect(markagareFornamn('Dödsbo efter Anna Svensson')).toBeNull();
    expect(markagareFornamn('ANDREAS ARVIDSSON')).toBe('Andreas');
    expect(markagareFornamn('Lars-Olof Larsson ')).toBe('Lars-Olof');
    expect(markagareFornamn('')).toBeNull();
  });
  it('saknas telefon hos avsändaren utelämnas raden — ingen tom rad och inget "undefined"', () => {
    const t = besokSmsText({ ...full, avsandareTelefon: null });
    expect(t.endsWith('Martin, Kompersmåla Skog')).toBe(true);
    expect(t).not.toMatch(/undefined|null/);
  });
  it('saknas fastighet: "i din skog" i stället för en tom plats', () => {
    expect(besokSmsText({ ...full, fastighet: null })).toContain('börjar avverka i din skog i morgon.');
    expect(fastighetText('  ')).toBeNull();
    expect(fastighetText('HÅLABÄCK 1:13')).toBe('Hålabäck 1:13');
  });
  it('i morgon / i dag / datum / snart', () => {
    expect(narOrd({ planeradStart: '2026-10-23', nu: NU })).toBe('i morgon');
    expect(narOrd({ planeradStart: '2026-10-22', nu: NU })).toBe('i dag');
    expect(narOrd({ planeradStart: '2026-10-26', nu: NU })).toBe('den 26 oktober');
    expect(narOrd({ planeradStart: '2026-10-23', status: 'pagaende', nu: NU })).toBe('i dag');   // maskinen har redan startat
    expect(narOrd({ planeradStart: null, pagaendeStartad: '2026-10-22T05:00:00Z', nu: NU })).toBe('i dag');
    expect(narOrd({ planeradStart: '2026-10-23', faktiskStart: '2026-10-22', nu: NU })).toBe('i dag');
    expect(narOrd({ planeradStart: null, nu: NU })).toBe('snart');
  });
});

describe('besökstiden (svensk tid)', () => {
  it('Nu / Om 1 h / klockslag idag', () => {
    expect(besokstid({ val: 'nu' }, NU)).toBe(NU.toISOString());
    expect(besokstid({ val: 'om1h' }, NU)).toBe('2026-10-22T11:00:00.000Z');
    expect(besokstid({ val: 'tid', tid: '14:30' }, NU)).toBe('2026-10-22T12:30:00.000Z');
    expect(klockslag('2026-10-22T12:30:00.000Z')).toBe('14:30');
  });
  it('ett klockslag som passerat med mer än 15 min betyder i morgon; inom 15 min är det i dag', () => {
    expect(besokstid({ val: 'tid', tid: '11:00' }, NU)).toBe('2026-10-23T09:00:00.000Z');
    expect(besokstid({ val: 'tid', tid: '11:50' }, NU)).toBe('2026-10-22T09:50:00.000Z');
  });
  it('ogiltigt klockslag → null', () => {
    expect(besokstid({ val: 'tid', tid: '25:00' }, NU)).toBeNull();
    expect(besokstid({ val: 'tid', tid: 'x' }, NU)).toBeNull();
    expect(arKlockslag('9:05')).toBe(true);
    expect(arKlockslag('24:00')).toBe(false);
  });
  it('rimlig tid: inte i det förflutna, inte mer än 36 h framåt', () => {
    expect(arRimligBesokstid(NU.toISOString(), NU)).toBe(true);
    expect(arRimligBesokstid('2026-10-22T09:00:00Z', NU)).toBe(false);
    expect(arRimligBesokstid('2026-10-24T01:00:00Z', NU)).toBe(false);
    expect(arRimligBesokstid('skräp', NU)).toBe(false);
  });
  it('aktivt till besökstid + 2 h', () => {
    expect(arBesokAktivt('2026-10-22T08:00:01Z', NU)).toBe(true);    // 1 h 59 min sedan
    expect(arBesokAktivt('2026-10-22T07:59:00Z', NU)).toBe(false);   // 2 h 1 min sedan
    expect(arBesokAktivt('2026-10-22T20:00:00Z', NU)).toBe(true);    // senare i kväll
  });
  it('hyttens text och loggens tid', () => {
    expect(kommerText('2026-10-22T12:30:00Z', NU)).toBe('kommer ca 14:30');
    expect(kommerText('2026-10-22T10:03:00Z', NU)).toBe('kommer nu');
    expect(loggTid('2026-10-22T12:30:00Z', NU)).toBe('14:30');
    expect(loggTid('2026-10-21T12:30:00Z', NU)).toBe('21 okt 14:30');
  });
});

describe('säkerhetsreglerna: huvudregel + högst tre rader, bara det som finns', () => {
  it('huvudregeln har tre steg och avståndet kommer ur konstanten', () => {
    expect(HUVUDREGEL.rubrik).toBe('Gå aldrig fram till en maskin');
    expect(HUVUDREGEL.steg).toHaveLength(3);
    expect(HUVUDREGEL.steg).toEqual([`Stanna minst ${BESOK_RING_M.skordare} m bort`, 'Vinka – vänta tills föraren stängt av', 'Ha reflexväst, håll barn och hund nära']);
  });
  it('rader i fast ordning, max tre', () => {
    const alla = sakerhetsRader({ roller: ['skordare', 'skotare'], harMotorsag: true });
    expect(alla.map((r) => r.id)).toEqual(['skotare', 'skordare', 'motorsag']);
    expect(alla.find((r) => r.id === 'skotare')!.text).toBe('Gå aldrig bakom skotaren eller mellan skotaren och virkeshögen');
    expect(alla.find((r) => r.id === 'skordare')!.text).toBe('Träd kan falla åt alla håll');
    expect(alla.find((r) => r.id === 'motorsag')!.text).toBe('Någon fäller med motorsåg här');
  });
  it('bara det som finns på trakten; bara skotaren öppnar ett ark', () => {
    expect(sakerhetsRader({ roller: ['skordare'], harMotorsag: false }).map((r) => r.id)).toEqual(['skordare']);
    expect(sakerhetsRader({ roller: [], harMotorsag: false })).toEqual([]);
    expect(sakerhetsRader({ roller: ['skordare', 'skotare'], harMotorsag: true }).filter((r) => r.ark).map((r) => r.id)).toEqual(['skotare']);
  });
  it('arkets enda text', () => { expect(SKOTARARK_TEXT).toBe('När skotaren backar med lass ser föraren ingenting bakom sig.'); });
  it('ringarna: 70 / 20 / 40 m — och hyttens ring 70 m', () => {
    expect(BESOK_RING_M).toEqual({ skordare: 70, skotare: 20, motorsag: 40 });
    expect(HYTT_RING_M).toBe(70);
  });
});

describe('framsteg: "62 % klart · klart ca fredag"', () => {
  // Fem stabila dagar (mån 19 – tors 22 okt + ons 14 → vi tar de fem senaste), senaste igår/idag.
  const fem = (m3: number, slut = '2026-10-22') => {
    const d = new Date(slut + 'T12:00:00Z');
    return Array.from({ length: 5 }, (_, k) => { const x = new Date(d); x.setUTCDate(d.getUTCDate() - k); return { datum: x.toISOString().slice(0, 10), m3 }; });
  };
  it('alla delar har fem stabila färska dagar: dagen sägs (den senare av skördning och skotning)', () => {
    const f = beraknaFramsteg({ planeradM3: 1000, skordatM3: 500, skotatM3: 100, skordatPerDag: fem(250), skotatPerDag: fem(100), idag: '2026-10-22' });
    expect(f.procent).toBe(30);
    expect(f.klartCa).toBe('den 4 november');   // 900 m³ kvar i 100 m³/dag = 9 arbetsdagar från torsdag 22 okt
    expect(framstegText(f)).toBe('30 % klart · klart ca den 4 november');
  });
  it('skotningens takt saknas (inga lass än) = ingen dag — ingen antagen eftersläpning', () => {
    const f = beraknaFramsteg({ planeradM3: 1000, skordatM3: 500, skotatM3: 0, skordatPerDag: fem(250), skotatPerDag: [], idag: '2026-10-22' });
    expect(f).toEqual({ procent: 25, klartCa: null });
    expect(framstegText(f)).toBe('25 % klart');
  });
  it('färre än fem dagar = ingen dag (två räckte förut)', () => {
    const fyra = fem(250).slice(0, 4);
    expect(beraknaFramsteg({ planeradM3: 1000, skordatM3: 500, skotatM3: 1000, skordatPerDag: fyra, skotatPerDag: [], idag: '2026-10-22' })).toEqual({ procent: 75, klartCa: null });
    expect(hallandeTakt(fyra, '2026-10-22')).toBeNull();
    expect(hallandeTakt(fem(250), '2026-10-22')).toBe(250);
  });
  it('ostadig takt = ingen dag: en dag långt från snittet fäller prognosen, gränsen ±50 % håller', () => {
    const ostadig = fem(100); ostadig[2] = { ...ostadig[2], m3: 10 };   // snitt 82 → 10 ligger 88 % under
    expect(hallandeTakt(ostadig, '2026-10-22')).toBeNull();
    const gransfall = fem(100); gransfall[0] = { ...gransfall[0], m3: 150 }; gransfall[1] = { ...gransfall[1], m3: 50 };   // snitt 100, ±50 exakt
    expect(hallandeTakt(gransfall, '2026-10-22')).toBe(100);
    const lite = fem(100); lite[0] = { ...lite[0], m3: 400 };   // snitt 160 → 400 är 150 % över
    expect(hallandeTakt(lite, '2026-10-22')).toBeNull();
  });
  it('maskinen har stått still: senaste dagen äldre än tre dagar = ingen dag', () => {
    expect(hallandeTakt(fem(100, '2026-10-19'), '2026-10-22')).toBe(100);   // 3 dygn gammal: håller
    expect(hallandeTakt(fem(100, '2026-10-18'), '2026-10-22')).toBeNull();  // 4 dygn: håller inte
    expect(beraknaFramsteg({ planeradM3: 1000, skordatM3: 500, skotatM3: 1000, skordatPerDag: fem(100, '2026-10-10'), skotatPerDag: [], idag: '2026-10-22' }).klartCa).toBeNull();
  });
  it('för långt fram (mer än 15 arbetsdagar) = ingen dag', () => {
    const f = beraknaFramsteg({ planeradM3: 4000, skordatM3: 1000, skotatM3: 4000, skordatPerDag: fem(100), skotatPerDag: [], idag: '2026-10-22' });   // 3000 kvar i 100/dag = 30 dagar
    expect(f.klartCa).toBeNull();
    const nara = beraknaFramsteg({ planeradM3: 2500, skordatM3: 1000, skotatM3: 2500, skordatPerDag: fem(100), skotatPerDag: [], idag: '2026-10-22' });   // 1500 kvar = 15 dagar
    expect(nara.klartCa).not.toBeNull();
  });
  it('skördat klart men skotningen kvar: bara skotningens takt räknas (skördningens saknas utan att det spelar roll)', () => {
    const f = beraknaFramsteg({ planeradM3: 1000, skordatM3: 1000, skotatM3: 500, skordatPerDag: [], skotatPerDag: fem(100), idag: '2026-10-22' });
    expect(f.klartCa).toBe('den 29 oktober');   // 500 kvar i 100/dag = 5 arbetsdagar från torsdag 22 okt
  });
  it('förklaringen säger vad dagen bygger på', () => {
    expect(KLART_CA_FORKLARING).toContain('senaste 5 dagarna');
  });
  it('ingen takt (färre än två dagar): takt() är null', () => {
    expect(takt([{ datum: '2026-10-22', m3: 250 }])).toBeNull();
  });
  it('allt klart: 100 % och ingen dag. Volym saknas: ingenting', () => {
    expect(beraknaFramsteg({ planeradM3: 1000, skordatM3: 1200, skotatM3: 1100, skordatPerDag: fem(250), skotatPerDag: fem(250), idag: '2026-10-22' })).toEqual({ procent: 100, klartCa: null });
    expect(beraknaFramsteg({ planeradM3: null, skordatM3: 5, skotatM3: 0, skordatPerDag: fem(250), skotatPerDag: [], idag: '2026-10-22' })).toEqual({ procent: null, klartCa: null });
    expect(framstegText({ procent: null, klartCa: null })).toBeNull();
  });
  it('arbetsdagar hoppar över helgen', () => {
    expect(plusArbetsdagar('2026-10-23', 1)).toBe('2026-10-26');
    expect(plusArbetsdagar('2026-10-24', 0)).toBe('2026-10-26');
    expect(dagText('2026-10-26', '2026-10-23')).toBe('måndag');
    expect(dagText('2026-11-05', '2026-10-22')).toBe('den 5 november');
  });
  it('utförare', () => {
    expect(utforareText('Vida')).toBe('Kompersmåla Skog åt Vida');
    expect(utforareText('Vida Energi')).toBe('Kompersmåla Skog åt Vida');
    expect(utforareText('Privat')).toBe('Kompersmåla Skog');
    expect(utforareText(null)).toBe('Kompersmåla Skog');
  });
});

describe('påminnelsen till planeraren', () => {
  const o = (id: string, extra: Partial<PaminnelseObjekt> = {}): PaminnelseObjekt => ({ id, namn: `Trakt ${id}`, status: 'planerad', planerad_start: null, pagaende_startad_timestamp: null, ...extra });
  it('dagen före planerad start, eller när första maskinen startar utan planerad start', () => {
    const k = valjPaminnelser([
      o('A', { planerad_start: '2026-10-23' }),
      o('B', { status: 'pagaende', pagaende_startad_timestamp: '2026-10-22T05:00:00Z' }),
      o('C', { status: 'pagaende', planerad_start: '2026-11-01', pagaende_startad_timestamp: '2026-10-22T05:00:00Z' }),   // har planerad start → bara den räknas
      o('D', { planerad_start: '2026-10-23' }),
      o('E', { status: 'avslutat', planerad_start: '2026-10-23' }),
      o('F', { planerad_start: '2026-10-24' }),
      o('G', { status: 'pagaende', pagaende_startad_timestamp: '2026-10-20T05:00:00Z' }),   // startade för två dagar sedan
    ], new Set(['D']), NU);
    expect(k.map((x) => [x.objektId, x.nar])).toEqual([['A', 'i morgon'], ['B', 'i dag']]);
    expect(k[0].nyckel).toBe('besok:A:plan:2026-10-23');
  });
  const hamta = (rad: any, fel?: string) => async () => ({ rad, fel });
  const n = { typ: 'besok_paminnelse', payload: { objekt_id: 'A', nar: 'i morgon' }, skapad_at: new Date(NU.getTime() - 60000).toISOString() };
  it('texten byggs färskt: "<Trakt> startar i morgon" + "Skicka till markägaren?" och länken öppnar kortet', async () => {
    const u = await byggBesokNotis(n, hamta({ id: 'A', namn: 'Hålabäck', status: 'planerad', sms_skickat: false }), NU.getTime());
    expect(u).toEqual({ typ: 'skicka', meddelande: { title: 'Hålabäck startar i morgon', body: 'Skicka till markägaren?', url: '/planering?objekt=A&besok=sms', tag: 'besok-A' } });
  });
  it('redan skickat, avslutat, borta, för gammalt, läsfel', async () => {
    expect((await byggBesokNotis(n, hamta({ id: 'A', namn: 'H', status: 'planerad', sms_skickat: true }), NU.getTime())).typ).toBe('hoppa_over');
    expect((await byggBesokNotis(n, hamta({ id: 'A', namn: 'H', status: 'avslutat', sms_skickat: false }), NU.getTime())).typ).toBe('hoppa_over');
    expect((await byggBesokNotis(n, hamta(null), NU.getTime())).typ).toBe('hoppa_over');
    expect((await byggBesokNotis({ ...n, skapad_at: new Date(NU.getTime() - 25 * 3600000).toISOString() }, hamta({ id: 'A', namn: 'H', status: 'planerad', sms_skickat: false }), NU.getTime())).typ).toBe('hoppa_over');
    expect((await byggBesokNotis(n, hamta(null, 'nät'), NU.getTime())).typ).toBe('uppskjut');
    expect((await byggBesokNotis({ typ: 'besok_paminnelse', payload: {} }, hamta(null), NU.getTime())).typ).toBe('hoppa_over');
  });
});

describe('hytten', () => {
  const b = (id: string, tid: string) => ({ id, namn: id, telefon: '070', besokstid: tid });
  it('aktiva besök, ej kvitterade av den här maskinen, ring så länge något är aktivt', () => {
    const aktiva = aktivaBesok([b('gammal', '2026-10-22T07:00:00Z'), b('nu', '2026-10-22T10:00:00Z'), b('senare', '2026-10-22T14:00:00Z')], NU);
    expect(aktiva.map((x) => x.id)).toEqual(['nu', 'senare']);
    const kv = [{ besok_id: 'nu', maskin_id: 'M1' }];
    expect(ejKvitterade(aktiva, kv, 'M1').map((x) => x.id)).toEqual(['senare']);
    expect(ejKvitterade(aktiva, kv, 'M2').map((x) => x.id)).toEqual(['nu', 'senare']);   // en annan maskin har inte kvitterat
    expect(ejKvitterade(aktiva, kv, null).map((x) => x.id)).toEqual(['nu', 'senare']);
    expect(ringAktiv(aktiva)).toBe(true);
    expect(ringAktiv([])).toBe(false);
  });
  it('besökssidans status efter Skicka', () => {
    expect(kvitteringsRader([])).toEqual([]);
    expect(kvitteringsRader([{ roll: 'skordare', tid: '2026-10-22T11:52:00Z' }, { roll: 'skotare', tid: '2026-10-22T11:55:00Z' }])).toEqual(['✓ Skördaren har sett det 13:52', '✓ Skotaren har sett det 13:55']);
    expect(harKvitterat([{ maskin_id: 'M1' }], 'M1')).toBe(true);
    expect(harKvitterat([{ maskin_id: 'M1' }], 'M2')).toBe(false);
    // en maskin utan id har aldrig kvitterat — inte ens mot en rad som saknar id
    expect(harKvitterat([{ maskin_id: null as any }], null)).toBe(false);
    expect(harKvitterat([{ maskin_id: '' }], '')).toBe(false);
    expect(harKvitterat([{ maskin_id: 'M1' }], undefined)).toBe(false);
    expect(besokRubrik('Anna Svensson', 'kommer ca 14:30')).toBe('Besök: Anna Svensson kommer ca 14:30');
  });
});

describe('loggen i ⓘ', () => {
  it('besök med kvittenser (maskin, förare, tid) och SMS-raden', () => {
    const rader = loggRader(
      [{ id: 'b1', namn: 'Anna', telefon: '070-1', besokstid: '2026-10-22T12:30:00Z', skapad_at: '2026-10-22T11:10:00Z' }, { id: 'b2', namn: 'Per', telefon: '070-2', besokstid: '2026-10-22T13:00:00Z', skapad_at: '2026-10-22T11:20:00Z' }],
      [{ besok_id: 'b1', maskin_id: 'M1', roll: 'skordare', forare_id: 'f1', kvitterad_at: '2026-10-22T11:52:00Z', testlage: false }, { besok_id: 'b1', maskin_id: 'M2', roll: 'skotare', forare_id: 'f2', kvitterad_at: '2026-10-22T11:50:00Z', testlage: true }],
      { maskin: (id) => ({ M1: 'Giant', M2: 'Elefant' }[id] ?? id), person: (id) => ({ f1: 'Stefan', f2: 'Daniel' }[id ?? ''] ?? null) }, NU);
    expect(rader.map((r) => r.id)).toEqual(['b2', 'b1']);   // nyast anmäld först
    expect(rader[0].vantar).toBe(true);
    expect(rader[1].kvittenser).toEqual(['Elefant · Daniel · 13:50 · test', 'Giant · Stefan · 13:52']);
    expect(rader[1].under).toBe('Anmäld 13:10 · kommer 14:30');
    expect(smsStatusText([], () => null, NU)).toBeNull();
    expect(smsStatusText([{ id: 's', oppnad_av: 'a', oppnad_at: '2026-10-21T12:05:00Z', mottagare_namn: null, mottagare_nummer: null, handelse: 'oppnad' }], () => 'Martin Lindqvist', NU)).toBe('Öppnat 21 okt 14:05 av Martin – inte bekräftat skickat');
  });
});

describe('SMS-loggen är en händelselogg: öppnat ≠ skickat', () => {
  const rad = (handelse: any, oppnad_at: string, id = handelse) => ({ id, oppnad_av: 'a', oppnad_at, mottagare_namn: null, mottagare_nummer: null, handelse });
  const person = () => 'Martin Lindqvist';
  it('öppnat och kopierat är obekräftade (frågan "Skickade du SMS:et?" ställs)', () => {
    expect(smsLage([rad('oppnad', '2026-10-21T12:05:00Z')], person, NU)).toEqual({ typ: 'obekraftad', text: 'Öppnat 21 okt 14:05 av Martin – inte bekräftat skickat' });
    expect(smsLage([rad('kopierad', '2026-10-21T12:05:00Z')], person, NU)).toEqual({ typ: 'obekraftad', text: 'Kopierat 21 okt 14:05 av Martin – inte bekräftat skickat' });
  });
  it('bara planerarens "Ja, skickat" gör det till skickat; "Nej" är inte skickat', () => {
    expect(smsLage([rad('skickad', '2026-10-21T12:06:00Z'), rad('oppnad', '2026-10-21T12:05:00Z')], person, NU).typ).toBe('skickad');
    expect(smsLage([rad('ej_skickad', '2026-10-21T12:06:00Z'), rad('oppnad', '2026-10-21T12:05:00Z')], person, NU)).toEqual({ typ: 'ej_skickad', text: 'Inte skickat (21 okt 14:06 av Martin)' });
  });
  it('senaste händelsen gäller: ett nytt försök efter ett "skickat" ställer frågan igen', () => {
    expect(smsLage([rad('oppnad', '2026-10-22T08:00:00Z'), rad('skickad', '2026-10-21T12:06:00Z')], person, NU).typ).toBe('obekraftad');
  });
  it('inget alls = ingen rad, ingen fråga', () => { expect(smsLage([], person, NU)).toEqual({ typ: 'ingen', text: null }); });
});

describe('SMS:ets nummer och plattform', () => {
  it('avsändarens nummer först, annars företagets, annars ingen rad', () => {
    expect(smsNummer({ avsandareTelefon: '070-111 22 33', foretagTelefon: '0470-1' })).toBe('070-111 22 33');
    expect(smsNummer({ avsandareTelefon: '  ', foretagTelefon: '0470-12 345' })).toBe('0470-12 345');
    expect(smsNummer({ avsandareTelefon: null, foretagTelefon: '' })).toBe('');
  });
  it('SMS-texten slutar med företagets nummer när planeraren saknar eget – och utan rad när inget finns', () => {
    const grund = { markagare: 'Kerstin Olsson', fastighet: 'HÅLABÄCK 1:13', nar: 'i morgon', lank: 'https://x/besok/T', avsandareNamn: 'Martin Lindqvist', avsandareTelefon: null };
    expect(besokSmsText({ ...grund, foretagTelefon: '0470-12 345' }).trimEnd().endsWith('0470-12 345')).toBe(true);
    const utan = besokSmsText({ ...grund, foretagTelefon: '' });
    expect(utan).not.toMatch(/\d{2,}[- ]\d/);
    expect(utan.trimEnd().endsWith('Kompersmåla Skog')).toBe(true);
  });
  it('dator eller mobil: iPad som utger sig för Mac räknas som surfplatta', () => {
    expect(arMobil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)', 5)).toBe(true);
    expect(arMobil('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5)).toBe(true);
    expect(arMobil('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe(true);    // iPad i skrivbordsläge
    expect(arMobil('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe(false);   // riktig Mac
    expect(arMobil('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 0)).toBe(false);
  });
});

describe('ringarna ritas i verkliga meter', () => {
  it('varje punkt på ringen ligger exakt radien från mitten (±0,5 m) — på Skälvikens latitud', async () => {
    const { cirkelPolygon } = await import('@/lib/telefonGps');
    const R = 6371008.8, rad = (g: number) => (g * Math.PI) / 180;
    const avstand = (a: [number, number], lat: number, lng: number) => {
      const dLat = rad(a[1] - lat), dLng = rad(a[0] - lng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat)) * Math.cos(rad(a[1])) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };
    for (const m of [BESOK_RING_M.skordare, BESOK_RING_M.skotare, BESOK_RING_M.motorsag, HYTT_RING_M]) {
      const p = cirkelPolygon(56.3548, 15.0545, m, 64);
      for (const punkt of p.coordinates[0]) expect(Math.abs(avstand(punkt, 56.3548, 15.0545) - m)).toBeLessThan(0.5);
    }
  });
});

describe('traktens namn på besökssidan', () => {
  it('Vidas koder visas aldrig; ledande koder tas bort, första kod efter ett ord klipper', () => {
    expect(besokNamn('RP J-Hus -25', '11166440', 'Skälviken 1:23')).toBe('Skälviken 1:23');
    expect(besokNamn('Skälviken au 2025', null, null)).toBe('Skälviken');
    expect(besokNamn('Bjällerhult au + ga', null, null)).toBe('Bjällerhult');
    expect(besokNamn('Gallring Vällust', null, null)).toBe('Vällust');
    expect(besokNamn('Stora Mossen RP', null, 'X')).toBe('Stora Mossen');
    expect(besokNamn('AU A-A -25', null, null)).toBe('Trakten');
    expect(besokNamn('   ', null, '  Höka 1:2 ')).toBe('Höka 1:2');
  });
});

describe('maskinernas färg på besökskartan', () => {
  it('skördaren är gul, skotaren grön – med appens egna färgvärden', async () => {
    const { BESOK_MASKINFARG } = await import('./farg');
    const { FARG } = await import('@/lib/design/tokens');
    const { ROLLFARG_SKOTARE } = await import('@/lib/sparStil');
    expect(BESOK_MASKINFARG.skordare).toBe(FARG.gul);
    expect(BESOK_MASKINFARG.skordare.toLowerCase()).toBe('#ffd60a');
    expect(BESOK_MASKINFARG.skotare).toBe(ROLLFARG_SKOTARE);
    expect(BESOK_MASKINFARG.skordare).not.toBe(BESOK_MASKINFARG.skotare);
  });
});
