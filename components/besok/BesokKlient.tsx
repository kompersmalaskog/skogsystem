'use client';

// Markägarens länk (/besok/<token>): öppen utan inloggning, telefon, svart iOS-stil. EN länk, TVÅ lägen efter NÄR man öppnar den (Martin 2026-11-10):
//  • MEDAN VI JOBBAR — "Ska du gå ut i skogen?": kartan med maskinerna och deras röda ringar, regeln under kartan, en rad per fara med VARFÖR
//    (lib/besok/sakerhet), vem man ringer och EN knapp "Anmäl besök" → anmälan → under besöket (vilka maskiner som sett det, "Jag har gått härifrån").
//    Inget om certifiering här, och inget "% klart".
//  • NÄR VI ÄR KLARA — "Varför ser det ut så här?": kartan och bara de rader som gäller trakten (lib/besok/skogen). Länken lever 60 dagar efter avslut.
//    Kommer man tillbaka till länken under ett pågående besök öppnas besöket direkt.
// Inga förarnamn, inga spår, inga volymer, ingen röta, inget klart-datum. Texterna står i lib/besok (sakerhet, skogen, status) — inte här.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { AVSTAND, FARG, KNAPP, KORT, RADIE, TNUM, TRAFFYTA, TYP, VY_ROT, designCss, medSafeBotten, INAKTIV, IKON } from '@/lib/design/tokens';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Flikkontroll from '@/components/design/Flikkontroll';
import { MalbildBild } from '@/components/malbild/Malbild';
import SkotarBild from './SkotarBild';
import type { KartaData } from './BesokKarta';
import { PRICK_FARG } from '@/lib/besok/farg';
import { HUVUDREGEL, RINGREGEL, SKOTARARK_RUBRIK, SKOTARARK_TEXT, sakerhetsRader, type MaskinRoll } from '@/lib/besok/sakerhet';
import { arBesokAktivt, klockslag } from '@/lib/besok/tid';
import { VANTAR_TEXT, kvitteringsRader, maskinStatusRader } from '@/lib/besok/status';
import { arbetarRad, maskinAlder } from '@/lib/besok/maskinAlder';
import { CERT_FORKLARING, KARTA_UNGEFAR, type SkogRad } from '@/lib/besok/skogen';
import { malbildInnehall } from '@/lib/malbilder';
import { PUBLIK_POLL_MS } from '@/lib/besok/konstanter';

const BesokKarta = dynamic(() => import('./BesokKarta'), { ssr: false, loading: () => <div style={{ height: 300, borderRadius: RADIE.kort, background: FARG.kort }} /> });

type Pos = { lat: number; lng: number };
type Vy = {
  ok: true;
  /** pagar = maskinerna arbetar · klar = objektet avslutat ("Varför ser det ut så här?"). */
  lage?: 'pagar' | 'klar';
  klarDatum?: string | null;
  gallring?: boolean;
  namn: string;
  utforare: string;
  framsteg: { procent: number | null; klartCa: string | null; text: string | null; forklaring?: string | null };
  gran: [number, number][][] | null;
  mitt: Pos | null;
  maskiner: { roll: MaskinRoll; lat: number; lng: number; tid: string }[];
  roller: MaskinRoll[];
  motorsag: Pos[];
  harMotorsag: boolean;
  ringM: { skordare: number; skotare: number; motorsag: number };
  uppdaterad: string;
  besok: { id: string; besokstid: string; gatt?: string | null; kvitteringar: { roll: MaskinRoll; tid: string }[]; maskiner?: { etikett: string; roll: MaskinRoll; tid: string | null }[] } | null;
  skog?: { intro: string | null; rader: SkogRad[]; prickar: (Pos & { typ: 'evighetstrad' | 'hogstubbe' })[]; kantzon: [number, number][][]; ved: { text: string; plats: Pos | null } | null };
  ring?: { namn: string; telefon: string } | null;
};
type Slut = { fel: string; status: number };
/** skog = sidan (medan vi jobbar eller när vi är klara) · anmal/under = besökets två steg. */
export type Lage = 'skog' | 'anmal' | 'under';

