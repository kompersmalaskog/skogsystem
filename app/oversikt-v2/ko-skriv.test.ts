import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KO_LASFEL, KO_RAD_BORTA, KO_SPARFEL, flyttaKoVerifierat, laggIKoVerifierat, lasKo, skapaKoKedja, skrivOrdningVerifierat, taBortKoVerifierat } from './ko-skriv';
import type { MaskinKoItem } from '../oversikt/oversikt-types';

// En liten fake av maskin_ko som beter sig som PostgREST för de anrop modulen gör — inklusive de tysta felen:
//   'fel'   = svaret har {error} och inget ändras
//   'tyst'  = svaret är OK men INGET ändras (update/delete mot 0 rader, RLS) — det farliga fallet
//   'kasta' = anropet kastar (nätverksfel)
//   'delvis'= update landar bara delvis: maskin_id byts men inte ordning (bara för update)
// `efter` hoppar över de första N anropen av samma slag, `antal` begränsar hur många som drabbas.
type Slag = 'select' | 'insert' | 'update' | 'delete';
interface Regel { slag: Slag; modus: 'fel' | 'tyst' | 'kasta' | 'delvis'; efter?: number; antal?: number }
type Rad = MaskinKoItem & { created_at?: string };

function fake(start: Rad[], regler: Regel[] = [], fore: Partial<Record<Slag, (tabell: Rad[]) => void>> = {}) {
  const tabell: Rad[] = start.map((r) => ({ ...r }));
  const anrop: string[] = [];
  const skrivna: { slag: Slag; patch?: unknown; id?: string }[] = [];
  const lasningar: string[][] = [];
  const raknare = new Map<Regel, number>();
  let nyttId = 100;
  const regelFor = (slag: Slag): Regel | null => {
    for (const r of regler) {
      if (r.slag !== slag) continue;
      const n = raknare.get(r) ?? 0; raknare.set(r, n + 1);
      if (n < (r.efter ?? 0) || n - (r.efter ?? 0) >= (r.antal ?? Infinity)) continue;
      return r;
    }
    return null;
  };
  const dubblett = (rad: Partial<Rad>, utom?: string) => tabell.some((x) => x.id !== utom && x.maskin_id === rad.maskin_id && x.objekt_id === rad.objekt_id);
  const lat = (f: () => unknown) => ({ then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve().then(f).then(res, rej) });
  const sb = {
    from(t: string) {
      if (t !== 'maskin_ko') throw new Error('oväntad tabell ' + t);
      return {
        select(_kolumner: string) {
          const order: string[] = [];
          const q: any = { order(k: string) { order.push(k); return q; } };
          Object.assign(q, lat(() => {
            anrop.push('select'); lasningar.push(order.slice());
            fore.select?.(tabell);
            const r = regelFor('select');
            if (r?.modus === 'kasta') throw new Error('nätverk');
            if (r?.modus === 'fel') return { data: null, error: { message: 'mock: läsfel' } };
            if (r?.modus === 'tyst') return { data: [], error: null };      // RLS-lik tystnad: tomt svar, inget fel
            return { data: [...tabell].sort((a, b) => a.ordning - b.ordning || (a.id < b.id ? -1 : 1)).map((x) => ({ ...x })), error: null };
          }));
          return q;
        },
        insert(rad: Partial<Rad>) {
          return lat(() => {
            anrop.push('insert'); skrivna.push({ slag: 'insert', patch: rad });
            fore.insert?.(tabell);
            const r = regelFor('insert');
            if (r?.modus === 'kasta') throw new Error('nätverk');
            if (r?.modus === 'fel') return { error: { message: 'mock: skrivfel' } };
            if (r?.modus === 'tyst') return { error: null };
            if (dubblett(rad)) return { error: { code: '23505', message: 'duplicate key' } };
            tabell.push({ created_at: '2026-10-06', ...(rad as Rad), id: 'ny' + nyttId++ }); // id sist: databasen genererar det, anroparen skickar aldrig något
            return { error: null };
          });
        },
        update(patch: Partial<Rad>) {
          return { eq(_k: string, id: string) {
            return lat(() => {
              anrop.push('update'); skrivna.push({ slag: 'update', patch, id });
              const r = regelFor('update');
              if (r?.modus === 'kasta') throw new Error('nätverk');
              if (r?.modus === 'fel') return { error: { message: 'mock: skrivfel' } };
              if (r?.modus === 'tyst') return { error: null };
              const rad = tabell.find((x) => x.id === id);
              if (r?.modus === 'delvis') { if (rad && patch.maskin_id) rad.maskin_id = patch.maskin_id; return { error: null }; }
              if (!rad) return { error: null }; // 0 rader, inget fel — som PostgREST
              if (patch.maskin_id && dubblett({ maskin_id: patch.maskin_id, objekt_id: rad.objekt_id }, id)) return { error: { code: '23505', message: 'duplicate key' } };
              Object.assign(rad, patch);
              return { error: null };
            });
          } };
        },
        delete() {
          return { eq(_k: string, id: string) {
            return lat(() => {
              anrop.push('delete'); skrivna.push({ slag: 'delete', id });
              const r = regelFor('delete');
              if (r?.modus === 'kasta') throw new Error('nätverk');
              if (r?.modus === 'fel') return { error: { message: 'mock: skrivfel' } };
              if (r?.modus === 'tyst') return { error: null };
              const i = tabell.findIndex((x) => x.id === id);
              if (i >= 0) tabell.splice(i, 1);
              return { error: null };
            });
          } };
        },
      };
    },
  };
  return { sb, tabell, anrop, skrivna, lasningar };
}

