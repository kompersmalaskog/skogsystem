'use client';

// Arbetsmiljö — EN sida för allt (2026-11-03). Svarar på EN fråga: "Är allt i ordning?".
// Överst svaret, sedan Om något händer (alltid, röd ikon) och en rad per del med läget i ord. Ett tryck går till delens egen vy.
// Texterna och reglerna: lib/arbetsmiljo/oversikt.ts. Varje del läses som i sin egen vy, så raden och vyn säger samma sak.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import Rad from '@/components/design/Rad';
import Sektion from '@/components/design/Sektion';
import Ikon from '@/components/design/Ikon';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, IKON, KNAPP, KORT, RADIE, ROT_MIN_HOJD, TRAFFYTA, TYP, VY_ROT, designCss, kolumnRot } from '@/lib/design/tokens';
import { hamtaMaskinkollVantar } from '@/lib/maskinkoll/data';
import { hamtaAtgardMarke } from '@/lib/arbetsmiljo/atgarder';
import { hamtaRonder, lage as rondLage } from '@/lib/arbetsmiljo/skyddsrond';
import { hamtaBedomningar, hamtaKvitton as hamtaRiskKvitton, typForMaskin } from '@/lib/arbetsmiljo/maskinRisk';
import { hamtaKvitton as hamtaIntroKvitton, introLage } from '@/lib/arbetsmiljo/introduktion';
import { byggRader, svar, type Indata, type OversiktRad } from '@/lib/arbetsmiljo/oversikt';
import { hamtaMinaRapporter, minaSammanfattning, ordnaMina, rapportTitel, rapportUnder, type MinRapport } from '@/lib/arbetsmiljo/lagatBesked';

type Last = { rader: OversiktRad[]; mina: MinRapport[] | null } | 'fel' | null;

/** Läser allt sidan behöver. En del som inte gick att läsa blir null — aldrig en gissning. */
async function lasIndata(): Promise<{ indata: Indata; mina: MinRapport[] | null } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data: jag, error } = await supabase.from('medarbetare')
    .select('id, roll, telefon, anhorig_telefon, maskin_id, skyddsombud').eq('epost', user.email).single();
  if (error || !jag) return null;
  const arAdmin = jag.roll === 'admin';
  const serArbetsledning = arAdmin || jag.skyddsombud === true;
  const tyst = <T,>(p: Promise<T>): Promise<T | null> => p.then(v => v, () => null);

  const [maskinkoll, atgarder, ronder, bedomningar, riskKvitton, maskin, introKvitton, mina] = await Promise.all([
    tyst(hamtaMaskinkollVantar(supabase)),
    serArbetsledning ? tyst(hamtaAtgardMarke(supabase)) : Promise.resolve(null),
    serArbetsledning ? tyst(hamtaRonder(supabase)) : Promise.resolve(null),
    tyst(hamtaBedomningar(supabase)),
    arAdmin ? Promise.resolve(null) : tyst(hamtaRiskKvitton(supabase)),
    !arAdmin && jag.maskin_id
      ? tyst(Promise.resolve(supabase.from('dim_maskin').select('maskin_typ').eq('maskin_id', jag.maskin_id).maybeSingle()))
      : Promise.resolve(null),
    arAdmin ? Promise.resolve(null) : tyst(hamtaIntroKvitton(supabase, jag.id)),
    tyst(hamtaMinaRapporter(supabase, jag.id)),
  ]);

  const maskinTyp = maskin && !maskin.error ? (maskin.data as { maskin_typ?: string } | null)?.maskin_typ : null;
  const indata: Indata = {
    arAdmin,
    serArbetsledning,
    medarbetareId: jag.id,
    maskinkoll: maskinkoll ?? null,
    atgarder: atgarder ?? null,
    skyddsrond: ronder ? rondLage(ronder, new Date()) : null,
    risk: bedomningar ? { bedomningar, kvitton: riskKvitton ?? null, minTyp: typForMaskin(maskinTyp) } : null,
    intro: arAdmin ? undefined : introKvitton ? introLage(jag, introKvitton.get(jag.id) ?? []) : null,
  };
  return { indata, mina: mina ?? null };
}

const TON_FARG = { orange: FARG.orange, rod: FARG.rod } as const;

