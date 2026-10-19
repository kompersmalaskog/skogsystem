'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Tillstand from '@/components/design/Tillstand';
import VyKolumn from '@/components/design/VyKolumn';
import { AVSTAND, FARG, FONT, IKON, INAKTIV, KNAPP, KOLUMN_CSS, ROT_MIN_HOJD, TNUM, TYP, VY_ROT, designCss } from '@/lib/design/tokens';
import { supabase } from '@/lib/supabase';
import { bekraftaStamplingslangd } from '@/lib/objekt/data';
import {
  bladText, certText, fmtHa, geometriSammanfattning, tolkaVarningar, traktkartor,
  type GeoSammanfattning, type Osakert,
} from '@/lib/objekt/filenGav';
import { lasManadUrl, manadEtikett, type Manad } from '@/lib/objekt/manad';
import { oppnaFil } from '@/lib/objekt/oppnaFil';
import { fmtM3, visadVolym } from '@/lib/objekt/tackning';
import { tillstandId, TILLSTAND_TEXT } from '@/lib/objekt/tillstand';

interface Objekt {
  id: string; namn: string; typ: string | null; status: string | null; volym: number | null; areal: number | null; cert: string | null; grot: boolean | null;
  ar: number | null; manad: number | null;
  markagare: string | null; inkopare: string | null; fastighetsbeteckning: string | null;
  traktdirektiv_url: string | null; traktkarta_url: string | null; traktkartor: { namn: string; path: string; ordning?: number }[] | null;
  oversiktskarta_url: string | null; stamplingslangd_url: string | null; valtlapp_url: string | null; ovriga_dokument: { namn: string; path: string }[] | null;
  checklist_items: unknown; import_varningar: unknown;
}

type Lage =
  | { lage: 'laddar' }
  | { lage: 'fel'; text: string }
  | { lage: 'saknas' }
  // `geo`: null = ingen geometri sparad för objektet; geoFel = geometrin gick inte att läsa (inte samma sak).
  | { lage: 'klar'; objekt: Objekt; geo: GeoSammanfattning | null; geoFel: boolean };

async function lasObjekt(id: string): Promise<Lage> {
  const { data, error } = await supabase.from('objekt').select('*').eq('id', id).maybeSingle();
  if (error) return { lage: 'fel', text: error.message };
  if (!data) return { lage: 'saknas' };
  const g = await supabase.from('objekt_geometri').select('geometri').eq('objekt_id', id).maybeSingle();
  return { lage: 'klar', objekt: data as Objekt, geo: g.error ? null : geometriSammanfattning(g.data?.geometri), geoFel: !!g.error };
}

const typNamn = (t: string | null) => (t === 'gallring' ? 'Gallring' : t === 'slutavverkning' ? 'Slutavverkning' : t ? t : 'Typ saknas');
const antalFragor = (c: unknown) => (Array.isArray(c) ? c.length : 0);
/** Hårt mellanslag mellan tal och enhet: "205 m" bryts aldrig efter talet. */
const fmtM = (m: number) => `${m.toLocaleString('sv-SE')}\u00a0m`;

export default function FilenGavVy({ objektId }: { objektId: string }) {
  const [lage, setLage] = useState<Lage>({ lage: 'laddar' });
  const [forsok, setForsok] = useState(0);
  const [manad] = useState<Manad>(() => lasManadUrl(typeof window === 'undefined' ? '' : window.location.search));

  useEffect(() => {
    let avbruten = false;
    setLage({ lage: 'laddar' });
    lasObjekt(objektId).then(l => { if (!avbruten) setLage(l); });
    return () => { avbruten = true; };
  }, [objektId, forsok]);

  const laddaOmTyst = useCallback(() => { lasObjekt(objektId).then(l => setLage(l)); }, [objektId]);

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD, fontFamily: FONT, WebkitFontSmoothing: 'antialiased', paddingBottom: AVSTAND.xxl }}>
      <style>{designCss}{KOLUMN_CSS}</style>
      <VyKolumn>
        <div style={{ paddingTop: AVSTAND.s }}>
          <Link href={`/objekt?ar=${manad.ar}&manad=${manad.manad}`} style={{ ...KNAPP.lank, textDecoration: 'none', gap: AVSTAND.xs }}>
            <Ikon namn="chevron_left" storlek={IKON.rad} farg="inherit" />
            {manadEtikett(manad)}
          </Link>
        </div>
        <Tillstand nyckel={lage.lage}>
          {lage.lage === 'laddar' && <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Läser objektet …</p>}
          {lage.lage === 'saknas' && <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Objektet finns inte längre. Gå tillbaka till listan.</p>}
          {lage.lage === 'fel' && (
            <div role="alert" style={{ padding: `${AVSTAND.xl}px 0`, textAlign: 'center' }}>
              <p style={{ ...TYP.text, color: FARG.orange, margin: `0 0 ${AVSTAND.s}px` }}>Kunde inte läsa objektet. {lage.text}</p>
              <button type="button" style={KNAPP.lank} onClick={() => setForsok(n => n + 1)}>Försök igen</button>
            </div>
          )}
          {lage.lage === 'klar' && <Innehall o={lage.objekt} geo={lage.geo} geoFel={lage.geoFel} onAndrad={laddaOmTyst} />}
        </Tillstand>
      </VyKolumn>
    </div>
  );
}

