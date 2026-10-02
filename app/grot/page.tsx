'use client';
// ── GROT ─────────────────────────────────────────────────────────────────────
// Trakter där virket är avverkat och riset (GROT) ännu inte är hämtat. EN fråga: vilket ska hämtas
// härnäst? Två grupper — överst det markägaren vill ha bort (datum + skäl), under det som kan ta
// den tid det tar, äldst först. Tryck på en rad → arket (samma fem rader som objekt-arket i
// /oversikt-v2) med "Lägg i kö för …" och "Visa på kartan".
//
// Listan, medlemskapet och körd-regeln bor i lib/grotvy/lista.ts (ren logik, testad). Avstånd är
// ORS-vägavstånd till närmaste andra GROT-objekt — '–' tills det är känt, aldrig fågelväg.
// Ingen summa i rubriken, ingen bedömning, inga filter, inga inställningar.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCurrentMedarbetare } from '@/lib/CurrentMedarbetareContext';
import { maskinSlag, maskinVisningsnamn } from '@/lib/maskinNamn';
import PageContainer from '@/components/PageContainer';
import Tillstand from '@/components/design/Tillstand';
import { AVSTAND, FARG, FONT, KNAPP, LAYOUT, TYP, designCss, medSafeBotten } from '@/lib/design/tokens';
import { hamtaSenastePlatser, type PlatsForslag } from '../maskinflytt/senastePlats';
import type { MaskinKoItem } from '../oversikt/oversikt-types';
import { hamtaGrotRaw } from '@/lib/grotvy/hamta';
import { byggGrotLista, type GrotRad, type GrotRaw } from '@/lib/grotvy/lista';
import { avstandText, idagLokal } from '@/lib/grotvy/format';
import { hamtaVagKm, kandidatPar, korBegransat, narmasteVag, valjKandidater, type Punkt } from '@/lib/grotvy/avstand';
import GrotArk, { type ArkKo, type ArkSkotare } from './GrotArk';
import GrotListaVy from './GrotLista';

interface MaskinRad {
  maskin_id: string; visningsnamn: string | null; modell: string | null; tillverkare: string | null;
  maskin_typ: string | null; aktiv_till: string | null; skotar_roll: string | null;
}

const PARALLELLA_VAGANROP = 3; // skonar ORS (40/min) — förvärmd route_cache gör att nästan alla är cache-träffar