export default function Arbetsmiljo() {
  const [last, setLast] = useState<Last>(null);
  const [visaMina, setVisaMina] = useState(false);

  // Pushen "Lagat" öppnar /arbetsmiljo?mina=1 → listan direkt.
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get('mina') === '1') setVisaMina(true); } catch { /* ingen adress */ }
  }, []);

  const hamta = useCallback(async () => {
    try {
      const d = await lasIndata();
      setLast(d ? { rader: byggRader(d.indata), mina: d.mina } : 'fel');
    } catch { setLast('fel'); }
  }, []);

  useEffect(() => {
    hamta();
    const synlig = () => { if (document.visibilityState === 'visible') hamta(); };
    document.addEventListener('visibilitychange', synlig);
    return () => document.removeEventListener('visibilitychange', synlig);
  }, [hamta]);

  const s = last && last !== 'fel' ? svar(last.rader) : null;

  return (
    <div style={{ ...VY_ROT, minHeight: ROT_MIN_HOJD }}>
      <style>{designCss}</style>
      <div style={{ ...kolumnRot('smal'), paddingTop: AVSTAND.l, paddingBottom: `calc(${AVSTAND.xxl}px + env(safe-area-inset-bottom))` }}>
        <header style={{ margin: `${AVSTAND.s}px 0 ${AVSTAND.xl}px` }}>
          <h1 data-testid="am-svar" style={{ margin: 0, ...TYP.titel, color: s?.ton ? TON_FARG[s.ton] : FARG.text }}>
            {last === null ? 'Läser …' : last === 'fel' ? 'Kunde inte läsa arbetsmiljön' : s!.text}
          </h1>
          {last === 'fel' && (
            <button type="button" onClick={() => { setLast(null); hamta(); }} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>Försök igen</button>
          )}
        </header>

        {/* Om något händer: alltid överst, samma rad som på startsidan. */}
        <Link href="/om-nagot-hander" data-testid="am-nod"
          style={{ ...KORT, display: 'flex', alignItems: 'center', gap: AVSTAND.m, minHeight: TRAFFYTA.min + AVSTAND.s, paddingTop: AVSTAND.s, paddingBottom: AVSTAND.s, marginBottom: AVSTAND.xl, color: FARG.text, textDecoration: 'none' }}>
          <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: RADIE.cirkel, background: FARG.rod, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill={FARG.text} d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" /></svg>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ ...TYP.listtitel, display: 'block' }}>Om något händer</span>
            <span style={{ ...TYP.meta, color: FARG.text2, display: 'block' }}>Ring 112 och vad du gör</span>
          </span>
          <Ikon namn="chevron_right" storlek={IKON.text} farg={FARG.text3} />
        </Link>

        {last && last !== 'fel' && (() => {
          // Det du rapporterat: bara när det finns något (eller inte gick att läsa). Ett tryck visar varje rapport och vad som hände.
          const visa = last.mina === null || last.mina.length > 0;
          return (
            <Sektion rubrik="Allt om arbetsmiljön">
              {last.rader.map((r, i) => (
                <Rad key={r.id} titel={r.titel} href={r.href} sista={!visa && i === last.rader.length - 1}
                  attr={{ 'data-am-rad': r.id }}
                  under={<span style={{ color: r.ton ? TON_FARG[r.ton] : undefined }}>{r.under}</span>} />
              ))}
              {visa && (
                <Rad titel="Det du rapporterat" sista attr={{ 'data-am-mina': '1' }}
                  under={last.mina === null ? 'Kunde inte läsas just nu' : minaSammanfattning(last.mina)}
                  onTryck={last.mina ? () => setVisaMina(true) : undefined} />
              )}
            </Sektion>
          );
        })()}
      </div>

      {visaMina && last && last !== 'fel' && (
        <Ark rubrik="Det du rapporterat" stang="Klar" onStang={() => setVisaMina(false)}>
          {last.mina === null ? (
            <p style={{ ...TYP.meta, color: FARG.text2 }}>Kunde inte läsas just nu.</p>
          ) : last.mina.length === 0 ? (
            <p style={{ ...TYP.meta, color: FARG.text2 }}>Du har inte rapporterat något än.</p>
          ) : (
            <Sektion rubrik="Senaste halvåret" kort={false}>
              {ordnaMina(last.mina).map((r, i, alla) => (
                <Rad key={r.id} titel={r.lagad ? <>✓ {rapportTitel(r)}</> : rapportTitel(r)} sista={i === alla.length - 1}
                  attr={{ 'data-am-min': r.id }}
                  under={<span style={{ color: r.lagad ? FARG.gron : FARG.text2 }}>{rapportUnder(r)}</span>} />
              ))}
            </Sektion>
          )}
        </Ark>
      )}
    </div>
  );
}
