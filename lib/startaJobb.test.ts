import { describe, it, expect } from 'vitest';
import {
  JOBBTYPER, byggObjektRad, valideraJobb, skapaJobb, atgardForTyp, giltigPlats, arGrotEllerEnergi, jobbTypLabel, narmasteVirkesobjekt, avstandText, arVirkesobjekt, type JobbIndata,
} from './startaJobb';
import { skapaMinnesDb } from './testStod/minnesDb';

// Så föds ett jobb från Starta jobb — samma rad oavsett om det skapas på telefonen, på kontoret eller från maskindatorns "Inget objekt här"-kort.

const NU = '2026-10-09T08:00:00.000Z';
const bas: JobbIndata = { namn: '  Hållsta 2:7  ', typ: 'slutavverkning', ursprung: 'vanta_vida' };

describe('byggObjektRad', () => {
  it('planerat jobb utan position och maskin: namn trimmat, kalla starta-jobb, ursprung sparat, status planerad SATT UTTRYCKLIGEN', () => {
    expect(byggObjektRad(bas, 'P-1018', NU)).toEqual({
      namn: 'Hållsta 2:7', vo_nummer: 'P-1018', markagare: null, bolag: null, typ: 'slutavverkning', kalla: 'starta-jobb',
      ursprung: 'vanta_vida', status: 'planerad',
    });
  });
  it("privat jobb sparar ursprung 'privat'", () => {
    expect(byggObjektRad({ ...bas, ursprung: 'privat' }, 'P-1019', NU).ursprung).toBe('privat');
  });
  it('maskindator: maskinen tilldelas i RÄTT rollfält, status pågående + starttid, position med', () => {
    const skordare = byggObjektRad({ ...bas, lat: 56.4, lng: 14.9, maskin: { maskinId: 'R64428', roll: 'skordare' } }, 'P-1018', NU);
    expect(skordare).toMatchObject({ skordare_maskin_id: 'R64428', status: 'pagaende', pagaende_startad_timestamp: NU, lat: 56.4, lng: 14.9 });
    expect(skordare).not.toHaveProperty('skotare_maskin_id');
    const skotare = byggObjektRad({ ...bas, maskin: { maskinId: 'A030353', roll: 'skotare' } }, 'P-1018', NU);
    expect(skotare).toMatchObject({ skotare_maskin_id: 'A030353', status: 'pagaende' });
    expect(skotare).not.toHaveProperty('skordare_maskin_id');
  });
  it('GROT och energiklippning är TYPER med egen åtgärdsetikett; slutavverkning/gallring får ingen', () => {
    expect(byggObjektRad({ ...bas, typ: 'grot' }, 'P-1', NU)).toMatchObject({ typ: 'grot', atgard: 'GROT' });
    expect(byggObjektRad({ ...bas, typ: 'energiklippning' }, 'P-1', NU)).toMatchObject({ typ: 'energiklippning', atgard: 'Energiklippning' });
    expect(byggObjektRad(bas, 'P-1', NU)).not.toHaveProperty('atgard');
    expect(byggObjektRad({ ...bas, typ: 'gallring' }, 'P-1', NU)).not.toHaveProperty('atgard');
    // aldrig via grot-flaggan
    expect(byggObjektRad({ ...bas, typ: 'grot' }, 'P-1', NU)).not.toHaveProperty('grot');
  });
  it('hor_till_objekt_id följer bara med för GROT', () => {
    expect(byggObjektRad({ ...bas, typ: 'grot', horTillObjektId: 'v1' }, 'P-1', NU).hor_till_objekt_id).toBe('v1');
    expect(byggObjektRad({ ...bas, typ: 'energiklippning', horTillObjektId: 'v1' }, 'P-1', NU)).not.toHaveProperty('hor_till_objekt_id');
    expect(byggObjektRad({ ...bas, typ: 'slutavverkning', horTillObjektId: 'v1' }, 'P-1', NU)).not.toHaveProperty('hor_till_objekt_id');
    expect(byggObjektRad({ ...bas, typ: 'grot', horTillObjektId: '' }, 'P-1', NU)).not.toHaveProperty('hor_till_objekt_id');
  });
  it('ogiltig position (0,0, omkastad, NaN) sparas inte — jobbet skapas utan position', () => {
    for (const [la, lo] of [[0, 0], [14.9, 56.4], [NaN, 14.9], [null, null], [91, 14]] as const) {
      const r = byggObjektRad({ ...bas, lat: la as any, lng: lo as any }, 'P-1', NU);
      expect(r).not.toHaveProperty('lat');
      expect(r).not.toHaveProperty('lng');
    }
    expect(giltigPlats(56.4, 14.9)).toBe(true);
  });
  it('markägare/bolag trimmas, tomma blir null', () => {
    const r = byggObjektRad({ ...bas, markagare: ' Anna ', bolag: '   ' }, 'P-1', NU);
    expect(r.markagare).toBe('Anna');
    expect(r.bolag).toBeNull();
  });
});

