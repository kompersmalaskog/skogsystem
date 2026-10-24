'use client';
// "Behöver dig" — Redigerings startpunkt (Martin 2026-10-23: verkstaden för det automatiken missar).
// Svaret först som i markägarrapporten: frågan, antalet stort, en mening, EN vit knapp. Under det en rad per sak med
// appens förslag till höger ("Rp?"). Ett tryck öppnar arket, som tar en sak i taget med förslaget förvalt
// ("1 av 4" → "Spara Rotpost och ta nästa"). Allt i texten kommer ur lib/redigering/behoverDig.ts.

import { useMemo, useState } from 'react';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, RADIE, TNUM, TRAFFYTA, TYP, designCss } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ark from '@/components/design/Ark';
import Ikon from '@/components/design/Ikon';
import Svarsrad from '@/components/design/Svarsrad';
import {
  AVTALSFORM_ORD, FRAGA, SPECIAL_SVAR, forslagKort, varforText,
  type Sak, type BehoverGrupp, type FilJobb,
} from '@/lib/redigering/behoverDig';

type Kandidat = FilJobb['kandidater'][number];

export interface BehoverDigProps {
  saker: Sak[];
  /** Antal aktiva objekt (VO-grupper) — "Resten av N objekt är kopplat och ifyllt." */
  antalObjekt: number;
  onSparaFalt: (sak: Extract<Sak, { typ: 'falt' }>, varde: string) => Promise<boolean>;
  onKoppla: (jobb: FilJobb, kandidat: Kandidat) => Promise<boolean>;
  /** Filen hör inte till något objekt — dölj den (går att visa igen under "Äldre maskinfiler"). */
  onIgnorera: (jobb: FilJobb) => Promise<boolean>;
  /** Sök bland objekten när inget av förslagen stämmer. */
  sokObjekt: (sok: string) => Kandidat[];
  onOppnaObjekt: (grupp: BehoverGrupp) => void;
}

const etikett = (s: Extract<Sak, { typ: 'falt' }>, v: string) => (s.falt === 'avtalsform' ? AVTALSFORM_ORD[v] ?? v : v);

