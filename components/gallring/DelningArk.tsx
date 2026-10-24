'use client';
// "Första och andra gallring" — appens förslag på kartan och EN fråga: stämmer det?
// Appen har delat den gallrade ytan på stammarnas grovlek (lib/gallringDelar.ts). Den som vet bättre svarar:
// Stämmer / Tvärtom / Det var en gallring — eller RITAR OM gränsen (Martin 2026-10-22: "jag vill kunna rita om så det
// stämmer med verkligheten"). Svaret går före förslaget, och förslaget syns alltid.
//
// Rita om är ett läge i SAMMA ark: välj vilken del du ritar runt, tryck ett hörn i taget på kartan (ett tryck = exakt
// en punkt, samma regel som all ritning i appen), ↩ tar bort senaste hörnet, Spara sluter ringen. Den gallrade marken
// innanför är den delen, resten den andra.
import { useEffect, useMemo, useState } from 'react';
import { AVSTAND, DELFARG, FARG, KNAPP, RADIE, TRAFFYTA, TYP } from '@/lib/design/tokens';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import Rad from '@/components/design/Rad';
import Ikon from '@/components/design/Ikon';
import Flikkontroll from '@/components/design/Flikkontroll';
import GallradYtaKarta from './GallradYtaKarta';
import { YTA_FARG } from './GallradYtaArk';
import type { GallradYta } from '@/lib/gallradYta';
import {
  DEL_ORD, DELNING_ORD, type Del, type DelNamn, type Delning, type DelningSvar, type RitadDelning,
} from '@/lib/gallringDelar';
import { fmtDecimal } from '@/lib/gallring';

/** Delarnas färger: första, andra. Orden står alltid bredvid — färgen bär aldrig ensam. */
export const DEL_FARG: [string, string] = [DELFARG[0], DELFARG[1]];

const cm = (mm: number) => `${fmtDecimal(mm / 10, 1)} cm`;
const versal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Väster var första gallring, öster andra." — förslaget i en mening. */
export function forslagMening(d: Delning): string {
  if (!d.forslag) return 'Appen ser en gallring här.';
  const [a, b] = d.forslag;
  return `${versal(a.lage)} var första gallring, ${b.lage} andra.`;
}

/** Vad som gäller, i ord. */
export function delningGaller(d: Delning): string {
  if (d.svar === 'ritad') return d.delar ? `Ritad · ${d.delar[0].lage} första, ${d.delar[1].lage} andra` : 'Ritad gräns delar inte ytan';
  if (d.svar === 'en' || !d.forslag) return 'En gallring';
  if (d.svar === 'tvartom') return `${versal(d.forslag[1].lage)} första, ${d.forslag[0].lage} andra`;
  return `${versal(d.forslag[0].lage)} första, ${d.forslag[1].lage} andra`;
}

/** Den del man ritar runt först: den mindre (en kortare ring), annars första. */
export function forvaldRitDel(d: Delning): DelNamn {
  if (d.ritad) return d.ritad.del;
  const delar = d.delar ?? d.forslag;
  return delar && delar[1].andelYta < delar[0].andelYta ? 'andra' : 'forsta';
}

type Props = {
  yta: GallradYta;
  delning: Delning;
  arealHa: number;
  svarSparas: boolean;
  onSvar: (svar: DelningSvar | null, ritad?: RitadDelning) => Promise<void>;
  onStang: () => void;
};

