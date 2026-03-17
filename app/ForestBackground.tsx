'use client'

import { useMemo, useState, useEffect, useRef, useCallback } from 'react'

/* Time of day phases */
type TimePhase = 'dawn' | 'day' | 'dusk' | 'night'

function getTimePhase(): TimePhase {
  const h = parseInt(new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', hour12: false }))
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 18) return 'day'
  if (h >= 18 && h < 20) return 'dusk'
  return 'night'
}

/* Weather condition derived from SMHI data */
type WeatherCondition = 'snow' | 'rain' | 'summer' | 'normal'

interface WeatherData {
  temp: number
  symbol: number // Wsymb2 1-27
  condition: WeatherCondition
}

/* SMHI Wsymb2 codes:
   8-10: rain showers, 12-14: sleet showers, 15-17: snow showers,
   18-20: rain, 22-24: sleet, 25-27: snowfall */
function deriveCondition(temp: number, symbol: number): WeatherCondition {
  const isSnow = [15, 16, 17, 25, 26, 27].includes(symbol)
  const isSleet = [12, 13, 14, 22, 23, 24].includes(symbol)
  const isRain = [8, 9, 10, 11, 18, 19, 20, 21].includes(symbol)
  const isClear = [1, 2].includes(symbol)

  if ((isSnow || isSleet) || (temp < 0 && (isRain || isSleet))) return 'snow'
  if (isRain) return 'rain'
  if (temp > 15 && isClear) return 'summer'
  return 'normal'
}

function getCalendarSeason(): 'winter' | 'spring' | 'summer' | 'autumn' {
  const m = new Date().getMonth()
  if (m >= 2 && m <= 4) return 'spring'
  if (m >= 5 && m <= 7) return 'summer'
  if (m >= 8 && m <= 10) return 'autumn'
  return 'winter'
}

interface PhaseTheme {
  sky: string
  groundFog: string
  treeLayers: string[]
  treeOpacities: number[]
}

const THEMES: Record<TimePhase, PhaseTheme> = {
  dawn: {
    sky: 'linear-gradient(180deg, #1a1035 0%, #4a2060 20%, #c05050 45%, #e8a050 65%, #f0c878 80%, #d0a060 100%)',
    groundFog: 'linear-gradient(to top, #2a1520cc 0%, #d0a06040 30%, transparent 100%)',
    treeLayers: ['#1a0e18', '#2a1520', '#3a2028', '#4a2830'],
    treeOpacities: [0.5, 0.55, 0.5, 0.55],
  },
  day: {
    sky: 'linear-gradient(180deg, #4a90d0 0%, #6aade0 25%, #88c4f0 50%, #b0d8f0 70%, #d8e8f0 85%, #c0d8c0 100%)',
    groundFog: 'linear-gradient(to top, #1a3a1acc 0%, #88c4f020 40%, transparent 100%)',
    treeLayers: ['#0c1f0c', '#142a14', '#1c3a1c', '#245024'],
    treeOpacities: [0.45, 0.5, 0.5, 0.55],
  },
  dusk: {
    sky: 'linear-gradient(180deg, #1a1040 0%, #3a1860 20%, #802050 40%, #c04040 55%, #d07040 70%, #806040 100%)',
    groundFog: 'linear-gradient(to top, #1a1020cc 0%, #80604030 35%, transparent 100%)',
    treeLayers: ['#10081a', '#1a1020', '#241828', '#2e2030'],
    treeOpacities: [0.5, 0.55, 0.5, 0.55],
  },
  night: {
    sky: 'linear-gradient(180deg, #050510 0%, #0a0a20 25%, #0e1030 50%, #121838 70%, #0e1830 85%, #0a1020 100%)',
    groundFog: 'linear-gradient(to top, #050510cc 0%, #0a0a2060 40%, transparent 100%)',
    treeLayers: ['#060810', '#080c18', '#0a1020', '#0c1428'],
    treeOpacities: [0.35, 0.4, 0.4, 0.45],
  },
}