export default function BehoverDig({ saker, antalObjekt, onSparaFalt, onKoppla, onIgnorera, sokObjekt, onOppnaObjekt }: BehoverDigProps) {
  // Kön fryses när arket öppnas: en sak som besvaras försvinner ur `saker`, och då får "2 av 4" inte hoppa.
  const [ko, setKo] = useState<string[] | null>(null);
  const [klara, setKlara] = useState<{ sparade: number; hoppade: number; gjorda: Set<string> }>({ sparade: 0, hoppade: 0, gjorda: new Set() });

  const oppna = (start?: string) => {
    const nycklar = saker.map(s => s.nyckel);
    const fran = start ? Math.max(0, nycklar.indexOf(start)) : 0;
    setKo([...nycklar.slice(fran), ...nycklar.slice(0, fran)]);
    setKlara({ sparade: 0, hoppade: 0, gjorda: new Set() });
  };
  const stang = () => setKo(null);

  const nuvarande = useMemo(() => {
    if (!ko) return null;
    const nyckel = ko.find(k => !klara.gjorda.has(k) && saker.some(s => s.nyckel === k));
    return nyckel ? saker.find(s => s.nyckel === nyckel)! : null;
  }, [ko, klara, saker]);

  const klar = (nyckel: string, sparad: boolean) =>
    setKlara(k => ({ sparade: k.sparade + (sparad ? 1 : 0), hoppade: k.hoppade + (sparad ? 0 : 1), gjorda: new Set(k.gjorda).add(nyckel) }));

  return (
    <div data-behover-dig="">
      <style>{designCss}</style>
      {saker.length === 0 ? (
        <Svarsrad rubrik="Allt kopplat och ifyllt" rad={`${antalObjekt} objekt · inget behöver dig just nu`} />
      ) : (
        <header style={{ marginBottom: AVSTAND.xxl }} data-svar="">
          <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }}>Behöver något dig?</p>
          <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.tal }}>{saker.length === 1 ? '1 sak' : `${saker.length} saker`}</p>
          <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, ...TNUM }}>Resten av {antalObjekt} objekt är kopplat och ifyllt.</p>
          <button type="button" onClick={() => oppna()} data-ga-igenom=""
            style={{ ...KNAPP.primar, width: 'auto', display: 'inline-flex', marginTop: AVSTAND.xl }}>
            {saker.length === 1 ? 'Rätta den' : 'Gå igenom dem'}
          </button>
        </header>
      )}

      {saker.length > 0 && (
        <Sektion rubrik="Vad behöver dig?" not="Ett frågetecken är appens förslag. Du godkänner med ett tryck." inset>
          {saker.map((s, i) => (
            <Rad key={s.nyckel}
              titel={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s }}>
                <span aria-hidden="true" style={{ width: AVSTAND.s, height: AVSTAND.s, borderRadius: '50%', background: FARG.orange, flexShrink: 0 }} />
                {s.namn}
              </span>}
              under={s.under}
              hoger={forslagKort(s)}
              onTryck={() => oppna(s.nyckel)}
              sista={i === saker.length - 1}
              attr={{ 'data-sak': s.nyckel }} />
          ))}
        </Sektion>
      )}

      {ko && (
        nuvarande ? (
          nuvarande.typ === 'objekt' ? (
            <ObjektSakArk key={nuvarande.nyckel} sak={nuvarande}
              plats={`${ko.filter(k => klara.gjorda.has(k)).length + 1} av ${ko.length}`}
              onStang={stang}
              onKlar={sparad => klar(nuvarande.nyckel, sparad)}
              onSparaFalt={onSparaFalt}
              onOppnaObjekt={g => { stang(); onOppnaObjekt(g); }} />
          ) :
          <SakArk key={nuvarande.nyckel} sak={nuvarande}
            plats={`${ko.filter(k => klara.gjorda.has(k)).length + 1} av ${ko.length}`}
            onStang={stang}
            onKlar={sparad => klar(nuvarande.nyckel, sparad)}
            onSparaFalt={onSparaFalt} onKoppla={onKoppla} onIgnorera={onIgnorera} sokObjekt={sokObjekt}
            onOppnaObjekt={g => { stang(); onOppnaObjekt(g); }} />
        ) : (
          <Ark rubrik="Klart" stang="Klar" onStang={stang} fot={<button type="button" onClick={stang} style={KNAPP.primar}>Klar</button>}>
            <div style={{ textAlign: 'center', padding: `${AVSTAND.xl}px 0` }} data-allt-rattat="">
              <Ikon namn="check_circle" storlek={IKON.stor} farg={FARG.gron} fylld />
              <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.titel }}>{saker.length === 0 ? 'Allt är rättat' : 'Klart för nu'}</p>
              <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text2, ...TNUM }}>
                {klara.sparade} sparade{klara.hoppade > 0 ? ` · ${klara.hoppade} hoppade du över` : ''}
              </p>
            </div>
          </Ark>
        )
      )}
    </div>
  );
}

/** Ett val i en lista: fylld ring = valt, tom ring = går att välja. Formen bär informationen, inte färgen. */
function ValRad({ titel, under, hoger, vald, onValj, sista }: { titel: string; under?: string; hoger?: string; vald: boolean; onValj: () => void; sista?: boolean }) {
  return (
    <Rad titel={titel} under={under} pil={false} sista={sista} onTryck={onValj}
      attr={{ role: 'radio', 'aria-checked': String(vald) }}
      hoger={<span style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.s, ...TYP.meta, color: FARG.text2 }}>
        {hoger}
        <Ikon namn={vald ? 'check_circle' : 'radio_button_unchecked'} farg={vald ? FARG.text : FARG.text3} fylld={vald} />
      </span>} />
  );
}