describe('valideraJobb', () => {
  it('kräver namn, giltig typ och ursprung', () => {
    expect(valideraJobb(bas)).toEqual({ ok: true });
    expect(valideraJobb({ ...bas, namn: '   ' })).toEqual({ ok: false, fel: 'Jobbet behöver ett namn' });
    expect(valideraJobb({ ...bas, typ: 'rotpost' as any }).ok).toBe(false);
    expect(valideraJobb({ ...bas, ursprung: undefined as any }).ok).toBe(false);
  });
  it('de fyra typerna i rätt ordning', () => {
    expect(JOBBTYPER.map((t) => t.typ)).toEqual(['slutavverkning', 'gallring', 'grot', 'energiklippning']);
    expect(jobbTypLabel('energiklippning')).toBe('Energiklippning');
    expect(atgardForTyp('grot')).toBe('GROT');
    expect(arGrotEllerEnergi('grot') && arGrotEllerEnergi('Energiklippning') && !arGrotEllerEnergi('gallring')).toBe(true);
  });
});

// skapaJobb mot en minnes-databas: bevisar att raden FINNS efteråt och att fel aldrig ser ut som lyckade skrivningar.
describe('skapaJobb', () => {
  const dbMed = (vo: string | null = 'P-1018', rpcFel: string | null = null) => {
    const db = skapaMinnesDb({ objekt: [] });
    db.funktioner.next_privat_vo = () => { if (rpcFel) throw new Error(rpcFel); return vo; };
    return db;
  };

  it('lyckat: VO hämtat, raden finns i objekt med rätt fält, svaret är den LÄSTA raden', async () => {
    const db = dbMed();
    const r = await skapaJobb(db as any, { ...bas, typ: 'grot', horTillObjektId: 'v1', lat: 56.4, lng: 14.9, maskin: { maskinId: 'A030353', roll: 'skotare' } }, NU);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.vo).toBe('P-1018');
    expect(db.tabeller.objekt).toHaveLength(1);
    expect(db.tabeller.objekt[0]).toMatchObject({
      vo_nummer: 'P-1018', namn: 'Hållsta 2:7', typ: 'grot', atgard: 'GROT', ursprung: 'vanta_vida', hor_till_objekt_id: 'v1',
      skotare_maskin_id: 'A030353', status: 'pagaende', pagaende_startad_timestamp: NU, lat: 56.4, lng: 14.9, kalla: 'starta-jobb',
    });
    expect(r.rad.id).toBe(db.tabeller.objekt[0].id);
  });
  it('RPC-fel: inget skapas, felet visas, VO inte förbrukat', async () => {
    const db = dbMed('P-1', 'permission denied for sequence privat_vo_seq');
    const r = await skapaJobb(db as any, bas, NU);
    expect(r).toMatchObject({ ok: false, voForbrukat: false });
    expect((r as any).fel).toContain('Kunde inte hämta VO-nummer: permission denied for sequence privat_vo_seq');
    expect(db.skrivlogg).toEqual([]);
  });
  it('RPC svarar tomt (null) utan fel → fel, ingen rad', async () => {
    const db = dbMed(null);
    const r = await skapaJobb(db as any, bas, NU);
    expect(r.ok).toBe(false);
    expect((r as any).fel).toContain('inget svar från databasen');
    expect(db.tabeller.objekt).toHaveLength(0);
  });
  it('insert nekas (t.ex. utgången session) → felet i klartext och voForbrukat true (numret är bränt)', async () => {
    const db = dbMed();
    db.injiceraFel('objekt.insert', { message: 'new row violates row-level security policy for table "objekt"', code: '42501' });
    const r = await skapaJobb(db as any, bas, NU);
    expect(r).toMatchObject({ ok: false, voForbrukat: true });
    expect((r as any).fel).toContain('row-level security');
    expect(db.tabeller.objekt).toHaveLength(0);
  });
  it('validering stoppar före ALLA anrop (inget VO bränns på ett namnlöst jobb)', async () => {
    let rpcAnrop = 0;
    const db = dbMed();
    db.funktioner.next_privat_vo = () => { rpcAnrop++; return 'P-9'; };
    const r = await skapaJobb(db as any, { ...bas, namn: '' }, NU);
    expect(r).toMatchObject({ ok: false, voForbrukat: false });
    expect(rpcAnrop).toBe(0);
  });
});

