'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { type UppfoljningObjekt } from './lib/transform';
import { useUppfoljningList, urlIdFor } from './hooks/useUppfoljningList';
import { uppfoljningStatus } from '@/lib/uppfoljning/status';
import { uppskattaGrotM3fub, klampaGrotFaktor, GROT_UTTAGSFAKTOR_DEFAULT, GROT_UTTAGSFAKTOR_MIN, GROT_UTTAGSFAKTOR_MAX } from '@/lib/grot';

/* ── Design tokens (V6) ── */
const V6_GREY = '#8e8e93';
const V6_GREY2 = '#636366';
const V6_CARD = '#1c1c1e';
const V6_SEP = 'rgba(255,255,255,0.06)';
const V6_SK = '#a8d582';
const V6_ST = '#f0b24c';
const V6_WARN = '#ff9f0a';
const V6_DONE = '#30d158';
const V6_FF = "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Inter',system-ui,sans-serif";

const bg = '#000';
const text = '#fff';
const muted = V6_GREY;
const ff = V6_FF;

const sv = (n: number) => Math.round(n).toLocaleString('sv-SE');

/* ── Helpers ── */
function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}
const v6Status = (obj: UppfoljningObjekt) =>
  uppfoljningStatus({ ...obj, skordat: obj.volymSkordare, skotat: obj.volymSkotare });

function kvarM3(o: UppfoljningObjekt): number {
  return Math.max(0, o.volymSkordare - o.volymSkotare);
}
function typLabel(o: UppfoljningObjekt): string {
  return o.typ === 'gallring' ? 'Gallring' : 'Slutavverkning';
}
// Liggetid ur sista avverkningsdag; null-datum skrivs ut ärligt, aldrig gissat.
function liggetidText(o: UppfoljningObjekt): React.ReactNode {
  if (!o.sistaAvverkning) return <span style={{ color: V6_GREY2 }}>avverkningsdatum saknas</span>;
  const d = Math.max(0, Math.round((Date.now() - new Date(o.sistaAvverkning).getTime()) / 864e5));
  const man = d >= 60 ? ` (${Math.round(d / 30)} mån)` : '';
  return <>avverkat {fmtDate(o.sistaAvverkning)} · legat {d} dgr{man}</>;
}

/* ── Typ-tagg ── */
function TypTagg({ o }: { o: UppfoljningObjekt }) {
  const gall = o.typ === 'gallring';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.03em', color: gall ? V6_SK : '#cfe3ff', background: gall ? 'rgba(168,213,130,0.13)' : 'rgba(120,170,255,0.13)', borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>
      {gall ? 'Gallring' : 'Slutavv.'}
    </span>
  );
}

type Vald = 'slutavverkning' | 'gallring' | 'ris' | null;

/* ── VÅNING 1: tre summakort som ÄR filtren ──────────────────────────────
   Slutavv./Gallring visar oskotad kvar-volym (mätt ur skördat−skotat), grön
   Mätt-badge. Ris visar uppskattad grot (m³fub, gul Uppskattat-badge med
   ×faktor inbakad — tryck på badgen öppnar faktorjusteringen). Tryck på ett
   kort filtrerar; Ris-kortet växlar till rislistan. Ärlig nolla: kort utan
   bidragande objekt visar "—", aldrig "0 m³". */
