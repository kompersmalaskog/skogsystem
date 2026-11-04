'use client';

// Kemikalier — svarar på EN fråga: "Har vi säkerhetsbladet för allt vi använder?".
// Överst svaret, sedan en rad per produkt: namn, var den finns, och "Saknas" i orange när bladet saknas.
// Ett tryck öppnar produkten med EN knapp: Öppna säkerhetsbladet, och fotot på etiketten. Admin byter blad, ändrar var den finns och tar bort.
// ALLA lägger till det de köpt: foto på etiketten, namn, var (bladet om de har det). Saknas bladet får admin en push.
// Längst ner: riskbedömningen för kemikalier och (admin) årets genomgång som bockar av årshjulets punkt Kemikalierna.
// Texterna: lib/arbetsmiljo/kemikalier.ts. ?id=<produkt> öppnar produkten (pushen).

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Falt from '@/components/design/Falt';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, ROT_MIN_HOJD, TYP, VY_ROT, designCss, kolumnRot } from '@/lib/design/tokens';
import { komprimeraMarkeringFoto } from '@/lib/markeringFoto';
import { andraVar, bildFel, bladLank, bytBlad, filFel, hamtaKemikalier, laggTill, mejlLank, ordna, radUnder, svar, taBort, type Kemikalie } from '@/lib/arbetsmiljo/kemikalier';
import { lasEtikettApi, sokBladApi, type SokSvar } from '@/lib/arbetsmiljo/hittaBlad';
import { hamtaGjorda, markeraGjord, svenskArManad } from '@/lib/arbetsmiljo/arshjul';
import { datumText } from '@/lib/arbetsmiljo/introduktion';

type Data = { lista: Kemikalie[]; genomgang: string | null | undefined };

/** Var appen är med bladet: läser etiketten, letar, hittade ett (väntar på svar), hittade inget, eller kunde inte. */
type Sok = null | 'laser' | 'soker' | Extract<SokSvar, { status: 'hittad' }> | 'inget' | 'fel' | 'olaslig';

function oppnaFil(f: Blob) {
  const u = URL.createObjectURL(f);
  const w = window.open(u, '_blank');
  if (!w) window.location.href = u;
  setTimeout(() => URL.revokeObjectURL(u), 60_000);
}

