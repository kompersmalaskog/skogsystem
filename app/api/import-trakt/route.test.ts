// @vitest-environment node
//
// Hela /api/import-trakt (POST) genom en minnesdatabas: INSERT, handrättning, omimport, fil utan Ursprung, migration ej körd.
// Det som är fejkat är kanterna — inloggning, storage, PDF-textutdraget (unpdf), envz-uppackningen och geometrin. Parsrarna, mergen,
// omimport-skyddet och tolerans mot saknade kolumner är de riktiga. TD-texten är SYNTETISK (lib/trakt/__fixtures__/td-text.ts), inte en
// riktig Skälviken-fil: den här miljön når inte trakt-inbox.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tdText } from '@/lib/trakt/__fixtures__/td-text';

const h = vi.hoisted(() => ({ text: '', db: null as any }));

vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [] }) }));
vi.mock('unpdf', () => ({ extractText: async () => ({ text: h.text }) }));
vi.mock('@/lib/hyttsparKoppling', () => ({ kopplaHyttsparTillObjekt: async () => ({ ok: true, kopplade: 0 }) }));
vi.mock('@/lib/trakt/geometri', () => ({ packaGeometri: async () => ({ features: [], varningar: [] }), bboxCentrum: () => null }));
vi.mock('@/lib/trakt/envz', () => ({
  packaUppEnvz: async () => ({
    version: 'test', ogiXml: null, varningar: [],
    bilagor: new Map<string, Buffer>([
      ['887818_TD.pdf', Buffer.from('%PDF-td')],
      ['object-info.xml', Buffer.from(h.db.objectInfo, 'utf-8')],
    ]),
  }),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: () => h.db.klient() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.db.klient() }));

import { NextRequest } from 'next/server';
import { POST } from './route';

const OBJECT_INFO = (o: { purpose?: string; target?: number; area?: string } = {}) => `<?xml version="1.0"?><ObjectInfo>
  <Objectnumber>887818</Objectnumber><orderNumber>11161397</orderNumber><Objectname>Skälviken RP J-Hus- 25</Objectname>
  <Requestor>Vida</Requestor><Purpose>${o.purpose ?? 'Slutavverkning'}</Purpose><Area>${o.area ?? '3,6'}</Area><Target>${o.target ?? 950}</Target>
  <Executor>556990-3940</Executor></ObjectInfo>`;

/** Minnesdatabas för tabellerna routen rör. `saknasKolumner` = kolumner PostgREST inte känner till (migrationen ej körd). */
function minnesDb(saknasKolumner: string[] = []) {
  const tabeller: Record<string, any[]> = { objekt: [], objekt_alt_nummer: [], import_fel: [], objekt_geometri: [] };
  let nastaId = 1;
  const kolumnFel = (rad: Record<string, any>) => {
    const k = saknasKolumner.find((c) => c in rad);
    return k ? { code: 'PGRST204', message: `Could not find the '${k}' column of 'objekt' in the schema cache` } : null;
  };
  function from(t: string) {
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select';
    let payload: any; let lim: number | undefined; let enda = false;
    const filter: Array<(r: any) => boolean> = [];
    const kor = () => {
      if (t === 'medarbetare') return { data: { roll: 'admin' }, error: null };
      const rader = (tabeller[t] ??= []);
      if (op === 'insert') {
        const fel = t === 'objekt' ? kolumnFel(payload) : null;
        if (fel) return { data: null, error: fel };
        const rad = { id: `u${nastaId++}`, status: 'planerad', ...payload };
        rader.push(rad);
        return { data: enda ? { ...rad } : [{ ...rad }], error: null };
      }
      const traffar = rader.filter((r) => filter.every((f) => f(r)));
      if (op === 'update') {
        const fel = t === 'objekt' ? kolumnFel(payload) : null;
        if (fel) return { data: null, error: fel };
        traffar.forEach((r) => Object.assign(r, payload));
        return { data: enda ? { ...traffar[0] } : traffar.map((r) => ({ ...r })), error: null };
      }
      if (op === 'delete') { tabeller[t] = rader.filter((r) => !traffar.includes(r)); return { data: null, error: null }; }
      const ut = traffar.slice(0, lim ?? traffar.length).map((r) => ({ ...r }));
      return { data: enda ? ut[0] ?? null : ut, error: null };
    };
    const b: any = {
      select: () => b, insert: (p: any) => { op = 'insert'; payload = p; return b; }, update: (p: any) => { op = 'update'; payload = p; return b; },
      delete: () => { op = 'delete'; return b; },
      eq: (k: string, v: any) => { filter.push((r) => r[k] === v); return b; },
      is: (k: string, v: any) => { filter.push((r) => (r[k] ?? null) === v); return b; },
      limit: (n: number) => { lim = n; return b; }, single: () => { enda = true; return b; },
      then: (res: any, rej: any) => Promise.resolve(kor()).then(res, rej),
    };
    return b;
  }
  const klient = () => ({
    auth: { getUser: async () => ({ data: { user: { email: 'martin@example.se' } } }) },
    from,
    storage: { from: () => ({ download: async () => ({ data: new Blob(['x']), error: null }), upload: async () => ({ error: null }) }) },
  });
  return { tabeller, klient, objectInfo: OBJECT_INFO() };
}

