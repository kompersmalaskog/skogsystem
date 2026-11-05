'use client';

// Markägarens länk (/besok/<token>): öppen utan inloggning, telefon, svart iOS-stil. EN länk, TVÅ delar (Martin 2026-11-05):
//  • DIN SKOG — sidan man kommer tillbaka till: traktnamn, "% klart", kartan med evighetsträd/högstubbar/kantzon (aldrig maskiner), "Därför står träden kvar"
//    (bara certifierade, bara rader som gäller trakten, tryck = ark med "Så ska det se ut"), Din ved, och knappen "Jag kommer på besök".
//  • BESÖKET i tre steg: (1) säkerhet + "Jag har läst", (2) anmälan, (3) under besöket: vilka maskiner som sett det, vem man ringer, "Jag har gått härifrån".
//    Kommer man tillbaka till länken under ett pågående besök öppnas steg 3 direkt.
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
import { HUVUDREGEL, SKOTARARK_RUBRIK, SKOTARARK_TEXT, sakerhetsRader, type MaskinRoll } from '@/lib/besok/sakerhet';
import { arBesokAktivt, klockslag } from '@/lib/besok/tid';
import { VANTAR_TEXT, kvitteringsRader, maskinStatusRader } from '@/lib/besok/status';
import { CERT_FORKLARING, HITTILLS_TEXT, KARTA_UNGEFAR, type SkogRad } from '@/lib/besok/skogen';
import { malbildInnehall } from '@/lib/malbilder';
import { PUBLIK_POLL_MS } from '@/lib/besok/konstanter';

const BesokKarta = dynamic(() => import('./BesokKarta'), { ssr: false, loading: () => <div style={{ height: 300, borderRadius: RADIE.kort, background: FARG.kort }} /> });

