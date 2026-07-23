'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { type UppfoljningObjekt } from './lib/transform';
import { useUppfoljningList, urlIdFor } from './hooks/useUppfoljningList';
import { uppskattaGrotM3fub, klampaGrotFaktor, GROT_UTTAGSFAKTOR_DEFAULT, GROT_UTTAGSFAKTOR_MIN, GROT_UTTAGSFAKTOR_MAX } from '@/lib/grot';
import { typKort, arRisjobb } from '@/lib/objekt/typ';

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

function kvarM3(o: UppfoljningObjekt): number {
  return Math.max(0, o.volymSkordare - o.volymSkotare);
}

type Sektion = 'skordare' | 'oskotat' | 'ovrigt' | 'avslutade';

// Brytdatum: historiken färdigmarkerades i DB detta datum — från och med nu
// är lassdata + färdigmarkering (skotning_avslutad) sanningskällorna. Objekt
// avverkade FÖRE detta med 0 lass är historiska (skotades utan lassregistrering)
// → Övrigt "skotad utan lassdata". Objekt avverkade EFTER → 0 lass betyder bara
// att skotaren inte hunnit dit, virket ligger genuint oskotat på backen. Utan
// brytdatum skulle ett nyavverkat objekt felaktigt hamna i "markera färdig".
const LASSDATA_START = '2026-07-21';

// EXKLUSIV sektionsindelning: varje icke-exkluderat objekt hamnar i EXAKT en
// sektion. Ordningen är avgörande (else-if-kedja). Avslutat = SKOTNINGEN klar
// (inte skördning). Allt annat → Övrigt, med ärlig text (ovrigtText).
function sektionAv(o: UppfoljningObjekt): Sektion {
  const seven = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const skordareAktiv = !!(o.skordareLastDate && o.skordareLastDate >= seven);
  if (skordareAktiv && !o.skotningAvslutad) return 'skordare';
  if (o.skotningAvslutad) return 'avslutade';
  if (o.externSkotning) return 'ovrigt';
  if (kvarM3(o) > 0) {
    if (o.antalLass > 0) return 'oskotat';
    // 0 lass: efter brytdatum = genuint oskotat (skotaren ej börjat än);
    // före = historiskt objekt som skotades innan lassregistreringen.
    if (o.sistaAvverkning && o.sistaAvverkning >= LASSDATA_START) return 'oskotat';
  }
  return 'ovrigt';
}

