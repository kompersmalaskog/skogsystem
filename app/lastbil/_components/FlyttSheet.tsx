'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Ark from '@/components/design/Ark';
import { AVSTAND, FARG, IKON, INAKTIV, KNAPP, KORT, RAD, RADIE, TNUM, TYP } from '@/lib/design/tokens';
import { FLYTT_TYPER, FLYTT_TYP_ORD } from '@/lib/flytt/fakturerbar';
import { forhandsbesked } from '@/lib/flytt/forhandsbesked';
import { fmtDatum } from './nu';
import { fmtKm, kundNotis, strackaNotis } from './fakturerbart';
import { angraGodkannande, andraFlytt } from './godkann';
import { gransText, tolkaKm } from './kmRegler';
import { andradeFalt, kravKund, kvittoText, rattaFlytt, strykEnFlytt, type Falt } from './ratta';
import { beskrivRattning } from './rattningText';
import { useFlyttDetalj, type FlyttDetalj } from './useFlyttDetalj';
import type { Rattning } from './useFlyttDetalj';
import { platsVarning } from './platsVarning';
import { usePlatsData, type PlatsData, type PlatsKandidat } from './usePlatsData';

type Vy = 'huvud' | 'maskin' | 'fran' | 'till' | 'typ' | 'stryk';
type Plats = { objekt: string | null; plats: string | null };

const TYP_RAD: Record<string, string> = {
  produktion: 'Fakturerbar från 30 km',
  service: 'Aldrig fakturerbar',
  kunduppdrag: 'Alltid fakturerbar — kund krävs',
  annat: 'Aldrig fakturerbar',
};
const MAX_TRAFFAR = 30;

const maskinNamn = (data: PlatsData | null, id: string | null, extern: string | null): string =>
  extern?.trim() ? extern.trim() : id ? (data?.maskiner.find(m => m.maskin_id === id)?.namn ?? 'Okänd maskin') : 'Välj maskin';
const platsNamn = (data: PlatsData | null, p: Plats): string => {
  if (!p.objekt && !p.plats) return 'Okänd plats';
  return data?.platser.find(x => (x.slag === 'objekt' ? x.id === p.objekt : x.id === p.plats))?.namn ?? 'Okänd plats';
};

// ── iOS-rader ────────────────────────────────────────────────────────────────────────────────────

function Grupp({ rubrik, children }: { rubrik: string; children: ReactNode }) {
  return (
    <section aria-label={rubrik}>
      <div style={{ ...TYP.micro, color: FARG.text2, margin: `0 0 ${AVSTAND.xs}px ${AVSTAND.s}px` }}>{rubrik}</div>
      <div style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>{children}</div>
    </section>
  );
}