const lagringsNyckel = (token: string) => `besok_anmalan_v1:${token}`;
const lasAnmalan = (token: string): string | null => { try { const j = JSON.parse(localStorage.getItem(lagringsNyckel(token)) || 'null'); return typeof j?.id === 'string' ? j.id : null; } catch { return null; } };
const sparaAnmalan = (token: string, id: string) => { try { localStorage.setItem(lagringsNyckel(token), JSON.stringify({ id })); } catch { /* privat läge: anmälan visas tills sidan laddas om */ } };
const glomAnmalan = (token: string) => { try { localStorage.removeItem(lagringsNyckel(token)); } catch { /* ingen lagring */ } };

/** Pågår besöket? Anmält, inte gått härifrån och inom besökstiden + eftertiden. */
export const besokPagar = (b: Vy['besok'], nu: Date = new Date()): boolean => !!b && !b.gatt && arBesokAktivt(b.besokstid, nu);

const Ikon = ({ namn, storlek = IKON.rad, farg }: { namn: string; storlek?: number; farg?: string }) => (
  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: storlek, color: farg, flexShrink: 0 }}>{namn}</span>
);

const ROT: React.CSSProperties = { ...VY_ROT, maxWidth: 560, margin: '0 auto' };
const TOPP = `calc(env(safe-area-inset-top, 0px) + ${AVSTAND.xl}px)`;
const TOPP_TILLBAKA = `calc(env(safe-area-inset-top, 0px) + ${AVSTAND.s}px)`;
const radStil = (forsta: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, background: 'transparent', border: 'none', borderTop: forsta ? 'none' : `1px solid ${FARG.linje}`, color: FARG.text, textAlign: 'left', fontFamily: 'inherit', boxSizing: 'border-box' });
const Rubrik = ({ children }: { children: React.ReactNode }) => <h2 style={{ margin: `${AVSTAND.xl}px 0 ${AVSTAND.s}px`, ...TYP.rubrik }}>{children}</h2>;

function Tillbaka({ text, onClick }: { text: string; onClick: () => void }) {
  return <button type="button" data-testid="besok-tillbaka" onClick={onClick} style={{ ...KNAPP.lank, paddingLeft: 0, minHeight: TRAFFYTA.min }}>‹ {text}</button>;
}

