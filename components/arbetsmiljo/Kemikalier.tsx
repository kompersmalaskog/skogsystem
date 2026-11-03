'use client';

// Kemikalier — svarar på EN fråga: "Har vi säkerhetsbladet för allt vi använder?".
// Överst svaret, sedan en rad per produkt: namn, var den finns, och "Saknas" i orange när bladet saknas.
// Ett tryck öppnar produkten med EN knapp: Öppna säkerhetsbladet. Admin byter blad, ändrar var den finns och tar bort.
// Längst ner (admin): Lägg till, och årets genomgång som bockar av årshjulets punkt Kemikalierna. Texterna: lib/arbetsmiljo/kemikalier.ts.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Falt from '@/components/design/Falt';
import { AVSTAND, FARG, INAKTIV, KNAPP, ROT_MIN_HOJD, TYP, VY_ROT, designCss, kolumnRot } from '@/lib/design/tokens';
import { andraVar, bladLank, bytBlad, filFel, hamtaKemikalier, laggTill, ordna, radUnder, svar, taBort, type Kemikalie } from '@/lib/arbetsmiljo/kemikalier';
import { hamtaGjorda, markeraGjord, svenskArManad } from '@/lib/arbetsmiljo/arshjul';
import { datumText } from '@/lib/arbetsmiljo/introduktion';

type Data = { lista: Kemikalie[]; genomgang: string | null | undefined };

