'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Ark from '@/components/design/Ark';
import Sektion from '@/components/design/Sektion';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, KORT, RAD, TYP } from '@/lib/design/tokens';
import { haversine } from '@/utils/geo';
import { supabase } from '@/lib/supabase';
import { rimligGpsPunkt } from '@/app/maskinflytt/senastePlats';
import { kontrolleraFramme } from './framme';
import FrammeVarning from './FrammeVarning';
import FlyttSheet from '../FlyttSheet';
import {
  ateroppnaRunda, avbrytFlytt, avslutaFlytt, hittaDag, hittaNyligenStangd, sakraDag, skapaFlytt, startaHemresa, stangDag,
  type Ctx, type Dag, type FlyttPart, type Mal,
} from './dagSkriv';
import { oppenFlyttGaller } from './pagaende';
import { destKoordinat, narmastePlats, rangordnaDestinationer, type DestRad } from './destinationer';
import { lasUtkast, nyttUtkast, rensaUtkast, sparaUtkast, type Steg, type Utkast, type ValdPlats } from './flode';
import { getFarskGps, type Pos } from './gps';
import { KARTAPPAR, kanValjaKartapp, kartLank, lankAttr, lasKartapp, sparaKartapp, type Kartapp } from './kartapp';
import { avstandKort, osakerRad, sorteraMaskiner } from './maskinPos';
import { useHamtaData, type HamtaData } from './useHamtaData';
import {
  DestLista, EnkelRad, ExternArk, Fel, KartKnapp, KartappArk, Kvittorad, MaskinListeRad, Meta, PosVarningArk, Rubrik, RundaFragaArk,
  Fot, Topp,
} from './HamtaDelar';

/** Längre bort än så (fågelväg) mellan förarens GPS och där maskinen/trakten ska vara → frågan "Stämmer platsen?". */
export const RIMLIG_AVSTAND_KM = 2;

type Varning =
  | { typ: 'lassa'; gps: { lat: number; lng: number }; forvantad: { lat: number; lng: number }; km: number; namn: string }
  | { typ: 'lossa'; gps: { lat: number; lng: number }; forvantad: { lat: number; lng: number }; km: number; namn: string };

const tidKort = (iso: string) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));

/**
 * Hämta en maskin — ersätter förarflödet /maskinflytt (steg 3 av 4, 2026-10). Fyra steg, EN primärknapp per skärm som byter
 * innebörd efter hur långt man kommit: Öppna i Kartor → Vart ska X? → Öppna i Kartor → Vägen hem. Ingen egen navigering: kartappen
 * gör vägen. "Lassa" och "Lassat av här" är frivilliga — trycker föraren skapas flytten som förut och lastbilens vikt kopplar
 * lasset till den (ingen dubblett); trycker föraren inte tar vikten hand om det.
 */