type Pos = { lat: number; lng: number };
type Vy = {
  ok: true;
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
/** skog = Din skog · sakerhet/anmal/under = besökets tre steg. */
export type Lage = 'skog' | 'sakerhet' | 'anmal' | 'under';

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
  if (lage === 'sakerhet') sida = <SakerhetSteg vy={vy} token={token} onTillbaka={() => setLage('skog')} onVidare={() => setLage('anmal')} onSkotare={() => setSkotarArk(true)} />;
  else if (lage === 'anmal') sida = <AnmalSteg token={token} onTillbaka={() => setLage('sakerhet')} onSkickat={(id) => { sparaAnmalan(token, id); startBeslut.current = true; setBesokId(id); setLage('under'); }} />;
  else if (lage === 'under') sida = <UnderSteg vy={vy} token={token} onTillbaka={() => setLage('skog')} onGatt={() => { glomAnmalan(token); setBesokId(null); setLage('skog'); setKvitto('Tack! Förarna vet att du har gått.'); }} />;
  else sida = <DinSkog vy={vy} token={token} pagar={pagar} kvitto={kvitto} onBesok={() => { setKvitto(null); setLage(pagar ? 'under' : 'sakerhet'); }} onRad={setRad} onCert={() => setCertArk(true)} />;

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

// ---- DIN SKOG -------------------------------------------------------------------------------------------------------------------------------

function DinSkog({ vy, token, pagar, kvitto, onBesok, onRad, onCert }: { vy: Vy; token: string; pagar: boolean; kvitto: string | null; onBesok: () => void; onRad: (r: SkogRad) => void; onCert: () => void }) {
  const skog = vy.skog;
  const arbetar = vy.maskiner.length > 0;
  const karta: KartaData = useMemo(() => ({ token, mitt: vy.mitt, gran: vy.gran, maskiner: [], motorsag: [], ringM: vy.ringM, prickar: skog?.prickar ?? [], kantzon: skog?.kantzon ?? [], ved: skog?.ved?.plats ?? null }), [token, vy.mitt, vy.gran, vy.ringM, skog]);
  const harEv = (skog?.prickar ?? []).some((p) => p.typ === 'evighetstrad');
  const harHs = (skog?.prickar ?? []).some((p) => p.typ === 'hogstubbe');
  const harKz = (skog?.kantzon ?? []).length > 0;

  return (
    <div data-testid="besok-sida" style={{ ...ROT, paddingBottom: medSafeBotten(96) }}>
      <header style={{ paddingTop: TOPP }}>
        <h1 data-testid="besok-namn" style={{ margin: 0, ...TYP.titel }}>{vy.namn}</h1>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{vy.utforare}</div>
      </header>

      {kvitto && <div data-testid="besok-kvitto" role="status" style={{ ...KORT, marginTop: AVSTAND.l, ...TYP.listtitel, color: FARG.gron }}>✓ {kvitto}</div>}

      {/* Bara medan maskinerna arbetar: en gul rad som leder till besöket. */}
      {arbetar && !pagar && (
        <button type="button" data-testid="besok-arbetar" onClick={onBesok}
          style={{ ...radStil(true), marginTop: AVSTAND.l, background: FARG.gul, color: FARG.bg, borderRadius: RADIE.kort, cursor: 'pointer' }}>
          <Ikon namn="warning" farg={FARG.bg} />
          <span style={{ flex: 1, minWidth: 0, ...TYP.listtitel }}>Maskiner arbetar här – anmäl dig innan du går ut</span>
          <Ikon namn="chevron_right" farg={FARG.bg} />
        </button>
      )}

      {vy.framsteg.procent != null && (
        <section style={{ marginTop: AVSTAND.l }}>
          <div data-testid="besok-framsteg" style={{ ...TYP.listtitel, ...TNUM }}>{vy.framsteg.procent} % klart</div>
          <div aria-hidden="true" style={{ height: AVSTAND.xs, borderRadius: RADIE.stapel, background: FARG.fyllning, marginTop: AVSTAND.s, overflow: 'hidden' }}>
            <div style={{ width: `${vy.framsteg.procent}%`, height: '100%', background: FARG.text }} />
          </div>
        </section>
      )}

      <section style={{ marginTop: AVSTAND.l }}>
        <BesokKarta data={karta} hojd={300} />
        {(harEv || harHs || harKz) && (
          <div data-testid="besok-forklaring" style={{ display: 'flex', flexWrap: 'wrap', gap: `${AVSTAND.xs}px ${AVSTAND.l}px`, marginTop: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
            {harEv && <Tecken farg={PRICK_FARG.evighetstrad} text="Evighetsträd" />}
            {harHs && <Tecken farg={PRICK_FARG.hogstubbe} text="Högstubbar" />}
            {harKz && <Tecken farg={FARG.bla} text="Kantzon" />}
            {(harEv || harHs) && <span>{KARTA_UNGEFAR}</span>}
          </div>
        )}
      </section>

      {skog && skog.rader.length > 0 && (
        <section data-testid="besok-skogen">
          <Rubrik>Därför står träden kvar</Rubrik>
          {skog.intro && <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text }}>{skog.intro}</p>}
          <div style={{ ...TYP.meta, color: FARG.text2, marginBottom: AVSTAND.s }}>{HITTILLS_TEXT}</div>
          <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
            {skog.rader.map((r, i) => (
              <button key={r.id} type="button" data-testid={`besok-skograd-${r.id}`} onClick={() => onRad(r)} style={{ ...radStil(i === 0), cursor: 'pointer' }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', ...TYP.listtitel }}>{r.namn}</span>
                  <span style={{ display: 'block', ...TYP.meta, color: FARG.text2 }}>{r.varfor}</span>
                </span>
                {r.varde && <span style={{ ...TYP.listtitel, ...TNUM, whiteSpace: 'nowrap' }}>{r.varde}</span>}
                <Ikon namn="chevron_right" farg={FARG.text3} />
              </button>
            ))}
            <button type="button" data-testid="besok-cert" onClick={onCert} style={{ ...radStil(false), cursor: 'pointer' }}>
              <span style={{ flex: 1, minWidth: 0, ...TYP.text }}>{CERT_FORKLARING.rubrik}</span>
              <Ikon namn="chevron_right" farg={FARG.text3} />
            </button>
          </div>
        </section>
      )}

      {skog?.ved && (
        <section data-testid="besok-ved">
          <Rubrik>Din ved</Rubrik>
          <div style={{ ...KORT, ...TYP.text }}>
            {skog.ved.text}
            {skog.ved.plats && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Platsen står på kartan</div>}
          </div>
        </section>
      )}

      <FastKnapp>
        <button type="button" data-testid="besok-kommer" onClick={onBesok} style={KNAPP.primar}>{pagar ? 'Ditt besök' : 'Jag kommer på besök'}</button>
      </FastKnapp>
    </div>
  );
}

function Tecken({ farg, text }: { farg: string; text: string }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }}><span aria-hidden="true" style={{ width: AVSTAND.s + 2, height: AVSTAND.s + 2, borderRadius: '50%', background: farg }} />{text}</span>;
}

/** Arket bakom en rad i "Därför står träden kvar": tecknad bild (bara "Så ska det se ut"), förklaringen, kravet dämpat och kartan med bara den saken. */
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
        <div style={{ ...TYP.meta, color: FARG.text2 }}>{rad.krav}</div>
        {rad.varde && <div style={{ ...TYP.listtitel, ...TNUM }}>Hittills {rad.varde}</div>}
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

// ---- BESÖKET, STEG 1: SÄKERHET --------------------------------------------------------------------------------------------------------------