const rad = (id: string, maskin: string, objekt: string, ordning: number): Rad => ({ id, maskin_id: maskin, objekt_id: objekt, ordning });
const ids = (ko: MaskinKoItem[] | null, maskin?: string) => (ko ?? []).filter((k) => !maskin || k.maskin_id === maskin).map((k) => k.id);

// Tekniken hör hemma i konsolen — och testet bevisar att den hamnar där.
let konsol: ReturnType<typeof vi.spyOn>;
beforeEach(() => { konsol = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { konsol.mockRestore(); });

describe('lasKo', () => {
  it('läser kön sorterad på ordning med id som tiebreaker', async () => {
    const f = fake([rad('b', 'M1', 'o2', 1), rad('a', 'M1', 'o1', 1), rad('c', 'M1', 'o3', 0)]);
    expect(ids(await lasKo(f.sb))).toEqual(['c', 'a', 'b']);
    expect(f.lasningar).toEqual([['ordning', 'id']]);           // ordning, sedan id som tiebreaker
  });
  it('läsfel, kast och data:null utan fel → null (aldrig en tyst tom kö)', async () => {
    expect(await lasKo(fake([], [{ slag: 'select', modus: 'fel' }]).sb)).toBeNull();
    expect(await lasKo(fake([], [{ slag: 'select', modus: 'kasta' }]).sb)).toBeNull();
    expect(await lasKo({ from: () => ({ select: () => ({ order: () => ({ order: async () => ({ data: null, error: null }) }) }) }) })).toBeNull();
  });
  it('en genuint tom kö är [] — inte null', async () => {
    expect(await lasKo(fake([]).sb)).toEqual([]);
  });
});

describe('laggIKoVerifierat', () => {
  it('lägger raden sist (ordning = högsta i databasen + 1 — INTE skärmens gamla kopia), läser tillbaka och ger kön som den är', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0), rad('b', 'M1', 'o2', 7), rad('x', 'M2', 'o9', 3)]);
    const r = await laggIKoVerifierat(f.sb, 'M1', 'o3');
    expect(r.ok).toBe(true); expect(r.meddelande).toBeNull();
    expect(f.skrivna).toEqual([{ slag: 'insert', patch: { maskin_id: 'M1', objekt_id: 'o3', ordning: 8 } }]);
    expect(f.anrop).toEqual(['select', 'insert', 'select']);        // läs färskt → skriv → läs tillbaka
    expect(r.ko).toHaveLength(4);
    expect(r.ko!.find((k) => k.objekt_id === 'o3')).toMatchObject({ maskin_id: 'M1', ordning: 8 });
  });
  it('tom kö → ordning 0', async () => {
    const f = fake([]);
    await laggIKoVerifierat(f.sb, 'M1', 'o1');
    expect(f.skrivna[0].patch).toMatchObject({ ordning: 0 });
  });
  it('objektet ligger redan i maskinens kö → ingen ny rad, målet är nått', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0)]);
    const r = await laggIKoVerifierat(f.sb, 'M1', 'o1');
    expect(r.ok).toBe(true); expect(f.skrivna).toEqual([]); expect(f.tabell).toHaveLength(1);
  });
  it('samma objekt i en ANNAN maskins kö hindrar inte (kö över roller bestäms av anroparen)', async () => {
    const f = fake([rad('a', 'M2', 'o1', 0)]);
    const r = await laggIKoVerifierat(f.sb, 'M1', 'o1');
    expect(r.ok).toBe(true); expect(f.tabell).toHaveLength(2);
  });
  it('skrivfel → misslyckat, "Kunde inte spara — försök igen", och kön är den som ligger i databasen (utan raden)', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0)], [{ slag: 'insert', modus: 'fel' }]);
    const r = await laggIKoVerifierat(f.sb, 'M1', 'o2');
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_SPARFEL);
    expect(ids(r.ko)).toEqual(['a']);
    expect(konsol).toHaveBeenCalled();                               // tekniken i konsolen
  });
  it('TYST skrivfel (OK utan att något landade) fångas av tillbakaläsningen', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0)], [{ slag: 'insert', modus: 'tyst' }]);
    const r = await laggIKoVerifierat(f.sb, 'M1', 'o2');
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_SPARFEL); expect(ids(r.ko)).toEqual(['a']);
  });
  it('skrivningen kastar (nätverk) → misslyckat, kön läses ändå tillbaka', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0)], [{ slag: 'insert', modus: 'kasta' }]);
    const r = await laggIKoVerifierat(f.sb, 'M1', 'o2');
    expect(r.ok).toBe(false); expect(ids(r.ko)).toEqual(['a']); expect(f.anrop[f.anrop.length - 1]).toBe('select');
  });
  it('någon annan lade samma objekt mellan min läsning och min skrivning: databasen avvisar (23505) men raden finns → ok, ingen förlust', async () => {
    const f = fake([], [], { insert: (t) => { t.push(rad('annan', 'M1', 'o1', 0)); } });
    const r = await laggIKoVerifierat(f.sb, 'M1', 'o1');
    expect(r.ok).toBe(true); expect(f.tabell).toHaveLength(1);
  });
  it('TYST TOM läsning efteråt (RLS, hickning) när kön hade rader → inte "kön är tom", utan "ladda om sidan" och skärmen rörs inte', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0)], [{ slag: 'select', modus: 'tyst', efter: 1 }]);
    const r = await laggIKoVerifierat(f.sb, 'M1', 'o2');
    expect(r).toMatchObject({ ok: false, meddelande: KO_LASFEL, ko: null });
  });
  it('kön går inte att läsa FÖRE skrivningen → inget skrivs, "försök igen" stämmer, skärmen rörs inte', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0)], [{ slag: 'select', modus: 'fel' }]);
    const r = await laggIKoVerifierat(f.sb, 'M1', 'o2');
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_SPARFEL); expect(r.ko).toBeNull();
    expect(f.skrivna).toEqual([]);
  });
  it('kön går inte att läsa EFTER skrivningen → okänt utfall: "ladda om sidan", skärmen rörs inte', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0)], [{ slag: 'select', modus: 'fel', efter: 1 }]);
    const r = await laggIKoVerifierat(f.sb, 'M1', 'o2');
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_LASFEL); expect(r.ko).toBeNull();
    expect(f.skrivna).toHaveLength(1);                                // skrivningen gjordes — därför kan vi inte säga "försök igen"
  });
});

