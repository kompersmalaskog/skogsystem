'use client';
// Gallringslistan — svaret först: hur mycket som gallrats i år. Under det det som pågår, sedan de klara per månad.
// En rad = namn, när, volym. Allt annat (trädslag, Dgv, förare, maskin) bor i trakten, ett tryck bort.
import { AVSTAND, FARG, KNAPP, TYP } from '@/lib/design/tokens';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import { fmtAntal, fmtVolym, summeraVisad, type GallringRad } from '@/lib/gallring';
import { dagarText, delaUppLista, idagIso, kortSpann, senast } from '@/lib/gallringVy';

export type ListLage =
  | { typ: 'laddar' }
  | { typ: 'fel'; text: string }
  | { typ: 'klar'; rader: GallringRad[]; tidigareAr: number };

export default function GallringLista({ lage, ar, valt, onIgen }: { lage: ListLage; ar: number; valt: string | null; onIgen: () => void }) {
  return (
    <div data-gallring-lista="">
      <header style={{ marginBottom: AVSTAND.xl }}>
        <p style={{ margin: 0, ...TYP.micro, color: FARG.text2 }}>Gallrat {ar}</p>
        {lage.typ === 'klar' ? <Svar rader={lage.rader} /> : (
          <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text2 }}>
            {lage.typ === 'laddar' ? 'Hämtar gallringarna…' : 'Kunde inte läsa gallringarna.'}
          </p>
        )}
      </header>

      {lage.typ === 'fel' && (
        <div>
          <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.meta, color: FARG.text2 }}>{lage.text}</p>
          <button type="button" onClick={onIgen} style={KNAPP.sekundar}>Försök igen</button>
        </div>
      )}

      {lage.typ === 'klar' && (lage.rader.length === 0
        ? <Tom ar={ar} tidigareAr={lage.tidigareAr} />
        : <Rader rader={lage.rader} valt={valt} tidigareAr={lage.tidigareAr} />)}
    </div>
  );
}

function Svar({ rader }: { rader: GallringRad[] }) {
  const pagaende = rader.filter((r) => !r.skordningAvslutad).length;
  return (
    <>
      {/* Summan av de AVRUNDADE raderna — rubriken ska gå att kontrollräkna mot listan. */}
      <p style={{ margin: `${AVSTAND.xs}px 0 0`, ...TYP.tal }} data-svar="">{fmtVolym(summeraVisad(rader))} m³fub</p>
      <p style={{ margin: `${AVSTAND.s}px 0 0`, ...TYP.text, color: FARG.text2 }}>
        {fmtAntal(rader.length)} {rader.length === 1 ? 'trakt' : 'trakter'}
        {pagaende > 0 && ` · ${pagaende} pågår`}
      </p>
    </>
  );
}

function Rader({ rader, valt, tidigareAr }: { rader: GallringRad[]; valt: string | null; tidigareAr: number }) {
  const { pagaende, manader } = delaUppLista(rader);
  const idag = idagIso();
  return (
    <>
      {pagaende.length > 0 && (
        <Sektion rubrik="Pågår" inset>
          {pagaende.map((r, i) => (
            <TraktRad key={r.vo} rad={r} vald={r.vo === valt} sista={i === pagaende.length - 1}
              under={`Senast ${senast(r.sistaDatum, idag)} · ${dagarText(r.antalDagar)}`} />
          ))}
        </Sektion>
      )}
      {manader.map((m) => (
        <Sektion key={m.nyckel} rubrik={m.rubrik} inset>
          {m.rader.map((r, i) => (
            <TraktRad key={r.vo} rad={r} vald={r.vo === valt} sista={i === m.rader.length - 1}
              under={`${kortSpann(r)} · ${dagarText(r.antalDagar)}`} />
          ))}
        </Sektion>
      ))}
      <p style={{ margin: `0 ${AVSTAND.xs}px`, ...TYP.meta, color: FARG.text2 }}>
        Volymen kommer från skördarens filer. En trakt räknas på året då sista uttaget ligger.
        {tidigareAr > 0 && ` ${fmtAntal(tidigareAr)} ${tidigareAr === 1 ? 'trakt' : 'trakter'} från tidigare år visas inte.`}
      </p>
    </>
  );
}

function TraktRad({ rad, vald, sista, under }: { rad: GallringRad; vald: boolean; sista: boolean; under: string }) {
  return (
    // Vald rad (listan bredvid trakten) = upphöjd yta, aldrig blå — blått betyder bara "navigerar".
    <div style={vald ? { margin: `0 -${AVSTAND.l}px`, padding: `0 ${AVSTAND.l}px`, background: FARG.upphojt } : undefined}>
      <Rad
        titel={rad.namn}
        under={under}
        hoger={`${fmtVolym(rad.volymM3fub)} m³`}
        hogerUnder={`${fmtAntal(rad.stammar)} st`}
        href={`/gallring/${encodeURIComponent(rad.vo)}`}
        sista={sista}
        attr={{ 'data-trakt-rad': rad.vo, ...(vald ? { 'aria-current': 'page' } : {}) }}
      />
    </div>
  );
}

/** Tomt säger varför och vad som fyller listan. */
function Tom({ ar, tidigareAr }: { ar: number; tidigareAr: number }) {
  return (
    <p style={{ margin: 0, ...TYP.text, color: FARG.text2 }} data-tom="">
      {tidigareAr > 0
        ? `Ingen gallring har sitt sista uttag ${ar} ännu. ${fmtAntal(tidigareAr)} från tidigare år visas inte. Så fort en gallring körs i år dyker den upp här.`
        : 'Inga gallringar med uttag hittades. Listan fylls av objekt med huvudtyp Gallring som har skördarens filer inlästa.'}
    </p>
  );
}
