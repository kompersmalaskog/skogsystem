'use client'

import { useMemo, useState, useEffect, useCallback } from 'react'

type TimePhase = 'dawn' | 'day' | 'dusk' | 'night'

function getTimePhase(): TimePhase {
  const h = parseInt(new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', hour12: false }))
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 18) return 'day'
  if (h >= 18 && h < 20) return 'dusk'
  return 'night'
}

type WeatherCondition = 'snow' | 'rain' | 'summer' | 'normal'

interface WeatherData {
  temp: number
  symbol: number
  condition: WeatherCondition
}

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

function getWeatherTheme(condition: WeatherCondition, phase: TimePhase): PhaseTheme {
  const base = THEMES[phase]
  if (condition === 'snow') {
    if (phase === 'day') return { ...base, sky: 'linear-gradient(180deg, #708898 0%, #8aa0b0 25%, #a0b8c8 50%, #c0d0d8 70%, #d8e0e8 85%, #e8f0f0 100%)' }
    if (phase === 'night') return { ...base, groundFog: 'linear-gradient(to top, #c0c8e0aa 0%, #606880 40%, transparent 100%)' }
  }
  if (condition === 'rain') {
    if (phase === 'day') return { ...base, sky: 'linear-gradient(180deg, #506068 0%, #607078 25%, #708088 50%, #909898 70%, #a8b0b0 85%, #8a9890 100%)' }
  }
  if (condition === 'summer' && phase === 'day') {
    return { ...base, sky: 'linear-gradient(180deg, #2878c0 0%, #50a0e0 25%, #70c0f0 50%, #a0d8f8 70%, #d0e8f0 85%, #b0d8b0 100%)' }
  }
  return base
}

/* Seeded PRNG for deterministic placement */
function seeded(seed: number) {
  let s = seed
  return () => { s = (s * 16807 + 0) % 2147483647; return s / 2147483647 }
}

function treePath(h: number, w: number): string {
  const tw = w * 0.12
  const th = h * 0.18
  const crownH = h - th
  let d = ''
  for (let i = 0; i < 3; i++) {
    const layerY = th + crownH * (i / 3) * 0.7
    const layerTop = th + crownH * ((i + 0.3) / 3)
    const layerW = w * (1 - i * 0.2) * 0.5
    d += `M${w / 2},${h - layerTop} L${w / 2 - layerW},${h - layerY} L${w / 2 + layerW},${h - layerY} Z `
  }
  d += `M${w / 2 - tw},${h} L${w / 2 - tw},${h - th} L${w / 2 + tw},${h - th} L${w / 2 + tw},${h} Z`
  return d
}

interface TreeData { x: number; h: number; w: number; delay: number; dur: number; swayClass: number }
interface TreeLayer { trees: TreeData[]; zIndex: number; parallax: number }

/* 6 shared sway keyframes instead of per-tree */
const SWAY_KEYFRAMES = `
@keyframes sw0{0%,100%{transform:rotate(0.3deg)}35%{transform:rotate(2.0deg)}70%{transform:rotate(-0.8deg)}}
@keyframes sw1{0%,100%{transform:rotate(-0.2deg)}35%{transform:rotate(2.5deg)}70%{transform:rotate(-1.0deg)}}
@keyframes sw2{0%,100%{transform:rotate(0.5deg)}35%{transform:rotate(3.0deg)}70%{transform:rotate(-1.2deg)}}
@keyframes sw3{0%,100%{transform:rotate(-0.3deg)}35%{transform:rotate(3.5deg)}70%{transform:rotate(-1.5deg)}}
@keyframes sw4{0%,100%{transform:rotate(0.4deg)}35%{transform:rotate(4.0deg)}70%{transform:rotate(-1.8deg)}}
@keyframes sw5{0%,100%{transform:rotate(-0.1deg)}35%{transform:rotate(5.0deg)}70%{transform:rotate(-2.0deg)}}
@keyframes twinkle{0%,100%{opacity:0.3;transform:scale(1)}50%{opacity:1;transform:scale(1.4)}}
@keyframes sunGlow{0%,100%{opacity:0.7;transform:translate(-50%,-50%) scale(1)}50%{opacity:1;transform:translate(-50%,-50%) scale(1.1)}}
@keyframes fogDrift1{0%,100%{transform:translateX(0)}50%{transform:translateX(5%)}}
@keyframes fogDrift2{0%,100%{transform:translateX(0)}50%{transform:translateX(-4%)}}
@keyframes snowfall{0%{transform:translateY(-10px) translateX(0);opacity:0}10%{opacity:1}90%{opacity:1}100%{transform:translateY(100vh) translateX(var(--drift,0px));opacity:0}}
@keyframes rainfall{0%{transform:translateY(-30px);opacity:0}10%{opacity:1}100%{transform:translateY(100vh);opacity:0.1}}
`