// Ärlig statustext för Övrigt-raden — objektet är aldrig i limbo, det står
// utskrivet VARFÖR det ligger här och vad som väntas.
function ovrigtText(o: UppfoljningObjekt): string {
  if (o.externSkotning) return 'Skotas externt';
  // Risjobb skördar aldrig — deras volym är skotarens RAPPORTERADE lass.
  // "Ingen produktionsdata" vore fel: riset ÄR hämtat och mängden känd.
  if (o.grotSkotning) {
    return o.volymSkotare > 0 ? `${sv(o.volymSkotare)} m³ ris hämtat` : 'Inga lass registrerade än';
  }
  if (o.volymSkordare === 0) return 'Ingen produktionsdata än';
  const kvar = kvarM3(o);
  if (kvar > 0 && o.antalLass === 0 && o.skordningAvslutad) return 'Skotad utan lassdata — markera färdig';
  if (kvar > 0 && o.antalLass === 0) return 'Avverkat — väntar på skotning';
  if (kvar === 0 && !o.skotningAvslutad) return 'Klar — markera avslutad';
  return 'Övrigt';
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
// VISSHETSGRAD — tre nivåer som ALDRIG får se likadana ut:
//  matt        = skördarmätt virke (stockmätning). Grön. Reserverad.
//  rapporterat = skotarens lassvolym på ris — förarens bedömning i m³fub,
//                inte stockmätning. Ska aldrig bära grön Mätt.
//  schablon    = beräknad ur stamvolym × faktor.
function Visshet({ grad }: { grad: 'matt' | 'rapporterat' | 'schablon' }) {
  const stil = grad === 'matt'
    ? { color: V6_DONE, border: '1px solid rgba(48,209,88,0.35)' }
    : grad === 'rapporterat'
      ? { color: '#8ab4f8', border: '1px solid rgba(138,180,248,0.35)' }
      : { color: V6_WARN, border: '1px solid rgba(255,159,10,0.4)' };
  return (
    <span style={{ ...stil, fontSize: 8.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', borderRadius: 5, padding: '1px 4px', whiteSpace: 'nowrap' }}>
      {grad === 'matt' ? 'mätt' : grad === 'rapporterat' ? 'rapporterat' : 'schablon'}
    </span>
  );
}

function TypTagg({ o }: { o: UppfoljningObjekt }) {
  // Typen kommer ur den DELADE regeln (lib/objekt/typ.ts) — aldrig ur
  // huvudtyp direkt, aldrig med fallback-gissning.
  const t = o.typ;
  const f = t === 'grot' ? { c: V6_ST, b: 'rgba(240,178,76,0.13)' }
    : t === 'gallring' ? { c: V6_SK, b: 'rgba(168,213,130,0.13)' }
    : t === 'slutavverkning' ? { c: '#cfe3ff', b: 'rgba(120,170,255,0.13)' }
    : { c: V6_GREY, b: 'rgba(142,142,147,0.13)' };
  return (
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.03em', color: f.c, background: f.b, borderRadius: 5, padding: '1px 6px', whiteSpace: 'nowrap' }}>
      {typKort(t)}
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
          <Visshet grad="matt" />
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
            schablon · ×{faktorStr}
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
// Skotarens läge på ett objekt: aktiv skotare ur lassdata (annars tilldelad),
// och hur mycket som skotats av det skördade hittills. Utan både lass och
// tilldelning: väntar på skotare — gissa aldrig maskin.
function skotarText(o: UppfoljningObjekt): string {
  if (o.skotareKalla === 'lass') return `${o.tilldeladSkotare} skotar · ${sv(o.volymSkotare)} m³ av ${sv(o.volymSkordare)}`;
  if (o.tilldeladSkotare) return `${o.tilldeladSkotare} tilldelad · väntar på lass`;
  return 'väntar på skotare';
}

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
              {/* Skotarens halva — svarar på 'vem skotar detta, hur långt kommet' */}
              <div style={{ fontSize: 12, color: V6_ST, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{skotarText(o)}</div>
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
function OskotatPerSkotare({ objekt, pagaende, onSelect, faktor }: { objekt: UppfoljningObjekt[]; pagaende: UppfoljningObjekt[]; onSelect: (o: UppfoljningObjekt) => void; faktor: number }) {
  const grupper = useMemo(() => {
    // objs = oskotade objekt (rader VISAS). pag = pågående skörd med samma
    // skotare (räknas i SUMMAN, raden bor kvar under Skördare kör — ett
    // objekt, ett ställe). Summan svarar på 'vem har mest att skota' och får
    // aldrig utelämna det som just nu avverkas åt skotaren.
    const m = new Map<string, { objs: UppfoljningObjekt[]; pag: UppfoljningObjekt[] }>();
    const hink = (namn: string) => { const k = namn; if (!m.has(k)) m.set(k, { objs: [], pag: [] }); return m.get(k)!; };
    for (const o of objekt) hink(o.tilldeladSkotare || ' ej').objs.push(o);
    // Bara pågående med KÄND skotare räknas in — utan skotare finns ingen
    // backe att tillskriva, gissa aldrig.
    for (const o of pagaende) { if (o.tilldeladSkotare) hink(o.tilldeladSkotare).pag.push(o); }

    const lista = Array.from(m.entries()).map(([namn, g]) => ({
      namn: namn === ' ej' ? null : namn,
      objs: g.objs.slice().sort((a, b) => {
        if (!a.sistaAvverkning) return 1;
        if (!b.sistaAvverkning) return -1;
        return a.sistaAvverkning.localeCompare(b.sistaAvverkning); // äldst först
      }),
      // Summa = oskotad kvar + pågående kvar (det som är på väg till backen).
      summa: g.objs.reduce((s, o) => s + kvarM3(o), 0) + g.pag.reduce((s, o) => s + kvarM3(o), 0),
      pagaende: g.pag.length,
    }));
    // Skotare med mest på backen överst; Ej tilldelad alltid sist.
    lista.sort((a, b) => (a.namn === null ? 1 : b.namn === null ? -1 : b.summa - a.summa));
    return lista;
  }, [objekt, pagaende]);

  const antalRader = objekt.length;
  if (grupper.length === 0) return null;

  return (
    <section>
      <GroupHeader title="Oskotat · äldst först" count={antalRader} />
      {grupper.map(g => (
        <div key={g.namn || 'ej'} style={{ margin: '0 16px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '4px 4px 6px', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: g.namn ? '#fff' : V6_WARN }}>
              {g.namn || 'Ej tilldelad'}
              {g.pagaende > 0 && <span style={{ color: V6_SK, fontWeight: 500 }}> · varav {g.pagaende} pågående</span>}
            </span>
            <span style={{ fontSize: 12, color: V6_GREY, fontVariantNumeric: 'tabular-nums' }}>{sv(g.summa)} m³ på backen</span>
          </div>
          {/* Gruppen kan vara summa-bara (all volym under pågående skörd) —
              då är objektlistan tom med flit, raderna bor i Skördare kör. */}
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
                    {o.skotareAvvikelse && (
                      <div style={{ fontSize: 11, color: V6_GREY2, marginTop: 2 }}>
                        Lassdata: {o.skotareAvvikelse.lass} · tilldelad: {o.skotareAvvikelse.tilldelad}
                      </div>
                    )}
                    {grot != null && (
                      <div style={{ fontSize: 12, color: V6_WARN, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                        ≈ {sv(grot)} m³fub ris kvar <span style={{ color: V6_GREY2 }}>(schablon)</span>
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
                  <div style={{ fontSize: 12, color: V6_GREY, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                    {liggetidText(o)}
                    {o.risskotningPagar && <span style={{ color: V6_ST }}> · risskotning pågår</span>}
                  </div>
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
          const info = ovrigtText(o);
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
// Aptering-ingång + avslutspåminnelser. Hämtar aktiva objekt en gång:
//  - ingång-raden in i apteringsvyn (dämpad amber-prick när läge 2 finns)
//  - stilla påminnelserader för aktiva objekt utan ny fil på 14 dagar, med
//    ETT tryck som sätter completed (spec 3b). Ingen dialog, ingen automatik.
// Ett fetchfel får aldrig se ut som "inget att titta på": då visas bara
// ingången (neutral), aldrig en falsk "inom mål".
function ApteringIngang({ onClick }: { onClick: () => void }) {
  const [objekt, setObjekt] = useState<any[] | null>(null);
  const [avslutade, setAvslutade] = useState<Set<string>>(new Set());

  const ladda = React.useCallback(() => {
    fetch('/api/fordelning?scope=aktiva')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.objekt) setObjekt(d.objekt); })
      .catch(() => {});
  }, []);
  useEffect(() => { ladda(); }, [ladda]);

  const läge2 = (objekt ?? []).filter((o) => o.lage === 2).length;
  const påminnelser = (objekt ?? []).filter((o) => o.status === 'active' && (o.dagarSedanFil ?? 0) >= 14 && !avslutade.has(o.objectKey));
  const text = objekt === null ? 'Aptering'
    : läge2 > 0 ? `Aptering · ${läge2} att titta på`
    : 'Aptering';

  const markera = async (k: string) => {
    setAvslutade((s) => new Set(s).add(k)); // optimistiskt: raden försvinner direkt
    await fetch(`/api/fordelning/${encodeURIComponent(k)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'markera_avslutad' }),
    }).catch(() => {});
  };

  return (
    <>
      <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '13px 16px', background: V6_CARD, border: 'none', borderRadius: 12, color: '#fff', fontFamily: V6_FF, cursor: 'pointer', textAlign: 'left' }}>
        {läge2 > 0 && <span style={{ width: 8, height: 8, borderRadius: 4, background: V6_WARN, flexShrink: 0 }} />}
        <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{text}</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke={V6_GREY} strokeWidth="2" strokeLinecap="round"><polyline points="4 2 8 6 4 10" /></svg>
      </button>
      {påminnelser.map((o) => (
        <div key={o.objectKey} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, padding: '11px 14px', background: 'rgba(255,255,255,0.03)', borderRadius: 10 }}>
          <span style={{ flex: 1, fontSize: 13, color: V6_GREY }}>
            {o.objektNamn} — ingen ny fil på {o.dagarSedanFil} dagar. Markera som avslutad?
          </span>
          <button onClick={() => markera(o.objectKey)} style={{ background: 'none', border: `0.5px solid ${V6_SEP}`, color: '#fff', fontSize: 13, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: V6_FF }}>
            Avsluta
          </button>
        </div>
      ))}
    </>
  );
}

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
  // Korten ÄR filtren — symmetriskt: Ris-kortet filtrerar till risjobb
  // (även bland avslutade), precis som Slutavv./Gallring gör för virke.
  const matchTyp = (o: UppfoljningObjekt) =>
    vald === 'slutavverkning' ? o.typ === 'slutavverkning'
    : vald === 'gallring' ? o.typ === 'gallring'
    : vald === 'ris' ? arRisjobb(o)
    : true;

  // ── Sektioner: tilldela varje objekt EN sektion, EN gång (invarianten) ──
  const sektioner = useMemo(() => {
    const b: Record<Sektion, UppfoljningObjekt[]> = { skordare: [], oskotat: [], ovrigt: [], avslutade: [] };
    for (const o of objekt) b[sektionAv(o)].push(o);
    // Larm ska larma: om summan inte går ihop tappas objekt mellan stolarna.
    if (process.env.NODE_ENV !== 'production') {
      const t = b.skordare.length + b.oskotat.length + b.ovrigt.length + b.avslutade.length;
      if (t !== objekt.length) {
        // eslint-disable-next-line no-console
        console.warn(`[uppfoljning] sektionssumma ${t} ≠ ${objekt.length} icke-exkluderade objekt — någon faller mellan stolarna`);
      }
    }
    return b;
  }, [objekt]);

  // Ris-urval (C): grot-anpassat, har stamvolym, grot inte hämtad.
  const risAlla = useMemo(() => objekt.filter(o => o.grotAnpassad && o.volymSkordare > 0 && !o.grotHamtad), [objekt]);

  // Kort-summor ur OSKOTAT-bucketen (genuint på backen) per typ — korten är
  // filterkällan. Ärlig nolla: typ utan oskotade objekt → 0 obj → kortet visar "—".
  const kort = useMemo(() => {
    let sM3 = 0, sN = 0, gM3 = 0, gN = 0;
    for (const o of sektioner.oskotat) {
      if (o.grotSkotning) continue; // risjobb är typ Grot, inte virke
      if (o.typ === 'gallring') { gM3 += kvarM3(o); gN++; } else { sM3 += kvarM3(o); sN++; }
    }
    const risM3 = risAlla.reduce((a, o) => a + (uppskattaGrotM3fub(o.volymSkordare, grotFaktor) || 0), 0);
    return { sM3, sN, gM3, gN, risM3, risN: risAlla.length };
  }, [sektioner, risAlla, grotFaktor]);

  const passar = (o: UppfoljningObjekt) => matchSok(o) && matchTyp(o);
  const skordareKor = useMemo(() => sektioner.skordare.filter(passar), [sektioner, sok, vald]);
  const oskotat = useMemo(() => sektioner.oskotat.filter(passar), [sektioner, sok, vald]);
  const ovrigt = useMemo(() => sektioner.ovrigt.filter(passar), [sektioner, sok, vald]);
  const avslutade = useMemo(() => sektioner.avslutade.filter(passar), [sektioner, sok, vald]);

  const risSynlig = useMemo(() => risAlla.filter(matchSok), [risAlla, sok]);
  const inget = !loading && !error && vald !== 'ris' && skordareKor.length === 0 && oskotat.length === 0 && ovrigt.length === 0;

  // Avslutade-listan visas i BÅDA lägena (virkesfilter och ris) — korten ska
  // bete sig likadant oavsett vilket som är valt.
  const avslutadeBlock = avslutade.length > 0 ? (
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
                <div style={{ fontSize: 15, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.namn}</span>
                  <TypTagg o={o} />
                </div>
                <div style={{ fontSize: 12, color: V6_GREY, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {arRisjobb(o)
                    ? (o.volymSkotare > 0
                        ? <>Avslutat · {sv(o.volymSkotare)} m³ ris <Visshet grad="rapporterat" /></>
                        : <>Avslutat · inga lass registrerade</>)
                    : (o.volymSkordare > 0
                        ? <>Avslutat · {sv(o.volymSkordare)} m³ <Visshet grad="matt" /></>
                        : <>Avslutat · ingen volym registrerad</>)}
                </div>
              </div>
              <Chevron />
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div style={{ height: 'calc(100dvh - 56px - env(safe-area-inset-top))', overflowY: 'auto', background: bg, color: text, fontFamily: ff, WebkitFontSmoothing: 'antialiased' }}>
      <div className="max-w-app mx-auto" style={{ minHeight: '100%' }}>
        <div style={{ padding: '20px 20px 8px' }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.8px', margin: 0 }}>Uppföljning</h1>
        </div>
        <div style={{ padding: '8px 16px 14px' }}>
          <V6Search value={sok} onChange={setSok} />
        </div>

        <div style={{ padding: '0 16px 14px' }}>
          <ApteringIngang onClick={() => router.push('/uppfoljning/fordelning')} />
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
            <>
              <RisLista objekt={risSynlig} onSelect={handleSelect} faktor={grotFaktor} />
              {avslutadeBlock}
            </>
          ) : (
            <>
              <SkordareKor objekt={skordareKor} onSelect={handleSelect} />
              <OskotatPerSkotare objekt={oskotat} pagaende={skordareKor} onSelect={handleSelect} faktor={grotFaktor} />
              <Ovrigt objekt={ovrigt} onSelect={handleSelect} />
              {inget && (
                <div style={{ textAlign: 'center', padding: 80, color: V6_GREY, fontSize: 15 }}>
                  {vald ? 'Inga objekt i det filtret' : 'Inga aktiva objekt'}
                </div>
              )}
              {avslutadeBlock}
              {false && (
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
                            <div style={{ fontSize: 12, color: V6_GREY, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                              {o.grotSkotning
                                ? <>Avslutat · {o.volymSkotare > 0 ? `${sv(o.volymSkotare)} m³ ris` : 'inga lass'} {o.volymSkotare > 0 && <Visshet grad="rapporterat" />}</>
                                : <>Avslutat · {sv(o.volymSkordare)} m³ {o.volymSkordare > 0 && <Visshet grad="matt" />}</>}
                            </div>
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