describe('flyttaKoVerifierat', () => {
  const start = () => [rad('a', 'M1', 'o1', 0), rad('b', 'M1', 'o2', 1), rad('c', 'M2', 'o3', 4)];
  it('flyttar raden sist i målmaskinens kö (ordning = högsta + 1), läser tillbaka', async () => {
    const f = fake(start());
    const r = await flyttaKoVerifierat(f.sb, 'a', 'M2');
    expect(r.ok).toBe(true);
    expect(f.skrivna).toEqual([{ slag: 'update', id: 'a', patch: { maskin_id: 'M2', ordning: 5 } }]);
    expect(r.ko!.find((k) => k.id === 'a')).toMatchObject({ maskin_id: 'M2', ordning: 5 });
    expect(f.anrop).toEqual(['select', 'update', 'select']);
  });
  it('raden finns inte längre → inget skrivs, "Raden finns inte längre", kön ritas om', async () => {
    const f = fake(start());
    const r = await flyttaKoVerifierat(f.sb, 'borta', 'M2');
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_RAD_BORTA); expect(ids(r.ko)).toEqual(['a', 'b', 'c']);
    expect(f.skrivna).toEqual([]);
  });
  it('raden ligger redan i målets kö → inget att göra', async () => {
    const f = fake(start());
    const r = await flyttaKoVerifierat(f.sb, 'c', 'M2');
    expect(r.ok).toBe(true); expect(f.skrivna).toEqual([]);
  });
  it('skrivfel → raden ligger kvar där den låg, kön = databasens', async () => {
    const f = fake(start(), [{ slag: 'update', modus: 'fel' }]);
    const r = await flyttaKoVerifierat(f.sb, 'a', 'M2');
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_SPARFEL);
    expect(r.ko!.find((k) => k.id === 'a')).toMatchObject({ maskin_id: 'M1', ordning: 0 });
  });
  it('TYST update mot 0 rader fångas', async () => {
    const f = fake(start(), [{ slag: 'update', modus: 'tyst' }]);
    const r = await flyttaKoVerifierat(f.sb, 'a', 'M2');
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_SPARFEL); expect(r.ko!.find((k) => k.id === 'a')!.maskin_id).toBe('M1');
  });
  it('en update som bara DELVIS landade (maskinen byttes men inte ordningen) räknas inte som lyckad', async () => {
    const f = fake(start(), [{ slag: 'update', modus: 'delvis' }]);
    const r = await flyttaKoVerifierat(f.sb, 'a', 'M2');
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_SPARFEL);
    expect(r.ko!.find((k) => k.id === 'a')).toMatchObject({ maskin_id: 'M2', ordning: 0 }); // skärmen visar det som faktiskt ligger i databasen
  });
  it('målmaskinen har redan objektet (unik-spärren, 23505) → misslyckat, kön = databasens', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0), rad('d', 'M2', 'o1', 0)]);
    const r = await flyttaKoVerifierat(f.sb, 'a', 'M2');
    expect(r.ok).toBe(false); expect(ids(r.ko, 'M1')).toEqual(['a']);
  });
  it('tyst tom läsning efteråt → "ladda om sidan", skärmen rörs inte', async () => {
    const f = fake(start(), [{ slag: 'select', modus: 'tyst', efter: 1 }]);
    expect(await flyttaKoVerifierat(f.sb, 'a', 'M2')).toMatchObject({ ok: false, meddelande: KO_LASFEL, ko: null });
  });
  it('läsfel före → inget skrivs; läsfel efter → "ladda om sidan"', async () => {
    const fore = fake(start(), [{ slag: 'select', modus: 'fel' }]);
    expect((await flyttaKoVerifierat(fore.sb, 'a', 'M2'))).toMatchObject({ ok: false, meddelande: KO_SPARFEL, ko: null }); expect(fore.skrivna).toEqual([]);
    const efter = fake(start(), [{ slag: 'select', modus: 'fel', efter: 1 }]);
    expect((await flyttaKoVerifierat(efter.sb, 'a', 'M2'))).toMatchObject({ ok: false, meddelande: KO_LASFEL, ko: null });
  });
});

