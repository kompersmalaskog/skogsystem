'use client';

// Arket för EN rad (en artikel på en plats). Tryck på raden öppnar det; handlingen ligger här, aldrig på raden.
//
//   Förbrukning: primärknappen är Tog 1 (det vanligaste man gör). Ändra › och Flytta › under.
//   Utrustning:  primärknappen är Flytta (mutterknackaren lånas ut). Ändra › under.
//
// Undervyerna (Ändra, Till maskin, Flytta, Ta bort) öppnas i SAMMA ark — inga ark på ark. Avbryt i en undervy tar
// tillbaka huvudvyn, inte stänger arket: det man fyllt i överlever (som Utbildningens Registrera-ark).

import { useMemo, useState, type ReactNode } from 'react';
import Ark from '@/components/design/Ark';
import Falt from '@/components/design/Falt';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import TalRad from '@/components/design/TalRad';
import { AVSTAND, FARG, INAKTIV, KNAPP, TNUM, TYP } from '@/lib/design/tokens';
import { andraArtikel, andraRad, flytta, justera, taBortRad, taUt, type ArtikelAndring, type RadAndring } from '@/lib/inventarier/data';
import type { Artikel, Maskin, Plats, VisadRad } from '@/lib/inventarier/typer';
import { antalText, artikelTitel, heltal, maskinNamn, platsText, sitterPaForslag } from '@/lib/inventarier/vy';
import { ArkFel, ValRad } from './delar';

type Vy = 'huvud' | 'andra' | 'maskin' | 'flytta' | 'taBort';

/** Under minnivå-fältet: vad minnivån betyder. Står en gång, i arket. */
export const MIN_FORKLARING = 'Du får en notis när det går under. Räkna med att det ska räcka tills nästa leverans är här.';

type Props = {
  v: VisadRad;
  platser: Plats[];
  maskiner: Maskin[];
  artiklar: Artikel[];
  /** Antal rader artikeln har på ANDRA platser — ändras namnet ändras det där också, och arket säger det. */
  andraPlatser: number;
  onStang: () => void;
  /** Sparat: stäng, läs om och visa kvittot (en rad nertill i vyn). */
  onKlar: (kvitto: string) => void;
};

