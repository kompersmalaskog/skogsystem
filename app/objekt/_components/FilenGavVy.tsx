'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Ikon from '@/components/design/Ikon';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Tillstand from '@/components/design/Tillstand';
import VyKolumn from '@/components/design/VyKolumn';
import { AVSTAND, FARG, FONT, IKON, INAKTIV, KNAPP, KOLUMN_CSS, ROT_MIN_HOJD, TNUM, TYP, VY_ROT, designCss } from '@/lib/design/tokens';
import { supabase } from '@/lib/supabase';
import {
  bladText, certText, fmtHa, fragor, geometriSammanfattning, noterat, traktkartor,
  type Fraga, type GeoSammanfattning,
} from '@/lib/objekt/filenGav';
import { lasManadUrl, manadEtikett, type Manad } from '@/lib/objekt/manad';
import { oppnaFil } from '@/lib/objekt/oppnaFil';
import { fmtM3, typNamn, visadVolym } from '@/lib/objekt/tackning';
import { tillstandId, TILLSTAND_TEXT } from '@/lib/objekt/tillstand';
import AndraObjektArk from './AndraObjektArk';

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

const antalFragor = (c: unknown) => (Array.isArray(c) ? c.length : 0);
/** Hårt mellanslag mellan tal och enhet: "205 m" bryts aldrig efter talet. */
const fmtM = (m: number) => `${m.toLocaleString('sv-SE')} m`;

export default function FilenGavVy({ objektId }: { objektId: string }) {
  const router = useRouter();
  const [lage, setLage] = useState<Lage>({ lage: 'laddar' });
  const [forsok, setForsok] = useState(0);
  const [andra, setAndra] = useState(false);
  const [kvitto, setKvitto] = useState('');
  const [manad] = useState<Manad>(() => lasManadUrl(typeof window === 'undefined' ? '' : window.location.search));

  useEffect(() => {
    let avbruten = false;
    setLage({ lage: 'laddar' });
    lasObjekt(objektId).then(l => { if (!avbruten) setLage(l); });
    return () => { avbruten = true; };
  }, [objektId, forsok]);

  const laddaOmTyst = useCallback(() => { lasObjekt(objektId).then(l => setLage(l)); }, [objektId]);
  const tillbaka = `/objekt?ar=${manad.ar}&manad=${manad.manad}`;

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD, fontFamily: FONT, WebkitFontSmoothing: 'antialiased', paddingBottom: AVSTAND.xxl }}>
      <style>{designCss}{KOLUMN_CSS}</style>
      <VyKolumn>
        <div style={{ paddingTop: AVSTAND.s, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Link href={tillbaka} style={{ ...KNAPP.lank, textDecoration: 'none', gap: AVSTAND.xs }}>
            <Ikon namn="chevron_left" storlek={IKON.rad} farg="inherit" />
            {manadEtikett(manad)}
          </Link>
          {lage.lage === 'klar' && <button type="button" style={KNAPP.lank} onClick={() => setAndra(true)} data-andra="">Ändra</button>}
        </div>
        {kvitto && <p role="status" data-kvitto="" style={{ margin: `${AVSTAND.s}px ${AVSTAND.xs}px 0`, ...TYP.meta, color: FARG.text2 }}>{kvitto}</p>}
        <Tillstand nyckel={lage.lage}>
          {lage.lage === 'laddar' && <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Läser objektet …</p>}
          {lage.lage === 'saknas' && <p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Objektet finns inte längre. Gå tillbaka till listan.</p>}
          {lage.lage === 'fel' && (
            <div role="alert" style={{ padding: `${AVSTAND.xl}px 0`, textAlign: 'center' }}>
              <p style={{ ...TYP.text, color: FARG.orange, margin: `0 0 ${AVSTAND.s}px` }}>Kunde inte läsa objektet. {lage.text}</p>
              <button type="button" style={KNAPP.lank} onClick={() => setForsok(n => n + 1)}>Försök igen</button>
            </div>
          )}
          {lage.lage === 'klar' && <Innehall o={lage.objekt} geo={lage.geo} geoFel={lage.geoFel} />}
        </Tillstand>
      </VyKolumn>

      {andra && lage.lage === 'klar' && (
        <AndraObjektArk objekt={lage.objekt} forvaldManad={manad} onStang={() => setAndra(false)}
          onFlyttad={text => { setAndra(false); setKvitto(text); laddaOmTyst(); }}
          onBorttagen={() => router.replace(tillbaka)} />
      )}
    </div>
  );
}

