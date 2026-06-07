'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { motion } from 'framer-motion';
import { OversiktObjekt, Maskin, MaskinKoItem, C, ST, T, BTN, SP, STATUS_AVSLUTADE, STATUS_AKTIV } from './oversikt-types';
import { ff } from './oversikt-styles';
import { formatVolym, pc, getMaskinDisplayName, getMaskinTyp, grotDeadlineDays } from './oversikt-utils';
import { buildForarkartaStyle, FORARKARTA_ATTRIBUTION } from './forarkarta-stil';

/* ── Animated count-up hook ── */
function useCountUp(target: number, duration = 1.2, active = true): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!active || target <= 0) { setVal(target); return; }
    setVal(0);
    const start = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const t = Math.min((now - start) / (duration * 1000), 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return val;
}

/* ── AnimatedNumber component ── */
function AnimatedNumber({ value, style }: { value: number; style?: React.CSSProperties }) {
  const display = useCountUp(value);
  return <span style={style}>{formatVolym(display)}</span>;
}

/* Använd den DELADE klienten (lib/supabase.ts = @supabase/ssr createBrowserClient).
   En egen createClient() från @supabase/supabase-js lagrar sessionen i localStorage,
   men login lagrar den i cookies via @supabase/ssr → getUser() blir null här och
   förarläget faller tyst till admin. Samma klient som login = sessionen syns. */

declare global {
  interface Window { maplibregl: any; }
}

interface ProdAgg { skordareVol: number; skotareVol: number; }

interface Props {
  objekt: OversiktObjekt[];
  maskiner: Maskin[];
  maskinKo: MaskinKoItem[];
  prodMap: Record<string, ProdAgg>;
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
interface SegmentDist { km: number; approx: boolean; geometry?: [number, number][]; }
function segKey(lng1: number, lat1: number, lng2: number, lat2: number): string {
  return `${lng1},${lat1};${lng2},${lat2}`;
}

/* ── Small reusable components ── */
function Tag({ children, w }: { children: React.ReactNode; w?: boolean }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, color: w ? C.yellow : 'rgba(255,255,255,0.7)',
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
      <div style={{ fontSize: 13, color: C.t4, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: warn ? C.yellow : C.t2 }}>{val}</div>
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

/* ── Staggered species bar segment ── */
function SpeciesSegment({ pct, color, delay }: { pct: number; color: string; delay: number }) {
  return (
    <motion.div
      initial={{ width: 0 }}
      animate={{ width: `${pct}%` }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      style={{
        minWidth: 3, height: '100%',
        background: color,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.2)',
      }}
    />
  );
}

/* Humanisera restriktionsnamn — strippa rå kod i slutet, t.ex.
   "Vägmärke (L1955:7217)" → "Vägmärke". Parenteser utan siffror (riktiga ord)
   behålls. Blir resultatet tomt (namnet var bara en kod) → behåll originalet. */
function cleanRestrName(name: string): string {
  const cleaned = name.replace(/\s*\([^)]*\d[^)]*\)\s*$/, '').trim();
  return cleaned || name;
}

/* ── OSRM körväg-avstånd FRÅN enhetens GPS → label. Ingen GPS-behörighet eller
   OSRM-miss → "–" (aldrig fågelväg). Delas av ObjCard + GrotCard. ── */
