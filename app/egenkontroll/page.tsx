'use client';

// Egenkontroll — listan. Kortet överst är ett BESLUT (vad ska jag göra nu?), under det månadens dragna objekt (stickprovet), sedan tre
// kategorier med ett ord var — månaden, Påbörjade, Klara — och längst ner länken till allt annat. Får en kategori inget eget ord finns den inte.
//
// Stickprovet (migrationerna egenkontroll_stickprov_1…5b, lib/egenkontrollStickprov.ts): ett ankare slumpat bland förra månadens avslutade
// objekt + de som ligger nära det. Dras av databasen vid första läsningen i en ny månad; sidan bara visar det. Valfriheten är orörd — ett tryck
// på "Starta på ett annat objekt" listar allt som inte redan har en runda, längst väntat först.
//
// Avståndet till varje objekt är vägavstånd (OSRM via useVagavstand, samma som objektlistan i planeringen), fågelväg med ~ tills det kommit.
// Utan position står bilknappen kvar (kartappen vet var du är) men inget avstånd gissas.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import BottomNav from '@/components/BottomNav';
import Ikon from '@/components/design/Ikon';
import { AVSTAND, FARG, IKON, KNAPP, KORT, TYP } from '@/lib/design/tokens';
import { hamtaStickprov, hamtaVantande, type VantandeOversikt } from '@/lib/egenkontroll';
import type { ObjektTyp } from '@/lib/egenkontroll';
import { beslutskort, dragenText, forklaringText, kategorisera, klusterRad, arKontrollerbar, type Stickprov } from '@/lib/egenkontrollStickprov';
import { useVagavstand } from '@/lib/hooks/useVagavstand';
import { harKoordinat, startaNavigering } from '@/lib/navigera';
import { fagelKm } from '@/lib/objektVal';
import { typLabel } from '@/lib/objekt/typ';
import { useLevandePosition } from './useMinPosition';
import { BilKnapp, Kategorirad, ListRot, Not, Objektrad, RadKort, TillbakaRad, Typval, radMeta, type Avstand, type RadData } from './ListDelar';

type Vy = 'huvud' | 'paborjade' | 'klara' | 'annat';

const felText = (e: unknown, reserv: string) => (e instanceof Error ? e.message : reserv);