export default function GrotPage() {
  const { medarbetare, loading: rollLaddar } = useCurrentMedarbetare();
  const idag = useMemo(() => idagLokal(), []);

  const [raw, setRaw] = useState<GrotRaw | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [maskiner, setMaskiner] = useState<MaskinRad[]>([]);
  const [positioner, setPositioner] = useState<Map<string, PlatsForslag>>(new Map());
  const [maskinKo, setMaskinKo] = useState<MaskinKoItem[]>([]);
  const [koStatus, setKoStatus] = useState<'laddar' | 'klar' | 'fel'>('laddar');
  const [stodFel, setStodFel] = useState<string | null>(null);
  const [km, setKm] = useState<Record<string, number | null>>({});
  const [valt, setValt] = useState<string | null>(null);

  const levande = useRef(true);
  useEffect(() => { levande.current = true; return () => { levande.current = false; }; }, []);

  const lasKo = useCallback(async (): Promise<MaskinKoItem[] | null> => {
    const { data, error } = await supabase.from('maskin_ko').select('id, maskin_id, objekt_id, ordning, created_at').order('ordning').order('id');
    return error ? null : ((data || []) as MaskinKoItem[]);
  }, []);

  const ladda = useCallback(async () => {
    setLaddar(true); setFel(null); setStodFel(null); setKoStatus('laddar');
    try {
      const r = await hamtaGrotRaw(supabase);
      if (!levande.current) return;
      setRaw(r);
    } catch (e: any) {
      console.error('[GROT] kunde inte läsa listan', e);
      if (levande.current) { setFel('Kunde inte hämta GROT-listan. Kontrollera anslutningen och försök igen.'); setLaddar(false); }
      return;
    }
    setLaddar(false);

    // Stöddata — misslyckas den visas listan ändå, men utan det som kräver den, och det står.
    const [maskinRes, ko] = await Promise.all([
      supabase.from('dim_maskin').select('maskin_id, visningsnamn, modell, tillverkare, maskin_typ, aktiv_till, skotar_roll').order('maskin_id'),
      lasKo(),
    ]);
    if (!levande.current) return;
    setMaskinKo(ko ?? []);
    setKoStatus(ko ? 'klar' : 'fel');
    if (maskinRes.error) { setStodFel('Maskinerna kunde inte hämtas — "står här" och avstånd från skotare visas inte.'); return; }
    const alla = (maskinRes.data || []) as MaskinRad[];
    setMaskiner(alla);
    const skotIds = alla.filter((m) => maskinSlag(m.maskin_typ) === 'skotare' && (!m.aktiv_till || m.aktiv_till >= idag)).map((m) => m.maskin_id);
    const pl = await hamtaSenastePlatser(skotIds);
    if (!levande.current) return;
    setPositioner(pl.platser);
    if (pl.fel) setStodFel('Maskinernas lägen kunde inte hämtas — "står här" och avstånd från skotare visas inte.');
  }, [idag, lasKo]);
  useEffect(() => { ladda(); }, [ladda]);

  const skotare: ArkSkotare[] = useMemo(() => maskiner
    .filter((m) => maskinSlag(m.maskin_typ) === 'skotare' && (!m.aktiv_till || m.aktiv_till >= idag))
    .map((m) => ({ id: m.maskin_id, namn: maskinVisningsnamn(m), roll: m.skotar_roll, koordinat: positioner.get(m.maskin_id)?.koordinat ?? null })),
  [maskiner, positioner, idag]);

  const lista = useMemo(() => raw ? byggGrotLista(raw, {
    idag, platser: positioner, skotare: skotare.map((s) => ({ id: s.id, namn: s.namn })),
  }) : null, [raw, idag, positioner, skotare]);

  // ── Vägavstånd mellan GROT-objekten ──
  const punkter: Punkt[] = useMemo(() => (lista?.alla ?? [])
    .filter((r) => r.koordinat)
    .map((r) => ({ id: r.id, lat: r.koordinat!.lat, lng: r.koordinat!.lng })), [lista]);
  const kandidater = useMemo(() => valjKandidater(punkter), [punkter]);
  const begart = useRef<Set<string>>(new Set());
  useEffect(() => {
    const jobb: { nyckel: string; kor: () => Promise<number | null> }[] = [];
    kandidatPar(punkter).forEach((p) => {
      const nyckel = `${p.nyckel}@${p.fran.lat},${p.fran.lng};${p.till.lat},${p.till.lng}`;
      if (begart.current.has(nyckel)) return;
      begart.current.add(nyckel);
      jobb.push({ nyckel: p.nyckel, kor: () => hamtaVagKm(p.fran, p.till) });
    });
    if (!jobb.length) return;
    korBegransat(jobb.map((j) => j.kor), PARALLELLA_VAGANROP, (i, v) => {
      if (levande.current) setKm((prev) => ({ ...prev, [jobb[i].nyckel]: v }));
    });
  }, [punkter]);

  const radPer = useMemo(() => new Map((lista?.alla ?? []).map((r): [string, GrotRad] => [r.id, r])), [lista]);
  const maskinNamn = useCallback((id: string) => skotare.find((s) => s.id === id)?.namn
    || maskinVisningsnamn(maskiner.find((m) => m.maskin_id === id)) || id, [skotare, maskiner]);

  function hogerText(rad: GrotRad): string {
    if (rad.staarHar) return `${maskinNamn(rad.staarHar.maskinId)} står här`;
    const n = narmasteVag(rad.id, kandidater, km);
    return n ? avstandText(n.km, radPer.get(n.annanId)?.namn) : '–';
  }

  // ── Kö ──
  const laggIKo = useCallback(async (maskinId: string, objektId: string): Promise<string | null> => {
    const nu = await lasKo();
    if (!nu) return 'Kunde inte läsa kön. Försök igen.';
    if (!nu.some((k) => k.maskin_id === maskinId && k.objekt_id === objektId)) {
      const maxOrd = nu.filter((k) => k.maskin_id === maskinId).reduce((m, k) => Math.max(m, k.ordning), -1);
      const { error } = await supabase.from('maskin_ko').insert({ maskin_id: maskinId, objekt_id: objektId, ordning: maxOrd + 1 });
      if (error) return 'Kunde inte lägga i kön. Försök igen.';
    }
    // Verifiera på innehåll: raden ska finnas när vi läser tillbaka — insert utan fel bevisar inte det.
    const efter = await lasKo();
    if (!efter) return 'Kunde inte läsa kön efteråt. Ladda om sidan.';
    setMaskinKo(efter);
    return efter.some((k) => k.maskin_id === maskinId && k.objekt_id === objektId) ? null : 'Ändringen landade inte. Försök igen.';
  }, [lasKo]);

  const taBortKo = useCallback(async (koId: string): Promise<string | null> => {
    const { error } = await supabase.from('maskin_ko').delete().eq('id', koId);
    if (error) return 'Kunde inte ta bort ur kön. Försök igen.';
    const efter = await lasKo();
    if (!efter) return 'Kunde inte läsa kön efteråt. Ladda om sidan.';
    setMaskinKo(efter);
    return efter.some((k) => k.id === koId) ? 'Ändringen landade inte. Försök igen.' : null;
  }, [lasKo]);

  const valtRad = valt ? radPer.get(valt) ?? null : null;
  const koForValt: ArkKo | null = useMemo(() => {
    const objektId = valtRad?.objekt?.id;
    const post = objektId ? maskinKo.find((k) => k.objekt_id === objektId) : undefined;
    if (!post) return null;
    const egna = maskinKo.filter((k) => k.maskin_id === post.maskin_id).sort((a, b) => a.ordning - b.ordning || (a.id < b.id ? -1 : 1));
    return { post, maskinNamn: maskinNamn(post.maskin_id), plats: egna.findIndex((k) => k.id === post.id) + 1 };
  }, [valtRad, maskinKo, maskinNamn]);

  const antal = lista?.alla.length ?? 0;
  const tillstand = fel ? 'fel' : laddar || !lista ? 'laddar' : antal === 0 ? 'tom' : 'lista';

  return (
    <div style={{
      minHeight: '100vh', background: FARG.bg, color: FARG.text, fontFamily: FONT, boxSizing: 'border-box',
      paddingTop: LAYOUT.topbar, paddingBottom: medSafeBotten(AVSTAND.xxl),
    }}>
      <style>{designCss}</style>
      <PageContainer width="smal">
        <div style={{ paddingTop: AVSTAND.l }}>
          <h1 style={{ margin: 0, ...TYP.titel }}>GROT</h1>
          {tillstand === 'lista' && <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>{antal} objekt</div>}
        </div>

        {stodFel && <div style={{ ...TYP.meta, color: FARG.orange, marginTop: AVSTAND.m }}>{stodFel}</div>}

        <Tillstand nyckel={tillstand}>
          {tillstand === 'laddar' && (
            <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.sektion }}>Hämtar GROT-objekt …</div>
          )}
          {tillstand === 'fel' && (
            <div style={{ marginTop: AVSTAND.sektion, display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
              <div style={{ ...TYP.text, color: FARG.text2 }}>{fel}</div>
              <button onClick={ladda} style={KNAPP.sekundar}>Försök igen</button>
            </div>
          )}
          {tillstand === 'tom' && (
            <div style={{ marginTop: AVSTAND.sektion, ...TYP.text, color: FARG.text2 }}>
              Inget GROT väntar just nu. Här dyker en trakt upp när skördningen är avslutad och riset inte är hämtat.
            </div>
          )}
          {tillstand === 'lista' && lista && (
            <GrotListaVy lista={lista} idag={idag} hogerText={hogerText} onOppna={(r) => setValt(r.id)} />
          )}
        </Tillstand>
      </PageContainer>

      {valtRad && (
        <GrotArk
          key={valtRad.id}
          rad={valtRad}
          idag={idag}
          skotare={skotare}
          ko={koForValt}
          koStatus={koStatus}
          visaKnappar={!rollLaddar && medarbetare?.roll !== 'forare'}
          onLaggIKo={laggIKo}
          onTaBortKo={taBortKo}
          onClose={() => setValt(null)}
        />
      )}
    </div>
  );
}