function useRoadKm(devicePos: { lat: number; lng: number } | null | undefined, lat: number | null, lng: number | null): string {
  const [roadKm, setRoadKm] = useState<number | null>(null);
  const [roadLoading, setRoadLoading] = useState(false);
  useEffect(() => {
    if (!devicePos || lat == null || lng == null) { setRoadKm(null); setRoadLoading(false); return; }
    let cancelled = false;
    setRoadLoading(true);
    (async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/driving/${devicePos.lng},${devicePos.lat};${lng},${lat}?overview=false`;
        const res = await fetch(url);
        const json = await res.json();
        const meters = json?.routes?.[0]?.distance;
        if (!cancelled) setRoadKm(typeof meters === 'number' ? meters / 1000 : null);
      } catch {
        if (!cancelled) setRoadKm(null);
      } finally {
        if (!cancelled) setRoadLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [devicePos, lat, lng]);
  return !devicePos ? '–' : roadLoading ? '…' : roadKm == null ? '–' : roadKm < 1 ? `${Math.round(roadKm * 1000)} m` : `${roadKm.toFixed(1)} km`;
}

/* ── GROT-deadline-bevakning ──
   Färg/etikett styrs av DEADLINE, inte grot_status (opålitlig: bara
   'ej_aktuellt'/'skotat' finns). Trösklarna är lätt justerbara här. */
const GROT_BROWN = '#8d6e63';   // lugn brun — ingen/avlägsen deadline
const GROT_ORANGE_DAGAR = 30;   // ≤ så här många dgr kvar → orange (närmar sig)
const GROT_ROD_DAGAR = 7;       // ≤ så här många dgr kvar (eller passerad) → röd
function grotDeadlineInfo(deadline: string | null): { color: string; label: string; days: number | null } {
  const days = grotDeadlineDays(deadline);
  if (days === null) return { color: GROT_BROWN, label: '', days: null };
  if (days < 0) return { color: C.red, label: 'Försenad', days };
  if (days <= GROT_ROD_DAGAR) return { color: C.red, label: days === 0 ? 'Idag' : `${days} dgr`, days };
  if (days <= GROT_ORANGE_DAGAR) return { color: C.orange, label: days <= 14 ? `${days} dgr` : `${Math.ceil(days / 7)} v`, days };
  return { color: GROT_BROWN, label: '', days };   // avlägsen deadline → lugn tills den närmar sig
}

/* ── ObjCard popup (positioned fixed at screen bottom) ──
   EN konsekvent mall för ALLA objekt — fast sektionsordning:
   1 Titel+status · 2 typ·areal·volym · 3 Avstånd+Köplats · 4 Fara (enda röda) ·
   5 Markägare+Ring/Sms · 6 Navigera hit · 7 Visa mer (Hänsyn·Restriktioner·Trädslag·Logistik).
   Saknas data i en sektion: utelämna tyst eller visa "–", aldrig egen layout per objekt. */
function ObjCard({ obj, warnings, koPlats, devicePos }: {
  obj: OversiktObjekt;
  warnings?: ObjWarnings;
  koPlats?: { pos: number; total: number };
  devicePos?: { lat: number; lng: number } | null;
}) {
  const o = obj;
  const [expanded, setExpanded] = useState(false);

  const st = ST[o.status] || ST.oplanerad;
  const typLabel = o.atgard || (o.typ === 'gallring' ? 'Gallring' : 'Slutavverkning');
  // 5. Markägare (Beslut 3): markagare + Ring (markagare_tel) + Sms-mall
  const markNamn = o.markagare || o.kontakt_namn || null;
  const markTel = o.markagare_tel || o.kontakt_telefon || null;
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  const smsBody = encodeURIComponent(`Vi är på gång till ${o.namn}`);
  const smsHref = markTel ? `sms:${markTel}${isIOS ? '&' : '?'}body=${smsBody}` : null;
  const ber = o.trakt_data?.beraknad;

  // 3. Avstånd — OSRM körväg från enhetens GPS (delad hook). Ingen GPS/OSRM → "–".
  const avstandLabel = useRoadKm(devicePos, o.lat, o.lng);

  // GROT-objekt = samma fulla kort + grot-deadline överst (i grot-färg).
  const grotRel = o.grot === true || o.grot_deadline != null || o.grot_volym != null;
  const grotInfo = grotDeadlineInfo(o.grot_deadline);
  const grotDeadlineDate = o.grot_deadline ? new Date(o.grot_deadline + 'T00:00:00').toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
  const gd = grotInfo.days;
  const grotDagText = gd == null ? '' : gd < 0 ? `försenad ${Math.abs(gd)} ${Math.abs(gd) === 1 ? 'dag' : 'dagar'}` : gd === 0 ? 'idag' : `om ${gd} ${gd === 1 ? 'dag' : 'dagar'}`;

  // 7. Visa mer — Markeringar (alla) · Restriktioner · Trädslag · Logistik
  const markFara = warnings ? Array.from(new Set(warnings.items.filter(i => i.level === 'fara').map(i => i.label))) : [];
  const markHansyn = warnings ? Array.from(new Set(warnings.items.filter(i => i.level === 'hansyn').map(i => i.label))) : [];
  const markOvrigt = warnings ? Array.from(new Set(warnings.items.filter(i => i.level === 'ovrigt').map(i => i.label))) : [];
  const hasMarks = markFara.length > 0 || markHansyn.length > 0 || markOvrigt.length > 0;
  const restrLabels = ber?.restriktioner?.length ? [...new Set(ber.restriktioner.map(r => cleanRestrName(r.name)))] : [];
  const tradslag = (ber?.tradslag || []).filter(ts => !ts.namn.toLowerCase().includes('okänt') && ts.andel > 0).slice(0, 6);
  const tsTotal = tradslag.reduce((s, ts) => s + ts.andel, 0);
  const hasLogistik = !!(o.barighet || o.terrang);
  const hasDetails = hasMarks || restrLabels.length > 0 || tradslag.length > 0 || hasLogistik;

  const statBox: React.CSSProperties = { flex: 1, background: C.surface, borderRadius: SP.md, padding: SP.md, textAlign: 'center', border: `1px solid ${C.border}` };
  const chip: React.CSSProperties = { ...T.caption, color: C.t1, padding: `${SP.sm}px ${SP.md}px`, borderRadius: SP.sm };
  const TRADSLAG_FARG: Record<string, string> = { 'Gran': '#66BB6A', 'Tall': '#FFA726', 'Björk': '#FFF176', 'Ek': '#A1887F', 'Bok': '#BCAAA4', 'Contorta': '#FF8A65' };
  const Sec = ({ label }: { label: string }) => (
    <div style={{ ...T.label, marginBottom: SP.sm }}>{label}</div>
  );

  return (
    <motion.div
      onClick={(e) => e.stopPropagation()}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      style={{
        position: 'absolute', bottom: 16, left: '50%', x: '-50%',
        width: 380, maxWidth: 'calc(100% - 24px)',
        background: C.surface3,
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 12, overflow: 'hidden',
        border: `1px solid ${C.border}`,
        boxShadow: C.shadowMd, zIndex: 20,
      }}
    >
      <div style={{ padding: SP.xl, maxHeight: '54vh', overflowY: 'auto' }}>

        {/* Sammanfattning — alltid synlig */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: SP.md, marginBottom: SP.lg }}>
          <div style={{ flex: 1 }}>
            <div style={T.h1}>{o.namn}</div>
            <div style={{ ...T.caption, marginTop: SP.xs }}>
              {typLabel}
              {o.areal ? ` · ${o.areal} ha` : ''}
              {o.volym ? ` · ${formatVolym(o.volym)} m³` : ''}
            </div>
          </div>
          <div style={{
            padding: `${SP.xs}px ${SP.sm}px`, borderRadius: SP.sm,
            background: st.bg, ...T.caption, fontWeight: 600, color: st.c,
          }}>{st.l}</div>
        </div>

        {/* GROT — deadline/anteckning högst upp, i grot-färg (samma fulla kort) */}
        {grotRel && (
          <div style={{ marginBottom: SP.lg, padding: SP.md, borderRadius: SP.sm, background: `${grotInfo.color}1f`, border: `1px solid ${grotInfo.color}55` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: SP.sm }}>
              <div style={{ width: 11, height: 11, background: grotInfo.color, transform: 'rotate(45deg)', borderRadius: 2, flexShrink: 0, border: '1.5px solid rgba(255,255,255,0.85)' }} />
              <span style={{ ...T.label, color: grotInfo.color }}>GROT</span>
            </div>
            {grotDeadlineDate && (
              <div style={{ ...T.caption, color: grotInfo.color, fontWeight: 700, marginTop: SP.xs }}>
                Ömtålig: klar senast {grotDeadlineDate} — {grotDagText}
              </div>
            )}
            {o.grot_anteckning && <div style={{ ...T.caption, color: C.t1, fontWeight: 400, marginTop: SP.xs, lineHeight: 1.4 }}>{o.grot_anteckning}</div>}
            <div style={{ ...T.caption, color: C.t2, marginTop: SP.xs }}>Mängd: {o.grot_volym != null ? `${formatVolym(o.grot_volym)} m³` : '– ej mätt än'}</div>
          </div>
        )}

        {/* 3. Avstånd + Köplats — alltid synlig; "–" när data saknas */}
        <div style={{ display: 'flex', gap: SP.md, marginBottom: SP.lg }}>
          <div style={statBox}>
            <div style={{ ...T.h2, fontSize: 20 }}>{avstandLabel}</div>
            <div style={{ ...T.caption, marginTop: SP.xs }}>Avstånd</div>
          </div>
          <div style={statBox}>
            <div style={{ ...T.h2, fontSize: 20 }}>{koPlats ? `${koPlats.pos} av ${koPlats.total}` : '–'}</div>
            <div style={{ ...T.caption, marginTop: SP.xs }}>Köplats</div>
          </div>
        </div>

        {/* 4. Fara (Beslut 6) — enda röda elementet, bara verklig fara (powerline/warning).
           Visar ALLA faror staplade direkt — aldrig gömt bakom en knapp. Rad 1 =
           farans namn, rad 2 = planerarens beskrivning (data.comment) om den finns. */}
        {warnings && warnings.items.some(i => i.level === 'fara') && (() => {
          const seen = new Set<string>();
          const faror = warnings.items.filter(i => i.level === 'fara').filter(f => {
            const k = `${f.label}|${f.comment || ''}`;        // dedupe på namn+beskrivning
            if (seen.has(k)) return false;
            seen.add(k); return true;
          });
          return (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: SP.sm, marginBottom: SP.lg,
              padding: `${SP.sm}px ${SP.md}px`, borderRadius: SP.sm, background: C.rd,
              border: `1px solid ${C.red}40`,
            }}>
              <span style={{ width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderBottom: `12px solid ${C.red}`, flexShrink: 0, marginTop: 3 }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: SP.sm, minWidth: 0 }}>
                {faror.map((f, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
                    <span style={{ ...T.caption, color: C.t1, fontWeight: 600 }}>{f.label}</span>
                    {f.comment && <span style={{ ...T.caption, color: C.t1, fontWeight: 400, lineHeight: 1.4 }}>{f.comment}</span>}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* 5. Markägare + Ring/Sms (Beslut 3) — alltid; namn eller "–", knappar om nummer finns */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: SP.md, marginBottom: SP.lg }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ ...T.caption, color: C.t3 }}>Markägare</div>
            <div style={{ ...T.body, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{markNamn || '–'}</div>
          </div>
          {markTel && (
            <div style={{ display: 'flex', gap: SP.sm, flexShrink: 0 }}>
              <a href={`tel:${markTel}`} onClick={(e) => e.stopPropagation()}
                style={{ ...BTN.secondary, minHeight: 36, padding: '0 14px', color: C.blue, textDecoration: 'none' }}>Ring</a>
              {smsHref && (
                <a href={smsHref} onClick={(e) => e.stopPropagation()}
                  style={{ ...BTN.secondary, minHeight: 36, padding: '0 14px', color: C.blue, textDecoration: 'none' }}>Sms</a>
              )}
            </div>
          )}
        </div>

        {/* 6. Navigera hit — primär åtgärd, alltid när koordinater finns */}
        {o.lat != null && o.lng != null && (
          <button onClick={() => {
            const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const url = ios
              ? `maps://maps.apple.com/?daddr=${o.lat},${o.lng}`
              : `https://www.google.com/maps/dir/?api=1&destination=${o.lat},${o.lng}`;
            window.open(url, '_blank');
          }} style={{ ...BTN.primary, width: '100%', fontFamily: ff }}>
            Navigera hit
          </button>
        )}

        {/* 7. Visa mer → Hänsyn · Restriktioner · Trädslag · Logistik (fast ordning) */}
        {hasDetails && (
          <>
            <button onClick={() => setExpanded(!expanded)}
              style={{ ...BTN.secondary, width: '100%', marginTop: SP.sm, fontFamily: ff }}>
              {expanded ? 'Visa mindre' : 'Visa mer'}
            </button>
            {expanded && (
              <div style={{ marginTop: SP.md }}>

                {/* Markeringar på trakten — KOMPLETT lista, grupperad på färg:
                   Faror (röd) · Hänsyn (orange) · Övrigt (grå). Inget filtreras bort.
                   Kartan förblir lugn — detta visas BARA här i kortet. */}
                {hasMarks && (
                  <div style={{ padding: `${SP.md}px 0` }}>
                    <Sec label="Markeringar på trakten" />
                    {markFara.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.sm, marginBottom: SP.sm }}>
                        {markFara.map((lbl, i) => <span key={`f${i}`} style={{ ...chip, background: C.rd, border: `1px solid ${C.red}40` }}>{lbl}</span>)}
                      </div>
                    )}
                    {markHansyn.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.sm, marginBottom: SP.sm }}>
                        {markHansyn.map((lbl, i) => <span key={`h${i}`} style={{ ...chip, background: C.od, border: `1px solid ${C.orange}40` }}>{lbl}</span>)}
                      </div>
                    )}
                    {markOvrigt.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.sm }}>
                        {markOvrigt.map((lbl, i) => <span key={`o${i}`} style={{ ...chip, background: C.surface, border: `1px solid ${C.border}` }}>{lbl}</span>)}
                      </div>
                    )}
                  </div>
                )}

                {/* Restriktioner — neutrala/grå chips (INTE röda), humaniserade namn */}
                {restrLabels.length > 0 && (
                  <div style={{ padding: `${SP.md}px 0` }}>
                    <Sec label="Restriktioner" />
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: SP.sm }}>
                      {restrLabels.map((lbl, i) => (
                        <span key={i} style={{ ...chip, background: C.surface, border: `1px solid ${C.border}` }}>{lbl}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Trädslag — stapel + % */}
                {tradslag.length > 0 && (
                  <div style={{ padding: `${SP.md}px 0` }}>
                    <Sec label="Trädslag" />
                    <div style={{ display: 'flex', height: 14, borderRadius: 7, overflow: 'hidden', marginBottom: SP.sm }}>
                      {tradslag.map((ts, i) => (
                        <div key={i} style={{ width: `${(ts.andel / tsTotal) * 100}%`, minWidth: 3, height: '100%', background: TRADSLAG_FARG[ts.namn] || '#9E9E9E' }} />
                      ))}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${SP.xs}px ${SP.lg}px` }}>
                      {tradslag.map((ts, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: SP.sm }}>
                          <span style={{ width: 8, height: 8, borderRadius: 4, background: TRADSLAG_FARG[ts.namn] || '#9E9E9E', flexShrink: 0 }} />
                          <span style={T.caption}>{ts.namn} {Math.round(ts.andel * 100)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Logistik — Bärighet, Terräng */}
                {hasLogistik && (
                  <div style={{ padding: `${SP.md}px 0` }}>
                    <Sec label="Logistik" />
                    {o.barighet && <div style={T.caption}><span style={{ color: C.t3 }}>Bärighet:</span> <span style={{ color: C.t1 }}>{o.barighet}</span></div>}
                    {o.terrang && <div style={{ ...T.caption, marginTop: SP.xs }}><span style={{ color: C.t3 }}>Terräng:</span> <span style={{ color: C.t1 }}>{o.terrang}</span></div>}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}

/* GrotCard borttagen — grot-objekt öppnar nu SAMMA ObjCard (med grot-header). */

/* ── Förar-sheet (Beslut 1): Nu störst + dragbart för Härnäst-listan ──
   Read-only. Källa: maskin_ko sorterad på ordning. Tryck → öppnar ObjCard. */
function DriverSheet({ queue, maskinNamn, prodMap, warningsByObj, onSelect }: {
  queue: OversiktObjekt[];
  maskinNamn: string | null;
  prodMap: Record<string, ProdAgg>;
  warningsByObj: Record<string, ObjWarnings>;
  onSelect: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!queue.length) return null;

  const aktivaKvar = queue.filter(o => !STATUS_AVSLUTADE.includes(o.status));
  const nu = aktivaKvar.find(o => STATUS_AKTIV.includes(o.status)) || aktivaKvar[0] || queue[0];
  const harnast = aktivaKvar.filter(o => o.id !== nu.id);
  const nuSt = ST[nu.status] || ST.oplanerad;

  const Row = ({ o, idx }: { o: OversiktObjekt; idx: number }) => {
    const st = ST[o.status] || ST.oplanerad;
    const w = warningsByObj[o.id];
    return (
      <button onClick={(e) => { e.stopPropagation(); onSelect(o.id); }} style={{
        display: 'flex', alignItems: 'center', gap: SP.md, width: '100%', textAlign: 'left',
        padding: `${SP.md}px ${SP.xs}px`, background: 'transparent', border: 'none',
        borderTop: `1px solid ${C.border}`, cursor: 'pointer', fontFamily: ff,
      }}>
        <div style={{ width: 24, height: 24, borderRadius: 12, background: st.bg, color: st.c, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{idx}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ ...T.body, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.namn}</div>
          <div style={T.caption}>{o.volym ? `${formatVolym(o.volym)} m³` : '–'}{o.areal ? ` · ${o.areal} ha` : ''}</div>
        </div>
        {w?.level && <span style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: `10px solid ${w.level === 'fara' ? C.red : C.orange}`, flexShrink: 0 }} />}
        <span style={{ ...T.caption, color: st.c, flexShrink: 0 }}>{st.l}</span>
      </button>
    );
  };

  return (
    <motion.div
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={0.2}
      onDragEnd={(_e, info) => { if (info.offset.y < -50) setExpanded(true); else if (info.offset.y > 50) setExpanded(false); }}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute', bottom: 16, left: '50%', x: '-50%',
        width: 420, maxWidth: 'calc(100% - 24px)',
        background: C.surface3, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderRadius: 16, border: `1px solid ${C.border}`, zIndex: 20, overflow: 'hidden',
      }}
    >
      {/* Draghandtag */}
      <div onClick={() => setExpanded(e => !e)} style={{ padding: `${SP.sm}px 0 0`, display: 'flex', justifyContent: 'center', cursor: 'grab' }}>
        <div style={{ width: 36, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.2)' }} />
      </div>

      <div style={{ padding: SP.lg, paddingTop: SP.md }}>
        <div style={{ ...T.label, marginBottom: SP.sm, display: 'flex', justifyContent: 'space-between' }}>
          <span>NU{maskinNamn ? ` · ${maskinNamn}` : ''}</span>
          <span style={{ color: C.t3 }}>{aktivaKvar.length} kvar</span>
        </div>

        {/* Nu — störst */}
        <button onClick={(e) => { e.stopPropagation(); onSelect(nu.id); }} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: ff, padding: 0 }}>
          <div style={{ ...T.h1, fontSize: 24 }}>{nu.namn}</div>
          <div style={{ ...T.caption, marginTop: 2 }}>
            {nu.volym ? `${formatVolym(nu.volym)} m³` : '–'}{nu.areal ? ` · ${nu.areal} ha` : ''}
            {' · '}<span style={{ color: nuSt.c, fontWeight: 600 }}>{nuSt.l}</span>
          </div>
        </button>

        {/* Härnäst */}
        {harnast.length > 0 && !expanded && (
          <div style={{ ...T.caption, color: C.blue, marginTop: SP.md, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setExpanded(true); }}>
            Visa härnäst ({harnast.length})
          </div>
        )}
        {harnast.length > 0 && expanded && (
          <div style={{ marginTop: SP.md, maxHeight: '42vh', overflowY: 'auto' }}>
            <div style={{ ...T.label, marginBottom: SP.xs }}>HÄRNÄST</div>
            {harnast.map((o, i) => <Row key={o.id} o={o} idx={i + 1} />)}
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Build GROT diamond marker — egen brun/orange/röd symbol, DEADLINE-styrd ──
   Brun = ingen/avlägsen deadline · orange = närmar sig · röd = nära/passerad. */
function buildGrotMarkerEl(obj: OversiktObjekt, isSelected: boolean, onClick: () => void): HTMLDivElement {
  const info = grotDeadlineInfo(obj.grot_deadline);
  const clr = info.color;
  const sz = isSelected ? 18 : 14;
  const hitSize = 28;
  const w = document.createElement('div');
  w.className = 'ovk-grot-marker';
  w.style.cssText = `width:${hitSize}px;height:${hitSize}px;cursor:pointer;overflow:visible;opacity:${isSelected ? '1' : '0.92'}`;

  // Diamant (roterad fyrkant) — egen GROT-symbol, skild från status-markörerna.
  const diamond = document.createElement('div');
  diamond.style.cssText = `position:absolute;left:50%;top:50%;width:${sz}px;height:${sz}px;transform:translate(-50%,-50%) rotate(45deg);background:${clr};border:1.5px solid rgba(255,255,255,0.85);border-radius:2px;box-shadow:${isSelected ? `0 0 12px ${clr}80` : '0 1px 4px rgba(0,0,0,.4)'}`;
  w.appendChild(diamond);

  // Brådske-etikett ovanför (bara orange/röd): 'X dgr' / 'X v' / 'Försenad'.
  if (info.label) {
    const badge = document.createElement('div');
    badge.style.cssText = `position:absolute;bottom:${hitSize / 2 + sz / 2 + 3}px;left:50%;transform:translateX(-50%);pointer-events:none;white-space:nowrap;background:${clr};padding:2px 7px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.5)`;
    badge.innerHTML = `<span style="font-size:11px;font-weight:800;color:#fff;font-family:${ff}">${info.label}</span>`;
    w.appendChild(badge);
  }

  // Namn-etikett under.
  const lbl = document.createElement('div');
  lbl.className = 'ovk-lbl';
  lbl.style.cssText = `position:absolute;top:${hitSize / 2 + sz / 2 + 4}px;left:50%;transform:translateX(-50%);pointer-events:none;white-space:nowrap`;
  lbl.innerHTML = `<div style="font-size:11px;font-weight:600;color:#fff;font-family:${ff};background:rgba(0,0,0,0.75);padding:2px 6px;border-radius:4px">${obj.namn}</div>`;
  w.appendChild(lbl);

  w.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return w;
}

/* ── Route colors per machine ── */
const RC = ['#3b82f6', '#f97316', '#22c55e', '#a855f7', '#ec4899', '#06b6d4'];

/* ── Faror & hänsyn (Beslut 6) — klassning av planering_markeringar ──
   Semantiken ligger i data: type/zoneType/lineType/arrowType (se brief). */
const FARA_SUBTYPER = new Set(['powerline', 'warning']);
const HANSYN_SUBTYPER = new Set([
  'eternitytree', 'naturecorner', 'protected', 'fornlamning',
  'culture', 'culturemonument', 'highstump',
]);
const SUB_LABEL: Record<string, string> = {
  // Faror
  powerline: 'Kraftledning', warning: 'Varning',
  // Hänsyn
  eternitytree: 'Eternitträd', naturecorner: 'Naturhörn', protected: 'Skyddat område',
  fornlamning: 'Fornlämning', culture: 'Kulturmiljö', culturemonument: 'Kulturminne',
  highstump: 'Högstubbe',
  // Övrigt — punkter
  manualfelling: 'Manuell fällning', steep: 'Brant', culturestump: 'Kulturstubbe',
  bridge: 'Bro', landing: 'Avlägg', corduroy: 'Kavelbro', ditch: 'Dike',
  windfall: 'Vindfälle', brashpile: 'Rishög', road: 'Väg', trail: 'Stig',
  // Övrigt — zoner
  wet: 'Blöt mark', noentry: 'Kör ej',
  // Övrigt — linjer
  boundary: 'Traktgräns', mainRoad: 'Basväg', nature: 'Naturvärde', stickvag: 'Stickväg',
  backRoadRed: 'Basväg', backRoadYellow: 'Basväg', backRoadBlue: 'Basväg',
  sideRoadRed: 'Stickväg', sideRoadYellow: 'Stickväg', sideRoadBlue: 'Stickväg',
  // Övrigt — pilar
  fellingdirection: 'Fällriktning', drivedirection: 'Körriktning',
};
/* Sista utväg när vi saknar en svensk etikett — så inget filtreras bort tyst. */
function prettifySub(sub: string): string {
  const s = sub.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export type FaraNiva = 'fara' | 'hansyn';               // markör/banner-nivå
export type MarkLevel = 'fara' | 'hansyn' | 'ovrigt';   // alla markeringar i kortlistan
export interface ObjWarnings { level: FaraNiva | null; items: { label: string; level: MarkLevel; comment?: string }[]; }
interface MarkeringRow { objekt_id: string | null; typ: string | null; data: any; }

/* Inloggad medarbetare — roll (forare/admin/planerare) + maskinkoppling.
   Kedjan: auth-user → medarbetare via user_id → maskin_id → maskin_ko → objekt.
   Bekräftat i Supabase: user_id = uuid (mot auth-user), maskin_id = text som matchar
   maskin_ko.maskin_id direkt (t.ex. A030353) — inget uuid/text-gissande. */
interface Medarbetare { id: string; namn: string | null; roll: string | null; maskin_id: string | null; }

/* Sentinel-filter för förare utan giltig maskin: matchar ALDRIG ett maskin_ko-id,
   så kartan blir tom istället för att falla tillbaka på "visa alla" (fail-closed). */
const FORARE_UTAN_MASKIN = '__forare_utan_maskin__';

function markeringSub(data: any): string | null {
  if (!data || typeof data !== 'object') return null;
  return data.type || data.zoneType || data.lineType || data.arrowType || null;
}
function classifyMarkering(data: any): MarkLevel {
  const sub = markeringSub(data);
  if (sub && FARA_SUBTYPER.has(sub)) return 'fara';
  if (sub && HANSYN_SUBTYPER.has(sub)) return 'hansyn';
  return 'ovrigt';   // visa allt — inget filtreras bort tyst
}

/* ── Marker badges (Beslut 2): köordning, GROT-hörn, fara/hänsyn ── */
type MarkerBadge =
  | { kind: 'queue'; n: number }
  | { kind: 'warning'; level: FaraNiva };

interface MarkerOpts {
  isSelected: boolean;
  label: string;
  volym?: number | null;
  sublabels?: string[];   // visas ovanför markören (maskinnamn/chips)
  onClick: () => void;
}

/* ── Markörfärg = BARA status (en färg, en betydelse) ──
   grå = oplanerad/avslutat · blå = planerad · grön = pågående.
   Typ bärs av FORM (cirkel = gallring, rundad fyrkant = slutavverkning),
   aldrig av färg. Rött finns bara som faro-badge. */
const MARKER_GRAY = '#8e8e93';
function markerStatusColor(status: string): string {
  if (STATUS_AKTIV.includes(status)) return C.green;                 // pågående (+ skördning/skotning)
  if (status === 'planerad' || status === 'importerad') return C.blue;
  return MARKER_GRAY;                                                 // oplanerad / avslutat / okänd
}

/* ── Build a MapLibre marker DOM element — form=objekt/maskin, shape=typ ──
   Färg = status (markerStatusColor) och FYLLER markören. Endast aktiva pulserar.
   Okänd/oplanerad → ofylld kontur (filtreras aldrig bort, Beslut 5). */
function buildMarkerEl(
  form: 'circle' | 'machine',
  shape: 'circle' | 'square',
  status: string,
  badges: MarkerBadge[],
  opts: MarkerOpts,
): HTMLDivElement {
  const { isSelected, label, volym, sublabels, onClick } = opts;
  const known = status in ST;
  const isActive = STATUS_AKTIV.includes(status);
  const isDone = STATUS_AVSLUTADE.includes(status);
  const isContour = status === 'oplanerad' || !known;
  const sc = markerStatusColor(status); // markörfärg = BARA status (grå/blå/grön)

  const dotSize = isSelected ? 36 : form === 'machine' ? 34 : isActive ? 32 : isDone ? 20 : 28;
  const hitSize = 40; // konstant så MapLibre-ankaret aldrig hoppar
  // Form = typ: rundad fyrkant = slutavverkning, cirkel = gallring.
  const radiusFor = (sz: number) => (shape === 'square' ? `${Math.max(4, Math.round(sz * 0.28))}px` : '50%');

  const w = document.createElement('div');
  w.className = 'ovk-marker';
  w.dataset.objektId = label;
  w.style.cssText = `width:${hitSize}px;height:${hitSize}px;cursor:pointer;overflow:visible;opacity:${isDone ? '0.55' : '1'}`;

  // Puls — ENDAST aktiva objekt. Ringen följer markörformen.
  if (isActive && form === 'circle') {
    const ring = document.createElement('div');
    ring.style.cssText = `position:absolute;left:50%;top:50%;width:${dotSize}px;height:${dotSize}px;margin-left:-${dotSize / 2}px;margin-top:-${dotSize / 2}px;border-radius:${radiusFor(dotSize)};border:2px solid ${sc};animation:pulseRing 2.5s cubic-bezier(0.4,0,0.2,1) infinite;pointer-events:none`;
    w.appendChild(ring);
    const glow = document.createElement('div');
    glow.style.cssText = `position:absolute;left:50%;top:50%;width:${dotSize + 10}px;height:${dotSize + 10}px;margin-left:-${(dotSize + 10) / 2}px;margin-top:-${(dotSize + 10) / 2}px;border-radius:50%;background:radial-gradient(circle,${sc}30 0%,transparent 70%);pointer-events:none;animation:glowPulse 3s ease-in-out infinite`;
    w.appendChild(glow);
  }

  const dot = document.createElement('div');
  if (form === 'machine') {
    // Maskinposition: vit rundad fyrkant med kugghjul + puls
    const pulse = document.createElement('div');
    pulse.style.cssText = `position:absolute;left:50%;top:50%;width:${dotSize + 12}px;height:${dotSize + 12}px;margin-left:-${(dotSize + 12) / 2}px;margin-top:-${(dotSize + 12) / 2}px;border-radius:11px;border:2px solid rgba(255,255,255,0.5);animation:pulseRing 2.5s cubic-bezier(0.4,0,0.2,1) infinite;pointer-events:none`;
    w.appendChild(pulse);
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:10px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 12px rgba(255,255,255,0.25),0 2px 8px rgba(0,0,0,.4)`;
    dot.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;
  } else if (isDone) {
    // Avslutat: nedtonad GRÅ markör (ej svart) med bock — i status-skalan.
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:${radiusFor(dotSize)};background:${sc};border:1.5px solid rgba(255,255,255,0.5);display:flex;align-items:center;justify-content:center`;
    dot.innerHTML = `<span style="font-size:${Math.round(dotSize * 0.6)}px;color:#fff;line-height:1">✓</span>`;
  } else if (isContour) {
    // Oplanerad/okänd: ofylld grå kontur (renderas alltid, döljs aldrig tyst)
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:${radiusFor(dotSize)};background:transparent;border:2px dashed ${sc};box-shadow:${isSelected ? `0 0 16px ${sc}40` : 'none'}`;
  } else {
    // Planerad (blå) / pågående (grön): FYLLD markör med statusfärg
    dot.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:${dotSize}px;height:${dotSize}px;border-radius:${radiusFor(dotSize)};background:${sc};border:2px solid rgba(255,255,255,0.85);box-shadow:${isSelected ? `0 0 20px ${sc}66` : '0 2px 8px rgba(0,0,0,.5)'}`;
  }
  w.appendChild(dot);

  // Badges
  badges.forEach(b => {
    if (b.kind === 'queue') {
      const q = document.createElement('div');
      q.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(${dotSize / 2 - 6}px,-${dotSize / 2 + 6}px);min-width:16px;height:16px;padding:0 3px;border-radius:8px;background:#fff;color:#000;font-size:11px;font-weight:800;font-family:${ff};display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.5);pointer-events:none`;
      q.textContent = String(b.n);
      w.appendChild(q);
    } else if (b.kind === 'warning') {
      // Litet hörnmärke PÅ markören (uppe vänster) — speglar köbadgen uppe höger.
      // Bara kritisk fara (röd) når hit; hänsyn visas aldrig på kartan.
      const wm = document.createElement('div');
      wm.title = 'Fara';
      wm.style.cssText = `position:absolute;left:50%;top:50%;transform:translate(-${dotSize / 2 + 4}px,-${dotSize / 2 + 4}px);width:15px;height:15px;border-radius:50%;background:${C.red};border:1.5px solid #fff;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,.5);pointer-events:none`;
      wm.innerHTML = `<span style="font-size:11px;font-weight:800;color:#fff;font-family:${ff};line-height:1">!</span>`;
      w.appendChild(wm);
    }
  });

  // Maskinnamn/chips ovanför
  if (sublabels && sublabels.length) {
    const md = document.createElement('div');
    md.style.cssText = `position:absolute;bottom:${hitSize / 2 + dotSize / 2 + 6}px;left:50%;transform:translateX(-50%);display:flex;gap:3px;pointer-events:none;white-space:nowrap`;
    sublabels.forEach(s => {
      const ch = document.createElement('div');
      ch.style.cssText = `background:rgba(0,0,0,.85);padding:3px 8px;border-radius:6px`;
      ch.innerHTML = `<span style="font-size:11px;font-weight:600;color:#fff;font-family:${ff}">${s}</span>`;
      md.appendChild(ch);
    });
    w.appendChild(md);
  }

  // Namn-etikett under (zoom-styrd synlighet via .ovk-lbl)
  const lbl = document.createElement('div');
  lbl.className = isActive ? 'ovk-lbl ovk-lbl-active' : 'ovk-lbl';
  lbl.style.cssText = `position:absolute;top:${hitSize / 2 + dotSize / 2 + 4}px;left:50%;transform:translateX(-50%);text-align:center;pointer-events:none;white-space:nowrap`;
  const clr = isDone ? '#8e8e93' : '#fff';
  const volLabel = volym ? ` (${Math.round(volym)} m³)` : '';
  lbl.innerHTML = `<div style="font-size:13px;font-weight:600;color:${clr};font-family:${ff};background:rgba(0,0,0,0.75);padding:3px 8px;border-radius:6px">${label}${volLabel}</div>`;
  w.appendChild(lbl);

  w.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return w;
}