function SakArk({ sak, plats, onStang, onKlar, onSparaFalt, onKoppla, onIgnorera, sokObjekt, onOppnaObjekt }: {
  sak: Sak; plats: string; onStang: () => void; onKlar: (sparad: boolean) => void;
  onSparaFalt: BehoverDigProps['onSparaFalt']; onKoppla: BehoverDigProps['onKoppla'];
  onIgnorera: BehoverDigProps['onIgnorera']; sokObjekt: BehoverDigProps['sokObjekt'];
  onOppnaObjekt: (g: BehoverGrupp) => void;
}) {
  const [sok, setSok] = useState('');
  const forval = sak.typ === 'falt' ? sak.forslag?.varde ?? null : sak.typ === 'fil' ? sak.jobb.kandidater[0]?.objekt_id ?? null : null;
  const [valt, setValt] = useState<string | null>(forval);
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState('');

  const hoppa = <button type="button" onClick={() => onKlar(false)} style={{ ...KNAPP.tertiar, alignSelf: 'center' }}>Hoppa över</button>;
  const kor = async (f: () => Promise<boolean>) => {
    setSparar(true); setFel('');
    const ok = await f();
    setSparar(false);
    if (ok) onKlar(true); else setFel('Det sparades inte. Försök igen, eller hoppa över och ta det i objektet.');
  };

  const huvud = (meta: string, fraga: string, svar: string, varfor: string) => (
    <div style={{ marginBottom: AVSTAND.xl }}>
      <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>{meta}</p>
      <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.text, color: FARG.text2 }}>{fraga}</p>
      <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.titel }} data-svar-ark="">{svar}</p>
      <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text }}>{varfor}</p>
    </div>
  );
  const felRad = fel ? <p role="alert" style={{ margin: 0, ...TYP.meta, color: FARG.rod }}>{fel}</p> : null;

  if (sak.typ === 'falt') {
    const fot = (
      <>
        {felRad}
        <button type="button" disabled={!valt || sparar} onClick={() => valt && kor(() => onSparaFalt(sak, valt))}
          style={{ ...KNAPP.primar, ...(!valt || sparar ? INAKTIV : {}) }} data-spara="">
          {sparar ? 'Sparar …' : valt ? `Spara ${etikett(sak, valt)} och ta nästa` : 'Välj ett svar'}
        </button>
        {hoppa}
      </>
    );
    return (
      <Ark rubrik={plats} onStang={onStang} fot={fot}>
        {huvud(
          [sak.namn, sak.grupp.rep.huvudtyp, sak.grupp.rep.vo_nummer && `VO ${sak.grupp.rep.vo_nummer}`].filter(Boolean).join(' · '),
          FRAGA[sak.falt],
          sak.forslag?.varde ? etikett(sak, sak.forslag.varde) : 'Inget förslag',
          varforText(sak.forslag),
        )}
        <Sektion rubrik="Välj" kort={false}>
          {sak.val.map((v, i) => (
            <ValRad key={v} titel={etikett(sak, v)}
              under={v === SPECIAL_SVAR ? 'Vindfälle, storm eller annat som inte går att jämföra' : undefined}
              hoger={sak.falt === 'avtalsform' && v !== SPECIAL_SVAR ? v : undefined}
              vald={valt === v} onValj={() => setValt(v)} sista={i === sak.val.length - 1} />
          ))}
        </Sektion>
      </Ark>
    );
  }

  if (sak.typ === 'fil') {
    const { jobb } = sak;
    const traffar = sokObjekt(sok).filter(k => !jobb.kandidater.some(x => x.objekt_id === k.objekt_id));
    const alla = [...jobb.kandidater, ...traffar];
    const valdKandidat = alla.find(k => k.objekt_id === valt) ?? null;
    const fot = (
      <>
        {felRad}
        <button type="button" disabled={!valdKandidat || sparar} onClick={() => valdKandidat && kor(() => onKoppla(jobb, valdKandidat))}
          style={{ ...KNAPP.primar, ...(!valdKandidat || sparar ? INAKTIV : {}) }} data-spara="">
          {sparar ? 'Kopplar …' : valdKandidat ? `Koppla till ${valdKandidat.object_name ?? 'objektet'}` : 'Välj ett objekt'}
        </button>
        <button type="button" disabled={sparar} onClick={() => kor(() => onIgnorera(jobb))}
          style={{ ...KNAPP.tertiar, alignSelf: 'center' }} data-ignorera="">
          Hör inte till något objekt
        </button>
        {hoppa}
      </>
    );
    return (
      <Ark rubrik={plats} onStang={onStang} fot={fot}>
        {huvud(
          sak.under,
          'Vilket objekt hör filen till?',
          jobb.namn ?? 'Namnlös fil',
          jobb.kandidater.length > 0 ? 'Namnet i filen liknar det här objektet mest.' : 'Inget objekt har ett namn som liknar filens. Sök fram det nedan.',
        )}
        {jobb.kandidater.length > 0 && (
          <Sektion rubrik="Troligast" kort={false}>
            {jobb.kandidater.map((k, i) => (
              <ValRad key={k.objekt_id} titel={k.object_name ?? `VO ${k.vo_nummer}`}
                under={k.vo_nummer ? `VO ${k.vo_nummer}` : undefined}
                vald={valt === k.objekt_id} onValj={() => setValt(k.objekt_id)} sista={i === jobb.kandidater.length - 1} />
            ))}
          </Sektion>
        )}
        <Sektion rubrik={jobb.kandidater.length > 0 ? 'Något annat objekt?' : 'Sök objekt'} kort={false}
          not="Filen ändras inte. Den knyts till objektet, så skotaren ser högarna.">
          <input value={sok} onChange={e => setSok(e.target.value)} placeholder="Namn eller VO-nummer" data-sok-objekt=""
            style={{ width: '100%', boxSizing: 'border-box', minHeight: TRAFFYTA.min, padding: `0 ${AVSTAND.m}px`, borderRadius: RADIE.knapp, border: 'none', background: FARG.upphojt, color: FARG.text, ...TYP.text, fontFamily: 'inherit', outline: 'none' }} />
          {traffar.map((k, i) => (
            <ValRad key={k.objekt_id} titel={k.object_name ?? `VO ${k.vo_nummer}`}
              under={k.vo_nummer ? `VO ${k.vo_nummer}` : undefined}
              vald={valt === k.objekt_id} onValj={() => setValt(k.objekt_id)} sista={i === traffar.length - 1} />
          ))}
          {sok.trim() !== '' && traffar.length === 0 && (
            <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.meta, color: FARG.text2 }}>Inget objekt heter så.</p>
          )}
        </Sektion>
      </Ark>
    );
  }

  return (
    <Ark rubrik={plats} onStang={onStang} fot={<>
      <button type="button" onClick={() => onOppnaObjekt(sak.grupp)} style={KNAPP.primar}>Öppna objektet</button>
      {hoppa}
    </>}>
      {huvud(sak.namn, 'Vad behöver rättas?', sak.under, 'Det här rättar du inne i objektet.')}
    </Ark>
  );
}

