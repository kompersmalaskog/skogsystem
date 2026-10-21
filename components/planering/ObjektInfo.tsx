'use client';

// ObjektInfo = ramen (ark/panel) + de tre vyerna: kortet, Om trakten och Mer. Vilken vy som visas är komponentens eget tillstånd och börjar
// på kortet vid varje öppning. "Läs allt ›" och raden På trakten öppnar Om trakten; Mer-knappen öppnar Mer; ‹ tar tillbaka till kortet.
// Allt annat (vad en knapp GÖR, vad kartan gör) avgör sidan via callbacks.

import React, { useState } from 'react';
import { useSkarmLage } from '@/lib/hooks/useSkarmLage';
import InfoRam, { type InfoVy } from './InfoRam';
import ObjektKort, { type ObjektKortProps } from './ObjektKort';
import OmTrakten, { type OmNav, type OmTraktenProps } from './OmTrakten';
import MerMeny, { type MerMenyProps } from './MerMeny';
import VadBetyderKartan, { type VadBetyderKartanProps } from './VadBetyderKartan';
import { InstruktionLista } from './InstruktionKort';
import type { InstruktionerPaTrakten } from '@/lib/instruktioner/instruktioner';
import KlarMedTrakten, { type KlarMedTraktenProps } from './KlarMedTrakten';
import type { KartMarkering, KortKnappId } from '@/lib/objektKort';
import type { PlusLage } from '@/lib/plusArk';
import type { SlappOrsak } from '@/lib/omTraktenFramhav';

export interface ObjektInfoProps {
  oppen: boolean;
  onStang: () => void;
  objektNamn: string;
  /** objektets id — Om trakten använder det för att hitta foton som väntar på uppladdning */
  objektId: string | null;
  /** en knapp på kortet utom Mer (Mer öppnar Mer-vyn här) */
  onKnapp: (id: Exclude<KortKnappId, 'mer'>) => void;
  kort: Omit<ObjektKortProps, 'namn' | 'onStang' | 'onKnapp' | 'onLasAllt' | 'onPaTrakten'>;
  /** onVisa får även ramens läge: telefon stänger arket och flyger dit, bred skärm lämnar panelen */
  om: Omit<OmTraktenProps, 'objektNamn' | 'objektId' | 'onTillbaka' | 'onStang' | 'onVisa' | 'onSlapp' | 'onTyp'> & {
    onVisa: (m: KartMarkering, lage: PlusLage) => void; onSlapp: (orsak: SlappOrsak) => void;
    /** typvyn öppen (alla av typen markeras på kartan; ramens läge följer med så kameran vet vilken del av kartan som syns) eller stängd (null) */
    onTyp: (m: KartMarkering[] | null, lage: PlusLage) => void;
  };
  /** vilken vy som visas när ramen öppnas ('om' = telefonens "‹ Om trakten" tillbaka till listan); standard kortet */
  startVy?: InfoVy;
  mer: Omit<MerMenyProps, 'objektNamn' | 'onTillbaka' | 'onStang'>;
  /** "Klar med trakten?" (bara planerare, bara medan trakten planeras). null = ingen rad på kortet och ingen vy. */
  klar?: Omit<KlarMedTraktenProps, 'namn' | 'onStang'> | null;
  /** Teckenförklaringen "Vad betyder kartan": det som finns på trakten (våra markeringar + Vidas lager). */
  karta?: Pick<VadBetyderKartanProps, 'markeringar' | 'vida' | 'roll'> | null;
  /** MASKINLÄGET: instruktionerna på trakten (raden på kortet och listan bakom den) med förarens "✓ Sett". null = ingen rad, ingen vy. */
  instruktioner?: { data: InstruktionerPaTrakten; onSett: (nycklar: string[]) => void } | null;
}

