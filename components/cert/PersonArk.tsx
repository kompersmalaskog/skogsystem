'use client';
// Cert › Behörigheter — en förares ark. En grupp per behörighet: kursdatum, giltig till, intyg (foto), uppladdat hos SE.
// Längst ner växlarna för det som bara gäller vissa (ADR, naturvärdesbedömning). EN knapp: Spara, grå tills något ändrats.
import { useEffect, useMemo, useRef, useState } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Sektion from '@/components/design/Sektion';
import { Toggle } from '@/components/utbildning/ui';
import { komprimeraMarkeringFoto } from '@/lib/markeringFoto';
import { AVSTAND, FARG, INAKTIV, KNAPP, RAD, RADIE, TYP } from '@/lib/design/tokens';
import {
  andrad, autoGiltigTill, etikettText, giltig, giltighetText, startFalt, type Behorighet, type Falt as F, type Person,
} from '@/lib/cert/behorighet';
import { signeraIntyg, sparaPerson, type Vaxel } from '@/lib/cert/data';

const MINIATYR = 64;

type Props = { person: Person; vaxlar: Vaxel[]; idag: string; skapadAv: string | null; onStang: () => void; onSparat: () => void };

function tom(v: Vaxel): Behorighet {
  return { typId: v.typId, seKrav: v.seKrav, namn: v.namn, giltighetManader: v.giltighetManader, bevisId: null, kursdatum: null, giltigTill: null, intygPath: null, uppladdadSe: false };
}

export default function PersonArk({ person, vaxlar, idag, skapadAv, onStang, onSparat }: Props) {
  const harFran = useMemo(() => new Set(person.behorigheter.map(b => b.typId)), [person]);
  const [kravPa, setKravPa] = useState<Record<string, boolean>>(() => Object.fromEntries(vaxlar.map(v => [v.typId, harFran.has(v.typId)])));
  const [falt, setFalt] = useState<Record<string, F>>({});
  const [foton, setFoton] = useState<Record<string, { blob: Blob; url: string }>>({});
  const [bekrafta, setBekrafta] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [felText, setFelText] = useState<string | null>(null);

  // Grupperna: personens behörigheter (utom avslagna växlar) + påslagna växlar hen inte hade.
  const grupper = useMemo(() => {
    const ut = person.behorigheter.filter(b => kravPa[b.typId] !== false);
    for (const v of vaxlar) if (kravPa[v.typId] && !harFran.has(v.typId)) ut.push(tom(v));
    return ut;
  }, [person, vaxlar, kravPa, harFran]);

  const f = (b: Behorighet): F => falt[b.typId] ?? startFalt(b);
  const satt = (b: Behorighet, patch: Partial<F>) => setFalt(s => ({ ...s, [b.typId]: { ...(s[b.typId] ?? startFalt(b)), ...patch } }));

  const kravAndrat = vaxlar.filter(v => kravPa[v.typId] !== harFran.has(v.typId));
  const andrade = grupper.filter(b => andrad(b, f(b)));
  const kanSpara = (andrade.length > 0 || kravAndrat.length > 0) && andrade.every(b => giltig(f(b))) && !sparar;

  async function spara() {
    if (!kanSpara) return;
    setSparar(true); setFelText(null);
    try {
      await sparaPerson(
        person.id,
        andrade.map(b => ({ b, f: f(b), foto: foton[b.typId]?.blob ?? null })),
        kravAndrat.map(v => ({ typId: v.typId, pa: kravPa[v.typId] })),
        skapadAv,
      );
      onSparat();
    } catch (e: any) {
      setFelText(e?.message ?? 'Kunde inte spara.');
      setSparar(false);
    }
  }

  return (
    <Ark rubrik={person.namn} onStang={onStang}
      fot={<>
        {felText && <div role="alert" style={{ ...TYP.meta, color: FARG.rod }}>{felText}</div>}
        <button type="button" onClick={spara} disabled={!kanSpara} style={{ ...KNAPP.primar, ...(kanSpara ? null : INAKTIV) }}>
          {sparar ? 'Sparar…' : 'Spara'}
        </button>
      </>}>
      {grupper.map(b => {
        const v = f(b);
        const et = etikettText(b, idag);
        return (
          <Sektion key={b.typId} rubrik={`${b.namn} · SE-krav ${b.seKrav}`} kort={false}>
            {v.taBort ? (
              <div style={{ ...RAD, justifyContent: 'space-between' }}>
                <span style={{ ...TYP.text, color: FARG.text2 }}>Intyget tas bort när du sparar</span>
                <button type="button" style={KNAPP.lank} onClick={() => satt(b, { taBort: false })}>Ångra</button>
              </div>
            ) : (<>
              {et.lage !== 'ok' && b.bevisId && (
                <div style={{ ...TYP.meta, color: et.lage === 'snart' ? FARG.orange : FARG.rod, marginBottom: AVSTAND.s }}>
                  {et.lage === 'snart' ? `Går ut om ${et.text.split(' · ')[1]}` : 'Intyget har gått ut'}
                </div>
              )}
              <Falt etikett="Kursdatum" typ="date" value={v.kursdatum}
                onChange={k => satt(b, {
                  kursdatum: k,
                  giltigTill: autoGiltigTill(k, b.giltighetManader),
                  // Nytt kursdatum = ny kurs: det gamla intyget hos SE gäller inte den.
                  ...(b.bevisId && k !== b.kursdatum ? { uppladdadSe: false } : null),
                })}
                stod={!v.kursdatum && andrad(b, v) ? <span style={{ color: FARG.orange }}>Fyll i kursdatum för att spara</span> : undefined} />
              {b.giltighetManader != null && (
                <Falt etikett="Giltig till" typ="date" value={v.giltigTill} onChange={g => satt(b, { giltigTill: g })}
                  stod={v.giltigTill && v.kursdatum && v.giltigTill < v.kursdatum
                    ? <span style={{ color: FARG.orange }}>Giltig till ligger före kursdatum</span> : giltighetText(b.giltighetManader)} />
              )}
              <Intyg path={b.intygPath} ny={foton[b.typId]?.url ?? null}
                onFoto={(blob) => {
                  setFoton(s => { if (s[b.typId]) URL.revokeObjectURL(s[b.typId].url); return { ...s, [b.typId]: { blob, url: URL.createObjectURL(blob) } }; });
                  satt(b, { nyttFoto: true });
                }}
                onFel={setFelText} />
              <VaxelRad titel="Uppladdat hos SE" pa={v.uppladdadSe} onByt={pa => satt(b, { uppladdadSe: pa })} sista />
              {b.bevisId && (bekrafta === b.typId ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.l, flexWrap: 'wrap' }}>
                  <span style={{ ...TYP.text, color: FARG.text }}>Ta bort intyget?</span>
                  <button type="button" style={KNAPP.destruktiv} onClick={() => { satt(b, { taBort: true }); setBekrafta(null); }}>Ja, ta bort</button>
                  <button type="button" style={KNAPP.lank} onClick={() => setBekrafta(null)}>Behåll</button>
                </div>
              ) : (
                <button type="button" style={KNAPP.destruktiv} onClick={() => setBekrafta(b.typId)}>Ta bort intyget</button>
              ))}
            </>)}
          </Sektion>
        );
      })}

      {vaxlar.length > 0 && (
        <Sektion rubrik="Gäller också" kort={false}>
          {vaxlar.map((v, i) => (
            <VaxelRad key={v.typId} titel={v.etikett} under={v.namn} pa={!!kravPa[v.typId]} sista={i === vaxlar.length - 1}
              onByt={pa => setKravPa(s => ({ ...s, [v.typId]: pa }))} />
          ))}
        </Sektion>
      )}
    </Ark>
  );
}