describe('taBortKoVerifierat', () => {
  const start = () => [rad('a', 'M1', 'o1', 0), rad('b', 'M1', 'o2', 1)];
  it('tar bort raden, läser tillbaka, kön utan den', async () => {
    const f = fake(start());
    const r = await taBortKoVerifierat(f.sb, 'a');
    expect(r.ok).toBe(true); expect(ids(r.ko)).toEqual(['b']); expect(f.anrop).toEqual(['select', 'delete', 'select']);
  });
  it('skrivfel → raden finns kvar, kön = databasens', async () => {
    const f = fake(start(), [{ slag: 'delete', modus: 'fel' }]);
    const r = await taBortKoVerifierat(f.sb, 'a');
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_SPARFEL); expect(ids(r.ko)).toEqual(['a', 'b']);
  });
  it('TYST delete (RLS: 200 + 0 rader) fångas', async () => {
    const f = fake(start(), [{ slag: 'delete', modus: 'tyst' }]);
    const r = await taBortKoVerifierat(f.sb, 'a');
    expect(r.ok).toBe(false); expect(ids(r.ko)).toEqual(['a', 'b']);
  });
  it('läsfel FÖRE → inget skrivs; läsfel EFTER borttagningen → "ladda om sidan"', async () => {
    const fore = fake(start(), [{ slag: 'select', modus: 'fel' }]);
    expect(await taBortKoVerifierat(fore.sb, 'a')).toMatchObject({ ok: false, meddelande: KO_SPARFEL, ko: null }); expect(fore.skrivna).toEqual([]);
    const efter = fake(start(), [{ slag: 'select', modus: 'fel', efter: 1 }]);
    expect(await taBortKoVerifierat(efter.sb, 'a')).toMatchObject({ ok: false, meddelande: KO_LASFEL, ko: null });
  });
  it('raden var redan borta → ingen skrivning alls', async () => {
    const f = fake(start());
    const r = await taBortKoVerifierat(f.sb, 'finns-inte');
    expect(r.ok).toBe(true); expect(f.skrivna).toEqual([]);
  });
  it('den SISTA raden får tömma kön; en tyst tom läsning när det fanns fler får inte läsas som "kön är tom"', async () => {
    const sista = fake([rad('a', 'M1', 'o1', 0)]);
    expect(await taBortKoVerifierat(sista.sb, 'a')).toMatchObject({ ok: true, ko: [] });
    const tyst = fake(start(), [{ slag: 'select', modus: 'tyst', efter: 1 }]);
    expect(await taBortKoVerifierat(tyst.sb, 'a')).toMatchObject({ ok: false, meddelande: KO_LASFEL, ko: null });
  });
});