export default function DelningArk({ yta, delning, arealHa, svarSparas, onSvar, onStang }: Props) {
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);
  const [ritar, setRitar] = useState(false);
  const [ritDel, setRitDel] = useState<DelNamn>(() => forvaldRitDel(delning));
  const [punkter, setPunkter] = useState<[number, number][]>([]);
  useEffect(() => { setFel(null); }, [delning.svar]);

  // Kartan visar det som gäller: efter "tvärtom" byter delarna färg; efter "en gallring" visas förslaget.
  const delar = useMemo(() => ({ rutor: delning.rutor, farg: DEL_FARG }), [delning.rutor]);
  const visade: [Del, Del] | null = delning.delar ?? delning.forslag;
  const sparadRing = useMemo(
    () => (delning.ritad ? { punkter: delning.ritad.ring, sluten: true } : null), [delning.ritad]);
  const ritRing = useMemo(() => ({ punkter, sluten: false }), [punkter]);

  const spara = async (svar: DelningSvar | null, ritad?: RitadDelning) => {
    setSparar(true);
    setFel(null);
    try {
      await onSvar(svar, ritad);
      return true;
    } catch (e) {
      setFel(e instanceof Error && e.message.includes('databasen') ? e.message : 'Svaret sparades inte. Försök igen.');
      return false;
    } finally {
      setSparar(false);
    }
  };

  if (ritar) {
    const kanSpara = punkter.length >= 3 && !sparar;
    return (
      <Ark rubrik="Rita gränsen" onStang={() => { setRitar(false); setPunkter([]); setFel(null); }}
        fot={
          <div style={{ display: 'flex', gap: AVSTAND.m }}>
            <button type="button" disabled={!punkter.length || sparar} onClick={() => setPunkter((p) => p.slice(0, -1))}
              aria-label="Ta bort senaste hörnet" data-rita-angra=""
              style={{ ...KNAPP.sekundar, width: 'auto', flex: '0 0 auto', opacity: punkter.length ? 1 : 0.4 }}>
              <Ikon namn="undo" farg="inherit" />
            </button>
            <button type="button" disabled={!kanSpara} data-rita-spara=""
              onClick={async () => {
                if (await spara('ritad', { del: ritDel, ring: punkter })) { setRitar(false); setPunkter([]); }
              }}
              style={{ ...KNAPP.primar, flex: 1, opacity: kanSpara ? 1 : 0.4 }}>
              {punkter.length < 3 ? `Spara · minst 3 hörn` : 'Spara gränsen'}
            </button>
          </div>
        }>
        <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text }}>Jag ritar runt</p>
        <Flikkontroll flikar={[['forsta', DEL_ORD.forsta], ['andra', DEL_ORD.andra]] as const} aktiv={ritDel} onVal={setRitDel} />
        <p style={{ margin: `${AVSTAND.m}px 0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }} data-rita-hjalp="">
          Tryck ett hörn i taget runt {DEL_ORD[ritDel].toLowerCase()}. Resten av den gallrade marken blir {DEL_ORD[ritDel === 'forsta' ? 'andra' : 'forsta'].toLowerCase()}.
          {punkter.length > 0 && ` · ${punkter.length} hörn`}
        </p>
        <GallradYtaKarta yta={yta} farg={YTA_FARG} flygfoto stammar={false} delar={delar} ring={ritRing}
          onTryck={(p) => setPunkter((q) => [...q, p])} />
        {fel && <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.text, color: FARG.rod }} data-delning-fel="">{fel}</p>}
      </Ark>
    );
  }

  return (
    <Ark rubrik="Första och andra gallring" stang="Klar" onStang={onStang}>
      <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text }} data-delning-forslag="">
        {delning.svar === 'ritad' ? 'Du har ritat gränsen.' : forslagMening(delning)}
      </p>
      <p style={{ margin: `0 0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }}>
        {delning.svar === 'ritad'
          ? `Appens förslag: ${forslagMening(delning).replace(/\.$/, '').toLowerCase()}.`
          : 'Appen ser det på de avverkade stammarnas grovlek. Den klenare delen räknas som första gallring.'}
      </p>

      <GallradYtaKarta yta={yta} farg={YTA_FARG} flygfoto stammar={false} delar={delar} ring={sparadRing} />
      {visade && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: `${AVSTAND.xs}px ${AVSTAND.l}px`, margin: `${AVSTAND.s}px 0 ${AVSTAND.l}px`, ...TYP.meta, color: FARG.text2 }}>
          {visade.map((d, i) => (
            <span key={d.namn} style={{ display: 'inline-flex', alignItems: 'center', gap: AVSTAND.xs }} data-delning-del={d.namn}>
              <span aria-hidden="true" style={{ width: AVSTAND.l, height: AVSTAND.m, borderRadius: RADIE.stapel, background: DEL_FARG[i] }} />
              {DEL_ORD[d.namn]} · {fmtDecimal(d.andelYta * arealHa, 1)} ha · median {cm(d.medianDbhMm)}
            </span>
          ))}
        </div>
      )}
      {delning.ritadDelarInte && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text, color: FARG.orange }} data-ritad-delar-inte="">
          Gränsen du ritade delar inte den gallrade marken – allt hamnade på samma sida. Rita om den.
        </p>
      )}

      {!svarSparas && (
        <p style={{ margin: `0 0 ${AVSTAND.m}px`, ...TYP.text, color: FARG.orange }} data-svar-sparas-inte="">
          Svaret kan inte sparas just nu. Appens förslag gäller.
        </p>
      )}
      <Sektion rubrik="Stämmer det?" kort={false}>
        {delning.forslag && (Object.entries(DELNING_ORD) as [DelningSvar, string][]).map(([nyckel, ord]) => (
          <Rad key={nyckel} titel={ord}
            under={nyckel === 'tvartom' ? `${versal(delning.forslag![1].lage)} var första gallring` : undefined}
            hoger={delning.svar === nyckel ? <Ikon namn="check" farg={FARG.text} /> : undefined}
            onTryck={svarSparas && !sparar && delning.svar !== nyckel ? () => spara(nyckel) : undefined}
            pil={false} dampad={!svarSparas} attr={{ 'data-delning-svar': nyckel }} />
        ))}
        <Rad titel="Rita om" under="Rita gränsen själv på kartan" sista
          hoger={delning.svar === 'ritad' ? <Ikon namn="check" farg={FARG.text} /> : undefined}
          onTryck={svarSparas && !sparar ? () => { setRitDel(forvaldRitDel(delning)); setPunkter([]); setFel(null); setRitar(true); } : undefined}
          dampad={!svarSparas} attr={{ 'data-delning-rita': '' }} />
      </Sektion>
      {delning.svar && svarSparas && (
        <button type="button" disabled={sparar} onClick={() => spara(null)} data-delning-aterga=""
          style={{ background: 'none', border: 'none', padding: `${AVSTAND.m}px 0`, minHeight: TRAFFYTA.min, color: FARG.bla, ...TYP.text, cursor: 'pointer' }}>
          {delning.forslag ? 'Återgå till appens förslag' : 'Ta bort ritningen'}
        </button>
      )}
      {fel && <p style={{ margin: `${AVSTAND.m}px 0 0`, ...TYP.text, color: FARG.rod }} data-delning-fel="">{fel}</p>}
    </Ark>
  );
}
