'use client';

import { useState } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, INAKTIV, KNAPP, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { FLYTT_TYPER, FLYTT_TYP_ORD, underlagKonsekvens } from '@/lib/flytt/fakturerbar';
import PlatsVal from './PlatsVal';
import { avstandKm, usePlatsData, type PlatsData, type PlatsKandidat } from './usePlatsData';
import { andradeFalt, kravKund, rattaFlytt, rattaKvitto, strykEnFlytt, type Falt, type RattaResultat } from './ratta';
import { angraGodkannande } from './godkann';
import { fmtDatum } from './nu';
import type { Ben } from './rundor';
import type { BenStatus, Rattning } from './useBenStatus';

/** Längre än så från där bilen lämnade maskinen: valet kan vara fel, och formuläret säger det. */
export const VARNA_OVER_KM = 2;
const ANNAN = '__annan';

const faltStil = {
  ...TYP.text, color: FARG.text, background: FARG.fyllning, border: 'none', borderRadius: RADIE.rad,
  padding: AVSTAND.m, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, minHeight: 44,
};

function Etikett({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
      <span style={{ ...TYP.micro, color: FARG.text2 }}>{text}</span>
      {children}
    </label>
  );
}

/** Radens fält som en mening med namn: "Giant · Trakt A → Trakt B · Produktion". */
function beskriv(j: Record<string, any>, data: PlatsData | null): string {
  const namnPlats = (o: string | null, p: string | null) =>
    data?.platser.find(x => (x.slag === 'objekt' ? x.id === o : x.id === p))?.namn ?? (o || p ? 'okänt namn' : 'okänd plats');
  const maskin = j.extern_maskin ?? data?.maskiner.find(m => m.maskin_id === j.maskin_id)?.namn ?? j.maskin_id ?? 'okänd maskin';
  const typ = j.flytt_typ ? (FLYTT_TYP_ORD as Record<string, string>)[j.flytt_typ] ?? j.flytt_typ : null;
  const delar = [maskin, `${namnPlats(j.fran_objekt_id, j.fran_plats_id)} → ${namnPlats(j.till_objekt_id, j.till_plats_id)}`, typ, j.kund ? `kund ${j.kund}` : null];
  return delar.filter(Boolean).join(' · ');
}

/**
 * Rätta en flytt (admin, i rundans ark). Det människan angav — maskin, från, till, typ, kund — går att rätta;
 * mätvärdena (km, tid, mätare) visas skrivskyddade, och är mätningen fel stryker man flytten. Hela rättningen
 * görs i en databastransaktion (ratta_flytt/stryk_flytt) som också sköter fakturaunderlaget: meningen under
 * formuläret säger vad som händer INNAN man sparar. Godkänd eller fakturerad flytt är låst.
 */
