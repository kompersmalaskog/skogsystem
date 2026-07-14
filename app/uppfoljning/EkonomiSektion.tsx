'use client';

// Ackord vs timpeng i uppföljningens detaljvy. Bara admin (alternativ A —
// RLS på maskin_timpris/objekt_ekonomi släpper ändå bara admin; att visa
// sektionen för fler vore att visa tysta nollor).
//
// Ärliga tillstånd: null-belopp renderas som "—" med orsak, aldrig 0 kr.

import { useState } from 'react';
import Link from 'next/link';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { useObjektEkonomi, type MaskinEkonomi } from './hooks/useObjektEkonomi';
import type { UppfoljningObjekt } from './lib/transform';

const V6_GREY = '#8e8e93';
const V6_GREY2 = '#636366';
const V6_CARD = '#141416';
const V6_SEP = 'rgba(255,255,255,0.06)';
const V6_SK = '#a8d582';
const V6_ST = '#f0b24c';
const V6_WARN = '#ff9f0a';
const V6_POS = '#30d158';
const V6_NEG = '#ff453a';
const V6_BLUE = '#5b8fff';
const V6_FF = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";

function kr(n: number): string {
  return `${Math.round(n).toLocaleString('sv-SE')} kr`;
}
function krSigned(n: number): string {
  return `${n >= 0 ? '+' : '−'}${Math.round(Math.abs(n)).toLocaleString('sv-SE')} kr`;
}

