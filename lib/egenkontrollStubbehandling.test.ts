import { describe, expect, it } from 'vitest';
import { generateEgenkontroll, stubbehandlingKravs } from './egenkontroll';

// STUBBEHANDLINGSPUNKTEN STYRS AV dim_objekt.stubbbehandling - och av ingenting annat.
//
// generateEgenkontroll har aldrig haft ett test; det har ar det. Den gamla regeln (avslutsdatum i maj-september)
// lade punkten pa 7 slutavverkningar i prod. Testet kor HELA genereringen mot en fejkad klient och tittar pa vad som
// faktiskt skrivs: vilka punkter som sattes in, och att ett lasfel avbryter innan nagot skrivits.

type Kedja = { tabell: string; ops: [string, ...any[]][] };
type Svar = { data: any; error: any };

type DimRad = { objekt_id: string; vo_nummer: string | null; stubbbehandling: boolean | null };

type Varld = {
  objekt: Record<string, unknown>;
  dim: DimRad[];
  /** Finns redan en pagaende runda? */
  pagaende?: boolean;
  /** Fel pa lasningen av dim_objekt. */
  dimFel?: string;
};

function bygg(v: Varld) {
  const kedjor: Kedja[] = [];
  const insattaPunkter: any[] = [];
  let skapadeRundor = 0;

  const eq = (k: Kedja, kolumn: string) => k.ops.find((o) => o[0] === 'eq' && o[1] === kolumn)?.[2];

  const svar = (k: Kedja): Svar => {
    const ins = k.ops.find((o) => o[0] === 'insert');
    const del = k.ops.find((o) => o[0] === 'delete');
    switch (k.tabell) {
      case 'objekt':
        return { data: v.objekt, error: null };
      case 'dim_objekt': {
        if (v.dimFel) return { data: null, error: { message: v.dimFel } };
        const kolumn = k.ops.find((o) => o[0] === 'eq')![1] as 'objekt_id' | 'vo_nummer';
        const varde = k.ops.find((o) => o[0] === 'eq')![2];
        return { data: v.dim.filter((r) => r[kolumn] === varde), error: null };
      }
      case 'egenkontroll':
        if (ins) { skapadeRundor++; return { data: { id: 'runda-ny', status: 'pagaende', ...ins[1] }, error: null }; }
        if (del) return { data: null, error: null };
        if (k.ops.some((o) => o[0] === 'update')) return { data: { id: 'runda-ny', status: 'pagaende', vader: {} }, error: null };
        // hamtaPagaende
        return { data: v.pagaende ? { id: 'runda-gammal', status: 'pagaende' } : null, error: null };
      case 'egenkontroll_punkt':
        if (ins) { insattaPunkter.push(...(Array.isArray(ins[1]) ? ins[1] : [ins[1]])); return { data: null, error: null }; }
        return { data: [], error: null };
      default:
        // planering_markeringar, fakt_produktion, fakt_lass: inga rader.
        return { data: [], error: null };
    }
  };

  const klient: any = {
    from(tabell: string) {
      const k: Kedja = { tabell, ops: [] };
      kedjor.push(k);
      const b: any = new Proxy({}, {
        get(_t, op: string) {
          if (op === 'then') return (res: any, rej: any) => Promise.resolve(svar(k)).then(res, rej);
          return (...args: any[]) => { k.ops.push([op, ...args]); return b; };
        },
      });
      return b;
    },
  };
  void eq;
  return { klient, kedjor, insattaPunkter, skapadeRundor: () => skapadeRundor };
}

const objekt = (over: Record<string, unknown> = {}) => ({
  id: 'ob-1', namn: 'Testtrakt', typ: 'gallring', areal: null, vo_nummer: '11219961',
  kartbild_bounds: null, lat: null, lng: null, dim_objekt_id: null,
  skordare_maskin: null, skotare_maskin: null,
  ...over,
});

const stubbepunkter = (rader: any[]) => rader.filter((r) => r.punkt_typ === 'stubbehandling');

async function kor(v: Varld) {
  const w = bygg(v);
  const res = await generateEgenkontroll('ob-1', { klient: w.klient });
  return { ...w, res };
}