/** En rad med av/på. HELA raden är tryckytan (44 px) — själva reglaget är bara 31 px högt. */
function VaxelRad({ titel, under, pa, onByt, sista }: { titel: string; under?: string; pa: boolean; onByt: (pa: boolean) => void; sista?: boolean }) {
  return (
    <div role="switch" aria-checked={pa} aria-label={titel} tabIndex={0} onClick={() => onByt(!pa)}
      onKeyDown={e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onByt(!pa); } }}
      style={{ ...RAD, justifyContent: 'space-between', cursor: 'pointer', borderBottom: sista ? 'none' : RAD.borderBottom }}>
      <div>
        <div style={{ ...TYP.text, color: FARG.text }}>{titel}</div>
        {under && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{under}</div>}
      </div>
      <span aria-hidden style={{ pointerEvents: 'none', lineHeight: 0 }}><Toggle checked={pa} onChange={() => {}} /></span>
    </div>
  );
}

/** Intyget: miniatyr när det finns, och knappen som öppnar kameran. */
function Intyg({ path, ny, onFoto, onFel }: { path: string | null; ny: string | null; onFoto: (b: Blob) => void; onFel: (t: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [arbetar, setArbetar] = useState(false);
  const arPdf = !ny && !!path && path.toLowerCase().endsWith('.pdf');

  useEffect(() => {
    let av = false;
    setUrl(null);
    if (path) signeraIntyg(path).then(u => { if (!av) setUrl(u); });
    return () => { av = true; };
  }, [path]);

  async function vald(e: React.ChangeEvent<HTMLInputElement>) {
    const fil = e.target.files?.[0];
    e.target.value = '';
    if (!fil) return;
    setArbetar(true); onFel(null);
    try { onFoto(await komprimeraMarkeringFoto(fil)); }
    catch { onFel('Kunde inte läsa bilden. Försök igen.'); }
    setArbetar(false);
  }

  const visa = ny ?? url;
  const finns = !!(ny || path);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.m, marginBottom: AVSTAND.s }}>
      {finns && (arPdf ? (
        <a href={url ?? undefined} target="_blank" rel="noreferrer" data-cert-intyg="pdf" style={{ ...KNAPP.lank, textDecoration: 'none' }}>Öppna intyget (PDF)</a>
      ) : visa ? (
        <a href={visa} target="_blank" rel="noreferrer" aria-label="Öppna intyget" style={{ flexShrink: 0, lineHeight: 0 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={visa} alt="Intyget" data-cert-intyg="bild" style={{ width: MINIATYR, height: MINIATYR, objectFit: 'cover', borderRadius: RADIE.rad, background: FARG.fyllning }} />
        </a>
      ) : (
        <div aria-hidden style={{ width: MINIATYR, height: MINIATYR, borderRadius: RADIE.rad, background: FARG.fyllning, flexShrink: 0 }} />
      ))}
      <input ref={ref} type="file" accept="image/*" capture="environment" onChange={vald} style={{ display: 'none' }} data-cert-kamera />
      <button type="button" onClick={() => ref.current?.click()} style={{ ...KNAPP.sekundar, flex: 1, width: 'auto' }}>
        {arbetar ? 'Läser bilden…' : finns ? 'Fota nytt intyg' : 'Fota intyg'}
      </button>
    </div>
  );
}