/* Snow-adjusted themes: whiter/colder tones */
const SNOW_THEMES: Record<TimePhase, PhaseTheme> = {
  dawn: {
    sky: 'linear-gradient(180deg, #1a1a2a 0%, #3a3050 20%, #8a6070 45%, #c09080 65%, #d0b8a0 80%, #b0a090 100%)',
    groundFog: 'linear-gradient(to top, #e0e0f0cc 0%, #c0c0d040 30%, transparent 100%)',
    treeLayers: ['#1a1520', '#2a2028', '#3a2830', '#4a3038'],
    treeOpacities: [0.5, 0.55, 0.5, 0.55],
  },
  day: {
    sky: 'linear-gradient(180deg, #708898 0%, #8aa0b0 25%, #a0b8c8 50%, #c0d0d8 70%, #d8e0e8 85%, #e8f0f0 100%)',
    groundFog: 'linear-gradient(to top, #e0e8f0cc 0%, #c0d0e020 40%, transparent 100%)',
    treeLayers: ['#142018', '#1c2a20', '#243828', '#2c4830'],
    treeOpacities: [0.45, 0.5, 0.5, 0.55],
  },
  dusk: {
    sky: 'linear-gradient(180deg, #181828 0%, #2a2040 20%, #604050 40%, #906060 55%, #a08070 70%, #808080 100%)',
    groundFog: 'linear-gradient(to top, #d0d0e0cc 0%, #a0a0b030 35%, transparent 100%)',
    treeLayers: ['#10101a', '#1a1820', '#241828', '#2e2030'],
    treeOpacities: [0.5, 0.55, 0.5, 0.55],
  },
  night: {
    sky: 'linear-gradient(180deg, #0a0a18 0%, #101020 25%, #161830 50%, #1c2038 70%, #182030 85%, #101828 100%)',
    groundFog: 'linear-gradient(to top, #c0c8e0aa 0%, #606880 40%, transparent 100%)',
    treeLayers: ['#080a14', '#0c1020', '#101428', '#141830'],
    treeOpacities: [0.35, 0.4, 0.4, 0.45],
  },
}

/* Rain-adjusted themes: darker/greyer */
const RAIN_THEMES: Record<TimePhase, PhaseTheme> = {
  dawn: {
    ...THEMES.dawn,
    sky: 'linear-gradient(180deg, #1a1520 0%, #302838 20%, #604848 45%, #807060 65%, #908068 80%, #706050 100%)',
  },
  day: {
    ...THEMES.day,
    sky: 'linear-gradient(180deg, #506068 0%, #607078 25%, #708088 50%, #909898 70%, #a8b0b0 85%, #8a9890 100%)',
  },
  dusk: {
    ...THEMES.dusk,
    sky: 'linear-gradient(180deg, #141020 0%, #281840 20%, #503040 40%, #704040 55%, #806048 70%, #504838 100%)',
  },
  night: THEMES.night,
}

/* Summer-adjusted day theme: warmer/brighter */
const SUMMER_THEMES: Record<TimePhase, PhaseTheme> = {
  dawn: THEMES.dawn,
  day: {
    sky: 'linear-gradient(180deg, #2878c0 0%, #50a0e0 25%, #70c0f0 50%, #a0d8f8 70%, #d0e8f0 85%, #b0d8b0 100%)',
    groundFog: 'linear-gradient(to top, #1a3a1a88 0%, #88c4f010 40%, transparent 100%)',
    treeLayers: ['#0a2a0a', '#143214', '#1c441c', '#246024'],
    treeOpacities: [0.5, 0.55, 0.55, 0.6],
  },
  dusk: THEMES.dusk,
  night: THEMES.night,
}

/* Seeded pseudo-random for deterministic tree placement */
function seeded(seed: number) {
  let s = seed;
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647; };
}

