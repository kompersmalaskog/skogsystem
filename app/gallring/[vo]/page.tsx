'use client';

// Gallring — nivå 2. En trakt i taget.
//
// ETT TAL ÖVERST: uttaget i m³fub. Under det ligger fyra fördelningar som var
// och en svarar på en fråga föraren eller planeraren faktiskt ställer:
//
//   Sortiment   — vad blev det för virke?
//   Trädslag    — stämmer det med vad som stod i beståndet?
//   Per dag     — hur låg produktionen över tiden? (bara flerdagarstrakter)
//   Diameter    — hur grovt gallrades det?
//
// Diameterfördelningen redovisar öppet hur många stammar den bygger på.
// detalj_stam saknar systematiskt några stammar per trakt, och då ska det stå
// i klartext under histogrammet i stället för att döljas bakom ett snyggt tal.
//
// Här finns MEDVETET ingen stickvägsandel, ingen gallringskvot och inget
// skattat kvarvarande bestånd — se lib/gallring.ts för varför.

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import PageContainer from '@/components/PageContainer';
import SectionHeader from '@/components/SectionHeader';
import { T } from '@/lib/utbildning';
import {
  hamtaGallring,
  datumspann,
  fmtAntal,
  fmtVolym,
  klassLabel,
  kortDatum,
  tradslagFarg,
  type GallringDetalj,
} from '@/lib/gallring';

/** Rad med etikett, stapel och värde. Stapeln är proportionell mot radens
 *  andel av den största raden — värdet i text står alltid bredvid. */