describe('uppslaget: dim_objekt_id forst, annars vo_nummer vid EXAKT en traff', () => {
  it('dim_objekt_id -> en rad med true: punkten skapas', async () => {
    const { insattaPunkter, res } = await kor({
      objekt: objekt({ dim_objekt_id: '11124774', vo_nummer: '11124774' }),
      dim: [{ objekt_id: '11124774', vo_nummer: '11124774', stubbbehandling: true }],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(1);
    expect(res.antalMatningspunkter).toBe(1);
  });

  it('dim_objekt_id -> en rad med false: ingen punkt', async () => {
    const { insattaPunkter, res } = await kor({
      objekt: objekt({ dim_objekt_id: 'A' }),
      dim: [{ objekt_id: 'A', vo_nummer: '11219961', stubbbehandling: false }],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(0);
    expect(res.antalMatningspunkter).toBe(0);
  });

  it('dim_objekt_id -> en rad med null: ingen punkt (bara true raknas)', async () => {
    const { insattaPunkter } = await kor({
      objekt: objekt({ dim_objekt_id: 'A' }),
      dim: [{ objekt_id: 'A', vo_nummer: '11219961', stubbbehandling: null }],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(0);
  });

  it('dim_objekt_id SAKNAS, exakt EN vo-traff med true: punkten skapas (plastret)', async () => {
    const { insattaPunkter } = await kor({
      objekt: objekt({ dim_objekt_id: null, vo_nummer: '11219961' }),
      dim: [{ objekt_id: '11219961', vo_nummer: '11219961', stubbbehandling: true }],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(1);
  });

  it('dim_objekt_id SAKNAS, exakt en vo-traff med false: ingen punkt', async () => {
    const { insattaPunkter } = await kor({
      objekt: objekt({ dim_objekt_id: null, vo_nummer: '11241031', typ: 'slutavverkning' }),
      dim: [{ objekt_id: '11241031', vo_nummer: '11241031', stubbbehandling: false }],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(0);
  });

  it('TVA vo-traffar ger ingen punkt - aven om en av dem ar true (Jatsbygd har tva dim_objekt-rader)', async () => {
    const { insattaPunkter } = await kor({
      objekt: objekt({ dim_objekt_id: null, vo_nummer: '11217392' }),
      dim: [
        { objekt_id: '11217392', vo_nummer: '11217392', stubbbehandling: true },
        { objekt_id: 'A130743_7', vo_nummer: '11217392', stubbbehandling: false },
      ],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(0);
  });

  it('NOLL vo-traffar ger ingen punkt', async () => {
    const { insattaPunkter } = await kor({
      objekt: objekt({ dim_objekt_id: null, vo_nummer: '11037781' }),
      dim: [{ objekt_id: '999', vo_nummer: '999', stubbbehandling: true }],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(0);
  });

  it('dim_objekt_id pekar pa en rad som inte finns: vo_nummer provas', async () => {
    const { insattaPunkter } = await kor({
      objekt: objekt({ dim_objekt_id: 'SAKNAS', vo_nummer: '11219961' }),
      dim: [{ objekt_id: '11219961', vo_nummer: '11219961', stubbbehandling: true }],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(1);
  });

  it('en FUNNEN dim_objekt_id-rad gar alltid forst: false pa id:t vinner over true pa vo-numret', async () => {
    const { insattaPunkter } = await kor({
      objekt: objekt({ dim_objekt_id: 'A', vo_nummer: '11219961' }),
      dim: [
        { objekt_id: 'A', vo_nummer: null, stubbbehandling: false },
        { objekt_id: 'B', vo_nummer: '11219961', stubbbehandling: true },
      ],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(0);
  });

  it('varken id eller vo-nummer: ingen punkt, och dim_objekt fragas inte ens', async () => {
    const { insattaPunkter, kedjor } = await kor({
      objekt: objekt({ dim_objekt_id: null, vo_nummer: null }),
      dim: [{ objekt_id: 'A', vo_nummer: null, stubbbehandling: true }],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(0);
    expect(kedjor.some((k) => k.tabell === 'dim_objekt')).toBe(false);
  });

  it('blanka id och vo-nummer raknas som saknade', async () => {
    const { insattaPunkter, kedjor } = await kor({
      objekt: objekt({ dim_objekt_id: '   ', vo_nummer: '  ' }),
      dim: [],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(0);
    expect(kedjor.some((k) => k.tabell === 'dim_objekt')).toBe(false);
  });
});

describe('SASONGEN SPELAR INGEN ROLL - fran det har ar faltet kallan', () => {
  it('avslutat i juli men stubbbehandling = false: ingen punkt (det gamla villkoret hade lagt den)', async () => {
    const { insattaPunkter } = await kor({
      objekt: objekt({ typ: 'slutavverkning', avslutad_timestamp: '2026-07-15T10:00:00Z', faktisk_slut: '2026-07-15', dim_objekt_id: 'A' }),
      dim: [{ objekt_id: 'A', vo_nummer: '11241031', stubbbehandling: false }],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(0);
  });

  it('avslutat i oktober men stubbbehandling = true: punkten skapas (det gamla villkoret hade missat den)', async () => {
    const { insattaPunkter } = await kor({
      objekt: objekt({ avslutad_timestamp: '2026-10-20T10:00:00Z', dim_objekt_id: 'A' }),
      dim: [{ objekt_id: 'A', vo_nummer: '11105602', stubbbehandling: true }],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(1);
  });

  it('saknar avslutsdatum helt: faltet avgor anda', async () => {
    const { insattaPunkter } = await kor({
      objekt: objekt({ avslutad_timestamp: null, faktisk_slut: null, dim_objekt_id: 'A' }),
      dim: [{ objekt_id: 'A', vo_nummer: null, stubbbehandling: true }],
    });
    expect(stubbepunkter(insattaPunkter)).toHaveLength(1);
  });
});

describe('punktens plats och form', () => {
  it('stubbehandling ar en matning, kalla fast, och den SISTA i rundans ordning', async () => {
    const { insattaPunkter } = await kor({
      objekt: objekt({ dim_objekt_id: 'A' }),
      dim: [{ objekt_id: 'A', vo_nummer: null, stubbbehandling: true }],
    });
    const stubbe = stubbepunkter(insattaPunkter)[0];
    expect(stubbe).toMatchObject({ del: 'matning', kalla: 'fast', rubrik: 'Stubbehandling', status: null, egenkontroll_id: 'runda-ny' });
    expect(stubbe.ordning).toBe(Math.max(...insattaPunkter.map((p) => p.ordning)));
  });

  it('utan stubbehandling finns inga matningar - utforandet ar oforandrat', async () => {
    const med = await kor({
      objekt: objekt({ dim_objekt_id: 'A' }),
      dim: [{ objekt_id: 'A', vo_nummer: null, stubbbehandling: true }],
    });
    const utan = await kor({
      objekt: objekt({ dim_objekt_id: 'A' }),
      dim: [{ objekt_id: 'A', vo_nummer: null, stubbbehandling: false }],
    });
    expect(utan.insattaPunkter.filter((p) => p.del === 'matning')).toHaveLength(0);
    expect(med.insattaPunkter).toHaveLength(utan.insattaPunkter.length + 1);
    const utforande = (r: any[]) => r.filter((p) => p.del === 'utforande').map((p) => p.punkt_typ);
    expect(utforande(med.insattaPunkter)).toEqual(utforande(utan.insattaPunkter));
  });
});

describe('FEL: ett lasfel far aldrig bli en tyst "ingen punkt"', () => {
  it('dim_objekt gar inte att lasa: genereringen KASTAR och ingenting har skrivits', async () => {
    const w = bygg({ objekt: objekt({ dim_objekt_id: 'A' }), dim: [], dimFel: 'nat nere' });
    await expect(generateEgenkontroll('ob-1', { klient: w.klient })).rejects.toThrow(/Kunde inte läsa stubbehandling ur dim_objekt: nat nere/);
    expect(w.skapadeRundor()).toBe(0);
    expect(w.insattaPunkter).toHaveLength(0);
    // ... och ingen skrivning alls mot egenkontroll-tabellerna
    expect(w.kedjor.some((k) => k.tabell.startsWith('egenkontroll') && k.ops.some((o) => ['insert', 'update', 'delete'].includes(o[0])))).toBe(false);
  });

  it('lasfelet galler aven vo-nummer-steget', async () => {
    const w = bygg({ objekt: objekt({ dim_objekt_id: null, vo_nummer: '1' }), dim: [], dimFel: 'timeout' });
    await expect(generateEgenkontroll('ob-1', { klient: w.klient })).rejects.toThrow(/timeout/);
    expect(w.skapadeRundor()).toBe(0);
  });
});

describe('en pagaende runda finns redan', () => {
  it('returneras utan att dim_objekt lases och utan att nagot skrivs', async () => {
    const w = bygg({ objekt: objekt({ dim_objekt_id: 'A' }), dim: [{ objekt_id: 'A', vo_nummer: null, stubbbehandling: true }], pagaende: true });
    const res = await generateEgenkontroll('ob-1', { klient: w.klient });
    expect(res.nyskapad).toBe(false);
    expect(w.kedjor.some((k) => k.tabell === 'dim_objekt')).toBe(false);
    expect(w.insattaPunkter).toHaveLength(0);
    expect(w.skapadeRundor()).toBe(0);
  });
});

describe('stubbehandlingKravs direkt', () => {
  const klientMed = (dim: DimRad[]) => bygg({ objekt: {}, dim }).klient;

  it('trimmar id och vo-nummer', async () => {
    const klient = klientMed([{ objekt_id: '1', vo_nummer: '2', stubbbehandling: true }]);
    expect(await stubbehandlingKravs(klient, { dim_objekt_id: ' 1 ' })).toBe(true);
    expect(await stubbehandlingKravs(klient, { dim_objekt_id: null, vo_nummer: ' 2 ' })).toBe(true);
  });

  it('icke-text som id och vo-nummer raknas som saknade', async () => {
    const klient = klientMed([{ objekt_id: '1', vo_nummer: '2', stubbbehandling: true }]);
    expect(await stubbehandlingKravs(klient, { dim_objekt_id: 1, vo_nummer: 2 })).toBe(false);
    expect(await stubbehandlingKravs(klient, {})).toBe(false);
  });

  it('tva rader pa SAMMA dim_objekt_id (borde inte finnas) ar oklart: ingen punkt', async () => {
    const klient = klientMed([
      { objekt_id: '1', vo_nummer: null, stubbbehandling: true },
      { objekt_id: '1', vo_nummer: null, stubbbehandling: true },
    ]);
    expect(await stubbehandlingKravs(klient, { dim_objekt_id: '1', vo_nummer: '9' })).toBe(false);
  });
});