/* Generate tree SVG path */
function treePath(h: number, w: number): string {
  const tw = w * 0.12;
  const th = h * 0.18;
  const crownH = h - th;
  let d = '';
  for (let i = 0; i < 3; i++) {
    const layerY = th + crownH * (i / 3) * 0.7;
    const layerTop = th + crownH * ((i + 0.3) / 3);
    const layerW = w * (1 - i * 0.2) * 0.5;
    d += `M${w / 2},${h - layerTop} L${w / 2 - layerW},${h - layerY} L${w / 2 + layerW},${h - layerY} Z `;
  }
  d += `M${w / 2 - tw},${h} L${w / 2 - tw},${h - th} L${w / 2 + tw},${h - th} L${w / 2 + tw},${h} Z`;
  return d;
}

interface TreeData { x: number; h: number; w: number; delay: number; dur: number; amp: number; ampNeg: number; mid: number }

interface TreeLayer {
  trees: TreeData[];
  bottom: number;
  zIndex: number;
  parallax: number;
}

/* Stars component */
function Stars({ count }: { count: number }) {
  const stars = useMemo(() => {
    const rng = seeded(99);
    return Array.from({ length: count }, () => ({
      x: rng() * 100,
      y: rng() * 60,
      size: 1 + rng() * 2,
      opacity: 0.3 + rng() * 0.7,
      twinkleDelay: rng() * 5,
      twinkleDur: 2 + rng() * 4,
    }));
  }, [count]);

  return (
    <>
      {stars.map((s, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
          width: s.size, height: s.size, borderRadius: '50%',
          background: '#fff',
          animation: `twinkle ${s.twinkleDur}s ease-in-out ${s.twinkleDelay}s infinite`,
        }} />
      ))}
    </>
  );
}

/* Shooting star component */
function ShootingStars() {
  const [meteors, setMeteors] = useState<{ id: number; x: number; y: number; angle: number; dur: number }[]>([]);
  const counterRef = useRef(0);

  useEffect(() => {
    const spawn = () => {
      const rng = Math.random;
      const count = 1 + Math.floor(rng() * 3);
      const newMeteors = Array.from({ length: count }, () => ({
        id: counterRef.current++,
        x: 10 + rng() * 70,
        y: 5 + rng() * 30,
        angle: 20 + rng() * 30,
        dur: 0.6 + rng() * 0.8,
      }));
      setMeteors(prev => [...prev, ...newMeteors]);
      setTimeout(() => {
        setMeteors(prev => prev.filter(m => !newMeteors.find(n => n.id === m.id)));
      }, 2000);
    };

    const interval = setInterval(spawn, 20000 + Math.random() * 40000);
    const initial = setTimeout(spawn, 3000 + Math.random() * 5000);
    return () => { clearInterval(interval); clearTimeout(initial); };
  }, []);

  return (
    <>
      {meteors.map(m => (
        <div key={m.id} style={{
          position: 'absolute', left: `${m.x}%`, top: `${m.y}%`,
          width: 80, height: 2,
          background: 'linear-gradient(90deg, rgba(255,255,255,0.8), transparent)',
          borderRadius: 1,
          transform: `rotate(${m.angle}deg)`,
          animation: `shootingStar ${m.dur}s ease-out forwards`,
        }} />
      ))}
    </>
  );
}

/* Moon */
function Moon() {
  return (
    <div style={{ position: 'absolute', top: '8%', right: '15%', zIndex: 1 }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 120, height: 120, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(200,210,255,0.08) 0%, rgba(200,210,255,0.03) 40%, transparent 70%)',
      }} />
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'radial-gradient(circle at 35% 35%, #f0f0ff 0%, #c8d0e0 50%, #a0a8c0 100%)',
        boxShadow: '0 0 20px rgba(200,210,255,0.3), 0 0 60px rgba(200,210,255,0.1)',
      }} />
    </div>
  );
}

/* Sun */
function Sun({ phase }: { phase: TimePhase }) {
  const yPos = phase === 'dawn' ? '45%' : phase === 'dusk' ? '50%' : '10%';
  const xPos = phase === 'dawn' ? '20%' : phase === 'dusk' ? '75%' : '60%';
  const size = phase === 'day' ? 44 : 36;
  const glowSize = phase === 'day' ? 200 : 160;

  return (
    <div style={{ position: 'absolute', top: yPos, left: xPos, zIndex: 1 }}>
      <div style={{
        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: glowSize, height: glowSize, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,220,120,0.12) 0%, rgba(255,180,60,0.05) 40%, transparent 70%)',
        animation: 'sunGlow 4s ease-in-out infinite',
      }} />
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'radial-gradient(circle at 40% 40%, #fffbe0 0%, #ffd040 40%, #e0a020 100%)',
        boxShadow: '0 0 30px rgba(255,200,60,0.4), 0 0 80px rgba(255,180,40,0.15)',
      }} />
    </div>
  );
}