async function fetchSMHI(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const url = `https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point/lon/${lon.toFixed(4)}/lat/${lat.toFixed(4)}/data.json`
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const data = await res.json()
    const now = Date.now()
    let closest = data.timeSeries?.[0]
    let minDiff = Infinity
    for (const ts of data.timeSeries || []) {
      const diff = Math.abs(new Date(ts.validTime).getTime() - now)
      if (diff < minDiff) { minDiff = diff; closest = ts }
    }
    if (!closest) return null
    let temp = 0, symbol = 1
    for (const p of closest.parameters || []) {
      if (p.name === 't') temp = p.values[0]
      if (p.name === 'Wsymb2') symbol = p.values[0]
    }
    return { temp, symbol, condition: deriveCondition(temp, symbol) }
  } catch { return null }
}

function getWeatherIntensity(symbol: number): 'light' | 'moderate' | 'heavy' {
  if ([10, 14, 17, 20, 24, 27].includes(symbol)) return 'heavy'
  if ([9, 13, 16, 19, 23, 26].includes(symbol)) return 'moderate'
  return 'light'
}

export default function ForestBackground() {
  const [phase, setPhase] = useState<TimePhase>('night')
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [mouseX, setMouseX] = useState(0)
  const [mouseY, setMouseY] = useState(0)

  useEffect(() => {
    setPhase(getTimePhase())
    const interval = setInterval(() => setPhase(getTimePhase()), 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let cancelled = false
    const doFetch = (lat: number, lon: number) => {
      fetchSMHI(lat, lon).then(data => { if (!cancelled && data) setWeather(data) })
    }
    const start = (lat: number, lon: number) => {
      doFetch(lat, lon)
      return setInterval(() => doFetch(lat, lon), 30 * 60 * 1000)
    }
    let intervalId: ReturnType<typeof setInterval> | null = null
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => { if (!cancelled) intervalId = start(pos.coords.latitude, pos.coords.longitude) },
        () => { if (!cancelled) intervalId = start(56.65, 15.68) },
        { timeout: 8000 }
      )
    } else {
      intervalId = start(56.65, 15.68)
    }
    return () => { cancelled = true; if (intervalId) clearInterval(intervalId) }
  }, [])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    setMouseX((e.clientX / window.innerWidth - 0.5) * 2)
    setMouseY((e.clientY / window.innerHeight - 0.5) * 2)
  }, [])

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [handleMouseMove])

  const condition = weather?.condition || 'normal'
  const theme = getWeatherTheme(condition, phase)
  const intensity = weather ? getWeatherIntensity(weather.symbol) : 'light'

  // Reduced tree counts: 12+8+6+4 = 30 trees (was 70)
  const layers = useMemo<TreeLayer[]>(() => {
    const rng = seeded(42)
    const mkTrees = (n: number, minH: number, maxH: number, wF: number, wV: number): TreeData[] =>
      Array.from({ length: n }, () => {
        const h = minH + rng() * (maxH - minH)
        return {
          x: rng() * 110 - 5, h, w: h * (wF + rng() * wV),
          delay: rng() * 6, dur: 4 + rng() * 6,
          swayClass: Math.floor(rng() * 6),
        }
      })
    return [
      { zIndex: 1, parallax: 0.2, trees: mkTrees(12, 50, 90, 0.25, 0.1) },
      { zIndex: 2, parallax: 0.5, trees: mkTrees(8, 70, 130, 0.22, 0.1) },
      { zIndex: 3, parallax: 0.7, trees: mkTrees(6, 100, 180, 0.2, 0.1) },
      { zIndex: 4, parallax: 1.0, trees: mkTrees(4, 160, 260, 0.18, 0.08) },
    ]
  }, [])

  // Stars (reduced from 80 to 40)
  const stars = useMemo(() => {
    if (phase !== 'night' || condition === 'snow' || condition === 'rain') return []
    const rng = seeded(99)
    return Array.from({ length: 40 }, () => ({
      x: rng() * 100, y: rng() * 60, size: 1 + rng() * 2,
      opacity: 0.3 + rng() * 0.7, delay: rng() * 5, dur: 2 + rng() * 4,
    }))
  }, [phase, condition])

  // Particles (reduced counts)
  const snowFlakes = useMemo(() => {
    if (condition !== 'snow') return []
    const count = intensity === 'heavy' ? 50 : intensity === 'moderate' ? 30 : 15
    const rng = seeded(777)
    return Array.from({ length: count }, () => ({
      x: rng() * 100, size: 2 + rng() * 4, opacity: 0.3 + rng() * 0.5,
      dur: 6 + rng() * 10, delay: rng() * 10, drift: -15 + rng() * 30,
    }))
  }, [condition, intensity])

  const rainDrops = useMemo(() => {
    if (condition !== 'rain') return []
    const count = intensity === 'heavy' ? 60 : intensity === 'moderate' ? 35 : 20
    const rng = seeded(555)
    return Array.from({ length: count }, () => ({
      x: rng() * 100, len: 10 + rng() * 20, opacity: 0.1 + rng() * 0.25,
      dur: 0.4 + rng() * 0.6, delay: rng() * 2,
    }))
  }, [condition, intensity])

  const isNight = phase === 'night'
  const showSun = (phase === 'dawn' || phase === 'day' || phase === 'dusk') && condition !== 'rain'

  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 0 }}>
      <style>{SWAY_KEYFRAMES}</style>

      {/* Sky */}
      <div style={{ position: 'absolute', inset: 0, background: theme.sky, transition: 'background 2s ease' }} />

      {/* Stars */}
      {stars.map((s, i) => (
        <div key={i} style={{
          position: 'absolute', left: `${s.x}%`, top: `${s.y}%`,
          width: s.size, height: s.size, borderRadius: '50%', background: '#fff',
          animation: `twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
        }} />
      ))}

      {/* Moon */}
      {isNight && condition !== 'snow' && condition !== 'rain' && (
        <div style={{ position: 'absolute', top: '8%', right: '15%', zIndex: 1 }}>
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            width: 120, height: 120, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(200,210,255,0.08) 0%, transparent 70%)',
          }} />
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #f0f0ff 0%, #c8d0e0 50%, #a0a8c0 100%)',
            boxShadow: '0 0 20px rgba(200,210,255,0.3), 0 0 60px rgba(200,210,255,0.1)',
          }} />
        </div>
      )}

      {/* Sun */}
      {showSun && (() => {
        const yPos = phase === 'dawn' ? '45%' : phase === 'dusk' ? '50%' : '10%'
        const xPos = phase === 'dawn' ? '20%' : phase === 'dusk' ? '75%' : '60%'
        const size = phase === 'day' ? 44 : 36
        return (
          <div style={{ position: 'absolute', top: yPos, left: xPos, zIndex: 1 }}>
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
              width: 200, height: 200, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,220,120,0.12) 0%, transparent 70%)',
              animation: 'sunGlow 4s ease-in-out infinite',
            }} />
            <div style={{
              width: size, height: size, borderRadius: '50%',
              background: 'radial-gradient(circle at 40% 40%, #fffbe0 0%, #ffd040 40%, #e0a020 100%)',
              boxShadow: '0 0 30px rgba(255,200,60,0.4), 0 0 80px rgba(255,180,40,0.15)',
            }} />
          </div>
        )
      })()}

      {/* Snow */}
      {snowFlakes.map((f, i) => (
        <div key={`s${i}`} style={{
          position: 'absolute', left: `${f.x}%`, top: -10,
          width: f.size, height: f.size, borderRadius: '50%',
          background: '#fff', opacity: f.opacity,
          animation: `snowfall ${f.dur}s linear ${f.delay}s infinite`,
          ['--drift' as string]: `${f.drift}px`, zIndex: 7,
        }} />
      ))}

      {/* Rain */}
      {rainDrops.map((d, i) => (
        <div key={`r${i}`} style={{
          position: 'absolute', left: `${d.x}%`, top: -30,
          width: 1.5, height: d.len,
          background: `linear-gradient(to bottom, transparent, rgba(180,200,230,${d.opacity}))`,
          animation: `rainfall ${d.dur}s linear ${d.delay}s infinite`, zIndex: 7,
        }} />
      ))}

      {/* Tree layers */}
      {layers.map((layer, li) => {
        const px = mouseX * layer.parallax * 15
        const py = mouseY * layer.parallax * 8
        return (
          <div key={li} style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: '100%',
            zIndex: layer.zIndex, opacity: theme.treeOpacities[li],
            transform: `translate(${px}px, ${py}px)`,
            transition: 'transform 0.3s ease-out, opacity 2s ease',
          }}>
            {layer.trees.map((tree, ti) => (
              <svg key={ti} viewBox={`0 0 ${tree.w} ${tree.h}`} width={tree.w} height={tree.h}
                style={{
                  position: 'absolute', left: `${tree.x}%`, bottom: 0,
                  transformOrigin: 'bottom center',
                  animation: `sw${tree.swayClass} ${tree.dur.toFixed(1)}s ease-in-out ${tree.delay.toFixed(1)}s infinite`,
                  willChange: 'transform',
                }}>
                <path d={treePath(tree.h, tree.w)} fill={theme.treeLayers[li]} />
              </svg>
            ))}
          </div>
        )
      })}

      {/* Snow ground */}
      {condition === 'snow' && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: 80, zIndex: 6,
          background: 'linear-gradient(to top, rgba(220,225,240,0.25) 0%, rgba(220,225,240,0.1) 50%, transparent 100%)',
        }} />
      )}

      {/* Fog */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%', zIndex: 5, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', left: '-20%', right: '-20%', bottom: 0, height: '100%',
          background: 'linear-gradient(to top, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 40%, transparent 100%)',
          animation: 'fogDrift1 25s ease-in-out infinite',
        }} />
        <div style={{
          position: 'absolute', left: '-10%', right: '-30%', bottom: 0, height: '80%',
          background: 'linear-gradient(to top, rgba(255,255,255,0.04) 0%, transparent 100%)',
          animation: 'fogDrift2 35s ease-in-out infinite',
        }} />
      </div>

      {/* Ground */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 140, zIndex: 6,
        background: theme.groundFog, transition: 'background 2s ease',
      }} />

      {/* Temperature */}
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
  )
}
