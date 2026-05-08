import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { redirect, notFound } from 'next/navigation';
import type { Viewport } from 'next';
import { aggregateMarkagarRapport } from '@/lib/markagarrapport/aggregate';
import type { MarkagarRapport } from '@/lib/markagarrapport/types';
import SkogenKarta from '@/components/markagarrapport/SkogenKarta';

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
  success: '#34c759',
  danger: '#ff3b30',
  warning: '#ff9500',
};

// Dämpad röd specifikt för rot-ring i kartan + legend-prick.
// Matchar RING_ROT i SkogenKarta.tsx. Skild från COL.danger som är reserverad
// för andra danger-signaler (felmeddelanden, värdeförlust om vi återinför).
const ROT_RING = '#d64545';

const fmtKr = (n: number) =>
  Math.round(n).toLocaleString('sv-SE');
const fmtVol = (n: number, decs = 0) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: decs, maximumFractionDigits: decs });
const fmtPct = (n: number, decs = 1) =>
  n.toLocaleString('sv-SE', { minimumFractionDigits: decs, maximumFractionDigits: decs }) + ' %';

function formatDateSv(iso: string | null): string {
  if (!iso) return '–';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

interface Props {
  params: Promise<{ objekt_id: string }>;
}

export default async function Page({ params }: Props) {
  const { objekt_id } = await params;

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

  // Role-check (kopierat från app/admin/page.tsx)
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

  const result = await aggregateMarkagarRapport(supabase as any, objekt_id);

  if (result.status === 'objekt_saknas') notFound();

  if (result.status === 'ej_implementerad') {
    return (
      <Wrapper>
        <Tom
          rubrik="Ej implementerad än"
          text={`Markägarrapporten är just nu specifik för slutavverkning. Detta objekt har åtgärd "${result.atgard ?? '–'}". Gallrings-stöd planeras i v2.`}
        />
      </Wrapper>
    );
  }

  if (result.status === 'ingen_data') {
    return (
      <Wrapper>
        <Tom
          rubrik="Ingen data"
          text={
            result.reason === 'inga_hpr_filer'
              ? 'Inga HPR-filer är importerade för detta objekt än.'
              : 'HPR-filer finns men inga stocks är importerade än.'
          }
        />
      </Wrapper>
    );
  }

  return (
    <Wrapper>
      <Rapport data={result.data} />
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
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
        {children}
      </div>
    </main>
  );
}

function Tom({ rubrik, text }: { rubrik: string; text: string }) {
  return (
    <div style={{ paddingTop: 80 }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{rubrik}</h1>
      <p style={{ fontSize: 14, color: COL.textSecondary, margin: '8px 0 0', lineHeight: 1.6 }}>
        {text}
      </p>
    </div>
  );
}

// ============================================================================
// HUVUDRAPPORT
// ============================================================================

function Rapport({ data: d }: { data: MarkagarRapport }) {
  return (
    <>
      <Header objekt={d.objekt} />
      <Oversikt o={d.oversikt} />
      <Fordelning fordelning={d.fordelning} />
      <Skogen stammar={d.karta.stammar} />
      <Tradslag tradslag={d.tradslag} />
      <Divider top={32} />
      <Rotrota r={d.rotrota} stubbar={d.stubbar} avkapTotalt={d.avkap_skicklighet.totalt} />
      <Avkap a={d.avkap_skicklighet} />
      <Divider top={32} />
      <Diameter timmer={d.timmer_top2} />
      <Divider top={32} />
      <SortimentTabell sortiment={d.sortiment} />
      <Divider top={32} />
      <Underlag d={d} />
    </>
  );
}

// ----------------------------------------------------------------------------
// Header
// ----------------------------------------------------------------------------

function Header({ objekt }: { objekt: MarkagarRapport['objekt'] }) {
  const subline = [
    objekt.atgard,
    formatDateSv(objekt.forsta_datum),
    objekt.operator,
  ].filter(Boolean).join(' · ');

  return (
    <div style={{ paddingTop: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0, color: COL.textPrimary }}>
        {objekt.namn ?? objekt.objekt_id}
      </h1>
      <p style={{ fontSize: 14, color: COL.textSecondary, margin: '4px 0 0' }}>
        {subline}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Översikt — 4 metric cards
// ----------------------------------------------------------------------------

function Oversikt({ o }: { o: MarkagarRapport['oversikt'] }) {
  const ytaText = o.yta_ha != null ? fmtVol(o.yta_ha, 1) + ' ha' : 'Saknas';
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginTop: 24,
      }}
    >
      <Mc label="Yta" value={ytaText} />
      <Mc label="Stammar" value={o.stammar.toLocaleString('sv-SE')} />
      <Mc label="Volym" value={fmtVol(o.volym_m3sub, 0) + ' m³'} />
      <Mc label="Värde" value={fmtKr(o.virkesvarde_kr) + ' kr'} />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Fördelning per sortimentkategori
// ----------------------------------------------------------------------------

const GRUPP_VISNING: Record<string, string> = {
  Timmer: 'Timmer',
  Klentimmer: 'Klentimmer',
  Kubb: 'Kubb',
  Massa: 'Massaved',
  Energi: 'Energi',
  Övrigt: 'Övrigt',
};

function Fordelning({ fordelning }: { fordelning: MarkagarRapport['fordelning'] }) {
  if (fordelning.length === 0) return null;
  return (
    <div style={{ marginTop: 32 }}>
      <H2>Fördelning</H2>
      <div>
        {fordelning.map((row, i) => (
          <div
            key={row.grupp}
            style={{
              display: 'grid',
              gridTemplateColumns: '140px 1fr 1fr',
              gap: 16,
              alignItems: 'baseline',
              padding: '10px 0',
              borderBottom: i < fordelning.length - 1 ? `0.5px solid ${COL.border}` : 'none',
              fontSize: 14,
              color: COL.textPrimary,
            }}
          >
            <span>{GRUPP_VISNING[row.grupp] ?? row.grupp}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtVol(row.volym_m3sub, 0)} m³
              <span style={{ color: COL.textTertiary, marginLeft: 8 }}>
                ({fmtPct(row.volym_andel_pct, 0)})
              </span>
            </span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmtKr(row.varde_kr)} kr
              <span style={{ color: COL.textTertiary, marginLeft: 8 }}>
                ({fmtPct(row.varde_andel_pct, 0)})
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Mc({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: COL.card, borderRadius: 12, padding: 16 }}>
      <p style={{ fontSize: 13, color: COL.textSecondary, margin: 0, fontWeight: 400 }}>{label}</p>
      <p style={{
        fontSize: 22, fontWeight: 500, margin: '4px 0 0',
        color: COL.textPrimary, lineHeight: 1.2,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Skogen — kart-canvas
// ----------------------------------------------------------------------------

function Skogen({ stammar }: { stammar: MarkagarRapport['karta']['stammar'] }) {
  return (
    <div style={{ marginTop: 32 }}>
      <H2>Skogen</H2>
      <SkogenKarta stammar={stammar} />
      <div
        style={{
          display: 'flex', gap: 18, flexWrap: 'wrap',
          marginTop: 10, fontSize: 12, color: COL.textTertiary,
        }}
      >
        <span><Dot color="#34c759" /> Gran</span>
        <span><Dot color="#ff9500" /> Tall</span>
        <span><Dot color="#d4c5a0" /> Björk</span>
        <span><Dot color="#8e8e93" /> Övr löv</span>
        <span><Ring color={ROT_RING} /> Rotskada</span>
        <span style={{ marginLeft: 'auto' }}>Punktstorlek visar stamdiameter</span>
      </div>
    </div>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8,
      borderRadius: '50%', background: color,
      marginRight: 5, verticalAlign: 'middle',
    }} />
  );
}

function Ring({ color }: { color: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 9, height: 9,
      borderRadius: '50%', border: `1.5px solid ${color}`,
      marginRight: 5, verticalAlign: 'middle',
    }} />
  );
}

// ----------------------------------------------------------------------------
// Trädslag — staplar
// ----------------------------------------------------------------------------

function Tradslag({ tradslag }: { tradslag: MarkagarRapport['tradslag'] }) {
  if (tradslag.length === 0) return null;
  return (
    <div style={{ marginTop: 32 }}>
      <H2>Trädslag</H2>
      <div>
        {tradslag.map((t) => (
          <div key={t.namn} style={{ marginBottom: 12 }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 1fr 80px 60px',
                gap: 14,
                alignItems: 'center',
                fontSize: 14,
                color: COL.textPrimary,
                padding: '6px 0',
              }}
            >
              <span>{t.namn}</span>
              <div style={{ height: 4, background: COL.border, borderRadius: 2 }}>
                <div
                  style={{
                    width: `${Math.max(0, Math.min(100, t.andel_pct))}%`,
                    height: '100%',
                    borderRadius: 2,
                    background: COL.textPrimary,
                  }}
                />
              </div>
              <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmtVol(t.volym_m3sub, 0)} m³
              </span>
              <span style={{
                textAlign: 'right',
                color: COL.textSecondary,
                fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtPct(t.andel_pct)}
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                color: COL.textTertiary,
                margin: '-4px 0 6px 124px',
              }}
            >
              {t.stammar.toLocaleString('sv-SE')} stammar
              {t.medeldiameter_cm != null && ` · medeldiameter ${fmtVol(t.medeldiameter_cm, 0)} cm`}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Rotröta
// ----------------------------------------------------------------------------

function Rotrota({
  r, stubbar, avkapTotalt,
}: {
  r: MarkagarRapport['rotrota'];
  stubbar: MarkagarRapport['stubbar'];
  avkapTotalt: number;
}) {
  void stubbar;
  void avkapTotalt;
  const rotAndelText = `${fmtPct(r.pct_av_gran, 0)} av granen`;
  const inomGenomsnitt = r.pct_av_gran >= 15 && r.pct_av_gran <= 25;
  return (
    <div style={{ marginTop: 24 }}>
      <H2>Rotröta</H2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 24,
          marginBottom: 16,
        }}
      >
        <Stat
          label="Stammar med rot"
          value={r.stammar_med_rot.toLocaleString('sv-SE')}
          sub={rotAndelText}
        />
        <Stat
          label="Rotpåverkad volym"
          value={fmtVol(r.rotpaverkad_volym_m3, 1) + ' m³'}
          sub={`${fmtPct(r.rotpaverkad_pct)} av total volym`}
        />
      </div>
      <Prosa>
        {r.stammar_med_rot > 0
          ? `${r.stammar_med_rot.toLocaleString('sv-SE')} stammar har rot på bottenstocken (${rotAndelText}). `
          : 'Inga stammar har rot. '}
        {inomGenomsnitt
          ? 'Det ligger inom svenskt genomsnitt på 15–25 %.'
          : r.pct_av_gran < 15
            ? 'Det ligger under svenskt genomsnitt 15–25 %.'
            : 'Det ligger över svenskt genomsnitt 15–25 %.'}
        {' Tallarna är i princip rot-immuna i Sverige — överväg tall framför gran i nästa generation om rotandelen är hög på samma ståndort.'}
      </Prosa>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Operatörens skicklighet
// ----------------------------------------------------------------------------

function Avkap({ a }: { a: MarkagarRapport['avkap_skicklighet'] }) {
  if (a.totalt === 0) return null;
  const pctLyckad = a.totalt > 0 ? (a.lyckade / a.totalt) * 100 : 0;
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 14, fontWeight: 500, margin: '0 0 8px', color: COL.textPrimary }}>
        Operatörens skicklighet
      </h3>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
          marginBottom: 8,
        }}
      >
        <div>
          <p style={{ fontSize: 13, color: COL.textSecondary, margin: 0 }}>Lyckade avkap</p>
          <p style={{
            fontSize: 22, fontWeight: 500, margin: '4px 0 0',
            color: COL.textPrimary, lineHeight: 1.2,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {a.lyckade} av {a.totalt}{' '}
            <span style={{ color: COL.textSecondary, fontSize: 14, fontWeight: 400 }}>
              ({fmtPct(pctLyckad, 0)})
            </span>
          </p>
        </div>
        <div>
          <p style={{ fontSize: 13, color: COL.textSecondary, margin: 0 }}>Räddad volym</p>
          <p style={{
            fontSize: 22, fontWeight: 500, margin: '4px 0 0',
            color: COL.textPrimary, lineHeight: 1.2,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {fmtVol(a.raddad_volym_m3, 1)} m³
          </p>
        </div>
        <Stat
          label="Räddat värde"
          value={(a.raddat_kr > 0 ? '+' : '') + fmtKr(a.raddat_kr) + ' kr'}
          color={a.raddat_kr > 0 ? COL.success : undefined}
        />
      </div>
      <p style={{
        fontSize: 13, color: COL.textSecondary,
        lineHeight: 1.7, margin: '8px 0 0',
      }}>
        {a.utfall.misslyckad > 0 || a.utfall.avkap_igen > 0 ? (
          <>Misslyckade: {a.utfall.misslyckad} (rötan djupare än ytan visade), avkap-igen: {a.utfall.avkap_igen} (operatören tvungen att kapa en gång till).</>
        ) : 'Operatören lyckades rädda virke i alla avkap-fall.'}
        {' '}Räddad volym = volymen som flyttats från massaved till timmer eller kubb genom avkap. Räddat värde = räddad volym × (timmerpris − massapris).
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Diameterfördelning per timmersortiment
// ----------------------------------------------------------------------------

function Diameter({ timmer }: { timmer: MarkagarRapport['timmer_top2'] }) {
  if (timmer.length === 0) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <H2>Diameterfördelning</H2>
      <p style={{ fontSize: 13, color: COL.textSecondary, margin: '0 0 12px' }}>
        Vidas prislista anger inte målfördelning, bara prisincitament per dimension.
      </p>
      {timmer.map((t) => {
        const maxVol = Math.max(...t.dimensioner.map((d) => d.volym_m3sub), 0.001);
        return (
          <div key={t.sortiment_namn} style={{ marginBottom: 24 }}>
            <p style={{ fontSize: 13, color: COL.textSecondary, margin: '0 0 6px' }}>
              {t.sortiment_namn}
              <span style={{ color: COL.textTertiary, marginLeft: 8 }}>
                · {fmtVol(t.total_volym_m3sub, 1)} m³ totalt
              </span>
            </p>
            {t.dimensioner.map((d) => (
              <div
                key={d.dia_klass}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1fr 80px 80px',
                  gap: 14,
                  alignItems: 'center',
                  fontSize: 14,
                  padding: '5px 0',
                  color: COL.textPrimary,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span>{d.dia_min_mm / 10} cm</span>
                <div style={{ height: 4, background: COL.border, borderRadius: 2 }}>
                  <div
                    style={{
                      width: `${(d.volym_m3sub / maxVol) * 100}%`,
                      height: '100%',
                      borderRadius: 2,
                      background: COL.textPrimary,
                    }}
                  />
                </div>
                <span style={{ textAlign: 'right' }}>{fmtVol(d.volym_m3sub, 1)} m³</span>
                <span style={{ textAlign: 'right', color: COL.textSecondary, fontSize: 13 }}>
                  {d.pris_per_m3 != null ? fmtKr(d.pris_per_m3) + ' kr' : '–'}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Stubbehandling
// ----------------------------------------------------------------------------

function Stubbar({ s }: { s: MarkagarRapport['stubbar'] }) {
  return (
    <div style={{ marginTop: 24 }}>
      <H2>Stubbehandling</H2>
      <Prosa>
        {s.behandlade.toLocaleString('sv-SE')} av {s.totalt.toLocaleString('sv-SE')} stubbar behandlades mot rotröta.
        {s.behandlade < s.totalt && ' Obehandlad stubbe på granmark där rotröta finns ökar risken för spridning till nästa rotation.'}
      </Prosa>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sortiment-tabell
// ----------------------------------------------------------------------------

function SortimentTabell({ sortiment }: { sortiment: MarkagarRapport['sortiment'] }) {
  if (sortiment.length === 0) return null;
  return (
    <div style={{ marginTop: 24 }}>
      <H2>Sortiment</H2>
      <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse', marginTop: 4 }}>
        <tbody>
          {sortiment.map((row, i) => (
            <tr
              key={row.sortiment_id}
              style={{
                borderBottom: i === sortiment.length - 1
                  ? 'none'
                  : `0.5px solid ${COL.border}`,
              }}
            >
              <td style={{ padding: '10px 0' }}>
                <div>{row.namn}</div>
                {row.tradslag && (
                  <div style={{ color: COL.textSecondary, fontSize: 13 }}>
                    {row.tradslag.charAt(0) + row.tradslag.slice(1).toLowerCase()}
                  </div>
                )}
              </td>
              <td style={{
                padding: '10px 0', textAlign: 'right',
                color: COL.textSecondary, fontSize: 13,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {row.stockar.toLocaleString('sv-SE')} st
              </td>
              <td style={{
                padding: '10px 0', textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtVol(row.volym_m3sub, 0)} m³
              </td>
              <td style={{
                padding: '10px 0', textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {fmtKr(row.varde_kr)} kr
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Underlag för beslut
// ----------------------------------------------------------------------------

function Underlag({ d }: { d: MarkagarRapport }) {
  const rotPct = d.rotrota.pct_av_gran;
  const rotInomGenomsnitt = rotPct >= 15 && rotPct <= 25;
  return (
    <div style={{ marginTop: 24 }}>
      <H2>Underlag för beslut</H2>
      <Prosa>
        Beståndet hade {fmtPct(rotPct, 0)} rotandel på granen, vilket{' '}
        {rotInomGenomsnitt ? 'ligger inom svenskt genomsnitt (15–25 %)' : 'ligger utanför svenskt genomsnitt 15–25 %'}.
        {' '}För säker rekommendation om trädslagsval för nästa generation, rådfråga skogsrådgivare med kunskap om ståndorten.
      </Prosa>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 13, color: COL.textSecondary, fontWeight: 500,
      margin: '0 0 12px', letterSpacing: '0.01em',
    }}>
      {children}
    </h2>
  );
}

function Divider({ top = 32 }: { top?: number }) {
  return (
    <hr style={{
      border: 'none',
      borderTop: `0.5px solid ${COL.border}`,
      margin: `${top}px 0 0`,
    }} />
  );
}

function Prosa({ children }: { children: React.ReactNode }) {
  return (
    <p style={{
      fontSize: 14, lineHeight: 1.7,
      color: COL.textPrimary, margin: '8px 0',
    }}>
      {children}
    </p>
  );
}

function Stat({
  label, value, sub, color,
}: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div>
      <p style={{ fontSize: 13, color: COL.textSecondary, margin: 0, fontWeight: 400 }}>
        {label}
      </p>
      <p style={{
        fontSize: 28, fontWeight: 500, margin: '4px 0 0',
        color: color ?? COL.textPrimary, lineHeight: 1.2,
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </p>
      {sub && (
        <p style={{
          fontSize: 12, color: COL.textTertiary, margin: '4px 0 0',
          lineHeight: 1.4,
        }}>
          {sub}
        </p>
      )}
    </div>
  );
}