/* Fog layer */
function Fog() {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%', zIndex: 5, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', left: '-20%', right: '-20%', bottom: 0, height: '100%',
        background: 'linear-gradient(to top, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 40%, transparent 100%)',
        animation: 'fogDrift1 25s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', left: '-10%', right: '-30%', bottom: 0, height: '80%',
        background: 'linear-gradient(to top, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 50%, transparent 100%)',
        animation: 'fogDrift2 35s ease-in-out infinite',
      }} />
    </div>
  );
}

/* Snowfall effect */
function Snowfall({ intensity }: { intensity: 'light' | 'moderate' | 'heavy' }) {
  const count = intensity === 'heavy' ? 120 : intensity === 'moderate' ? 70 : 40;
  const flakes = useMemo(() => {
    const rng = seeded(777);
    return Array.from({ length: count }, () => ({
      x: rng() * 100,
      size: 2 + rng() * 4,
      opacity: 0.3 + rng() * 0.5,
      dur: 6 + rng() * 10,
      delay: rng() * 10,
      drift: -15 + rng() * 30,
    }));
  }, [count]);

  return (
    <>
      {flakes.map((f, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${f.x}%`, top: -10,
          width: f.size, height: f.size, borderRadius: '50%',
          background: '#fff', opacity: f.opacity,
          animation: `snowfall ${f.dur}s linear ${f.delay}s infinite`,
          ['--drift' as string]: `${f.drift}px`,
          zIndex: 7,
        }} />
      ))}
    </>
  );
}

/* Rainfall effect */
function Rainfall({ intensity }: { intensity: 'light' | 'moderate' | 'heavy' }) {
  const count = intensity === 'heavy' ? 150 : intensity === 'moderate' ? 80 : 40;
  const drops = useMemo(() => {
    const rng = seeded(555);
    return Array.from({ length: count }, () => ({
      x: rng() * 100,
      len: 10 + rng() * 20,
      opacity: 0.1 + rng() * 0.25,
      dur: 0.4 + rng() * 0.6,
      delay: rng() * 2,
    }));
  }, [count]);

  return (
    <>
      {drops.map((d, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${d.x}%`, top: -30,
          width: 1.5, height: d.len,
          background: `linear-gradient(to bottom, transparent, rgba(180,200,230,${d.opacity}))`,
          animation: `rainfall ${d.dur}s linear ${d.delay}s infinite`,
          zIndex: 7,
        }} />
      ))}
    </>
  );
}

/* Snow ground cover */
function SnowGround() {
  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, zIndex: 6,
      background: 'linear-gradient(to top, rgba(220,225,240,0.25) 0%, rgba(220,225,240,0.1) 50%, transparent 100%)',
    }} />
  );
}