export default function HamtaFlode({ onAvsluta, arAdmin = false, namn = 'admin' }: {
  onAvsluta: (kvitto: string) => void;
  /** Admin rättar en avslutad flytt i sheeten "Flytten" (samma som i Körningar); andra får en förklaring. */
  arAdmin?: boolean;
  /** Inloggad användares namn — `p_av` i rättningen. */
  namn?: string;
}) {
  // Hooks ligger ALLTID före tidiga returer (skillen: React #310 2026-10-02).
  const { lage, forsokIgen } = useHamtaData(true);
  const [utkast, setUtkast] = useState<Utkast>(() => lasUtkast() ?? nyttUtkast(new Date().toISOString()));
  const [sok, setSok] = useState('');
  const [fel, setFel] = useState<string | null>(null);
  const [sparar, setSparar] = useState(false);
  const [kartapp, setKartapp] = useState<Kartapp>('google');
  const [ark, setArk] = useState<'extern' | 'kartapp' | 'hamtplats' | 'andraLossad' | null>(null);
  const [rattKvitto, setRattKvitto] = useState<string | null>(null);
  const [varning, setVarning] = useState<Varning | null>(null);
  const [rundaFraga, setRundaFraga] = useState<{ rundaId: string; punkt: { lat: number; lng: number } } | null>(null);
  const [frammeVarning, setFrammeVarning] = useState<{ km: number } | null>(null);
  const startPos = useRef<Promise<Pos | null> | null>(null);
  const nuMs = useMemo(() => Date.now(), [lage]);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setKartapp(lasKartapp()); }, []);
  useEffect(() => { sparaUtkast(utkast); }, [utkast]);

  const data: HamtaData | null = lage.lage === 'klar' ? lage.data : null;
  const ctx: Ctx = useMemo(() => ({ forare: data?.forare ?? null, vin: data?.vin ?? null }), [data]);
  const andra = useCallback((delar: Partial<Utkast>) => setUtkast(u => ({ ...u, ...delar })), []);

  // Utan utkast: en öppen flytt som den här föraren redan har (lastade, appen stängdes) tas upp där den slutade.
  const aterupptagen = useRef(false);
  useEffect(() => {
    if (!data?.forare || aterupptagen.current || utkast.steg !== 'val') return;
    aterupptagen.current = true;
    void supabase.from('maskin_flytt').select('id, maskin_id, extern_maskin, kund, starttid, hamtad_tid')
      .is('sluttid', null).eq('avbruten', false).eq('medarbetare_id', data.forare.id)
      .order('starttid', { ascending: false }).limit(1)
      .then(({ data: rader }) => {
        const f = rader?.[0];
        // En öppen flytt äldre än 12 h tas aldrig upp automatiskt — den rättas av admin (samma gräns som knappen "Fortsätt hämta X").
        if (!f || !oppenFlyttGaller(f, Date.now())) return;
        setUtkast(u => u.steg !== 'val' ? u : {
          ...nyttUtkast(f.starttid), steg: 'kor', maskinId: f.maskin_id ?? null,
          extern: f.extern_maskin ? { namn: f.extern_maskin, kund: f.kund ?? '' } : null,
          flyttId: f.id, lassatTid: f.hamtad_tid ?? f.starttid, navKor: true,
        });
      });
  }, [data, utkast.steg]);

  const maskin = data?.maskiner.find(m => m.maskin_id === utkast.maskinId) ?? null;
  const maskinNamn = maskin?.namn ?? utkast.extern?.namn ?? 'maskinen';

  /** Där maskinen står: förarens egen utpekade plats, annars den lästa positionen. */
  const hamtPunkt = useMemo(() => {
    if (utkast.hamtPlats?.lat != null && utkast.hamtPlats.lng != null) return { lat: utkast.hamtPlats.lat, lng: utkast.hamtPlats.lng };
    return maskin?.pos ? { lat: maskin.pos.lat, lng: maskin.pos.lng } : null;
  }, [utkast.hamtPlats, maskin]);
  const hamtNamn = useMemo(() => {
    if (utkast.hamtPlats) return utkast.hamtPlats.namn;
    if (!maskin?.pos || !data) return null;
    return maskin.pos.namn ?? narmastePlats(maskin.pos, data.objekt, data.platser)?.namn ?? null;
  }, [utkast.hamtPlats, maskin, data]);

  const del: FlyttPart = { maskin_id: maskin ? maskin.maskin_id : null, extern: utkast.extern?.namn ?? null };

  // ── Steg 1: välj maskin ──
  const valjMaskin = (id: string) => {
    startPos.current = getFarskGps().catch(() => null);   // dagens startpunkt: där föraren står när flödet börjar
    setFel(null); setSok('');
    setUtkast({ ...nyttUtkast(new Date().toISOString()), steg: 'kor', maskinId: id });
  };
  const valjExtern = (namn: string, kund: string) => {
    startPos.current = getFarskGps().catch(() => null);
    setArk(null); setFel(null); setSok('');
    setUtkast({ ...nyttUtkast(new Date().toISOString()), steg: 'kor', extern: { namn, kund } });
  };

  // ── Steg 2: Lassa ──
  const lassaMed = async (punkt: { lat: number; lng: number }, hoppaRundaFraga = false) => {
    setSparar(true); setFel(null);
    if (!hoppaRundaFraga) {
      const egen = await hittaDag(ctx);
      if (egen.ok && !egen.v) {
        const stangd = await hittaNyligenStangd();
        if (stangd) { setSparar(false); setRundaFraga({ rundaId: stangd, punkt }); return; }
      }
    }
    const start = (startPos.current ? await startPos.current : null);
    const dag = await sakraDag(ctx, start, utkast.start);
    if (!dag.ok) { setSparar(false); setFel(dag.fel); return; }
    const fran = utkast.hamtPlats
      ? { objektId: utkast.hamtPlats.objektId, platsId: utkast.hamtPlats.platsId }
      : maskin?.pos?.kalla === 'plats' && (maskin.pos.objektId || maskin.pos.platsId)
        ? { objektId: maskin.pos.objektId ?? null, platsId: maskin.pos.platsId ?? null }
        : (() => { const n = data ? narmastePlats(punkt, data.objekt, data.platser) : null; return { objektId: n?.objektId ?? null, platsId: n?.platsId ?? null }; })();
    const f = await skapaFlytt(ctx, dag.v, del, punkt, fran, utkast.start);
    setSparar(false);
    if (!f.ok) { setFel(f.fel); return; }
    andra({ flyttId: f.v.flyttId, lassatTid: f.v.hamtadTid });
  };
  const tryckLassa = async () => {
    if (sparar) return;
    setSparar(true); setFel(null);
    let gps: Pos | null = null;
    try { gps = await getFarskGps(); } catch (e: any) { setSparar(false); setFel(`${e?.message || 'Din plats kunde inte hämtas'}. Lastningen sparas inte utan din plats — vikten noterar den ändå.`); return; }
    setSparar(false);
    const punkt = { lat: gps.lat, lng: gps.lng };
    if (hamtPunkt) {
      const km = haversine(punkt.lat, punkt.lng, hamtPunkt.lat, hamtPunkt.lng);
      if (km > RIMLIG_AVSTAND_KM) { setVarning({ typ: 'lassa', gps: punkt, forvantad: hamtPunkt, km: Math.round(km), namn: hamtNamn ?? maskinNamn }); return; }
    }
    await lassaMed(punkt);
  };
  const angraLassa = async () => {
    if (!utkast.flyttId || sparar) return;
    setSparar(true); setFel(null);
    const r = await avbrytFlytt(utkast.flyttId);
    setSparar(false);
    if (!r.ok) { setFel(r.fel); return; }
    andra({ flyttId: null, lassatTid: null });
  };

  // ── Steg 3: Lassat av här ──
  const lossaMed = async (b: { lat: number; lng: number; kalla: Mal['kalla'] }, d: ValdPlats) => {
    setSparar(true); setFel(null);
    let flyttId = utkast.flyttId;
    if (!flyttId) {
      // Lassa trycktes inte: flytten skapas nu, med maskinens kända plats som start (bara om den är färsk nog att lita på).
      if (!hamtPunkt || (!utkast.hamtPlats && (!maskin?.pos || maskin.pos.osaker))) {
        setSparar(false); setFel('Tryck Lassa först, eller peka ut var maskinen stod — då vet appen vart sträckan börjar.'); return;
      }
      const start = (startPos.current ? await startPos.current : null);
      const dag = await sakraDag(ctx, start, utkast.start);
      if (!dag.ok) { setSparar(false); setFel(dag.fel); return; }
      const n = data ? narmastePlats(hamtPunkt, data.objekt, data.platser) : null;
      const f = await skapaFlytt(ctx, dag.v, del, hamtPunkt, { objektId: utkast.hamtPlats?.objektId ?? n?.objektId ?? null, platsId: utkast.hamtPlats?.platsId ?? n?.platsId ?? null }, utkast.start);
      if (!f.ok) { setSparar(false); setFel(f.fel); return; }
      flyttId = f.v.flyttId;
    }
    const mal: Mal = { objektId: d.objektId, platsId: d.platsId, lat: b.lat, lng: b.lng, kalla: b.kalla, namn: d.namn, verkstad: d.verkstad };
    const r = await avslutaFlytt(ctx, flyttId, del, mal, utkast.extern?.kund ?? null);
    setSparar(false);
    if (!r.ok) { setFel(r.fel); andra({ flyttId }); return; }
    andra({ flyttId, lossad: { tid: new Date().toISOString(), namn: d.namn } });
  };
  const tryckLossa = async () => {
    const d = utkast.dest;
    if (!d || sparar) return;
    setSparar(true); setFel(null);
    let gps: Pos | null = null;
    try { gps = await getFarskGps(); } catch { /* ingen fix — vald koordinat gäller */ }
    setSparar(false);
    const punkt = gps && gps.accuracy <= 150 ? { lat: gps.lat, lng: gps.lng } : null;
    if (punkt && d.lat != null && d.lng != null) {
      const km = haversine(punkt.lat, punkt.lng, d.lat, d.lng);
      if (km > RIMLIG_AVSTAND_KM) { setVarning({ typ: 'lossa', gps: punkt, forvantad: { lat: d.lat, lng: d.lng }, km: Math.round(km), namn: d.namn }); return; }
    }
    if (punkt) { await lossaMed({ ...punkt, kalla: 'gps' }, d); return; }
    if (d.lat != null && d.lng != null) { await lossaMed({ lat: d.lat, lng: d.lng, kalla: d.kalla }, d); return; }
    setFel('Ingen brukbar GPS och trakten saknar koordinat — försök igen utomhus.');
  };

  const valjVarning = async (val: 'gps' | 'karta') => {
    const v = varning;
    if (!v) return;
    setVarning(null);
    if (v.typ === 'lassa') await lassaMed(val === 'gps' ? v.gps : v.forvantad);
    else if (utkast.dest) await lossaMed(val === 'gps' ? { ...v.gps, kalla: 'gps' } : { ...v.forvantad, kalla: utkast.dest.kalla }, utkast.dest);
  };
  const valjRunda = async (val: 'ny' | 'fortsatt') => {
    const r = rundaFraga;
    if (!r) return;
    setRundaFraga(null);
    if (val === 'fortsatt') await ateroppnaRunda(r.rundaId);
    await lassaMed(r.punkt, true);
  };

  // ── Steg 4: hem och klar ──
  const tillHem = async () => {
    andra({ steg: 'hem' });
    const dag = await hittaDag(ctx);
    if (dag.ok && dag.v) {
      const r = await startaHemresa(dag.v);
      if (!r.ok) setFel(r.fel);
    }
  };
  const stang = async (d: Dag) => {
    setSparar(true); setFel(null);
    const r = await stangDag(ctx, d);
    setSparar(false);
    if (!r.ok) { setFel(r.fel); return; }
    rensaUtkast();
    onAvsluta('Rundan är avslutad.');
  };
  const tryckKlar = async () => {
    if (sparar) return;
    setSparar(true); setFel(null);
    const dag = await hittaDag(ctx);
    if (!dag.ok) { setSparar(false); setFel(dag.fel); return; }
    if (!dag.v) { setSparar(false); rensaUtkast(); onAvsluta('Klart. Rundan avslutas när bilen står hemma.'); return; }
    const bed = await kontrolleraFramme(ctx.vin);
    setSparar(false);
    if (bed.lage === 'langt') { setFrammeVarning({ km: bed.km }); return; }
    await stang(dag.v);
  };
  const jaAvslutaAnda = async () => {
    const dag = await hittaDag(ctx);
    setFrammeVarning(null);
    if (!dag.ok) { setFel(dag.fel); return; }
    if (dag.v) await stang(dag.v);
  };

  // Admin rättade flytten i sheeten: kvittot ska säga var den NU är lossad, läst ur flytten (aldrig gissat ur det som skickades).
  const lasOmLossad = async () => {
    if (!utkast.flyttId || !data) return;
    const { data: f } = await supabase.from('maskin_flytt').select('till_objekt_id, till_plats_id, avbruten').eq('id', utkast.flyttId).maybeSingle();
    if (!f) return;
    if (f.avbruten) { andra({ lossad: null, flyttId: null, lassatTid: null }); return; }
    const nyttNamn = (f.till_objekt_id && data.objekt.find(o => o.id === f.till_objekt_id)?.namn) || (f.till_plats_id && data.platser.find(p => p.id === f.till_plats_id)?.namn);
    if (nyttNamn) andra({ lossad: utkast.lossad ? { ...utkast.lossad, namn: nyttNamn } : utkast.lossad });
  };
  const valjKartapp = (k: Kartapp) => { setKartapp(k); sparaKartapp(k); };
  const kartappNamn = KARTAPPAR.find(k => k.id === kartapp)?.namn ?? 'Kartor';
  const kartEtikett = `Öppna i ${kartapp === 'apple' ? 'Kartor' : 'Google Maps'}`;
  const harKartval = kanValjaKartapp();
  const KartappRad = () => harKartval ? (
    <button type="button" data-kartapp-rad onClick={() => setArk('kartapp')} style={{ ...KNAPP.tertiar, width: '100%' }}>Kartapp: {kartappNamn} · Ändra</button>
  ) : null;

  // ── Laddar / fel ──
  if (lage.lage === 'laddar') return (<><Topp onAvbryt={() => onAvsluta('')} /><p role="status" style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', padding: `${AVSTAND.xl}px 0`, margin: 0 }}>Läser maskinerna …</p></>);
  if (lage.lage === 'fel' || !data) return (
    <>
      <Topp onAvbryt={() => onAvsluta('')} />
      <div style={{ textAlign: 'center', padding: `${AVSTAND.xl}px 0` }}>
        <p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: `0 0 ${AVSTAND.m}px` }}>Kunde inte läsa maskinerna just nu.</p>
        <button type="button" onClick={forsokIgen} style={KNAPP.sekundar}>Försök igen</button>
      </div>
    </>
  );

  const overlag = (
    <>
      {ark === 'extern' && <ExternArk onKlar={valjExtern} onStang={() => setArk(null)} />}
      {ark === 'kartapp' && <KartappArk valt={kartapp} onVal={valjKartapp} onStang={() => setArk(null)} />}
      {ark === 'hamtplats' && (
        <Ark rubrik={`Var står ${maskinNamn}?`} onStang={() => setArk(null)}>
          <DestLista rader={rangordnaDestinationer(data.objekt, data.platser, null, sok)} valdNyckel={null} sok={sok} onSok={setSok}
            onVal={r => { setArk(null); setSok(''); andra({ hamtPlats: tillValdPlats(r), navKor: false }); }} />
        </Ark>
      )}
      {ark === 'andraLossad' && arAdmin && utkast.flyttId && (
        <FlyttSheet key={utkast.flyttId} flyttId={utkast.flyttId} namn={namn}
          onStang={() => setArk(null)}
          onKlar={text => { setRattKvitto(text); setArk(null); void lasOmLossad(); }}
          onDelvis={f => { setFel(f); setArk(null); void lasOmLossad(); }}
          onAndrad={() => { void lasOmLossad(); }} />
      )}
      {ark === 'andraLossad' && !arAdmin && (
        <Ark rubrik="Fel trakt?" onStang={() => setArk(null)} fot={<button type="button" onClick={() => setArk(null)} style={KNAPP.sekundar}>Okej</button>}>
          <p style={{ ...TYP.text, color: FARG.text, margin: `0 0 ${AVSTAND.m}px` }}>Flytten är sparad. Fel trakt, maskin eller sträcka rättas av admin: Lastbilen › Körningar, tryck på körningen och sedan på flytten.</p>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>En avslutad flytt kan inte ändras härifrån — den kan redan ligga hos faktureringen.</p>
        </Ark>
      )}
      {varning && (
        <PosVarningArk
          text={varning.typ === 'lassa'
            ? `Din plats ligger ${varning.km} km från där ${varning.namn} ska stå. Står du verkligen vid maskinen?`
            : `Din plats ligger ${varning.km} km från ${varning.namn}. Står du verkligen där?`}
          kartaText={varning.typ === 'lassa' ? 'Använd maskinens plats' : 'Använd traktens plats'}
          gpsText="Använd min plats ändå"
          onKarta={() => valjVarning('karta')} onGps={() => valjVarning('gps')} onStang={() => setVarning(null)} />
      )}
      {rundaFraga && <RundaFragaArk onFortsatt={() => valjRunda('fortsatt')} onNy={() => valjRunda('ny')} onStang={() => setRundaFraga(null)} />}
    </>
  );

  // ═════════ Steg: välj maskin ═════════
  if (utkast.steg === 'val') {
    const rader = sorteraMaskiner(data.maskiner, data.fran?.pos ?? null);
    // Bilens position äldre än en timme → listan sorteras på telefonens GPS (useHamtaData) och underrubriken säger ändå samma sak.
    const kalla = data.fran ? 'Närmast lastbilen först' : 'Avstånd saknas — varken bilens eller din plats gick att läsa';
    return (
      <>
        <Topp onAvbryt={() => onAvsluta('')} />
        <Rubrik under={kalla}>Vilken maskin hämtar du?</Rubrik>
        {data.posFel && <Meta orange>Några maskiners platser gick inte att läsa — de står utan plats.</Meta>}
        <Sektion rubrik="Maskiner">
          {rader.length === 0 && <Meta>Inga aktiva maskiner hittades.</Meta>}
          {rader.map((r, i) => (
            <MaskinListeRad key={r.maskin_id} rad={r} sista={i === rader.length - 1}
              trakt={r.pos ? (r.pos.namn ?? narmastePlats(r.pos, data.objekt, data.platser)?.namn ?? null) : null}
              onVal={() => valjMaskin(r.maskin_id)} />
          ))}
        </Sektion>
        <Sektion rubrik="Annan">
          <EnkelRad id="extern" namn="Maskin som inte är vår" sub="Namn och kund — faktureras alltid" onTryck={() => setArk('extern')} />
        </Sektion>
        {rader.some(r => r.km != null) && <Meta>Avstånden är fågelväg.</Meta>}
        {overlag}
      </>
    );
  }

  // ═════════ Steg: hämtar ═════════
  if (utkast.steg === 'kor') {
    const km = data.fran && hamtPunkt ? haversine(data.fran.pos.lat, data.fran.pos.lng, hamtPunkt.lat, hamtPunkt.lng) : null;
    const harPlats = !!hamtPunkt;
    // Tidsraden står BARA när maskinens position är osäker (som i maskinlistan); en plats föraren själv pekat ut är aldrig osäker.
    const osakerPos = maskin?.pos && !utkast.hamtPlats && maskin.pos.osaker ? maskin.pos : null;
    // Primärknappen byter från kartan till "Vart ska X?" när man varit i kartappen ELLER lassat — då är maskinen hämtad.
    const vidare = utkast.navKor || !!utkast.flyttId;
    return (
      <>
        {/* Tillbaka bara när inget är sparat: Lassat-kvittots Ändra är vägen bakåt efter lastning (den avbryter flytten). */}
        <Topp onTillbaka={utkast.flyttId ? undefined : () => { setFel(null); setUtkast(nyttUtkast(new Date().toISOString())); }} deaktiverad={sparar} />
        <Rubrik>Hämtar {maskinNamn}</Rubrik>
        {harPlats ? (
          <Sektion rubrik="Där den står">
            <div style={{ ...RAD, borderBottom: 'none', padding: `${AVSTAND.m}px 0` }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ ...TYP.listtitel, display: 'block' }}>{hamtNamn ?? 'Okänd plats'}</span>
                {km != null && <span data-avstand style={{ ...TYP.meta, color: FARG.text2, display: 'block' }}>{avstandKort(km)} bort</span>}
                {osakerPos && <span data-osaker style={{ ...TYP.meta, color: FARG.orange, display: 'block' }}>{osakerRad(osakerPos)}</span>}
              </span>
              <button type="button" data-andra-plats onClick={() => { setSok(''); setArk('hamtplats'); }} style={KNAPP.lank}>Ändra</button>
            </div>
          </Sektion>
        ) : (
          <Sektion rubrik="Där den står">
            <EnkelRad id="hamtplats" namn={utkast.extern ? 'Var står den?' : 'Platsen saknas — var står den?'} sub="Välj trakt eller plats" onTryck={() => { setSok(''); setArk('hamtplats'); }} />
          </Sektion>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
          {vidare ? (
            <button type="button" data-primar="vart" onClick={() => { setSok(''); andra({ steg: 'dest' }); }} style={KNAPP.primar}>Vart ska {maskinNamn}?</button>
          ) : (
            <KartKnapp id="kor" app={kartapp} lat={hamtPunkt?.lat ?? null} lng={hamtPunkt?.lng ?? null} etikett={kartEtikett} onTryck={() => andra({ navKor: true })} />
          )}
          {utkast.flyttId ? (
            <Kvittorad id="lassat" text={`Lassat ${utkast.lassatTid ? tidKort(utkast.lassatTid) : ''}`.trim()} onAndra={angraLassa} sparar={sparar} />
          ) : (
            <button type="button" data-lassa onClick={tryckLassa} disabled={sparar} style={{ ...KNAPP.sekundar, ...(sparar ? INAKTIV : {}) }}>
              {sparar ? 'Sparar …' : 'Lassat'}
            </button>
          )}
        </div>
        {fel && <Fel>{fel}</Fel>}
        <Meta>Bilen känner av lastningen själv om du inte trycker.</Meta>
        <KartappRad />
        {overlag}
      </>
    );
  }

  // ═════════ Steg: vart ska den? ═════════
  if (utkast.steg === 'dest') {
    const mal = utkast.dest;
    const valdNyckel = mal ? (mal.objektId ? `o:${mal.objektId}` : mal.platsId ? `p:${mal.platsId}` : null) : null;
    const rader = rangordnaDestinationer(data.objekt, data.platser, maskin ? { maskin_id: maskin.maskin_id, maskin_typ: maskin.maskin_typ } : null, sok);
    const vald = (r: DestRad) => andra({ dest: tillValdPlats(r), navDest: false, lossad: null });
    return (
      <>
        {/* Tillbaka bara före "Lassat av här": efter lossning backar inget (rättningen går via Ändra på lossningen). */}
        <Topp onTillbaka={utkast.lossad ? undefined : () => { setFel(null); setSok(''); andra({ steg: 'kor' }); }} deaktiverad={sparar} />
        <Rubrik>Vart ska {maskinNamn}?</Rubrik>
        <DestLista rader={rader} valdNyckel={valdNyckel} sok={sok} onSok={setSok} onVal={vald} />

        <Fot>
          {utkast.navDest || utkast.lossad ? (
            <button type="button" data-primar="hem" onClick={tillHem} disabled={!mal} style={{ ...KNAPP.primar, ...(mal ? {} : INAKTIV) }}>Vägen hem till LBC</button>
          ) : (
            <KartKnapp id="dest" app={kartapp} lat={mal?.lat ?? null} lng={mal?.lng ?? null} etikett={kartEtikett} onTryck={() => andra({ navDest: true })} />
          )}
          {mal && mal.lat == null && <Meta orange>{mal.namn} saknar koordinat i appen — navigera själv.</Meta>}
          {fel && <Fel>{fel}</Fel>}
          {rattKvitto && <p role="status" data-ratt-kvitto style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>{rattKvitto}</p>}
          {mal && (utkast.lossad ? (
            <Kvittorad id="lossad" text={`${maskinNamn} lossad på ${utkast.lossad.namn}`} onAndra={() => setArk('andraLossad')} />
          ) : (
            <button type="button" data-lossa onClick={tryckLossa} disabled={sparar} style={{ ...KNAPP.sekundar, ...(sparar ? INAKTIV : {}) }}>
              {sparar ? 'Sparar …' : 'Lassat av här'}
            </button>
          ))}
          <KartappRad />
        </Fot>
        {overlag}
      </>
    );
  }

  // ═════════ Steg: vägen hem ═════════
  return (
    <>
      {/* Vägen hem: ingen väg bakåt — hemresan är startad och går inte att ångra härifrån. */}
      <Topp />
      <Rubrik under="Bilen är tom. Rundan avslutas när den står hemma.">Vägen hem till LBC</Rubrik>
      {frammeVarning ? (
        <div style={{ ...KORT }}>
          <FrammeVarning km={frammeVarning.km} sparar={sparar} onKorVidare={() => setFrammeVarning(null)} onAvslutaAnda={jaAvslutaAnda} />
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
            {utkast.navHem ? (
              <>
                <button type="button" data-klar onClick={tryckKlar} disabled={sparar} style={{ ...KNAPP.primar, ...(sparar ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : 'Klar'}</button>
                {data.bas && <a data-kartknapp="hem" {...lankAttr(kartLank(kartapp, data.bas.lat, data.bas.lng))} style={{ ...KNAPP.sekundar, textDecoration: 'none' }}>{kartEtikett} igen</a>}
              </>
            ) : (
              <>
                <KartKnapp id="hem" app={kartapp} lat={data.bas?.lat ?? null} lng={data.bas?.lng ?? null} etikett={kartEtikett} onTryck={() => andra({ navHem: true })} />
                <button type="button" data-klar onClick={tryckKlar} disabled={sparar} style={{ ...KNAPP.sekundar, ...(sparar ? INAKTIV : {}) }}>{sparar ? 'Sparar …' : 'Klar'}</button>
              </>
            )}
          </div>
          <KartappRad />
          {!data.bas && <Meta orange>Hemmabasen saknas i appen — navigera själv.</Meta>}
          {fel && <Fel>{fel}</Fel>}
          <Meta>Står bilen kvar ute när du trycker Klar frågar appen "Bilen är inte hemma än."</Meta>
        </>
      )}
      {overlag}
    </>
  );
}

function tillValdPlats(r: DestRad): ValdPlats {
  if (r.typ === 'objekt') {
    const k = destKoordinat(r.objekt);
    return { namn: r.objekt.namn, lat: k?.lat ?? null, lng: k?.lng ?? null, objektId: r.objekt.id, platsId: null, kalla: k?.kalla ?? 'objekt', verkstad: false };
  }
  return { namn: r.plats.namn, lat: r.plats.lat, lng: r.plats.lng, objektId: null, platsId: r.plats.id, kalla: 'flyttplats', verkstad: r.plats.typ === 'verkstad' };
}