describe('skrivOrdningVerifierat', () => {
  // M1: a(0) b(1) c(2) + dold d(3, avslutad) + dold e(4); M2: x(0)
  const start = () => [rad('a', 'M1', 'o1', 0), rad('b', 'M1', 'o2', 1), rad('c', 'M1', 'o3', 2), rad('d', 'M1', 'o4', 3), rad('e', 'M1', 'o5', 4), rad('x', 'M2', 'o9', 0)];
  const ordning = (ko: MaskinKoItem[] | null, maskin: string) => (ko ?? []).filter((k) => k.maskin_id === maskin).sort((p, q) => p.ordning - q.ordning).map((k) => `${k.id}=${k.ordning}`);
  it('synliga i ny ordning först, dolda efter i sin gamla ordning; ordning 0..n-1; andra maskiner orörda', async () => {
    const f = fake(start());
    const r = await skrivOrdningVerifierat(f.sb, 'M1', ['c', 'a', 'b']);
    expect(r.ok).toBe(true);
    expect(ordning(r.ko, 'M1')).toEqual(['c=0', 'a=1', 'b=2', 'd=3', 'e=4']);
    expect(ordning(r.ko, 'M2')).toEqual(['x=0']);
    expect(f.skrivna.every((s) => s.slag === 'update')).toBe(true);
    expect(f.skrivna.map((s) => s.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);   // x skrevs aldrig
  });
  it('ett skrivfel på en av raderna → misslyckat, kön = den blandade ordning som faktiskt ligger i databasen', async () => {
    const f = fake(start(), [{ slag: 'update', modus: 'fel', efter: 1, antal: 1 }]); // den andra uppdateringen faller
    const r = await skrivOrdningVerifierat(f.sb, 'M1', ['c', 'a', 'b']);
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_SPARFEL);
    expect(r.ko).not.toBeNull();
    expect(r.ko!.filter((k) => k.maskin_id === 'M1').map((k) => `${k.id}=${k.ordning}`).sort()).not.toEqual(['a=1', 'b=2', 'c=0', 'd=3', 'e=4']);
  });
  it('TYST update mot en rad (0 rader, inget fel) fångas', async () => {
    const f = fake(start(), [{ slag: 'update', modus: 'tyst', efter: 2, antal: 1 }]);
    const r = await skrivOrdningVerifierat(f.sb, 'M1', ['c', 'a', 'b']);
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_SPARFEL);
  });
  it('alla uppdateringar fel → databasen oförändrad och kön visar det', async () => {
    const f = fake(start(), [{ slag: 'update', modus: 'fel' }]);
    const r = await skrivOrdningVerifierat(f.sb, 'M1', ['c', 'a', 'b']);
    expect(r.ok).toBe(false); expect(ordning(r.ko, 'M1')).toEqual(['a=0', 'b=1', 'c=2', 'd=3', 'e=4']);
  });
  it('skärmen är ur fas: ett id som inte längre finns → inget skrivs, kön ritas om från databasen', async () => {
    const f = fake(start());
    const r = await skrivOrdningVerifierat(f.sb, 'M1', ['c', 'spöke', 'a']);
    expect(r.ok).toBe(false); expect(r.meddelande).toBe(KO_SPARFEL); expect(f.skrivna).toEqual([]);
    expect(ordning(r.ko, 'M1')).toEqual(['a=0', 'b=1', 'c=2', 'd=3', 'e=4']);
  });
  it('ett id från en ANNAN maskin avvisas på samma sätt (en skrivning får aldrig röra en annan kö)', async () => {
    const f = fake(start());
    const r = await skrivOrdningVerifierat(f.sb, 'M1', ['a', 'x']);
    expect(r.ok).toBe(false); expect(f.skrivna).toEqual([]);
  });
  it('dubbla id:n avvisas', async () => {
    const f = fake(start());
    expect((await skrivOrdningVerifierat(f.sb, 'M1', ['a', 'a'])).ok).toBe(false); expect(f.skrivna).toEqual([]);
  });
  it('tyst tom läsning efteråt → "ladda om sidan", skärmen rörs inte', async () => {
    const f = fake(start(), [{ slag: 'select', modus: 'tyst', efter: 1 }]);
    expect(await skrivOrdningVerifierat(f.sb, 'M1', ['b', 'a'])).toMatchObject({ ok: false, meddelande: KO_LASFEL, ko: null });
  });
  it('läsfel före → inget skrivs; läsfel efter → "ladda om sidan"', async () => {
    const fore = fake(start(), [{ slag: 'select', modus: 'fel' }]);
    expect(await skrivOrdningVerifierat(fore.sb, 'M1', ['b', 'a'])).toMatchObject({ ok: false, meddelande: KO_SPARFEL, ko: null }); expect(fore.skrivna).toEqual([]);
    const efter = fake(start(), [{ slag: 'select', modus: 'fel', efter: 1 }]);
    expect(await skrivOrdningVerifierat(efter.sb, 'M1', ['b', 'a'])).toMatchObject({ ok: false, meddelande: KO_LASFEL, ko: null });
  });
  it('lika ordning i databasen (oordnad kö) → de dolda hamnar ändå i stabil ordning efter de synliga', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0), rad('b', 'M1', 'o2', 0), rad('c', 'M1', 'o3', 0)]);
    const r = await skrivOrdningVerifierat(f.sb, 'M1', ['c']);
    expect(r.ok).toBe(true); expect(ordning(r.ko, 'M1')).toEqual(['c=0', 'a=1', 'b=2']);
  });
});