function FastKnapp({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.m)}`, background: 'linear-gradient(to top, #000 70%, rgba(0,0,0,0))' }}>
      <div style={{ maxWidth: 560, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>{children}</div>
    </div>
  );
}

export default function BesokKlient({ token }: { token: string }) {
  const [vy, setVy] = useState<Vy | null>(null);
  const [slut, setSlut] = useState<Slut | null>(null);
  const [besokId, setBesokId] = useState<string | null>(null);
  const [lage, setLage] = useState<Lage>('skog');
  const [skotarArk, setSkotarArk] = useState(false);
  const [rad, setRad] = useState<SkogRad | null>(null);
  const [certArk, setCertArk] = useState(false);
  const [kvitto, setKvitto] = useState<string | null>(null);
  const startBeslut = useRef(false);

  useEffect(() => { setBesokId(lasAnmalan(token)); }, [token]);

  const las = useCallback(async () => {
    try {
      const r = await fetch(`/api/besok/${token}${besokId ? `?besok=${besokId}` : ''}`, { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok) { setVy(j as Vy); setSlut(null); return; }
      if (r.status === 404 || r.status === 410) { setSlut({ fel: j?.fel ?? 'Länken gäller inte längre', status: r.status }); return; }
    } catch { /* nät saknas: behåll det som visas */ }
  }, [token, besokId]);

  useEffect(() => {
    let avbruten = false;
    las();
    const id = setInterval(() => { if (!avbruten && document.visibilityState === 'visible') las(); }, PUBLIK_POLL_MS);
    return () => { avbruten = true; clearInterval(id); };
  }, [las]);

  // Kommer man tillbaka till länken under ett pågående besök: steg 3 direkt (en gång, när anmälan är läst).
  useEffect(() => {
    if (startBeslut.current || !vy || !besokId) return;
    if (vy.besok?.id !== besokId) return;
    startBeslut.current = true;
    if (besokPagar(vy.besok)) setLage('under');
  }, [vy, besokId]);

  if (slut) {
    return (
      <div style={{ ...VY_ROT, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: AVSTAND.m, minHeight: '100vh' }}>
        <style>{designCss}</style>
        <h1 style={{ margin: 0, ...TYP.titel }}>{slut.status === 410 ? 'Arbetet är klart' : 'Länken finns inte'}</h1>
        <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>{slut.status === 410 ? 'Länken gäller inte längre. Tack för att du följt arbetet.' : 'Kontrollera länken du fick av Kompersmåla Skog.'}</p>
      </div>
    );
  }
  if (!vy) {
    return (
      <div style={{ ...VY_ROT, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <style>{designCss}</style>
        <span style={{ ...TYP.text, color: FARG.text2 }}>Hämtar läget på trakten …</span>
      </div>
    );
  }

  const pagar = besokPagar(vy.besok);
  let sida: React.ReactNode;
  if (vy.lage === 'klar') sida = <KlarVy vy={vy} token={token} onRad={setRad} onCert={() => setCertArk(true)} />;
  else if (lage === 'anmal') sida = <AnmalSteg token={token} onTillbaka={() => setLage('skog')} onSkickat={(id) => { sparaAnmalan(token, id); startBeslut.current = true; setBesokId(id); setLage('under'); }} />;
  else if (lage === 'under') sida = <UnderSteg vy={vy} token={token} onTillbaka={() => setLage('skog')} onGatt={() => { glomAnmalan(token); setBesokId(null); setLage('skog'); setKvitto('Tack! Förarna vet att du har gått.'); }} />;
  else sida = <PagarVy vy={vy} token={token} pagar={pagar} kvitto={kvitto} onBesok={() => { setKvitto(null); setLage(pagar ? 'under' : 'anmal'); }} onSkotare={() => setSkotarArk(true)} />;

  return (
    <>
      <style>{designCss}</style>
      {sida}
      {skotarArk && (
        <Ark rubrik={SKOTARARK_RUBRIK} stang="Klar" onStang={() => setSkotarArk(false)}>
          <div data-testid="besok-skotarark">
            <SkotarBild />
            <p style={{ margin: `${AVSTAND.l}px 0 ${AVSTAND.m}px`, ...TYP.kommentar }}>{SKOTARARK_TEXT}</p>
          </div>
        </Ark>
      )}
      {rad && <SkogArk rad={rad} vy={vy} token={token} onStang={() => setRad(null)} />}
      {certArk && (
        <Ark rubrik={CERT_FORKLARING.rubrik} stang="Klar" onStang={() => setCertArk(false)}>
          <div data-testid="besok-certark" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m, paddingBottom: AVSTAND.m }}>
            {CERT_FORKLARING.text.map((t) => <p key={t} style={{ margin: 0, ...TYP.text }}>{t}</p>)}
          </div>
        </Ark>
      )}
    </>
  );
}

// ---- MEDAN VI JOBBAR: "Ska du gå ut i skogen?" -----------------------------------------------------------------------------------------------

function PagarVy({ vy, token, pagar, kvitto, onBesok, onSkotare }: { vy: Vy; token: string; pagar: boolean; kvitto: string | null; onBesok: () => void; onSkotare: () => void }) {
  const rader = useMemo(() => sakerhetsRader({ roller: vy.roller, harMotorsag: vy.harMotorsag }), [vy.roller, vy.harMotorsag]);
  // Prickarnas ålder räknas om var 15:e sekund även när läsningen inte når fram – en prick får inte stå som "nu" för att nätet försvann.
  const [nuMs, setNuMs] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNuMs(Date.now()), PUBLIK_POLL_MS); return () => clearInterval(t); }, []);
  const maskiner = useMemo(() => vy.maskiner.map((m) => { const a = maskinAlder(m.tid, new Date(nuMs)); return { roll: m.roll, lat: m.lat, lng: m.lng, alder: a.text, gammal: a.gammal }; }), [vy.maskiner, nuMs]);
  const karta: KartaData = useMemo(() => ({ token, mitt: vy.mitt, gran: vy.gran, maskiner, motorsag: vy.motorsag, ringM: vy.ringM }), [token, vy.mitt, vy.gran, maskiner, vy.motorsag, vy.ringM]);
  const arbetar = arbetarRad(vy.maskiner.map((m) => m.tid), new Date(nuMs));
  return (
    <div data-testid="besok-sida" data-lage="pagar" style={{ ...ROT, paddingBottom: medSafeBotten(96) }}>
      <header style={{ paddingTop: TOPP }}>
        <div data-testid="besok-namn" style={{ ...TYP.meta, color: FARG.text2 }}>{vy.namn} · {vy.utforare}</div>
        <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel }}>Ska du gå ut i skogen?</h1>
      </header>

      {kvitto && <div data-testid="besok-kvitto" role="status" style={{ ...KORT, marginTop: AVSTAND.l, ...TYP.listtitel, color: FARG.gron }}>✓ {kvitto}</div>}

      {arbetar && (
        <div data-testid="besok-arbetar" data-farsk={arbetar.farsk ? '1' : '0'} style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.s, marginTop: AVSTAND.l, ...TYP.listtitel, color: arbetar.farsk ? FARG.gul : FARG.text2 }}>
          <span aria-hidden="true" style={{ width: AVSTAND.s + 2, height: AVSTAND.s + 2, borderRadius: '50%', background: arbetar.farsk ? FARG.gul : FARG.text3, flexShrink: 0 }} />
          {arbetar.text}
        </div>
      )}

      <section style={{ marginTop: AVSTAND.m }}>
        <BesokKarta data={karta} hojd={280} />
        <div data-testid="besok-ringregel" style={{ display: 'flex', gap: AVSTAND.s, alignItems: 'flex-start', marginTop: AVSTAND.s, ...TYP.text }}>
          <span aria-hidden="true" style={{ width: AVSTAND.m, height: AVSTAND.m, marginTop: AVSTAND.xs, borderRadius: '50%', border: `2px dashed ${FARG.rod}`, flexShrink: 0, boxSizing: 'border-box' }} />
          <span>{RINGREGEL}</span>
        </div>
      </section>

      <section data-testid="besok-har-just-nu" style={{ marginTop: AVSTAND.l, background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
        {rader.map((r, i) => {
          const inre = (
            <>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', ...TYP.listtitel }}>{r.rubrik}</span>
                <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{r.text}</span>
              </span>
              {r.ark && <Ikon namn="chevron_right" farg={FARG.text3} />}
            </>
          );
          return r.ark
            ? <button key={r.id} type="button" data-testid={`besok-rad-${r.id}`} onClick={onSkotare} style={{ ...radStil(i === 0), cursor: 'pointer' }}>{inre}</button>
            : <div key={r.id} data-testid={`besok-rad-${r.id}`} style={radStil(i === 0)}>{inre}</div>;
        })}
      </section>

      {vy.ring && <RingRad ring={vy.ring} />}

      <FastKnapp>
        <button type="button" data-testid="besok-kommer" onClick={onBesok} style={KNAPP.primar}>{pagar ? 'Ditt besök' : 'Anmäl besök'}</button>
      </FastKnapp>
    </div>
  );
}

function RingRad({ ring }: { ring: { namn: string; telefon: string } }) {
  return (
    <section data-testid="besok-ring" style={{ ...KORT, marginTop: AVSTAND.l, display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
      <Ikon namn="call" farg={FARG.text} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', ...TYP.listtitel }}>Ring {ring.namn}</span>
        <a href={`tel:${ring.telefon.replace(/[^\d+]/g, '')}`} style={{ ...TYP.meta, color: FARG.text2, ...TNUM, userSelect: 'text' }}>{ring.telefon}</a>
      </span>
    </section>
  );
}

// ---- NÄR VI ÄR KLARA: "Varför ser det ut så här?" -------------------------------------------------------------------------------------------

const klarDag = (iso: string | null | undefined): string | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', timeZone: 'Europe/Stockholm' }).format(new Date(t)).replace('.', '') : null;
};

function KlarVy({ vy, token, onRad, onCert }: { vy: Vy; token: string; onRad: (r: SkogRad) => void; onCert: () => void }) {
  const skog = vy.skog;
  const karta: KartaData = useMemo(() => ({ token, mitt: vy.mitt, gran: vy.gran, maskiner: [], motorsag: [], ringM: vy.ringM, prickar: skog?.prickar ?? [], kantzon: skog?.kantzon ?? [], ved: skog?.ved?.plats ?? null }), [token, vy.mitt, vy.gran, vy.ringM, skog]);
  const harEv = (skog?.prickar ?? []).some((p) => p.typ === 'evighetstrad');
  const harHs = (skog?.prickar ?? []).some((p) => p.typ === 'hogstubbe');
  const harKz = (skog?.kantzon ?? []).length > 0;
  const rader = skog?.rader ?? [];
  const dag = klarDag(vy.klarDatum);
  return (
    <div data-testid="besok-sida" data-lage="klar" style={{ ...ROT, paddingBottom: medSafeBotten(AVSTAND.xxl) }}>
      <header style={{ paddingTop: TOPP }}>
        <div data-testid="besok-namn" style={{ ...TYP.meta, color: FARG.text2 }}>{vy.namn}{dag ? ` · klar ${dag}` : ' · klar'}</div>
        <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel }}>Varför ser det ut så här?</h1>
      </header>

      <section style={{ marginTop: AVSTAND.l }}>
        <BesokKarta data={karta} hojd={280} />
        <div data-testid="besok-forklaring" style={{ display: 'flex', flexWrap: 'wrap', gap: `${AVSTAND.xs}px ${AVSTAND.l}px`, marginTop: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
          {vy.gran && <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}><span aria-hidden="true" style={{ width: AVSTAND.l, height: 2, background: FARG.text }} />Din trakt</span>}
          {harEv && <Tecken farg={PRICK_FARG.evighetstrad} text="Evighetsträd" />}
          {harHs && <Tecken farg={PRICK_FARG.hogstubbe} text="Högstubbar" />}
          {harKz && <Tecken farg={FARG.bla} text="Kantzon" />}
          {(harEv || harHs) && <span>{KARTA_UNGEFAR}</span>}
        </div>
      </section>

      {rader.length > 0 && (
        <section data-testid="besok-skogen" style={{ marginTop: AVSTAND.l, background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
          {rader.map((r, i) => (
            <button key={r.id} type="button" data-testid={`besok-skograd-${r.id}`} onClick={() => onRad(r)} style={{ ...radStil(i === 0), cursor: 'pointer' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', ...TYP.listtitel }}>{r.namn}</span>
                <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{r.varfor}</span>
              </span>
              {r.varde && <span style={{ ...TYP.listtitel, ...TNUM, whiteSpace: 'nowrap' }}>{r.varde}</span>}
              <Ikon namn="chevron_right" farg={FARG.text3} />
            </button>
          ))}
          {!vy.gallring && skog?.intro && (
            <button type="button" data-testid="besok-cert" onClick={onCert} style={{ ...radStil(false), cursor: 'pointer' }}>
              <span style={{ flex: 1, minWidth: 0, ...TYP.text, color: FARG.text2 }}>{CERT_FORKLARING.rubrik}</span>
              <Ikon namn="chevron_right" farg={FARG.text3} />
            </button>
          )}
        </section>
      )}

      {skog?.ved && (
        <section data-testid="besok-ved" style={{ ...KORT, marginTop: AVSTAND.l }}>
          <div style={{ ...TYP.listtitel }}>Din ved</div>
          <div style={{ ...TYP.text, marginTop: AVSTAND.xs }}>{skog.ved.text}</div>
          {skog.ved.plats && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Platsen står på kartan</div>}
        </section>
      )}

      {vy.ring && <div data-testid="besok-ring" style={{ marginTop: AVSTAND.xl, textAlign: 'center', ...TYP.meta, color: FARG.text2 }}>Frågor? Ring {vy.ring.namn} · <a href={`tel:${vy.ring.telefon.replace(/[^\d+]/g, '')}`} style={{ color: FARG.text2, ...TNUM, userSelect: 'text' }}>{vy.ring.telefon}</a></div>}
    </div>
  );
}

function Tecken({ farg, text }: { farg: string; text: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}><span aria-hidden="true" style={{ width: AVSTAND.s + 2, height: AVSTAND.s + 2, borderRadius: '50%', background: farg }} />{text}</span>;
}

/** Arket bakom en rad: tecknad bild (bara "Så ska det se ut"), förklaringen, kravet dämpat och kartan med bara den saken. */
function SkogArk({ rad, vy, token, onStang }: { rad: SkogRad; vy: Vy; token: string; onStang: () => void }) {
  const bild = rad.malbild ? malbildInnehall(rad.malbild, null)?.bild ?? null : null;
  const skog = vy.skog;
  const karta: KartaData | null = useMemo(() => {
    if (!rad.karta || !skog) return null;
    const prickar = rad.id === 'evighetstrad' || rad.id === 'hogstubbe' ? skog.prickar.filter((p) => p.typ === rad.id) : [];
    const kantzon = rad.id === 'kantzon' ? skog.kantzon : [];
    return { token, mitt: vy.mitt, gran: vy.gran, maskiner: [], motorsag: [], ringM: vy.ringM, prickar, kantzon, ved: null };
  }, [rad, skog, token, vy.mitt, vy.gran, vy.ringM]);
  return (
    <Ark rubrik={rad.namn} stang="Klar" onStang={onStang}>
      <div data-testid={`besok-skogark-${rad.id}`} style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m, paddingBottom: AVSTAND.m }}>
        {bild && <MalbildBild svg={bild} testid="besok-skogark-bild" />}
        <p style={{ margin: 0, ...TYP.text }}>{rad.forklaring}</p>
        {rad.krav && <div style={{ ...TYP.meta, color: FARG.text2 }}>{rad.krav}</div>}
        {rad.varde && <div style={{ ...TYP.listtitel, ...TNUM }}>På din trakt: {rad.varde}</div>}
        {karta && (
          <>
            <BesokKarta data={karta} hojd={240} />
            {rad.id !== 'kantzon' && <div style={{ ...TYP.meta, color: FARG.text2 }}>{KARTA_UNGEFAR}</div>}
          </>
        )}
      </div>
    </Ark>
  );
}

// ---- BESÖKET, STEG 2: ANMÄLAN --------------------------------------------------------------------------------------------------------------

function AnmalSteg({ token, onTillbaka, onSkickat }: { token: string; onTillbaka: () => void; onSkickat: (id: string) => void }) {
  const [nar, setNar] = useState<'nu' | 'om1h' | 'tid'>('nu');
  const [tid, setTid] = useState('');
  const [namn, setNamn] = useState('');
  const [tel, setTel] = useState('');
  const [skickar, setSkickar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const klar = namn.trim().length > 0 && tel.replace(/\D/g, '').length >= 6 && (nar !== 'tid' || /^\d{1,2}:\d{2}$/.test(tid));

  async function skicka() {
    if (!klar || skickar) return;
    setSkickar(true); setFel(null);
    try {
      const r = await fetch(`/api/besok/${token}/anmal`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ namn, telefon: tel, nar, tid: nar === 'tid' ? tid : undefined }) });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok && typeof j.id === 'string') { onSkickat(j.id); return; }
      setFel(typeof j?.fel === 'string' ? j.fel : 'Det gick inte att skicka just nu. Försök igen.');
    } catch {
      setFel('Ingen täckning just nu. Försök igen när du har nät.');
    }
    setSkickar(false);
  }

  return (
    <div data-testid="besok-steg-anmal" style={{ ...ROT, paddingBottom: medSafeBotten(140) }}>
      <div style={{ paddingTop: TOPP_TILLBAKA }}><Tillbaka text="Tillbaka" onClick={onTillbaka} /></div>
      <h1 style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.titel }}>Anmäl besök</h1>
      <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.xs }}>När kommer du?</div>
      <Flikkontroll flikar={[['nu', 'Nu'], ['om1h', 'Om 1 h'], ['tid', 'Välj tid']] as const} aktiv={nar} onVal={setNar} />
      {nar === 'tid' && (
        <div style={{ marginTop: AVSTAND.m }}>
          <Falt etikett="Klockslag" typ="time" value={tid} onChange={setTid} />
        </div>
      )}
      <div style={{ height: AVSTAND.l }} />
      <Falt etikett="Ditt namn" value={namn} onChange={setNamn} />
      <Falt etikett="Ditt telefonnummer" typ="tel" value={tel} onChange={setTel} stod="Så kan föraren nå dig om något ändras." />
      <FastKnapp>
        {fel && <div role="alert" style={{ ...TYP.text, color: FARG.rod }}>{fel}</div>}
        <button type="button" data-testid="besok-skicka" onClick={skicka} style={{ ...KNAPP.primar, ...(klar && !skickar ? null : INAKTIV) }}>{skickar ? 'Skickar …' : 'Skicka till maskinerna'}</button>
      </FastKnapp>
    </div>
  );
}

// ---- BESÖKET, STEG 3: UNDER BESÖKET --------------------------------------------------------------------------------------------------------

function UnderSteg({ vy, token, onTillbaka, onGatt }: { vy: Vy; token: string; onTillbaka: () => void; onGatt: () => void }) {
  const [skickar, setSkickar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const anmalan = vy.besok;
  const kv = anmalan ? kvitteringsRader(anmalan.kvitteringar) : [];
  const maskinRader = anmalan?.maskiner?.length ? maskinStatusRader(anmalan.maskiner) : [];

  async function gatt() {
    if (!anmalan || skickar) return;
    setSkickar(true); setFel(null);
    try {
      const r = await fetch(`/api/besok/${token}/gatt`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: anmalan.id }) });
      const j = await r.json().catch(() => null);
      if (r.ok && j?.ok) { onGatt(); return; }
      setFel(typeof j?.fel === 'string' ? j.fel : 'Det gick inte att skicka just nu. Försök igen.');
    } catch {
      setFel('Ingen täckning just nu. Försök igen när du har nät.');
    }
    setSkickar(false);
  }

  return (
    <div data-testid="besok-steg-under" style={{ ...ROT, paddingBottom: medSafeBotten(150) }}>
      <div style={{ paddingTop: TOPP_TILLBAKA }}><Tillbaka text="Tillbaka" onClick={onTillbaka} /></div>
      <h1 style={{ margin: 0, ...TYP.titel }}>Ditt besök</h1>
      {anmalan && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, ...TNUM }}>Anmält · kommer {klockslag(anmalan.besokstid)}</div>}

      <section data-testid="besok-anmalan" style={{ ...KORT, marginTop: AVSTAND.l }}>
        {!anmalan
          ? <div style={{ ...TYP.text, color: FARG.text2 }}>Hämtar …</div>
          : maskinRader.length > 0
            ? (
              <div data-testid="besok-maskinrader" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
                {maskinRader.map((r) => (
                  <div key={r.text} data-testid={r.sett ? 'besok-kvittens' : 'besok-ej-sett'} style={{ ...TYP.listtitel, color: r.sett ? FARG.gron : FARG.orange }}>{r.text}</div>
                ))}
              </div>
            )
            : kv.length === 0
              ? <div data-testid="besok-vantar" style={{ ...TYP.listtitel }}>{VANTAR_TEXT}</div>
              : <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>{kv.map((t) => <div key={t} data-testid="besok-kvittens" style={{ ...TYP.listtitel, color: FARG.gron }}>{t}</div>)}</div>}
      </section>

      <div style={{ ...KORT, marginTop: AVSTAND.l, display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
        <Ikon namn="front_hand" farg={FARG.text} />
        <span style={{ ...TYP.text }}>{HUVUDREGEL.rubrik}</span>
      </div>

      {vy.ring && <RingRad ring={vy.ring} />}

      <FastKnapp>
        {fel && <div role="alert" style={{ ...TYP.text, color: FARG.rod }}>{fel}</div>}
        <button type="button" data-testid="besok-gatt" onClick={gatt} style={{ ...KNAPP.primar, ...(anmalan && !skickar ? null : INAKTIV) }}>{skickar ? 'Skickar …' : 'Jag har gått härifrån'}</button>
        <div style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center' }}>Då vet förarna att du har gått</div>
      </FastKnapp>
    </div>
  );
}