function Innehall({ o, geo, geoFel }: { o: Objekt; geo: GeoSammanfattning | null; geoFel: boolean }) {
  const id = tillstandId(o.status);
  const blad = traktkartor(o);
  const fara = geo?.faror ?? [];
  // Frågor ställs inte på avslutade objekt (Bågskyttebanan är avslutad men har en gammal OSÄKER-rad kvar).
  const fragorHar = id === 'klar' ? [] : fragor(o.import_varningar, o);
  const noter = noterat(o.import_varningar);
  const saknarVolym = !(typeof o.volym === 'number' && o.volym > 0);
  const [bladOppna, setBladOppna] = useState(false);
  const [noterOppna, setNoterOppna] = useState(false);
  const [filFel, setFilFel] = useState<string | null>(null);

  async function oppna(path: string | null) {
    setFilFel(null);
    if (!(await oppnaFil(path))) setFilFel('Filen gick inte att öppna just nu. Försök igen.');
  }

  const geoSaknas = geoFel ? 'Geometrin gick inte att läsa just nu' : 'Ingen geometri sparad för objektet';
  const volymText = saknarVolym ? null : `${fmtM3(visadVolym(o.volym))} m³fub`;

  return (
    <>
      {/* Namnet är vyns rubrik. Volymen ligger en nivå ned (meta-raden) — talet ska inte skrika högre än titeln i en vy som svarar på "vad är med i filen". */}
      <header style={{ padding: `${AVSTAND.m}px 0 ${AVSTAND.xl}px` }}>
        <h1 style={{ margin: 0, ...TYP.titel, overflowWrap: 'anywhere' }}>{o.namn}</h1>
        <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.text, color: FARG.text2 }}>{typNamn(o.typ)} · {TILLSTAND_TEXT[id]}</p>
        {(volymText || typeof o.areal === 'number') && (
          <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.listtitel, ...TNUM }}>
            {[volymText, typeof o.areal === 'number' ? `${fmtHa(o.areal)} ha` : null].filter(Boolean).join(' · ')}
          </p>
        )}
      </header>

      {/* Faran först: det är en risk i marken, inte en fil. */}
      {fara.length > 0 && (
        <Sektion rubrik="Fara">
          {fara.map((f, i) => (
            <Rad key={f.namn} sista={i === fara.length - 1} pil={false}
              titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}><Ikon namn="warning" farg={FARG.orange} />{f.namn} över trakten</span>}
              under={`${fmtM(f.meter)} ritad i filen`} attr={{ 'data-fara': f.namn }} />
          ))}
        </Sektion>
      )}

      {/* Det som kräver en människa — och bara det. Okänd PDF och osäker stämplingslängd är SAMMA fråga. */}
      {fragorHar.length > 0 && (
        <Sektion rubrik={fragorHar.length === 1 ? 'Fråga' : 'Frågor'}>
          {fragorHar.map((q, i) => <FragaKort key={q.nyckel} q={q} sista={i === fragorHar.length - 1} onOppna={oppna} />)}
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

        {/* Stämplingslängd visas när den finns. Att den saknas är normaltillståndet (4 av 42 slutavverkningar har en) och är ingen information. */}
        {o.stamplingslangd_url && <Rad titel="Stämplingslängd" under="Finns" onTryck={() => oppna(o.stamplingslangd_url)} />}
        {o.valtlapp_url && <Rad titel="Vältlappar" under="Finns" onTryck={() => oppna(o.valtlapp_url)} />}

        <Rad titel="Hänsyn" pil={false}
          under={geo == null ? geoSaknas
            : geo.hansyn == null ? 'Inga hänsynsytor i filen'
              : `${geo.hansyn.antal} ${geo.hansyn.antal === 1 ? 'yta' : 'ytor'} · ${fmtHa(geo.hansyn.ha)} ha${geo.hansyn.beskrivningar.length ? ` · ${geo.hansyn.beskrivningar.slice(0, 2).join(', ')}${geo.hansyn.beskrivningar.length > 2 ? ` +${geo.hansyn.beskrivningar.length - 2}` : ''}` : ''}`} />

        <Rad titel="Körning" pil={false}
          under={geo == null ? geoSaknas : [
            geo.basvag ? `Basväg ${fmtM(geo.basvag.meter)}${geo.basvag.antal > 1 ? ` (${geo.basvag.antal} st)` : ''}` : 'Ingen basväg i filen',
            ...geo.andraLinjer.map(l => `${l.namn} ${fmtM(l.meter)}`),
            geo.avlagg > 0 ? `${geo.avlagg} avlägg` : null,
          ].filter(Boolean).join(' · ')} />

        <Rad titel="Egenkontroll" pil={false} sista
          under={antalFragor(o.checklist_items) > 0 ? `${antalFragor(o.checklist_items)} frågor` : 'Inga frågor i filen'} />
      </Sektion>

      <Sektion rubrik="Om trakten">
        <Rad titel="Certifiering" under={certText(o.cert)} pil={false} />
        <Rad titel="GROT" under={o.grot ? 'Ja' : 'Nej'} pil={false} />
        <Rad titel="Markägare" under={o.markagare || 'Saknas i filen'} pil={false} />
        <Rad titel="Status" under={TILLSTAND_TEXT[id]} pil={false} sista />
      </Sektion>

      {noter.length > 0 && (
        <Sektion rubrik="Importen">
          <Rad titel={`Importnoteringar (${noter.length})`} dampad sista={!noterOppna} pil onTryck={() => setNoterOppna(v => !v)} />
          {noterOppna && noter.map((n, i) => <Rad key={i} titel={n} dampad pil={false} sista={i === noter.length - 1} />)}
        </Sektion>
      )}
    </>
  );
}

function FragaKort({ q, sista, onOppna }: { q: Fraga; sista: boolean; onOppna: (path: string | null) => void }) {
  return (
    <div data-fraga={q.nyckel} style={{ padding: `${AVSTAND.m}px 0`, borderBottom: sista ? 'none' : `1px solid ${FARG.linje}` }}>
      <p style={{ margin: 0, ...TYP.text }}>
        {q.nannderStamplingslangd
          ? `Är det här stämplingslängden? Filen hette ${q.fil} och hade inget namn vi känner igen. Anteckningen i filen nämner en stämplingslängd, så vi tolkade den som det.`
          : `Vad är ${q.fil}? Filen hade inget namn vi känner igen och ligger som övrigt dokument.`}
      </p>
      {/* Bara "Öppna filen": ett svar måste kunna bäras över en omimport, och det kan det inte än. */}
      <div style={{ marginTop: AVSTAND.s }}>
        <button type="button" onClick={() => onOppna(q.path)} disabled={!q.path} style={{ ...KNAPP.lank, ...(q.path ? null : INAKTIV) }}>Öppna filen</button>
      </div>
    </div>
  );
}
