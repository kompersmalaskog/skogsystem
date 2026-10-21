// Testsele för inventarievyn: en Supabase-klient i minnet med tabellerna och de sex databasfunktionerna.
// Funktionerna gör samma sak som i migrationerna 20261021131728_inventarier_grund.sql och 20261021155858/155913
// (antal, logg, beställd, flytt med sammanslagning, två lådor) — notisen provas i databasen, inte här. Används bara av *.render.test.tsx.

type Row = Record<string, any>;

export type FakeDb = {
  tabeller: Record<string, Row[]>;
  logg: Row[];
  rpcAnrop: { namn: string; args: Row }[];
  /** Nästa anrop till den här funktionen svarar med ett fel (som databasen gör). */
  felPa: Record<string, string>;
};

let nastaId = 1;
const nyttId = (p: string) => `${p}-${nastaId++}`;

export function nyFakeDb(start: Record<string, Row[]>): FakeDb {
  return { tabeller: structuredClone(start), logg: [], rpcAnrop: [], felPa: {} };
}

export function fakeKlient(db: FakeDb) {
  const tabell = (t: string) => (db.tabeller[t] ??= []);

  function from(t: string) {
    let filter: [string, any][] = [];
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let nytt: Row | null = null;
    let enkel = false;

    const kor = () => {
      const match = (r: Row) => filter.every(([k, v]) => r[k] === v);
      if (op === 'insert') {
        const rad: Row = { id: nyttId(t), aktiv: true, ...nytt };
        if (t === 'inventarie_rad') { rad.bestalld_tid ??= null; rad.tva_lador ??= false; rad.reserv_oppnad_tid ??= null; rad.reserv_oppnad_av ??= null; }
        tabell(t).push(rad);
        return { data: enkel ? rad : [rad], error: null };
      }
      if (op === 'update') {
        const traff = tabell(t).filter(match);
        traff.forEach(r => Object.assign(r, nytt));
        return { data: traff.map(r => ({ id: r.id })), error: null };
      }
      if (op === 'delete') {
        const traff = tabell(t).filter(match);
        db.tabeller[t] = tabell(t).filter(r => !match(r));
        return { data: traff.map(r => ({ id: r.id })), error: null };
      }
      const rader = tabell(t).filter(match).map(r => ({ ...r }));
      return { data: enkel ? rader[0] ?? null : rader, error: null };
    };

    const b: any = {
      select: () => b,
      eq: (k: string, v: any) => { filter.push([k, v]); return b; },
      order: () => b,
      insert: (o: Row) => { op = 'insert'; nytt = o; return b; },
      update: (o: Row) => { op = 'update'; nytt = o; return b; },
      delete: () => { op = 'delete'; return b; },
      single: () => { enkel = true; return b; },
      maybeSingle: () => { enkel = true; return b; },
      then: (res: any, rej: any) => Promise.resolve(kor()).then(res, rej),
    };
    return b;
  }

  async function rpc(namn: string, args: Row) {
    db.rpcAnrop.push({ namn, args });
    if (db.felPa[namn]) {
      const fel = db.felPa[namn];
      delete db.felPa[namn];
      return { data: null, error: { message: fel } };
    }
    const rader = tabell('inventarie_rad');
    const r = rader.find(x => x.id === args.p_rad_id);
    const logga = (handelse: string, extra: Row = {}) =>
      db.logg.push({ handelse, rad_id: r?.id ?? null, artikel_id: r?.artikel_id ?? null, plats_id: r?.plats_id ?? null, ...extra });
    switch (namn) {
      case 'inventarie_ta_ut':
        if (!r) return { data: null, error: { message: 'Etiketten pekar inte på någon artikel längre' } };
        if (r.tva_lador) return { data: null, error: { message: 'Den här har två lådor – skanna reservlådan när du börjar på den' } };
        if (r.antal == null) return { data: null, error: { message: 'Den här räknas inte' } };
        r.antal = Math.max((r.antal ?? 0) - args.p_antal, 0);
        logga('uttag', { andring: -args.p_antal, antal_efter: r.antal });
        return { data: r.antal, error: null };
      case 'inventarie_kommit_in':
        if (!r) return { data: null, error: { message: 'Raden finns inte' } };
        r.antal = r.tva_lador ? null : (r.antal ?? 0) + args.p_antal;
        r.bestalld_tid = null; r.reserv_oppnad_tid = null; r.reserv_oppnad_av = null;
        logga('kommit_in', { andring: r.tva_lador ? null : args.p_antal, antal_efter: r.antal });
        return { data: r.antal, error: null };
      case 'inventarie_justera':
        if (!r) return { data: null, error: { message: 'Raden finns inte' } };
        logga('justering', { andring: args.p_nytt_antal - (r.antal ?? 0), antal_efter: args.p_nytt_antal });
        r.antal = args.p_nytt_antal;
        return { data: r.antal, error: null };
      case 'inventarie_reserv_oppnad': {
        if (!r) return { data: null, error: { message: 'Etiketten pekar inte på någon artikel längre' } };
        if (!r.tva_lador) return { data: null, error: { message: 'Den här räknas – den har ingen reservlåda' } };
        const redan = !!r.reserv_oppnad_tid;
        if (!redan) { r.reserv_oppnad_tid = `2026-10-21T13:00:0${db.logg.length % 10}.123456+00:00`; r.reserv_oppnad_av = 'martin'; logga('reserv_oppnad'); }
        const namn = tabell('medarbetare').find(m => m.id === r.reserv_oppnad_av)?.namn ?? null;
        return { data: { tid: r.reserv_oppnad_tid, redan, av_namn: namn }, error: null };
      }
      case 'inventarie_reserv_angra':
        if (!r || r.reserv_oppnad_tid !== args.p_tid || r.bestalld_tid) return { data: false, error: null };
        r.reserv_oppnad_tid = null; r.reserv_oppnad_av = null; logga('reserv_angrad');
        return { data: true, error: null };
      case 'inventarie_markera_bestalld':
        if (!r) return { data: null, error: { message: 'Raden finns inte' } };
        r.bestalld_tid = args.p_bestalld ? '2026-10-21T13:00:00Z' : null;
        if (args.p_bestalld) logga('bestalld', { antal_efter: r.antal });
        return { data: null, error: null };
      case 'inventarie_flytta': {
        if (!r) return { data: null, error: { message: 'Raden finns inte' } };
        const mal = rader.find(x => x.artikel_id === r.artikel_id && x.plats_id === args.p_till_plats_id);
        const fran = r.plats_id;
        let id = r.id;
        if (!mal) { r.plats_id = args.p_till_plats_id; r.hylla = null; }
        else {
          mal.antal = mal.antal == null && r.antal == null ? null : (mal.antal ?? 0) + (r.antal ?? 0);
          db.tabeller.inventarie_rad = rader.filter(x => x.id !== r.id);
          id = mal.id;
        }
        db.logg.push({ handelse: 'flytt', rad_id: id, artikel_id: r.artikel_id, plats_id: fran, till_plats_id: args.p_till_plats_id });
        return { data: id, error: null };
      }
      case 'inventarie_plats_kollad': {
        const p = tabell('inventarie_plats').find(x => x.id === args.p_plats_id);
        if (!p) return { data: null, error: { message: 'Platsen finns inte' } };
        p.senast_kollad = '2026-10-21T13:00:00Z'; p.senast_kollad_av = 'martin';
        db.logg.push({ handelse: 'kollad', plats_id: p.id });
        return { data: null, error: null };
      }
    }
    return { data: null, error: { message: `okänd funktion ${namn}` } };
  }

  return { from, rpc };
}

