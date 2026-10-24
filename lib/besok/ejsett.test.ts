import { describe, expect, it } from 'vitest';
import { fakeSb } from './fakeSb.testStod';
import { byggEjSettNotis, klockStart, valjEjSett, BESOK_EJ_SETT, type EjSettRad } from './ejsett';
import { koaBesokEjSett } from './ejsett-ko';
import { maskinEtikett, maskinerPaObjekt } from './maskinerPaBesok';
import { maskinStatusRader } from './status';

const NU = new Date('2026-10-24T10:00:00Z');
const min = (m: number) => new Date(NU.getTime() + m * 60000).toISOString();
const OBJ = '00000000-0000-4000-8000-0000000000aa';
const BESOK = '11111111-1111-4111-8111-111111111111';
const SKORDARE = { maskinId: 'PONS20SDJAA270231' };
const SKOTARE = { maskinId: 'A030353' };
const besok = (o: Record<string, any> = {}) => ({ id: BESOK, objekt_id: OBJ, besokstid: min(30), skapad_at: min(-11), ...o });
const maskiner = new Map([[OBJ, [SKORDARE, SKOTARE]]]);

describe('klockan för "inte sett"', () => {
  it('börjar vid anmälan — men tidigast 60 min före besökstiden', () => {
    expect(klockStart({ besokstid: min(30), skapad_at: min(-11) })).toBe(NU.getTime() - 11 * 60000);
    expect(klockStart({ besokstid: min(600), skapad_at: min(-11) })).toBe(NU.getTime() + 540 * 60000);   // i morgon: klockan går först 60 min före
    expect(klockStart({ besokstid: 'skräp', skapad_at: min(0) })).toBeNaN();
  });
});

describe('valjEjSett — vilka (besök, maskin) som ska få en push', () => {
  it('10 minuter efter anmälan utan Uppfattat: en kandidat per maskin som ska ha sett det', () => {
    const k = valjEjSett([besok()], maskiner, [], NU);
    expect(k.map((x) => x.maskinId).sort()).toEqual(['A030353', 'PONS20SDJAA270231']);
    expect(k[0].nyckel).toBe(`besok_ej_sett:${BESOK}:${k[0].maskinId}`);
  });
  it('för tidigt (9 min) → ingen', () => {
    expect(valjEjSett([besok({ skapad_at: min(-9) })], maskiner, [], NU)).toEqual([]);
  });
  it('maskinen som tryckt Uppfattat får ingen; den andra får', () => {
    const k = valjEjSett([besok()], maskiner, [{ besok_id: BESOK, maskin_id: 'A030353' }], NU);
    expect(k.map((x) => x.maskinId)).toEqual(['PONS20SDJAA270231']);
  });
  it('en kvittens på ett annat besök räknas inte', () => {
    expect(valjEjSett([besok()], maskiner, [{ besok_id: 'annat', maskin_id: 'A030353' }], NU)).toHaveLength(2);
  });
  it('besöket är över (besökstid + 2 h) → ingen push; anmält för i morgon → ingen push i kväll', () => {
    expect(valjEjSett([besok({ besokstid: min(-130), skapad_at: min(-300) })], maskiner, [], NU)).toEqual([]);
    expect(valjEjSett([besok({ besokstid: min(15 * 60), skapad_at: min(-120) })], maskiner, [], NU)).toEqual([]);
  });
  it('objekt utan maskiner → ingen', () => {
    expect(valjEjSett([besok()], new Map(), [], NU)).toEqual([]);
  });
});

