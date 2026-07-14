'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { type UppfoljningObjekt } from './lib/transform';
import { useUppfoljningList, urlIdFor } from './hooks/useUppfoljningList';

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

/* ── V6 status-härledning ── */
// "Kör" kräver FAKTISK aktivitet (fakt_tid senaste 7 dagarna). Ett objekt med
// tilldelad maskin men utan aktivitet är "Pågående" — aldrig "kör" (den gamla
// fallbacken visade "Skördare kör" för objekt som stått stilla i veckor).
type V6StatusKey = 'skordare' | 'skotare' | 'vantar' | 'pagaende' | 'done';
function v6Status(obj: UppfoljningObjekt): { t: string; k: V6StatusKey } {
  if (obj.status === 'avslutat') return { t: 'Avslutat', k: 'done' };
  const seven = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const skAct = !!(obj.skordareLastDate && obj.skordareLastDate >= seven);
  const stAct = !!(obj.skotareLastDate && obj.skotareLastDate >= seven);
  const skDone = !!obj.skordareSlut;
  if (skAct) return { t: 'Skördare kör', k: 'skordare' };
  if (stAct) return { t: 'Skotare kör', k: 'skotare' };
  if (skDone) return { t: 'Väntar på skotning', k: 'vantar' };
  return { t: 'Pågående', k: 'pagaende' };
}