/** En rad med etikett till vänster och värde till höger. Med `onTryck` har den en chevron; utan är den bara text (låst). */
function ValRad({ etikett, varde, notis, notisFarg = FARG.text2, varning, sista, onTryck }: {
  etikett: string; varde: string; notis?: string | null; notisFarg?: string;
  /** Valet ligger långt från där bilen var: en varning, aldrig en spärr. */
  varning?: string | null; sista?: boolean; onTryck?: () => void;
}) {
  const kant = sista ? 'none' : `1px solid ${FARG.linje}`;
  const rad = (
    <>
      <span style={{ ...TYP.text, color: FARG.text, flexShrink: 0 }}>{etikett}</span>
      <span style={{ ...TYP.text, color: FARG.text2, marginLeft: 'auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{varde}</span>
      {onTryck && <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.rad, color: FARG.text3, flexShrink: 0 }}>chevron_right</span>}
    </>
  );
  return (
    <div style={{ borderBottom: kant }}>
      {onTryck ? (
        <button type="button" onClick={onTryck} aria-label={`${etikett}: ${varde}`}
          style={{ ...RAD, borderBottom: 'none', width: '100%', background: 'none', border: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer', color: FARG.text }}>{rad}</button>
      ) : (
        <div style={{ ...RAD, borderBottom: 'none' }}>{rad}</div>
      )}
      {notis && <div style={{ ...TYP.meta, color: notisFarg, paddingBottom: AVSTAND.s }}>{notis}</div>}
      {varning && <div role="note" style={{ ...TYP.meta, color: FARG.orange, paddingBottom: AVSTAND.s }}>{varning}</div>}
    </div>
  );
}

const faltStil = { ...TYP.text, ...TNUM, color: FARG.text, background: FARG.fyllning, border: 'none', borderRadius: RADIE.rad, padding: AVSTAND.m, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const, minHeight: 44 };

/** Ett val i en väljare: namn, en förklarande rad, en bock när det är valt. */
function ValAlternativ({ namn, sub, valt, onTryck }: { namn: string; sub?: string; valt: boolean; onTryck: () => void }) {
  return (
    <button type="button" role="option" aria-selected={valt} onClick={onTryck}
      style={{ ...RAD, width: '100%', background: 'none', border: 'none', borderBottom: `1px solid ${FARG.linje}`, textAlign: 'left', font: 'inherit', cursor: 'pointer', color: FARG.text }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ ...TYP.text, color: FARG.text, display: 'block' }}>{namn}</span>
        {sub && <span style={{ ...TYP.meta, color: FARG.text2, display: 'block' }}>{sub}</span>}
      </span>
      {valt && <span className="material-symbols-outlined" aria-label="Vald" style={{ fontSize: IKON.rad, color: FARG.text }}>check</span>}
    </button>
  );
}

function PlatsValjare({ platser, valt, onVal }: { platser: readonly PlatsKandidat[]; valt: Plats; onVal: (p: Plats) => void }) {
  const [sok, setSok] = useState('');
  const traffar = useMemo(() => {
    const q = sok.trim().toLocaleLowerCase('sv');
    if (!q) return platser.filter(p => p.slag === 'plats');
    return platser.filter(p => p.namn.toLocaleLowerCase('sv').includes(q)).slice(0, MAX_TRAFFAR);
  }, [sok, platser]);
  const antalTrakter = platser.filter(p => p.slag === 'objekt').length;
  const ärValt = (p: PlatsKandidat) => (p.slag === 'objekt' ? p.id === valt.objekt : p.id === valt.plats);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <input autoFocus value={sok} onChange={e => setSok(e.target.value)} placeholder="Sök trakt eller plats" aria-label="Sök trakt eller plats" style={faltStil} />
      <div role="listbox" aria-label="Träffar" style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
        {traffar.map(p => <ValAlternativ key={`${p.slag}:${p.id}`} namn={p.namn} sub={p.slag === 'plats' ? 'Plats' : 'Trakt'} valt={ärValt(p)}
          onTryck={() => onVal(p.slag === 'objekt' ? { objekt: p.id, plats: null } : { objekt: null, plats: p.id })} />)}
        {traffar.length === 0 && <p style={{ ...TYP.meta, color: FARG.text2, margin: 0, padding: `${AVSTAND.m}px 0` }}>Ingen träff på "{sok.trim()}".</p>}
        <ValAlternativ namn="Okänd plats" valt={!valt.objekt && !valt.plats} onTryck={() => onVal({ objekt: null, plats: null })} />
      </div>
      {!sok.trim() && <p style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>Skriv för att söka bland {antalTrakter} trakter.</p>}
    </div>
  );
}

function MaskinValjare({ maskiner, maskinId, extern, onVal }: {
  maskiner: PlatsData['maskiner']; maskinId: string | null; extern: string; onVal: (v: { maskinId: string | null; extern: string }) => void;
}) {
  const [annan, setAnnan] = useState(!!extern);
  const [text, setText] = useState(extern);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.m }}>
      <div role="listbox" aria-label="Maskiner" style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
        {maskiner.map(m => <ValAlternativ key={m.maskin_id} namn={m.namn} valt={!extern && m.maskin_id === maskinId} onTryck={() => onVal({ maskinId: m.maskin_id, extern: '' })} />)}
        <ValAlternativ namn="Annan maskin" sub="Skriv maskinens namn" valt={!!extern} onTryck={() => setAnnan(true)} />
      </div>
      {annan && (
        <>
          <input autoFocus value={text} onChange={e => setText(e.target.value)} placeholder="Maskinens namn" aria-label="Annans maskin" style={faltStil} />
          <button type="button" disabled={!text.trim()} onClick={() => onVal({ maskinId: null, extern: text.trim() })}
            style={{ ...KNAPP.sekundar, justifyContent: 'center', ...(text.trim() ? {} : INAKTIV) }}>Använd</button>
        </>
      )}
    </div>
  );
}