/* SMHI weather fetcher */
async function fetchSMHI(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon.toFixed(4)}/lat/${lat.toFixed(4)}/data.json`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const data = await res.json()

    // Find the closest timeSeries entry to now
    const now = Date.now()
    let closest = data.timeSeries?.[0]
    let minDiff = Infinity
    for (const ts of data.timeSeries || []) {
      const diff = Math.abs(new Date(ts.validTime).getTime() - now)
      if (diff < minDiff) { minDiff = diff; closest = ts }
    }
    if (!closest) return null

    let temp = 0
    let symbol = 1
    for (const p of closest.parameters || []) {
      if (p.name === 't') temp = p.values[0]
      if (p.name === 'Wsymb2') symbol = p.values[0]
    }

    return { temp, symbol, condition: deriveCondition(temp, symbol) }
  } catch {
    return null
  }
}

function getWeatherIntensity(symbol: number): 'light' | 'moderate' | 'heavy' {
  if ([10, 14, 17, 20, 24, 27].includes(symbol)) return 'heavy'
  if ([9, 13, 16, 19, 23, 26].includes(symbol)) return 'moderate'
  return 'light'
}

export default function ForestBackground() {
  const [phase, setPhase] = useState<TimePhase>('night');
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);

  // Time phase
  useEffect(() => {
    setPhase(getTimePhase());
    const interval = setInterval(() => setPhase(getTimePhase()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Weather fetching
  useEffect(() => {
    let cancelled = false;

    const fetchWeather = (lat: number, lon: number) => {
      fetchSMHI(lat, lon).then(data => {
        if (!cancelled && data) setWeather(data);
      });
    };

    const startFetching = (lat: number, lon: number) => {
      fetchWeather(lat, lon);
      const interval = setInterval(() => fetchWeather(lat, lon), 30 * 60 * 1000);
      return interval;
    };

    let intervalId: ReturnType<typeof setInterval> | null = null;

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (!cancelled) {
            intervalId = startFetching(pos.coords.latitude, pos.coords.longitude);
          }
        },
        () => {
          // GPS denied — fallback: use Kompersmåla coordinates
          if (!cancelled) {
            intervalId = startFetching(56.65, 15.68);
          }
        },
        { timeout: 8000 }
      );
    } else {
      // No geolocation — fallback
      intervalId = startFetching(56.65, 15.68);
    }

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const x = (e.clientX / window.innerWidth - 0.5) * 2;
    const y = (e.clientY / window.innerHeight - 0.5) * 2;
    setMouseX(x);
    setMouseY(y);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [handleMouseMove]);

  // Select theme based on weather condition
  const condition = weather?.condition || 'normal';
  const themeSet = condition === 'snow' ? SNOW_THEMES
    : condition === 'rain' ? RAIN_THEMES
    : condition === 'summer' ? SUMMER_THEMES
    : THEMES;
  const theme = themeSet[phase];

  const intensity = weather ? getWeatherIntensity(weather.symbol) : 'light';

  const layers = useMemo<TreeLayer[]>(() => {
    const rng = seeded(42);
    const mkTrees = (n: number, minH: number, maxH: number, wFactor: number, wVar: number, baseAmp: number, ampVar: number): TreeData[] =>
      Array.from({ length: n }, () => {
        const h = minH + rng() * (maxH - minH);
        const amp = baseAmp + rng() * ampVar;
        const ampNeg = -(amp * (0.3 + rng() * 0.4));
        const mid = amp * (0.1 + rng() * 0.3);
        return {
          x: rng() * 110 - 5,
          h, w: h * (wFactor + rng() * wVar),
          delay: rng() * 6,
          dur: 4 + rng() * 6,
          amp, ampNeg, mid,
        };
      });
    return [
      { bottom: 0, zIndex: 1, parallax: 0.2,
        trees: mkTrees(28, 50, 90, 0.25, 0.1, 1.5, 1.0) },
      { bottom: 0, zIndex: 2, parallax: 0.5,
        trees: mkTrees(20, 70, 130, 0.22, 0.1, 2.0, 1.5) },
      { bottom: 0, zIndex: 3, parallax: 0.7,
        trees: mkTrees(14, 100, 180, 0.2, 0.1, 2.5, 2.0) },
      { bottom: 0, zIndex: 4, parallax: 1.0,
        trees: mkTrees(8, 160, 260, 0.18, 0.08, 3.0, 2.0) },
    ];
  }, []);

  const keyframesCss = useMemo(() => {
    let css = '';
    layers.forEach((layer, li) => {
      layer.trees.forEach((t, ti) => {
        const name = `sw${li}_${ti}`;
        css += `@keyframes ${name}{0%,100%{transform:rotate(${t.mid.toFixed(1)}deg)}35%{transform:rotate(${t.amp.toFixed(1)}deg)}70%{transform:rotate(${t.ampNeg.toFixed(1)}deg)}}\n`;
      });
    });
    return css;
  }, [layers]);

  const isNight = phase === 'night';
  const showSun = phase === 'dawn' || phase === 'day' || phase === 'dusk';
  const showSunDisk = showSun && condition !== 'rain';

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      <style>{keyframesCss}</style>
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.4); }
        }
        @keyframes shootingStar {
          0% { opacity: 1; transform-origin: left center; transform: rotate(inherit) scaleX(0); }
          20% { opacity: 1; transform: rotate(inherit) scaleX(1); }
          100% { opacity: 0; transform: rotate(inherit) translateX(200px) scaleX(0.3); }
        }
        @keyframes sunGlow {
          0%, 100% { opacity: 0.7; transform: translate(-50%,-50%) scale(1); }
          50% { opacity: 1; transform: translate(-50%,-50%) scale(1.1); }
        }
        @keyframes fogDrift1 {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(5%); }
        }
        @keyframes fogDrift2 {
          0%, 100% { transform: translateX(0); }
          50% { transform: translateX(-4%); }
        }
        @keyframes snowfall {
          0% { transform: translateY(-10px) translateX(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(100vh) translateX(var(--drift, 0px)); opacity: 0; }
        }
        @keyframes rainfall {
          0% { transform: translateY(-30px); opacity: 0; }
          10% { opacity: 1; }
          100% { transform: translateY(100vh); opacity: 0.1; }
        }
      `}</style>

      {/* Sky gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: theme.sky,
        transition: 'background 2s ease',
      }} />

      {/* Stars (night only, not when snowing/raining) */}
      {isNight && condition !== 'snow' && condition !== 'rain' && <Stars count={80} />}

      {/* Shooting stars (clear night only) */}
      {isNight && condition === 'normal' && <ShootingStars />}
      {isNight && condition === 'summer' && <ShootingStars />}

      {/* Moon (night) or Sun (dawn/day/dusk) */}
      {isNight && condition !== 'snow' && condition !== 'rain' && <Moon />}
      {showSunDisk && <Sun phase={phase} />}

      {/* Weather effects */}
      {condition === 'snow' && <Snowfall intensity={intensity} />}
      {condition === 'rain' && <Rainfall intensity={intensity} />}

      {/* Tree layers with parallax */}
      {layers.map((layer, li) => {
        const px = mouseX * layer.parallax * 15;
        const py = mouseY * layer.parallax * 8;
        return (
          <div key={li} style={{
            position: 'absolute', left: 0, right: 0, bottom: layer.bottom, height: '100%',
            zIndex: layer.zIndex,
            opacity: theme.treeOpacities[li],
            transform: `translate(${px}px, ${py}px)`,
            transition: 'transform 0.3s ease-out, opacity 2s ease',
          }}>
            {layer.trees.map((tree, ti) => (
              <svg
                key={ti}
                viewBox={`0 0 ${tree.w} ${tree.h}`}
                width={tree.w}
                height={tree.h}
                style={{
                  position: 'absolute',
                  left: `${tree.x}%`,
                  bottom: 0,
                  transformOrigin: 'bottom center',
                  animation: `sw${li}_${ti} ${tree.dur.toFixed(1)}s ease-in-out ${tree.delay.toFixed(1)}s infinite`,
                  willChange: 'transform',
                }}
              >
                <path d={treePath(tree.h, tree.w)} fill={theme.treeLayers[li]} />
              </svg>
            ))}
          </div>
        );
      })}

      {/* Snow ground cover */}
      {condition === 'snow' && <SnowGround />}

      {/* Fog */}
      <Fog />

      {/* Ground gradient */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 140, zIndex: 6,
        background: theme.groundFog,
        transition: 'background 2s ease',
      }} />

      {/* Temperature display */}
      {weather && (
        <div style={{
          position: 'absolute', top: 12, right: 16, zIndex: 10,
          fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.4)',
          fontFamily: "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
          textShadow: '0 1px 3px rgba(0,0,0,0.5)',
        }}>
          {Math.round(weather.temp)}°
        </div>
      )}
    </div>
  );
}