/** Säkerhetsbladet i ett ark: appen letar själv; hittar den ett frågar den "rätt blad?"; annars mejl till leverantören eller en fil. */
function BladSok({ sok, fil, kalla, namn, tillverkare, avsandare, onLeta, onRatt, onFel, onValjFil }: {
  sok: Sok; fil: File | null; kalla: string | null; namn: string; tillverkare: string | null; avsandare: string | null;
  onLeta: () => void; onRatt: () => void; onFel: () => void; onValjFil: () => void;
}) {
  const n = namn.trim();
  const mejl = n ? <Rad titel="Be leverantören om bladet" under="Ett färdigt mejl – skriv bara vem det går till" pil
    attr={{ 'data-kem-mejl': '1' }} onTryck={() => { window.location.href = mejlLank(n, tillverkare, avsandare); }} /> : null;
  const valjFil = (sista = true) => <Rad titel="Välj fil" under="Har du bladet som PDF?" sista={sista}
    hoger={<span style={{ color: FARG.bla }}>Välj fil</span>} onTryck={onValjFil} />;
  let innehall: ReactNode;
  if (fil) {
    innehall = <Rad titel="Säkerhetsblad" sista attr={{ 'data-kem-bladet': '1' }}
      under={kalla ? <span style={{ color: FARG.gron }}>✓ Från {kalla}</span> : fil.name}
      hoger={<span style={{ color: FARG.bla }}>Byt</span>} onTryck={onValjFil} />;
  } else if (sok === 'laser') {
    innehall = <Rad titel="Läser etiketten …" under="Namnet fylls i av sig självt" sista attr={{ 'data-kem-sok': 'laser' }} />;
  } else if (sok === 'soker') {
    innehall = <Rad titel="Letar efter säkerhetsbladet …" under="Det kan ta en minut" sista attr={{ 'data-kem-sok': 'soker' }} />;
  } else if (sok && typeof sok === 'object') {
    innehall = (
      <>
        <Rad titel="Hittade säkerhetsbladet" attr={{ 'data-kem-sok': 'hittad' }}
          under={<>{sok.kalla}{!sok.namnStammer && <span style={{ color: FARG.orange }}> · kolla att det är rätt produkt</span>}</>}
          hoger={<span style={{ color: FARG.bla }}>Visa</span>} onTryck={() => oppnaFil(sok.fil)} sista />
        <p style={{ ...TYP.text, color: FARG.text, margin: `${AVSTAND.m}px 0 ${AVSTAND.s}px` }}>Är det här rätt blad?</p>
        <div style={{ display: 'flex', gap: AVSTAND.s }}>
          <button type="button" data-kem-ratt onClick={onRatt} style={{ ...KNAPP.sekundar, flex: 1 }}>Rätt blad</button>
          <button type="button" data-kem-fel onClick={onFel} style={{ ...KNAPP.sekundar, flex: 1 }}>Fel blad</button>
        </div>
      </>
    );
  } else if (sok) {
    const text = sok === 'inget' ? 'Hittade inget säkerhetsblad på nätet' : sok === 'olaslig' ? 'Kunde inte läsa namnet på etiketten – skriv det ovanför' : 'Kunde inte leta just nu';
    innehall = (
      <>
        <p data-kem-sok={sok} style={{ ...TYP.text, color: FARG.orange, margin: `0 0 ${AVSTAND.s}px` }}>{text}</p>
        {sok !== 'inget' && n && <Rad titel="Leta igen" pil onTryck={onLeta} attr={{ 'data-kem-leta': '1' }} />}
        {mejl}
        {valjFil()}
      </>
    );
  } else {
    innehall = (
      <>
        {n && <Rad titel="Leta upp säkerhetsbladet" under="Appen letar på nätet" pil onTryck={onLeta} attr={{ 'data-kem-leta': '1' }} />}
        <Rad titel="Säkerhetsblad (PDF)" sista under={n ? 'Eller välj en fil du har' : 'Ta en bild på etiketten så letar appen upp bladet'}
          hoger={<span style={{ color: FARG.bla }}>Välj fil</span>} onTryck={onValjFil} />
      </>
    );
  }
  return <Sektion rubrik="Säkerhetsblad" kort={false}>{innehall}</Sektion>;
}

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
  const [foto, setFoto] = useState<File | null>(null);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const [kvitto, setKvitto] = useState<string | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);
  const djuplankKlar = useRef(false);
  const [andrarVar, setAndrarVar] = useState(false);
  const [bekraftaBort, setBekraftaBort] = useState(false);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const filRef = useRef<HTMLInputElement>(null);
  const [sok, setSok] = useState<Sok>(null);
  const [tillverkare, setTillverkare] = useState<string | null>(null);
  const [bladKalla, setBladKalla] = useState<string | null>(null);
  const namnRef = useRef('');
  namnRef.current = namn;
  // Ett svar som kommer efter att arket stängts eller en ny sökning startats gäller inte.
  const sokNr = useRef(0);

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

  // Pushen länkar till /kemikalier?id=<produkt>: öppna den en gång när listan är läst.
  useEffect(() => {
    if (djuplankKlar.current || !data || data === 'fel') return;
    djuplankKlar.current = true;
    const id = new URLSearchParams(window.location.search).get('id');
    if (id && data.lista.some(k => k.id === id)) setValdId(id);
  }, [data]);

  // Etikettens foto i den öppna produkten.
  const etikett = vald?.etikettSokvag ?? null;
  useEffect(() => {
    setFotoUrl(null);
    if (!etikett) return;
    let aktiv = true;
    void bladLank(supabase, etikett).then(u => { if (aktiv) setFotoUrl(u); });
    return () => { aktiv = false; };
  }, [etikett]);

  const stang = () => {
    sokNr.current++;
    setValdId(null); setNy(false); setAndrarVar(false); setBekraftaBort(false); setFel(null); setFil(null); setFoto(null); setNamn(''); setPlats('');
    setSok(null); setTillverkare(null); setBladKalla(null);
  };

  const leta = async (n: string, t: string | null) => {
    if (!n.trim()) return;
    const nr = ++sokNr.current;
    setSok('soker');
    const r = await sokBladApi(n.trim(), t);
    if (nr !== sokNr.current) return;
    setSok(r.status === 'hittad' ? r : r.status);
  };

  // Fotot på etiketten: appen läser namnet och letar upp bladet. Föraren gör ingenting mer.
  const lasOchLeta = async (bild: Blob) => {
    const nr = ++sokNr.current;
    setSok('laser');
    const r = await lasEtikettApi(bild);
    if (nr !== sokNr.current) return;
    if (!r.ok) { setSok(r.olaslig ? 'olaslig' : 'fel'); return; }
    const egetNamn = namnRef.current.trim();
    if (!egetNamn) setNamn(r.etikett.namn);
    setTillverkare(r.etikett.tillverkare);
    await leta(egetNamn || r.etikett.namn, r.etikett.tillverkare);
  };


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
    sokNr.current++; setSok(null); setBladKalla(null);
    if (sedan) sedan(f); else setFil(f);
  };

  const valjFoto = (f: File | null) => {
    setFel(null);
    if (!f) return;
    const e = bildFel(f);
    if (e) { setFel(e); return; }
    setFoto(f);
    if (!fil) void (async () => {
      const bild = await komprimeraMarkeringFoto(f).catch(() => f);
      await lasOchLeta(bild);
    })();
  };

  const spara = () => void kor(async () => {
    const bild = foto ? await komprimeraMarkeringFoto(foto).catch(() => foto) : null;
    return laggTill(supabase, namn, plats, fil, bild);
  }, () => {
    const utanBlad = !fil;
    const n = namn.trim();
    stang();
    setKvitto(utanBlad && !arAdmin ? `${n} är tillagd. Arbetsledningen ordnar säkerhetsbladet.` : `${n} är tillagd.`);
  });

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

        {data && data !== 'fel' && (
          <>
            {kvitto && <p role="status" data-kem-kvitto style={{ ...TYP.text, color: FARG.gron, margin: `${AVSTAND.l}px 0 0` }}>✓ {kvitto}</p>}
            <button type="button" data-kem-ny onClick={() => { setFel(null); setKvitto(null); setNy(true); }}
              style={{ ...KNAPP.sekundar, width: '100%', marginTop: AVSTAND.l }}>Lägg till något du köpt</button>
            <Sektion rubrik="Riskerna">
              <Rad titel="Riskbedömning för kemikalier" under="Tanka, byta olja, spraya, avgaser" href="/riskbedomning?typ=kemikalier" sista
                attr={{ 'data-kem-risk': '1' }} />
            </Sektion>
          </>
        )}
        {data && data !== 'fel' && arAdmin && (
          <>
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
          {fotoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fotoUrl} alt={`Etiketten på ${vald.namn}`} data-kem-foto
              style={{ display: 'block', width: '100%', maxHeight: 320, objectFit: 'contain', borderRadius: RADIE.kort, background: FARG.upphojt, marginBottom: AVSTAND.l }} />
          )}
          <Sektion rubrik="Om produkten" kort={false}>
            <Rad titel="Var den finns" under={radUnder(vald)} sista={!arAdmin || !vald.sdbSokvag}
              onTryck={arAdmin ? () => { setPlats(vald.varFinns ?? ''); setAndrarVar(true); } : undefined} pil={arAdmin} />
            {arAdmin && vald.sdbSokvag && (
              <Rad titel="Säkerhetsblad" sista
                under={vald.sdbSokvag ? (vald.sdbTid ? `Uppladdat ${datumText(vald.sdbTid)}` : 'Finns') : <span style={{ color: FARG.orange }}>Saknas</span>}
                hoger={<span style={{ color: FARG.bla }}>{vald.sdbSokvag ? 'Byt' : 'Ladda upp'}</span>}
                onTryck={sparar ? undefined : () => filRef.current?.click()} />
            )}
          </Sektion>
          {arAdmin && !vald.sdbSokvag && (
            <BladSok sok={sok} fil={null} kalla={null} namn={vald.namn} tillverkare={null} avsandare={medarbetare?.namn ?? null}
              onLeta={() => void leta(vald.namn, null)}
              onRatt={() => { if (sok && typeof sok === 'object') { const f = sok.fil; setSok(null); void kor(() => bytBlad(supabase, vald.id, f), () => {}); } }}
              onFel={() => setSok('inget')}
              onValjFil={() => filRef.current?.click()} />
          )}
          {!vald.sdbSokvag && !arAdmin && (
            <p style={{ ...TYP.text, color: FARG.orange, margin: `${AVSTAND.m}px 0 0` }}>Säkerhetsbladet saknas. Arbetsledningen ordnar det.</p>
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
        <Ark rubrik="Lägg till" onStang={stang}
          fot={<button type="button" data-kem-spara disabled={sparar || !namn.trim()}
            onClick={spara}
            style={{ ...KNAPP.primar, ...(sparar || !namn.trim() ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : 'Lägg till'}</button>}>
          <Sektion rubrik="Etiketten" kort={false}>
            <Rad titel="Foto på etiketten" sista attr={{ 'data-kem-fotorad': '1' }}
              under={foto ? foto.name : 'Appen läser namnet och letar upp säkerhetsbladet'}
              hoger={<span style={{ color: FARG.bla }}>{foto ? 'Ta ny' : 'Ta bild'}</span>}
              onTryck={() => fotoRef.current?.click()} />
          </Sektion>
          <Falt etikett="Vad heter den?" value={namn} onChange={setNamn} placeholder="T.ex. Hydraulolja Biohyd 46" />
          <Falt etikett="Var finns den?" value={plats} onChange={setPlats} placeholder="T.ex. Giant, verkstaden" />
          <BladSok sok={sok} fil={fil} kalla={bladKalla} namn={namn} tillverkare={tillverkare} avsandare={medarbetare?.namn ?? null}
            onLeta={() => void leta(namn, tillverkare)}
            onRatt={() => { if (sok && typeof sok === 'object') { setFil(sok.fil); setBladKalla(sok.kalla); setSok(null); } }}
            onFel={() => setSok('inget')}
            onValjFil={() => filRef.current?.click()} />
          <input ref={fotoRef} type="file" accept="image/*" capture="environment" hidden aria-hidden="true"
            onChange={e => { const f = e.target.files?.[0] ?? null; e.target.value = ''; valjFoto(f); }} />
          {fel && <p role="alert" style={{ ...TYP.text, color: FARG.orange, margin: `${AVSTAND.m}px 0 0` }}>{fel}</p>}
          <input ref={filRef} type="file" accept="application/pdf,.pdf" hidden aria-hidden="true"
            onChange={e => { const f = e.target.files?.[0] ?? null; e.target.value = ''; valjFil(f); }} />
        </Ark>
      )}
    </div>
  );
}