async function importera(text: string, objectInfo = OBJECT_INFO()) {
  h.text = text;
  h.db.objectInfo = objectInfo;
  const res = await POST(new NextRequest('http://localhost/api/import-trakt', { method: 'POST', body: JSON.stringify({ sokvag: 'skalviken.envz', ar: 2026, manad: 10 }) }));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => { h.db = minnesDb(); });

describe('import av Skälviken (VO 11161397)', () => {
  it('rotpost blir avtalsform Rp — inte Au', async () => {
    const r = await importera(tdText({ ursprung: 'Rotpost' }));
    expect(r.status).toBe(200);
    const rad = h.db.tabeller.objekt[0];
    expect(rad).toMatchObject({ vo_nummer: '11161397', avtalsform: 'Rp', typ: 'slutavverkning' });
    expect(rad.avtalsform).not.toBe('Au');
  });

  it('åtgärden hårdkodas inte längre: utan Arbetsform i filen är den tom (Redigering visar "Saknar åtgärd")', async () => {
    await importera(tdText({ ursprung: 'Rotpost' }));
    expect(h.db.tabeller.objekt[0].atgard).toBeNull();
  });

  it('åtgärden sätts ur Arbetsform när den är entydig', async () => {
    await importera(tdText({ ursprung: 'Rotpost', arbetsform: 'Föryngringsavverkning' }));
    expect(h.db.tabeller.objekt[0].atgard).toBe('Föryngring');
  });

  it('GROT-skotning i Purpose blir typ grot', async () => {
    await importera(tdText({ ursprung: 'Avverkningsuppdrag' }), OBJECT_INFO({ purpose: 'GROT-skotning' }));
    expect(h.db.tabeller.objekt[0]).toMatchObject({ typ: 'grot', avtalsform: 'Au' });
  });

  it('importen sparar vad den satte per fält (import_varden)', async () => {
    await importera(tdText({ ursprung: 'Rotpost', arbetsform: 'Första gallring' }), OBJECT_INFO({ purpose: 'Gallring' }));
    expect(h.db.tabeller.objekt[0].import_varden).toMatchObject({ avtalsform: 'Rp', atgard: 'Första gallring', typ: 'gallring', volym: 950 });
    expect(h.db.tabeller.objekt[0].import_varden.status).toBeUndefined();         // skyddade fält är inte importens
    expect(h.db.tabeller.objekt[0].import_varden.traktdirektiv_url).toBeUndefined(); // artefakter inte heller
  });
});