export default function ObjektInfo({ oppen, onStang, objektNamn, objektId, onKnapp, kort, om, mer, klar = null, karta = null, instruktioner = null, startVy = 'kort' }: ObjektInfoProps) {
  const [vy, setVy] = useState<InfoVy>(startVy);
  const ramLage = useSkarmLage(oppen);
  // Var man stod i Om trakten när ett objekt stängde arket ("‹ Lista"): ges till Om trakten EN gång, sedan börjar den rent.
  const [aterstall, setAterstall] = useState<OmNav | undefined>(om.start);
  // Typvyn öppen → arket på halv höjd (kartan med de markerade objekten syns ovanför).
  const [typOppen, setTypOppen] = useState(!!om.start?.typ);
  // Varje öppning börjar på kortet (eller på Om trakten när sidan ber om det) — och Om trakten med det den hade när ett objekt stängde arket. Görs UNDER renderingen
  // (inte i en effekt): ramen monterar sitt innehåll i samma rendering som `oppen` slår om, så en effekt kommer för sent och Om trakten startade från listan.
  const [forraOppen, setForraOppen] = useState(oppen);
  if (oppen !== forraOppen) {
    setForraOppen(oppen);
    if (oppen) { setVy(startVy); setAterstall(startVy === 'om' ? om.start : undefined); setTypOppen(startVy === 'om' && !!om.start?.typ); }
  }
  // Bred skärm: panelen ligger kvar medan en markering är framhävd. Stängs Om trakten (×, Esc eller ‹ tillbaka) lämnas framhävningen. På telefon stänger
  // "Visa ›" arket SJÄLV — det är inte en stängning att reagera på, så där släpps den först av kartan, raden eller "‹ Om trakten".
  const stangOm = () => { if (vy === 'om' && ramLage === 'panel') om.onSlapp('stang'); };
  const stangRam = () => { stangOm(); if (vy === 'om') { om.onTyp(null, ramLage); om.onNav(null); } onStang(); };

  return (
    <InfoRam oppen={oppen} vy={vy} halv={vy === 'om' && typOppen} ariaLabel={vy === 'kort' ? 'Objektinfo' : vy === 'om' ? 'Om trakten' : vy === 'klar' ? 'Klar med trakten' : vy === 'karta' ? 'Vad betyder kartan' : vy === 'instruktioner' ? 'Instruktioner på trakten' : 'Mer'} onStang={stangRam}>
      {({ lage }) => (
        vy === 'klar' && klar ? (
          <KlarMedTrakten {...klar} namn={objektNamn} onStang={stangRam} onInfo={() => setVy('kort')} />
        ) : vy === 'kort' || (vy === 'klar' && !klar) || (vy === 'instruktioner' && !instruktioner) ? (
          <ObjektKort {...kort} instruktioner={instruktioner && instruktioner.data.antal > 0 ? { antal: instruktioner.data.antal, nya: instruktioner.data.nya, onOppna: () => setVy('instruktioner') } : null}
            namn={objektNamn} onStang={stangRam} onKlar={klar ? () => setVy('klar') : undefined}
            onKnapp={(id) => { if (id === 'mer') setVy('mer'); else onKnapp(id); }}
            onLasAllt={() => setVy('om')} onPaTrakten={() => setVy('om')} onKarta={karta ? () => setVy('karta') : undefined} />
        ) : vy === 'om' ? (
          <OmTrakten {...om} start={aterstall} onVisa={(m) => om.onVisa(m, lage)} onSlapp={() => om.onSlapp('rad')} onTyp={(m) => { setTypOppen(!!m); om.onTyp(m, lage); }}
            objektNamn={objektNamn} objektId={objektId} onTillbaka={() => { stangOm(); om.onTyp(null, lage); om.onNav(null); setAterstall(undefined); setTypOppen(false); setVy('kort'); }} onStang={stangRam} />
        ) : vy === 'instruktioner' && instruktioner ? (
          <InstruktionLista data={instruktioner.data} objektNamn={objektNamn} onSett={instruktioner.onSett} onTillbaka={() => setVy('kort')} onStang={stangRam} />
        ) : vy === 'karta' && karta ? (
          <VadBetyderKartan {...karta} objektNamn={objektNamn} onTillbaka={() => setVy('kort')} onStang={stangRam} />
        ) : (
          <MerMeny {...mer} objektNamn={objektNamn} onTillbaka={() => setVy('kort')} onStang={stangRam} />
        )
      )}
    </InfoRam>
  );
}