describe('narmasteVirkesobjekt — GROT "hör till": förslag = närmaste virkesobjekt', () => {
  const L = (m: number) => 56.4 + m / 111195;
  const objekt = [
    { id: 'a', namn: 'Långt', typ: 'gallring', lat: L(9000), lng: 14.9 },
    { id: 'b', namn: 'Nära', typ: 'slutavverkning', lat: L(800), lng: 14.9 },
    { id: 'c', namn: 'Ett annat GROT-jobb', typ: 'grot', lat: L(100), lng: 14.9 },     // aldrig ett GROT-/energijobb
    { id: 'd', namn: 'Utan plats', typ: 'gallring', lat: null, lng: null },
    { id: 'e', namn: 'Namnlös', typ: 'gallring', lat: L(50), lng: 14.9 },               // utan namn kan det inte väljas
    { id: 'f', namn: 'Energi', typ: 'energiklippning', lat: L(10), lng: 14.9 },
  ].map((o) => (o.id === 'e' ? { ...o, namn: ' ' } : o));

  it('närmast först, bara slutavverkning/gallring med namn, objekt utan plats sist', () => {
    const r = narmasteVirkesobjekt({ lat: 56.4, lng: 14.9 }, objekt);
    expect(r.map((o) => o.id)).toEqual(['b', 'a', 'd']);
    expect(Math.round(r[0].avstandM!)).toBe(800);
    expect(r[2].avstandM).toBeNull();
  });
  it('utan position: på namn, inga avstånd', () => {
    const r = narmasteVirkesobjekt(null, objekt);
    expect(r.map((o) => o.namn)).toEqual(['Långt', 'Nära', 'Utan plats']);
    expect(r.every((o) => o.avstandM === null)).toBe(true);
  });
  it('max begränsar; arVirkesobjekt', () => {
    expect(narmasteVirkesobjekt({ lat: 56.4, lng: 14.9 }, objekt, 1)).toHaveLength(1);
    expect(arVirkesobjekt({ typ: 'Gallring' })).toBe(true);
    expect(arVirkesobjekt({ typ: 'grot' })).toBe(false);
    expect(arVirkesobjekt(null)).toBe(false);
  });
  it('avståndstext', () => {
    expect(avstandText(840)).toBe('840 m');
    expect(avstandText(2440)).toBe('2,4 km');
    expect(avstandText(null)).toBe('');
  });
});
