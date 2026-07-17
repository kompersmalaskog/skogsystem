'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { type UppfoljningObjekt } from './lib/transform';
import { useUppfoljningList, urlIdFor } from './hooks/useUppfoljningList';
import { uppfoljningStatus, STATUS_FARG, type UppfoljningStatusKey as V6StatusKey } from '@/lib/uppfoljning/status';

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

/* ── Helpers ── */
function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
}
function fmtH(minutes: number): string {
  const h = Math.round(minutes * 10) / 10;
  return `${h.toFixed(1)}h`;
}

/* ── V6 status-härledning — delad logik i lib/uppfoljning/status.ts ── */
// Listan och detaljvyns statusrad delar EN statusfunktion. Adaptern mappar
// listans volymfältnamn till lib-funktionens (volymSkordare→skordat).
const v6Status = (obj: UppfoljningObjekt) =>
  uppfoljningStatus({ ...obj, skordat: obj.volymSkordare, skotat: obj.volymSkotare });

/* ── Oskotat: VIRKE (mätt) vs RIS (beräknad — ej byggd än) ── */
// Virke räknas ur MÄTTA volymer (skördat − skotat, ej-klara objekt utan
// risskotning). Ris kan inte mätas ur skotardata som inte finns — beräkning
// ur skördardata (Skogforsk biomassafunktion, Arbetsrapport 944-2017) byggs
// som eget steg; tills dess står det ärligt "kan ej mätas än". Aldrig en
// schablon bredvid riktiga tal.
function OskotatKorten({ data }: { data: UppfoljningObjekt[] }) {
  const ejKlara = data.filter(o => o.status !== 'avslutat' && !o.skotareSlut && !o.externSkotning);
  const virke = ejKlara
    .filter(o => !o.grotSkotning && o.volymSkordare > 0)
    .map(o => ({ o, kvar: Math.max(0, o.volymSkordare - o.volymSkotare) }))
    .filter(x => x.kvar > 0);
  const virkeM3 = virke.reduce((a, b) => a + b.kvar, 0);
  const ris = ejKlara.filter(o => o.grotSkotning);

  // Per skotare — BARA maskinnamn, aldrig förare
  const perSkotare = new Map<string, { m3: number; antal: number }>();
  virke.forEach(({ o, kvar }) => {
    const nyckel = o.tilldeladSkotare || '';
    const p = perSkotare.get(nyckel) || { m3: 0, antal: 0 };
    p.m3 += kvar;
    p.antal += 1;
    perSkotare.set(nyckel, p);
  });
  const skotarRader = Array.from(perSkotare.entries()).sort((a, b) => b[1].m3 - a[1].m3);

  const kortEtikett: React.CSSProperties = { fontSize: 10, color: V6_GREY, letterSpacing: '0.07em', textTransform: 'uppercase', fontWeight: 700 };

  return (
    <div style={{ margin: '0 16px 14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div style={{ background: V6_CARD, borderRadius: 12, padding: '13px 14px 12px' }}>
          <div style={kortEtikett}>Oskotat virke</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 7 }}>
            <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{Math.round(virkeM3).toLocaleString('sv-SE')}</span>
            <span style={{ fontSize: 12, color: V6_GREY, fontWeight: 600 }}>m³</span>
            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: V6_DONE, border: '1px solid rgba(48,209,88,0.35)', borderRadius: 5, padding: '1px 5px' }}>mätt</span>
          </div>
          <div style={{ fontSize: 11, color: V6_GREY, marginTop: 6 }}>{virke.length} objekt</div>
        </div>
        <div style={{ background: V6_CARD, borderRadius: 12, padding: '13px 14px 12px' }}>
          <div style={kortEtikett}>Oskotat ris</div>
          <div style={{ fontSize: 15, color: V6_GREY, fontWeight: 600, marginTop: 9, lineHeight: 1.2 }}>kan ej mätas än</div>
          <div style={{ fontSize: 11, color: V6_GREY, marginTop: 6 }}>{ris.length} objekt</div>
        </div>
      </div>
      {skotarRader.length > 0 && (
        <div style={{ marginTop: 8, background: V6_CARD, borderRadius: 12, overflow: 'hidden' }}>
          {skotarRader.map(([namn, v], i) => (
            <div key={namn || 'ingen'} style={{ display: 'flex', alignItems: 'baseline', padding: '10px 14px', borderTop: i > 0 ? `0.5px solid ${V6_SEP}` : 'none', fontFamily: V6_FF }}>
              <span style={{ flex: 1, fontSize: 13, color: namn ? '#fff' : V6_GREY, fontWeight: 500 }}>{namn || 'Ingen skotare tilldelad'}</span>
              <span style={{ fontSize: 11, color: V6_GREY, marginRight: 10, fontVariantNumeric: 'tabular-nums' }}>{v.antal} obj</span>
              <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{Math.round(v.m3).toLocaleString('sv-SE')}</span>
              <span style={{ fontSize: 10, color: V6_GREY, fontWeight: 600, marginLeft: 3 }}>m³</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ padding: '8px 4px 0', fontSize: 11, color: V6_GREY2, lineHeight: 1.45 }}>
        Ris kan inte mätas än — beräkning ur skördardata (Skogforsk biomassafunktion) byggs som nästa steg. Faktisk volym vägs vid skotning.
      </div>
    </div>
  );
}

/* ── Oskotade objekt — äldst först, med liggetid ── */
// NEUTRAL ris-notering: Skogforsk beskriver hyggeslagring ~en säsong för
// avbarrning (högre värmevärde, näringen stannar i skogen) — men färsk
// skotning är också giltig strategi. Appen DÖMER INTE: den visar liggetiden,
// och vid ~en säsong en diskret notering. Ingen larmfärg, ingen uppmaning.
const SASONG_DAGAR = 120;

function OskotadeLista({ data, onSelect }: { data: UppfoljningObjekt[]; onSelect: (o: UppfoljningObjekt) => void }) {
  const rader = data
    .filter(o => o.status !== 'avslutat' && !o.skotareSlut && !o.externSkotning && o.volymSkordare > 0)
    .map(o => ({ o, kvar: Math.max(0, o.volymSkordare - o.volymSkotare) }))
    .filter(x => x.kvar > 0)
    .sort((a, b) => {
      if (!a.o.sistaAvverkning) return 1;
      if (!b.o.sistaAvverkning) return -1;
      return a.o.sistaAvverkning.localeCompare(b.o.sistaAvverkning); // äldst först
    });
  if (rader.length === 0) return null;

  return (
    <section>
      <V6GroupHeader title="Oskotade objekt · äldst först" count={rader.length} />
      <div style={{ margin: '0 16px 4px', background: V6_CARD, borderRadius: 14, overflow: 'hidden' }}>
        {rader.map(({ o, kvar }, i) => {
          let liggetid: React.ReactNode = <span style={{ color: V6_GREY2 }}>avverkningsdatum saknas</span>;
          if (o.sistaAvverkning) {
            const d = Math.max(0, Math.round((Date.now() - new Date(o.sistaAvverkning).getTime()) / 864e5));
            const man = d >= 60 ? ` (${Math.round(d / 30)} mån)` : '';
            liggetid = (
              <>
                avverkat {fmtDate(o.sistaAvverkning)} · legat {d} dgr{man}
                {o.grotSkotning && d >= SASONG_DAGAR && <span> · hyggeslagrat en säsong</span>}
              </>
            );
          }
          return (
            <button key={o.skordareObjektId || o.vo_nummer} onClick={() => onSelect(o)} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 56, padding: '11px 16px', gap: 12, background: 'transparent', border: 'none', textAlign: 'left', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', borderTop: i > 0 ? `0.5px solid ${V6_SEP}` : 'none' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {o.namn}{o.grotSkotning && <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 500 }}> · ris</span>}
                </div>
                <div style={{ fontSize: 12, color: V6_GREY, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{liggetid}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
                <span style={{ fontSize: 16, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>{Math.round(kvar).toLocaleString('sv-SE')}</span>
                <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 500 }}>kvar m³</span>
              </div>
              <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke={V6_GREY2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <polyline points="1 1 7 7 1 13" />
              </svg>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ── V6 Row ── */
function V6Row({ obj, onClick, divider: showDivider }: { obj: UppfoljningObjekt; onClick: () => void; divider: boolean }) {
  const kvar = Math.max(0, obj.volymSkordare - obj.volymSkotare);
  const status = v6Status(obj);
  const statusColor = STATUS_FARG[status.k];
  const showKvar = kvar > 0 && obj.status !== 'avslutat';
  const rightNum = showKvar ? Math.round(kvar) : Math.round(obj.volymSkordare);
  const rightLabel = showKvar ? 'kvar' : 'm³';
  let liggerDagar: number | null = null;
  if (status.k === 'vantar' && obj.skordareSlut) {
    const d = Math.round((Date.now() - new Date(obj.skordareSlut).getTime()) / 864e5);
    if (d > 0) liggerDagar = d;
  }
  // Externt skotade färdigskördade objekt: lugn info istället för varningar —
  // ingen mer aktivitet väntas från oss
  const skotasExternt = !!(obj.externSkotning && obj.skordareSlut);

  // Ärligt inaktiv-tillstånd: objekt i "Pågående" med registrerad aktivitet
  // som legat stilla > 7 dagar får det utskrivet — inte maskerat som "kör".
  let inaktivDagar: number | null = null;
  let senastAktiv: string | null = null;
  if (status.k === 'pagaende' && !skotasExternt) {
    const senaste = [obj.skordareLastDate, obj.skotareLastDate].filter(Boolean).sort().reverse()[0] || null;
    if (senaste) {
      const d = Math.round((Date.now() - new Date(senaste).getTime()) / 864e5);
      if (d > 7) { inaktivDagar = d; senastAktiv = senaste; }
    }
  }

  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 60, padding: '12px 16px', gap: 12, background: 'transparent', border: 'none', textAlign: 'left', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', borderTop: showDivider ? `0.5px solid ${V6_SEP}` : 'none' }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{obj.namn}</div>
        <div style={{ fontSize: 12, color: V6_GREY, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {obj.typ === 'slutavverkning' ? 'Slutavverkning' : 'Gallring'}{obj.areal ? ` · ${obj.areal} ha` : ''}
          {liggerDagar != null && (
            <span> · <span style={{ color: V6_WARN, fontWeight: 600 }}>Oskotat {liggerDagar} {liggerDagar === 1 ? 'dag' : 'dagar'} · färdigskördat {fmtDate(obj.skordareSlut)}</span></span>
          )}
          {inaktivDagar != null && (
            <span> · <span style={{ color: V6_WARN, fontWeight: 600 }}>Inaktiv {inaktivDagar} dagar · senast {fmtDate(senastAktiv)}</span></span>
          )}
          {skotasExternt && (
            <span> · <span style={{ color: V6_GREY }}>Skotas externt · färdigskördat {fmtDate(obj.skordareSlut)}</span></span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0 }}>
        <span style={{ fontSize: 17, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px', color: '#fff' }}>{rightNum.toLocaleString('sv-SE')}</span>
        <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 500 }}>{rightLabel}{showKvar ? ' m³' : ''}</span>
      </div>
      <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke={V6_GREY2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 4, flexShrink: 0 }}>
        <polyline points="1 1 7 7 1 13" />
      </svg>
    </button>
  );
}

function V6GroupHeader({ title, count }: { title: string; count: number }) {
  return (
    <div style={{ padding: '20px 20px 8px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: V6_GREY, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{title}</span>
      <span style={{ fontSize: 13, color: V6_GREY, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
    </div>
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

/* ── V6 Segmented ── */
function V6Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div style={{ display: 'flex', background: 'rgba(118,118,128,0.24)', borderRadius: 9, padding: 2, position: 'relative' }}>
      {options.map(([k, l]) => {
        const on = value === k;
        return (
          <button key={k} onClick={() => onChange(k)} style={{ flex: 1, padding: '6px 8px', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: on ? 600 : 500, fontFamily: V6_FF, cursor: 'pointer', background: on ? '#636366' : 'transparent', color: '#fff', transition: 'background .15s', minWidth: 0, whiteSpace: 'nowrap', letterSpacing: '-0.1px', boxShadow: on ? '0 1px 2px rgba(0,0,0,0.2)' : 'none' }}>{l}</button>
        );
      })}
    </div>
  );
}

/* ── Main page ── */
export default function UppfoljningPage() {
  const router = useRouter();
  const { objekt, loading, error } = useUppfoljningList();

  // Filter-state med sessionStorage-persistens
  const [typ, setTyp] = useState<'alla' | 'slutavverkning' | 'gallring' | 'grot'>('alla');
  const [visaAvslutade, setVisaAvslutade] = useState(false);
  const [sok, setSok] = useState('');

  // Läs sparat state från sessionStorage på mount (efter hydration för att undvika SSR-mismatch)
  useEffect(() => {
    try {
      const t = sessionStorage.getItem('uppfoljning:typ');
      if (t !== null) setTyp(JSON.parse(t));
      const v = sessionStorage.getItem('uppfoljning:visaAvslutade');
      if (v !== null) setVisaAvslutade(JSON.parse(v));
      const s = sessionStorage.getItem('uppfoljning:sok');
      if (s !== null) setSok(JSON.parse(s));
    } catch {}
  }, []);

  // Skriv state till sessionStorage vid varje ändring (try/catch så graceful om quota/privacy blockar)
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:typ', JSON.stringify(typ)); } catch {} }, [typ]);
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:visaAvslutade', JSON.stringify(visaAvslutade)); } catch {} }, [visaAvslutade]);
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:sok', JSON.stringify(sok)); } catch {} }, [sok]);

  const filtered = useMemo(() => {
    return objekt.filter(o => {
      if (o.status === 'avslutat' && !visaAvslutade) return false;
      if (typ === 'grot' && !o.grotSkotning) return false;
      if (typ !== 'alla' && typ !== 'grot' && o.typ !== typ) return false;
      if (sok.trim()) {
        const t = sok.toLowerCase();
        if (!(o.namn.toLowerCase().includes(t) || (o.agare || '').toLowerCase().includes(t) || (o.vo_nummer || '').includes(t))) return false;
      }
      return true;
    });
  }, [objekt, typ, sok, visaAvslutade]);

  const avslutadeCount = useMemo(() => objekt.filter(o => o.status === 'avslutat').length, [objekt]);

  const handleSelect = (o: UppfoljningObjekt) => {
    const id = urlIdFor(o);
    if (!id) return;
    router.push(`/uppfoljning/${encodeURIComponent(id)}`);
  };

  const order: V6StatusKey[] = ['skordare', 'skotare', 'vantar', 'pagaende', 'done'];
  const titles: Record<V6StatusKey, string> = {
    skordare: 'Skördare kör',
    skotare: 'Skotare kör',
    vantar: 'Väntar på skotning',
    pagaende: 'Övrigt pågående',
    done: 'Avslutade',
  };
  const groups: Record<V6StatusKey, UppfoljningObjekt[]> = { skordare: [], skotare: [], vantar: [], pagaende: [], done: [] };
  filtered.forEach(o => { const k = v6Status(o).k; (groups[k] || groups.pagaende).push(o); });


  return (
    <div style={{ height: 'calc(100dvh - 56px - env(safe-area-inset-top))', overflowY: 'auto', background: bg, color: text, fontFamily: ff, WebkitFontSmoothing: 'antialiased' }}>
      <div className="max-w-app mx-auto" style={{ minHeight: '100%' }}>
        <div style={{ padding: '20px 20px 8px' }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.8px', margin: 0 }}>Uppföljning</h1>
        </div>
        <div style={{ padding: '8px 16px 14px' }}>
          <V6Search value={sok} onChange={setSok} />
        </div>

        <OskotatKorten data={objekt} />
        <OskotadeLista data={objekt} onSelect={handleSelect} />

        <div style={{ padding: '14px 16px 12px' }}>
          <V6Segmented<'alla' | 'slutavverkning' | 'gallring' | 'grot'>
            value={typ}
            onChange={setTyp}
            options={[['alla', 'Alla'], ['slutavverkning', 'Slutavv.'], ['gallring', 'Gallring'], ['grot', 'Grot']]}
          />
        </div>

        <div style={{ paddingBottom: 40 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: muted, fontSize: 14 }}>Laddar...</div>
          ) : error ? (
            /* Fel ≠ tomt: ett fetchfel får aldrig se ut som "inga objekt". */
            <div style={{ textAlign: 'center', padding: 60 }}>
              <div style={{ color: V6_WARN, fontSize: 14, fontWeight: 600 }}>Kunde inte läsa objekten</div>
              <div style={{ color: muted, fontSize: 13, marginTop: 6 }}>Kontrollera anslutningen och försök igen.</div>
            </div>
          ) : (
            <>
              {order.map(k => {
                const rows = groups[k];
                if (!rows || rows.length === 0) return null;
                return (
                  <section key={k}>
                    <V6GroupHeader title={titles[k]} count={rows.length} />
                    <div style={{ margin: '0 16px', background: V6_CARD, borderRadius: 14, overflow: 'hidden' }}>
                      {rows.map((o, i) => (
                        <V6Row key={o.skordareObjektId || o.skotareObjektId || o.vo_nummer} obj={o} onClick={() => handleSelect(o)} divider={i > 0} />
                      ))}
                    </div>
                  </section>
                );
              })}
              {filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: 80, color: V6_GREY, fontSize: 15 }}>Inga objekt hittades</div>
              )}

              {avslutadeCount > 0 && (
                <div style={{ padding: '24px 16px 12px' }}>
                  <button onClick={() => setVisaAvslutade(!visaAvslutade)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '12px 16px', background: 'transparent', border: `0.5px solid ${V6_SEP}`, borderRadius: 10, color: V6_GREY, fontSize: 13, fontWeight: 500, fontFamily: V6_FF, cursor: 'pointer' }}>
                    <span>{visaAvslutade ? 'Dölj' : 'Visa'} avslutade</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>({avslutadeCount})</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