/**
 * Flera saker på samma objekt: frågorna en i taget (samma ark som annars), sist det som rättas inne i objektet.
 * "Hoppa över" på en fråga går till nästa. Objektraden räknas som klar när allt är genomgånget.
 */
function ObjektSakArk({ sak, plats, onStang, onKlar, onSparaFalt, onOppnaObjekt }: {
  sak: Extract<Sak, { typ: 'objekt' }>; plats: string; onStang: () => void; onKlar: (sparad: boolean) => void;
  onSparaFalt: BehoverDigProps['onSparaFalt']; onOppnaObjekt: (g: BehoverGrupp) => void;
}) {
  const [steg, setSteg] = useState(0);
  const [sparat, setSparat] = useState(false);
  const fraga = sak.fragor[steg];
  const vidare = (sparad: boolean) => {
    const nuSparat = sparat || sparad;
    setSparat(nuSparat);
    if (steg + 1 < sak.fragor.length || sak.ovrigt.length > 0) setSteg(steg + 1);
    else onKlar(nuSparat);
  };
  if (fraga) {
    return (
      <SakArk key={fraga.nyckel} sak={fraga} plats={plats} onStang={onStang} onKlar={vidare}
        onSparaFalt={onSparaFalt} onKoppla={async () => false} onIgnorera={async () => false} sokObjekt={() => []}
        onOppnaObjekt={onOppnaObjekt} />
    );
  }
  return (
    <Ark rubrik={plats} onStang={onStang} fot={<>
      <button type="button" onClick={() => onOppnaObjekt(sak.grupp)} style={KNAPP.primar} data-oppna-objekt="">Öppna objektet</button>
      <button type="button" onClick={() => onKlar(sparat)} style={{ ...KNAPP.tertiar, alignSelf: 'center' }}>Hoppa över</button>
    </>}>
      <div style={{ marginBottom: AVSTAND.xl }}>
        <p style={{ margin: 0, ...TYP.meta, color: FARG.text2 }}>{sak.namn}</p>
        <p style={{ margin: `${AVSTAND.l}px 0 0`, ...TYP.text, color: FARG.text2 }}>Det här rättar du inne i objektet</p>
      </div>
      <Sektion rubrik="Att rätta" kort={false}>
        {sak.ovrigt.map((t, i) => <Rad key={t} titel={t} pil={false} sista={i === sak.ovrigt.length - 1} />)}
      </Sektion>
    </Ark>
  );
}
