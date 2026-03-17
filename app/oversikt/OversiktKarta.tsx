'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import { OversiktObjekt, Maskin, MaskinKoItem, C, ST, TF } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, pc, getMaskinDisplayName, getMaskinTyp, grotEffectiveColor, grotDeadlineDays, grotStepIndex, GROT_STEPS } from './oversikt-utils';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

declare global {
  interface Window { maplibregl: any; }
}

interface Props {
  objekt: OversiktObjekt[];
  maskiner: Maskin[];
  maskinKo: MaskinKoItem[];
}

/* ── Haversine distance in km (with decimals) ── */
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const r = (x: number) => x * Math.PI / 180;
  const dLat = r(lat2 - lat1);
  const dLng = r(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/* ── Segment distance (OSRM or fallback) ── */
interface SegmentDist { km: number; approx: boolean; }
function segKey(lng1: number, lat1: number, lng2: number, lat2: number): string {
  return `${lng1},${lat1};${lng2},${lat2}`;
}

/* ── Small reusable components ── */
function Tag({ children, w }: { children: React.ReactNode; w?: boolean }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, color: w ? C.yellow : 'rgba(255,255,255,0.7)',
      padding: '4px 10px', borderRadius: 100,
      background: w ? 'rgba(234,179,8,0.1)' : 'rgba(255,255,255,0.04)',
      border: w ? '1px solid rgba(234,179,8,0.2)' : '1px solid rgba(255,255,255,0.08)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  );
}

function InfoRow({ label, val, warn }: { label: string; val: string; warn?: boolean }) {
  return (
    <div style={{ flex: 1, background: 'rgba(255,255,255,0.025)', padding: '6px 4px', textAlign: 'center' }}>
      <div style={{ fontSize: 8, color: C.t4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: warn ? C.yellow : C.t2 }}>{val}</div>
    </div>
  );
}

/* ── Helper: build square polygon from lat/lng + areal ── */

/* ── Körbarhet mapping ── */
function korbarhetsLabel(barighet?: string): { text: string; color: string } {
  if (!barighet) return { text: '–', color: C.t4 };
  const b = barighet.toLowerCase();
  if (b === 'bra' || b === 'god') return { text: 'KÖR', color: '#22c55e' };
  if (b === 'medel' || b === 'normal') return { text: 'BEGRÄNSAD', color: '#eab308' };
  return { text: 'EJ KÖRBART', color: '#ef4444' };
}

/* ── ObjCard popup (positioned fixed at screen bottom) ── */
function ObjCard({ obj }: { obj: OversiktObjekt }) {
  const o = obj;
  const tf = TF[o.typ] || C.yellow;

  // Status dot
  const statusColor = o.status === 'pagaende' || o.status === 'skordning' || o.status === 'skotning'
    ? '#22c55e' : o.status === 'klar' ? '#fafafa' : '#71717a';
  const atgardLabel = o.atgard || (o.typ === 'slutavverkning' ? 'AU' : 'Gallring');

  // Volym
  const volPerHa = o.volym && o.areal ? (o.volym / o.areal).toFixed(0) : '–';

  // Körbarhet
  const korb = korbarhetsLabel(o.barighet);

  // Trailer
  const trailerLabel = o.trailer_behovs === true ? 'TRAILER' : o.trailer_behovs === false ? 'HJULAR' : (o.transport_trailer_in === true ? 'TRAILER' : o.transport_trailer_in === false ? 'HJULAR' : null);
  const trailerColor = trailerLabel === 'TRAILER' ? '#f97316' : '#71717a';

  // Kontakt
  const kontaktNamn = o.kontakt_namn || o.markagare || null;
  const kontaktTel = o.kontakt_telefon || null;

  // Beräknad data från trakt_data (sparad i planeringsvyn)
  const ber = o.trakt_data?.beraknad;

  const S = {
    surface: '#1a1a18',
    surface2: '#222220',
    border: 'rgba(255,255,255,0.07)',
    text: '#e8e8e4',
    muted: '#7a7a72',
    accent: '#5aff8c',
  };

  // Gradient divider
  const Div = () => <div style={{ height: 1, margin: '0 -24px', background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)' }} />;

  // Gradient text style for large numbers
  const numStyle: React.CSSProperties = {
    fontSize: 36, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1,
    background: 'linear-gradient(180deg, #ffffff 0%, #a0a0a0 100%)',
    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
    textShadow: '0 2px 4px rgba(0,0,0,0.3)',
    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
  };

  // Collect noteringar
  const noteringar: string[] = [];
  if (o.transport_kommentar) noteringar.push(o.transport_kommentar);
  if (o.skordare_manuell_fallning && o.skordare_manuell_fallning_text) noteringar.push(o.skordare_manuell_fallning_text);
  if (o.markagare_ska_ha_ved && o.markagare_ved_text) noteringar.push(o.markagare_ved_text);

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      width: 380, maxWidth: 'calc(100% - 24px)',
      background: 'rgba(15,15,20,0.85)',
      backdropFilter: 'blur(20px) saturate(180%)', WebkitBackdropFilter: 'blur(20px) saturate(180%)',
      borderRadius: 24, overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.12)',
      boxShadow: '0 32px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05), inset 0 1px 0 rgba(255,255,255,0.1)',
      zIndex: 20, animation: 'fadeUp .2s ease-out',
    }}>
      <div style={{ height: 2, background: `linear-gradient(90deg,${tf},transparent)` }} />
      <div style={{ padding: '24px 24px 22px', maxHeight: '65vh', overflowY: 'auto' }}>

        {/* 1. Header */}
        <div style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: '#f0f0ec', lineHeight: 1.2 }}>{o.namn}</div>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0, boxShadow: `0 0 8px ${statusColor}90` }} />
          </div>
          <div style={{ fontSize: 12, color: S.muted, letterSpacing: '0.01em' }}>
            {o.areal || '–'} ha · {atgardLabel}
          </div>
        </div>

        {/* 2. Volym */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 22 }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 14px', textAlign: 'center' }}>
            <div style={numStyle}>{formatVolym(o.volym || 0)}</div>
            <div style={{ fontSize: 9, color: S.muted, marginTop: 10, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 500 }}>Total m³sk</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: '18px 14px', textAlign: 'center' }}>
            <div style={numStyle}>{volPerHa}</div>
            <div style={{ fontSize: 9, color: S.muted, marginTop: 10, textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 500 }}>m³sk/ha</div>
          </div>
        </div>

        {/* 3. Trailer label */}
        {trailerLabel && (
          <div style={{ marginBottom: 20 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.04em', color: '#e8e8e4' }}>{trailerLabel}</span>
          </div>
        )}

        <Div />

        {/* 4. Kontakt */}
        {(kontaktNamn || kontaktTel) && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 0' }}>
              <div style={{ width: 32, height: 32, borderRadius: 16, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: S.text }}>{kontaktNamn || '–'}</div>
              </div>
              {kontaktTel && (
                <a href={`tel:${kontaktTel}`} style={{ fontSize: 12, color: '#5b8fff', textDecoration: 'none', fontWeight: 500 }}>{kontaktTel}</a>
              )}
            </div>
            <Div />
          </>
        )}

        {/* 5. Tillträde / Noteringar */}
        {(o.ovrigt_info || noteringar.length > 0 || o.info_anteckningar) && (
          <div style={{ padding: '16px 0' }}>
            {o.ovrigt_info && (
              <div style={{ marginBottom: (noteringar.length > 0 || o.info_anteckningar) ? 14 : 0 }}>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: S.muted, marginBottom: 6 }}>Tillträde</div>
                <div style={{ fontSize: 12, color: S.text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{o.ovrigt_info}</div>
              </div>
            )}
            {(noteringar.length > 0 || o.info_anteckningar) && (
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: S.muted, marginBottom: 6 }}>Noteringar</div>
                {noteringar.map((n, i) => (
                  <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>{n}</div>
                ))}
                {o.info_anteckningar && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: noteringar.length > 0 ? 4 : 0 }}>{o.info_anteckningar}</div>
                )}
              </div>
            )}
          </div>
        )}

        {(o.ovrigt_info || noteringar.length > 0 || o.info_anteckningar) && <Div />}

        {/* 6. Trädslag */}
        {ber?.tradslag && ber.tradslag.length > 0 && !ber.tradslag.every(ts => ts.namn.toLowerCase().includes('okänt')) && (
          <>
            <div style={{ padding: '16px 0' }}>
              <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: S.muted, marginBottom: 10 }}>Trädslag</div>
              {(() => {
                const TRADSLAG_FARG: Record<string, string> = { 'Gran': '#66BB6A', 'Tall': '#FFA726', 'Björk': '#FFF176', 'Ek': '#A1887F', 'Bok': '#BCAAA4', 'Contorta': '#FF8A65' }
                const DEFAULT_FARG = '#9E9E9E'
                const slag = ber.tradslag.filter(ts => !ts.namn.toLowerCase().includes('okänt') && ts.andel > 0).slice(0, 6)
                const total = slag.reduce((s, ts) => s + ts.andel, 0)
                return (
                  <>
                    <div style={{ display: 'flex', height: 16, borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                      {slag.map((ts, i) => (
                        <div key={i} style={{
                          width: `${(ts.andel / total) * 100}%`, minWidth: 3,
                          background: TRADSLAG_FARG[ts.namn] || DEFAULT_FARG,
                          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
                        }} />
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                      {slag.map((ts, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 4, background: TRADSLAG_FARG[ts.namn] || DEFAULT_FARG, flexShrink: 0, boxShadow: `0 0 4px ${(TRADSLAG_FARG[ts.namn] || DEFAULT_FARG)}40` }} />
                          <span style={{ fontSize: 11, color: S.text, fontWeight: 500 }}>{ts.namn}</span>
                          <span style={{ fontSize: 11, color: S.muted, marginLeft: 'auto', fontWeight: 600 }}>{Math.round(ts.andel * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </>
                )
              })()}
              <div style={{ display: 'flex', gap: 20, marginTop: 14 }}>
                <span style={{ fontSize: 11, color: S.muted }}>Diameter <span style={{ fontWeight: 700, color: S.text }}>{ber.medeldiameter ? `${ber.medeldiameter.toFixed(0)} cm` : '–'}</span></span>
                <span style={{ fontSize: 11, color: S.muted }}>Höjd <span style={{ fontWeight: 700, color: S.text }}>{ber.medelhojd ? `${ber.medelhojd.toFixed(0)} m` : '–'}</span></span>
              </div>
            </div>
            <Div />
          </>
        )}

        {/* 7. Jordart + Lutning */}
        {ber?.jordart && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '14px 0' }}>
              <span style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: S.muted }}>Mark</span>
              <div style={{ flex: 1, textAlign: 'right', fontSize: 12, fontWeight: 500, color: S.text }}>
                {ber.jordart}{ber.medelLutning != null ? ` · ${ber.medelLutning.toFixed(1)}° lutning` : ''}
              </div>
            </div>
            <Div />
          </>
        )}

        {/* 8. Restriktioner */}
        {ber?.restriktioner && ber.restriktioner.length > 0 && (
          <>
            <div style={{ padding: '14px 0' }}>
              <div style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 14, padding: '14px 16px' }}>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: '#ef4444', marginBottom: 6 }}>
                  Restriktioner ({ber.restriktioner.length})
                </div>
                {ber.restriktioner.slice(0, 5).map((r, i) => (
                  <div key={i} style={{ fontSize: 11, color: S.text, marginBottom: i < Math.min(ber.restriktioner!.length, 5) - 1 ? 4 : 0 }}>
                    {r.name}{r.warning ? <span style={{ color: '#ef4444', fontSize: 10 }}> — {r.warning}</span> : ''}
                  </div>
                ))}
                {ber.restriktioner.length > 5 && (
                  <div style={{ fontSize: 10, color: S.muted, marginTop: 4 }}>+{ber.restriktioner.length - 5} till</div>
                )}
              </div>
            </div>
            <Div />
          </>
        )}

        {/* 9. Maskiner */}
        {(o.skordare_maskin || o.skotare_maskin) && (
          <div style={{ padding: '16px 0' }}>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.8px', color: S.muted, marginBottom: 10 }}>Maskiner</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: (o.skotare_lastreder_breddat || o.skotare_ris_direkt || o.skordare_manuell_fallning || o.markagare_ska_ha_ved) ? 10 : 0 }}>
              {o.skordare_maskin && (
                <span style={{
                  fontSize: 12, fontWeight: 600, color: S.text, padding: '9px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  transition: 'background 0.2s ease',
                }}>
                  {o.skordare_maskin}{o.skordare_band ? ` · Band ${o.skordare_band_par || ''}p` : ''}
                </span>
              )}
              {o.skotare_maskin && (
                <span style={{
                  fontSize: 12, fontWeight: 600, color: S.text, padding: '9px 16px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  transition: 'background 0.2s ease',
                }}>
                  {o.skotare_maskin}{o.skotare_band ? ` · Band ${o.skotare_band_par || ''}p` : ''}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {o.skotare_lastreder_breddat && <Tag>Brett lastrede</Tag>}
              {o.skotare_ris_direkt && <Tag>GROT direkt</Tag>}
              {o.skordare_manuell_fallning && <Tag w>Manuell fällning</Tag>}
              {o.markagare_ska_ha_ved && <Tag>Ved</Tag>}
            </div>
          </div>
        )}

        {/* 10. Footer */}
        <button onClick={() => window.location.href = `/planering?objekt=${o.id}`} style={{
          width: '100%', marginTop: 10, padding: '14px 0',
          background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 14, color: S.text, fontSize: 13, fontWeight: 600,
          cursor: 'pointer', fontFamily: ff, transition: 'all 0.2s ease', letterSpacing: '-0.01em',
        }}>
          Visa avverkning →
        </button>
      </div>
    </div>
  );
}