/* ════════════════════════════════════════════════════════════════ */
export default function OversiktKarta({ objekt: propObjekt, maskiner: propMaskiner, maskinKo: propMaskinKo, prodMap }: Props) {
  // Self-fetch: OversiktKarta äger sin egen data så förarvyn kan berika objekt
  // (kolumner som page.tsx:OBJEKT_SELECT saknar), läsa inloggad medarbetare och
  // köra realtime — utan att röra page.tsx (parallellt spår arbetar där).
  // page.tsx mappar INTE om objekt-raderna, så select('*') ger samma form + extra.
  const [objekt, setObjekt] = useState<OversiktObjekt[]>(propObjekt);
  const [maskiner, setMaskiner] = useState<Maskin[]>(propMaskiner);
  const [maskinKo, setMaskinKo] = useState<MaskinKoItem[]>(propMaskinKo);
  const [markeringar, setMarkeringar] = useState<MarkeringRow[]>([]);
  const [me, setMe] = useState<Medarbetare | null>(null);

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
  const [showDone, setShowDone] = useState(true); // Beslut 5: avslutade syns som default
  const [showGrot, setShowGrot] = useState(false);
  const [maskinFilter, setMaskinFilter] = useState<string | null>(null);
  const [showMaskinDrop, setShowMaskinDrop] = useState(false);
  const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(10);
  const [osrmDist, setOsrmDist] = useState<Record<string, SegmentDist>>({});
  const osrmCacheRef = useRef<Record<string, SegmentDist>>({});

  // Förarens enhet-GPS (watch) → används för "Avstånd" (OSRM-körväg) i ObjCard.
  // Nekad/ej stödd → null → kortet visar "–" (aldrig fågelväg-fallback).
  const [devicePos, setDevicePos] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      p => setDevicePos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setDevicePos(null),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  /* ── Self-fetch: berikade objekt + maskin_ko (live-källor) ── */
  const refetchObjekt = useCallback(async () => {
    const PAGE = 1000;
    const all: any[] = [];
    let from = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await supabase.from('objekt').select('*').order('namn').range(from, from + PAGE - 1);
      if (error || !data || data.length === 0) break;
      all.push(...data);
      if (data.length < PAGE) break;
      from += PAGE;
    }
    if (all.length) setObjekt(all as OversiktObjekt[]);
  }, []);

  const refetchKo = useCallback(async () => {
    const { data } = await supabase.from('maskin_ko').select('*').order('ordning');
    if (data) setMaskinKo(data as MaskinKoItem[]);
  }, []);

  /* ── Mount: inloggad medarbetare (roll/maskin) + berika objekt/kö + markeringar ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const uid = auth?.user?.id;
        if (uid) {
          const { data: m } = await supabase
            .from('medarbetare').select('id, namn, roll, maskin_id')
            .eq('user_id', uid).maybeSingle();
          if (!cancelled && m) setMe(m as Medarbetare);
        }
      } catch { /* ej inloggad (dev) — fortsätt med prop-data */ }

      await refetchObjekt();
      await refetchKo();

      const { data: maskinerData } = await supabase.from('dim_maskin').select('*').order('modell');
      if (!cancelled && maskinerData) setMaskiner(maskinerData as Maskin[]);

      const { data: mk } = await supabase
        .from('planering_markeringar').select('objekt_id, typ, data');
      if (!cancelled && mk) setMarkeringar(mk as MarkeringRow[]);
    })();
    return () => { cancelled = true; };
  }, [refetchObjekt, refetchKo]);

  /* ── Realtime (Beslut 4): omkastad kö / statusbyte syns utan omladdning ── */
  useEffect(() => {
    const ch = supabase
      .channel('oversikt-forarvy')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'maskin_ko' }, () => { refetchKo(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'objekt' }, () => { refetchObjekt(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetchObjekt, refetchKo]);

  /* ── Roll & förarläge ──
     FAIL-CLOSED: rollen (medarbetare.roll) avgör förarläget — ALDRIG om maskin-
     länken råkar matcha. En förare utan giltig maskin ser sin egen (tomma) rutt,
     aldrig admin-läge (= alla objekt = privilegieeskalering + precis den röra
     förarvyn ska ta bort). medarbetare.maskin_id är text och matchar
     maskin_ko.maskin_id direkt (t.ex. A030353) — inget uuid/text-gissande. */
  const isDriver = me?.roll === 'forare';
  const driverMaskinId = me?.maskin_id ?? null;
  const driverMode = isDriver;

  // Förare: lås kartan till egen maskins rutt. Saknas/ogiltig maskin → sentinel-
  // filter som inte matchar något objekt (tom karta), ALDRIG hela kartan.
  useEffect(() => {
    if (!driverMode) return;
    setMaskinFilter(driverMaskinId ?? FORARE_UTAN_MASKIN);
    setShowFilterPanel(false);
  }, [driverMode, driverMaskinId]);

  /* ── Faror & hänsyn per objekt (Beslut 6) ── */
  const warningsByObj = useMemo(() => {
    const map: Record<string, ObjWarnings> = {};
    for (const m of markeringar) {
      if (!m.objekt_id) continue;
      const level = classifyMarkering(m.data);   // fara | hansyn | ovrigt (aldrig bortfiltrerad)
      const subRaw = markeringSub(m.data);
      const label = subRaw ? (SUB_LABEL[subRaw] || prettifySub(subRaw)) : 'Markering';
      // Planerarens beskrivning ligger i data.comment (planering_markeringar).
      const comment = typeof m.data?.comment === 'string' && m.data.comment.trim() ? m.data.comment.trim() : undefined;
      if (!map[m.objekt_id]) map[m.objekt_id] = { level: null, items: [] };
      map[m.objekt_id].items.push({ label, level, comment });
    }
    for (const id in map) {
      const w = map[id];
      const rank = (l: MarkLevel) => (l === 'fara' ? 0 : l === 'hansyn' ? 1 : 2);
      w.items.sort((a, b) => rank(a.level) - rank(b.level));   // fara → hansyn → övrigt
      // Markör/triangel-nivå: bara fara/hansyn räknas som varning (övrigt = ingen).
      w.level = w.items.some(i => i.level === 'fara') ? 'fara' : w.items.some(i => i.level === 'hansyn') ? 'hansyn' : null;
    }
    return map;
  }, [markeringar]);

  /* ── Kö-info per objekt: maskin + plats (lägsta ordning vinner) ── */
  const koByObjekt = useMemo(() => {
    const map: Record<string, { maskinId: string; ordning: number }> = {};
    [...maskinKo].sort((a, b) => a.ordning - b.ordning).forEach(k => {
      if (!map[k.objekt_id]) map[k.objekt_id] = { maskinId: k.maskin_id, ordning: k.ordning };
    });
    return map;
  }, [maskinKo]);

  /* ── Köplats per objekt: "X av Y" i objektets maskinkö (samma maskin koByObjekt valt) ── */
  const koPlatsByObj = useMemo(() => {
    const queues: Record<string, string[]> = {};
    const grouped: Record<string, MaskinKoItem[]> = {};
    for (const k of maskinKo) (grouped[k.maskin_id] ||= []).push(k);
    for (const mid in grouped) {
      queues[mid] = grouped[mid].slice().sort((a, b) => a.ordning - b.ordning).map(k => k.objekt_id);
    }
    const out: Record<string, { pos: number; total: number }> = {};
    for (const objId in koByObjekt) {
      const q = queues[koByObjekt[objId].maskinId] || [];
      const idx = q.indexOf(objId);
      if (idx >= 0) out[objId] = { pos: idx + 1, total: q.length };
    }
    return out;
  }, [maskinKo, koByObjekt]);

  /* ── Förarens kö i ordning (Beslut 1: Nu + Härnäst) ── */
  const driverQueue = useMemo(() => {
    if (!driverMaskinId) return [];
    return maskinKo
      .filter(k => k.maskin_id === driverMaskinId)
      .sort((a, b) => a.ordning - b.ordning)
      .map(k => objekt.find(o => o.id === k.objekt_id))
      .filter((o): o is OversiktObjekt => !!o);
  }, [driverMaskinId, maskinKo, objekt]);

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
    if (!maskinFilter) return [];
    const machineList = queuedMaskiner.filter(x => x.maskin_id === maskinFilter);

    return machineList.map((m) => {
      const koItems = maskinKo
        .filter(k => k.maskin_id === m.maskin_id)
        .sort((a, b) => a.ordning - b.ordning);
      if (!koItems.length) return null;

      const numbered: Record<string, number> = {};
      const lineCoords: [number, number][] = [];
      let firstObjId: string | null = null;
      let num = 1;

      // Find the first object with coordinates — that's the machine position (kugghjul)
      const validObjs: { id: string; lng: number; lat: number; isAct: boolean }[] = [];
      koItems.forEach(k => {
        const o = objekt.find(x => x.id === k.objekt_id);
        if (!o || o.lat == null || o.lng == null) return;
        const isAct = o.status === 'pagaende' || o.status === 'skordning' || o.status === 'skotning';
        validObjs.push({ id: o.id, lng: o.lng, lat: o.lat, isAct });
      });

      validObjs.forEach((vo, idx) => {
        lineCoords.push([vo.lng, vo.lat]);
        if (idx === 0) {
          // First = machine position (kugghjul, no number)
          firstObjId = vo.id;
        } else {
          // Rest = numbered 1, 2, 3...
          numbered[vo.id] = num; num++;
        }
      });

      if (lineCoords.length === 0) return null;
      const color = getMaskinTyp(m.typ) === 'skördare' ? C.yellow : C.orange;
      return { maskinId: m.maskin_id, color, numbered, lineCoords, firstObjId };
    }).filter(Boolean) as { maskinId: string; color: string; numbered: Record<string, number>; lineCoords: [number, number][]; firstObjId: string | null }[];
  }, [queuedMaskiner, maskinKo, objekt, maskinFilter]);

  /* ── Merged queue-number lookup: objId → number (use first machine's number) ── */
  const queueNums = useMemo(() => {
    const nums: Record<string, number> = {};
    routeData.forEach(rd => {
      Object.entries(rd.numbered).forEach(([id, n]) => { if (!(id in nums)) nums[id] = n; });
    });
    return nums;
  }, [routeData]);

  /* ── Machine positions: objId → true if it's the first object in any machine's queue ── */
  const machinePositions = useMemo(() => {
    const pos = new Set<string>();
    routeData.forEach(rd => { if (rd.firstObjId) pos.add(rd.firstObjId); });
    return pos;
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
    // GROT-lagret på → grot är det man tittar på: dölj vanliga statusmarkörer så
    // GROT-diamanterna inte staplas ovanpå dem (endast diamanterna visas då).
    if (showGrot) return [];
    let list = objekt.filter(o => o.lat != null && o.lng != null);

    if (maskinFilter) {
      // Machine filter: show ALL objects in this machine's queue — ignore typ/status filters
      const koForMachine = maskinKo.filter(k => k.maskin_id === maskinFilter);
      const ids = new Set(koForMachine.map(k => k.objekt_id));
      // Debug: find missing objects
      const missing = koForMachine.filter(k => !list.some(o => o.id === k.objekt_id));
      if (missing.length > 0) {
        const allObjIds = new Set(objekt.map(o => o.id));
        missing.forEach(k => {
          const inObjekt = allObjIds.has(k.objekt_id);
          const o = objekt.find(x => x.id === k.objekt_id);
          console.warn(`[Karta] Objekt ${k.objekt_id} saknas på kartan — finns i objekt-tabell: ${inObjekt}, har koordinater: ${o ? `lat=${o.lat} lng=${o.lng}` : 'N/A'}`);
        });
      }
      list = list.filter(o => ids.has(o.id));
    } else {
      // Beslut 5: inget objekt döljs tyst. Visa alla status (oplanerad/okänd = kontur,
      // avslutat = nedtonad + bock). "Avslutade"-toggeln är ett UTTRYCKLIGT filter.
      if (!showDone) list = list.filter(o => !STATUS_AVSLUTADE.includes(o.status));
      if (filt !== 'alla') {
        list = list.filter(o => {
          if (filt === 'slutavverkning') return o.typ === 'slutavverkning' || o.typ === 'slut';
          return o.typ === filt;
        });
      }
    }
    return list.map(o => o.id);
  }, [objekt, filt, maskinFilter, maskinKo, showDone, showGrot]);

  /* ── GROT objects (with coordinates and grot_volym > 0) ── */
  const grotObjekt = useMemo(() => {
    if (!showGrot) return [];
    // GROT-relevant: grot=true ELLER deadline ELLER volym. Göm bara 'skotat'
    // (klart). grot_status är i övrigt opålitlig — bygg inte mer logik på den.
    return objekt.filter(o =>
      o.lat != null && o.lng != null &&
      o.grot_status !== 'skotat' &&
      (o.grot === true || o.grot_deadline != null || o.grot_volym != null)
    );
  }, [objekt, showGrot]);

  const selectedGrotObj = selectedGrotId ? objekt.find(o => o.id === selectedGrotId) : null;

  /* ── Helper: bygg argument till buildMarkerEl (form, status, badges, opts) ── */
  const markerArgs = useCallback((obj: OversiktObjekt): {
    form: 'circle' | 'machine'; shape: 'circle' | 'square'; status: string; badges: MarkerBadge[]; opts: MarkerOpts;
  } => {
    const isMachine = machinePositions.has(obj.id);
    const isActive = STATUS_AKTIV.includes(obj.status);

    const badges: MarkerBadge[] = [];
    const qn = queueNums[obj.id];
    if (qn != null && !isMachine) badges.push({ kind: 'queue', n: qn });
    // Endast kritiska faror (powerline/warning) når kartan — hänsyn/övrigt visas
    // bara i ObjCard (under "Visa mer"), aldrig som märke på markören.
    const w = warningsByObj[obj.id];
    if (w?.items?.some(i => i.level === 'fara')) badges.push({ kind: 'warning', level: 'fara' });

    const sublabels: string[] = [];
    if (maskinFilter && isActive) {
      const m = maskiner.find(x => x.maskin_id === maskinFilter);
      if (m) sublabels.push(getMaskinDisplayName(m));
    }

    return {
      form: isMachine ? 'machine' : 'circle',
      shape: obj.typ === 'gallring' ? 'circle' : 'square',
      status: obj.status,
      badges,
      opts: {
        isSelected: selectedId === obj.id,
        label: obj.namn,
        volym: obj.volym,
        sublabels,
        onClick: () => handleMarkerClick(obj.id),
      },
    };
  }, [machinePositions, queueNums, warningsByObj, maskinFilter, maskiner, selectedId, handleMarkerClick]);

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

    const wc = objekt.filter(o => o.lat != null && o.lng != null);
    const center: [number, number] = wc.length
      ? [wc.reduce((s, o) => s + o.lng!, 0) / wc.length, wc.reduce((s, o) => s + o.lat!, 0) / wc.length]
      : [14.70, 56.40];

    const map = new window.maplibregl.Map({
      container: mapContainerRef.current,
      // Baskarta: egen nedtonad Lantmäteriet-vektorstil (se forarkarta-stil.ts).
      // Tiles via /api/forarkarta (nyckel server-side). Ersätter rå OSM-raster.
      style: buildForarkartaStyle(),
      center, zoom: 10,
      // Platt 2D ovanifrån — ingen tilt, norr upp. 3D/lutning gör det svårare
      // för en förare att läsa avstånd och riktningar.
      maxPitch: 0,
      dragRotate: false,
      // Egen attribution-kontroll nedan (CC-BY: '© Lantmäteriet').
      attributionControl: false,
    });
    mapRef.current = map;
    // Lås till platt, norr-upp: stäng av två-finger-rotation också.
    try { map.touchZoomRotate.disableRotation(); } catch { /* äldre maplibre */ }
    // CC-BY — '© Lantmäteriet' MÅSTE synas på kartan.
    map.addControl(new window.maplibregl.AttributionControl({ customAttribution: FORARKARTA_ATTRIBUTION, compact: true }));

    map.on('zoom', () => setZoomLevel(map.getZoom()));

    map.on('load', () => {
      // Route line layer (GeoJSON — follows map natively)
      map.addSource('routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'routes', type: 'line', source: 'routes',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 4, 'line-opacity': 0.8 },
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

  /* ── Update route lines — use OSRM road geometry when available ── */
  useEffect(() => {
    if (!mapRef.current || !mapStyleLoaded) return;
    const src = mapRef.current.getSource('routes');
    if (!src) return;

    const features: any[] = [];
    routeData.forEach(rd => {
      if (rd.lineCoords.length < 2) return;

      for (let i = 0; i < rd.lineCoords.length - 1; i++) {
        const [lng1, lat1] = rd.lineCoords[i];
        const [lng2, lat2] = rd.lineCoords[i + 1];
        const seg = osrmDist[segKey(lng1, lat1, lng2, lat2)];
        const hasRoadGeom = seg?.geometry && seg.geometry.length > 2;
        const coords = hasRoadGeom ? seg!.geometry! : [rd.lineCoords[i], rd.lineCoords[i + 1]];
        features.push({
          type: 'Feature',
          properties: { color: '#3b82f6' },
          geometry: { type: 'LineString', coordinates: coords },
        });
      }
    });
    try {
      src.setData({ type: 'FeatureCollection', features });
    } catch (err) {
      console.error('[Rutt] setData error:', err);
    }
  }, [routeData, mapStyleLoaded, osrmDist, maskinFilter]);

  /* ── Fetch OSRM road distances + geometry per segment ── */
  useEffect(() => {
    if (!maskinFilter || routeData.length === 0) { setOsrmDist({}); return; }

    let cancelled = false;

    const run = async () => {
      const results: Record<string, SegmentDist> = {};

      for (const rd of routeData) {
        for (let i = 0; i < rd.lineCoords.length - 1; i++) {
          const [lng1, lat1] = rd.lineCoords[i];
          const [lng2, lat2] = rd.lineCoords[i + 1];
          const key = segKey(lng1, lat1, lng2, lat2);

          if (osrmCacheRef.current[key]) {
            results[key] = osrmCacheRef.current[key];
            continue;
          }

          try {
            const url = `https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`;
            console.log(`[OSRM] Fetching: ${url}`);
            const res = await fetch(url);
            const json = await res.json();
            console.log(`[OSRM] Response status=${json.code}, routes=${json.routes?.length}, geometry points=${json.routes?.[0]?.geometry?.coordinates?.length}`);
            if (json.routes?.[0]) {
              const route = json.routes[0];
              const geom = route.geometry?.coordinates as [number, number][] | undefined;
              if (geom && geom.length > 0) {
                console.log(`[OSRM] Got road geometry: ${geom.length} points, ${(route.distance / 1000).toFixed(1)} km`);
                results[key] = { km: route.distance / 1000, approx: false, geometry: geom };
              } else {
                console.warn(`[OSRM] No geometry in response, using fallback`);
                results[key] = { km: route.distance / 1000, approx: false };
              }
            } else {
              throw new Error(`OSRM code: ${json.code}`);
            }
          } catch (err) {
            console.error(`[OSRM] Failed:`, err);
            results[key] = { km: haversineKm(lat1, lng1, lat2, lng2) * 1.4, approx: true };
          }
        }
      }

      if (cancelled) return;
      Object.assign(osrmCacheRef.current, results);
      setOsrmDist({ ...results });
    };

    run();
    return () => { cancelled = true; };
  }, [routeData, maskinFilter]);

  /* ── Fix #3: per-segment-avstånd borttagna — gav kart-brus (många textpiller
     ovanpå varandra vid maskinfiltrering). Linjen + numrerade markörer visar
     ordningen, 'Total rutt'-chipen visar summan. Behåll bara städning av ev.
     kvarvarande etikett-markörer. (Ev. framtida: visa EN delsträcka vid tryck på
     just det benet — men aldrig allt på en gång.) ── */
  useEffect(() => {
    distMarkersRef.current.forEach(m => m.remove());
    distMarkersRef.current = [];
  }, [routeData, mapStyleLoaded, maskinFilter, osrmDist]);

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
        if (!o || o.lat == null || o.lng == null) return;
        const a = markerArgs(o);
        const el = buildMarkerEl(a.form, a.shape, a.status, a.badges, { ...a.opts, isSelected: false });
        const marker = new window.maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([o.lng, o.lat]).addTo(mapRef.current);
        markersMapRef.current.set(id, marker);
      }
    });
  }, [visIds, mapReady, objekt, markerArgs]);

  /* ── Auto-fit bounds when machine filter changes ── */
  useEffect(() => {
    if (!mapRef.current || !mapStyleLoaded || !maskinFilter) return;
    const points = visIds
      .map(id => objekt.find(o => o.id === id))
      .filter((o): o is OversiktObjekt => !!o && o.lat != null && o.lng != null);
    if (points.length === 0) return;
    if (points.length === 1) {
      mapRef.current.flyTo({ center: [points[0].lng!, points[0].lat!], zoom: 13, duration: 600 });
    } else {
      const b = new window.maplibregl.LngLatBounds();
      points.forEach(o => b.extend([o.lng!, o.lat!]));
      mapRef.current.fitBounds(b, { padding: 80, maxZoom: 14, duration: 600 });
    }
  }, [maskinFilter, visIds, objekt, mapStyleLoaded]);

  /* ── Update marker content (selection, badges, status) ── */
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    markersMapRef.current.forEach((marker, id) => {
      const o = objekt.find(x => x.id === id);
      if (!o) return;
      const a = markerArgs(o);
      const newEl = buildMarkerEl(a.form, a.shape, a.status, a.badges, a.opts);
      const el = marker.getElement();
      // Replace children only — preserve MapLibre's transform on the wrapper
      while (el.lastChild) el.removeChild(el.lastChild);
      while (newEl.firstChild) el.appendChild(newEl.firstChild);
      el.style.opacity = STATUS_AVSLUTADE.includes(o.status) ? '0.55' : '1';
    });
  }, [selectedId, objekt, mapReady, markerArgs]);

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

  // Zoom-based label visibility CSS
  const labelCss = zoomLevel < 10
    ? '.ovk-lbl{display:none!important}'
    : zoomLevel <= 12
      ? '.ovk-lbl{display:none!important}.ovk-lbl-active{display:block!important}'
      : '';

  return (
    <div style={{ position: 'absolute', inset: 0 }} onClick={() => { setSelectedId(null); setSelectedGrotId(null); setShowMaskinDrop(false); }}>
      <style>{`
        @keyframes pulseRing{0%{transform:scale(1);opacity:.7}70%{transform:scale(2.8);opacity:0}100%{transform:scale(2.8);opacity:0}}
        @keyframes glowPulse{0%,100%{opacity:.5;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
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

      {/* ── Filter button (top right) — döljs i förarläge (read-only rutt) ── */}
      {!driverMode && (
      <button onClick={e => { e.stopPropagation(); setShowFilterPanel(p => !p); }} style={{
        position: 'absolute', top: 16, right: 16, zIndex: 15,
        width: 44, height: 44, borderRadius: 12,
        background: showFilterPanel ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,.75)',
        backdropFilter: 'blur(16px)', border: `1px solid ${C.border}`,
        color: (filt !== 'alla' || !showDone || showGrot || maskinFilter) ? C.yellow : C.t1,
        fontSize: 18, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
      </button>
      )}

      {/* ── Filter panel (slides in from right) — döljs i förarläge ── */}
      {!driverMode && (
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 280, zIndex: 14,
        background: 'rgba(7,7,8,0.95)', backdropFilter: 'blur(24px)',
        borderLeft: `1px solid ${C.border}`,
        transform: showFilterPanel ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(.4,0,.2,1)',
        overflow: 'auto', padding: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <span style={{ fontSize: 17, fontWeight: 600, color: C.t1, fontFamily: ff }}>Filter</span>
          <button onClick={() => setShowFilterPanel(false)}
            aria-label="Stäng filter"
            style={{
              background: 'none', border: 'none', color: C.t3, cursor: 'pointer',
              width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        {/* Typ */}
        <div style={{ fontSize: 13, fontWeight: 600, color: C.t3, marginBottom: 8, fontFamily: ff }}>Typ</div>
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
        <div style={{ fontSize: 13, fontWeight: 600, color: C.t3, marginBottom: 8, fontFamily: ff }}>Visa</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 20 }}>
          <button onClick={() => setShowDone(h => !h)} style={{
            padding: '12px 14px', minHeight: 44, background: showDone ? 'rgba(255,255,255,0.08)' : 'transparent',
            color: showDone ? C.t1 : C.t2, border: 'none', borderRadius: 8, fontSize: 17,
            fontWeight: showDone ? 600 : 400, cursor: 'pointer', fontFamily: ff, textAlign: 'left',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>Avslutade <span style={{ fontSize: 13, color: showDone ? C.green : C.t4 }}>{showDone ? 'På' : 'Av'}</span></button>
          <button onClick={() => { setShowGrot(g => !g); if (showGrot) setSelectedGrotId(null); }} style={{
            padding: '12px 14px', minHeight: 44, background: showGrot ? C.yd : 'transparent',
            color: showGrot ? C.yellow : C.t2, border: 'none', borderRadius: 8, fontSize: 17,
            fontWeight: showGrot ? 600 : 400, cursor: 'pointer', fontFamily: ff, textAlign: 'left',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>GROT <span style={{ fontSize: 13, color: showGrot ? C.yellow : C.t4 }}>{showGrot ? 'På' : 'Av'}</span></button>
        </div>

        {/* Maskin */}
        {maskiner.length > 0 && (<>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.t3, marginBottom: 8, fontFamily: ff }}>Maskin</div>
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
                    padding: '8px 14px 4px', fontSize: 13, fontWeight: 600, color: C.t4,
                    fontFamily: ff,
                  }}>{typ === 'skördare' ? 'Skördare' : 'Skotare'}</div>
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
      )}

      {/* Route-distans — legenden borttagen (markörfärgen + form säger statusen själv) */}
      {totalDistance.total > 0 && (
        <div style={{
          position: 'absolute',
          ...((selectedObj || selectedGrotObj) ? { top: 70 } : { bottom: 16 }),
          left: 16, display: 'flex', gap: 10, background: 'rgba(0,0,0,.65)',
          backdropFilter: 'blur(12px)', padding: '8px 14px', borderRadius: 12, zIndex: 10,
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, color: C.t2, fontWeight: 600, fontFamily: ff }}>
            Total rutt: {totalDistance.anyApprox ? '~' : ''}{totalDistance.total < 1 ? `${Math.round(totalDistance.total * 1000)} m` : `${totalDistance.total.toFixed(1)} km`}
          </span>
        </div>
      )}

      {selectedObj && (
        <ObjCard
          obj={selectedObj}
          warnings={warningsByObj[selectedObj.id]}
          koPlats={koPlatsByObj[selectedObj.id]}
          devicePos={devicePos}
        />
      )}
      {selectedGrotObj && <ObjCard obj={selectedGrotObj} warnings={warningsByObj[selectedGrotObj.id]} koPlats={koPlatsByObj[selectedGrotObj.id]} devicePos={devicePos} />}

      {/* Förar-sheet (Beslut 1) — bara i förarläge när inget kort är öppet */}
      {driverMode && !selectedObj && !selectedGrotObj && (
        <DriverSheet
          queue={driverQueue}
          maskinNamn={(() => { const m = maskiner.find(x => x.maskin_id === driverMaskinId); return m ? getMaskinDisplayName(m) : (driverMaskinId ?? null); })()}
          prodMap={prodMap}
          warningsByObj={warningsByObj}
          onSelect={(id) => setSelectedId(id)}
        />
      )}
    </div>
  );
}
