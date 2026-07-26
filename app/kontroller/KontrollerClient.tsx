'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { berakna, type Berakning, type Kontrollrad } from '@/lib/status';
import { KONTROLLTYPER, type Kontrolltypnyckel, type Resurstyp } from '@/lib/kontrolltyper';
import {
  FF, FARG, TYP_LABEL, GRUPPER, CHIPS,
  fmtHeltal, fmtDatumKort, fmtRelativDagar, enhetKort,
  resursIdentitet, type Resurs,
} from '@/lib/kontroller-format';

type Flik = 'attgora' | 'alla';

function statusAv(k: any, r: Resurs): Berakning {
  return berakna(k as Kontrollrad, r.typ, r.matarstallning);
}

// Ett åtgärdsobjekt = en kontroll med nedräkning, kopplad till sin resurs.
type Punkt = { r: Resurs; k: any; b: Berakning };

const BUCKETS: { key: 'utgangen' | 'snart' | 'ok'; label: string }[] = [
  { key: 'utgangen', label: 'UTGÅNGET' },
  { key: 'snart', label: 'DENNA MÅNAD' },
  { key: 'ok', label: 'SENARE' },
];

export default function KontrollerClient({ kanRedigera }: { kanRedigera: boolean }) {
  const router = useRouter();
  const [resurser, setResurser] = useState<Resurs[]>([]);
  const [laddar, setLaddar] = useState(true);
  const [fel, setFel] = useState<string | null>(null);
  const [flik, setFlik] = useState<Flik>('attgora');
  const [sok, setSok] = useState('');
  const [chip, setChip] = useState('alla');
  const [visarForm, setVisarForm] = useState(false);
  const [redigerar, setRedigerar] = useState<Resurs | null>(null);

  async function hamta() {
    setLaddar(true); setFel(null);
    try {
      const r = await fetch('/api/resurs', { cache: 'no-store' });
      const body = await r.json();
      if (!r.ok || !body.ok) { setFel(body.error || `HTTP ${r.status}`); setResurser([]); }
      else setResurser(body.resurs || []);
    } catch (e: any) {
      setFel(e?.message || String(e));
    }
    setLaddar(false);
  }
  useEffect(() => { hamta(); }, []);

  const aktivaChip = CHIPS.find(c => c.key === chip) || CHIPS[0];

  const filtrerade = useMemo(() => {
    const q = sok.trim().toLowerCase();
    return resurser.filter(r => {
      if (aktivaChip.typer && !aktivaChip.typer.includes(r.typ)) return false;
      if (!q) return true;
      return [r.regnr, r.namn, r.marke, r.modell].some(v => v?.toLowerCase().includes(q));
    });
  }, [resurser, sok, aktivaChip]);

  // ── Att göra: alla kontroller med nedräkning, bucketade på brådska ──────
  const buckets = useMemo(() => {
    const ut: Punkt[] = [], sn: Punkt[] = [], ok: Punkt[] = [];
    for (const r of filtrerade) {
      for (const k of r.kontroll || []) {
        if (k.aktiv === false) continue;
        const b = statusAv(k, r);
        if (b.slag === 'ingen') continue;            // ingen deadline → inte "att göra"
        const p: Punkt = { r, k, b };
        (b.status === 'utgangen' ? ut : b.status === 'snart' ? sn : ok).push(p);
      }
    }
    const bradska = (p: Punkt) => p.b.slag === 'datum' ? p.b.dagar : p.b.slag === 'matare' ? (p.b.kvar ?? 1e9) : 1e9;
    for (const arr of [ut, sn, ok]) arr.sort((a, b) => bradska(a) - bradska(b));
    return { utgangen: ut, snart: sn, ok };
  }, [filtrerade]);

  const gruppLista = useMemo(() => {
    return GRUPPER.map(g => ({
      ...g,
      resurser: filtrerade.filter(r => g.typer.includes(r.typ)),
    })).filter(g => g.resurser.length > 0);
  }, [filtrerade]);

  const S = stilar;

  return (
    <div style={S.sida}>
      {/* Header */}
      <div style={S.header}>
        <h1 style={S.titel}>Kontroller</h1>
        <input
          style={S.sokfalt}
          placeholder="Sök regnr eller namn"
          value={sok}
          onChange={e => setSok(e.target.value)}
        />
        <div style={S.segmented}>
          {(['attgora', 'alla'] as Flik[]).map(f => (
            <button key={f} onClick={() => setFlik(f)} style={S.seg(flik === f)}>
              {f === 'attgora' ? 'Att göra' : 'Alla'}
            </button>
          ))}
        </div>
        <div style={S.chipRad}>
          {CHIPS.map(c => (
            <button key={c.key} onClick={() => setChip(c.key)} style={S.chip(chip === c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Innehåll */}
      {laddar && <div style={S.tomt}>Laddar…</div>}
      {!laddar && fel && <div style={{ ...S.tomt, color: FARG.rod }}>Fel: {fel}</div>}

      {!laddar && !fel && flik === 'attgora' && (
        <div style={S.lista}>
          {BUCKETS.every(b => buckets[b.key].length === 0) ? (
            <div style={S.tomt}>Inga kontroller att göra.</div>
          ) : (
            BUCKETS.map(bucket => {
              const punkter = buckets[bucket.key];
              if (punkter.length === 0) return null;
              return (
                <div key={bucket.key} style={S.sektion}>
                  <div style={S.sektionLabel}>{bucket.label}</div>
                  <div style={S.kort}>
                    {punkter.map((p, i) => (
                      <AttGoraRad key={p.k.id} p={p} forst={i === 0} onClick={() => router.push(`/kontroller/${p.r.id}`)} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {!laddar && !fel && flik === 'alla' && (
        <div style={S.lista}>
          {gruppLista.length === 0 ? (
            <div style={S.tomt}>Inga resurser{kanRedigera ? ' — tryck + för att lägga till' : ''}.</div>
          ) : (
            gruppLista.map(g => (
              <div key={g.key} style={S.sektion}>
                <div style={S.sektionLabel}>{g.label}</div>
                <div style={S.kort}>
                  {g.resurser.map((r, i) => (
                    <AllaRad key={r.id} r={r} forst={i === 0} onClick={() => router.push(`/kontroller/${r.id}`)} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {kanRedigera && (
        <button style={S.fab} aria-label="Lägg till resurs" onClick={() => { setRedigerar(null); setVisarForm(true); }}>+</button>
      )}

      {visarForm && (
        <ResursForm
          befintlig={redigerar}
          kanRedigera={kanRedigera}
          onStang={() => { setVisarForm(false); setRedigerar(null); }}
          onSparad={() => { setVisarForm(false); setRedigerar(null); hamta(); }}
        />
      )}
    </div>
  );
}

// ── Rad i Att göra ─────────────────────────────────────────────────────────
function AttGoraRad({ p, forst, onClick }: { p: Punkt; forst: boolean; onClick: () => void }) {
  const { r, k, b } = p;
  const titel = KONTROLLTYPER[k.typ as Kontrolltypnyckel]?.etikett || k.typ;
  const ident = r.regnr || r.namn;

  let underrad = '';
  let hoger: { text: string; farg: string; medium: boolean } = { text: '', farg: FARG.grer, medium: false };

  if (b.slag === 'matare') {
    const kvarTxt = b.kvar != null ? `${fmtHeltal(b.kvar)} ${enhetKort(b.enhet)} kvar` : TYP_LABEL[r.typ];
    underrad = `${ident} · ${kvarTxt}`;
    hoger = b.status === 'utgangen'
      ? { text: 'utgånget', farg: FARG.rod, medium: true }
      : b.status === 'snart'
        ? { text: 'snart', farg: FARG.orange, medium: true }
        : { text: 'ok', farg: FARG.grer, medium: false };
  } else if (b.slag === 'datum') {
    const andra = r.regnr ? (r.namn || TYP_LABEL[r.typ]) : TYP_LABEL[r.typ];
    underrad = `${ident} · ${andra}`;
    hoger = b.status === 'utgangen'
      ? { text: fmtRelativDagar(b.dagar), farg: FARG.rod, medium: true }
      : b.status === 'snart'
        ? { text: fmtRelativDagar(b.dagar), farg: FARG.orange, medium: true }
        : { text: fmtDatumKort(b.forfall), farg: FARG.grer, medium: false };
  }

  return (
    <div style={stilar.rad(forst)} onClick={onClick}>
      <div style={stilar.radText}>
        <div style={stilar.radTitel}>{titel}</div>
        <div style={stilar.radUnder}>{underrad}</div>
      </div>
      <div style={{ fontSize: 15, fontWeight: hoger.medium ? 500 : 400, color: hoger.farg, whiteSpace: 'nowrap' }}>{hoger.text}</div>
      <div style={stilar.chevron}>›</div>
    </div>
  );
}

// ── Rad i Alla ─────────────────────────────────────────────────────────────
function AllaRad({ r, forst, onClick }: { r: Resurs; forst: boolean; onClick: () => void }) {
  const { titel, underrad } = resursIdentitet(r);
  let utgangna = 0, snarta = 0;
  for (const k of r.kontroll || []) {
    if (k.aktiv === false) continue;
    const b = berakna(k as Kontrollrad, r.typ, r.matarstallning);
    if (b.slag === 'ingen') continue;
    if (b.status === 'utgangen') utgangna++;
    else if (b.status === 'snart') snarta++;
  }
  const hoger = utgangna > 0
    ? { text: `${utgangna} att göra`, farg: FARG.rod }
    : snarta > 0
      ? { text: `${snarta} snart`, farg: FARG.orange }
      : { text: 'OK', farg: FARG.grer };

  return (
    <div style={stilar.rad(forst)} onClick={onClick}>
      <div style={stilar.radText}>
        <div style={stilar.radTitel}>{titel}</div>
        <div style={stilar.radUnder}>{underrad}</div>
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, color: hoger.farg, whiteSpace: 'nowrap' }}>{hoger.text}</div>
      <div style={stilar.chevron}>›</div>
    </div>
  );
}

// ── Formulär: skapa/redigera resurs (bottom-sheet, appstil) ────────────────
function ResursForm({ befintlig, kanRedigera, onStang, onSparad }: {
  befintlig: Resurs | null;
  kanRedigera: boolean;
  onStang: () => void;
  onSparad: () => void;
}) {
  const [namn, setNamn] = useState(befintlig?.namn || '');
  const [typ, setTyp] = useState<Resurstyp>(befintlig?.typ || 'bil');
  const [regnr, setRegnr] = useState(befintlig?.regnr || '');
  const [marke, setMarke] = useState(befintlig?.marke || '');
  const [modell, setModell] = useState(befintlig?.modell || '');
  const [arsmodell, setArsmodell] = useState(befintlig?.arsmodell?.toString() || '');
  const [matarstallning, setMatarstallning] = useState(befintlig?.matarstallning?.toString() || '');
  const [inkopspris, setInkopspris] = useState(befintlig?.inkopspris?.toString() || '');
  const [inkopsdatum, setInkopsdatum] = useState(befintlig?.inkopsdatum || '');
  const [anteckning, setAnteckning] = useState(befintlig?.anteckning || '');
  const [sparar, setSparar] = useState(false);
  const [fel, setFel] = useState<string | null>(null);

  const harMatare = typ === 'bil' || typ === 'lastbil' || typ === 'maskin';
  const matarLabel = typ === 'maskin' ? 'Mätarställning (timmar)' : 'Mätarställning (km)';

  async function spara() {
    setSparar(true); setFel(null);
    try {
      const payload: any = {
        namn: namn.trim(),
        typ,
        regnr: regnr.trim() || null,
        marke: marke.trim() || null,
        modell: modell.trim() || null,
        arsmodell: arsmodell ? parseInt(arsmodell) : null,
        matarstallning: harMatare && matarstallning ? parseInt(matarstallning) : null,
        anteckning: anteckning.trim() || null,
      };
      if (kanRedigera) {
        payload.inkopspris = inkopspris ? parseInt(inkopspris) : null;
        payload.inkopsdatum = inkopsdatum || null;
      }
      const url = befintlig ? `/api/resurs/${befintlig.id}` : '/api/resurs';
      const metod = befintlig ? 'PATCH' : 'POST';
      const r = await fetch(url, { method: metod, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await r.json();
      if (!r.ok || !body.ok) { setFel(body.error || body.meddelande || `HTTP ${r.status}`); setSparar(false); return; }
      onSparad();
    } catch (e: any) {
      setFel(e?.message || String(e)); setSparar(false);
    }
  }

  async function taBort() {
    if (!befintlig) return;
    if (!confirm(`Ta bort ${befintlig.regnr || befintlig.namn}?`)) return;
    setSparar(true);
    const r = await fetch(`/api/resurs/${befintlig.id}`, { method: 'DELETE' });
    if (r.ok) onSparad(); else setSparar(false);
  }

  return (
    <div onClick={onStang} style={sheetStil.overlay}>
      <div onClick={e => e.stopPropagation()} style={sheetStil.ark}>
        <div style={sheetStil.grepp} />
        <h2 style={sheetStil.rubrik}>{befintlig ? 'Redigera' : 'Ny resurs'}</h2>

        <Falt label="Namn *"><input style={sheetStil.inp} value={namn} onChange={e => setNamn(e.target.value)} placeholder="t.ex. Volvo FH eller Skördare 1" /></Falt>
        <Falt label="Typ *">
          <select style={sheetStil.inp as any} value={typ} onChange={e => setTyp(e.target.value as Resurstyp)}>
            {(Object.keys(TYP_LABEL) as Resurstyp[]).map(t => <option key={t} value={t}>{TYP_LABEL[t]}</option>)}
          </select>
        </Falt>
        <Falt label="Regnummer"><input style={sheetStil.inp} value={regnr} onChange={e => setRegnr(e.target.value.toUpperCase())} placeholder="ABC123" /></Falt>
        <div style={{ display: 'flex', gap: 10 }}>
          <Falt label="Märke" flex><input style={sheetStil.inp} value={marke} onChange={e => setMarke(e.target.value)} /></Falt>
          <Falt label="Modell" flex><input style={sheetStil.inp} value={modell} onChange={e => setModell(e.target.value)} /></Falt>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Falt label="Årsmodell" flex><input style={sheetStil.inp as any} type="number" value={arsmodell} onChange={e => setArsmodell(e.target.value)} /></Falt>
          {harMatare && <Falt label={matarLabel} flex><input style={sheetStil.inp as any} type="number" value={matarstallning} onChange={e => setMatarstallning(e.target.value)} /></Falt>}
        </div>
        {kanRedigera && (
          <div style={{ display: 'flex', gap: 10 }}>
            <Falt label="Inköpspris (kr)" flex><input style={sheetStil.inp as any} type="number" value={inkopspris} onChange={e => setInkopspris(e.target.value)} /></Falt>
            <Falt label="Inköpt" flex><input style={sheetStil.inp as any} type="date" value={inkopsdatum} onChange={e => setInkopsdatum(e.target.value)} /></Falt>
          </div>
        )}
        <Falt label="Anteckning"><textarea style={{ ...sheetStil.inp, minHeight: 70, resize: 'vertical' as const }} value={anteckning} onChange={e => setAnteckning(e.target.value)} /></Falt>

        {fel && <div style={sheetStil.fel}>{fel}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          <button onClick={onStang} style={sheetStil.avbryt}>Avbryt</button>
          <button onClick={spara} disabled={!namn.trim() || sparar} style={{ ...sheetStil.spara, opacity: !namn.trim() || sparar ? 0.35 : 1 }}>
            {sparar ? 'Sparar…' : 'Spara'}
          </button>
        </div>
        {befintlig && <button onClick={taBort} disabled={sparar} style={sheetStil.taBort}>Ta bort</button>}
      </div>
    </div>
  );
}

function Falt({ label, children, flex }: { label: string; children: React.ReactNode; flex?: boolean }) {
  return (
    <div style={{ marginBottom: 12, ...(flex ? { flex: 1 } : {}) }}>
      <div style={{ fontSize: 12, color: FARG.grer, marginBottom: 4, fontWeight: 500 }}>{label}</div>
      {children}
    </div>
  );
}

// ── Stilar ─────────────────────────────────────────────────────────────────
const stilar = {
  sida: { background: FARG.bg, minHeight: '100vh', color: FARG.text, fontFamily: FF, WebkitFontSmoothing: 'antialiased' as const, paddingBottom: 96 },
  header: { display: 'flex', flexDirection: 'column' as const, gap: 12, padding: '24px 16px 18px' },
  titel: { fontSize: 32, fontWeight: 700, letterSpacing: '-0.6px', margin: 0 },
  sokfalt: { width: '100%', boxSizing: 'border-box' as const, background: FARG.falt, border: 'none', borderRadius: 10, padding: '9px 12px', color: FARG.text, fontSize: 15, fontFamily: FF, outline: 'none' },
  segmented: { display: 'flex', gap: 2, background: FARG.kort, borderRadius: 9, padding: 2 },
  seg: (aktiv: boolean) => ({ flex: 1, padding: '7px 0', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: FF, fontSize: 13, fontWeight: aktiv ? 600 : 400, background: aktiv ? FARG.seg : 'transparent', color: aktiv ? FARG.text : FARG.grer }),
  chipRad: { display: 'flex', gap: 7, overflowX: 'auto' as const },
  chip: (aktiv: boolean) => ({ flexShrink: 0, padding: '6px 11px', borderRadius: 15, border: 'none', cursor: 'pointer', fontFamily: FF, fontSize: 13, fontWeight: aktiv ? 600 : 400, background: aktiv ? FARG.bla : FARG.kort, color: aktiv ? FARG.text : FARG.grer }),
  lista: { display: 'flex', flexDirection: 'column' as const, gap: 22, padding: '2px 16px 0' },
  sektion: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  sektionLabel: { fontSize: 12, fontWeight: 600, letterSpacing: '0.5px', color: FARG.grer },
  kort: { background: FARG.kort, borderRadius: 10, overflow: 'hidden' as const },
  rad: (forst: boolean) => ({ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', cursor: 'pointer', userSelect: 'none' as const, WebkitTapHighlightColor: 'transparent' as any, borderTop: forst ? 'none' : `0.5px solid ${FARG.avdelare}` }),
  radText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' as const, gap: 2 },
  radTitel: { fontSize: 16, color: FARG.text, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const },
  radUnder: { fontSize: 13, color: FARG.grer, overflow: 'hidden' as const, textOverflow: 'ellipsis' as const, whiteSpace: 'nowrap' as const },
  chevron: { fontSize: 17, color: FARG.chevron, lineHeight: 1 },
  tomt: { textAlign: 'center' as const, padding: 40, color: FARG.grer, fontSize: 14 },
  fab: { position: 'fixed' as const, right: 20, bottom: 96, width: 56, height: 56, borderRadius: 28, background: FARG.bla, border: 'none', color: '#fff', fontSize: 28, cursor: 'pointer', boxShadow: '0 4px 16px rgba(10,132,255,0.4)', lineHeight: 1, fontFamily: FF, display: 'flex', alignItems: 'center', justifyContent: 'center' },
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
  taBort: { width: '100%', marginTop: 10, minHeight: 44, background: 'none', border: 'none', color: FARG.rod, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: FF },
};
