'use client';

// Besökssidan för markägaren (/besok/<token>): öppen utan inloggning, telefon, svart iOS-stil. Läser /api/besok/<token> (bara det som får visas) och skickar en anmälan till maskinerna.
// Uppifrån: traktnamn + framsteg → HUVUDREGELN (alltid överst bland reglerna) → "Här just nu" (max tre rader) → kartan → knappen "Jag kommer på besök".
// Ingen annan säkerhetstext på sidan. Inga förarnamn, inga spår, inga volymer.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { AVSTAND, FARG, KNAPP, KORT, RADIE, TNUM, TRAFFYTA, TYP, VY_ROT, designCss, medSafeBotten, INAKTIV, IKON } from '@/lib/design/tokens';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Flikkontroll from '@/components/design/Flikkontroll';
import SkotarBild from './SkotarBild';
import type { KartaData } from './BesokKarta';
import { HUVUDREGEL, SKOTARARK_RUBRIK, SKOTARARK_TEXT, sakerhetsRader, type MaskinRoll } from '@/lib/besok/sakerhet';
import { klockslag } from '@/lib/besok/tid';
import { VANTAR_TEXT, kvitteringsRader } from '@/lib/besok/status';
import { PUBLIK_POLL_MS } from '@/lib/besok/konstanter';

const BesokKarta = dynamic(() => import('./BesokKarta'), { ssr: false, loading: () => <div style={{ height: 340, borderRadius: RADIE.kort, background: FARG.kort }} /> });

type Vy = {
  ok: true;
  namn: string;
  utforare: string;
  framsteg: { procent: number | null; klartCa: string | null; text: string | null };
  gran: [number, number][][] | null;
  mitt: { lat: number; lng: number } | null;
  maskiner: { roll: MaskinRoll; lat: number; lng: number; tid: string }[];
  roller: MaskinRoll[];
  motorsag: { lat: number; lng: number }[];
  harMotorsag: boolean;
  ringM: { skordare: number; skotare: number; motorsag: number };
  uppdaterad: string;
  besok: { id: string; besokstid: string; kvitteringar: { roll: MaskinRoll; tid: string }[] } | null;
};
type Slut = { fel: string; status: number };

const lagringsNyckel = (token: string) => `besok_anmalan_v1:${token}`;
const lasAnmalan = (token: string): string | null => { try { const j = JSON.parse(localStorage.getItem(lagringsNyckel(token)) || 'null'); return typeof j?.id === 'string' ? j.id : null; } catch { return null; } };
const sparaAnmalan = (token: string, id: string) => { try { localStorage.setItem(lagringsNyckel(token), JSON.stringify({ id })); } catch { /* privat läge: anmälan visas tills sidan laddas om */ } };

const Ikon = ({ namn, storlek = IKON.rad, farg }: { namn: string; storlek?: number; farg?: string }) => (
  <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: storlek, color: farg, flexShrink: 0 }}>{namn}</span>
);