/* ── GROT popup card ── */
function GrotCard({ obj }: { obj: OversiktObjekt }) {
  const lass = obj.grot_volym ? Math.ceil(obj.grot_volym / 20) : 0;
  const clr = grotEffectiveColor(obj.grot_status, obj.grot_deadline);
  const bgTint = `${clr}15`;
  const deadlineDays = grotDeadlineDays(obj.grot_deadline);
  const isDone = grotStepIndex(obj.grot_status) >= 3;
  const isOverdue = !isDone && deadlineDays !== null && deadlineDays < 0;
  const isUrgent = !isDone && deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 14;
  const stepIdx = grotStepIndex(obj.grot_status);
  const sl: Record<string, string> = { ej_aktuellt: 'Ej aktuellt', hoglagd: 'Höglagd', flisad: 'Flisad', borttransporterad: 'Klar', bortkord: 'Klar' };

  return (
    <div onClick={(e) => e.stopPropagation()} style={{
      position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
      width: 300, maxWidth: 'calc(100% - 24px)',
      background: 'rgba(13,13,15,.97)', backdropFilter: 'blur(24px)',
      borderRadius: 14, overflow: 'hidden', border: `1px solid ${C.border}`, zIndex: 20,
      animation: 'fadeUp .2s ease-out',
    }}>
      <div style={{ height: 2, background: `linear-gradient(90deg,${clr},transparent)` }} />
      <div style={{ padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <div style={{ width: 10, height: 10, background: clr, transform: 'rotate(45deg)', borderRadius: 2, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{obj.namn}</div>
            <div style={{ fontSize: 10, color: C.t3 }}>{sl[obj.grot_status] || obj.grot_status}</div>
          </div>
          {isOverdue && (
            <span style={{ fontSize: 9, fontWeight: 600, color: C.red, padding: '2px 8px', background: C.rd, borderRadius: 5 }}>Försenad</span>
          )}
          {isUrgent && (
            <span style={{ fontSize: 9, fontWeight: 600, color: C.yellow, padding: '2px 8px', background: C.yd, borderRadius: 5 }}>
              {deadlineDays === 0 ? 'Idag' : `${deadlineDays}d kvar`}
            </span>
          )}
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 10 }}>
          {GROT_STEPS.map((step, i) => {
            const filled = stepIdx >= i + 1;
            return (
              <React.Fragment key={step.key}>
                {i > 0 && <div style={{ width: 16, height: 2, background: filled ? step.color : 'rgba(255,255,255,0.06)' }} />}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: filled ? step.color : 'rgba(255,255,255,0.08)' }} />
                  <span style={{ fontSize: 9, color: filled ? step.color : C.t4, fontWeight: filled ? 600 : 400 }}>{step.label}</span>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 2, borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}>
          <div style={{ flex: 1, background: bgTint, padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: C.t4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Volym</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: clr }}>{obj.grot_volym ? formatVolym(obj.grot_volym) : '–'} <span style={{ fontSize: 9, fontWeight: 400, color: C.t4 }}>m³</span></div>
          </div>
          <div style={{ flex: 1, background: bgTint, padding: '8px 4px', textAlign: 'center' }}>
            <div style={{ fontSize: 8, color: C.t4, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 2 }}>Lass</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: clr }}>{lass || '–'} <span style={{ fontSize: 9, fontWeight: 400, color: C.t4 }}>st</span></div>
          </div>
        </div>
        {obj.grot_deadline && (
          <div style={{ fontSize: 10, color: isOverdue ? C.red : isUrgent ? C.yellow : C.t3, marginBottom: 6 }}>
            Senast: {new Date(obj.grot_deadline + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        )}
        {obj.grot_anteckning && (
          <div style={{ fontSize: 11, color: C.t3, padding: '8px 10px', background: bgTint, borderRadius: 8 }}>
            {obj.grot_anteckning}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Build GROT diamond marker ── */
function buildGrotMarkerEl(obj: OversiktObjekt, isSelected: boolean, onClick: () => void): HTMLDivElement {
  const clr = grotEffectiveColor(obj.grot_status, obj.grot_deadline);
  const sz = isSelected ? 16 : 12;
  const hitSize = 24;
  const w = document.createElement('div');
  w.className = 'ovk-grot-marker';
  w.style.cssText = `width:${hitSize}px;height:${hitSize}px;cursor:pointer;overflow:visible;opacity:${isSelected ? '1' : '0.7'}`;

  const diamond = document.createElement('div');
  diamond.style.cssText = `position:absolute;left:50%;top:50%;width:${sz}px;height:${sz}px;transform:translate(-50%,-50%) rotate(45deg);background:${clr};border-radius:2px;box-shadow:${isSelected ? `0 0 12px ${clr}60` : '0 1px 4px rgba(0,0,0,.4)'}`;
  w.appendChild(diamond);

  const lbl = document.createElement('div');
  lbl.className = 'ovk-lbl';
  lbl.style.cssText = `position:absolute;top:${hitSize / 2 + sz / 2 + 4}px;left:50%;transform:translateX(-50%);pointer-events:none;white-space:nowrap`;
  lbl.innerHTML = `<div style="font-size:10px;font-weight:600;color:${clr};font-family:${ff};background:rgba(0,0,0,0.75);padding:2px 6px;border-radius:4px">${obj.namn}</div>`;
  w.appendChild(lbl);

  w.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return w;
}

/* ── Route colors per machine ── */
const RC = ['#3b82f6', '#f97316', '#22c55e', '#a855f7', '#ec4899', '#06b6d4'];

/* ── Marker info passed to builder ── */
interface MInfo {
  obj: OversiktObjekt;
  queueNum: number | null;
  isHistoryKlar: boolean;
  showChips: boolean;
  maskinName: string | null;
}

/* ── Build a MapLibre marker DOM element ── */
function buildMarkerEl(
  info: MInfo,
  maskinKo: MaskinKoItem[],
  maskiner: Maskin[],
  isSelected: boolean,
  onClick: () => void,
): HTMLDivElement {
  const { obj, queueNum, isHistoryKlar, showChips, maskinName } = info;
  const isActive = obj.status === 'pagaende' || obj.status === 'skordning' || obj.status === 'skotning';
  const tf = isHistoryKlar ? '#52525b' : (TF[obj.typ] || C.yellow);
  const st = ST[obj.status] || ST.planerad;
  const dotSize = isSelected ? 34 : isActive ? 30 : isHistoryKlar ? 16 : 24;
  const hitSize = 34; // constant so MapLibre anchor never shifts

  // Wrapper — no position property, MapLibre's .maplibregl-marker class handles it
  const w = document.createElement('div');
  w.className = 'ovk-marker';
  w.dataset.objektId = obj.id;
  w.style.cssText = `width:${hitSize}px;height:${hitSize}px;cursor:pointer;overflow:visible;opacity:${isHistoryKlar ? '0.3' : '1'}`;

  // Pulse ring on active objects (ring that expands and fades out)
  if (isActive && !isHistoryKlar) {
    const p = document.createElement('div');
    p.style.cssText = `position:absolute;left:50%;top:50%;width:${dotSize}px;height:${dotSize}px;margin-left:-${dotSize / 2}px;margin-top:-${dotSize / 2}px;border-radius:50%;border:3px solid ${tf};animation:pulseMarker 2.5s infinite;pointer-events:none`;
    w.appendChild(p);
  }

  // Dot circle
  const dot = document.createElement('div');
  if (isHistoryKlar) {
    // Klar in history mode: gray circle with checkmark
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${C.bg};border:1.5px solid #52525b;display:flex;align-items:center;justify-content:center`;
    dot.innerHTML = `<span style="font-size:${Math.round(dotSize * 0.55)}px;color:#71717a;line-height:1">✓</span>`;
  } else if (queueNum !== null) {
    // Queued planned object: filled type-color circle with WHITE number
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${tf};display:flex;align-items:center;justify-content:center;box-shadow:${isSelected ? `0 0 20px ${tf}40` : '0 2px 8px rgba(0,0,0,.5)'}`;
    dot.innerHTML = `<span style="font-size:${dotSize >= 24 ? 13 : 10}px;font-weight:700;color:#fff;font-family:${ff};text-shadow:0 1px 2px rgba(0,0,0,.3)">${queueNum}</span>`;
  } else {
    // Active (pulsing) or unqueued: status inner dot
    const innerSize = isSelected ? 10 : isActive ? 8 : 6;
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${C.bg};border:2px solid ${tf};display:flex;align-items:center;justify-content:center;box-shadow:${isSelected ? `0 0 20px ${tf}25` : 'none'}`;
    const inner = document.createElement('div');
    inner.style.cssText = `width:${innerSize}px;height:${innerSize}px;border-radius:50%;background:${st.c}`;
    dot.appendChild(inner);
  }
  w.appendChild(dot);

  // Name label below — dark background for readability
  // CSS class controls visibility based on zoom level
  const lbl = document.createElement('div');
  lbl.className = isActive ? 'ovk-lbl ovk-lbl-active' : 'ovk-lbl';
  lbl.style.cssText = `position:absolute;top:${hitSize / 2 + dotSize / 2 + 4}px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;white-space:nowrap`;
  const clr = isHistoryKlar ? '#71717a' : '#fff';
  let html = `<div style="font-size:13px;font-weight:600;color:${clr};font-family:${ff};background:rgba(0,0,0,0.75);padding:3px 8px;border-radius:6px">${obj.namn}</div>`;
  if (isHistoryKlar) {
    html += `<div style="font-size:9px;color:#71717a;font-family:${ff};margin-top:2px;background:rgba(0,0,0,0.6);padding:1px 6px;border-radius:4px;display:inline-block">Klar</div>`;
  }
  lbl.innerHTML = html;
  w.appendChild(lbl);

  // Machine name above active prick (when maskinFilter is active)
  if (maskinName) {
    const md = document.createElement('div');
    md.style.cssText = `position:absolute;bottom:${hitSize / 2 + dotSize / 2 + 6}px;left:50%;transform:translateX(-50%);pointer-events:none;white-space:nowrap`;
    md.innerHTML = `<div style="background:rgba(0,0,0,0.85);padding:3px 8px;border-radius:6px;font-size:10px;font-weight:600;color:#fff;font-family:${ff}">${maskinName}</div>`;
    w.appendChild(md);
  } else if (showChips) {
    // Machine chips for active objects (no maskinFilter)
    const koForObj = maskinKo.filter(k => k.objekt_id === obj.id);
    if (koForObj.length > 0) {
      const md = document.createElement('div');
      md.style.cssText = `position:absolute;bottom:${hitSize / 2 + dotSize / 2 + 6}px;left:50%;transform:translateX(-50%);display:flex;gap:3px;pointer-events:none;white-space:nowrap`;
      koForObj.forEach(k => {
        const m = maskiner.find(mm => mm.maskin_id === k.maskin_id);
        if (m) {
          const ch = document.createElement('div');
          ch.style.cssText = `background:rgba(0,0,0,.85);padding:3px 8px;border-radius:6px`;
          ch.innerHTML = `<span style="font-size:10px;font-weight:600;color:#fff;font-family:${ff}">${getMaskinDisplayName(m)}</span>`;
          md.appendChild(ch);
        }
      });
      w.appendChild(md);
    }
  }

  w.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return w;
}

/* ════════════════════════════════════════════════════════════════ */
export default function OversiktKarta({ objekt, maskiner, maskinKo }: Props) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersMapRef = useRef<Map<string, any>>(new Map());
  const distMarkersRef = useRef<any[]>([]);
  const grotMarkersRef = useRef<Map<string, any>>(new Map());
  const [mapReady, setMapReady] = useState(false);
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedGrotId, setSelectedGrotId] = useState<string | null>(null);
  const [filt, setFilt] = useState<'alla' | 'slutavverkning' | 'gallring'>('alla');
  const [showHist, setShowHist] = useState(false);
  const [showGrot, setShowGrot] = useState(false);
  const [maskinFilter, setMaskinFilter] = useState<string | null>(null);
  const [showMaskinDrop, setShowMaskinDrop] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(10);
  const [osrmDist, setOsrmDist] = useState<Record<string, SegmentDist>>({});
  const osrmCacheRef = useRef<Record<string, SegmentDist>>({});

  const selectedObj = selectedId ? objekt.find(o => o.id === selectedId) : null;
  const handleMarkerClick = useCallback((id: string) => {
    setSelectedId(prev => prev === id ? null : id);
  }, []);

  /* ── Machines that have at least one queued object (for route computation) ── */
  const queuedMaskiner = useMemo(() => {
    const ids = new Set(maskinKo.map(k => k.maskin_id));
    return maskiner.filter(m => ids.has(m.maskin_id));
  }, [maskiner, maskinKo]);

  /* ── Route data: ONLY when a specific machine is filtered ── */
  const routeData = useMemo(() => {
    // "Alla maskiner" = no numbering, no route lines
    if (!maskinFilter) return [];
    const m = queuedMaskiner.find(x => x.maskin_id === maskinFilter);
    if (!m) return [];

    const koItems = maskinKo
      .filter(k => k.maskin_id === maskinFilter)
      .sort((a, b) => a.ordning - b.ordning);
    if (!koItems.length) return [];

    const numbered: Record<string, number> = {};
    const lineCoords: [number, number][] = [];
    let num = 1;

    koItems.forEach(k => {
      const o = objekt.find(x => x.id === k.objekt_id);
      if (!o || !o.lat || !o.lng || o.status === 'klar') return;
      const isAct = o.status === 'pagaende' || o.status === 'skordning' || o.status === 'skotning';
      lineCoords.push([o.lng, o.lat]);
      if (!isAct) { numbered[o.id] = num; num++; }
    });

    const color = getMaskinTyp(m.typ) === 'skördare' ? C.yellow : C.orange;
    return [{ maskinId: m.maskin_id, color, numbered, lineCoords }];
  }, [queuedMaskiner, maskinKo, objekt, maskinFilter]);

  /* ── Merged queue-number lookup: objId → number ── */
  const queueNums = useMemo(() => {
    const nums: Record<string, number> = {};
    routeData.forEach(rd => {
      Object.entries(rd.numbered).forEach(([id, n]) => { if (!(id in nums)) nums[id] = n; });
    });
    return nums;
  }, [routeData]);

  /* ── Total route distance (from OSRM or fallback) ── */
  const totalDistance = useMemo(() => {
    let total = 0;
    let anyApprox = false;
    routeData.forEach(rd => {
      for (let i = 0; i < rd.lineCoords.length - 1; i++) {
        const [lng1, lat1] = rd.lineCoords[i];
        const [lng2, lat2] = rd.lineCoords[i + 1];
        const key = segKey(lng1, lat1, lng2, lat2);
        const seg = osrmDist[key];
        if (seg) {
          total += seg.km;
          if (seg.approx) anyApprox = true;
        } else {
          total += haversineKm(lat1, lng1, lat2, lng2) * 1.4;
          anyApprox = true;
        }
      }
    });
    return { total, anyApprox };
  }, [routeData, osrmDist]);

  /* ── Visible object IDs ── */
  const visIds = useMemo(() => {
    let list = objekt.filter(o => o.lat && o.lng);
    if (filt !== 'alla') list = list.filter(o => o.typ === filt);
    if (maskinFilter) {
      const ids = new Set(maskinKo.filter(k => k.maskin_id === maskinFilter).map(k => k.objekt_id));
      list = list.filter(o => ids.has(o.id));
    }
    if (!showHist) list = list.filter(o => o.status !== 'klar');
    return list.map(o => o.id);
  }, [objekt, filt, maskinFilter, maskinKo, showHist]);

  /* ── GROT objects (with coordinates and grot_volym > 0) ── */
  const grotObjekt = useMemo(() => {
    if (!showGrot) return [];
    return objekt.filter(o => o.lat && o.lng && o.grot_volym && o.grot_volym > 0);
  }, [objekt, showGrot]);

  const selectedGrotObj = selectedGrotId ? objekt.find(o => o.id === selectedGrotId) : null;

  /* ── Helper: build marker info ── */
  const mkInfo = useCallback((obj: OversiktObjekt): MInfo => {
    const isK = obj.status === 'klar';
    const isA = obj.status === 'pagaende' || obj.status === 'skordning' || obj.status === 'skotning';

    let maskinName: string | null = null;
    if (maskinFilter && isA) {
      const m = maskiner.find(x => x.maskin_id === maskinFilter);
      if (m) maskinName = getMaskinDisplayName(m);
    }

    return {
      obj,
      // Numbers only when a specific machine is filtered
      queueNum: (maskinFilter && !isK) ? (queueNums[obj.id] ?? null) : null,
      isHistoryKlar: isK,
      showChips: isA,
      maskinName,
    };
  }, [queueNums, maskinFilter, maskiner]);

  /* ── Load MapLibre CDN ── */
  useEffect(() => {
    if (!document.getElementById('maplibre-css-oversikt')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css-oversikt';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }
    if (!window.maplibregl) {
      const script = document.createElement('script');
      script.id = 'maplibre-js-oversikt';
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      script.onload = () => setMapReady(true);
      document.head.appendChild(script);
    } else {
      setMapReady(true);
    }
  }, []);

  /* ── Init map (once) ── */
  useEffect(() => {
    if (!mapReady || !mapContainerRef.current || mapRef.current) return;

    const wc = objekt.filter(o => o.lat && o.lng);
    const center: [number, number] = wc.length
      ? [wc.reduce((s, o) => s + o.lng!, 0) / wc.length, wc.reduce((s, o) => s + o.lat!, 0) / wc.length]
      : [14.70, 56.40];

    const map = new window.maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '&copy; OSM' } },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
      },
      center, zoom: 10,
    });
    mapRef.current = map;

    map.on('zoom', () => setZoomLevel(map.getZoom()));

    map.on('load', () => {
      // Route line layer (GeoJSON — follows map natively)
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'routes', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 2.5, 'line-dasharray': [6, 4], 'line-opacity': 0.6 },
      });

      if (wc.length > 1) {
        const b = new window.maplibregl.LngLatBounds();
        wc.forEach(o => b.extend([o.lng!, o.lat!]));
        map.fitBounds(b, { padding: 60, maxZoom: 13 });
      }
      setMapStyleLoaded(true);
    });

    return () => {
      distMarkersRef.current.forEach(m => m.remove());
      distMarkersRef.current = [];
      grotMarkersRef.current.forEach(m => m.remove());
      grotMarkersRef.current.clear();
      markersMapRef.current.forEach(m => m.remove());
      markersMapRef.current.clear();
      mapRef.current?.remove();
      mapRef.current = null;
      setMapStyleLoaded(false);
    };
  }, [mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Update route lines when route data changes ── */
  useEffect(() => {
    if (!mapRef.current || !mapStyleLoaded) return;
    const src = mapRef.current.getSource('routes');
    if (!src) return;

    const features = routeData
      .filter(rd => rd.lineCoords.length >= 2)
      .map(rd => ({
        type: 'Feature' as const,
        properties: { color: rd.color },
        geometry: { type: 'LineString' as const, coordinates: rd.lineCoords },
      }));
    src.setData({ type: 'FeatureCollection', features });
  }, [routeData, mapStyleLoaded]);

  /* ── Fetch OSRM road distances for route segments ── */
  useEffect(() => {
    if (routeData.length === 0) { setOsrmDist({}); return; }

    let cancelled = false;
    const toFetch: { key: string; lng1: number; lat1: number; lng2: number; lat2: number }[] = [];

    routeData.forEach(rd => {
      for (let i = 0; i < rd.lineCoords.length - 1; i++) {
        const [lng1, lat1] = rd.lineCoords[i];
        const [lng2, lat2] = rd.lineCoords[i + 1];
        const key = segKey(lng1, lat1, lng2, lat2);
        if (!osrmCacheRef.current[key]) toFetch.push({ key, lng1, lat1, lng2, lat2 });
      }
    });

    // If all cached, set immediately
    if (toFetch.length === 0) {
      const all: Record<string, SegmentDist> = {};
      routeData.forEach(rd => {
        for (let i = 0; i < rd.lineCoords.length - 1; i++) {
          const [lng1, lat1] = rd.lineCoords[i];
          const [lng2, lat2] = rd.lineCoords[i + 1];
          const key = segKey(lng1, lat1, lng2, lat2);
          all[key] = osrmCacheRef.current[key];
        }
      });
      setOsrmDist(all);
      return;
    }

    const run = async () => {
      const results: Record<string, SegmentDist> = {};

      await Promise.all(toFetch.map(async ({ key, lng1, lat1, lng2, lat2 }) => {
        try {
          const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`;
          const res = await fetch(url);
          const data = await res.json();
          if (data.routes?.[0]?.distance != null) {
            results[key] = { km: data.routes[0].distance / 1000, approx: false };
          } else {
            throw new Error('No route');
          }
        } catch {
          results[key] = { km: haversineKm(lat1, lng1, lat2, lng2) * 1.4, approx: true };
        }
      }));

      if (cancelled) return;

      // Merge into cache
      Object.assign(osrmCacheRef.current, results);

      // Build full map for current route
      const all: Record<string, SegmentDist> = {};
      routeData.forEach(rd => {
        for (let i = 0; i < rd.lineCoords.length - 1; i++) {
          const [lng1, lat1] = rd.lineCoords[i];
          const [lng2, lat2] = rd.lineCoords[i + 1];
          const key = segKey(lng1, lat1, lng2, lat2);
          all[key] = osrmCacheRef.current[key];
        }
      });
      setOsrmDist(all);
    };

    run();
    return () => { cancelled = true; };
  }, [routeData]);

  /* ── Distance labels on route segments (OSRM-aware) ── */
  useEffect(() => {
    distMarkersRef.current.forEach(m => m.remove());
    distMarkersRef.current = [];

    if (!mapRef.current || !mapStyleLoaded) return;

    routeData.forEach(rd => {
      for (let i = 0; i < rd.lineCoords.length - 1; i++) {
        const [lng1, lat1] = rd.lineCoords[i];
        const [lng2, lat2] = rd.lineCoords[i + 1];
        const midLng = (lng1 + lng2) / 2;
        const midLat = (lat1 + lat2) / 2;

        const key = segKey(lng1, lat1, lng2, lat2);
        const seg = osrmDist[key];
        const dist = seg ? seg.km : haversineKm(lat1, lng1, lat2, lng2) * 1.4;
        const prefix = (!seg || seg.approx) ? '~' : '';
        const label = dist < 1 ? `${prefix}${Math.round(dist * 1000)} m` : `${prefix}${dist.toFixed(1)} km`;

        // Perpendicular pixel offset: push label to the right of the line direction
        const angle = Math.atan2(lat2 - lat1, lng2 - lng1);
        const perpX = -Math.sin(angle);
        const perpY = Math.cos(angle);
        const push = dist < 5 ? 50 : dist < 15 ? 30 : 0;
        const ox = Math.round(perpX * push);
        const oy = Math.round(-perpY * push);

        const el = document.createElement('div');
        el.style.cssText = `background:rgba(0,0,0,0.7);color:#fff;font-size:9px;font-weight:500;font-family:${ff};padding:2px 6px;border-radius:4px;pointer-events:none;white-space:nowrap`;
        el.textContent = label;

        const marker = new window.maplibregl.Marker({ element: el, anchor: 'center', offset: [ox, oy] })
          .setLngLat([midLng, midLat])
          .addTo(mapRef.current);
        distMarkersRef.current.push(marker);
      }
    });
  }, [routeData, mapStyleLoaded, osrmDist]);

  /* ── Sync markers: add new, remove stale ── */
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const want = new Set(visIds);
    const have = new Set(markersMapRef.current.keys());

    have.forEach(id => {
      if (!want.has(id)) { markersMapRef.current.get(id)?.remove(); markersMapRef.current.delete(id); }
    });
    visIds.forEach(id => {
      if (!have.has(id)) {
        const o = objekt.find(x => x.id === id);
        if (!o || !o.lat || !o.lng) return;
        const el = buildMarkerEl(mkInfo(o), maskinKo, maskiner, false, () => handleMarkerClick(id));
        const marker = new window.maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([o.lng, o.lat]).addTo(mapRef.current);
        markersMapRef.current.set(id, marker);
      }
    });
  }, [visIds, mapReady, objekt, maskiner, maskinKo, handleMarkerClick, mkInfo]);

  /* ── Update marker content (selection, numbers, history state) ── */
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    markersMapRef.current.forEach((marker, id) => {
      const o = objekt.find(x => x.id === id);
      if (!o) return;
      const info = mkInfo(o);
      const newEl = buildMarkerEl(info, maskinKo, maskiner, selectedId === id, () => handleMarkerClick(id));
      const el = marker.getElement();
      // Replace children only — preserve MapLibre's transform on the wrapper
      while (el.lastChild) el.removeChild(el.lastChild);
      while (newEl.firstChild) el.appendChild(newEl.firstChild);
      el.style.opacity = info.isHistoryKlar ? '0.3' : '1';
    });
  }, [selectedId, queueNums, showHist, maskinFilter, objekt, maskinKo, maskiner, mapReady, handleMarkerClick, mkInfo]);

  /* ── GROT markers: sync ── */
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const want = new Set(grotObjekt.map(o => o.id));
    const have = new Set(grotMarkersRef.current.keys());

    have.forEach(id => {
      if (!want.has(id)) { grotMarkersRef.current.get(id)?.remove(); grotMarkersRef.current.delete(id); }
    });
    grotObjekt.forEach(o => {
      if (!have.has(o.id)) {
        const el = buildGrotMarkerEl(o, false, () => { setSelectedGrotId(prev => prev === o.id ? null : o.id); setSelectedId(null); });
        const marker = new window.maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([o.lng!, o.lat!]).addTo(mapRef.current);
        grotMarkersRef.current.set(o.id, marker);
      }
    });
  }, [grotObjekt, mapReady, objekt]);

  /* ── GROT markers: update selection ── */
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    grotMarkersRef.current.forEach((marker, id) => {
      const o = objekt.find(x => x.id === id);
      if (!o) return;
      const newEl = buildGrotMarkerEl(o, selectedGrotId === id, () => { setSelectedGrotId(prev => prev === o.id ? null : o.id); setSelectedId(null); });
      const el = marker.getElement();
      while (el.lastChild) el.removeChild(el.lastChild);
      while (newEl.firstChild) el.appendChild(newEl.firstChild);
      el.style.opacity = selectedGrotId === id ? '1' : '0.7';
    });
  }, [selectedGrotId, objekt, mapReady]);

  /* ── Toggle distance marker visibility based on zoom ── */
  useEffect(() => {
    const show = zoomLevel < 11;
    distMarkersRef.current.forEach(m => {
      const el = m.getElement();
      if (el) el.style.display = show ? '' : 'none';
    });
  }, [zoomLevel]);

  // Zoom-based label visibility CSS
  const labelCss = zoomLevel < 10
    ? '.ovk-lbl{display:none!important}'
    : zoomLevel <= 12
      ? '.ovk-lbl{display:none!important}.ovk-lbl-active{display:block!important}'
      : '';

  return (
    <div style={{ position: 'absolute', inset: 0 }} onClick={() => { setSelectedId(null); setSelectedGrotId(null); setShowMaskinDrop(false); }}>
      <style>{`
        @keyframes pulseMarker{0%{transform:scale(1);opacity:.6}70%{transform:scale(2.5);opacity:0}100%{transform:scale(2.5);opacity:0}}
        @keyframes fadeUp{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        ${labelCss}
      `}</style>
      <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />

      {!mapReady && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.t3 }}>
          Laddar karta...
        </div>
      )}

      {/* ── Filter button (top right) ── */}
      <button onClick={e => { e.stopPropagation(); setShowFilterPanel(p => !p); }} style={{
        position: 'absolute', top: 16, right: 16, zIndex: 15,
        width: 40, height: 40, borderRadius: 10,
        background: showFilterPanel ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,.75)',
        backdropFilter: 'blur(16px)', border: `1px solid ${C.border}`,
        color: (filt !== 'alla' || showHist || showGrot || maskinFilter) ? C.yellow : C.t1,
        fontSize: 18, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
      </button>

      {/* ── Filter panel (slides in from right) ── */}
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 280, zIndex: 14,
        background: 'rgba(9,9,11,0.95)', backdropFilter: 'blur(24px)',
        borderLeft: `1px solid ${C.border}`,
        transform: showFilterPanel ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(.4,0,.2,1)',
        overflow: 'auto', padding: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.t1, fontFamily: ff }}>Filter</span>
          <button onClick={() => setShowFilterPanel(false)} style={{
            background: 'none', border: 'none', color: C.t3, fontSize: 18, cursor: 'pointer',
          }}>✕</button>
        </div>

        {/* Typ */}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.t3, marginBottom: 8, fontFamily: ff }}>Typ</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 }}>
          {([
            { k: 'alla' as const, l: 'Alla' },
            { k: 'slutavverkning' as const, l: 'Slutavverkning' },
            { k: 'gallring' as const, l: 'Gallring' },
          ]).map(f => (
            <button key={f.k} onClick={() => { setFilt(f.k); setSelectedId(null); }} style={{
              padding: '10px 14px', background: filt === f.k ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: filt === f.k ? C.t1 : C.t2, border: 'none', borderRadius: 8, fontSize: 12,
              fontWeight: filt === f.k ? 600 : 400, cursor: 'pointer', fontFamily: ff, textAlign: 'left',
            }}>{f.l}</button>
          ))}
        </div>

        {/* Visa */}
        <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.t3, marginBottom: 8, fontFamily: ff }}>Visa</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 }}>
          <button onClick={() => setShowHist(h => !h)} style={{
            padding: '10px 14px', background: showHist ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: showHist ? C.t1 : C.t2, border: 'none', borderRadius: 8, fontSize: 12,
            fontWeight: showHist ? 600 : 400, cursor: 'pointer', fontFamily: ff, textAlign: 'left',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>Historik <span style={{ fontSize: 10, color: showHist ? C.green : C.t4 }}>{showHist ? 'PÅ' : 'AV'}</span></button>
          <button onClick={() => { setShowGrot(g => !g); if (showGrot) setSelectedGrotId(null); }} style={{
            padding: '10px 14px', background: showGrot ? C.yd : 'transparent',
            color: showGrot ? C.yellow : C.t2, border: 'none', borderRadius: 8, fontSize: 12,
            fontWeight: showGrot ? 600 : 400, cursor: 'pointer', fontFamily: ff, textAlign: 'left',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>GROT <span style={{ fontSize: 10, color: showGrot ? C.yellow : C.t4 }}>{showGrot ? 'PÅ' : 'AV'}</span></button>
        </div>

        {/* Maskin */}
        {maskiner.length > 0 && (<>
          <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: C.t3, marginBottom: 8, fontFamily: ff }}>Maskin</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <button onClick={() => { setMaskinFilter(null); setSelectedId(null); }} style={{
              padding: '10px 14px', background: !maskinFilter ? 'rgba(255,255,255,0.08)' : 'transparent',
              color: !maskinFilter ? C.t1 : C.t2, border: 'none', borderRadius: 8, fontSize: 12,
              fontWeight: !maskinFilter ? 600 : 400, cursor: 'pointer', fontFamily: ff, textAlign: 'left',
            }}>Alla maskiner</button>
            {(['skördare', 'skotare'] as const).map(typ => {
              const group = maskiner.filter(m => getMaskinTyp(m.typ) === typ);
              if (!group.length) return null;
              const tc = typ === 'skördare' ? C.yellow : C.green;
              return (
                <div key={typ}>
                  <div style={{
                    padding: '8px 14px 4px', fontSize: 9, fontWeight: 600, color: C.t4,
                    textTransform: 'uppercase', letterSpacing: '0.06em', fontFamily: ff,
                  }}>{typ}</div>
                  {group.map(m => {
                    const on = maskinFilter === m.maskin_id;
                    return (
                      <button key={m.maskin_id} onClick={() => { setMaskinFilter(m.maskin_id); setSelectedId(null); }}
                        style={{
                          width: '100%', padding: '8px 14px', background: on ? 'rgba(255,255,255,0.08)' : 'transparent',
                          color: on ? C.t1 : C.t2, border: 'none', fontSize: 12, fontWeight: on ? 600 : 400,
                          cursor: 'pointer', fontFamily: ff, textAlign: 'left',
                          display: 'flex', alignItems: 'center', gap: 8, borderRadius: 8,
                        }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: tc, flexShrink: 0 }} />
                        {getMaskinDisplayName(m)}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </>)}
      </div>

      {/* Legend + total distance */}
      <div style={{
        position: 'absolute',
        ...((selectedObj || selectedGrotObj) ? { top: 70 } : { bottom: 16 }),
        left: 16, display: 'flex', gap: 10, background: 'rgba(0,0,0,.65)',
        backdropFilter: 'blur(12px)', padding: '6px 12px', borderRadius: 8, zIndex: 10,
        alignItems: 'center',
      }}>
        {Object.entries(ST).filter(([k]) => ['planerad', 'pagaende', 'klar'].includes(k)).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: v.c, opacity: 0.7 }} />
            <span style={{ fontSize: 9, color: C.t3 }}>{v.l}</span>
          </div>
        ))}
        {showGrot && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, background: C.yellow, transform: 'rotate(45deg)', borderRadius: 1 }} />
            <span style={{ fontSize: 9, color: C.t3 }}>GROT</span>
          </div>
        )}
        {totalDistance.total > 0 && (
          <>
            <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)' }} />
            <span style={{ fontSize: 9, color: C.t2, fontWeight: 600, fontFamily: ff }}>
              Total rutt: {totalDistance.anyApprox ? '~' : ''}{totalDistance.total < 1 ? `${Math.round(totalDistance.total * 1000)} m` : `${totalDistance.total.toFixed(1)} km`}
            </span>
          </>
        )}
      </div>

      {selectedObj && <ObjCard obj={selectedObj} />}
      {selectedGrotObj && <GrotCard obj={selectedGrotObj} />}
    </div>
  );
}