export default function EgenkontrollListPage() {
  const router = useRouter();
  const [data, setData] = useState<VantandeOversikt | null>(null);
  const [stickprov, setStickprov] = useState<Stickprov | null>(null);
  const [stickprovFel, setStickprovFel] = useState<string | null>(null);
  const [fel, setFel] = useState<string | null>(null);
  const [laddar, setLaddar] = useState(true);
  const [vy, setVy] = useState<Vy>('huvud');
  const [valdTyp, setValdTyp] = useState<string | null>(null);
  const position = useLevandePosition();
  const lat = position.position?.lat ?? null;
  const lng = position.position?.lng ?? null;
  const pos = useMemo(() => (lat != null && lng != null ? { lat, lng } : null), [lat, lng]);

  const ladda = useCallback(async () => {
    setLaddar(true);
    setFel(null);
    setStickprovFel(null);
    // Två läsningar som inte får dra ner varandra: ett läsfel på stickprovet ska inte ta bort listan, och tvärtom.
    const [lista, sp] = await Promise.allSettled([hamtaVantande(), hamtaStickprov()]);
    if (lista.status === 'fulfilled') setData(lista.value);
    else { setData(null); setFel(felText(lista.reason, 'Kunde inte hämta egenkontrollerna.')); }
    if (sp.status === 'fulfilled') setStickprov(sp.value);
    else { setStickprov(null); setStickprovFel(felText(sp.reason, 'Kunde inte läsa månadens stickprov.')); }
    setLaddar(false);
  }, []);

  useEffect(() => { ladda(); }, [ladda]);

  const rader = useMemo(() => data?.rader ?? [], [data]);
  const kat = useMemo(() => kategorisera(rader, stickprov), [rader, stickprov]);

  // Vägavstånd till det som ännu är kvar att göra (klara rundor behöver inget avstånd).
  const vagObjekt = useMemo(() => rader.filter((r) => r.rundstatus !== 'klar').map((r) => ({ id: r.objekt_id, lat: r.lat, lng: r.lng })), [rader]);
  const vag = useVagavstand({ aktiv: !laddar && !fel, pos, objekt: vagObjekt, urval: () => true });
  const avstand = useCallback((r: Pick<RadData, 'objekt_id' | 'lat' | 'lng'>): Avstand => {
    if (vag[r.objekt_id] != null) return { km: vag[r.objekt_id], ungefar: false };
    if (pos && harKoordinat(r)) return { km: fagelKm(pos.lat, pos.lng, r.lat!, r.lng!), ungefar: true };
    return null;
  }, [vag, pos]);

  const kort = useMemo(() => {
    const perId = new Map(rader.map((r) => [r.objekt_id, r] as const));
    return beslutskort(kat, (id) => { const r = perId.get(id); return r ? avstand(r)?.km ?? null : null; });
  }, [kat, rader, avstand]);

  const oppna = (r: Pick<RadData, 'objekt_id'>) => router.push(`/egenkontroll/${r.objekt_id}`);
  const navigera = (r: RadData) => { startaNavigering(r); };
  const radEl = (r: RadData, sista: boolean) => (
    <Objektrad key={r.objekt_id} r={r} avstand={avstand(r)} onOppna={oppna} onNavigera={navigera} sista={sista} />
  );

  // "Starta på ett annat objekt": typerna som FINNS, flest förvald. Väljaren syns bara när det finns mer än en.
  const typer = useMemo(() => {
    const antal = new Map<string, number>();
    for (const r of kat.annat) { const t = (r.typ ?? '').toLowerCase(); antal.set(t, (antal.get(t) ?? 0) + 1); }
    return [...antal.entries()].map(([id, n]) => ({ id, etikett: typLabel(id as ObjektTyp), antal: n })).sort((a, b) => b.antal - a.antal);
  }, [kat.annat]);
  const aktivTyp = typer.some((t) => t.id === valdTyp) ? valdTyp! : typer[0]?.id ?? '';
  const annatLista = kat.annat.filter((r) => (r.typ ?? '').toLowerCase() === aktivTyp);

  // Det som inte går att kontrollera ännu (GROT, energiklippning) sägs, så listan inte tiger om det den utelämnar.
  const annanTyp = rader.filter((r) => r.rundstatus === 'ej_startad' && !arKontrollerbar(r.typ)).length;

  const rubrikFor: Record<Exclude<Vy, 'huvud'>, string> = { paborjade: 'Påbörjade', klara: 'Klara', annat: 'Starta på ett annat objekt' };

  // ── Laddar / fel ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (laddar) {
    return <ListRot><p style={{ ...TYP.text, color: FARG.text2, textAlign: 'center', marginTop: AVSTAND.xxl }}>Hämtar egenkontrollerna…</p><BottomNav /></ListRot>;
  }
  if (fel) {
    return (
      <ListRot>
        <div style={{ ...KORT, marginTop: AVSTAND.l }} data-testid="lista-fel">
          <div style={{ display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, color: FARG.rod, ...TYP.listtitel }}>
            <Ikon namn="error" storlek={IKON.rad} farg={FARG.rod} />Kunde inte läsa egenkontrollerna
          </div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.s, wordBreak: 'break-word' }}>{fel}</div>
          <button type="button" onClick={ladda} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.l }}>Försök igen</button>
        </div>
        <BottomNav />
      </ListRot>
    );
  }

  // ── Underlistor ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  if (vy !== 'huvud') {
    const lista = vy === 'paborjade' ? kat.paborjade : vy === 'klara' ? kat.klara : annatLista;
    return (
      <ListRot>
        <TillbakaRad onTillbaka={() => setVy('huvud')} />
        <h1 style={{ ...TYP.rubrik, margin: `${AVSTAND.s}px 0 ${AVSTAND.l}px` }} data-testid="underrubrik">{rubrikFor[vy]}</h1>
        {vy === 'annat' && typer.length > 1 && <Typval typer={typer} vald={aktivTyp} onVal={setValdTyp} />}
        {lista.length === 0
          ? <p style={{ ...TYP.text, color: FARG.text2 }}>Inget här.</p>
          : <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }} data-testid={`lista-${vy}`}>{lista.map((r, i) => radEl(r, i === lista.length - 1))}</div>}
        <BottomNav />
      </ListRot>
    );
  }

  // ── Huvudlistan ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
  const kortAvstand = kort ? avstand(kort) : null;
  const kategorier = [
    kat.paborjade.length > 0 && { ord: 'Påbörjade', antal: kat.paborjade.length, vy: 'paborjade' as const },
    kat.klara.length > 0 && { ord: 'Klara', antal: kat.klara.length, vy: 'klara' as const },
  ].filter(Boolean) as { ord: string; antal: number; vy: Exclude<Vy, 'huvud' | 'annat'> }[];

  return (
    <ListRot>
      {/* BESLUTET: ett kort, inte en räknare. Påbörjad dragen runda först (färdigställ innan du börjar nytt). */}
      {kort ? (
        <div
          role="button"
          tabIndex={0}
          data-testid="beslutskort"
          aria-label={`${kort.namn}, ${radMeta(kort, kortAvstand)}`}
          onClick={() => oppna(kort)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); oppna(kort); } }}
          className="press-row"
          style={{ ...KORT, display: 'flex', alignItems: 'center', gap: AVSTAND.inuti, cursor: 'pointer', marginBottom: AVSTAND.xl }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...TYP.rubrik, overflowWrap: 'anywhere' }}>{kort.namn}</div>
            <div style={{ ...TYP.text, color: FARG.text2, marginTop: AVSTAND.xs }}>{radMeta(kort, kortAvstand)}</div>
            <div style={{ ...TYP.text, color: FARG.text2 }}>
              {[typLabel((kort.typ ?? '') as ObjektTyp), kort.areal != null ? `${String(kort.areal).replace('.', ',')} ha` : null, kort.rundstatus !== 'ej_startad' ? `${kort.antalPunkter} punkter` : null].filter(Boolean).join(' · ')}
            </div>
            <div style={{ ...TYP.text, color: FARG.bla, marginTop: AVSTAND.s }}>{kort.rundstatus === 'pagaende' ? 'Fortsätt' : 'Starta'} ›</div>
          </div>
          <BilKnapp r={kort} avstand={kortAvstand} onNavigera={navigera} />
        </div>
      ) : (
        <div style={{ ...KORT, marginBottom: AVSTAND.xl }} data-testid="inget-att-gora">
          <div style={{ ...TYP.listtitel }}>Inget väntar på egenkontroll.</div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs }}>Listan fylls när ett objekt avslutas.</div>
        </div>
      )}

      {/* MÅNADEN: stickprovet. Före första dragningen står en rad som säger när; ett läsfel är ett fel, aldrig "inget stickprov". */}
      {stickprovFel && (
        <div style={{ ...KORT, marginBottom: AVSTAND.xl }} data-testid="stickprov-fel">
          <div style={{ color: FARG.rod, ...TYP.listtitel }}>Kunde inte läsa månadens stickprov</div>
          <div style={{ ...TYP.meta, color: FARG.text2, marginTop: AVSTAND.xs, wordBreak: 'break-word' }}>{stickprovFel}</div>
          <button type="button" onClick={ladda} style={{ ...KNAPP.sekundar, marginTop: AVSTAND.m }}>Försök igen</button>
        </div>
      )}
      {!stickprovFel && stickprov == null && (
        <Not testid="stickprov-ej-borjat">Månadens stickprov dras första gången 1 november.</Not>
      )}
      {stickprov != null && kat.manad.length > 0 && (
        <div style={{ marginBottom: AVSTAND.xl }}>
          <RadKort rubrik="Den här månaden" hogerText={kat.kvar > 0 ? `${kat.kvar} kvar` : 'Alla klara'} testid="manad">
            {kat.manad.map((r, i) => radEl(r, i === kat.manad.length - 1))}
          </RadKort>
          <Not testid="kluster-rad">{klusterRad(stickprov)}</Not>
          {forklaringText(stickprov) && <Not testid="forklaring">{forklaringText(stickprov)}</Not>}
          <Not testid="dragen">{dragenText(stickprov)}</Not>
        </div>
      )}
      {stickprov != null && kat.manad.length === 0 && (
        <div style={{ marginBottom: AVSTAND.xl }}>
          <Not testid="forklaring">{forklaringText(stickprov) ?? 'Inga objekt i månadens stickprov.'}</Not>
          <Not testid="dragen">{dragenText(stickprov)}</Not>
        </div>
      )}

      {/* TRE KATEGORIER MED ETT ORD VAR — och en kategori utan eget ord, eller utan innehåll, finns inte. */}
      {kategorier.length > 0 && (
        <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginBottom: AVSTAND.rad }} data-testid="kategorier">
          {kategorier.map((k, i) => <Kategorirad key={k.vy} ord={k.ord} antal={k.antal} onOppna={() => setVy(k.vy)} sista={i === kategorier.length - 1} />)}
        </div>
      )}
      {kat.annat.length > 0 && (
        <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0, marginBottom: AVSTAND.xl }}>
          <Kategorirad ord="Starta på ett annat objekt" onOppna={() => { setValdTyp(null); setVy('annat'); }} sista />
        </div>
      )}

      {annanTyp > 0 && (
        <Not testid="annan-typ">{annanTyp} objekt av annan typ (GROT, energiklippning) kan inte kontrolleras ännu.</Not>
      )}
      {(data?.antalUtanDatum ?? 0) > 0 && (
        <Not testid="utan-datum">{data!.antalUtanDatum} äldre objekt saknar avslutsdatum och listas inte här. De kan startas från objektet.</Not>
      )}
      <BottomNav />
    </ListRot>
  );
}
