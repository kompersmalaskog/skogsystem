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

export default function ForestBackground() {
  const [phase, setPhase] = useState<TimePhase>('night');
  const [mouseX, setMouseX] = useState(0);
  const [mouseY, setMouseY] = useState(0);

  useEffect(() => {
    setPhase(getTimePhase());
    const interval = setInterval(() => setPhase(getTimePhase()), 60000);
    return () => clearInterval(interval);
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

  const theme = THEMES[phase];

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
      `}</style>

      {/* Sky gradient */}
      <div style={{
        position: 'absolute', inset: 0,
        background: theme.sky,
        transition: 'background 2s ease',
      }} />

      {/* Stars (night only) */}
      {isNight && <Stars count={80} />}

      {/* Shooting stars (night only) */}
      {isNight && <ShootingStars />}

      {/* Moon (night) or Sun (dawn/day/dusk) */}
      {isNight && <Moon />}
      {showSun && <Sun phase={phase} />}

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

      {/* Fog */}
      <Fog />

      {/* Ground gradient */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 140, zIndex: 6,
        background: theme.groundFog,
        transition: 'background 2s ease',
      }} />
    </div>
  );
}