export default function RadArk({ v, platser, maskiner, artiklar, andraPlatser, onStang, onKlar }: Props) {
  const { rad, artikel, plats } = v;
  const forbrukning = artikel.typ === 'forbrukning';
  const [vy, setVy] = useState<Vy>('huvud');
  const [fel, setFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);

  // Ändra-fälten. Startvärdena är det som står nu; Spara är grå tills något skiljer sig.
  const [namn, setNamn] = useState(artikel.namn);
  const [sitterPa, setSitterPa] = useState(artikel.sitter_pa ?? '');
  const [maskinId, setMaskinId] = useState<string | null>(artikel.maskin_id);
  const [artikelnr, setArtikelnr] = useState(artikel.artikelnr ?? '');
  const [leverantor, setLeverantor] = useState(artikel.leverantor ?? '');
  const [hylla, setHylla] = useState(rad.hylla ?? '');
  const [antal, setAntal] = useState(rad.antal == null ? '' : String(rad.antal));
  const [minAntal, setMinAntal] = useState(rad.min_antal == null ? '' : String(rad.min_antal));

  const titel = artikelTitel(artikel);
  const maskin = maskinId ? maskiner.find(m => m.maskin_id === maskinId) ?? null : null;

  const artikelAndring: ArtikelAndring = useMemo(() => {
    const a: ArtikelAndring = {};
    const t = (s: string) => s.trim() || null;
    if (namn.trim() !== artikel.namn) a.namn = namn.trim();
    if (t(sitterPa) !== (artikel.sitter_pa ?? null)) a.sitter_pa = t(sitterPa);
    if (maskinId !== artikel.maskin_id) a.maskin_id = maskinId;
    if (t(artikelnr) !== (artikel.artikelnr ?? null)) a.artikelnr = t(artikelnr);
    if (forbrukning && t(leverantor) !== (artikel.leverantor ?? null)) a.leverantor = t(leverantor);
    return a;
  }, [namn, sitterPa, maskinId, artikelnr, leverantor, artikel, forbrukning]);

  const nyttAntal = forbrukning ? heltal(antal) : null;
  const nyttMin = forbrukning ? (minAntal.trim() === '' ? null : heltal(minAntal)) : null;
  const radAndring: RadAndring = useMemo(() => {
    const r: RadAndring = {};
    const h = hylla.trim() || null;
    if (h !== (rad.hylla ?? null)) r.hylla = h;
    if (forbrukning && nyttMin !== rad.min_antal && !(minAntal.trim() !== '' && nyttMin == null)) r.min_antal = nyttMin;
    return r;
  }, [hylla, rad, forbrukning, nyttMin, minAntal]);
  const antalAndrat = forbrukning && nyttAntal != null && nyttAntal !== rad.antal;

  const ogiltigt = !namn.trim() || (forbrukning && (nyttAntal == null || (minAntal.trim() !== '' && nyttMin == null)));
  const andrat = Object.keys(artikelAndring).length > 0 || Object.keys(radAndring).length > 0 || antalAndrat;

  const tillbaka = () => {
    setFel(null);
    if (vy === 'maskin') setVy('andra');
    else if (vy === 'huvud') onStang();
    else setVy('huvud');
  };

  async function korTogEn() {
    setSparar(true); setFel(null);
    const s = await taUt(rad.id, 1);
    setSparar(false);
    if (!s.ok) { setFel(s.fel); return; }
    onKlar(`Tog 1 · ${antalText(s.varde, artikel.enhet)} kvar`);
  }

  async function korSpara() {
    setSparar(true); setFel(null);
    if (Object.keys(artikelAndring).length) {
      const s = await andraArtikel(artikel.id, artikelAndring);
      if (!s.ok) { setSparar(false); setFel(s.fel); return; }
    }
    if (Object.keys(radAndring).length) {
      const s = await andraRad(rad.id, radAndring);
      if (!s.ok) { setSparar(false); setFel(s.fel); return; }
    }
    if (antalAndrat && nyttAntal != null) {
      const s = await justera(rad.id, nyttAntal);
      if (!s.ok) { setSparar(false); setFel(s.fel); return; }
    }
    setSparar(false);
    onKlar('Sparat');
  }

  async function korFlytta(till: Plats) {
    setSparar(true); setFel(null);
    const s = await flytta(rad.id, till.id);
    setSparar(false);
    if (!s.ok) { setFel(s.fel); return; }
    onKlar(`Flyttad till ${till.namn}`);
  }

  async function korTaBort() {
    setSparar(true); setFel(null);
    const s = await taBortRad(rad.id);
    setSparar(false);
    if (!s.ok) { setFel(s.fel); return; }
    onKlar(`${titel} borttagen från ${plats.namn}`);
  }

  // ---- Fot: skärmens EN handling ----
  let fot: ReactNode = undefined;
  if (vy === 'huvud') {
    fot = forbrukning ? (
      <button type="button" onClick={korTogEn} data-testid="tog-1"
        style={{ ...KNAPP.primar, ...((sparar || (rad.antal ?? 0) === 0) ? INAKTIV : null) }}>
        {sparar ? 'Sparar…' : 'Tog 1'}
      </button>
    ) : (
      <button type="button" onClick={() => setVy('flytta')} style={KNAPP.primar}>Flytta</button>
    );
  } else if (vy === 'andra') {
    fot = (
      <button type="button" onClick={korSpara} data-testid="spara"
        style={{ ...KNAPP.primar, ...((!andrat || ogiltigt || sparar) ? INAKTIV : null) }}>
        {sparar ? 'Sparar…' : 'Spara'}
      </button>
    );
  }

  const rubrik = vy === 'flytta' ? `Flytta ${artikel.namn}` : vy === 'maskin' ? 'Till maskin' : vy === 'taBort' ? 'Ta bort' : titel;
  const forslag = vy === 'andra' ? sitterPaForslag(artiklar, maskinId, sitterPa) : [];

  return (
    <Ark rubrik={rubrik} onStang={tillbaka} fot={fot}>
      {vy === 'huvud' && (
        <>
          {forbrukning ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s, margin: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>
              <span style={{ ...TYP.tal, color: FARG.text }}>{rad.antal ?? 0}</span>
              <span style={{ ...TYP.text, color: FARG.text2, ...TNUM }}>
                kvar{rad.min_antal != null ? ` · min ${rad.min_antal}` : ''}
              </span>
            </div>
          ) : null}
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.l}px` }}>
            {[maskinNamn(v.maskin), platsText(plats, rad.hylla)].filter(Boolean).join(' · ')}
          </p>
          {forbrukning && (rad.antal ?? 0) === 0 && (
            <p style={{ ...TYP.meta, color: FARG.orange, margin: `0 0 ${AVSTAND.m}px` }}>Slut här. Fyll på med Kommit in eller rätta antalet.</p>
          )}
          <Sektion rubrik="Raden" kort={false}>
            <Rad titel="Ändra" under={forbrukning ? 'Antal, minnivå, hylla, namn' : 'Hylla, namn, maskin'} onTryck={() => setVy('andra')} />
            {forbrukning && <Rad titel="Flytta" onTryck={() => setVy('flytta')} />}
            <Rad titel={<span style={{ color: FARG.rod }}>Ta bort</span>} onTryck={() => setVy('taBort')} pil={false} sista />
          </Sektion>
          <ArkFel fel={fel} />
        </>
      )}

      {vy === 'andra' && (
        <>
          <Falt etikett="Namn" value={namn} onChange={setNamn}
            stod={andraPlatser > 0 ? `Namnet ändras också på ${andraPlatser === 1 ? 'en plats till' : `${andraPlatser} platser till`}.` : undefined} />
          {forbrukning && (
            <Sektion rubrik="Antal" kort={false}>
              <TalRad etikett="Antal" value={antal} onChange={setAntal} enhet={artikel.enhet !== 'st' ? artikel.enhet : undefined}
                under={nyttAntal == null ? 'Skriv ett heltal' : antalAndrat ? `Rättas från ${rad.antal ?? 0}` : 'kvar här'}
                underTon={nyttAntal == null ? 'orange' : 'dampad'} />
              <TalRad etikett="Minnivå" value={minAntal} onChange={setMinAntal} sista
                under={minAntal.trim() !== '' && nyttMin == null ? 'Skriv ett heltal' : nyttMin == null ? 'Utan minnivå säger appen aldrig till' : MIN_FORKLARING}
                underTon={minAntal.trim() !== '' && nyttMin == null ? 'orange' : 'dampad'} />
            </Sektion>
          )}
          <Falt etikett="Hylla (valfritt)" value={hylla} onChange={setHylla} placeholder="3" />
          <Sektion rubrik="Reservdel till maskin (valfritt)" kort={false}>
            <Rad titel="Till maskin" hoger={maskinNamn(maskin) ?? 'Ingen särskild'} onTryck={() => setVy('maskin')} sista />
          </Sektion>
          <Falt etikett="Sitter på (valfritt)" value={sitterPa} onChange={setSitterPa} placeholder="Hjularm vänster" />
          {forslag.length > 0 && (
            <Sektion rubrik="Skrivet förut" kort={false}>
              {forslag.map((f, i) => <Rad key={f} titel={f} onTryck={() => setSitterPa(f)} pil={false} sista={i === forslag.length - 1} />)}
            </Sektion>
          )}
          <Falt etikett="Artikelnummer (valfritt)" value={artikelnr} onChange={setArtikelnr} />
          {forbrukning && <Falt etikett="Leverantör (valfritt)" value={leverantor} onChange={setLeverantor} />}
          <ArkFel fel={fel} />
        </>
      )}

      {vy === 'maskin' && (
        <Sektion rubrik="Maskin" kort={false}>
          <ValRad titel="Ingen särskild" vald={maskinId == null} onTryck={() => { setMaskinId(null); setVy('andra'); }} />
          {maskiner.filter(m => m.aktiv || m.maskin_id === maskinId).map((m, i, alla) => (
            <ValRad key={m.maskin_id} titel={maskinNamn(m)} vald={maskinId === m.maskin_id}
              onTryck={() => { setMaskinId(m.maskin_id); setVy('andra'); }} sista={i === alla.length - 1} />
          ))}
        </Sektion>
      )}

      {vy === 'flytta' && (
        <>
          <Sektion rubrik="Vart?" kort={false}>
            {platser.filter(p => p.aktiv).map((p, i, alla) => p.id === plats.id ? (
              <Rad key={p.id} titel={p.namn} under="Här nu" dampad sista={i === alla.length - 1} />
            ) : (
              <Rad key={p.id} titel={p.namn} onTryck={() => { if (!sparar) korFlytta(p); }} sista={i === alla.length - 1}
                attr={{ 'data-flytta-till': p.id }} />
            ))}
          </Sektion>
          <ArkFel fel={fel} />
        </>
      )}

      {vy === 'taBort' && (
        <>
          <p style={{ ...TYP.text, color: FARG.text, margin: `${AVSTAND.s}px 0 ${AVSTAND.l}px` }}>
            Ta bort {titel} från {plats.namn}?
          </p>
          <button type="button" onClick={korTaBort} data-testid="bekrafta-ta-bort"
            style={{ ...KNAPP.destruktiv, ...(sparar ? INAKTIV : null) }}>
            Ta bort
          </button>
          <ArkFel fel={fel} />
        </>
      )}
    </Ark>
  );
}