describe('medelstam ur traktdirektivet', () => {
  it('ett entydigt värde i TD:n sätts på ett nytt objekt; utan värde blir fältet tomt (ingen gissning)', async () => {
    await importera(tdText({ ursprung: 'Rotpost', extra: 'Medelstam 0,72' }));
    expect(Number(h.db.tabeller.objekt[0].medelstam)).toBe(0.72);
    h.db = minnesDb();
    await importera(tdText({ ursprung: 'Rotpost' }));
    expect(h.db.tabeller.objekt[0].medelstam).toBeNull();
  });
  it('omimport skriver ALDRIG över en medelstam någon satt (0,8 för hand mot 0,72 i TD:n)', async () => {
    await importera(tdText({ ursprung: 'Rotpost' }));          // importen satte ingen
    h.db.tabeller.objekt[0].medelstam = 0.8;                     // planeraren skriver
    const r = await importera(tdText({ ursprung: 'Rotpost', extra: 'Medelstam 0,72' }));
    expect(r.body.uppdaterad).toBe(true);
    expect(Number(h.db.tabeller.objekt[0].medelstam)).toBe(0.8);
    expect(r.body.varningar.join(' ')).toContain('ligga kvar i medelstam');
  });
  it('omimport fyller ett TOMT fält', async () => {
    await importera(tdText({ ursprung: 'Rotpost' }));
    expect(h.db.tabeller.objekt[0].medelstam).toBeNull();
    await importera(tdText({ ursprung: 'Rotpost', extra: 'Medelstam 0,72' }));
    expect(Number(h.db.tabeller.objekt[0].medelstam)).toBe(0.72);
  });
});

describe('fil utan "Ursprung"', () => {
  it('tom avtalsform och en varning — aldrig Au', async () => {
    const r = await importera(tdText({ ursprung: null }));
    expect(r.status).toBe(200);
    const rad = h.db.tabeller.objekt[0];
    expect(rad.avtalsform).toBeNull();
    expect(rad.import_varningar.map((v: { text: string }) => v.text).join(' ')).toMatch(/Ursprung/);
    // Importen skriver {nyckel, sort, text} (lib/trakt/varningar.ts), inte ren text.
    expect(rad.import_varningar.every((v: { nyckel?: string; sort?: string }) => typeof v.nyckel === 'string' && ['fraga', 'noterat', 'utveckling'].includes(v.sort ?? ''))).toBe(true);
    expect(r.body.varningar.join(' ')).toMatch(/avtalsform lämnades tom/);
  });
  it('okänt Ursprung: tomt + råtexten i varningen', async () => {
    await importera(tdText({ ursprung: 'Egen skog' }));
    const rad = h.db.tabeller.objekt[0];
    expect(rad.avtalsform).toBeNull();
    expect(rad.import_varningar.map((v: { text: string }) => v.text).join(' ')).toContain('"Egen skog"');
  });
});

describe('omimport skriver inte över det Martin rättat', () => {
  it('en handrättad åtgärd ligger kvar när samma trakt importeras igen', async () => {
    await importera(tdText({ ursprung: 'Rotpost', arbetsform: 'Gallring' }), OBJECT_INFO({ purpose: 'Gallring' }));
    const rad = h.db.tabeller.objekt[0];
    expect(rad.atgard).toBe('Gallring');
    rad.atgard = 'Första gallring';                                   // Martin rättar i Redigering

    const r = await importera(tdText({ ursprung: 'Rotpost', arbetsform: 'Gallring' }), OBJECT_INFO({ purpose: 'Gallring' }));
    expect(r.body.uppdaterad).toBe(true);
    expect(h.db.tabeller.objekt).toHaveLength(1);                     // samma rad, ingen dubblett
    expect(h.db.tabeller.objekt[0].atgard).toBe('Första gallring');   // rättningen kvar
    expect(r.body.varningar.join(' ')).toContain('ligga kvar i atgard');
  });

  it('rättad avtalsform, typ och namn ligger kvar; ändrad volym (orörd av Martin) uppdateras', async () => {
    await importera(tdText({ ursprung: 'Rotpost' }));
    const rad = h.db.tabeller.objekt[0];
    Object.assign(rad, { avtalsform: 'LRK', typ: 'gallring', namn: 'Skälviken (Martins namn)' });

    await importera(tdText({ ursprung: 'Rotpost' }), OBJECT_INFO({ target: 1200 }));
    expect(h.db.tabeller.objekt[0]).toMatchObject({ avtalsform: 'LRK', typ: 'gallring', namn: 'Skälviken (Martins namn)', volym: 1200 });
  });

  it('omimport utan någon rättning ger samma rad och uppdaterar det importen äger', async () => {
    await importera(tdText({ ursprung: 'Rotpost' }));
    await importera(tdText({ ursprung: 'Rotpost' }), OBJECT_INFO({ target: 1100 }));
    expect(h.db.tabeller.objekt[0]).toMatchObject({ avtalsform: 'Rp', volym: 1100 });
    expect(h.db.tabeller.objekt[0].import_varden.volym).toBe(1100);
  });

  it('status, anteckningar och pinnen skrivs som förut aldrig över', async () => {
    await importera(tdText({ ursprung: 'Rotpost' }));
    Object.assign(h.db.tabeller.objekt[0], { status: 'pagaende', anteckningar: 'Martins text', lat: 56.5, lng: 14.5 });
    await importera(tdText({ ursprung: 'Rotpost' }));
    expect(h.db.tabeller.objekt[0]).toMatchObject({ status: 'pagaende', anteckningar: 'Martins text', lat: 56.5, lng: 14.5 });
  });

  it('en rad från före import_varden (hårdkodat Au i åtgärd): avtalsform fylls i, det som står i åtgärd lämnas orört', async () => {
    h.db.tabeller.objekt.push({ id: 'gammal', vo_nummer: '11161397', namn: 'Skälviken RP J-Hus- 25', typ: 'slutavverkning', atgard: 'Au', volym: 950, status: 'planerad' });
    const r = await importera(tdText({ ursprung: 'Rotpost' }));
    expect(r.body.uppdaterad).toBe(true);
    expect(h.db.tabeller.objekt[0]).toMatchObject({ avtalsform: 'Rp', atgard: 'Au' });
    expect(h.db.tabeller.objekt[0].import_varden).toMatchObject({ avtalsform: 'Rp' });
  });
});