/* ── V6 Oskotat-kort (kompakt, expanderbar) ── */
function V6OskotatKort({ data, onFilter }: { data: UppfoljningObjekt[]; onFilter: (k: 'slutavverkning' | 'gallring' | 'grot') => void }) {
  const [open, setOpen] = useState(false);
  const oskotat = {
    slut: { m3: 0, objekt: [] as UppfoljningObjekt[] },
    gall: { m3: 0, objekt: [] as UppfoljningObjekt[] },
    // Grot: vi HAR ingen grotvolym i datan (bara risskotning-flaggan). Tidigare
    // visades en schablon (15 % av skördat) som såg exakt ut — påhittad siffra
    // bredvid riktiga. Nu: antal objekt, volym uttalat okänd.
    grot: { objekt: [] as UppfoljningObjekt[] },
  };
  data.forEach(o => {
    if (o.status === 'avslutat') return;
    const kvar = Math.max(0, o.volymSkordare - o.volymSkotare);
    if (kvar <= 0) return;
    if (o.grotSkotning) oskotat.grot.objekt.push(o);
    if (o.typ === 'slutavverkning') { oskotat.slut.m3 += kvar; oskotat.slut.objekt.push(o); }
    else if (o.typ === 'gallring') { oskotat.gall.m3 += kvar; oskotat.gall.objekt.push(o); }
  });
  const total = oskotat.slut.m3 + oskotat.gall.m3;
  if (total === 0 && oskotat.grot.objekt.length === 0) return null;

  const rad = (label: string, key: 'slutavverkning' | 'gallring' | 'grot', kat: typeof oskotat.slut) => {
    if (kat.m3 === 0) return null;
    return (
      <button key={key} onClick={() => { onFilter(key); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '12px 18px', background: 'transparent', border: 'none', borderTop: `0.5px solid ${V6_SEP}`, color: '#fff', fontFamily: V6_FF, cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 11, color: V6_GREY, marginRight: 12, fontVariantNumeric: 'tabular-nums' }}>{kat.objekt.length} obj</span>
        <span style={{ fontSize: 15, fontWeight: 600, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.2px', minWidth: 56, textAlign: 'right' }}>{Math.round(kat.m3).toLocaleString('sv-SE')}</span>
        <span style={{ fontSize: 10, color: V6_GREY, fontWeight: 600, marginLeft: 3 }}>m³</span>
        <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke={V6_GREY2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 8 }}>
          <polyline points="1 1 7 7 1 13" />
        </svg>
      </button>
    );
  };

  return (
    <div style={{ margin: '0 16px 14px', background: V6_CARD, borderRadius: 12, overflow: 'hidden' }}>
      <button onClick={() => setOpen(!open)} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '13px 16px', background: 'transparent', border: 'none', color: '#fff', fontFamily: V6_FF, cursor: 'pointer', textAlign: 'left', gap: 10 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: V6_WARN, flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.1px' }}>Oskotat i skogen</span>
        <span style={{ flex: 1 }} />
        {total > 0 && (
          <>
            <span style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.3px' }}>{Math.round(total).toLocaleString('sv-SE')}</span>
            <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 600, marginLeft: 3 }}>m³</span>
          </>
        )}
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke={V6_GREY} strokeWidth="2" strokeLinecap="round" style={{ marginLeft: 6, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }}>
          <polyline points="4 2 8 6 4 10" />
        </svg>
      </button>
      {open && (
        <>
          {rad('Slutavverkning', 'slutavverkning', oskotat.slut)}
          {rad('Gallring', 'gallring', oskotat.gall)}
          {oskotat.grot.objekt.length > 0 && (
            <button key="grot" onClick={() => { onFilter('grot'); setOpen(false); }} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '12px 18px', background: 'transparent', border: 'none', borderTop: `0.5px solid ${V6_SEP}`, color: '#fff', fontFamily: V6_FF, cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>Grot</span>
              <span style={{ fontSize: 11, color: V6_GREY, marginRight: 12, fontVariantNumeric: 'tabular-nums' }}>{oskotat.grot.objekt.length} obj</span>
              <span style={{ fontSize: 11, color: V6_GREY, fontWeight: 500 }}>volym okänd</span>
              <svg width="7" height="12" viewBox="0 0 8 14" fill="none" stroke={V6_GREY2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginLeft: 8 }}>
                <polyline points="1 1 7 7 1 13" />
              </svg>
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ── V6 Row ── */
function V6Row({ obj, onClick, divider: showDivider }: { obj: UppfoljningObjekt; onClick: () => void; divider: boolean }) {
  const kvar = Math.max(0, obj.volymSkordare - obj.volymSkotare);
  const status = v6Status(obj);
  const statusColor =
    status.k === 'skordare' ? V6_SK :
    status.k === 'skotare' ? V6_ST :
    status.k === 'vantar' ? V6_WARN :
    status.k === 'done' ? V6_DONE :
    V6_GREY;
  const showKvar = kvar > 0 && obj.status !== 'avslutat';
  const rightNum = showKvar ? Math.round(kvar) : Math.round(obj.volymSkordare);
  const rightLabel = showKvar ? 'kvar' : 'm³';
  let liggerDagar: number | null = null;
  if (status.k === 'vantar' && obj.skordareSlut) {
    const d = Math.round((Date.now() - new Date(obj.skordareSlut).getTime()) / 864e5);
    if (d > 0) liggerDagar = d;
  }
  // Ärligt inaktiv-tillstånd: objekt i "Pågående" med registrerad aktivitet
  // som legat stilla > 7 dagar får det utskrivet — inte maskerat som "kör".
  let inaktivDagar: number | null = null;
  let senastAktiv: string | null = null;
  if (status.k === 'pagaende') {
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
  const [oskotatFilter, setOskotatFilter] = useState<'slutavverkning' | 'gallring' | 'grot' | null>(null);
  const [visaAvslutade, setVisaAvslutade] = useState(false);
  const [sok, setSok] = useState('');

  // Läs sparat state från sessionStorage på mount (efter hydration för att undvika SSR-mismatch)
  useEffect(() => {
    try {
      const t = sessionStorage.getItem('uppfoljning:typ');
      if (t !== null) setTyp(JSON.parse(t));
      const o = sessionStorage.getItem('uppfoljning:oskotatFilter');
      if (o !== null) setOskotatFilter(JSON.parse(o));
      const v = sessionStorage.getItem('uppfoljning:visaAvslutade');
      if (v !== null) setVisaAvslutade(JSON.parse(v));
      const s = sessionStorage.getItem('uppfoljning:sok');
      if (s !== null) setSok(JSON.parse(s));
    } catch {}
  }, []);

  // Skriv state till sessionStorage vid varje ändring (try/catch så graceful om quota/privacy blockar)
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:typ', JSON.stringify(typ)); } catch {} }, [typ]);
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:oskotatFilter', JSON.stringify(oskotatFilter)); } catch {} }, [oskotatFilter]);
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:visaAvslutade', JSON.stringify(visaAvslutade)); } catch {} }, [visaAvslutade]);
  useEffect(() => { try { sessionStorage.setItem('uppfoljning:sok', JSON.stringify(sok)); } catch {} }, [sok]);

  const filtered = useMemo(() => {
    return objekt.filter(o => {
      if (o.status === 'avslutat' && !visaAvslutade && !oskotatFilter) return false;
      if (oskotatFilter) {
        if (o.status === 'avslutat') return false;
        const kvar = o.volymSkordare - o.volymSkotare;
        if (kvar <= 0) return false;
        if (oskotatFilter === 'grot' && !o.grotSkotning) return false;
        if (oskotatFilter !== 'grot' && o.typ !== oskotatFilter) return false;
      } else {
        if (typ === 'grot' && !o.grotSkotning) return false;
        if (typ !== 'alla' && typ !== 'grot' && o.typ !== typ) return false;
      }
      if (sok.trim()) {
        const t = sok.toLowerCase();
        if (!(o.namn.toLowerCase().includes(t) || (o.agare || '').toLowerCase().includes(t) || (o.vo_nummer || '').includes(t))) return false;
      }
      return true;
    });
  }, [objekt, typ, sok, oskotatFilter, visaAvslutade]);

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

  const filterLabel = oskotatFilter ? ({ slutavverkning: 'Slutavverkning', gallring: 'Gallring', grot: 'Grot' } as const)[oskotatFilter] : '';

  return (
    <div style={{ height: 'calc(100dvh - 56px - env(safe-area-inset-top))', overflowY: 'auto', background: bg, color: text, fontFamily: ff, WebkitFontSmoothing: 'antialiased' }}>
      <div className="max-w-app mx-auto" style={{ minHeight: '100%' }}>
        <div style={{ padding: '20px 20px 8px' }}>
          <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-0.8px', margin: 0 }}>Uppföljning</h1>
        </div>
        <div style={{ padding: '8px 16px 14px' }}>
          <V6Search value={sok} onChange={setSok} />
        </div>

        {!oskotatFilter && <V6OskotatKort data={objekt} onFilter={setOskotatFilter} />}

        {oskotatFilter && (
          <div style={{ margin: '0 16px 14px', padding: '12px 16px', background: V6_CARD, borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: V6_WARN }} />
            <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>Oskotat · {filterLabel}</span>
            <button onClick={() => setOskotatFilter(null)} style={{ background: 'none', border: 'none', color: V6_WARN, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: V6_FF }}>Rensa</button>
          </div>
        )}

        {!oskotatFilter && (
          <div style={{ padding: '0 16px 12px' }}>
            <V6Segmented<'alla' | 'slutavverkning' | 'gallring' | 'grot'>
              value={typ}
              onChange={setTyp}
              options={[['alla', 'Alla'], ['slutavverkning', 'Slutavv.'], ['gallring', 'Gallring'], ['grot', 'Grot']]}
            />
          </div>
        )}

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

              {!oskotatFilter && avslutadeCount > 0 && (
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