function SakerhetSteg({ vy, token, onTillbaka, onVidare, onSkotare }: { vy: Vy; token: string; onTillbaka: () => void; onVidare: () => void; onSkotare: () => void }) {
  const [last, setLast] = useState(false);
  const rader = useMemo(() => sakerhetsRader({ roller: vy.roller, harMotorsag: vy.harMotorsag }), [vy.roller, vy.harMotorsag]);
  const karta: KartaData = useMemo(() => ({ token, mitt: vy.mitt, gran: vy.gran, maskiner: vy.maskiner, motorsag: vy.motorsag, ringM: vy.ringM }), [token, vy.mitt, vy.gran, vy.maskiner, vy.motorsag, vy.ringM]);
  return (
    <div data-testid="besok-steg-sakerhet" style={{ ...ROT, paddingBottom: medSafeBotten(96) }}>
      <div style={{ paddingTop: TOPP_TILLBAKA }}><Tillbaka text="Din skog" onClick={onTillbaka} /></div>
      <div style={{ ...TYP.meta, color: FARG.text2 }}>Steg 1 av 3</div>
      <h1 style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel }}>Innan du går ut</h1>

      <section data-testid="besok-huvudregel" style={{ marginTop: AVSTAND.l, background: FARG.text, color: FARG.bg, borderRadius: RADIE.kort, padding: AVSTAND.l }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m }}>
          <Ikon namn="front_hand" storlek={IKON.stor / 2} farg={FARG.bg} />
          <h2 style={{ margin: 0, ...TYP.rubrik }}>{HUVUDREGEL.rubrik}</h2>
        </div>
        <ol style={{ listStyle: 'none', margin: `${AVSTAND.m}px 0 0`, padding: 0, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          {HUVUDREGEL.steg.map((s, i) => (
            <li key={s} style={{ display: 'flex', gap: AVSTAND.m, alignItems: 'baseline', ...TYP.text }}>
              <span style={{ ...TYP.listtitel, minWidth: AVSTAND.l, ...TNUM }}>{i + 1}</span><span>{s}</span>
            </li>
          ))}
        </ol>
      </section>

      {rader.length > 0 && (
        <section data-testid="besok-har-just-nu" style={{ marginTop: AVSTAND.xl }}>
          <div style={{ ...TYP.micro, color: FARG.text2, marginBottom: AVSTAND.s }}>Här just nu</div>
          <div style={{ background: FARG.kort, borderRadius: RADIE.kort, overflow: 'hidden' }}>
            {rader.map((r, i) => {
              const inre = (
                <>
                  <Ikon namn={r.id === 'skotare' ? 'local_shipping' : r.id === 'skordare' ? 'forest' : 'carpenter'} farg={FARG.orange} />
                  <span style={{ flex: 1, minWidth: 0, ...TYP.text }}>{r.text}</span>
                  {r.ark && <Ikon namn="chevron_right" farg={FARG.text3} />}
                </>
              );
              return r.ark
                ? <button key={r.id} type="button" data-testid={`besok-rad-${r.id}`} onClick={onSkotare} style={{ ...radStil(i === 0), cursor: 'pointer' }}>{inre}</button>
                : <div key={r.id} data-testid={`besok-rad-${r.id}`} style={radStil(i === 0)}>{inre}</div>;
            })}
          </div>
        </section>
      )}

      {vy.maskiner.length > 0 && (
        <section style={{ marginTop: AVSTAND.xl }}>
          <BesokKarta data={karta} hojd={260} />
          <div data-testid="besok-uppdaterad" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s, ...TNUM }}>Här är maskinerna nu · {klockslag(vy.uppdaterad)}</div>
        </section>
      )}

      <button type="button" role="checkbox" aria-checked={last} data-testid="besok-last" onClick={() => setLast((v) => !v)}
        style={{ ...radStil(true), marginTop: AVSTAND.xl, background: FARG.kort, borderRadius: RADIE.kort, cursor: 'pointer' }}>
        <Ikon namn={last ? 'check_circle' : 'radio_button_unchecked'} farg={last ? FARG.gron : FARG.text3} />
        <span style={{ flex: 1, ...TYP.listtitel }}>Jag har läst</span>
      </button>

      <FastKnapp>
        <button type="button" data-testid="besok-vidare" onClick={() => { if (last) onVidare(); }} style={{ ...KNAPP.primar, ...(last ? null : INAKTIV) }}>Fortsätt</button>
      </FastKnapp>
    </div>
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
      <div style={{ ...TYP.meta, color: FARG.text2 }}>Steg 2 av 3</div>
      <h1 style={{ margin: `${AVSTAND.xs}px 0 ${AVSTAND.l}px`, ...TYP.titel }}>Jag kommer på besök</h1>
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
      <div style={{ paddingTop: TOPP_TILLBAKA }}><Tillbaka text="Din skog" onClick={onTillbaka} /></div>
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

      {vy.ring && (
        <section data-testid="besok-ring" style={{ ...KORT, marginTop: AVSTAND.l }}>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>Ring om något</div>
          <div style={{ ...TYP.listtitel, marginTop: AVSTAND.xs }}>{vy.ring.namn}</div>
          <a href={`tel:${vy.ring.telefon.replace(/[^\d+]/g, '')}`} style={{ ...TYP.listtitel, color: FARG.text, ...TNUM, userSelect: 'text' }}>{vy.ring.telefon}</a>
        </section>
      )}

      <FastKnapp>
        {fel && <div role="alert" style={{ ...TYP.text, color: FARG.rod }}>{fel}</div>}
        <button type="button" data-testid="besok-gatt" onClick={gatt} style={{ ...KNAPP.primar, ...(anmalan && !skickar ? null : INAKTIV) }}>{skickar ? 'Skickar …' : 'Jag har gått härifrån'}</button>
        <div style={{ ...TYP.meta, color: FARG.text2, textAlign: 'center' }}>Då vet förarna att du har gått</div>
      </FastKnapp>
    </div>
  );
}
