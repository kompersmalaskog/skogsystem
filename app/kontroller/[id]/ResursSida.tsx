'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { berakna, alder, type Berakning, type Kontrollrad } from '@/lib/status';
import { KONTROLLTYPER, type Kontrolltypnyckel } from '@/lib/kontrolltyper';
import {
  FF, FARG, fmtHeltal, fmtDatumLang, fmtRelativDagar, enhetKort,
  resursRubrik, type Resurs,
} from '@/lib/kontroller-format';

type Handelse = { id?: string; typ: string; benamning: string | null; datum: string; matarstallning: number | null; kontroll_id?: string | null };

const HANDELSETYPER: { v: string; label: string }[] = [
  { v: 'besiktning', label: 'Besiktning' },
  { v: 'service', label: 'Service' },
  { v: 'reparation', label: 'Reparation' },
  { v: 'byte', label: 'Byte' },
  { v: 'ovrigt', label: 'Övrigt' },
];
const HANDELSE_LABEL: Record<string, string> = Object.fromEntries(HANDELSETYPER.map(h => [h.v, h.label]));

export default function ResursSida({ id, kanRedigera }: { id: string; kanRedigera: boolean }) {
  const router = useRouter();
  const [resurs, setResurs] = useState<Resurs | null>(null);
  const [forslag, setForslag] = useState<Handelse[]>([]);
  const [historik, setHistorik] = useState<Handelse[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [visaAllt, setVisaAllt] = useState(false);
  const [visarForm, setVisarForm] = useState(false);

  async function hamta() {
    setLaddar(true); setFel(null);
    try {
      const [rR, hR] = await Promise.all([
        fetch(`/api/resurs/${id}`, { cache: 'no-store' }),
        fetch(`/api/handelse?resurs_id=${id}`, { cache: 'no-store' }),
      ]);
      const rBody = await rR.json();
      const hBody = await hR.json();
      if (!rR.ok || !rBody.ok) { setFel(rBody.error || `HTTP ${rR.status}`); setResurs(null); }
      else setResurs(rBody.resurs);
      if (hR.ok && hBody.ok) { setForslag(hBody.forslag || []); setHistorik(hBody.handelser || []); }
    } catch (e: any) {
      setFel(e?.message || String(e));
    }
    setLaddar(false);
  }
  useEffect(() => { hamta(); }, [id]);

  const kommande = useMemo(() => {
    if (!resurs) return [];
    const rad: { k: any; b: Berakning }[] = [];
    for (const k of resurs.kontroll || []) {
      if (k.aktiv === false) continue;
      const b = berakna(k as Kontrollrad, resurs.typ, resurs.matarstallning);
      if (b.slag === 'ingen') continue;
      rad.push({ k, b });
    }
    const bradska = (x: { b: Berakning }) => x.b.slag === 'datum' ? x.b.dagar : (x.b.slag === 'matare' ? (x.b.kvar ?? 1e9) : 1e9);
    return rad.sort((a, b) => bradska(a) - bradska(b));
  }, [resurs]);

  const S = stilar;

  if (laddar) return <div style={S.sida}><div style={S.tomt}>Laddar…</div></div>;
  if (fel || !resurs) return <div style={S.sida}><div style={{ ...S.tomt, color: FARG.rod }}>{fel || 'Hittades inte'}</div></div>;

  const { titel, underrad } = resursRubrik(resurs);
  const visadeHandelser = visaAllt ? historik : forslag;
  const harEkonomi = kanRedigera && (resurs.inkopspris != null || resurs.inkopsdatum != null);

  return (
    <div style={S.sida}>
      {/* Header */}
      <div style={S.header}>
        <Link href="/kontroller" style={S.back}>‹  Alla</Link>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={S.rubrik}>{titel}</div>
          <div style={S.underrubrik}>{underrad}</div>
        </div>
        <button style={S.registrera} onClick={() => setVisarForm(true)}>Registrera åtgärd</button>
      </div>

      <div style={S.lista}>
        {/* KOMMANDE */}
        <div style={S.sektion}>
          <div style={S.sektionLabel}>KOMMANDE</div>
          <div style={S.kort}>
            {kommande.length === 0 ? (
              <div style={{ ...S.radEnkel(true), color: FARG.grer }}>Inga kommande — registrera en åtgärd</div>
            ) : (
              kommande.map(({ k, b }, i) => (
                <div key={k.id} style={S.radEnkel(i === 0)}>
                  <div style={{ flex: 1, fontSize: 16, color: FARG.text }}>{KONTROLLTYPER[k.typ as Kontrolltypnyckel]?.etikett || k.typ}</div>
                  <Nedrakning b={b} />
                </div>
              ))
            )}
          </div>
        </div>

        {/* SENAST GJORT */}
        {visadeHandelser.length > 0 && (
          <div style={S.sektion}>
            <div style={S.sektionLabel}>SENAST GJORT</div>
            <div style={S.kort}>
              {visadeHandelser.map((h, i) => (
                <div key={h.id || `${h.typ}-${h.benamning}-${i}`} style={S.radAlder(i === 0)}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 16, color: FARG.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.benamning || HANDELSE_LABEL[h.typ] || h.typ}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1, whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 15, fontWeight: 500, color: FARG.text }}>{alder(h.datum)}</div>
                    <div style={{ fontSize: 12, color: FARG.svagGrer }}>{fmtDatumLang(h.datum)}</div>
                  </div>
                </div>
              ))}
              {!visaAllt && historik.length > forslag.length && (
                <div style={S.radEnkel(false)}>
                  <button onClick={() => setVisaAllt(true)} style={S.lank}>Visa hela historiken</button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* EKONOMI */}
        {harEkonomi && (
          <div style={S.sektion}>
            <div style={S.sektionLabel}>EKONOMI</div>
            <div style={S.kort}>
              <div style={S.radEnkel(true)}>
                <div style={{ flex: 1, fontSize: 16, color: FARG.grer }}>Inköpspris</div>
                <div style={{ fontSize: 16, color: FARG.text }}>{resurs.inkopspris != null ? `${fmtHeltal(resurs.inkopspris)} kr` : '—'}</div>
              </div>
              <div style={S.radEnkel(false)}>
                <div style={{ flex: 1, fontSize: 16, color: FARG.grer }}>Inköpt</div>
                <div style={{ fontSize: 16, color: FARG.text }}>{resurs.inkopsdatum ? fmtDatumLang(resurs.inkopsdatum) : '—'}</div>
              </div>
            </div>
            <div style={{ fontSize: 12, color: FARG.svagGrer }}>Syns bara för admin och chef</div>
          </div>
        )}
      </div>

      {visarForm && (
        <RegistreraForm
          resurs={resurs}
          forslag={forslag}
          onStang={() => setVisarForm(false)}
          onSparad={() => { setVisarForm(false); hamta(); }}
        />
      )}
    </div>
  );
}

function Nedrakning({ b }: { b: Berakning }) {
  let text: string, farg: string, medium: boolean;
  if (b.slag === 'matare') {
    text = b.kvar != null ? `${fmtHeltal(b.kvar)} ${enhetKort(b.enhet)} kvar` : '—';
    farg = b.status === 'utgangen' ? FARG.rod : b.status === 'snart' ? FARG.orange : FARG.grer;
    medium = b.status !== 'ok';
  } else if (b.slag === 'datum') {
    text = fmtRelativDagar(b.dagar);
    farg = b.status === 'utgangen' ? FARG.rod : b.status === 'snart' ? FARG.orange : FARG.grer;
    medium = b.status !== 'ok';
  } else {
    text = '—'; farg = FARG.grer; medium = false;
  }
  return <div style={{ fontSize: 15, fontWeight: medium ? 500 : 400, color: farg, whiteSpace: 'nowrap' }}>{text}</div>;
}

// ── Registrera åtgärd (bottom-sheet) ───────────────────────────────────────
function RegistreraForm({ resurs, forslag, onStang, onSparad }: {
  resurs: Resurs; forslag: Handelse[]; onStang: () => void; onSparad: () => void;
}) {
  const idag = new Date().toISOString().slice(0, 10);
  const [typ, setTyp] = useState('service');
  const [benamning, setBenamning] = useState('');
  const [datum, setDatum] = useState(idag);
  const [matarstallning, setMatarstallning] = useState(resurs.matarstallning?.toString() || '');
  const [kostnad, setKostnad] = useState('');
  const [utfordAv, setUtfordAv] = useState('');
  const [anteckning, setAnteckning] = useState('');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const harMatare = resurs.typ === 'bil' || resurs.typ === 'lastbil' || resurs.typ === 'maskin';
  const benForslag = Array.from(new Set(forslag.filter(f => f.typ === typ && f.benamning).map(f => f.benamning as string)));

  // Koppla besiktning/service till motsvarande kontroll (uppdaterar nedräkningen).
  const kontrollId = useMemo(() => {
    if (typ !== 'besiktning' && typ !== 'service') return null;
    return (resurs.kontroll || []).find((k: any) => k.typ === typ && k.aktiv !== false)?.id || null;
  }, [typ, resurs]);

  async function spara() {
    setSparar(true); setFel(null);
    try {
      const payload: any = {
        resurs_id: resurs.id,
        typ,
        datum,
        benamning: benamning.trim() || null,
        matarstallning: harMatare && matarstallning ? parseInt(matarstallning) : null,
        kostnad: kostnad ? parseInt(kostnad) : null,
        utford_av: utfordAv.trim() || null,
        anteckning: anteckning.trim() || null,
        kontroll_id: kontrollId,
      };
      const r = await fetch('/api/handelse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await r.json();
      if (!r.ok || !body.ok) { setFel(body.error || `HTTP ${r.status}`); setSparar(false); return; }
      onSparad();
    } catch (e: any) {
      setFel(e?.message || String(e)); setSparar(false);
    }
  }

  return (
    <div onClick={onStang} style={sheetStil.overlay}>
      <div onClick={e => e.stopPropagation()} style={sheetStil.ark}>
        <div style={sheetStil.grepp} />
        <h2 style={sheetStil.rubrik}>Registrera åtgärd</h2>

        <FormFalt label="Typ *">
          <select style={sheetStil.inp as any} value={typ} onChange={e => setTyp(e.target.value)}>
            {HANDELSETYPER.map(h => <option key={h.v} value={h.v}>{h.label}</option>)}
          </select>
        </FormFalt>
        <FormFalt label="Benämning">
          <input style={sheetStil.inp} list="ben-forslag" value={benamning} onChange={e => setBenamning(e.target.value)} placeholder='t.ex. "Lager, höger boggi"' />
          <datalist id="ben-forslag">{benForslag.map(b => <option key={b} value={b} />)}</datalist>
        </FormFalt>
        <div style={{ display: 'flex', gap: 10 }}>
          <FormFalt label="Datum *" flex><input style={sheetStil.inp as any} type="date" value={datum} onChange={e => setDatum(e.target.value)} /></FormFalt>
          {harMatare && <FormFalt label={resurs.typ === 'maskin' ? 'Mätarställning (tim)' : 'Mätarställning (km)'} flex><input style={sheetStil.inp as any} type="number" value={matarstallning} onChange={e => setMatarstallning(e.target.value)} /></FormFalt>}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <FormFalt label="Kostnad (kr)" flex><input style={sheetStil.inp as any} type="number" value={kostnad} onChange={e => setKostnad(e.target.value)} /></FormFalt>
          <FormFalt label="Utfört av" flex><input style={sheetStil.inp} value={utfordAv} onChange={e => setUtfordAv(e.target.value)} /></FormFalt>
        </div>
        <FormFalt label="Anteckning"><textarea style={{ ...sheetStil.inp, minHeight: 60, resize: 'vertical' as const }} value={anteckning} onChange={e => setAnteckning(e.target.value)} /></FormFalt>

        {fel && <div style={sheetStil.fel}>{fel}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onStang} style={sheetStil.avbryt}>Avbryt</button>
          <button onClick={spara} disabled={sparar} style={{ ...sheetStil.spara, opacity: sparar ? 0.35 : 1 }}>{sparar ? 'Sparar…' : 'Spara'}</button>
        </div>
      </div>
    </div>
  );
}

function FormFalt({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <div style={{ marginBottom: 12, ...(flex ? { flex: 1 } : {}) }}>
      <div style={{ fontSize: 12, color: FARG.grer, marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

const stilar = {
  sida: { background: FARG.bg, minHeight: '100vh', color: FARG.text, fontFamily: FF, WebkitFontSmoothing: 'antialiased' as const, paddingBottom: 96 },
  header: { display: 'flex', flexDirection: 'column' as const, gap: 14, padding: '20px 16px 18px' },
  back: { fontSize: 16, color: FARG.bla, textDecoration: 'none' },
  rubrik: { fontSize: 30, fontWeight: 700, letterSpacing: '-0.5px' },
  underrubrik: { fontSize: 14, color: FARG.grer },
  registrera: { width: '100%', padding: '13px 0', background: FARG.bla, border: 'none', borderRadius: 10, color: '#fff', fontSize: 16, fontWeight: 600, cursor: 'pointer', fontFamily: FF },
  lista: { display: 'flex', flexDirection: 'column' as const, gap: 22, padding: '2px 16px 0' },
  sektion: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  sektionLabel: { fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', color: FARG.grer },
  kort: { background: FARG.kort, borderRadius: 10, overflow: 'hidden' as const },
  radEnkel: (forst: boolean) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderTop: forst ? 'none' : `0.5px solid ${FARG.avdelare}` }),
  radAlder: (forst: boolean) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: forst ? 'none' : `0.5px solid ${FARG.avdelare}` }),
  lank: { background: 'none', border: 'none', padding: 0, color: FARG.bla, fontSize: 15, cursor: 'pointer', fontFamily: FF },
  tomt: { textAlign: 'center' as const, padding: 40, color: FARG.grer, fontSize: 14 },
};

const sheetStil = {
  overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' },
  ark: { width: '100%', maxWidth: 560, background: FARG.kort, borderRadius: '16px 16px 0 0', padding: '12px 20px 28px', maxHeight: '92vh', overflowY: 'auto' as const, color: FARG.text, fontFamily: FF },
  grepp: { width: 40, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.2)', margin: '0 auto 16px' },
  rubrik: { margin: '0 0 16px', fontSize: 20, fontWeight: 700 },
  inp: { width: '100%', boxSizing: 'border-box' as const, minHeight: 44, padding: '10px 12px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: FARG.text, fontSize: 16, fontFamily: FF, outline: 'none' },
  fel: { padding: 10, background: 'rgba(255,69,58,0.12)', border: '1px solid rgba(255,69,58,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13, marginTop: 4 },
  avbryt: { flex: 1, minHeight: 48, background: 'rgba(255,255,255,0.08)', color: FARG.text, border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: FF },
  spara: { flex: 2, minHeight: 48, background: FARG.bla, color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: FF },
};