describe('texten byggs FÄRSKT vid utskick', () => {
  const rad = (o: Partial<EjSettRad> = {}): EjSettRad => ({
    besok: { id: BESOK, namn: 'Anna Svensson', besokstid: min(30), objekt_id: OBJ },
    objekt: { id: OBJ, namn: 'Skälviken', status: 'pagaende' },
    maskinNamn: 'Skördaren Scorpion', sett: false, ...o,
  });
  const n = (over: Record<string, any> = {}) => ({ typ: BESOK_EJ_SETT, payload: { besok_id: BESOK, maskin_id: 'PONS20SDJAA270231' }, skapad_at: min(-5), ...over });
  const nu = NU.getTime();

  it('"<Maskin> har inte sett besöket på <trakt>" med besökaren i texten och länk till objektet', async () => {
    const u = await byggEjSettNotis(n(), async () => ({ rad: rad() }), nu);
    expect(u.typ).toBe('skicka');
    if (u.typ !== 'skicka') return;
    expect(u.meddelande.title).toBe('Skördaren Scorpion har inte sett besöket på Skälviken');
    expect(u.meddelande.body).toMatch(/^Anna Svensson kommer .*\. Ring föraren\.$/);
    expect(u.meddelande.url).toBe(`/planering?objekt=${OBJ}`);
  });
  it('hann maskinen trycka Uppfattat → hoppas över', async () => {
    const u = await byggEjSettNotis(n(), async () => ({ rad: rad({ sett: true }) }), nu);
    expect(u).toMatchObject({ typ: 'hoppa_over' });
  });
  it('besöket borta / över / objektet avslutat / för gammal köad rad → hoppas över; läsfel → uppskjuts', async () => {
    expect((await byggEjSettNotis(n(), async () => ({ rad: null }), nu)).typ).toBe('hoppa_over');
    expect((await byggEjSettNotis(n(), async () => ({ rad: rad({ besok: { id: BESOK, namn: 'A', besokstid: min(-130), objekt_id: OBJ } }) }), nu)).typ).toBe('hoppa_over');
    expect((await byggEjSettNotis(n(), async () => ({ rad: rad({ objekt: { id: OBJ, namn: 'S', status: 'avslutat' } }) }), nu)).typ).toBe('hoppa_over');
    expect((await byggEjSettNotis(n({ skapad_at: min(-25 * 60) }), async () => ({ rad: rad() }), nu)).typ).toBe('hoppa_over');
    expect((await byggEjSettNotis(n({ payload: {} }), async () => ({ rad: rad() }), nu)).typ).toBe('hoppa_over');
    expect(await byggEjSettNotis(n(), async () => ({ rad: null, fel: 'nät' }), nu)).toEqual({ typ: 'uppskjut' });
  });
});

describe('maskinerPaObjekt — tilldelad eller arbetar där de senaste 24 timmarna', () => {
  const dim = [
    { maskin_id: 'PONS20SDJAA270231', visningsnamn: 'Scorpion', maskin_typ: 'Harvester' },
    { maskin_id: 'A030353', visningsnamn: 'Wisent', maskin_typ: 'Forwarder' },
    { maskin_id: 'GRANNE', visningsnamn: 'Granne', maskin_typ: 'Harvester' },
    { maskin_id: 'OKAND', visningsnamn: 'Okänd', maskin_typ: 'Lastbil' },
  ];
  it('tilldelad räknas även utan spår; spår inom 24 h räknas; äldre spår och okänd typ räknas inte', async () => {
    const sb = fakeSb({
      objekt: [{ id: OBJ, skordare_maskin_id: 'PONS20SDJAA270231', skotare_maskin_id: null }],
      hyttspar: [
        { objekt_id: OBJ, maskin_id: 'A030353', datum: '2026-10-24', uppdaterad_at: min(-60) },
        { objekt_id: OBJ, maskin_id: 'GRANNE', datum: '2026-10-22', uppdaterad_at: min(-60 * 30) },
        { objekt_id: OBJ, maskin_id: 'OKAND', datum: '2026-10-24', uppdaterad_at: min(-5) },
      ],
      dim_maskin: dim,
    });
    const r = (await maskinerPaObjekt(sb, [OBJ], NU)).get(OBJ)!;
    expect(r.map((m) => m.maskinId)).toEqual(['PONS20SDJAA270231', 'A030353']);
    expect(r.map(maskinEtikett)).toEqual(['Skördaren Scorpion', 'Skotaren Wisent']);
  });
  it('ett läsfel kastar — en tom lista skulle se ut som "ingen maskin behöver se det"', async () => {
    await expect(maskinerPaObjekt(fakeSb({ objekt: [], hyttspar: [] }, {}, { fel: { hyttspar: 'nät' } }), [OBJ], NU)).rejects.toThrow('hyttspar');
  });
});