/** Grunddatan: hallen och LBC Ryd (som i prod), Wisents depåskåp, två maskiner, Martin. */
export function grunddata(): Record<string, Row[]> {
  return {
    inventarie_plats: [
      { id: 'hall', namn: 'Maskinhallen', typ: 'hall', maskin_id: null, ansvarig_medarbetare_id: null, senast_kollad: null, senast_kollad_av: null, ordning: 1, aktiv: true },
      { id: 'lbc', namn: 'LBC Ryd', typ: 'verkstad', maskin_id: null, ansvarig_medarbetare_id: null, senast_kollad: null, senast_kollad_av: null, ordning: 2, aktiv: true },
      { id: 'skap-w', namn: 'Depåskåp Wisent', typ: 'skap', maskin_id: 'A030353', ansvarig_medarbetare_id: null, senast_kollad: null, senast_kollad_av: null, ordning: 3, aktiv: true },
    ],
    inventarie_artikel: [],
    inventarie_rad: [],
    dim_maskin: [
      { maskin_id: 'A030353', visningsnamn: 'Wisent', maskin_typ: 'Forwarder', aktiv_till: null, sald: false },
      { maskin_id: 'PONS20SDJAA270231', visningsnamn: 'Giant', maskin_typ: 'Harvester', aktiv_till: null, sald: false },
    ],
    medarbetare: [
      { id: 'martin', namn: 'Martin Lindqvist', aktiv: true },
      { id: 'stefan', namn: 'Stefan Karlsson', aktiv: true },
    ],
  };
}