function Historik({ rader, data }: { rader: readonly Rattning[]; data: PlatsData | null }) {
  if (rader.length === 0) return null;
  return (
    <section aria-label="Historik" style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
      <div style={{ ...TYP.micro, color: FARG.text2, marginLeft: AVSTAND.s }}>Historik</div>
      {rader.map(r => <p key={r.id} style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 0 ${AVSTAND.s}px` }}>{beskrivRattning(r, data)}</p>)}
    </section>
  );
}

// ── Sheeten ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Flytten: DEN ENDA rättningsvyn — öppnas från en flyttrad i Körningar (alla avslutade flyttar, fakturerbara eller
 * inte) och från en rad i Fakturering. Två grupper — FLYTTEN (det människan angav: maskin, från, till, typ; varje rad
 * en väljare) och FAKTURA (justerad sträcka och kund; BARA när flytten har ett underlag) — och en obligatorisk
 * anledning. Ändringar under FLYTTEN går som EN `ratta_flytt` med bara de nycklar som ändrats; ändringar under
 * FAKTURA går den befintliga vägen mot underlaget, efteråt. Faller `ratta_flytt` sparas ingenting.
 *
 * Förhandsbeskedet över Spara säger i klartext vad som kommer att hända, åt båda hållen, räknat med samma regel som
 * databasens `fakturerbar_for`. En flytt som pågår, är struken, är godkänd eller är fakturerad är LÅST: allt är
 * läsbart, en grå rad säger varför, och inget går att trycka på som ger fel.
 */
export default function FlyttSheet({ flyttId, underlagId = null, namn, onStang, onKlar, onDelvis, onAndrad }: {
  /** maskin_flytt.id. Saknas det (en gammal underlagsrad utan flytt) säger sheeten det. */
  flyttId: string | null;
  /** Underlaget som öppnades (Fakturering), om flytten har flera. Körningar skickar inget: sheeten läser själv. */
  underlagId?: string | null;
  /** Inloggad användares namn — `p_av` och `redigerad_av`. */
  namn: string;
  onStang: () => void;
  /** Allt gick igenom: toasten att visa. */
  onKlar: (text: string) => void;
  /** Flytten rättades men FAKTURA-delen kunde inte sparas: felet att visa på sidan (sheeten stängs). */
  onDelvis: (fel: string) => void;
  /** Något ändrades i databasen: läs om listan, remsan och påminnelsen. */
  onAndrad: () => void;
}) {
  const detalj = useFlyttDetalj(flyttId, underlagId);
  const platsLage = usePlatsData(true);
  const data = platsLage.lage.lage === 'klar' ? platsLage.lage.data : null;
  const flytt: FlyttDetalj | null = detalj.lage.lage === 'klar' ? detalj.lage.flytt : null;
  const u = detalj.lage.lage === 'klar' ? detalj.lage.underlag : null;
  const historik = detalj.lage.lage === 'klar' ? detalj.lage.historik : [];

  const [vy, setVy] = useState<Vy>('huvud');
  const [form, setForm] = useState<{ maskinId: string | null; extern: string; fran: Plats; till: Plats; typ: string; kund: string; km: string } | null>(null);
  const [anledning, setAnledning] = useState('');
  const [stryktAnledning, setStryktAnledning] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  // Formuläret fylls en gång, när flytten är läst: från flytten (det angivna) och underlaget (sträcka, kund) om det finns.
  useEffect(() => {
    if (form || !flytt) return;
    setForm({
      maskinId: flytt.maskin_id, extern: flytt.extern_maskin ?? '',
      fran: { objekt: flytt.fran_objekt_id, plats: flytt.fran_plats_id }, till: { objekt: flytt.till_objekt_id, plats: flytt.till_plats_id },
      typ: flytt.flytt_typ, kund: (u ? u.kund : flytt.kund) ?? '', km: u?.km == null ? '' : String(u.km).replace('.', ','),
    });
  }, [flytt, u, form]);

  const stang = () => { setVy('huvud'); setFel(null); };

  // ── Inte läst än, läsfel, saknad flytt ──────────────────────────────────────────────────────
  if (detalj.lage.lage === 'laddar' || platsLage.lage.lage === 'laddar' || (flytt && !form)) {
    return <Ark rubrik="Flytten" onStang={onStang}><p role="status" style={{ ...TYP.text, color: FARG.text2, margin: 0 }}>Läser flytten …</p></Ark>;
  }
  if (detalj.lage.lage === 'fel' || platsLage.lage.lage === 'fel') {
    return (
      <Ark rubrik="Flytten" onStang={onStang}>
        <div style={{ textAlign: 'center', padding: `${AVSTAND.l}px 0` }}>
          <p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: `0 0 ${AVSTAND.m}px` }}>Kunde inte läsa flytten just nu.</p>
          <button type="button" onClick={() => { detalj.laddaOm(); platsLage.forsokIgen(); }} style={KNAPP.sekundar}>Försök igen</button>
        </div>
      </Ark>
    );
  }
  if (!flyttId) {
    return <Ark rubrik="Flytten" onStang={onStang}><p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: 0 }}>Den här raden hör inte till någon flytt och går inte att rätta härifrån.</p></Ark>;
  }
  if (!flytt || !form) {
    return <Ark rubrik="Flytten" onStang={onStang}><p role="alert" style={{ ...TYP.text, color: FARG.rod, margin: 0 }}>Flytten finns inte längre — ladda om listan.</p></Ark>;
  }

  const nuPlats = (p: Plats) => platsNamn(data, p);
  const matt = flytt.flytt_km;

  // ── Låst: allt läsbart, inga chevrons, inga redigeringsknappar, en grå rad som säger varför ──
  const lasText: string | null = flytt.avbruten ? 'Struken — flytten hände aldrig och går inte att ändra'
    : flytt.sluttid == null ? 'Pågår — går att rätta när flytten är avslutad'
    : u?.fakturerad_tid ? 'Fakturerad — går inte att ändra'
    : u?.godkand_tid ? 'Godkänd — lämna tillbaka till Att godkänna för att ändra'
    : null;
  if (lasText) {
    const kanLamnaTillbaka = !flytt.avbruten && flytt.sluttid != null && !!u?.godkand_tid && !u.fakturerad_tid;
    const lamnaTillbaka = async () => {
      if (sparar || !u) return;
      setSparar(true); setFel(null);
      const svar = await angraGodkannande(u.id);
      setSparar(false);
      if (!svar.ok) { setFel(`Kunde inte lämna tillbaka flytten: ${svar.fel}`); if (svar.utdaterad) onAndrad(); return; }
      onAndrad();
      onStang();
    };
    return (
      <Ark rubrik="Flytten" onStang={onStang}
        fot={kanLamnaTillbaka ? (
          <>
            {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
            <button type="button" onClick={lamnaTillbaka} disabled={sparar} style={{ ...KNAPP.sekundar, justifyContent: 'center', ...(sparar ? INAKTIV : {}) }}>
              {sparar ? 'Lämnar tillbaka …' : 'Lämna tillbaka till Att godkänna'}
            </button>
          </>
        ) : undefined}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
          <Grupp rubrik="Flytten">
            <ValRad etikett="Maskin" varde={maskinNamn(data, form.maskinId, form.extern)} />
            <ValRad etikett="Från" varde={nuPlats(form.fran)} />
            <ValRad etikett="Till" varde={nuPlats(form.till)} />
            <ValRad etikett="Typ" varde={FLYTT_TYP_ORD[form.typ as keyof typeof FLYTT_TYP_ORD] ?? form.typ} sista />
          </Grupp>
          {u && (
            <Grupp rubrik="Faktura">
              <ValRad etikett="Sträcka" varde={strackaNotis(u.km, matt)} />
              <ValRad etikett="Kund" varde={u.kund ?? 'saknas i datan'} notis={kundNotis(u, fmtDatum)} notisFarg={FARG.orange} sista />
            </Grupp>
          )}
          <p role="status" data-last style={{ ...TYP.text, color: FARG.text2, margin: 0, display: 'flex', alignItems: 'center', gap: AVSTAND.s }}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: IKON.rad }}>lock</span>
            {lasText}
          </p>
          {fel && !kanLamnaTillbaka && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
          <Historik rader={historik} data={data} />
        </div>
      </Ark>
    );
  }

  // ── Redigerbar ──────────────────────────────────────────────────────────────────────────────
  const f = form;
  const set = (p: Partial<typeof f>) => setForm({ ...f, ...p });
  /** FAKTURA finns bara när flytten har ett underlag, och går bara att ändra medan underlaget är aktivt. */
  const fakturaRedigerbar = !!u && u.status === 'aktiv';
  const fore: Falt = {
    maskin_id: flytt.maskin_id, extern_maskin: flytt.extern_maskin, fran_objekt_id: flytt.fran_objekt_id, fran_plats_id: flytt.fran_plats_id,
    till_objekt_id: flytt.till_objekt_id, till_plats_id: flytt.till_plats_id, flytt_typ: flytt.flytt_typ, kund: flytt.kund,
  };
  const kundNy = f.kund.trim() || null;
  // Kund hör till flytten bara när typen är Kunduppdrag (databasens CHECK kräver den då); annars är kunden en uppgift på fakturan.
  const nu: Falt = {
    maskin_id: f.extern.trim() ? null : f.maskinId, extern_maskin: f.extern.trim() || null,
    fran_objekt_id: f.fran.objekt, fran_plats_id: f.fran.plats, till_objekt_id: f.till.objekt, till_plats_id: f.till.plats,
    flytt_typ: f.typ, kund: f.typ === 'kunduppdrag' ? kundNy : flytt.kund,
  };
  const flyttAndringar = andradeFalt(fore, nu);
  const kundMedFlytt = 'kund' in flyttAndringar;
  const nyKm = tolkaKm(f.km);
  const kmOk = !fakturaRedigerbar || (f.km.trim() === '' ? u!.km == null : nyKm != null);
  const kmAndrat = fakturaRedigerbar && nyKm != null && (u!.km == null || Math.abs(nyKm - u!.km) > 1e-9);
  const kundAndratFaktura = fakturaRedigerbar && !kundMedFlytt && kundNy !== ((u!.kund ?? '').trim() || null);
  const harFlyttAndring = Object.keys(flyttAndringar).length > 0;
  const harFakturaAndring = kmAndrat || kundAndratFaktura;
  const kundOk = kravKund(f.typ, kundNy);
  const maskinOk = !!(f.extern.trim() || f.maskinId);
  const anledningOk = anledning.trim().length > 0;
  const klar = (harFlyttAndring || harFakturaAndring) && kundOk && kmOk && maskinOk && anledningOk && !sparar;

  // Åt båda hållen: Produktion → Service stryker underlaget, Service → Produktion ≥ 30 km skapar ett.
  const besked = forhandsbesked(
    { typ: flytt.flytt_typ, km: matt, fakturerbar: flytt.fakturerbar, maskinId: flytt.maskin_id, externMaskin: flytt.extern_maskin },
    { typ: f.typ, maskinId: f.extern.trim() ? null : f.maskinId, externMaskin: f.extern.trim() || null },
    maskinNamn(data, f.maskinId, null),
  );
  const stryks = besked.some(r => r.startsWith('Blir inte fakturerbar'));
  if (stryks && harFakturaAndring) besked.push('Ändringar under Faktura sparas inte — underlaget stryks');

  async function spara() {
    if (!klar) return;
    setSparar(true); setFel(null);
    let rattaText: string | null = null;
    let underlagStruket = false;
    if (harFlyttAndring) {
      const svar = await rattaFlytt(flytt!.id, flyttAndringar, anledning, namn);
      if (!svar.ok) { setSparar(false); setFel(svar.fel); onAndrad(); return; }      // faller ratta_flytt sparas ingenting
      rattaText = kvittoText(svar.res, 'rattning');
      underlagStruket = svar.res.underlag === 'struket';
    }
    if (harFakturaAndring && !underlagStruket) {
      const falt: { km?: number; kund?: string | null } = {};
      if (kmAndrat && nyKm != null) falt.km = nyKm;
      if (kundAndratFaktura) falt.kund = kundNy;
      const s2 = await andraFlytt(u!.id, falt, namn);
      if (!s2.ok) {
        setSparar(false); onAndrad();
        onDelvis(`${rattaText ? 'Flytten är rättad, men' : 'Kunde inte spara:'} ändringen under Faktura sparades inte: ${s2.fel}`);
        return;
      }
    }
    setSparar(false);
    onAndrad();
    const delar = [rattaText ?? 'Sparat', harFakturaAndring && !underlagStruket && rattaText ? 'Sträcka/kund sparad' : null].filter(Boolean);
    onKlar(delar.join(' · '));
  }

  async function stryk() {
    if (!stryktAnledning.trim() || sparar) return;
    setSparar(true); setFel(null);
    const svar = await strykEnFlytt(flytt!.id, stryktAnledning, namn);
    setSparar(false);
    if (!svar.ok) { setFel(svar.fel); onAndrad(); return; }
    onAndrad();
    onKlar(kvittoText(svar.res, 'stryk'));
  }

  const grans = kmAndrat ? gransText(u!.km, nyKm) : null;
  const rubriker: Record<Vy, string> = { huvud: 'Flytten', maskin: 'Maskin', fran: 'Från', till: 'Till', typ: 'Typ', stryk: 'Stryk flytten' };
  const tillNamn = nuPlats({ objekt: flytt.till_objekt_id, plats: flytt.till_plats_id });
  const harPosition = !!flytt.maskin_id && flytt.till_lat != null && flytt.till_lng != null;
  // Utan underlag finns ingen Kund-rad under FAKTURA: ett kunduppdrag får sin kund i FLYTTEN i stället (kravet är databasens).
  const kundIFlytten = !fakturaRedigerbar && f.typ === 'kunduppdrag';
  const franVarning = platsVarning(f.fran, { objekt: flytt.fran_objekt_id, plats: flytt.fran_plats_id }, { lat: flytt.fran_lat, lng: flytt.fran_lng }, 'där maskinen hämtades', data);
  const tillVarning = platsVarning(f.till, { objekt: flytt.till_objekt_id, plats: flytt.till_plats_id }, { lat: flytt.till_lat, lng: flytt.till_lng }, 'där bilen lämnade maskinen', data);

  const kundRad = (
    <div>
      <label style={{ ...RAD, borderBottom: 'none' }}>
        <span style={{ ...TYP.text, color: FARG.text }}>Kund</span>
        <input value={f.kund} onChange={e => set({ kund: e.target.value })} aria-label="Kund" placeholder="saknas i datan"
          style={{ ...TYP.text, color: FARG.text, background: 'none', border: 'none', marginLeft: 'auto', textAlign: 'right', fontFamily: 'inherit', minWidth: 0, flex: 1, minHeight: 36 }} />
      </label>
      {u && kundNotis(u, fmtDatum) && <div style={{ ...TYP.meta, color: FARG.orange, paddingBottom: AVSTAND.s }}>{kundNotis(u, fmtDatum)}</div>}
      {!kundOk && <div role="alert" style={{ ...TYP.meta, color: FARG.rod, paddingBottom: AVSTAND.s }}>Kund krävs för kunduppdrag.</div>}
    </div>
  );

  let innehall: ReactNode;
  let fot: ReactNode = undefined;
  if (vy === 'maskin') {
    innehall = <MaskinValjare maskiner={data!.maskiner} maskinId={f.maskinId} extern={f.extern} onVal={v => { set({ maskinId: v.maskinId, extern: v.extern }); setVy('huvud'); }} />;
  } else if (vy === 'fran' || vy === 'till') {
    const valt = vy === 'fran' ? f.fran : f.till;
    innehall = <PlatsValjare platser={data!.platser} valt={valt} onVal={p => { set(vy === 'fran' ? { fran: p } : { till: p }); setVy('huvud'); }} />;
  } else if (vy === 'typ') {
    innehall = (
      <div role="listbox" aria-label="Typ" style={{ ...KORT, paddingTop: 0, paddingBottom: 0 }}>
        {FLYTT_TYPER.map(t => <ValAlternativ key={t} namn={FLYTT_TYP_ORD[t]} sub={TYP_RAD[t]} valt={f.typ === t} onTryck={() => { set({ typ: t }); setVy('huvud'); }} />)}
      </div>
    );
  } else if (vy === 'stryk') {
    innehall = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        <div>
          <div style={{ ...TYP.listtitel, color: FARG.text }}>{maskinNamn(data, flytt.maskin_id, flytt.extern_maskin)}</div>
          <div style={{ ...TYP.meta, color: FARG.text2 }}>{nuPlats({ objekt: flytt.fran_objekt_id, plats: flytt.fran_plats_id })} → {tillNamn}</div>
        </div>
        <ul data-stryk-konsekvens style={{ ...TYP.text, color: FARG.text, margin: 0, paddingLeft: AVSTAND.l, display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <li>Flytten markeras som struken</li>
          {fakturaRedigerbar && <li>Underlaget stryks</li>}
          {harPosition && <li>Positionen i {tillNamn} tas bort om den går att identifiera exakt</li>}
        </ul>
        <label style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <span style={{ ...TYP.micro, color: FARG.text2 }}>Varför?</span>
          <textarea aria-label="Anledning" value={stryktAnledning} onChange={e => setStryktAnledning(e.target.value)} rows={3} autoFocus
            placeholder="t.ex. flyttades aldrig, registrerades av misstag, mätningen är fel" style={{ ...faltStil, resize: 'none' }} />
        </label>
      </div>
    );
    const klarStryk = stryktAnledning.trim().length > 0 && !sparar;
    fot = (
      <>
        {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
        <button type="button" onClick={stryk} disabled={!klarStryk} style={{ ...KNAPP.destruktiv, justifyContent: 'center', width: '100%', ...(klarStryk ? {} : INAKTIV) }}>
          {sparar ? 'Stryker …' : 'Stryk flytten'}
        </button>
      </>
    );
  } else {
    innehall = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.l }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <Grupp rubrik="Flytten">
            <ValRad etikett="Maskin" varde={maskinNamn(data, f.maskinId, f.extern)} onTryck={() => setVy('maskin')}
              notis={nu.maskin_id !== fore.maskin_id || nu.extern_maskin !== fore.extern_maskin ? `Ändras från ${maskinNamn(data, flytt.maskin_id, flytt.extern_maskin)}` : null} notisFarg={FARG.orange} />
            <ValRad etikett="Från" varde={nuPlats(f.fran)} onTryck={() => setVy('fran')} varning={franVarning}
              notis={f.fran.objekt !== flytt.fran_objekt_id || f.fran.plats !== flytt.fran_plats_id ? `Ändras från ${nuPlats({ objekt: flytt.fran_objekt_id, plats: flytt.fran_plats_id })}` : null} notisFarg={FARG.orange} />
            <ValRad etikett="Till" varde={nuPlats(f.till)} onTryck={() => setVy('till')} varning={tillVarning}
              notis={f.till.objekt !== flytt.till_objekt_id || f.till.plats !== flytt.till_plats_id ? `Ändras från ${nuPlats({ objekt: flytt.till_objekt_id, plats: flytt.till_plats_id })}` : null} notisFarg={FARG.orange} />
            <ValRad etikett="Typ" varde={FLYTT_TYP_ORD[f.typ as keyof typeof FLYTT_TYP_ORD] ?? f.typ} onTryck={() => setVy('typ')} sista={!kundIFlytten}
              notis={f.typ !== flytt.flytt_typ ? `Ändras från ${FLYTT_TYP_ORD[flytt.flytt_typ as keyof typeof FLYTT_TYP_ORD] ?? flytt.flytt_typ}` : null} notisFarg={FARG.orange} />
            {kundIFlytten && kundRad}
          </Grupp>
          {/* Utan ett redigerbart underlag visas mätningen här: den avgör om flytten är fakturerbar (≥ 30 km) och går aldrig att rätta. */}
          {!fakturaRedigerbar && (
            <p data-matt-flytt style={{ ...TYP.meta, color: FARG.text2, margin: `0 0 0 ${AVSTAND.s}px` }}>
              {matt != null ? `Mätt sträcka ${fmtKm(matt)} km — går inte att rätta. Är mätningen fel, stryk flytten.` : 'Mätt sträcka saknas i datan.'}
            </p>
          )}
        </div>

        {u && (
          <Grupp rubrik="Faktura">
            {fakturaRedigerbar ? (
              <>
                <div style={{ borderBottom: `1px solid ${FARG.linje}` }}>
                  <label style={{ ...RAD, borderBottom: 'none' }}>
                    <span style={{ ...TYP.text, color: FARG.text }}>Sträcka</span>
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: AVSTAND.xs, ...TYP.text, ...TNUM, color: FARG.text2 }}>
                      <input value={f.km} onChange={e => set({ km: e.target.value })} inputMode="decimal" aria-label="Sträcka i km"
                        style={{ ...TYP.text, ...TNUM, color: FARG.text, background: FARG.fyllning, border: 'none', borderRadius: RADIE.rad, padding: `${AVSTAND.s}px ${AVSTAND.m}px`, width: 72, textAlign: 'right', fontFamily: 'inherit', minHeight: 36, boxSizing: 'border-box' }} />
                      <span data-matt>km{matt != null ? ` · mätt ${fmtKm(matt)}` : ' · mätt saknas i datan'}</span>
                    </span>
                  </label>
                  {f.km.trim() !== '' && nyKm == null && <div role="alert" style={{ ...TYP.meta, color: FARG.rod, paddingBottom: AVSTAND.s }}>Skriv km som ett tal större än noll.</div>}
                  {grans && <div role="note" style={{ ...TYP.meta, color: FARG.text2, paddingBottom: AVSTAND.s }}>{grans}</div>}
                </div>
                {kundRad}
              </>
            ) : (
              <>
                <ValRad etikett="Sträcka" varde={strackaNotis(u.km, matt)} />
                <ValRad etikett="Kund" varde={u.kund ?? 'saknas i datan'} notis={kundNotis(u, fmtDatum)} notisFarg={FARG.orange} sista />
                <div style={{ ...TYP.meta, color: FARG.text2, paddingBottom: AVSTAND.s }}>
                  Underlaget är struket i faktureringen{u.struken_anledning ? `: ${u.struken_anledning}` : ''}.
                </div>
              </>
            )}
          </Grupp>
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
          <span style={{ ...TYP.micro, color: FARG.text2, marginLeft: AVSTAND.s }}>Varför?</span>
          <textarea aria-label="Anledning" value={anledning} onChange={e => setAnledning(e.target.value)} rows={2} placeholder="t.ex. valde fel trakt i stunden" style={{ ...faltStil, resize: 'none' }} />
        </label>

        <Historik rader={historik} data={data} />
      </div>
    );
    fot = (
      <>
        {besked.length > 0 && (
          <div role="status" data-forhandsbesked style={{ display: 'flex', flexDirection: 'column', gap: AVSTAND.xs }}>
            {besked.map(r => <p key={r} style={{ ...TYP.meta, color: FARG.text2, margin: 0 }}>{r}</p>)}
          </div>
        )}
        {fel && <p role="alert" style={{ ...TYP.meta, color: FARG.rod, margin: 0 }}>{fel}</p>}
        <button type="button" onClick={spara} disabled={!klar} style={{ ...KNAPP.primar, ...(klar ? {} : INAKTIV) }}>{sparar ? 'Sparar …' : 'Spara'}</button>
        <button type="button" onClick={() => { setVy('stryk'); setFel(null); }} disabled={sparar} style={KNAPP.destruktiv}>Stryk flytten …</button>
      </>
    );
  }

  return <Ark rubrik={rubriker[vy]} onStang={vy === 'huvud' ? onStang : stang} fot={fot}>{innehall}</Ark>;
}
