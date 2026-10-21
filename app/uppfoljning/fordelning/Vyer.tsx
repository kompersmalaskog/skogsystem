'use client';

/**
 * Vyer.tsx — apteringens översikt och listan "Alla objekt" (2026-10-21).
 *
 * Översikten är Apples sätt: ETT tal (senaste månadens fel virke i m³), staplar
 * per månad, högst en höjdpunkt och vägen till listan. Inget mer. Listan är en
 * vanlig iOS-lista: sök, pågår, tysta objekt, sedan trakter per månad.
 * All logik bor i oversikt.ts; här ritas bara. Byggstenar och värden ur
 * components/design och lib/design/tokens — inga egna literaler.
 */

import React, { useEffect, useState } from 'react';
import { AVSTAND, FARG, IKON, KNAPP, KORT, RADIE, TNUM, TRAFFYTA, TYP, overgang } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ikon from '@/components/design/Ikon';
import type { ObjektKort, VantandeObjekt } from './types';
import { SMA_M3, byggAllaObjekt, byggOversikt, m3, manadKort, manadNamn, manadFor, smaText, type ObjektRad } from './oversikt';

const versal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Statusraden under titeln: räknar om / kunde inte uppdatera. Tom = ingen rad. */
function Statusrad({ text }: { text: string | null }) {
  if (!text) return null;
  return <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.l}px` }}>{text}</p>;
}

/* ─────────────────────────── Översikt ─────────────────────────── */

function Staplar({ staplar, onManad }: { staplar: { manad: string; pct: number | null }[]; onManad: (m: string) => void }) {
  const max = Math.max(1, ...staplar.map((s) => s.pct ?? 0));
  const STAPEL_H = TRAFFYTA.min + AVSTAND.xl; // 68 px yta för stapeln
  return (
    <div role="list" aria-label="Fel virke per månad" style={{ display: 'flex', gap: AVSTAND.xs, marginTop: AVSTAND.l }}>
      {staplar.map((s, i) => {
        const sist = i === staplar.length - 1;
        const etikett = s.pct == null ? `${manadNamn(s.manad)}: ingen avslutad trakt` : `${manadNamn(s.manad)}: ${s.pct} % fel virke`;
        return (
          <button key={s.manad} type="button" role="listitem" aria-label={etikett} disabled={s.pct == null}
            onClick={() => onManad(s.manad)} data-stapel={s.manad}
            style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: AVSTAND.xs, background: 'none', border: 'none', padding: 0, cursor: s.pct == null ? 'default' : 'pointer', fontFamily: 'inherit' }}>
            <div style={{ height: STAPEL_H, display: 'flex', alignItems: 'flex-end' }}>
              {s.pct == null
                ? <div style={{ width: '100%', height: 2, background: FARG.linje }} />
                : <div style={{ width: '100%', height: `${Math.max(4, (s.pct / max) * 100)}%`, background: sist ? FARG.text : FARG.text3, borderRadius: RADIE.stapel }} />}
            </div>
            <span style={{ ...TYP.micro, color: sist ? FARG.text : FARG.text3, textAlign: 'center' }}>{manadKort(s.manad)}</span>
          </button>
        );
      })}
    </div>
  );
}

export function OversiktVy({ kort, antalObjekt, status, onTillbaka, onAlla }: {
  kort: ObjektKort[];
  antalObjekt: number;
  status: string | null;
  onTillbaka: () => void;
  onAlla: (manad?: string) => void;
}) {
  const o = byggOversikt(kort, new Date());
  const nuManad = manadFor(new Date().toISOString());
  return (
    <>
      <button type="button" onClick={onTillbaka} style={{ ...KNAPP.lank }}>‹ Uppföljning</button>
      <h1 style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.titel }}>Aptering</h1>
      <Statusrad text={status} />

      {o.senaste ? (
        <section style={{ ...KORT, marginBottom: AVSTAND.xl }} data-oversikt-tal>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>Fel virke i {manadNamn(o.senaste.manad, nuManad)}</div>
          <div style={{ ...TYP.tal, marginTop: AVSTAND.s }}>{m3(o.senaste.felM3)}</div>
          <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.s }}>
            {o.senaste.pct} % av {m3(o.senaste.volymM3)}
          </div>
          {o.staplar.length > 1 && <Staplar staplar={o.staplar} onManad={(m) => onAlla(m)} />}
        </section>
      ) : (
        <section style={{ ...KORT, marginBottom: AVSTAND.xl }}>
          <div style={{ ...TYP.text, color: FARG.text2 }}>
            Ingen avslutad trakt med apteringsmål ännu. Talet kommer när skördarens första HPR-fil med fördelningsmatris är inläst och trakten är klar.
          </div>
        </section>
      )}

      {o.hojdpunkt && (
        <Sektion rubrik="Höjdpunkt">
          <div style={{ padding: `${AVSTAND.m}px 0` }} data-hojdpunkt={o.hojdpunkt.riktning}>
            <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.meta, color: o.hojdpunkt.riktning === 'battre' ? FARG.gron : FARG.orange }}>
              <Ikon namn={o.hojdpunkt.riktning === 'battre' ? 'trending_down' : 'trending_up'} storlek={IKON.text} farg="inherit" />
              {o.hojdpunkt.riktning === 'battre' ? 'Bättre' : 'Sämre'}
            </div>
            <div style={{ ...TYP.text, marginTop: AVSTAND.xs }}>{o.hojdpunkt.mening}</div>
            <div style={{ ...TYP.meta, ...TNUM, color: FARG.text2, marginTop: AVSTAND.xs }}>{o.hojdpunkt.under}</div>
          </div>
        </Sektion>
      )}

      <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
        <Rad titel="Alla objekt" hoger={antalObjekt} onTryck={() => onAlla()} sista attr={{ 'data-alla': '' }} />
      </div>
    </>
  );
}

/* ─────────────────────────── Alla objekt ─────────────────────────── */

function ObjektRadVy({ r, onOppna, sista, dampad }: { r: ObjektRad; onOppna: (k: string) => void; sista?: boolean; dampad?: boolean }) {
  return (
    <Rad
      titel={r.namn}
      under={m3(r.volymM3)}
      hoger={r.pct == null ? '–' : <span style={{ color: r.hogt ? FARG.orange : undefined }}>{r.pct} %</span>}
      hogerUnder={r.felM3 == null ? 'inget mål' : `${r.hogt ? 'högt · ' : ''}${m3(r.felM3)} fel`}
      onTryck={() => onOppna(r.objectKey)}
      sista={sista}
      dampad={dampad}
      attr={{ 'data-objekt': r.objectKey }}
    />
  );
}

function SokFalt({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, background: FARG.fyllning, borderRadius: RADIE.rad, padding: `0 ${AVSTAND.m}px`, marginBottom: AVSTAND.xl }}>
      <Ikon namn="search" storlek={IKON.text} />
      <input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder="Sök trakt" aria-label="Sök trakt"
        style={{ flex: 1, minWidth: 0, minHeight: TRAFFYTA.min, background: 'none', border: 'none', outline: 'none', color: FARG.text, ...TYP.text, fontFamily: 'inherit', padding: 0, colorScheme: 'dark' }} />
    </label>
  );
}

export function AllaObjektVy({ kort, vantar, status, startManad, onTillbaka, onOppna, onAvsluta }: {
  kort: ObjektKort[];
  vantar: VantandeObjekt[];
  status: string | null;
  startManad: string | null;
  onTillbaka: () => void;
  onOppna: (k: string) => void;
  onAvsluta: (k: string) => Promise<void>;
}) {
  const [sok, setSok] = useState('');
  const [oppnaSma, setOppnaSma] = useState<Set<string>>(new Set());
  const [avslutar, setAvslutar] = useState<string | null>(null);
  const l = byggAllaObjekt(kort, sok);
  const nuManad = manadFor(new Date().toISOString());
  const q = sok.trim().toLocaleLowerCase('sv-SE');
  const vantarSynliga = vantar.filter((v) => !q || (v.objektNamn ?? '').toLocaleLowerCase('sv-SE').includes(q));
  const tomt = !l.pagar.length && !l.tysta.length && !l.manader.length && !vantarSynliga.length;

  // Ett tryck på en stapel öppnar listan vid sin månad.
  useEffect(() => {
    if (!startManad) return;
    document.getElementById(`manad-${startManad}`)?.scrollIntoView({ block: 'start' });
  }, [startManad]);

  return (
    <>
      <button type="button" onClick={onTillbaka} style={{ ...KNAPP.lank }}>‹ Aptering</button>
      <h1 style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.titel }}>Alla objekt</h1>
      <Statusrad text={status} />
      <SokFalt value={sok} onChange={setSok} />

      {l.pagar.length > 0 && (
        <Sektion rubrik="Pågår">
          {l.pagar.map((r, i) => (
            <Rad key={r.objectKey} titel={r.namn} under={`${m3(r.volymM3)} hittills`}
              hoger={r.pct != null && r.volymM3 >= SMA_M3 ? <span style={{ color: r.hogt ? FARG.orange : undefined }}>{r.pct} %</span> : undefined}
              onTryck={() => onOppna(r.objectKey)} sista={i === l.pagar.length - 1} attr={{ 'data-objekt': r.objectKey }} />
          ))}
        </Sektion>
      )}

      {l.tysta.length > 0 && (
        <Sektion rubrik="Ingen ny fil" not="Markera avslutad så räknas trakten in i sin månad.">
          {l.tysta.map((r, i) => (
            <Rad key={r.objectKey} titel={r.namn} under={`ingen ny fil på ${r.dagarSedanFil} dagar`}
              hoger={
                <button type="button" disabled={avslutar === r.objectKey}
                  onClick={async () => { setAvslutar(r.objectKey); try { await onAvsluta(r.objectKey); } finally { setAvslutar(null); } }}
                  style={{ ...KNAPP.sekundar, width: 'auto', ...TYP.meta, fontWeight: TYP.listtitel.fontWeight }} data-avsluta={r.objectKey}>
                  {avslutar === r.objectKey ? 'Markerar…' : 'Markera avslutad'}
                </button>
              }
              sista={i === l.tysta.length - 1} />
          ))}
        </Sektion>
      )}

      {l.manader.map((m) => {
        const oppen = oppnaSma.has(m.manad);
        const sistaRadArSma = m.sma.length > 0;
        return (
          <div key={m.manad} id={`manad-${m.manad}`} style={{ scrollMarginTop: AVSTAND.l }}>
            <Sektion rubrik={`${versal(manadNamn(m.manad, nuManad))}${m.pct != null ? ` · ${m.pct} % fel virke` : ''}`}>
              {m.rader.map((r, i) => (
                <ObjektRadVy key={r.objectKey} r={r} onOppna={onOppna} sista={!sistaRadArSma && i === m.rader.length - 1} />
              ))}
              {sistaRadArSma && (
                <>
                  <Rad titel={smaText(m.sma.length)} under="för lite timmer för att bedöma" dampad
                    onTryck={() => setOppnaSma((s) => { const n = new Set(s); if (n.has(m.manad)) n.delete(m.manad); else n.add(m.manad); return n; })}
                    hoger={<span style={{ display: 'inline-flex', transform: oppen ? 'rotate(90deg)' : undefined, transition: overgang('transform') }}><Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} /></span>}
                    pil={false} sista={!oppen} attr={{ 'data-sma': m.manad }} />
                  {oppen && m.sma.map((r, i) => <ObjektRadVy key={r.objectKey} r={r} onOppna={onOppna} dampad sista={i === m.sma.length - 1} />)}
                </>
              )}
            </Sektion>
          </div>
        );
      })}

      {vantarSynliga.length > 0 && (
        <Sektion rubrik="Räknas" not="Siffrorna räknas från stockarna. Det tar någon minut första gången.">
          {vantarSynliga.map((v, i) => (
            <Rad key={v.objectKey} titel={v.objektNamn ?? 'Okänt objekt'} hoger="Räknas…" dampad sista={i === vantarSynliga.length - 1} />
          ))}
        </Sektion>
      )}

      {tomt && (
        <p style={{ ...TYP.text, color: FARG.text2 }}>
          {q ? 'Ingen trakt heter så.' : 'Inga trakter med apteringsmål ännu. De kommer hit när skördarens HPR-fil med fördelningsmatris är inläst.'}
        </p>
      )}
    </>
  );
}