function Innehall({ o, geo, geoFel, onAndrad }: { o: Objekt; geo: GeoSammanfattning | null; geoFel: boolean; onAndrad: () => void }) {
  const tolkade = tolkaVarningar(o.import_varningar);
  const blad = traktkartor(o);
  const fara = geo?.faror ?? [];
  const id = tillstandId(o.status);
  const saknarVolym = !(typeof o.volym === 'number' && o.volym > 0);
  const [bladOppna, setBladOppna] = useState(false);
  const [noterOppna, setNoterOppna] = useState(false);
  const [filFel, setFilFel] = useState<string | null>(null);

  async function oppna(path: string | null) {
    setFilFel(null);
    if (!(await oppnaFil(path))) setFilFel('Filen gick inte att öppna just nu. Försök igen.');
  }

  const geoSaknas = geoFel ? 'Geometrin gick inte att läsa just nu' : 'Ingen geometri sparad för objektet';

  return (
    <>
      <header style={{ padding: `${AVSTAND.m}px 0 ${AVSTAND.xl}px` }}>
        <h1 style={{ margin: 0, ...TYP.titel, overflowWrap: 'anywhere' }}>{o.namn}</h1>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.text, color: FARG.text2 }}>{typNamn(o.typ)} · {TILLSTAND_TEXT[id]}</p>
        <p style={{ margin: `${AVSTAND.m}px 0 0`, display: 'flex', alignItems: 'baseline', gap: AVSTAND.s, flexWrap: 'wrap' }}>
          <span style={{ ...TYP.tal, color: saknarVolym ? FARG.orange : FARG.text }}>{saknarVolym ? 'saknas' : fmtM3(visadVolym(o.volym))}</span>
          {!saknarVolym && <span style={{ ...TYP.text, color: FARG.text2 }}>m³fub</span>}
          {typeof o.areal === 'number' && <span style={{ ...TYP.text, color: FARG.text2, ...TNUM }}>· {fmtHa(o.areal)} ha</span>}
        </p>
      </header>

      {/* Osäkert först, före allt annat. */}
      {tolkade.osakert.length > 0 && (
        <Sektion rubrik="Osäkert">
          {tolkade.osakert.map((q, i) => (
            <OsakertKort key={q.rad} q={q} o={o} sista={i === tolkade.osakert.length - 1} onOppna={oppna} onKlar={onAndrad} />
          ))}
        </Sektion>
      )}
      {filFel && <p role="alert" style={{ margin: `0 0 ${AVSTAND.m}px ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.orange }}>{filFel}</p>}

      <Sektion rubrik="Vad filen gav oss">
        <Rad titel="Traktdirektiv"
          under={o.traktdirektiv_url
            ? [o.fastighetsbeteckning, o.inkopare ? `inköpare ${o.inkopare}` : null].filter(Boolean).join(' · ') || 'Fastighet och inköpare saknas i filen'
            : 'Inget traktdirektiv i filen'}
          onTryck={o.traktdirektiv_url ? () => oppna(o.traktdirektiv_url) : undefined} />

        <Rad titel="Karta"
          under={blad.length === 0 ? 'Ingen traktkarta i filen' : `${bladText(blad.length)}${o.oversiktskarta_url ? ' · och översiktskarta' : ''}`}
          pil={blad.length > 0}
          onTryck={blad.length === 0 ? undefined : blad.length === 1 ? () => oppna(blad[0].path) : () => setBladOppna(v => !v)} />
        {bladOppna && blad.map((b, i) => <Rad key={b.path} titel={`Blad ${i + 1} av ${blad.length}`} dampad onTryck={() => oppna(b.path)} />)}

        {(o.typ === 'slutavverkning' || o.stamplingslangd_url) && (
          <Rad titel="Stämplingslängd"
            under={o.stamplingslangd_url
              ? (tolkade.osakert.some(q => q.slag === 'stamplingslangd') ? 'Finns, men vi är inte säkra på att det är rätt fil' : 'Finns')
              : 'Ingen stämplingslängd i filen'}
            onTryck={o.stamplingslangd_url ? () => oppna(o.stamplingslangd_url) : undefined} />
        )}
        {o.valtlapp_url && <Rad titel="Vältlappar" under="Finns" onTryck={() => oppna(o.valtlapp_url)} />}

        <Rad titel="Hänsyn" pil={false}
          under={geo == null ? geoSaknas
            : geo.hansyn == null ? 'Inga hänsynsytor i filen'
              : `${geo.hansyn.antal} ${geo.hansyn.antal === 1 ? 'yta' : 'ytor'} · ${fmtHa(geo.hansyn.ha)}\u00a0ha${geo.hansyn.beskrivningar.length ? ` · ${geo.hansyn.beskrivningar.slice(0, 2).join(', ')}${geo.hansyn.beskrivningar.length > 2 ? ` +${geo.hansyn.beskrivningar.length - 2}` : ''}` : ''}`} />

        <Rad titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}>{fara.length > 0 && <Ikon namn="warning" farg={FARG.orange} />}Kör &amp; fara</span>}
          pil={false}
          under={geo == null ? geoSaknas : (
            <>
              {fara.map(f => <span key={f.namn} style={{ color: FARG.orange }}>{f.namn} över trakten · {fmtM(f.meter)} ritad{' · '}</span>)}
              {geo.basvag ? `Basväg ${fmtM(geo.basvag.meter)}${geo.basvag.antal > 1 ? ` (${geo.basvag.antal} st)` : ''}` : 'Ingen basväg i filen'}
              {geo.andraLinjer.map(l => ` · ${l.namn} ${fmtM(l.meter)}`)}
              {geo.avlagg > 0 ? ` · ${geo.avlagg} avlägg` : ''}
            </>
          )} />

        <Rad titel="Egenkontroll" pil={false} sista
          under={antalFragor(o.checklist_items) > 0 ? `${antalFragor(o.checklist_items)} frågor` : 'Inga frågor i filen'} />
      </Sektion>

      <Sektion rubrik="Om trakten">
        <Rad titel="Certifiering" under={certText(o.cert)} pil={false} />
        <Rad titel="GROT" under={o.grot ? 'Ja' : 'Nej'} pil={false} />
        <Rad titel="Markägare" under={o.markagare || 'Saknas i filen'} pil={false} />
        <Rad titel="Status" under={TILLSTAND_TEXT[id]} pil={false} sista />
      </Sektion>

      {(tolkade.ovriga.length > 0 || tolkade.bekraftade.length > 0) && (
        <Sektion rubrik="Importen">
          {tolkade.bekraftade.map(fil => (
            <Rad key={fil} titel="Stämplingslängd bekräftad" under={`${fil} är stämplingslängden — bekräftat av dig.`} pil={false} />
          ))}
          {tolkade.ovriga.length > 0 && (
            <>
              <Rad titel={`Övriga importnoteringar (${tolkade.ovriga.length})`} dampad sista={!noterOppna} pil
                onTryck={() => setNoterOppna(v => !v)} />
              {noterOppna && tolkade.ovriga.map((n, i) => <Rad key={i} titel={n} dampad pil={false} sista={i === tolkade.ovriga.length - 1} />)}
            </>
          )}
        </Sektion>
      )}
    </>
  );
}

function OsakertKort({ q, o, sista, onOppna, onKlar }: { q: Osakert; o: Objekt; sista: boolean; onOppna: (path: string | null) => void; onKlar: () => void }) {
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  // Filens plats: den tolkade stämplingslängden, eller den okända PDF:en bland övriga dokument.
  const path = q.slag === 'stamplingslangd' ? o.stamplingslangd_url : (o.ovriga_dokument ?? []).find(d => d.namn === q.fil)?.path ?? null;
  // "Ja" finns där vi kan göra något av svaret: en tolkad stämplingslängd, eller en okänd PDF på en slutavverkning som saknar stämplingslängd.
  const kanSvara = q.slag === 'stamplingslangd' || (o.typ === 'slutavverkning' && !o.stamplingslangd_url);

  async function ja() {
    setSparar(true); setFel(null);
    try { await bekraftaStamplingslangd(o.id, q, { path }); onKlar(); } catch (e) { setFel(e instanceof Error ? e.message : String(e)); setSparar(false); }
  }

  return (
    <div data-osakert={q.slag} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}>
      <p style={{ margin: 0, ...TYP.text }}>
        {q.slag === 'stamplingslangd'
          ? `Är det här stämplingslängden? Filen hette ${q.fil} och hade inget namn vi känner igen. Anteckningen i filen nämner en stämplingslängd, så vi tolkade den som det.`
          : `Vad är ${q.fil}? Filen hade inget namn vi känner igen och ligger som övrigt dokument.${kanSvara ? ' Slutavverkningen saknar stämplingslängd — är det den?' : ''}`}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.l, marginTop: AVSTAND.m }}>
        {kanSvara && (
          <button type="button" onClick={ja} disabled={sparar} style={{ ...KNAPP.sekundar, flex: 1, ...(sparar ? INAKTIV : null) }}>
            {sparar ? 'Sparar …' : q.slag === 'stamplingslangd' ? 'Ja, det stämmer' : 'Ja, det är stämplingslängden'}
          </button>
        )}
        <button type="button" onClick={() => onOppna(path)} disabled={!path} style={{ ...KNAPP.lank, ...(path ? null : INAKTIV) }}>Öppna filen</button>
      </div>
      {fel && <p role="alert" style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.meta, color: FARG.orange }}>{fel}</p>}
    </div>
  );
}
