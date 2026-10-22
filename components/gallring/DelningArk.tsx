'use client';
// "Första och andra gallring" — appens förslag på kartan och EN fråga: stämmer det?
// Appen har delat den gallrade ytan på stammarnas grovlek (lib/gallringDelar.ts). Den som vet bättre svarar:
// Stämmer / Tvärtom / Det var en gallring. Svaret går före förslaget, och förslaget syns alltid.
import { useEffect, useMemo, useState } from 'react';
import { AVSTAND, DELFARG, FARG, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ikon from '@/components/design/Ikon';
import GallradYtaKarta from './GallradYtaKarta';
import { YTA_FARG } from './GallradYtaArk';
import type { GallradYta } from '@/lib/gallradYta';
import { DEL_ORD, DELNING_ORD, type Delning, type DelningSvar } from '@/lib/gallringDelar';
import { fmtDecimal } from '@/lib/gallring';

/** Delarnas färger: första, andra. Orden står alltid bredvid — färgen bär aldrig ensam. */
export const DEL_FARG: [string, string] = [DELFARG[0], DELFARG[1]];

const cm = (mm: number) => `${fmtDecimal(mm / 10, 1)} cm`;

/** "Väster var första gallring, öster andra." — förslaget i en mening. */
export function forslagMening(d: Delning): string {
  const [a, b] = d.forslag;
  return `${versal(a.lage)} var första gallring, ${b.lage} andra.`;
}
const versal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Vad som gäller, i ord. */
export function delningGaller(d: Delning): string {
  if (d.svar === 'en') return 'En gallring';
  if (d.svar === 'tvartom') return `${versal(d.forslag[1].lage)} första, ${d.forslag[0].lage} andra`;
  return `${versal(d.forslag[0].lage)} första, ${d.forslag[1].lage} andra`;
}

type Props = {
  yta: GallradYta;
  delning: Delning;
  arealHa: number;
  svarSparas: boolean;
  onSvar: (svar: DelningSvar | null) => Promise<void>;
  onStang: () => void;
};

export default function DelningArk({ yta, delning, arealHa, svarSparas, onSvar, onStang }: Props) {
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  useEffect(() => { setFel(null); }, [delning.svar]);
  // Kartan visar det som gäller: efter "tvärtom" byter delarna färg; efter "en gallring" visas förslaget.
  const delar = useMemo(() => ({ rutor: delning.rutor, farg: DEL_FARG }), [delning.rutor]);
  const visade = delning.delar ?? delning.forslag;

  const svara = async (svar: DelningSvar | null) => {
    setSparar(true);
    setFel(null);
    try {
      await onSvar(svar);
    } catch (e) {
      setFel(e instanceof Error && e.message.includes('databasen') ? e.message : 'Svaret sparades inte. Försök igen.');
    } finally {
      setSparar(false);
    }
  };

  return (
    <Ark rubrik="Första och andra gallring" stang="Klar" onStang={onStang}>
      <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text }} data-delning-forslag="">
        {forslagMening(delning)}
      </p>
      <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }}>
        Appen ser det på de avverkade stammarnas grovlek. Den klenare delen räknas som första gallring.
      </p>

      <GallradYtaKarta yta={yta} farg={YTA_FARG} flygfoto stammar={false} delar={delar} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${AVSTAND.xs}px ${AVSTAND.l}px`, margin: `${AVSTAND.s}px 0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }}>
        {visade.map((d, i) => (
          <span key={d.namn} style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }} data-delning-del={d.namn}>
            <span aria-hidden="true" style={{ width: AVSTAND.l, height: AVSTAND.m, borderRadius: RADIE.stapel, background: DEL_FARG[i] }} />
            {DEL_ORD[d.namn]} · {fmtDecimal(d.andelYta * arealHa, 1)} ha · median {cm(d.medianDbhMm)}
          </span>
        ))}
      </div>

      {!svarSparas && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text, color: FARG.orange }} data-svar-sparas-inte="">
          Svaret kan inte sparas just nu. Appens förslag gäller.
        </p>
      )}
      <Sektion rubrik="Stämmer det?" kort={false}>
        {(Object.entries(DELNING_ORD) as [DelningSvar, string][]).map(([nyckel, ord], i, alla) => (
          <Rad key={nyckel} titel={ord} sista={i === alla.length - 1}
            under={nyckel === 'tvartom' ? `${versal(delning.forslag[1].lage)} var första gallring` : undefined}
            hoger={delning.svar === nyckel ? <Ikon namn="check" farg={FARG.text} /> : undefined}
            onTryck={svarSparas && !sparar && delning.svar !== nyckel ? () => svara(nyckel) : undefined}
            pil={false} dampad={!svarSparas} attr={{ 'data-delning-svar': nyckel }} />
        ))}
      </Sektion>
      {delning.svar && svarSparas && (
        <button type="button" disabled={sparar} onClick={() => svara(null)}
          style={{ background: 'none', border: 'none', padding: `${AVSTAND.m}px 0`, minHeight: TRAFFYTA.min, color: FARG.bla, ...TYP.text, cursor: 'pointer' }}>
          Återgå till appens förslag
        </button>
      )}
      {fel && <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.text, color: FARG.rod }} data-delning-fel="">{fel}</p>}
    </Ark>
  );
}