function StapelRad({
  etikett,
  under,
  andel,
  varde,
  farg,
}: {
  etikett: string;
  under?: string;
  andel: number;
  varde: string;
  farg: string;
}) {
  return (
    <div style={{ padding: '10px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 15,
              color: T.t1,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {etikett}
          </div>
          {under && <div style={{ fontSize: 12, color: T.t2, marginTop: 1 }}>{under}</div>}
        </div>
        <div style={{ fontSize: 15, color: T.t1, flexShrink: 0 }}>{varde}</div>
      </div>
      <div
        style={{
          height: 6,
          borderRadius: 3,
          background: T.groupHi,
          marginTop: 8,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(andel * 100, andel > 0 ? 2 : 0)}%`,
            height: '100%',
            background: farg,
          }}
        />
      </div>
    </div>
  );
}

function Grupp({ children }: { children: React.ReactNode }) {
  return <div style={{ background: T.group, borderRadius: 12, overflow: 'hidden' }}>{children}</div>;
}

/** Nyckeltalen som inte är fördelningar. Två per rad, stora nog att läsas
 *  i en skakande hytt. */
function Fakta({ etikett, varde }: { etikett: string; varde: string }) {
  return (
    <div style={{ flex: '1 1 40%', minWidth: 120, padding: '12px 16px' }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: T.t1 }}>{varde}</div>
      <div style={{ fontSize: 13, color: T.t2, marginTop: 2 }}>{etikett}</div>
    </div>
  );
}

function Histogram({ detalj }: { detalj: GallringDetalj }) {
  const d = detalj.diameter;
  if (!d) {
    return (
      <Grupp>
        <div style={{ padding: 16, fontSize: 15, color: T.t2, lineHeight: 1.5 }}>
          Ingen stamdata importerad för den här trakten, så diameterfördelningen kan
          inte visas. Uttaget ovan är oberoende av det — det kommer från maskinens
          produktionsfiler.
        </div>
      </Grupp>
    );
  }

  const max = Math.max(...d.klasser.map((k) => k.antal), 1);
  const saknade = detalj.stammar - d.matta;

  return (
    <>
      <Grupp>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, padding: '16px 16px 8px', height: 140 }}>
          {d.klasser.map((k) => (
            <div
              key={k.franMm}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}
            >
              <div style={{ fontSize: 11, color: T.t2, textAlign: 'center', marginBottom: 4 }}>
                {k.antal || ''}
              </div>
              <div
                style={{
                  height: `${(k.antal / max) * 100}%`,
                  minHeight: k.antal > 0 ? 2 : 0,
                  background: T.blue,
                  borderRadius: '3px 3px 0 0',
                }}
              />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '0 16px 12px' }}>
          {d.klasser.map((k) => (
            <div key={k.franMm} style={{ flex: 1, fontSize: 10, color: T.t2, textAlign: 'center' }}>
              {klassLabel(k)}
            </div>
          ))}
        </div>
        <div style={{ height: 1, background: T.sep, marginLeft: 16 }} />
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          <Fakta etikett="Dgv" varde={`${Math.round(d.dgvMm)} mm`} />
          <Fakta etikett="Medeldiameter" varde={`${Math.round(d.medelMm)} mm`} />
          <Fakta etikett="Median" varde={`${Math.round(d.medianMm)} mm`} />
          <Fakta etikett="Klenast – grövst" varde={`${d.minMm}–${d.maxMm} mm`} />
        </div>
      </Grupp>
      <p style={{ fontSize: 13, color: T.t2, margin: '8px 4px 0', lineHeight: 1.5 }}>
        Klasserna är brösthöjdsdiameter i cm. Måtten bygger på{' '}
        {fmtAntal(d.matta)} av {fmtAntal(detalj.stammar)} stammar
        {saknade > 0
          ? ` — ${fmtAntal(saknade)} ${saknade === 1 ? 'stam' : 'stammar'} saknar stamrad i importen.`
          : '.'}{' '}
        Dgv är grundytevägd medeldiameter.
      </p>
    </>
  );
}

export default function GallringObjektPage() {
  const params = useParams<{ vo: string }>();
  const router = useRouter();
  const vo = decodeURIComponent(String(params?.vo ?? ''));

  const [detalj, setDetalj] = useState<GallringDetalj | null>(null);
  const [saknas, setSaknas] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [laddar, setLaddar] = useState(true);

  const ladda = useCallback(async () => {
    setLaddar(true);
    setFel(null);
    setSaknas(false);
    try {
      const d = await hamtaGallring(vo);
      // "Hittades inte" och "kunde inte läsa" är olika svar och skrivs olika.
      if (!d) setSaknas(true);
      setDetalj(d);
    } catch (e) {
      setDetalj(null);
      setFel(e instanceof Error ? e.message : 'Kunde inte hämta trakten.');
    } finally {
      setLaddar(false);
    }
  }, [vo]);

  useEffect(() => {
    ladda();
  }, [ladda]);

  const sortimentMax = Math.max(...(detalj?.sortiment ?? []).map((s) => s.volym), 0);
  const tradslagMax = Math.max(...(detalj?.tradslag ?? []).map((t) => t.volym), 0);
  const dagMax = Math.max(...(detalj?.dagar ?? []).map((d) => d.volym), 0);
  const stammarPerHa =
    detalj?.arealHa && detalj.arealHa > 0 ? detalj.stammar / detalj.arealHa : null;

  return (
    <div style={{ minHeight: '100vh', background: T.bg, color: T.t1, fontFamily: T.ff }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 'calc(56px + env(safe-area-inset-top))',
          paddingTop: 'env(safe-area-inset-top)',
          paddingInline: 12,
          borderBottom: `1px solid ${T.sep}`,
        }}
      >
        <button
          onClick={() => router.push('/gallring')}
          aria-label="Tillbaka till gallringar"
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            flexShrink: 0,
            background: 'rgba(255,255,255,0.08)',
            border: 'none',
            color: '#fff',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
            arrow_back
          </span>
        </button>
        <span
          style={{
            fontSize: 17,
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {detalj?.namn ?? 'Gallring'}
        </span>
      </div>

      <PageContainer width="smal" style={{ paddingBottom: 120, paddingTop: 8 }}>
        {laddar && (
          <div style={{ padding: '32px 16px', color: T.t2, fontSize: 15 }}>Hämtar trakten…</div>
        )}

        {!laddar && fel && (
          <div
            style={{
              background: T.group,
              borderRadius: 12,
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              marginTop: 16,
            }}
          >
            <div style={{ fontSize: 15 }}>{fel}</div>
            <button
              onClick={ladda}
              style={{
                minHeight: 44,
                borderRadius: 10,
                border: 'none',
                background: T.blue,
                color: '#fff',
                fontSize: 16,
                fontFamily: T.ff,
                cursor: 'pointer',
              }}
            >
              Försök igen
            </button>
          </div>
        )}

        {!laddar && !fel && saknas && (
          <div
            style={{
              background: T.group,
              borderRadius: 12,
              padding: 16,
              fontSize: 15,
              color: T.t2,
              lineHeight: 1.5,
              marginTop: 16,
            }}
          >
            Ingen gallring med VO {vo} hittades. Antingen har objektet en annan huvudtyp
            än Gallring, eller så saknar det importerad produktion.
          </div>
        )}

        {!laddar && !fel && detalj && (
          <>
            <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: -0.6, margin: '8px 0 2px' }}>
              {fmtVolym(detalj.volymM3fub)} m³fub
            </h1>
            <p style={{ fontSize: 15, color: T.t2, margin: '0 0 20px' }}>
              Uttag · VO {detalj.vo}
            </p>

            <Grupp>
              <div style={{ display: 'flex', flexWrap: 'wrap' }}>
                <Fakta etikett="Stammar" varde={fmtAntal(detalj.stammar)} />
                <Fakta
                  etikett="Dgv"
                  varde={detalj.diameter ? `${Math.round(detalj.diameter.dgvMm)} mm` : '—'}
                />
                <Fakta
                  etikett="Medelstam"
                  varde={`${(detalj.volymM3fub / Math.max(detalj.stammar, 1)).toFixed(3)} m³fub`}
                />
                {/* Areal skattas aldrig. Finns ingen uppmätt areal visas inget
                    per-hektar-tal alls — hellre en siffra mindre än en gissad. */}
                {stammarPerHa !== null ? (
                  <Fakta
                    etikett={`Stammar/ha · ${detalj.arealHa} ha`}
                    varde={fmtAntal(Math.round(stammarPerHa))}
                  />
                ) : (
                  <Fakta etikett="Areal" varde="Ej angiven" />
                )}
              </div>
              <div style={{ height: 1, background: T.sep, marginLeft: 16 }} />
              <div style={{ padding: '12px 16px', fontSize: 13, color: T.t2, lineHeight: 1.6 }}>
                {datumspann(detalj)}
                {detalj.antalDagar > 1 && ` · ${detalj.antalDagar} dagar med uttag`}
                <br />
                {detalj.maskiner.join(', ') || 'Maskin okänd'} ·{' '}
                {detalj.forare.join(', ') || 'Förare okänd'}
              </div>
            </Grupp>

            <SectionHeader>Sortiment</SectionHeader>
            {detalj.sortiment.length > 0 ? (
              <Grupp>
                {detalj.sortiment.map((s, i) => (
                  <div key={`${s.grupp}-${s.namn}`}>
                    {i > 0 && <div style={{ height: 1, background: T.sep, marginLeft: 16 }} />}
                    <StapelRad
                      etikett={s.grupp ? `${s.grupp} · ${s.namn}` : s.namn}
                      under={`${fmtAntal(s.stockar)} ${s.stockar === 1 ? 'stock' : 'stockar'}`}
                      andel={sortimentMax > 0 ? s.volym / sortimentMax : 0}
                      varde={`${fmtVolym(s.volym)} m³fub`}
                      farg={T.blue}
                    />
                  </div>
                ))}
              </Grupp>
            ) : (
              <Grupp>
                <div style={{ padding: 16, fontSize: 15, color: T.t2, lineHeight: 1.5 }}>
                  Ingen sortimentsdata importerad för trakten.
                </div>
              </Grupp>
            )}

            <SectionHeader>Trädslag</SectionHeader>
            <Grupp>
              {detalj.tradslag.map((t, i) => (
                <div key={t.namn}>
                  {i > 0 && <div style={{ height: 1, background: T.sep, marginLeft: 16 }} />}
                  <StapelRad
                    etikett={t.namn}
                    under={`${fmtAntal(t.stammar)} stammar`}
                    andel={tradslagMax > 0 ? t.volym / tradslagMax : 0}
                    varde={`${fmtVolym(t.volym)} m³fub`}
                    farg={tradslagFarg(t.namn, i)}
                  />
                </div>
              ))}
            </Grupp>

            {detalj.dagar.length > 1 && (
              <>
                <SectionHeader>Uttag per dag</SectionHeader>
                <Grupp>
                  {detalj.dagar.map((d, i) => (
                    <div key={d.datum}>
                      {i > 0 && <div style={{ height: 1, background: T.sep, marginLeft: 16 }} />}
                      <StapelRad
                        etikett={kortDatum(d.datum)}
                        under={`${fmtAntal(d.stammar)} stammar`}
                        andel={dagMax > 0 ? d.volym / dagMax : 0}
                        varde={`${fmtVolym(d.volym)} m³fub`}
                        farg={T.green}
                      />
                    </div>
                  ))}
                </Grupp>
              </>
            )}

            <SectionHeader>Diameterfördelning</SectionHeader>
            <Histogram detalj={detalj} />
          </>
        )}
      </PageContainer>
      <BottomNav />
    </div>
  );
}
