'use client';

import { useEffect, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────
export interface Forare {
  namn: string;
  fran: string;
  till: string;
}

export interface Maskin {
  typ: 'Skördare' | 'Skotare';
  modell: string;
  start: string;
  slut: string;
  aktivForare: string;
  tidigareForare?: Forare[];
}

export interface AvbrottRad {
  orsak: string;
  typ: string;
  tid: string;
  antal: number;
}

export interface DieselDag {
  datum: string;
  liter: number;
}

export interface UppfoljningData {
  objektNamn: string;
  senastUppdaterad?: string;
  skordat: number;
  skotat: number;
  kvarPct: number;
  egenSkotning?: boolean;
  grotSkotning?: boolean;
  externSkotning?: boolean;
  externForetag?: string;
  externPrisTyp?: 'm3' | 'timme';
  externPris?: number;
  externAntal?: number;
  maskiner: Maskin[];
  // Tidredovisning
  skordareG15h: number;
  skordareG0: number;
  skordareTomgang: number;
  skordareKortaStopp: number;
  skordareRast: number;
  skordareAvbrott: number;
  skotareG15h: number;
  skotareG0: number;
  skotareTomgang: number;
  skotareKortaStopp: number;
  skotareRast: number;
  skotareAvbrott: number;
  // Produktion
  skordareM3G15h: number;
  skordareStammarG15h: number;
  skordareMedelstam: number;
  skotareM3G15h: number;
  skotareLassG15h: number;
  skotareSnittlass: number;
  tradslag: { namn: string; pct: number }[];
  sortiment: { namn: string; m3: number }[];
  // Diesel
  dieselTotalt: number;
  dieselPerM3: number;
  skordareL: number;
  skordareL_M3: number;
  skordareL_G15h: number;
  skotareL: number;
  skotareL_M3: number;
  skotareL_G15h: number;
  dieselSkordare: DieselDag[];
  dieselSkotare: DieselDag[];
  // Avbrott
  avbrottSkordare: AvbrottRad[];
  avbrottSkotareTotalt: string;
  avbrottSkordare_totalt: string;
  avbrottSkotare: AvbrottRad[];
  // Skotarproduktion
  antalLass: number;
  snittlassM3: number;
  lassG15h: number;
  skotningsavstand: number;
  lassPerDag: { datum: string; lass: number }[];
  // Balans
  skordareBalG15h: number;
  skotareBalG15h: number;
}

// ── Demo data (ersätt med riktig API-fetch) ────────────────────────────────
const demoData: UppfoljningData = {
  objektNamn: 'Krampamåla',
  skordat: 2169,
  skotat: 1842,
  kvarPct: 15,
  maskiner: [
    { typ: 'Skördare', modell: 'John Deere 1270G', start: '12 feb', slut: '18 mar', aktivForare: 'Erik S.', tidigareForare: [{ namn: 'Jonas K.', fran: '12 feb', till: '18 feb' }] },
    { typ: 'Skotare', modell: 'John Deere 1110G', start: '14 feb', slut: '20 mar', aktivForare: 'Lars M.' },
  ],
  skordareG15h: 142.5, skordareG0: 4.1, skordareTomgang: 3.8, skordareKortaStopp: 2.2, skordareRast: 8.2, skordareAvbrott: 6.3,
  skotareG15h: 138.2, skotareG0: 5.3, skotareTomgang: 4.6, skotareKortaStopp: 1.9, skotareRast: 7.9, skotareAvbrott: 5.6,
  skordareM3G15h: 15.2, skordareStammarG15h: 82, skordareMedelstam: 0.185,
  skotareM3G15h: 13.3, skotareLassG15h: 1.13, skotareSnittlass: 13.8,
  tradslag: [{ namn: 'Gran', pct: 58 }, { namn: 'Tall', pct: 32 }, { namn: 'Björk', pct: 7 }, { namn: 'Övrigt', pct: 3 }],
  sortiment: [{ namn: 'Grantimmer', m3: 845 }, { namn: 'Talltimmer', m3: 523 }, { namn: 'Granmassa', m3: 412 }, { namn: 'Tallmassa', m3: 198 }, { namn: 'Björkmassa', m3: 124 }, { namn: 'Brännved', m3: 67 }],
  dieselTotalt: 4768, dieselPerM3: 2.20,
  skordareL: 2845, skordareL_M3: 1.31, skordareL_G15h: 16.8,
  skotareL: 1923, skotareL_M3: 0.89, skotareL_G15h: 12.4,
  dieselSkordare: [{ datum: '11/3', liter: 185 }, { datum: '12/3', liter: 198 }, { datum: '13/3', liter: 172 }, { datum: '14/3', liter: 191 }, { datum: '15/3', liter: 205 }, { datum: '16/3', liter: 188 }, { datum: '17/3', liter: 212 }],
  dieselSkotare: [{ datum: '14/3', liter: 142 }, { datum: '15/3', liter: 149 }, { datum: '16/3', liter: 136 }, { datum: '17/3', liter: 145 }, { datum: '18/3', liter: 133 }, { datum: '19/3', liter: 143 }, { datum: '20/3', liter: 139 }],
  avbrottSkordare: [{ orsak: 'Kedjebrott', typ: 'Mekaniskt', tid: '2.5h', antal: 3 }, { orsak: 'Tankning', typ: 'Planerat', tid: '1.8h', antal: 8 }, { orsak: 'Hydraulikfel', typ: 'Mekaniskt', tid: '1.2h', antal: 1 }, { orsak: 'Väntan', typ: 'Logistik', tid: '0.8h', antal: 2 }],
  avbrottSkordare_totalt: '6.3h',
  avbrottSkotare: [{ orsak: 'Väntan', typ: 'Logistik', tid: '2.1h', antal: 4 }, { orsak: 'Tankning', typ: 'Planerat', tid: '1.5h', antal: 7 }, { orsak: 'Punktering', typ: 'Mekaniskt', tid: '1.2h', antal: 1 }, { orsak: 'Kranfel', typ: 'Mekaniskt', tid: '0.8h', antal: 1 }],
  avbrottSkotareTotalt: '5.6h',
  antalLass: 156, snittlassM3: 13.8, lassG15h: 1.13, skotningsavstand: 285,
  lassPerDag: [{ datum: '11/3', lass: 18 }, { datum: '12/3', lass: 22 }, { datum: '13/3', lass: 20 }, { datum: '14/3', lass: 24 }, { datum: '15/3', lass: 21 }, { datum: '16/3', lass: 25 }, { datum: '17/3', lass: 26 }],
  skordareBalG15h: 142.5,
  skotareBalG15h: 162.8,
};

// ── Helpers ────────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1800, isDecimal = false, decimals = 2) {
  const [value, setValue] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const startTime = performance.now();
    const step = (now: number) => {
      const p = Math.min((now - startTime) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 4);
      const v = ease * target;
      setValue(v);
      if (p < 1) requestAnimationFrame(step);
      else setValue(target);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  if (isDecimal) return value.toFixed(decimals);
  return Math.floor(value).toLocaleString('sv-SE');
}

function HBar({ label, pct, val, delay = 0 }: { label: string; pct: number; val: string; delay?: number }) {
  const fillRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (fillRef.current) {
        fillRef.current.style.width = pct + '%';
        setTimeout(() => fillRef.current?.classList.add('shimmer-go'), 1300);
      }
    }, delay);
    return () => clearTimeout(t);
  }, [pct, delay]);
  return (
    <div className="hbar-row">
      <span className="hbar-label">{label}</span>
      <div className="hbar-track"><div ref={fillRef} className="hbar-fill" /></div>
      <span className="hbar-val">{val}</span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function UppfoljningVy({ data = demoData }: { data?: UppfoljningData }) {
  const egen = data.egenSkotning === true;
  const grot = data.grotSkotning === true;
  const extern = data.externSkotning === true;
  const externKostnad = (data.externPris || 0) * (data.externAntal || 0);
  const tabChoices = (egen || extern)
    ? (['oversikt', 'tid', 'produktion', 'diesel', 'avbrott'] as const)
    : grot
      ? (['oversikt', 'tid', 'diesel', 'avbrott', 'skotare'] as const)
      : (['oversikt', 'tid', 'produktion', 'diesel', 'avbrott', 'skotare'] as const);
  const [aktifTab, setAktifTab] = useState<'oversikt' | 'tid' | 'produktion' | 'diesel' | 'avbrott' | 'skotare'>('oversikt');
  const [visaForare, setVisaForare] = useState<Record<number, boolean>>({});
  const [timestamp, setTimestamp] = useState('');
  const tabsRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);

  const skordat = useCountUp(data.skordat);
  const skotat = useCountUp(data.skotat);
  const kvar = useCountUp(data.kvarPct, 1200);
  const dieselTot = useCountUp(data.dieselTotalt);
  const dieselM3 = useCountUp(data.dieselPerM3, 1600, true, 2);
  const skordareBalStr = useCountUp(data.skordareBalG15h, 1400, true, 1);
  const skotareBalStr = useCountUp(data.skotareBalG15h, 1400, true, 1);

  // Timestamp
  useEffect(() => {
    const now = new Date();
    setTimestamp(
      now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + ' ' +
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0')
    );
  }, []);

  // Progress bars on mount
  const progressRef = useRef<HTMLDivElement>(null);
  const balSkordRef = useRef<HTMLDivElement>(null);
  const balSkotRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t1 = setTimeout(() => { if (progressRef.current) progressRef.current.style.width = (100 - data.kvarPct) + '%'; }, 400);
    const t2 = setTimeout(() => { if (balSkordRef.current) balSkordRef.current.style.width = '88%'; }, 300);
    const t3 = setTimeout(() => { if (balSkotRef.current) balSkotRef.current.style.width = '100%'; }, 500);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [data.kvarPct, aktifTab]);

  // Tab slider
  useEffect(() => {
    const tabs = tabsRef.current;
    const slider = sliderRef.current;
    if (!tabs || !slider) return;
    const active = tabs.querySelector<HTMLButtonElement>('.tab-active');
    if (active) {
      slider.style.transition = 'none';
      slider.style.left = active.offsetLeft + 'px';
      slider.style.width = active.offsetWidth + 'px';
      setTimeout(() => { slider.style.transition = ''; }, 50);
    }
  }, [aktifTab]);

  // Mouse tilt
  useEffect(() => {
    const cards = document.querySelectorAll<HTMLElement>('.card3d');
    const handlers: Array<[HTMLElement, (e: MouseEvent) => void, () => void]> = [];
    cards.forEach(card => {
      const onMove = (e: MouseEvent) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(600px) rotateY(${x * 6}deg) rotateX(${-y * 6}deg) translateY(-4px)`;
      };
      const onLeave = () => { card.style.transform = ''; };
      card.addEventListener('mousemove', onMove);
      card.addEventListener('mouseleave', onLeave);
      handlers.push([card, onMove, onLeave]);
    });
    return () => handlers.forEach(([card, onMove, onLeave]) => {
      card.removeEventListener('mousemove', onMove);
      card.removeEventListener('mouseleave', onLeave);
    });
  }, [aktifTab]);

  // Scroll reveal — re-run when tab changes so conditionally rendered sections get observed
  useEffect(() => {
    const sections = document.querySelectorAll<HTMLElement>('.section-reveal');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    sections.forEach(s => observer.observe(s));
    return () => observer.disconnect();
  }, [aktifTab]);

  const moveSlider = (btn: HTMLButtonElement) => {
    if (sliderRef.current) {
      sliderRef.current.style.left = btn.offsetLeft + 'px';
      sliderRef.current.style.width = btn.offsetWidth + 'px';
    }
  };

  const sortimentNamnMap: Record<string, string> = {
    'BmavFall': 'Barrmassaved', 'BmavFall_V3': 'Barrmassaved', 'BmavFall_V4': 'Barrmassaved',
    'BjörkmavFall': 'Björkmassaved', 'BjörkmavFall_V3': 'Björkmassaved',
    'EngvedFall': 'Energived', 'EngvedFall_V3': 'Energived',
    'Timmer': 'Sågtimmer', 'TimmerFall': 'Sågtimmer',
    'Kubb': 'Kubb', 'KubbFall': 'Kubb',
    'GranTimmer': 'Grantimmer', 'TallTimmer': 'Talltimmer',
    'GranMassa': 'Granmassaved', 'TallMassa': 'Tallmassaved',
  };
  function sortimentSvenska(raw: string): { namn: string; kod: string | null } {
    // Check exact match
    if (sortimentNamnMap[raw]) return { namn: sortimentNamnMap[raw], kod: raw };
    // Check prefix match (strip _V3 etc)
    const base = raw.replace(/_V\d+$/, '');
    if (sortimentNamnMap[base]) return { namn: sortimentNamnMap[base], kod: raw };
    // Check case-insensitive
    const lower = raw.toLowerCase();
    for (const [k, v] of Object.entries(sortimentNamnMap)) {
      if (k.toLowerCase() === lower) return { namn: v, kod: raw };
    }
    return { namn: raw, kod: null };
  }

  const maxSortiment = Math.max(...data.sortiment.map(s => s.m3));
  const maxDieselSkord = Math.max(...data.dieselSkordare.map(d => d.liter));
  const maxDieselSkot = Math.max(...data.dieselSkotare.map(d => d.liter));
  const maxLass = Math.max(...data.lassPerDag.map(d => d.lass));

  function getTradslagColor(namn: string): string {
    const n = namn.toLowerCase();
    if (n === 'gran') return '#2d6a4f';
    if (n === 'tall') return '#a0522d';
    if (n === 'björk') return '#c8c8c8';
    if (n === 'övrigt' || n === 'övr_löv' || n === 'övrigt löv') return '#6b7c3a';
    return '#6b7c3a';
  }
  const tradslagColors = data.tradslag.map(t => getTradslagColor(t.namn));

  return (
    <>
      <style>{`
        :root {
          --bg: #070708;
          --surface: #0f0f10;
          --surface2: #141415;
          --surface3: #1a1a1c;
          --border: rgba(255,255,255,0.07);
          --border-strong: rgba(255,255,255,0.13);
          --border-top: rgba(255,255,255,0.18);
          --text: #f5f5f7;
          --text-sec: #a1a1a6;
          --text-ter: #6e6e73;
          --shadow-sm: 0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.6);
          --shadow-md: 0 8px 24px rgba(0,0,0,0.5), 0 2px 6px rgba(0,0,0,0.7);
          --shadow-lg: 0 20px 60px rgba(0,0,0,0.6), 0 4px 12px rgba(0,0,0,0.8);
        }
        .uppf-wrap { background: var(--bg); background-image: radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.03) 0%, transparent 70%); color: var(--text); font-family: 'Inter', -apple-system, sans-serif; min-height: 100vh; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
        .uppf-wrap::after { content:''; position:fixed; inset:0; pointer-events:none; z-index:999; opacity:0.035; background-image:url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E"); background-size:180px 180px; }
        .uppf-header { padding:1.25rem 1.75rem; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border); background:linear-gradient(180deg,rgba(255,255,255,0.025) 0%,transparent 100%); position:sticky; top:0; z-index:10; backdrop-filter:blur(20px); }
        .uppf-header-label { font-size:11px; color:var(--text-sec); letter-spacing:0.02em; margin-bottom:3px; }
        .uppf-header-title { font-size:22px; font-weight:600; letter-spacing:-0.03em; }
        .uppf-live { display:inline-flex; align-items:center; gap:5px; margin-top:4px; }
        .uppf-live-dot { width:5px; height:5px; border-radius:50%; background:#f5f5f7; opacity:0.5; animation:lp 2.4s ease-in-out infinite; }
        @keyframes lp { 0%,100%{opacity:0.5} 50%{opacity:0.15} }
        .uppf-live-label { font-size:10px; color:var(--text-ter); letter-spacing:0.04em; }
        .uppf-ts-label { font-size:11px; color:var(--text-ter); margin-bottom:3px; text-align:right; }
        .uppf-ts-val { font-size:13px; color:var(--text-sec); text-align:right; }
        .uppf-content { padding:0 1.75rem 4rem; max-width:900px; margin:0 auto; }
        .section-reveal { padding:2rem 0; border-bottom:1px solid var(--border); opacity:0; transform:translateY(16px); transition:opacity 0.55s ease, transform 0.55s cubic-bezier(0.16,1,0.3,1); }
        .section-reveal:last-child { border-bottom:none; }
        .section-reveal.visible { opacity:1; transform:translateY(0); }
        .sec-label { font-size:11px; font-weight:500; letter-spacing:0.04em; color:var(--text-ter); margin-bottom:1.25rem; display:flex; align-items:center; gap:10px; }
        .sec-label::after { content:''; flex:1; height:1px; background:var(--border); }
        .card3d { background:linear-gradient(160deg,var(--surface3) 0%,var(--surface) 100%); border:1px solid var(--border); border-top-color:var(--border-top); border-radius:16px; padding:1.25rem; box-shadow:var(--shadow-md); transition:transform 0.35s cubic-bezier(0.34,1.56,0.64,1), box-shadow 0.35s ease, border-color 0.2s; position:relative; overflow:hidden; }
        .card3d::before { content:''; position:absolute; top:0; left:-20%; right:-20%; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.12),transparent); pointer-events:none; }
        .card3d:hover { box-shadow:var(--shadow-lg); border-color:var(--border-strong); }
        .hero-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px; }
        .hero-label { font-size:11px; color:var(--text-ter); margin-bottom:10px; font-weight:500; letter-spacing:0.04em; }
        .hero-num { font-size:clamp(40px,9vw,68px); font-weight:300; font-variant-numeric:tabular-nums; letter-spacing:-0.04em; line-height:1; text-shadow:0 0 40px rgba(255,255,255,0.12),0 0 80px rgba(255,255,255,0.05); }
        .hero-unit { font-size:12px; color:var(--text-sec); margin-top:6px; }
        .progress-wrap { padding:1.25rem; background:linear-gradient(160deg,var(--surface3) 0%,var(--surface) 100%); border:1px solid var(--border); border-top-color:var(--border-top); border-radius:16px; box-shadow:var(--shadow-md); position:relative; overflow:hidden; }
        .progress-wrap::before { content:''; position:absolute; top:0; left:-20%; right:-20%; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent); }
        .progress-top { display:flex; justify-content:space-between; align-items:baseline; margin-bottom:10px; }
        .progress-pct { font-size:32px; font-weight:300; letter-spacing:-0.03em; }
        .progress-lbl { font-size:12px; color:var(--text-sec); }
        .progress-track { width:100%; height:2px; background:rgba(255,255,255,0.05); border-radius:1px; overflow:hidden; }
        .progress-fill { height:100%; background:linear-gradient(90deg,rgba(255,255,255,0.3),rgba(255,255,255,0.7)); width:0; border-radius:1px; transition:width 2s cubic-bezier(0.16,1,0.3,1) 0.3s; }
        .two-col { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .bal-inner { padding:1.25rem; }
        .bal-machine { font-size:11px; color:var(--text-ter); letter-spacing:0.04em; margin-bottom:8px; font-weight:500; }
        .bal-num { font-size:30px; font-weight:300; letter-spacing:-0.03em; font-variant-numeric:tabular-nums; text-shadow:0 0 30px rgba(255,255,255,0.1),0 0 60px rgba(255,255,255,0.04); }
        .bal-unit { font-size:11px; color:var(--text-sec); margin-top:3px; }
        .bal-bar { height:1px; background:rgba(255,255,255,0.05); margin-top:12px; overflow:hidden; border-radius:1px; }
        .bal-fill { height:100%; background:linear-gradient(90deg,rgba(255,255,255,0.4),rgba(255,255,255,0.15)); width:0; transition:width 1.8s cubic-bezier(0.16,1,0.3,1) 0.4s; }
        .bal-note { padding:1rem 1.25rem; border-top:1px solid var(--border); font-size:12px; color:var(--text-sec); line-height:1.6; }
        .bal-note strong { color:var(--text); font-weight:500; }
        .maskin-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:14px; }
        .maskin-type { font-size:11px; color:var(--text-ter); letter-spacing:0.04em; margin-bottom:4px; font-weight:500; }
        .maskin-model { font-size:15px; font-weight:500; letter-spacing:-0.01em; }
        .badge { font-size:10px; padding:3px 9px; border-radius:20px; background:rgba(255,255,255,0.04); color:var(--text-sec); display:inline-flex; align-items:center; gap:5px; border:1px solid var(--border); box-shadow:inset 0 1px 0 rgba(255,255,255,0.06); }
        .badge-aktiv .badge-dot { width:5px; height:5px; border-radius:50%; background:#4ade80; box-shadow:0 0 6px rgba(74,222,128,0.6); animation:lp 2s ease-in-out infinite; }
        .badge-klar { color:#6e6e73; }
        .badge-klar .badge-dot { width:5px; height:5px; border-radius:50%; background:#6e6e73; }
        .maskin-meta { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
        .maskin-lbl { font-size:10px; color:var(--text-ter); margin-bottom:3px; letter-spacing:0.04em; }
        .maskin-val { font-size:13px; color:var(--text-sec); }
        .forare-toggle { margin-top:12px; font-size:11px; color:var(--text-ter); cursor:pointer; transition:color 0.2s; display:inline-block; }
        .forare-toggle:hover { color:var(--text-sec); }
        .forare-header { display:grid; grid-template-columns:1fr 1fr 1fr; font-size:10px; color:var(--text-ter); letter-spacing:0.04em; margin-bottom:6px; }
        .forare-row { display:grid; grid-template-columns:1fr 1fr 1fr; font-size:12px; color:var(--text-sec); padding:5px 0; }
        .forare-list { margin-top:10px; padding-top:10px; border-top:1px solid var(--border); }
        .tabs-wrap { display:flex; border-bottom:1px solid var(--border); overflow-x:auto; position:relative; scrollbar-width:none; -ms-overflow-style:none; padding-top:4px; }
        .tabs-wrap::-webkit-scrollbar { display:none; }
        .tab-btn { padding:12px 20px; font-size:12px; font-weight:500; letter-spacing:0.02em; color:#888; background:none; border:none; border-bottom:2px solid transparent; margin-bottom:-1px; cursor:pointer; white-space:nowrap; font-family:inherit; transition:color 0.25s, background 0.25s; border-radius:6px 6px 0 0; }
        .tab-btn:hover { color:var(--text-sec); }
        .tab-active { color:var(--text) !important; background:rgba(255,255,255,0.08); }
        .tab-slider { position:absolute; bottom:-1px; height:2px; background:linear-gradient(90deg,rgba(255,255,255,0.2),rgba(255,255,255,0.7),rgba(255,255,255,0.2)); border-radius:2px; transition:left 0.35s cubic-bezier(0.34,1.2,0.64,1), width 0.35s cubic-bezier(0.34,1.2,0.64,1); pointer-events:none; box-shadow:0 0 8px rgba(255,255,255,0.3); }
        .panel { padding:1.5rem 0; }
        .panel-two { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .panel-card { background:linear-gradient(160deg,var(--surface3) 0%,var(--surface) 100%); border:1px solid var(--border); border-top-color:rgba(255,255,255,0.1); border-radius:14px; padding:1.1rem; box-shadow:var(--shadow-sm); transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.3s ease; position:relative; overflow:hidden; }
        .panel-card::before { content:''; position:absolute; top:0; left:0; right:0; height:1px; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.1),transparent); }
        .panel-card:hover { transform:translateY(-3px); box-shadow:var(--shadow-md); }
        .panel-card h3 { font-size:10px; color:var(--text-ter); letter-spacing:0.04em; font-weight:500; margin-bottom:12px; }
        .row { display:flex; justify-content:space-between; align-items:center; font-size:13px; padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.04); }
        .row:last-child { border-bottom:none; }
        .row-label { color:var(--text-sec); }
        .row-val { color:var(--text); font-variant-numeric:tabular-nums; }
        .row-total { border-top:1px solid var(--border-strong) !important; margin-top:4px; padding-top:10px !important; }
        .row-total .row-val { font-weight:600; }
        .hbar-row { display:flex; align-items:center; gap:12px; margin-bottom:8px; }
        .hbar-label { font-size:11px; color:var(--text-sec); width:80px; flex-shrink:0; }
        .hbar-track { flex:1; height:3px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden; }
        .hbar-fill { height:100%; background:linear-gradient(90deg,rgba(255,255,255,0.6),rgba(255,255,255,0.25)); width:0; transition:width 1.2s cubic-bezier(0.16,1,0.3,1); border-radius:2px; position:relative; overflow:hidden; }
        .hbar-fill::after { content:''; position:absolute; top:0; left:-100%; width:60%; height:100%; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.6),transparent); }
        .hbar-fill.shimmer-go::after { animation:shimmer 0.7s ease forwards; }
        @keyframes shimmer { 0%{left:-100%;opacity:1} 100%{left:160%;opacity:0} }
        .hbar-val { font-size:11px; width:52px; text-align:right; color:var(--text-sec); font-variant-numeric:tabular-nums; }
        .tradslag-bar { display:flex; height:4px; width:100%; margin-bottom:12px; border-radius:2px; overflow:hidden; gap:2px; }
        .tradslag-seg { height:100%; border-radius:2px; transition:width 1.4s cubic-bezier(0.16,1,0.3,1); }
        .tradslag-legend { display:flex; flex-wrap:wrap; gap:14px; font-size:11px; color:var(--text-sec); }
        .leg-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; display:inline-block; margin-right:4px; }
        .avbrott-table { width:100%; font-size:12px; border-collapse:collapse; }
        .avbrott-table th { color:var(--text-ter); font-weight:500; text-align:left; padding:4px 0 8px; border-bottom:1px solid var(--border); font-size:10px; letter-spacing:0.04em; }
        .avbrott-table td { padding:7px 0; border-bottom:1px solid rgba(255,255,255,0.04); color:var(--text-sec); }
        .avbrott-table td:first-child { color:var(--text); }
        .avbrott-table td:last-child, .avbrott-table th:last-child { text-align:right; }
        .total-row { display:flex; justify-content:space-between; font-size:12px; padding-top:10px; color:var(--text-sec); }
        .total-row span:last-child { color:var(--text); font-weight:500; }
        .stats4 { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:1.25rem; }
        @media(min-width:500px){ .stats4 { grid-template-columns:repeat(4,1fr); } }
        .stat-card { background:linear-gradient(160deg,var(--surface3) 0%,var(--surface) 100%); border:1px solid var(--border); border-top-color:rgba(255,255,255,0.1); border-radius:14px; padding:1rem; box-shadow:var(--shadow-sm); transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1),box-shadow 0.3s; }
        .stat-card:hover { transform:translateY(-3px) scale(1.01); box-shadow:var(--shadow-md); }
        .stat-label { font-size:10px; color:var(--text-ter); letter-spacing:0.04em; margin-bottom:6px; font-weight:500; }
        .stat-num { font-size:22px; font-weight:300; letter-spacing:-0.02em; }
        .diesel-hero { display:grid; grid-template-columns:1fr 1fr; gap:1.5rem; }
        .diesel-big { font-size:clamp(28px,6vw,44px); font-weight:300; letter-spacing:-0.03em; font-variant-numeric:tabular-nums; }
        .diesel-unit { font-size:12px; color:var(--text-sec); margin-top:4px; }
        .sub-label { font-size:10px; color:var(--text-ter); letter-spacing:0.04em; margin:16px 0 10px; padding-top:14px; border-top:1px solid var(--border); font-weight:500; }
      `}</style>

      <div className="uppf-wrap">
        {/* HEADER */}
        <div className="uppf-header">
          <div>
            <div className="uppf-header-label">Uppföljning</div>
            <div className="uppf-header-title">{data.objektNamn}</div>
            {grot && <div style={{ fontSize: 12, color: '#4ade80', fontWeight: 600, letterSpacing: '0.05em', marginTop: 2 }}>Grot-skotning</div>}
            {extern && <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, letterSpacing: '0.05em', marginTop: 2 }}>Extern skotare{data.externForetag ? ` — ${data.externForetag}` : ''}</div>}
            <div className="uppf-live"><span className="uppf-live-dot" /><span className="uppf-live-label">LIVE</span></div>
          </div>
          <div>
            <div className="uppf-ts-label">Senast uppdaterad</div>
            <div className="uppf-ts-val">{timestamp || '—'}</div>
          </div>
        </div>

        {/* TABS — sticky under header */}
        <div ref={tabsRef} className="tabs-wrap" style={{ position: 'sticky', top: 0, zIndex: 9, background: 'var(--bg)' }}>
          {tabChoices.map(tab => (
            <button
              key={tab}
              className={`tab-btn${aktifTab === tab ? ' tab-active' : ''}`}
              onClick={e => { setAktifTab(tab); moveSlider(e.currentTarget); }}
            >
              {tab === 'oversikt' ? 'Översikt' : tab === 'tid' ? 'Tidredovisning' : tab === 'produktion' ? 'Produktion' : tab === 'diesel' ? 'Diesel' : tab === 'avbrott' ? 'Avbrott' : 'Skotarproduktion'}
            </button>
          ))}
          <div ref={sliderRef} className="tab-slider" />
        </div>

        <div className="uppf-content">

          {/* ÖVERSIKT — Volym + Balans + Maskiner */}
          {aktifTab === 'oversikt' && <>

          {/* VOLYM */}
          <div className="section-reveal">
            <div className="sec-label">Volym</div>
            <div className="hero-grid">
              {!grot && (
                <div className="card3d">
                  <div className="hero-label">Skördat</div>
                  <div className="hero-num">{skordat}</div>
                  <div className="hero-unit">m³fub</div>
                </div>
              )}
              {!egen && !extern && (
                <div className="card3d">
                  <div className="hero-label">Skotat</div>
                  <div className="hero-num">{skotat}</div>
                  <div className="hero-unit">m³fub</div>
                </div>
              )}
            </div>
            {!egen && !grot && !extern && (
              <div className="progress-wrap card3d" style={{ padding: '1.25rem' }}>
                <div className="progress-top">
                  <div className="progress-lbl">Framkört</div>
                </div>
                <div className="progress-track"><div ref={progressRef} className="progress-fill" style={data.skordat === 0 ? { background: 'rgba(255,255,255,0.08)' } : {}} /></div>
                <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 8 }}>
                  {data.skordat > 0 ? `Skotat: ${data.skotat.toLocaleString('sv-SE')} av ${data.skordat.toLocaleString('sv-SE')} m³` : '–'}
                </div>
              </div>
            )}
          </div>

          {/* BALANS */}
          {!grot && <div className="section-reveal">
            {extern ? (
              <>
                <div className="sec-label">Extern skotare</div>
                <div className="card3d" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: 'var(--text-ter)', letterSpacing: '0.06em', fontWeight: 500, marginBottom: 4 }}>Företag</div>
                      <div style={{ fontSize: 15, fontWeight: 500 }}>{data.externForetag || '—'}</div>
                    </div>
                    <div className="badge" style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)' }}>Inlejd</div>
                  </div>
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-ter)', letterSpacing: '0.04em', marginBottom: 3 }}>Pris</div>
                      <div style={{ fontSize: 13, color: 'var(--text-sec)' }}>{data.externPris || 0} kr/{data.externPrisTyp === 'timme' ? 'h' : 'm³'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-ter)', letterSpacing: '0.04em', marginBottom: 3 }}>Antal</div>
                      <div style={{ fontSize: 13, color: 'var(--text-sec)' }}>{data.externAntal || 0} {data.externPrisTyp === 'timme' ? 'h' : 'm³'}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-ter)', letterSpacing: '0.04em', marginBottom: 3 }}>Kostnad</div>
                      <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 600 }}>{externKostnad.toLocaleString('sv-SE')} kr</div>
                    </div>
                  </div>
                  {data.externPrisTyp === 'm3' && data.skordat > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: 'var(--text-sec)' }}>
                        Skotningskostnad: <span style={{ color: '#f59e0b', fontWeight: 500 }}>{(externKostnad / data.skordat).toFixed(1)} kr/m³</span> skördat
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : egen ? (
              <>
                <div className="sec-label">Skotning</div>
                <div className="card3d" style={{ padding: '1.25rem', textAlign: 'center' }}>
                  <div style={{ fontSize: 14, color: 'var(--text-sec)' }}>Egen skotning</div>
                </div>
              </>
            ) : (
              <>
                <div className="sec-label">Balans – skördare vs skotare</div>
                <div className="card3d" style={{ padding: 0, overflow: 'hidden' }}>
                  <div className="two-col" style={{ gap: 0 }}>
                    <div className="bal-inner" style={{ borderRight: '1px solid var(--border)' }}>
                      <div className="bal-machine">Skördare</div>
                      <div className="bal-num">{skordareBalStr}</div>
                      <div className="bal-unit">G15h</div>
                      <div className="bal-bar"><div ref={balSkordRef} className="bal-fill" /></div>
                    </div>
                    <div className="bal-inner">
                      <div className="bal-machine">Skotare</div>
                      <div className="bal-num">{skotareBalStr}</div>
                      <div className="bal-unit">G15h</div>
                      <div className="bal-bar"><div ref={balSkotRef} className="bal-fill" /></div>
                    </div>
                  </div>
                  <div className="bal-note">
                    {(() => {
                      if (data.skordareBalG15h === 0) return null;
                      const diffPct = Math.abs(((data.skotareBalG15h - data.skordareBalG15h) / data.skordareBalG15h) * 100);
                      if (diffPct < 5) return <>Skördare och skotare körde i god balans på det här objektet.</>;
                      if (data.skotareBalG15h > data.skordareBalG15h) return <>Skotaren behövde <strong>{diffPct.toFixed(0)}% mer tid</strong> än skördaren på det här objektet.</>;
                      return <>Skördaren behövde <strong>{diffPct.toFixed(0)}% mer tid</strong> än skotaren på det här objektet.</>;
                    })()}
                  </div>
                </div>
              </>
            )}
          </div>}

          {/* MASKINER */}
          <div className="section-reveal">
            <div className="sec-label">Maskiner</div>
            <div className="two-col">
              {data.maskiner.filter(m => !((egen || extern) && m.typ === 'Skotare') && !(grot && m.typ === 'Skördare')).map((m, i) => (
                <div key={i} className="card3d">
                  <div className="maskin-header">
                    <div>
                      <div className="maskin-type">{m.typ}</div>
                      <div className="maskin-model">{m.modell}</div>
                    </div>
                    {m.slut === 'pågår' ? (
                      <div className="badge badge-aktiv"><span className="badge-dot" />Aktiv</div>
                    ) : (
                      <div className="badge badge-klar"><span className="badge-dot" />Klar</div>
                    )}
                  </div>
                  <div className="maskin-meta">
                    <div><div className="maskin-lbl">Start</div><div className="maskin-val">{m.start}</div></div>
                    <div><div className="maskin-lbl">Slut</div><div className="maskin-val">{m.slut}</div></div>
                    <div><div className="maskin-lbl">Förare</div><div className="maskin-val">{m.aktivForare}</div></div>
                  </div>
                  {m.tidigareForare && m.tidigareForare.length > 0 && (
                    <>
                      <div className="forare-toggle" onClick={() => setVisaForare(v => ({ ...v, [i]: !v[i] }))}>
                        Tidigare förare ↓
                      </div>
                      {visaForare[i] && (
                        <div className="forare-list">
                          <div className="forare-header"><span>Förare</span><span>Från</span><span>Till</span></div>
                          {m.tidigareForare.map((f, j) => (
                            <div key={j} className="forare-row"><span>{f.namn}</span><span>{f.fran}</span><span>{f.till}</span></div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

          </div>
          </>}

            {/* TID */}
            {aktifTab === 'tid' && (
              <div className="panel">
                <div className="panel-two">
                  {[
                    ...(!grot ? [{
                      label: 'Skördare',
                      g15: data.skordareG15h, g0: data.skordareG0, tomgang: data.skordareTomgang,
                      kortaStopp: data.skordareKortaStopp, avbrott: data.skordareAvbrott, rast: data.skordareRast,
                    }] : []),
                    ...((!egen && !extern) ? [{
                      label: 'Skotare',
                      g15: data.skotareG15h, g0: data.skotareG0, tomgang: data.skotareTomgang,
                      kortaStopp: data.skotareKortaStopp, avbrott: data.skotareAvbrott, rast: data.skotareRast,
                    }] : []),
                  ].map(m => {
                    const harData = m.g15 > 0 || m.g0 > 0 || m.avbrott > 0 || m.rast > 0;
                    if (!harData) return (
                      <div key={m.label} className="panel-card">
                        <h3>{m.label}</h3>
                        <div style={{ color: 'var(--text-ter)', fontSize: 13, padding: '1.5rem 0' }}>
                          Ingen {m.label.toLowerCase()} kopplad till detta objekt
                        </div>
                      </div>
                    );
                    const arbetstid = Math.round((m.g15 + m.avbrott) * 10) / 10;
                    const totaltid = Math.round((arbetstid + m.rast) * 10) / 10;
                    return (
                      <div key={m.label} className="panel-card">
                        <h3>{m.label}</h3>
                        <div className="row"><span className="row-label">Grundtid G(t)</span><span className="row-val">{m.g15}h</span></div>
                        <div className="row"><span className="row-label">Grundtid G(0)</span><span className="row-val">{m.g0}h</span></div>
                        <div className="row"><span className="row-label">Tomgång</span><span className="row-val">{m.tomgang}h</span></div>
                        <div className="row"><span className="row-label">Korta stopp</span><span className="row-val">{m.kortaStopp}h</span></div>
                        <div className="row"><span className="row-label">Avbrott</span><span className="row-val">{m.avbrott}h</span></div>
                        <div className="row row-total"><span className="row-label">Arbetstid</span><span className="row-val">{arbetstid}h</span></div>
                        <div className="row"><span className="row-label">Rast</span><span className="row-val">{m.rast}h</span></div>
                        <div className="row row-total"><span className="row-label">Totaltid</span><span className="row-val">{totaltid}h</span></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PRODUKTION */}
            {aktifTab === 'produktion' && (
              <div className="panel">
                <div className="panel-two" style={{ marginBottom: 12 }}>
                  <div className="panel-card">
                    <h3>Skördare</h3>
                    {data.skordareM3G15h > 0 || data.skordareStammarG15h > 0 ? <>
                      <div className="row"><span className="row-label">m³/G15h</span><span className="row-val">{data.skordareM3G15h}</span></div>
                      <div className="row"><span className="row-label">Stammar/G15h</span><span className="row-val">{data.skordareStammarG15h}</span></div>
                      <div className="row"><span className="row-label">Medelstam</span><span className="row-val">{data.skordareMedelstam} m³</span></div>
                    </> : <div style={{ color: 'var(--text-ter)', fontSize: 13, padding: '1.5rem 0' }}>Ingen skördare kopplad till detta objekt</div>}
                  </div>
                  {!egen && !extern && (
                    <div className="panel-card">
                      <h3>Skotare</h3>
                      {data.skotareM3G15h > 0 || data.skotareLassG15h > 0 ? <>
                        <div className="row"><span className="row-label">m³/G15h</span><span className="row-val">{data.skotareM3G15h}</span></div>
                        <div className="row"><span className="row-label">Lass/G15h</span><span className="row-val">{data.skotareLassG15h}</span></div>
                        <div className="row"><span className="row-label">Snittlass</span><span className="row-val">{data.skotareSnittlass} m³</span></div>
                      </> : <div style={{ color: 'var(--text-ter)', fontSize: 13, padding: '1.5rem 0' }}>Ingen skotare kopplad till detta objekt</div>}
                    </div>
                  )}
                </div>
                <div className="panel-two">
                  <div className="panel-card">
                    <h3>Trädslag</h3>
                    <div className="tradslag-bar">
                      {data.tradslag.map((t, i) => <div key={t.namn} className="tradslag-seg" style={{ width: t.pct + '%', background: tradslagColors[i] }} />)}
                    </div>
                    <div className="tradslag-legend">
                      {data.tradslag.map((t, i) => <span key={t.namn}><span className="leg-dot" style={{ background: tradslagColors[i], border: i === 3 ? '1px solid var(--border-strong)' : 'none' }} />{t.namn} {t.pct}%</span>)}
                    </div>
                  </div>
                  <div className="panel-card">
                    <h3>Sortiment</h3>
                    {data.sortiment.map((s, i) => {
                      const { namn, kod } = sortimentSvenska(s.namn);
                      return (
                        <div key={s.namn} style={{ marginBottom: 8 }}>
                          <HBar label={namn} pct={Math.round(s.m3 / maxSortiment * 100)} val={s.m3 + ' m³'} delay={i * 60} />
                          {kod && <div style={{ fontSize: 9, color: 'var(--text-ter)', marginTop: -4, marginLeft: 0, paddingLeft: 0 }}>{kod}</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* DIESEL */}
            {aktifTab === 'diesel' && (
              <div className="panel">
                <div className="card3d" style={{ marginBottom: 12 }}>
                  <div className="sec-label" style={{ marginBottom: '1rem' }}>{(egen || extern) ? 'Totalt — Skördare' : grot ? 'Totalt — Skotare' : 'Totalt — Skördare + Skotare'}</div>
                  <div className="diesel-hero">
                    <div><div className="diesel-big">{dieselTot}</div><div className="diesel-unit">liter totalt</div></div>
                    <div><div className="diesel-big">{dieselM3}</div><div className="diesel-unit">L/m³fub fritt bilväg</div></div>
                  </div>
                </div>
                <div className="panel-two" style={{ marginBottom: 12 }}>
                  {!grot && (
                    <div className="panel-card">
                      <h3>Skördare</h3>
                      <div className="row"><span className="row-label">Liter totalt</span><span className="row-val">{data.skordareL.toLocaleString('sv-SE')} L</span></div>
                      <div className="row"><span className="row-label">L/m³</span><span className="row-val">{data.skordareL_M3}</span></div>
                      <div className="row"><span className="row-label">L/G15h</span><span className="row-val">{data.skordareL_G15h}</span></div>
                    </div>
                  )}
                  {!egen && !extern && (
                    <div className="panel-card">
                      <h3>Skotare</h3>
                      <div className="row"><span className="row-label">Liter totalt</span><span className="row-val">{data.skotareL.toLocaleString('sv-SE')} L</span></div>
                      <div className="row"><span className="row-label">L/m³</span><span className="row-val">{data.skotareL_M3}</span></div>
                      <div className="row"><span className="row-label">L/G15h</span><span className="row-val">{data.skotareL_G15h}</span></div>
                    </div>
                  )}
                </div>
                <div className="panel-card">
                  {!grot && (
                    <>
                      <h3>Skördare — Diesel per dag</h3>
                      {data.dieselSkordare.map((d, i) => <HBar key={d.datum} label={d.datum} pct={Math.round(d.liter / maxDieselSkord * 100)} val={d.liter + ' L'} delay={i * 60} />)}
                    </>
                  )}
                  {!egen && !extern && (
                    <>
                      {grot ? <h3>Skotare — Diesel per dag</h3> : <div className="sub-label">Skotare — Diesel per dag</div>}
                      {data.dieselSkotare.map((d, i) => <HBar key={d.datum} label={d.datum} pct={Math.round(d.liter / maxDieselSkot * 100)} val={d.liter + ' L'} delay={i * 60} />)}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* AVBROTT */}
            {aktifTab === 'avbrott' && (
              <div className="panel">
                <div className="panel-two">
                  {[...(!grot ? [{ label: 'Skördare', rows: data.avbrottSkordare, totalt: data.avbrottSkordare_totalt }] : []), ...((!egen && !extern) ? [{ label: 'Skotare', rows: data.avbrottSkotare, totalt: data.avbrottSkotareTotalt }] : [])].map(m => (
                    <div key={m.label} className="panel-card">
                      <h3>{m.label}</h3>
                      {m.rows.length > 0 ? <>
                        <table className="avbrott-table">
                          <thead><tr><th>Orsak</th><th>Typ</th><th>Tid</th><th>Antal</th></tr></thead>
                          <tbody>{m.rows.map(r => <tr key={r.orsak}><td>{r.orsak}</td><td>{r.typ}</td><td>{r.tid}</td><td>{r.antal}</td></tr>)}</tbody>
                        </table>
                        <div className="total-row"><span>Totalt</span><span>{m.totalt}</span></div>
                      </> : <div style={{ color: 'var(--text-ter)', fontSize: 13, padding: '1.5rem 0' }}>Ingen {m.label.toLowerCase()} kopplad till detta objekt</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SKOTARPRODUKTION */}
            {aktifTab === 'skotare' && (
              <div className="panel">
                {data.antalLass === 0 && data.skotareM3G15h === 0 ? (
                  <div style={{ color: 'var(--text-ter)', fontSize: 13, padding: '2rem 0', textAlign: 'center' }}>Ingen skotare kopplad till detta objekt</div>
                ) : <>
                <div className="stats4">
                  {[['Antal lass', data.antalLass], ['Snittlass', data.snittlassM3 + ' m³'], ['Lass/G15h', data.lassG15h], ['Skotningsavst.', data.skotningsavstand + ' m']].map(([l, v]) => (
                    <div key={String(l)} className="stat-card"><div className="stat-label">{l}</div><div className="stat-num">{v}</div></div>
                  ))}
                </div>
                <div className="panel-card">
                  <h3>Lass per dag</h3>
                  {data.lassPerDag.map((d, i) => <HBar key={d.datum} label={d.datum} pct={Math.round(d.lass / maxLass * 100)} val={d.lass + ' lass'} delay={i * 60} />)}
                </div>
                </>}
              </div>
            )}

        </div>
      </div>
    </>
  );
}