function SummaKort({
  slutavvM3, slutavvN, gallringM3, gallringN, risM3, risN,
  vald, setVald, faktor, setFaktor, visaFaktor, setVisaFaktor,
}: {
  slutavvM3: number; slutavvN: number; gallringM3: number; gallringN: number; risM3: number; risN: number;
  vald: Vald; setVald: (v: Vald) => void; faktor: number; setFaktor: (v: number) => void;
  visaFaktor: boolean; setVisaFaktor: (v: boolean) => void;
}) {
  const stega = (steg: number) => setFaktor(klampaGrotFaktor(Math.round((faktor + steg) * 100) / 100));
  const faktorStr = faktor.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const etikett: React.CSSProperties = { fontSize: 10, color: V6_GREY, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 };

  const matt = (m3: number, n: number, enhet: string) =>
    n === 0
      ? <div style={{ fontSize: 15, color: V6_GREY2, fontWeight: 600, marginTop: 8, lineHeight: 1.2 }}>—</div>
      : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 7, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{sv(m3)}</span>
          <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 600 }}>{enhet}</span>
          <span style={{ fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: V6_DONE, border: '1px solid rgba(48,209,88,0.35)', borderRadius: 5, padding: '1px 4px' }}>mätt</span>
        </div>
      );

  const kortStil = (aktiv: boolean): React.CSSProperties => ({
    flex: 1, minWidth: 0, textAlign: 'left', background: V6_CARD, borderRadius: 12, padding: '12px 13px 11px',
    border: aktiv ? '1.5px solid rgba(255,255,255,0.5)' : '1.5px solid transparent', cursor: 'pointer', fontFamily: V6_FF,
  });
  const valj = (v: Vald) => setVald(vald === v ? null : v);

  return (
    <div style={{ margin: '0 16px 6px' }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => valj('slutavverkning')} style={kortStil(vald === 'slutavverkning')}>
          <div style={etikett}>Slutavv.</div>
          {matt(slutavvM3, slutavvN, 'm³')}
          <div style={{ fontSize: 10, color: V6_GREY, marginTop: 5 }}>{slutavvN} obj oskotat</div>
        </button>
        <button onClick={() => valj('gallring')} style={kortStil(vald === 'gallring')}>
          <div style={etikett}>Gallring</div>
          {matt(gallringM3, gallringN, 'm³')}
          <div style={{ fontSize: 10, color: V6_GREY, marginTop: 5 }}>{gallringN} obj oskotat</div>
        </button>
        <button onClick={() => valj('ris')} style={kortStil(vald === 'ris')}>
          <div style={etikett}>Ris</div>
          {risN === 0 ? (
            <div style={{ fontSize: 15, color: V6_GREY2, fontWeight: 600, marginTop: 8, lineHeight: 1.2 }}>—</div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 7, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, color: V6_GREY, fontWeight: 600 }}>~</span>
              <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.4px', fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: V6_WARN }}>{sv(risM3)}</span>
              <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 600 }}>m³fub</span>
            </div>
          )}
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); setVisaFaktor(!visaFaktor); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setVisaFaktor(!visaFaktor); } }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 5, fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: V6_WARN, border: '1px solid rgba(255,159,10,0.4)', borderRadius: 5, padding: '1px 4px', cursor: 'pointer' }}
          >
            uppskattat · ×{faktorStr}
          </div>
        </button>
      </div>

      {/* Faktorjustering + förklaring — öppnas från Uppskattat-badgen */}
      {visaFaktor && (
        <div style={{ marginTop: 8, background: V6_CARD, borderRadius: 12, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#fff', fontWeight: 500 }}>Grot-uttagsfaktor</div>
              <div style={{ fontSize: 10, color: V6_GREY2 }}>Skogforsk {GROT_UTTAGSFAKTOR_MIN.toLocaleString('sv-SE')}–{GROT_UTTAGSFAKTOR_MAX.toLocaleString('sv-SE')} av stamvolym</div>
            </div>
            <button onClick={() => stega(-0.01)} disabled={faktor <= GROT_UTTAGSFAKTOR_MIN + 1e-9} style={{ width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${V6_SEP}`, background: 'transparent', color: faktor <= GROT_UTTAGSFAKTOR_MIN + 1e-9 ? V6_GREY2 : '#fff', fontSize: 18, cursor: 'pointer', fontFamily: V6_FF, lineHeight: 1 }} aria-label="Minska">−</button>
            <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 38, textAlign: 'center' }}>{faktorStr}</span>
            <button onClick={() => stega(0.01)} disabled={faktor >= GROT_UTTAGSFAKTOR_MAX - 1e-9} style={{ width: 30, height: 30, borderRadius: 8, border: `0.5px solid ${V6_SEP}`, background: 'transparent', color: faktor >= GROT_UTTAGSFAKTOR_MAX - 1e-9 ? V6_GREY2 : '#fff', fontSize: 18, cursor: 'pointer', fontFamily: V6_FF, lineHeight: 1 }} aria-label="Öka">+</button>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: V6_GREY2, lineHeight: 1.45 }}>
            Grot är en uppskattning (Skogforsk-schablon: total avverkad stamvolym × faktor), inte en mätning — faktisk volym registreras vid skotning. Skotad grot visas som mätt.
          </div>
        </div>
      )}
    </div>
  );
}

/* ── VÅNING 2: Skördare kör — pågående skörd, INGEN liggetid (volymen växer) ── */
function SkordareKor({ objekt, onSelect }: { objekt: UppfoljningObjekt[]; onSelect: (o: UppfoljningObjekt) => void }) {
  if (objekt.length === 0) return null;
  return (
    <section>
      <GroupHeader title="Skördare kör" count={objekt.length} />
      <div style={{ margin: '0 16px 4px', background: V6_CARD, borderRadius: 14, overflow: 'hidden' }}>
        {objekt.map((o, i) => (
          <button key={o.skordareObjektId || o.vo_nummer} onClick={() => onSelect(o)} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 56, padding: '11px 16px', gap: 12, background: 'transparent', border: 'none', textAlign: 'left', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', borderTop: i > 0 ? `0.5px solid ${V6_SEP}` : 'none' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: V6_SK, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.namn}</div>
              <div style={{ fontSize: 12, color: V6_GREY, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TypTagg o={o} />{o.areal ? <span>{o.areal} ha</span> : null}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>{sv(kvarM3(o))}</span>
              <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 500 }}>kvar m³</span>
            </div>
            <Chevron />
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── VÅNING 3: Oskotat · äldst först — grupperat per skotare ──────────────
   Gruppens rubrik: skotare + summa ("… m³ på backen"), maskin med mest överst.
   Objekt utan känd skotare → "Ej tilldelad", gissa aldrig maskin. Objektrad:
   namn, volym, typ-tagg, liggetid, + "≈ X m³fub ris kvar" ENDAST om grot-
   anpassat (aldrig "0" annars). */
function OskotatPerSkotare({ objekt, onSelect, faktor }: { objekt: UppfoljningObjekt[]; onSelect: (o: UppfoljningObjekt) => void; faktor: number }) {
  const grupper = useMemo(() => {
    const m = new Map<string, UppfoljningObjekt[]>();
    for (const o of objekt) {
      const nyckel = o.tilldeladSkotare || ' ej'; // sorterar sist
      const arr = m.get(nyckel) || [];
      arr.push(o);
      m.set(nyckel, arr);
    }
    const lista = Array.from(m.entries()).map(([namn, objs]) => ({
      namn: namn === ' ej' ? null : namn,
      objs: objs.slice().sort((a, b) => {
        if (!a.sistaAvverkning) return 1;
        if (!b.sistaAvverkning) return -1;
        return a.sistaAvverkning.localeCompare(b.sistaAvverkning); // äldst först
      }),
      summa: objs.reduce((s, o) => s + kvarM3(o), 0),
    }));
    // Maskinen med mest på backen överst; Ej tilldelad alltid sist.
    lista.sort((a, b) => (a.namn === null ? 1 : b.namn === null ? -1 : b.summa - a.summa));
    return lista;
  }, [objekt]);

  if (objekt.length === 0) return null;

  return (
    <section>
      <GroupHeader title="Oskotat · äldst först" count={objekt.length} />
      {grupper.map(g => (
        <div key={g.namn || 'ej'} style={{ margin: '0 16px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '4px 4px 6px', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: g.namn ? '#fff' : V6_WARN }}>{g.namn || 'Ej tilldelad'}</span>
            <span style={{ fontSize: 12, color: V6_GREY, fontVariantNumeric: 'tabular-nums' }}>{sv(g.summa)} m³ på backen</span>
          </div>
          <div style={{ background: V6_CARD, borderRadius: 14, overflow: 'hidden' }}>
            {g.objs.map((o, i) => {
              const grot = o.grotAnpassad && !o.grotHamtad ? uppskattaGrotM3fub(o.volymSkordare, faktor) : null;
              return (
                <button key={o.skordareObjektId || o.vo_nummer} onClick={() => onSelect(o)} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 58, padding: '11px 16px', gap: 12, background: 'transparent', border: 'none', textAlign: 'left', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', borderTop: i > 0 ? `0.5px solid ${V6_SEP}` : 'none' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.namn}</span>
                      <TypTagg o={o} />
                    </div>
                    <div style={{ fontSize: 12, color: V6_GREY, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{liggetidText(o)}</div>
                    {grot != null && (
                      <div style={{ fontSize: 12, color: V6_WARN, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        ≈ {sv(grot)} m³fub ris kvar <span style={{ color: V6_GREY2 }}>(uppskattat)</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>{sv(kvarM3(o))}</span>
                    <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 500 }}>kvar m³</span>
                  </div>
                  <Chevron />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ── Rislista — grot-urvalet (C), äldst först på liggetid ── */
function RisLista({ objekt, onSelect, faktor }: { objekt: UppfoljningObjekt[]; onSelect: (o: UppfoljningObjekt) => void; faktor: number }) {
  const rader = objekt.slice().sort((a, b) => {
    if (!a.sistaAvverkning) return 1;
    if (!b.sistaAvverkning) return -1;
    return a.sistaAvverkning.localeCompare(b.sistaAvverkning);
  });
  return (
    <section>
      <GroupHeader title="Ris kvar på hygget · äldst först" count={rader.length} />
      {rader.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 50, color: V6_GREY, fontSize: 14 }}>Inga grot-objekt med ris kvar</div>
      ) : (
        <div style={{ margin: '0 16px 4px', background: V6_CARD, borderRadius: 14, overflow: 'hidden' }}>
          {rader.map((o, i) => {
            const grot = uppskattaGrotM3fub(o.volymSkordare, faktor);
            return (
              <button key={o.skordareObjektId || o.vo_nummer} onClick={() => onSelect(o)} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 56, padding: '11px 16px', gap: 12, background: 'transparent', border: 'none', textAlign: 'left', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', borderTop: i > 0 ? `0.5px solid ${V6_SEP}` : 'none' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.namn}</div>
                  <div style={{ fontSize: 12, color: V6_GREY, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{liggetidText(o)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
                  <span style={{ fontSize: 15, color: V6_GREY, fontWeight: 600 }}>~</span>
                  <span style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px', color: V6_WARN }}>{grot != null ? sv(grot) : '—'}</span>
                  <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 500 }}>m³fub</span>
                </div>
                <Chevron />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ── Övrigt — fångar allt som inte är Skördare kör / Oskotat / avslutat, så
   inget objekt försvinner tyst (externt skotade, klart-ej-markerat, ingen
   volym än). Lugn grå rad med ärlig statustext. ── */
function Ovrigt({ objekt, onSelect }: { objekt: UppfoljningObjekt[]; onSelect: (o: UppfoljningObjekt) => void }) {
  if (objekt.length === 0) return null;
  return (
    <section>
      <GroupHeader title="Övrigt" count={objekt.length} />
      <div style={{ margin: '0 16px 4px', background: V6_CARD, borderRadius: 14, overflow: 'hidden' }}>
        {objekt.map((o, i) => {
          const s = v6Status(o);
          const info = o.externSkotning ? 'Skotas externt' : s.t;
          return (
            <button key={o.skordareObjektId || o.skotareObjektId || o.vo_nummer} onClick={() => onSelect(o)} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 52, padding: '11px 16px', gap: 12, background: 'transparent', border: 'none', textAlign: 'left', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', borderTop: i > 0 ? `0.5px solid ${V6_SEP}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.namn}</div>
                <div style={{ fontSize: 12, color: V6_GREY, marginTop: 2 }}>{info}</div>
              </div>
              <Chevron />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function GroupHeader({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ padding: '18px 20px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: V6_GREY, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</span>
      <span style={{ fontSize: 13, color: V6_GREY, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </div>
  );
}

function Chevron() {
  return (
    <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke={V6_GREY2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="1 1 7 7 1 13" />
    </svg>
  );
}

/* ── V6 iOS sökbar ── */
function V6Search({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [focused, setFocused] = useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const active = focused || value.length > 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
      <div onClick={(e) => { if (!(e.target as HTMLElement).closest('button')) inputRef.current?.focus(); }} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(118,118,128,0.24)', borderRadius: 10, padding: '7px 8px', minWidth: 0, position: 'relative', cursor: 'text' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: active ? '0 0 auto' : 1, justifyContent: active ? 'flex-start' : 'center', transition: 'flex .2s' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={V6_GREY} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {!active && <span style={{ fontSize: 15, color: V6_GREY }}>Sök</span>}
        </div>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ flex: active ? 1 : 0, width: active ? 'auto' : 0, border: 'none', background: 'none', outline: 'none', color: '#fff', fontSize: 15, fontFamily: V6_FF, minWidth: 0, padding: 0 }}
        />
        {value.length > 0 && (
          <button onMouseDown={e => { e.preventDefault(); onChange(''); inputRef.current?.focus(); }} style={{ background: 'rgba(255,255,255,0.22)', border: 'none', borderRadius: '50%', width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, flexShrink: 0 }} aria-label="Rensa">
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="#000" strokeWidth="1.8" strokeLinecap="round">
              <line x1="1.5" y1="1.5" x2="6.5" y2="6.5" /><line x1="6.5" y1="1.5" x2="1.5" y2="6.5" />
            </svg>
          </button>
        )}
      </div>
      {active && (
        <button onMouseDown={e => { e.preventDefault(); onChange(''); inputRef.current?.blur(); }} style={{ background: 'none', border: 'none', color: '#0a84ff', fontSize: 15, fontFamily: V6_FF, cursor: 'pointer', padding: '0 2px', flexShrink: 0, whiteSpace: 'nowrap' }}>Avbryt</button>
      )}
    </div>
  );
}

/* ── Main page ── */
export default function UppfoljningPage() {
  const router = useRouter();
  const { objekt, loading, error } = useUppfoljningList();

  const [vald, setVald] = useState<Vald>(null);
  const [visaAvslutade, setVisaAvslutade] = useState(false);
  const [visaFaktor, setVisaFaktor] = useState(false);
  const [sok, setSok] = useState('');
  const [grotFaktor, setGrotFaktor] = useState(GROT_UTTAGSFAKTOR_DEFAULT);

  useEffect(() => {
    try {
      const v = sessionStorage.getItem('uppfoljning:vald');
      if (v !== null) setVald(JSON.parse(v));
      const s = sessionStorage.getItem('uppfoljning:sok');
      if (s !== null) setSok(JSON.parse(s));
      const gf = sessionStorage.getItem('uppfoljning:grotFaktor');
      if (gf !== null) setGrotFaktor(klampaGrotFaktor(JSON.parse(gf)));
    } catch {}
  }, []);
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:vald', JSON.stringify(vald)); } catch {} }, [vald]);
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:sok', JSON.stringify(sok)); } catch {} }, [sok]);
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:grotFaktor', JSON.stringify(grotFaktor)); } catch {} }, [grotFaktor]);

  const handleSelect = (o: UppfoljningObjekt) => {
    const id = urlIdFor(o);
    if (!id) return;
    router.push(`/uppfoljning/${encodeURIComponent(id)}`);
  };

  const matchSok = (o: UppfoljningObjekt) => {
    if (!sok.trim()) return true;
    const t = sok.toLowerCase();
    return o.namn.toLowerCase().includes(t) || (o.agare || '').toLowerCase().includes(t) || (o.vo_nummer || '').includes(t);
  };
  const matchTyp = (o: UppfoljningObjekt) => vald === 'slutavverkning' ? o.typ === 'slutavverkning' : vald === 'gallring' ? o.typ === 'gallring' : true;

  // ── Buckets ──
  // Ris-urval (C): grot-anpassat, har stamvolym, grot inte hämtad.
  const risAlla = useMemo(() => objekt.filter(o => o.grotAnpassad && o.volymSkordare > 0 && !o.grotHamtad), [objekt]);

  // Kort-summor (över ALLA objekt — korten är filterkällan, inte filtrerade).
  const oskotatEligible = (o: UppfoljningObjekt) => o.status !== 'avslutat' && !o.externSkotning && v6Status(o).k !== 'skordare' && kvarM3(o) > 0;
  const kort = useMemo(() => {
    let sM3 = 0, sN = 0, gM3 = 0, gN = 0;
    for (const o of objekt) {
      if (!oskotatEligible(o)) continue;
      if (o.typ === 'gallring') { gM3 += kvarM3(o); gN++; } else { sM3 += kvarM3(o); sN++; }
    }
    const risM3 = risAlla.reduce((a, o) => a + (uppskattaGrotM3fub(o.volymSkordare, grotFaktor) || 0), 0);
    return { sM3, sN, gM3, gN, risM3, risN: risAlla.length };
  }, [objekt, risAlla, grotFaktor]);

  const synliga = useMemo(() => objekt.filter(o => matchSok(o) && matchTyp(o)), [objekt, sok, vald]);
  const skordareKor = useMemo(() => synliga.filter(o => v6Status(o).k === 'skordare'), [synliga]);
  const oskotat = useMemo(() => synliga.filter(oskotatEligible), [synliga]);
  const avslutade = useMemo(() => objekt.filter(o => o.status === 'avslutat' && matchSok(o) && matchTyp(o)), [objekt, sok, vald]);
  const ovrigt = useMemo(() => {
    const iSkord = new Set(skordareKor);
    const iOskot = new Set(oskotat);
    return synliga.filter(o => o.status !== 'avslutat' && !iSkord.has(o) && !iOskot.has(o));
  }, [synliga, skordareKor, oskotat]);

  const risSynlig = useMemo(() => risAlla.filter(matchSok), [risAlla, sok]);
  const inget = !loading && !error && vald !== 'ris' && skordareKor.length === 0 && oskotat.length === 0 && ovrigt.length === 0;

  return (
    <div style={{ height: 'calc(100dvh - 56px - env(safe-area-inset-top))', overflowY: 'auto', background: bg, color: text, fontFamily: ff, WebkitFontSmoothing: 'antialiased' }}>
      <div className="max-w-app mx-auto" style={{ minHeight: '100%' }}>
        <div style={{ padding: '20px 20px 8px' }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.8px', margin: 0 }}>Uppföljning</h1>
        </div>
        <div style={{ padding: '8px 16px 14px' }}>
          <V6Search value={sok} onChange={setSok} />
        </div>

        <SummaKort
          slutavvM3={kort.sM3} slutavvN={kort.sN} gallringM3={kort.gM3} gallringN={kort.gN} risM3={kort.risM3} risN={kort.risN}
          vald={vald} setVald={setVald} faktor={grotFaktor} setFaktor={setGrotFaktor} visaFaktor={visaFaktor} setVisaFaktor={setVisaFaktor}
        />

        <div style={{ paddingBottom: 40, marginTop: 6 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: muted, fontSize: 14 }}>Laddar...</div>
          ) : error ? (
            /* Fel ≠ tomt: ett fetchfel får aldrig se ut som "inga objekt". */
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ color: V6_WARN, fontSize: 14, fontWeight: 600 }}>Kunde inte läsa objekten</div>
              <div style={{ color: muted, fontSize: 13, marginTop: 6 }}>Kontrollera anslutningen och försök igen.</div>
            </div>
          ) : vald === 'ris' ? (
            <RisLista objekt={risSynlig} onSelect={handleSelect} faktor={grotFaktor} />
          ) : (
            <>
              <SkordareKor objekt={skordareKor} onSelect={handleSelect} />
              <OskotatPerSkotare objekt={oskotat} onSelect={handleSelect} faktor={grotFaktor} />
              <Ovrigt objekt={ovrigt} onSelect={handleSelect} />
              {inget && (
                <div style={{ textAlign: 'center', padding: 80, color: V6_GREY, fontSize: 15 }}>
                  {vald ? 'Inga objekt i det filtret' : 'Inga aktiva objekt'}
                </div>
              )}
              {avslutade.length > 0 && (
                <div style={{ padding: '20px 16px 12px' }}>
                  <button onClick={() => setVisaAvslutade(!visaAvslutade)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 16px', background: 'transparent', border: `0.5px solid ${V6_SEP}`, borderRadius: 10, color: V6_GREY, fontSize: 13, fontWeight: 500, fontFamily: V6_FF, cursor: 'pointer' }}>
                    <span>{visaAvslutade ? 'Dölj' : 'Visa'} avslutade</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>({avslutade.length})</span>
                  </button>
                  {visaAvslutade && (
                    <div style={{ marginTop: 10, background: V6_CARD, borderRadius: 14, overflow: 'hidden' }}>
                      {avslutade.map((o, i) => (
                        <button key={o.skordareObjektId || o.skotareObjektId || o.vo_nummer} onClick={() => handleSelect(o)} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 52, padding: '11px 16px', gap: 12, background: 'transparent', border: 'none', textAlign: 'left', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', borderTop: i > 0 ? `0.5px solid ${V6_SEP}` : 'none' }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: V6_DONE, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.namn}</div>
                            <div style={{ fontSize: 12, color: V6_GREY, marginTop: 2 }}>Avslutat · {sv(o.volymSkordare)} m³</div>
                          </div>
                          <Chevron />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