describe('migrationen 20261014125836 ej körd (kolumnerna avtalsform/import_varden finns inte)', () => {
  it('objektet sparas ändå, och det syns i import_fel att avtalsformen inte kunde skrivas', async () => {
    h.db = minnesDb(['avtalsform', 'import_varden']);
    const r = await importera(tdText({ ursprung: 'Rotpost' }));
    expect(r.status).toBe(200);
    expect(h.db.tabeller.objekt).toHaveLength(1);
    expect(h.db.tabeller.objekt[0].avtalsform).toBeUndefined();
    expect(r.body.ejSkrivnaKolumner).toEqual(expect.arrayContaining(['avtalsform', 'import_varden']));
    const fel = h.db.tabeller.import_fel.find((f: any) => f.felkod === 'KOLUMN_SAKNAS');
    expect(fel?.feltext).toContain('20261014125836_avtalsform_och_import_varden.sql');
  });
});

describe('rimlighetskontroll: volym mot areal (Bågskyttebanan: 3 495 m³fub på 5,68 ha)', () => {
  const frågor = () => (h.db.tabeller.objekt[0].import_varningar as { nyckel: string; sort: string; text: string }[] | null)?.filter((v) => v.nyckel === 'orimlig_volym') ?? [];

  it('615 m³fub/ha på en slutavverkning blir en fråga med båda talen i texten — och talet rättas INTE', async () => {
    const r = await importera(tdText({ ursprung: 'Rotpost' }), OBJECT_INFO({ target: 3495, area: '5,68' }));
    expect(r.status).toBe(200);
    expect(frågor()).toEqual([{ nyckel: 'orimlig_volym', sort: 'fraga', text: '3\u00a0495 m³fub på 5,68 ha är 615 per hektar. Kontrollera mot stämplingslängden.' }]);
    expect(h.db.tabeller.objekt[0].volym).toBe(3495); // flaggar bara
  });

  it('ett normalt tal (950 på 3,6 ha = 264/ha) ger ingen fråga', async () => {
    await importera(tdText({ ursprung: 'Rotpost' }));
    expect(frågor()).toEqual([]);
  });

  it('gallring bedöms mot gallringens intervall (15–80): 264/ha är orimligt där', async () => {
    await importera(tdText({ ursprung: 'Rotpost', arbetsform: 'Första gallring' }), OBJECT_INFO({ purpose: 'Gallring' }));
    expect(frågor()).toHaveLength(1);
  });

  it('GROT bedöms inte (volymen är valfri och mäts inte i m³fub)', async () => {
    await importera(tdText({ ursprung: 'Avverkningsuppdrag' }), OBJECT_INFO({ purpose: 'GROT-skotning', target: 9999, area: '1' }));
    expect(frågor()).toEqual([]);
  });
});
