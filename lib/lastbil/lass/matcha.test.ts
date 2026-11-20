import { describe, expect, it } from 'vitest';
import { detekteraLass } from './detektera';
import { lasFacit, lasLogg, lasManuellaFlyttar, sommarMs } from './fixtur';
import { hittaManuellFlytt, type ManuellFlytt } from './matcha';

const MASKIN_ID: Record<string, string> = { Giant: 'PONS20SDJAA270231', Wisent: 'A030353', 'Elefant 26': 'A130743', '810E': 'JD810E', 'H8E -26': 'R64428' };
const NU = Date.parse('2026-10-19T12:00:00Z');
const MIN = 60_000;

const tider = (l: ReturnType<typeof detekteraLass>['lass'][number]) => ({ fran: l.lassningFran ?? l.lassningTid, till: l.lossningTill ?? l.lossningTid, lastad: l.lassningTid });

describe('REPLAY — förarens registrerade flyttar mot lassen (dubblett mot manuell registrering)', () => {
  const facit = lasFacit();
  const lass = detekteraLass(lasLogg()).lass.filter(l => !l.avvisad);
  const flyttar = lasManuellaFlyttar();

  /** Kör lassen i tidsordning med `upptagna` som växer — som cron:en gör. */
  function kor() {
    const upptagna = new Set<string>();
    return lass.map(l => {
      const m = hittaManuellFlytt(tider(l), flyttar, upptagna, NU);
      if (m?.typ === 'match') upptagna.add(m.flytt.id);
      return { l, m };
    });
  }
  const forFacit = (f: (typeof facit)[number], rader: ReturnType<typeof kor>) => {
    const start = /^\d/.test(f.lassningFran) ? sommarMs(f.dag, f.lassningFran) : sommarMs(f.dag, f.lassningTid) - 30 * MIN;
    const slut = sommarMs(f.dag, f.lassningTid);
    return rader.find(r => { const t = Date.parse(r.l.forstaLastadTid); return t >= start - 5 * MIN && t <= slut + 5 * MIN; })!;
  };

  it('varje registrerat lass i facit (15) matchar förarens flytt — med RÄTT maskin', () => {
    const rader = kor();
    const reg = facit.filter(f => f.status === 'reg');
    expect(reg).toHaveLength(15);
    for (const f of reg) {
      const r = forFacit(f, rader);
      expect(r.m?.typ, `facit ${f.n} ${f.dag}`).toBe('match');
      expect(r.m?.flytt.maskin_id, `facit ${f.n} maskin`).toBe(MASKIN_ID[f.maskin]);
    }
  });

  it('H8E-flytten 16 sep (som facit-tröskeln 38 t missade) matchar det nya lasset', () => {
    const r = kor().find(x => x.l.forstaLastadTid.startsWith('2026-09-16T12:'))!;
    expect(r.m?.typ).toBe('match');
    expect(r.m?.flytt.maskin_id).toBe('R64428');
  });

  it('de två avbrutna flytterna i facit (7 och 11 aug) är PÅBÖRJADE — ingen match, men maskinen är ett förslag', () => {
    const rader = kor();
    for (const f of facit.filter(x => x.status === 'avbruten')) {
      const r = forFacit(f, rader);
      expect(r.m?.typ, `facit ${f.n}`).toBe('paborjad');
      expect(r.m?.flytt.maskin_id).toBe('A030353');
    }
  });

  it('de 28 lass utan registrering matchar ingenting — ingen flytt dras på fel lass', () => {
    const rader = kor();
    const saknas = facit.filter(f => f.status === 'saknas');
    expect(saknas).toHaveLength(28);
    for (const f of saknas) expect(forFacit(f, rader).m, `facit ${f.n}`).toBeNull();
  });

  it('en flytt hör till ETT lass: 16 matchade lass använder 16 olika flyttar', () => {
    const matcher = kor().filter(r => r.m?.typ === 'match').map(r => (r.m as { flytt: ManuellFlytt }).flytt.id);
    expect(matcher).toHaveLength(16);
    expect(new Set(matcher).size).toBe(16);
  });
});

describe('dubblett mot manuell registrering — enskilda fall', () => {
  const lassTid = { fran: '2026-10-12T10:00:00Z', till: '2026-10-12T11:30:00Z', lastad: '2026-10-12T10:20:00Z' };
  const flytt = (o: Partial<ManuellFlytt>): ManuellFlytt => ({
    id: 'f1', maskin_id: 'A130743', extern_maskin: null,
    starttid: '2026-10-12T10:10:00Z', hamtad_tid: '2026-10-12T10:20:00Z', sluttid: '2026-10-12T11:40:00Z', avbruten: false, ...o,
  });

  it('en flytt som överlappar lasset är samma flytt', () => {
    expect(hittaManuellFlytt(lassTid, [flytt({})], new Set(), NU)?.typ).toBe('match');
  });
  it('förarens tryck kommer före bilens rörelse (45 min marginal): startad 09:30 räknas', () => {
    expect(hittaManuellFlytt(lassTid, [flytt({ starttid: '2026-10-12T09:35:00Z', hamtad_tid: '2026-10-12T09:40:00Z', sluttid: '2026-10-12T09:50:00Z' })], new Set(), NU)?.typ).toBe('match');
  });
  it('en flytt två timmar efter lasset är en annan flytt', () => {
    expect(hittaManuellFlytt(lassTid, [flytt({ starttid: '2026-10-12T14:00:00Z', hamtad_tid: '2026-10-12T14:05:00Z', sluttid: '2026-10-12T15:00:00Z' })], new Set(), NU)).toBeNull();
  });
  it('en flytt som redan hör till ett annat lass matchas aldrig igen', () => {
    expect(hittaManuellFlytt(lassTid, [flytt({})], new Set(['f1']), NU)).toBeNull();
  });
  it('en pågående flytt (utan sluttid) matchar — men bara 12 timmar framåt', () => {
    expect(hittaManuellFlytt(lassTid, [flytt({ sluttid: null })], new Set(), NU)?.typ).toBe('match');
    expect(hittaManuellFlytt(lassTid, [flytt({ sluttid: null, starttid: '2026-10-11T06:00:00Z', hamtad_tid: '2026-10-11T06:05:00Z' })], new Set(), NU)).toBeNull();
  });
  it('en avbruten flytt är PÅBÖRJAD, aldrig en match (den ska inte fakturera)', () => {
    expect(hittaManuellFlytt(lassTid, [flytt({ avbruten: true })], new Set(), NU)?.typ).toBe('paborjad');
  });
  it('med både en avbruten och en riktig flytt vinner den riktiga', () => {
    const r = hittaManuellFlytt(lassTid, [flytt({ id: 'a', avbruten: true }), flytt({ id: 'b' })], new Set(), NU);
    expect(r).toMatchObject({ typ: 'match', flytt: { id: 'b' } });
  });
  it('två flyttar: den som överlappar mest vinner', () => {
    const r = hittaManuellFlytt(lassTid, [
      flytt({ id: 'liten', starttid: '2026-10-12T11:25:00Z', hamtad_tid: '2026-10-12T11:26:00Z', sluttid: '2026-10-12T11:40:00Z' }),
      flytt({ id: 'stor' }),
    ], new Set(), NU);
    expect(r?.flytt.id).toBe('stor');
  });
});