describe('skapaKoKedja — en köskrivning i taget', () => {
  const vila = (ms: number) => new Promise((r) => setTimeout(r, ms));
  it('körs strikt efter varandra i startordning, även när den första är långsammare', async () => {
    const kor = skapaKoKedja(); const logg: string[] = [];
    const a = kor(async () => { logg.push('a-start'); await vila(30); logg.push('a-slut'); return 1; });
    const b = kor(async () => { logg.push('b-start'); await vila(1); logg.push('b-slut'); return 2; });
    expect(await Promise.all([a, b])).toEqual([1, 2]);
    expect(logg).toEqual(['a-start', 'a-slut', 'b-start', 'b-slut']);
  });
  it('en skrivning som kastar stoppar inte nästa (och felet når den som väntade på just den)', async () => {
    const kor = skapaKoKedja();
    const a = kor(async () => { throw new Error('bom'); });
    const b = kor(async () => 'ok');
    await expect(a).rejects.toThrow('bom');
    expect(await b).toBe('ok');
  });
  it('två lägg-i-kö i rad mot SAMMA maskin får olika ordning (den andra läser kön efter den första)', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0)]); const kor = skapaKoKedja();
    const [r1, r2] = await Promise.all([kor(() => laggIKoVerifierat(f.sb, 'M1', 'o2')), kor(() => laggIKoVerifierat(f.sb, 'M1', 'o3'))]);
    expect(r1.ok && r2.ok).toBe(true);
    expect(f.tabell.map((k) => k.ordning).sort()).toEqual([0, 1, 2]);
  });
  it('UTAN kedjan krockar de (visar varför den finns): båda läser samma högsta ordning', async () => {
    const f = fake([rad('a', 'M1', 'o1', 0)]);
    await Promise.all([laggIKoVerifierat(f.sb, 'M1', 'o2'), laggIKoVerifierat(f.sb, 'M1', 'o3')]);
    expect(f.tabell.map((k) => k.ordning).sort()).toEqual([0, 1, 1]);
  });
});