export default function Kemikalier() {
  const { medarbetare } = useCurrentMedarbetare();
  const arAdmin = medarbetare?.roll === 'admin';
  const ar = svenskArManad(new Date()).ar;
  const [data, setData] = useState<Data | null | 'fel'>(null);
  const [valdId, setValdId] = useState<string | null>(null);
  const [ny, setNy] = useState(false);
  const [namn, setNamn] = useState('');
  const [plats, setPlats] = useState('');
  const [fil, setFil] = useState<File | null>(null);
  const [andrarVar, setAndrarVar] = useState(false);
  const [bekraftaBort, setBekraftaBort] = useState(false);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const filRef = useRef<HTMLInputElement>(null);

  const hamta = useCallback(async () => {
    if (!medarbetare) return;
    const [lista, gjorda] = await Promise.all([
      hamtaKemikalier(supabase),
      arAdmin ? hamtaGjorda(supabase, ar) : Promise.resolve(null),
    ]);
    if (!lista) { setData('fel'); return; }
    // undefined = förare (visas inte); null = inte gjord i år.
    const genomgang = !arAdmin ? undefined : gjorda?.find(g => g.punkt === 'kemikalier')?.gjordTid ?? null;
    setData({ lista, genomgang });
  }, [medarbetare, arAdmin, ar]);

  useEffect(() => { void hamta(); }, [hamta]);

  const vald = data && data !== 'fel' && valdId ? data.lista.find(k => k.id === valdId) ?? null : null;

  const stang = () => { setValdId(null); setNy(false); setAndrarVar(false); setBekraftaBort(false); setFel(null); setFil(null); setNamn(''); setPlats(''); };

  const kor = async (f: () => Promise<string | null>, efter: () => void = stang) => {
    setSparar(true); setFel(null);
    const e = await f();
    setSparar(false);
    if (e) { setFel(e); return; }
    efter();
    void hamta();
  };

  const oppna = async (k: Kemikalie) => {
    if (!k.sdbSokvag) return;
    setFel(null);
    // Fliken öppnas direkt i trycket (annars stoppar Safari den), länken fylls i efteråt.
    const w = window.open('', '_blank');
    const url = await bladLank(supabase, k.sdbSokvag);
    if (!url) { w?.close(); setFel('Kunde inte öppna säkerhetsbladet. Försök igen.'); return; }
    if (w) w.location.href = url; else window.location.href = url;
  };

  const valjFil = (f: File | null, sedan?: (f: File) => void) => {
    setFel(null);
    if (!f) return;
    const e = filFel(f);
    if (e) { setFel(e); return; }
    if (sedan) sedan(f); else setFil(f);
  };

  const s = data && data !== 'fel' ? svar(data.lista) : null;

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
      <style>{designCss}</style>
      <div style={{ ...kolumnRot('smal'), paddingTop: AVSTAND.l, paddingBottom: `calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))` }}>
        <header style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
          <h1 data-testid="kem-svar" style={{ margin: 0, ...TYP.titel, color: s?.ton ? FARG.orange : FARG.text }}>
            {data === null ? 'Läser …' : data === 'fel' ? 'Kunde inte läsa kemikalierna' : s!.text}
          </h1>
          {s?.under && <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>{s.under}</p>}
          {data === 'fel' && (
            <button type="button" onClick={() => { setData(null); void hamta(); }} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>Försök igen</button>
          )}
        </header>

        {data && data !== 'fel' && data.lista.length > 0 && (
          <Sektion rubrik="Produkter">
            {ordna(data.lista).map((k, i, alla) => (
              <Rad key={k.id} titel={k.namn} under={radUnder(k)} sista={i === alla.length - 1} pil
                hoger={k.sdbSokvag ? undefined : <span style={{ color: FARG.orange }}>Saknas</span>}
                attr={{ 'data-kem': k.id }}
                onTryck={() => { setFel(null); setValdId(k.id); }} />
            ))}
          </Sektion>
        )}

        {data && data !== 'fel' && arAdmin && (
          <>
            <button type="button" data-kem-ny onClick={() => { setFel(null); setNy(true); }}
              style={{ ...KNAPP.sekundar, width: '100%', marginTop: AVSTAND.l }}>Lägg till produkt</button>

            <Sektion rubrik={`Genomgången ${ar}`}>
              {data.genomgang ? (
                <Rad titel={<span style={{ color: FARG.gron }}>✓ Genomgången är gjord</span>} under={datumText(data.genomgang)} sista />
              ) : (
                <Rad titel="Listan stämmer" sista attr={{ 'data-kem-genomgang': '1' }}
                  under="Tryck när ni gått igenom allt en gång i år"
                  onTryck={sparar ? undefined : () => void kor(() => markeraGjord(supabase, ar, 'kemikalier', 'Kemikalielistan genomgången i appen'), () => {})} />
              )}
            </Sektion>
          </>
        )}
        {fel && !vald && !ny && <p role="alert" style={{ ...TYP.text, color: FARG.orange, marginTop: AVSTAND.m }}>{fel}</p>}
      </div>

      {/* En produkt: EN knapp, Öppna säkerhetsbladet. Admin ser mer under. */}
      {vald && (
        <Ark rubrik={vald.namn} stang="Klar" onStang={stang}
          fot={vald.sdbSokvag ? (
            <button type="button" data-kem-oppna onClick={() => void oppna(vald)} style={KNAPP.primar}>Öppna säkerhetsbladet</button>
          ) : undefined}>
          <Sektion rubrik="Om produkten" kort={false}>
            <Rad titel="Var den finns" under={radUnder(vald)} sista={!arAdmin}
              onTryck={arAdmin ? () => { setPlats(vald.varFinns ?? ''); setAndrarVar(true); } : undefined} pil={arAdmin} />
            {arAdmin && (
              <Rad titel="Säkerhetsblad" sista
                under={vald.sdbSokvag ? (vald.sdbTid ? `Uppladdat ${datumText(vald.sdbTid)}` : 'Finns') : <span style={{ color: FARG.orange }}>Saknas</span>}
                hoger={<span style={{ color: FARG.bla }}>{vald.sdbSokvag ? 'Byt' : 'Ladda upp'}</span>}
                onTryck={sparar ? undefined : () => filRef.current?.click()} />
            )}
          </Sektion>
          {!vald.sdbSokvag && !arAdmin && (
            <p style={{ ...TYP.text, color: FARG.orange, margin: `${AVSTAND.m}px 0 0` }}>Säkerhetsbladet saknas. Säg till arbetsledningen.</p>
          )}
          {andrarVar && (
            <div style={{ marginTop: AVSTAND.l }}>
              <Falt etikett="Var den finns" value={plats} onChange={setPlats} placeholder="T.ex. Giant, verkstaden" autoFocus />
              <button type="button" disabled={sparar} onClick={() => void kor(() => andraVar(supabase, vald.id, plats), () => setAndrarVar(false))}
                style={{ ...KNAPP.sekundar, width: '100%', ...(sparar ? INAKTIV : {}) }}>Spara</button>
            </div>
          )}
          {sparar && <p style={{ ...TYP.meta, color: FARG.text2 }}>Sparar …</p>}
          {fel && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: `${AVSTAND.m}px 0 0` }}>{fel}</p>}
          {arAdmin && (bekraftaBort ? (
            <div style={{ marginTop: AVSTAND.xl }}>
              <p style={{ ...TYP.text, color: FARG.text, margin: `0 0 ${AVSTAND.s}px` }}>Används den inte längre? Den försvinner ur listan.</p>
              <button type="button" data-kem-bort-ja disabled={sparar} onClick={() => void kor(() => taBort(supabase, vald.id))}
                style={{ ...KNAPP.sekundar, width: '100%', color: FARG.rod }}>Ta bort</button>
            </div>
          ) : (
            <button type="button" data-kem-bort onClick={() => setBekraftaBort(true)}
              style={{ ...KNAPP.tertiar, color: FARG.rod, marginTop: AVSTAND.xl }}>Används inte längre</button>
          ))}
          <input ref={filRef} type="file" accept="application/pdf,.pdf" hidden aria-hidden="true"
            onChange={e => { const f = e.target.files?.[0] ?? null; e.target.value = ''; valjFil(f, ff => void kor(() => bytBlad(supabase, vald.id, ff), () => {})); }} />
        </Ark>
      )}

      {/* Ny produkt: namn, var, blad (valfritt). EN knapp: Lägg till. */}
      {ny && (
        <Ark rubrik="Ny produkt" onStang={stang}
          fot={<button type="button" data-kem-spara disabled={sparar || !namn.trim()}
            onClick={() => void kor(() => laggTill(supabase, namn, plats, fil))}
            style={{ ...KNAPP.primar, ...(sparar || !namn.trim() ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : 'Lägg till'}</button>}>
          <Falt etikett="Vad heter den?" value={namn} onChange={setNamn} placeholder="T.ex. Hydraulolja Biohyd 46" autoFocus />
          <Falt etikett="Var finns den?" value={plats} onChange={setPlats} placeholder="T.ex. Giant, verkstaden" />
          <Sektion rubrik="Säkerhetsblad" kort={false}>
            <Rad titel="Säkerhetsblad (PDF)" sista under={fil ? fil.name : 'Finns oftast på tillverkarens sida'}
              hoger={<span style={{ color: FARG.bla }}>{fil ? 'Byt' : 'Välj fil'}</span>}
              onTryck={() => filRef.current?.click()} />
          </Sektion>
          {fel && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: `${AVSTAND.m}px 0 0` }}>{fel}</p>}
          <input ref={filRef} type="file" accept="application/pdf,.pdf" hidden aria-hidden="true"
            onChange={e => { const f = e.target.files?.[0] ?? null; e.target.value = ''; valjFil(f); }} />
        </Ark>
      )}
    </div>
  );
}