export default function BesokKlient({ token }: { token: string }) {
  const [vy, setVy] = useState<Vy | null>(null);
  const [slut, setSlut] = useState<Slut | null>(null);
  const [besokId, setBesokId] = useState<string | null>(null);
  const [formOppen, setFormOppen] = useState(false);
  const [skotarArk, setSkotarArk] = useState(false);

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

  const kartData: KartaData | null = useMemo(() => vy ? { token, mitt: vy.mitt, gran: vy.gran, maskiner: vy.maskiner, motorsag: vy.motorsag, ringM: vy.ringM } : null, [vy, token]);
  const rader = useMemo(() => vy ? sakerhetsRader({ roller: vy.roller, harMotorsag: vy.harMotorsag }) : [], [vy]);

  if (slut) {
    return (
      <div style={{ ...VY_ROT, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: AVSTAND.m, minHeight: '100vh' }}>
        <style>{designCss}</style>
        <h1 style={{ margin: 0, ...TYP.titel }}>{slut.status === 410 ? 'Arbetet är klart' : 'Länken finns inte'}</h1>
        <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>{slut.status === 410 ? 'Länken gäller inte längre. Tack för att du följt arbetet.' : 'Kontrollera länken du fick av Kompersmåla Skog.'}</p>
      </div>
    );
  }
  if (!vy || !kartData) {
    return (
      <div style={{ ...VY_ROT, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <style>{designCss}</style>
        <span style={{ ...TYP.text, color: FARG.text2 }}>Hämtar läget på trakten …</span>
      </div>
    );
  }

  const anmalan = vy.besok;
  const kv = anmalan ? kvitteringsRader(anmalan.kvitteringar) : [];

  return (
    <div data-testid="besok-sida" style={{ ...VY_ROT, maxWidth: 560, margin: '0 auto', paddingBottom: medSafeBotten(96) }}>
      <style>{designCss}</style>

      <header style={{ paddingTop: `calc(env(safe-area-inset-top, 0px) + ${AVSTAND.xl}px)` }}>
        <h1 data-testid="besok-namn" style={{ margin: 0, ...TYP.titel }}>{vy.namn}</h1>
        <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{vy.utforare}</div>
        {vy.framsteg.text && <div data-testid="besok-framsteg" style={{ ...TYP.listtitel, marginTop: AVSTAND.m, ...TNUM }}>{vy.framsteg.text}</div>}
        {vy.framsteg.procent != null && (
          <div aria-hidden="true" style={{ height: AVSTAND.xs, borderRadius: RADIE.stapel, background: FARG.fyllning, marginTop: AVSTAND.s, overflow: 'hidden' }}>
            <div style={{ width: `${vy.framsteg.procent}%`, height: '100%', background: FARG.text }} />
          </div>
        )}
      </header>

      {/* HUVUDREGELN — alltid överst bland reglerna, stor vit ruta */}
      <section data-testid="besok-huvudregel" style={{ marginTop: AVSTAND.xl, background: FARG.text, color: FARG.bg, borderRadius: RADIE.kort, padding: AVSTAND.l }}>
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

      {/* HÄR JUST NU — högst tre rader, bara det som finns på trakten nu */}
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
              const stil: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: AVSTAND.m, width: '100%', minHeight: TRAFFYTA.min, padding: `${AVSTAND.m}px ${AVSTAND.l}px`, background: 'transparent', border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${FARG.linje}`, color: FARG.text, textAlign: 'left', fontFamily: 'inherit', boxSizing: 'border-box' };
              return r.ark
                ? <button key={r.id} type="button" data-testid={`besok-rad-${r.id}`} onClick={() => setSkotarArk(true)} style={{ ...stil, cursor: 'pointer' }}>{inre}</button>
                : <div key={r.id} data-testid={`besok-rad-${r.id}`} style={stil}>{inre}</div>;
            })}
          </div>
        </section>
      )}

      {/* KARTAN */}
      <section style={{ marginTop: AVSTAND.xl }}>
        <BesokKarta data={kartData} />
        <div data-testid="besok-uppdaterad" style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s, ...TNUM }}>
          {vy.maskiner.length > 0 ? `Uppdaterad ${klockslag(vy.uppdaterad)}` : `Inga maskiner är igång på trakten just nu · ${klockslag(vy.uppdaterad)}`}
        </div>
      </section>

      {/* DIN ANMÄLAN */}
      {anmalan && (
        <section data-testid="besok-anmalan" style={{ ...KORT, marginTop: AVSTAND.xl }}>
          <div style={{ ...TYP.micro, color: FARG.text2 }}>Din anmälan · {klockslag(anmalan.besokstid)}</div>
          {kv.length === 0
            ? <div data-testid="besok-vantar" style={{ ...TYP.listtitel, marginTop: AVSTAND.s }}>{VANTAR_TEXT}</div>
            : <div style={{ marginTop: AVSTAND.s, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>{kv.map((t) => <div key={t} data-testid="besok-kvittens" style={{ ...TYP.listtitel, color: FARG.gron }}>{t}</div>)}</div>}
        </section>
      )}

      <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, padding: `${AVSTAND.m}px ${AVSTAND.l}px ${medSafeBotten(AVSTAND.m)}`, background: 'linear-gradient(to top, #000 70%, rgba(0,0,0,0))' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <button type="button" data-testid="besok-kommer" onClick={() => setFormOppen(true)} style={anmalan ? KNAPP.sekundar : KNAPP.primar}>
            {anmalan ? 'Anmäl ett nytt besök' : 'Jag kommer på besök'}
          </button>
        </div>
      </div>

      {formOppen && (
        <AnmalForm token={token} onStang={() => setFormOppen(false)} onSkickat={(id) => { sparaAnmalan(token, id); setBesokId(id); setFormOppen(false); }} />
      )}
      {skotarArk && (
        <Ark rubrik={SKOTARARK_RUBRIK} stang="Klar" onStang={() => setSkotarArk(false)}>
          <div data-testid="besok-skotarark">
            <SkotarBild />
            <p style={{ margin: `${AVSTAND.l}px 0 ${AVSTAND.m}px`, ...TYP.kommentar }}>{SKOTARARK_TEXT}</p>
          </div>
        </Ark>
      )}
    </div>
  );
}

function AnmalForm({ token, onStang, onSkickat }: { token: string; onStang: () => void; onSkickat: (id: string) => void }) {
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
    <Ark rubrik="Jag kommer på besök" onStang={onStang}
      fot={<>
        {fel && <div role="alert" style={{ ...TYP.text, color: FARG.rod }}>{fel}</div>}
        <button type="button" data-testid="besok-skicka" onClick={skicka} style={{ ...KNAPP.primar, ...(klar && !skickar ? null : INAKTIV) }}>{skickar ? 'Skickar …' : 'Skicka till maskinerna'}</button>
      </>}>
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
    </Ark>
  );
}