export default function RattaFlyttVy({ ben, status, namn, onTillbaka, onKlar, onAndrad }: {
  ben: Ben; status: BenStatus | undefined; namn: string;
  onTillbaka: () => void;
  /** En rättning/strykning gick igenom: kvittot att visa i rundan. */
  onKlar: (rader: string[]) => void;
  /** Något ändrades i databasen (rättning, strykning, godkännande lämnat tillbaka): läs om. */
  onAndrad: () => void;
}) {
  const raw = ben.raw;
  const platsLage = usePlatsData(true);
  const [maskinId, setMaskinId] = useState<string | null>(raw?.maskin_id ?? null);
  const [extern, setExtern] = useState<string>(raw?.extern_maskin ?? '');
  const [annan, setAnnan] = useState<boolean>(!!raw?.extern_maskin);
  const [fran, setFran] = useState({ objekt: raw?.fran_objekt_id ?? null, plats: raw?.fran_plats_id ?? null });
  const [till, setTill] = useState({ objekt: raw?.till_objekt_id ?? null, plats: raw?.till_plats_id ?? null });
  const [typ, setTyp] = useState<string>(raw?.flytt_typ ?? 'produktion');
  const [kund, setKund] = useState<string>(raw?.kund ?? '');
  const [anledning, setAnledning] = useState('');
  const [laget, setLaget] = useState<'ratta' | 'stryk'>('ratta');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const data = platsLage.lage.lage === 'klar' ? platsLage.lage.data : null;
  const rubrik = `${ben.maskin} · ${ben.fran ?? 'okänd plats'} → ${ben.till ?? 'okänd plats'}`;

  const fore: Falt | null = raw ? {
    maskin_id: raw.maskin_id, extern_maskin: raw.extern_maskin, fran_objekt_id: raw.fran_objekt_id, fran_plats_id: raw.fran_plats_id,
    till_objekt_id: raw.till_objekt_id, till_plats_id: raw.till_plats_id, flytt_typ: raw.flytt_typ ?? 'produktion', kund: raw.kund,
  } : null;
  const nu: Falt = {
    maskin_id: annan ? null : maskinId, extern_maskin: annan ? extern.trim() || null : null,
    fran_objekt_id: fran.objekt, fran_plats_id: fran.plats, till_objekt_id: till.objekt, till_plats_id: till.plats,
    flytt_typ: typ, kund: kund.trim() || null,
  };
  const andringar = fore ? andradeFalt(fore, nu) : {};
  const harAndring = Object.keys(andringar).length > 0;
  const kopiorAndras = 'maskin_id' in andringar || 'fran_objekt_id' in andringar || 'till_objekt_id' in andringar || 'kund' in andringar;
  const konsekvens = underlagKonsekvens({ km: raw?.flytt_km ?? null }, typ, status?.underlag ?? null, kopiorAndras);
  const last = !!(status?.underlag?.godkand || status?.underlag?.fakturerad);
  const maskinOk = annan ? extern.trim().length > 0 : !!maskinId;
  const kundOk = kravKund(typ, kund);
  const anledningOk = anledning.trim().length > 0;
  const klar = harAndring && maskinOk && kundOk && anledningOk && !konsekvens.blockerar && !sparar && platsLage.lage.lage === 'klar';

  // Avstånd: valet ligger långt från där bilen faktiskt var → varning, aldrig spärr.
  const varning = (v: { objekt: string | null; plats: string | null }, fore: { objekt: string | null; plats: string | null }, punkt: { lat: number | null; lng: number | null } | null, ord: string): string | null => {
    if (!data || !punkt || punkt.lat == null || punkt.lng == null) return null;
    if (v.objekt === fore.objekt && v.plats === fore.plats) return null;
    const k: PlatsKandidat | undefined = data.platser.find(x => (x.slag === 'objekt' ? x.id === v.objekt : x.id === v.plats));
    if (!k || k.lat == null || k.lng == null) return null;
    const km = avstandKm({ lat: punkt.lat, lng: punkt.lng }, { lat: k.lat, lng: k.lng });
    return km > VARNA_OVER_KM ? `${k.namn} ligger ${Math.round(km).toLocaleString('sv-SE')} km från ${ord}. Stämmer valet?` : null;
  };
  const franVarning = raw ? varning(fran, { objekt: raw.fran_objekt_id, plats: raw.fran_plats_id }, { lat: raw.fran_lat, lng: raw.fran_lng }, 'där maskinen hämtades') : null;
  const tillVarning = raw ? varning(till, { objekt: raw.till_objekt_id, plats: raw.till_plats_id }, { lat: raw.till_lat, lng: raw.till_lng }, 'där bilen lämnade maskinen') : null;

  const historik: Rattning[] = status?.historik ?? [];
  const original = historik[0]?.fore ?? null;
  const nuvarande = [FLYTT_TYP_ORD[(raw?.flytt_typ ?? '') as keyof typeof FLYTT_TYP_ORD] ?? raw?.flytt_typ, raw?.kund ? `kund ${raw.kund}` : null].filter(Boolean).join(' · ');

  async function spara() {
    if (!klar || !fore) return;
    setSparar(true); setFel(null);
    const svar = await rattaFlytt(ben.id, andringar, anledning, namn);
    setSparar(false);
    if (!svar.ok) { setFel(svar.fel); onAndrad(); return; }
    onAndrad();
    onKlar(rattaKvitto(svar.res as RattaResultat, 'rattning'));
  }

  async function stryk() {
    if (!anledningOk || sparar) return;
    setSparar(true); setFel(null);
    const svar = await strykEnFlytt(ben.id, anledning, namn);
    setSparar(false);
    if (!svar.ok) { setFel(svar.fel); onAndrad(); return; }
    onAndrad();
    onKlar(rattaKvitto(svar.res as RattaResultat, 'stryk'));
  }

  async function lamnaTillbaka() {
    if (!status?.underlagId || sparar) return;
    setSparar(true); setFel(null);
    const svar = await angraGodkannande(status.underlagId);
    setSparar(false);
    if (!svar.ok) setFel(`Kunde inte lämna tillbaka flytten: ${svar.fel}`);
    onAndrad();
  }

  // ── Läsfel och saknad data: säg det, rätta inget ─────────────────────────────────────────────
  if (!raw || !fore) {
    return (
      <Ark rubrik="Rätta flytten" onStang={onTillbaka}>
        <p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: 0 }}>Flytten kunde inte läsas — gå tillbaka och försök igen.</p>
      </Ark>
    );
  }
  if (platsLage.lage.lage === 'fel') {
    return (
      <Ark rubrik="Rätta flytten" onStang={onTillbaka}>
        <div style={{ textAlign: 'center', padding: `${AVSTAND.l}px 0` }}>
          <p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: `0 0 ${AVSTAND.m}px` }}>Kunde inte läsa maskiner och trakter just nu.</p>
          <button type="button" onClick={platsLage.forsokIgen} style={KNAPP.sekundar}>Försök igen</button>
        </div>
      </Ark>
    );
  }

  // ── Låst ─────────────────────────────────────────────────────────────────────────────────────
  if (last) {
    const fakturerad = !!status?.underlag?.fakturerad;
    return (
      <Ark rubrik="Rätta flytten" onStang={onTillbaka}
        fot={!fakturerad ? (
          <>
            {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
            <button type="button" onClick={lamnaTillbaka} disabled={sparar} style={{ ...KNAPP.primar, ...(sparar ? INAKTIV : {}) }}>
              {sparar ? 'Lämnar tillbaka …' : 'Lämna tillbaka till Att godkänna'}
            </button>
          </>
        ) : undefined}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
          <div>
            <div style={{ ...TYP.listtitel, color: FARG.text }}>{rubrik}</div>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>{nuvarande}</div>
          </div>
          <p role="status" style={{ ...TYP.text, color: FARG.text, margin: 0 }}>
            {fakturerad ? 'Flytten är fakturerad och går inte att rätta.' : 'Flytten är godkänd för fakturering och därför låst.'}
          </p>
          {!fakturerad && <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>
            Lämna tillbaka den till Att godkänna för att kunna rätta den. Den räknas då inte längre i fakturerbart förrän du godkänner den igen.
          </p>}
          {fel && fakturerad && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
          <Historik historik={historik} original={original} data={data} />
        </div>
      </Ark>
    );
  }

  // ── Stryk ────────────────────────────────────────────────────────────────────────────────────
  if (laget === 'stryk') {
    return (
      <Ark rubrik="Stryk flytten" onStang={() => { setLaget('ratta'); setFel(null); }}
        fot={(
          <>
            {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
            <button type="button" onClick={stryk} disabled={!anledningOk || sparar}
              style={{ ...KNAPP.destruktiv, justifyContent: 'center', width: '100%', ...(anledningOk && !sparar ? {} : INAKTIV) }}>
              {sparar ? 'Stryker …' : 'Stryk flytten'}
            </button>
          </>
        )}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
          <div>
            <div style={{ ...TYP.listtitel, color: FARG.text }}>{rubrik}</div>
            <div style={{ ...TYP.meta, color: FARG.text2 }}>{nuvarande}</div>
          </div>
          <Etikett text="Varför stryks flytten?">
            <textarea value={anledning} onChange={e => setAnledning(e.target.value)} rows={3} autoFocus
              placeholder="t.ex. flyttades aldrig, registrerades av misstag, mätningen är fel"
              style={{ ...faltStil, resize: 'none' }} />
          </Etikett>
          <div style={{ ...TYP.meta, color: FARG.text2, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
            <p style={{ margin: 0 }}>En struken flytt hände aldrig: den försvinner ur rundan, ur Körningar och ur maskinens senaste plats.</p>
            {status?.underlag?.status === 'aktiv' && <p style={{ margin: 0 }}>Dess underlag i faktureringen stryks med din anledning.</p>}
            <p style={{ margin: 0 }}>Positionen som skrevs när flytten avslutades raderas bara om den går att identifiera exakt; annars lämnas den och du får veta det.</p>
            <p style={{ margin: 0 }}>Strykningen och dess anledning sparas, men flytten går inte att ta tillbaka härifrån.</p>
          </div>
        </div>
      </Ark>
    );
  }

  // ── Rätta ────────────────────────────────────────────────────────────────────────────────────
  return (
    <Ark rubrik="Rätta flytten" onStang={onTillbaka}
      fot={(
        <>
          {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
          <button type="button" onClick={spara} disabled={!klar} style={{ ...KNAPP.primar, ...(klar ? {} : INAKTIV) }}>
            {sparar ? 'Sparar …' : 'Spara rättning'}
          </button>
          <button type="button" onClick={() => { setLaget('stryk'); setFel(null); }} disabled={sparar} style={KNAPP.destruktiv}>Stryk flytten …</button>
        </>
      )}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        <div style={{ ...TYP.listtitel, color: FARG.text }}>{rubrik}</div>

        <section aria-label="Mätt" style={{ background: FARG.fyllning, borderRadius: RADIE.rad, padding: AVSTAND.m }}>
          <div style={{ ...TYP.micro, color: FARG.text2 }}>Mätt — går inte att rätta</div>
          <div style={{ ...TYP.text, ...TNUM, color: FARG.text }}>
            {raw.flytt_km != null ? `${Math.round(raw.flytt_km * 10) / 10} km` : 'km saknas i datan'}
            {ben.min != null ? ` · ${Math.round(ben.min)} min` : ''}
          </div>
          <p style={{ ...TYP.meta, color: FARG.text2, margin: `${AVSTAND.xs}px 0 0` }}>Är mätningen fel ska flytten strykas, inte rättas.</p>
        </section>

        {platsLage.lage.lage === 'laddar' ? (
          <p role="status" style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Läser maskiner och trakter …</p>
        ) : data && (
          <>
            <Etikett text="Maskin">
              <select aria-label="Maskin" value={annan ? ANNAN : (maskinId ?? '')} style={faltStil}
                onChange={e => { if (e.target.value === ANNAN) { setAnnan(true); } else { setAnnan(false); setMaskinId(e.target.value || null); } }}>
                {!maskinId && !annan && <option value="">Välj maskin</option>}
                {data.maskiner.map(m => <option key={m.maskin_id} value={m.maskin_id}>{m.namn}</option>)}
                <option value={ANNAN}>Annans maskin …</option>
              </select>
              {annan && <input aria-label="Annans maskin" value={extern} onChange={e => setExtern(e.target.value)} placeholder="Maskinens namn" style={{ ...faltStil, marginTop: AVSTAND.xs }} />}
            </Etikett>

            <PlatsVal etikett="Från" objektId={fran.objekt} platsId={fran.plats} platser={data.platser} onVal={setFran} />
            {franVarning && <p role="note" style={{ ...TYP.meta, color: FARG.orange, margin: `-${AVSTAND.s}px 0 0` }}>{franVarning}</p>}
            <PlatsVal etikett="Till" objektId={till.objekt} platsId={till.plats} platser={data.platser} onVal={setTill} />
            {tillVarning && <p role="note" style={{ ...TYP.meta, color: FARG.orange, margin: `-${AVSTAND.s}px 0 0` }}>{tillVarning}</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
              <span style={{ ...TYP.micro, color: FARG.text2 }}>Typ</span>
              <div role="group" aria-label="Typ" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: AVSTAND.xs }}>
                {FLYTT_TYPER.map(t => (
                  <button key={t} type="button" aria-pressed={typ === t} onClick={() => setTyp(t)}
                    style={{ ...KNAPP.sekundar, width: 'auto', fontWeight: typ === t ? 700 : 400, background: typ === t ? FARG.upphojt : FARG.fyllning, color: typ === t ? FARG.text : FARG.text2 }}>
                    {typ === t ? '✓ ' : ''}{FLYTT_TYP_ORD[t]}
                  </button>
                ))}
              </div>
            </div>

            <Etikett text={typ === 'kunduppdrag' ? 'Kund (krävs för kunduppdrag)' : 'Kund (valfritt)'}>
              <input aria-label="Kund" value={kund} onChange={e => setKund(e.target.value)} placeholder="saknas i datan" style={faltStil} />
              {!kundOk && <span role="alert" style={{ ...TYP.meta, color: FARG.rod }}>Skriv vilken kund flytten gjordes åt.</span>}
            </Etikett>

            <Etikett text="Varför rättas flytten? (krävs)">
              <textarea aria-label="Anledning" value={anledning} onChange={e => setAnledning(e.target.value)} rows={2}
                placeholder="t.ex. valde fel trakt i stunden" style={{ ...faltStil, resize: 'none' }} />
            </Etikett>

            {harAndring && (
              <p role="status" data-konsekvens={konsekvens.atgard} style={{ ...TYP.meta, color: konsekvens.blockerar ? FARG.rod : FARG.text2, margin: 0 }}>
                {konsekvens.text}
              </p>
            )}
          </>
        )}

        <Historik historik={historik} original={original} data={data} />
      </div>
    </Ark>
  );
}

/** Vad som rättats förut — originalet först, sedan varje rättning med anledning. Spåret är append-only. */
function Historik({ historik, original, data }: { historik: Rattning[]; original: Record<string, any> | null; data: PlatsData | null }) {
  if (historik.length === 0) return null;
  return (
    <section aria-label="Tidigare rättningar" style={{ borderTop: `1px solid ${FARG.linje}`, paddingTop: AVSTAND.m, display: 'flex', flexDirection: 'column', gap: AVSTAND.s }}>
      <div style={{ ...TYP.micro, color: FARG.text2 }}>Tidigare rättningar</div>
      {original && <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>Original: {beskriv(original, data)}</p>}
      {historik.map(h => (
        <p key={h.id} style={{ ...TYP.meta, color: FARG.text, margin: 0 }}>
          {fmtDatum(h.tid)} · {h.av}{h.slag === 'stryk' ? ' · strök flytten' : ''}: {h.anledning}
        </p>
      ))}
    </section>
  );
}
