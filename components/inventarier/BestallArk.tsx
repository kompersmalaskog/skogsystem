'use client';

// Arket för en rad under "Att beställa".
//
//   Ej beställd: primärknappen är Beställd. Raden ligger kvar (dämpad, "Beställd 21 okt") men räknas inte i talet.
//   Beställd:    primärknappen är Kommit in, med antalet förifyllt upp till minnivån och en rad under som räknar om
//                ("blir 8 · min 6"). Under knappen "Inte beställd ändå" (tertiär) för den som tryckte fel.
//   Två lådor:   inget antal. Överst "Reservlådan påbörjad 21 okt av Stefan"; Kommit in fyller reservlådan igen.

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import TalRad from '@/components/design/TalRad';
import { AVSTAND, FARG, INAKTIV, KNAPP, TNUM, TYP } from '@/lib/design/tokens';
import { kommitIn, markeraBestalld } from '@/lib/inventarier/data';
import type { VisadRad } from '@/lib/inventarier/typer';
import { antalText, artikelTitel, datumKort, fornamn, forslagKommitIn, heltal, underText } from '@/lib/inventarier/vy';
import { ArkFel } from './delar';

type Props = {
  v: VisadRad;
  /** Namn den inloggade får läsa — "av Stefan" utelämnas annars. */
  personer?: { id: string; namn: string }[];
  onStang: () => void;
  onKlar: (kvitto: string) => void;
};

export default function BestallArk({ v, personer = [], onStang, onKlar }: Props) {
  const { rad, artikel } = v;
  const tvaLador = rad.tva_lador;
  const bestalld = !!rad.bestalld_tid;
  const [antal, setAntal] = useState(String(forslagKommitIn(rad)));
  const [fel, setFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);

  const tal = heltal(antal);
  const blir = tal != null ? (rad.antal ?? 0) + tal : null;

  async function korBestalld(ja: boolean) {
    setSparar(true); setFel(null);
    const s = await markeraBestalld(rad.id, ja);
    setSparar(false);
    if (!s.ok) { setFel(s.fel); return; }
    onKlar(ja ? `${artikel.namn} beställd` : `${artikel.namn} inte beställd`);
  }

  async function korKommitIn() {
    if (!tvaLador && (tal == null || tal < 1)) return;
    setSparar(true); setFel(null);
    const s = await kommitIn(rad.id, tvaLador ? 1 : tal!);
    setSparar(false);
    if (!s.ok) { setFel(s.fel); return; }
    onKlar(tvaLador ? `${artikel.namn} kommit in · fyll reservlådan` : `${artikel.namn} · ${antalText(s.varde, artikel.enhet)} kvar`);
  }
  const kanKommaIn = tvaLador || (tal != null && tal >= 1);
  const avNamn = personer.find(p => p.id === rad.reserv_oppnad_av)?.namn;

  const fot = bestalld ? (
    <>
      <button type="button" onClick={korKommitIn} data-testid="kommit-in"
        style={{ ...KNAPP.primar, ...((!kanKommaIn || sparar) ? INAKTIV : null) }}>
        {sparar ? 'Sparar…' : 'Kommit in'}
      </button>
      <button type="button" onClick={() => korBestalld(false)} style={{ ...KNAPP.tertiar, alignSelf: 'center', ...(sparar ? INAKTIV : null) }}>
        Inte beställd ändå
      </button>
    </>
  ) : (
    <button type="button" onClick={() => korBestalld(true)} data-testid="bestalld"
      style={{ ...KNAPP.primar, ...(sparar ? INAKTIV : null) }}>
      {sparar ? 'Sparar…' : 'Beställd'}
    </button>
  );

  const fakta = [
    artikel.leverantor ? { titel: 'Leverantör', varde: artikel.leverantor } : null,
    artikel.artikelnr ? { titel: 'Artikelnummer', varde: artikel.artikelnr } : null,
  ].filter((x): x is { titel: string; varde: string } => !!x);

  return (
    <Ark rubrik={artikelTitel(artikel)} onStang={onStang} fot={fot}>
      {tvaLador ? (
        <p style={{ ...TYP.text, color: FARG.text, margin: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }} data-testid="reserv-status">
          {rad.reserv_oppnad_tid ? `Reservlådan påbörjad ${datumKort(rad.reserv_oppnad_tid)}${avNamn ? ` av ${fornamn(avNamn)}` : ''}` : 'Två lådor'}
        </p>
      ) : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: AVSTAND.s, margin: `${AVSTAND.s}px 0 ${AVSTAND.xs}px` }}>
          <span style={{ ...TYP.tal, color: FARG.text }}>{rad.antal ?? 0}</span>
          <span style={{ ...TYP.text, color: FARG.text2, ...TNUM }}>kvar · min {rad.min_antal ?? 0}</span>
        </div>
      )}
      <p style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 ${AVSTAND.l}px` }}>
        {underText(v)}{bestalld && rad.bestalld_tid ? ` · beställd ${datumKort(rad.bestalld_tid)}` : ''}
      </p>
      {fakta.length > 0 && (
        <Sektion rubrik="Beställ" kort={false}>
          {fakta.map((f, i) => <Rad key={f.titel} titel={f.titel} hoger={f.varde} sista={i === fakta.length - 1} />)}
        </Sektion>
      )}
      {bestalld && !tvaLador && (
        <Sektion rubrik="Kommit in" kort={false}>
          <TalRad etikett="Antal" value={antal} onChange={setAntal} sista
            enhet={artikel.enhet !== 'st' ? artikel.enhet : undefined}
            under={blir == null || (tal ?? 0) < 1 ? 'Skriv hur många som kom' : `blir ${blir} · min ${rad.min_antal ?? 0}`}
            underTon={blir == null || (tal ?? 0) < 1 ? 'orange' : 'dampad'} />
        </Sektion>
      )}
      <ArkFel fel={fel} />
    </Ark>
  );
}