describe('koaBesokEjSett — köar en rad per planerare, besök och maskin, och aldrig två gånger', () => {
  const tabeller = () => ({
    objekt_besok: [besok()],
    objekt: [{ id: OBJ, status: 'pagaende', skordare_maskin_id: 'PONS20SDJAA270231', skotare_maskin_id: 'A030353' }],
    objekt_besok_kvittens: [] as any[],
    hyttspar: [],
    dim_maskin: [{ maskin_id: 'PONS20SDJAA270231', visningsnamn: 'Scorpion', maskin_typ: 'Harvester' }, { maskin_id: 'A030353', visningsnamn: 'Wisent', maskin_typ: 'Forwarder' }],
    medarbetare: [{ id: 'm-martin', roll: 'admin', aktiv: true }, { id: 'm-joacim', roll: 'admin', aktiv: true }, { id: 'm-ex', roll: 'admin', aktiv: false }, { id: 'm-stefan', roll: 'forare', aktiv: true }],
    notis_kö: [] as any[],
  });
  it('2 maskiner × 2 aktiva planerare = 4 rader, payload utan förare', async () => {
    const t = tabeller();
    const sb = fakeSb(t);
    // fakeSb:s upsert tar en rad i taget; producenten skickar en lista → använd en fake som tar listor
    const koade: any[] = [];
    const sb2: any = { ...sb, from: (tab: string) => (tab === 'notis_kö' ? { upsert: (rader: any[]) => ({ select: async () => { koade.push(...rader); return { data: rader.map((r) => ({ dedup_nyckel: r.dedup_nyckel })), error: null }; } }) } : sb.from(tab)) };
    const r = await koaBesokEjSett(sb2, NU);
    expect(r).toMatchObject({ ok: true, kandidater: 2, koade: 4 });
    expect(koade.map((x) => x.mottagare_id).sort()).toEqual(['m-joacim', 'm-joacim', 'm-martin', 'm-martin']);
    expect(koade.every((x) => x.typ === BESOK_EJ_SETT && Object.keys(x.payload).sort().join() === 'besok_id,maskin_id,objekt_id')).toBe(true);
  });
  it('kvitterad maskin köas inte; avslutat objekt köas inte; läsfel är ett fel (inget köas)', async () => {
    const t = tabeller(); t.objekt_besok_kvittens.push({ besok_id: BESOK, maskin_id: 'A030353' });
    const koade: any[] = [];
    const bygg = (tab: Record<string, any[]>, fel?: Record<string, string>) => { const sb = fakeSb(tab, {}, { fel }); return { ...sb, from: (n: string) => (n === 'notis_kö' ? { upsert: (rader: any[]) => ({ select: async () => { koade.push(...rader); return { data: rader, error: null }; } }) } : sb.from(n)) } as any; };
    expect(await koaBesokEjSett(bygg(t), NU)).toMatchObject({ kandidater: 1, koade: 2 });
    const avslutat = tabeller(); avslutat.objekt[0].status = 'avslutat';
    expect(await koaBesokEjSett(bygg(avslutat), NU)).toMatchObject({ ok: true, kandidater: 0 });
    const r = await koaBesokEjSett(bygg(tabeller(), { objekt_besok_kvittens: 'nät' }), NU);
    expect(r.ok).toBe(false);
    expect(koade).toHaveLength(2);   // bara från första körningen
  });
});

describe('besökssidan: en rad per maskin', () => {
  it('inte sedd = tydlig varning (maskinen utpekad när det finns flera), sedd = ✓ <maskin> har sett att du kommer', () => {
    const rader = maskinStatusRader([{ etikett: 'Skotaren Wisent', roll: 'skotare', tid: null }, { etikett: 'Skördaren Scorpion', roll: 'skordare', tid: '2026-10-24T10:02:00Z' }]);
    expect(rader).toEqual([
      { text: '✓ Skördaren Scorpion har sett att du kommer', sett: true },
      { text: 'Skotaren Wisent: föraren har inte sett dig än – gå inte in, ring oss', sett: false },
    ]);
  });
  it('en enda maskin: exakt texten ur beställningen', () => {
    expect(maskinStatusRader([{ etikett: 'Skördaren Scorpion', roll: 'skordare', tid: null }])).toEqual([{ text: 'Föraren har inte sett dig än – gå inte in, ring oss', sett: false }]);
    expect(maskinStatusRader([])).toEqual([]);
  });
});