function MaskinKort({ m }: { m: MaskinEkonomi }) {
  const [visaBerakning, setVisaBerakning] = useState(false);
  const farg = m.typ === 'skordare' ? V6_SK : V6_ST;
  const rubrik = m.typ === 'skordare' ? 'Skördare' : 'Skotare';

  const radStil = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 } as const;
  const beloppStil = { fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } as const;
  const perM3 = (belopp: number) => m.volym > 0 ? `${(belopp / m.volym).toFixed(2)} kr/m³` : null;

  return (
    <div style={{ background: V6_CARD, borderRadius: 14, padding: '14px 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: farg }} />
        <span style={{ fontSize: 11, color: '#fff', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{rubrik}</span>
        <span style={{ fontSize: 11, color: V6_GREY2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.label}</span>
      </div>
      <div style={{ fontSize: 12, color: V6_GREY, marginBottom: 12, fontVariantNumeric: 'tabular-nums' }}>
        {m.volym > 0 ? `${Math.round(m.volym).toLocaleString('sv-SE')} m³fub` : 'ingen volym'}
        {' · '}{m.g15h > 0 ? `${m.g15h.toFixed(1)} G15h` : 'inga G15-timmar'}
        {m.m3PerG15h != null && <> · {m.m3PerG15h.toFixed(1)} m³/G15h</>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={radStil}>
          <span style={{ fontSize: 12, color: V6_GREY }}>
            Ackord{m.acord && <span style={{ color: V6_GREY2 }}> · {Math.round(m.volym).toLocaleString('sv-SE')} m³ × {m.acord.effektivtPrisPerM3.toFixed(2)} kr</span>}
          </span>
          {m.acord ? (
            <span style={{ ...beloppStil, color: '#fff' }}>{kr(m.acord.belopp)}</span>
          ) : (
            <span style={{ fontSize: 12, color: V6_GREY }}>— <span style={{ fontSize: 11 }}>{m.acordSaknasOrsak}</span></span>
          )}
        </div>
        <div style={radStil}>
          <span style={{ fontSize: 12, color: V6_GREY }}>
            Timpeng{m.timpeng != null && m.timpris != null && <span style={{ color: V6_GREY2 }}> · {m.g15h.toFixed(1)} h × {m.timpris.toLocaleString('sv-SE')} kr</span>}
          </span>
          {m.timpeng != null ? (
            <span style={{ ...beloppStil, color: '#fff' }}>{kr(m.timpeng)}</span>
          ) : (
            <span style={{ fontSize: 12, color: V6_GREY }}>— <span style={{ fontSize: 11 }}>{m.timpengSaknasOrsak}</span></span>
          )}
        </div>

        {m.skillnad != null && m.acord && m.timpeng != null && (
          <div style={{ ...radStil, paddingTop: 8, borderTop: `0.5px solid ${V6_SEP}` }}>
            <span style={{ fontSize: 12, color: '#fff', fontWeight: 600 }}>
              Skillnad
              <span style={{ color: V6_GREY, fontWeight: 400 }}> · {m.skillnad >= 0 ? 'ackordet gav mest' : 'timpeng gav mest'}{perM3(m.skillnad) ? `, ${m.skillnad >= 0 ? '+' : '−'}${Math.abs(m.skillnad / m.volym).toFixed(2)} kr/m³` : ''}</span>
            </span>
            <span style={{ ...beloppStil, fontSize: 17, color: m.skillnad >= 0 ? V6_POS : V6_NEG }}>{krSigned(m.skillnad)}</span>
          </div>
        )}

        {m.brytpunkt != null && m.m3PerG15h != null && (
          <div style={{ fontSize: 12, color: V6_GREY, fontVariantNumeric: 'tabular-nums' }}>
            Brytpunkt {m.brytpunkt.toFixed(1)} m³/G15h — över den lönar sig ackord.
            Faktisk {m.m3PerG15h.toFixed(1)}{' '}
            <span style={{ color: m.m3PerG15h >= m.brytpunkt ? V6_POS : V6_WARN, fontWeight: 600 }}>
              {m.m3PerG15h >= m.brytpunkt ? '✓ över' : 'under'}
            </span>
          </div>
        )}

        {m.acord?.medelstamAntagen && (
          <div style={{ fontSize: 11, color: V6_WARN, fontWeight: 600 }}>
            Medelstam saknas — antagen {m.acord.medelstam.toFixed(2).replace('.', ',')} (ingen skördardata på objektet)
          </div>
        )}
        {m.timmarUtanPris > 0.05 && m.timpeng != null && (
          <div style={{ fontSize: 11, color: V6_WARN, fontWeight: 600 }}>
            {m.timmarUtanPris.toFixed(1)} h saknar datumgiltigt timpris och ingår inte i timpengen
          </div>
        )}
        {m.tackning != null && m.tackning < 0.995 && (
          <div style={{ fontSize: 11, color: V6_WARN }}>
            Täckning: {Math.round(m.tackning * 100)} % av maskinens G15 i perioden är kopplad till objektet — resten ligger på andra objekt eller saknar objekt-id
          </div>
        )}

        {m.acord && (
          <div>
            <button onClick={() => setVisaBerakning(!visaBerakning)} style={{ background: 'none', border: 'none', color: V6_BLUE, fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '4px 0', fontFamily: V6_FF }}>
              Så räknades priset {visaBerakning ? '▴' : '▾'}
            </button>
            {visaBerakning && (
              <div style={{ fontSize: 12, color: V6_GREY, display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                <div style={radStil}>
                  <span>Medelstam {m.acord.medelstam.toFixed(3).replace('.', ',')}{m.acord.medelstamAntagen ? ' (antagen)' : ''} → klass {m.acord.klassMedelstam.toFixed(2).replace('.', ',')}</span>
                  <span style={{ color: '#fff' }}>{m.acord.grundpris.toFixed(2)} kr/m³</span>
                </div>
                {m.acord.traktKrPerM3 > 0 && (
                  <div style={radStil}>
                    <span>+ Traktstorlek {m.acord.traktBracket} m³</span>
                    <span style={{ color: '#fff' }}>{m.acord.traktKrPerM3.toFixed(2)} kr/m³</span>
                  </div>
                )}
                {m.acord.sortKrPerM3 > 0 && (
                  <div style={radStil}>
                    <span>+ Sortiment · {m.acord.sortGrupper.length} grupper ({m.acord.sortGrupper.join(', ')})</span>
                    <span style={{ color: '#fff' }}>{m.acord.sortKrPerM3.toFixed(2)} kr/m³</span>
                  </div>
                )}
                <div style={{ ...radStil, borderTop: `0.5px solid ${V6_SEP}`, paddingTop: 4 }}>
                  <span>= Effektivt pris</span>
                  <span style={{ color: '#fff', fontWeight: 600 }}>{m.acord.effektivtPrisPerM3.toFixed(2)} kr/m³</span>
                </div>
                {m.acord.avstandKr > 0 && (
                  <div style={radStil}>
                    <span>+ Skotningsavstånd (per lass, hela 100 m över grundavstånd)</span>
                    <span style={{ color: '#fff' }}>{kr(m.acord.avstandKr)}</span>
                  </div>
                )}
                <div style={{ color: V6_GREY2 }}>Timmar = G15 (upparbetning + terrängkörning)</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EkonomiSektion({ obj }: { obj: UppfoljningObjekt }) {
  const { medarbetare, loading: medarbetareLaddar } = useCurrentMedarbetare();
  const arAdmin = medarbetare?.roll === 'admin';
  const [open, setOpen] = useState(false);
  const ekonomi = useObjektEkonomi(obj, arAdmin);

  if (medarbetareLaddar || !arAdmin) return null;

  const headerTal = ekonomi.status === 'ok' && ekonomi.totalSkillnad != null ? ekonomi.totalSkillnad : null;

  return (
    <div style={{ borderTop: `0.5px solid ${V6_SEP}` }}>
      <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '16px 24px', background: 'transparent', border: 'none', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>Ekonomi · Ackord vs timpeng</span>
        <span style={{ flex: 1 }} />
        {headerTal != null && (
          <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: headerTal >= 0 ? V6_POS : V6_NEG }}>{krSigned(headerTal)}</span>
        )}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={V6_GREY} strokeWidth="2" strokeLinecap="round" style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .2s', flexShrink: 0 }}>
          <polyline points="4 2 8 6 4 10" />
        </svg>
      </button>

      {open && (
        <div style={{ padding: '0 24px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ekonomi.status === 'laddar' && (
            <div style={{ color: V6_GREY, fontSize: 13, padding: '8px 0' }}>Laddar ekonomi...</div>
          )}
          {ekonomi.status === 'fel' && (
            <div style={{ color: V6_WARN, fontSize: 13, padding: '8px 0' }}>Kunde inte läsa ekonomidata. Försök igen.</div>
          )}
          {ekonomi.status === 'ingen_data' && (
            <div style={{ color: V6_GREY, fontSize: 13, padding: '8px 0' }}>Ingen objektkopplad produktions- eller tidsdata — kan inte räkna.</div>
          )}
          {ekonomi.status === 'ok' && (
            <>
              {ekonomi.timpengLage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'rgba(91,143,255,0.10)', borderRadius: 10 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#adc6ff', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Faktureras som timpeng</span>
                  <span style={{ fontSize: 11, color: V6_GREY }}>
                    {ekonomi.timpengLageOrsak === 'gallring' ? 'gallring körs alltid på timpeng — ackord visas som jämförelse' : 'manuellt flaggat — ackord visas som jämförelse'}
                  </span>
                </div>
              )}
              {ekonomi.maskiner.map(m => <MaskinKort key={m.maskinId} m={m} />)}
              <div style={{ fontSize: 10, color: V6_GREY2, lineHeight: 1.5 }}>
                Terräng-tillägg, prisscenarier och övriga tillägg (kvalitetssäkring m.m.) ingår inte i beräkningen ännu.
              </div>
              <Link href="/ekonomi/per-objekt" style={{ fontSize: 13, color: V6_BLUE, fontWeight: 600, textDecoration: 'none', padding: '4px 0' }}>
                Öppna i Ekonomi → Per objekt ›
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
