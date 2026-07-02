import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Viewport } from 'next';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Markägarrapport' };
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

const COL = {
  bg: '#000',
  card: '#0f0f10',
  border: 'rgba(255,255,255,0.06)',
  textPrimary: '#f5f5f5',
  textSecondary: '#a1a1aa',
  textTertiary: '#71717a',
};

interface ObjektRad {
  objekt_id: string;
  namn: string;
  skogsagare: string | null;
  stammar: number;
  forsta_datum: string | null;
}

function fmtDateSv(iso: string | null): string {
  if (!iso) return '–';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default async function Page() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (c) => c.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        ),
      },
    },
  );

  // Role-check
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');
  const { data: medarbetare } = await supabase
    .from('medarbetare')
    .select('id, namn, roll')
    .eq('epost', user.email)
    .single();
  if (!medarbetare || (medarbetare.roll !== 'chef' && medarbetare.roll !== 'admin')) {
    redirect('/arbetsrapport');
  }

  // 1. Hämta alla slutavverknings-objekt via StanForD-fältet cutting_method
  //    (sätts av importen). atgard är manuellt/inkonsekvent — se aggregate.ts.
  const { data: dimRows } = await supabase
    .from('dim_objekt')
    .select('objekt_id, object_name, skogsagare')
    .eq('cutting_method', 'ClearCutting');
  const dim = dimRows ?? [];

  let rader: ObjektRad[] = [];
  if (dim.length > 0) {
    const objektIds = dim.map(d => d.objekt_id);

    // 2+3. HPR-datum via objekt_nyckel '<maskin>:<vo>' (#78) — en fil per objekt efter
    //    dedup, frikopplad från objekt-tabellen (ingen uuid-mappning behövs).
    //    fil_datum = äldsta stam-tidpunkten i den kumulativa filen = objektets ÄKTA
    //    första avverkningsdatum (filnamnets timestamp är tvärtom senaste snapshotet).
    //    (stammar_count är opålitlig; faktiskt antal räknas från detalj_stam i steg 4.)
    const datumByVo = new Map<string, string>();
    const { data: hprRows } = await supabase
      .from('hpr_filer')
      .select('objekt_nyckel, fil_datum');
    for (const h of hprRows ?? []) {
      const [maskin, ident] = String(h.objekt_nyckel ?? '').split(':');
      if (!ident || !h.fil_datum) continue;
      // numeriskt ident = vo (= dim_objekt.objekt_id); 'k<KEY>' → dim-fallback-id 'MASKIN_KEY'
      const voId = /^\d+$/.test(ident) ? ident : `${maskin}_${ident.slice(1)}`;
      const d = String(h.fil_datum).slice(0, 10);
      const cur = datumByVo.get(voId);
      if (!cur || d < cur) datumByVo.set(voId, d);
    }

    // 4. Faktiskt antal stammar per objekt från detalj_stam (verklig
    //    dataförekomst, oberoende av hpr_filer.stammar_count).
    const stammarByObj = new Map<string, number>();
    await Promise.all(objektIds.map(async (oid) => {
      const { count } = await supabase
        .from('detalj_stam')
        .select('*', { count: 'exact', head: true })
        .eq('objekt_id', oid);
      stammarByObj.set(oid, count ?? 0);
    }));

    // 5. Bygg rader — bara objekt som faktiskt har stam-data
    rader = dim
      .map((d) => {
        return {
          objekt_id: d.objekt_id,
          namn: d.object_name ?? d.objekt_id,
          skogsagare: d.skogsagare ?? null,
          stammar: stammarByObj.get(d.objekt_id) ?? 0,
          forsta_datum: datumByVo.get(d.objekt_id) ?? null,
        };
      })
      .filter((r) => r.stammar > 0)
      .sort((a, b) =>
        (b.forsta_datum ?? '').localeCompare(a.forsta_datum ?? '') ||
        a.namn.localeCompare(b.namn, 'sv')
      );
  }

  return (
    <main
      style={{
        background: COL.bg,
        color: COL.textPrimary,
        minHeight: 'calc(100vh - 56px)',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontWeight: 400,
        letterSpacing: '-0.005em',
      }}
    >
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '24px 20px 80px' }}>
        <div style={{ paddingTop: 16 }}>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Markägarrapport</h1>
          <p style={{ fontSize: 14, color: COL.textSecondary, margin: '4px 0 0' }}>
            Slutavverkade objekt med HPR-data. Klicka för rapport per avverkning.
          </p>
        </div>

        {rader.length === 0 ? (
          <div style={{ marginTop: 32 }}>
            <p style={{ fontSize: 14, color: COL.textSecondary, margin: 0, lineHeight: 1.6 }}>
              Inga slutavverkade objekt med importerade HPR-filer hittades.
              Objekt klassas som slutavverkning via maskinens <code>cutting_method</code>{' '}
              (StanForD ClearCutting). Importera HPR-filer för slutavverkningsobjekt.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: 24 }}>
            {rader.map((r, i) => (
              <Link
                key={r.objekt_id}
                href={`/admin/markagarrapport/${encodeURIComponent(r.objekt_id)}`}
                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr auto auto',
                    gap: 16,
                    alignItems: 'center',
                    padding: '14px 4px',
                    borderBottom: i < rader.length - 1 ? `0.5px solid ${COL.border}` : 'none',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: 15, fontWeight: 500, color: COL.textPrimary,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {r.namn}
                    </div>
                    <div style={{
                      fontSize: 12, color: COL.textTertiary, marginTop: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {[fmtDateSv(r.forsta_datum), r.skogsagare].filter(Boolean).join(' · ') || r.objekt_id}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 13, color: COL.textSecondary,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                  }}>
                    {r.stammar.toLocaleString('sv-SE')} stammar
                  </div>
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 18, color: COL.textTertiary }}
                  >
                    chevron_right
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
