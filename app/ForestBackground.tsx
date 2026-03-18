'use client'

import { useRef, useEffect } from 'react'

type Phase = 'dawn' | 'day' | 'dusk' | 'night'
type Season = 'winter' | 'spring' | 'summer' | 'autumn'

function getPhase(): Phase {
  const h = parseInt(new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', hour: '2-digit', hour12: false }))
  if (h >= 5 && h < 8) return 'dawn'
  if (h >= 8 && h < 18) return 'day'
  if (h >= 18 && h < 20) return 'dusk'
  return 'night'
}

function getSeason(): Season {
  const m = new Date().getMonth()
  if (m >= 2 && m <= 4) return 'spring'
  if (m >= 5 && m <= 7) return 'summer'
  if (m >= 8 && m <= 10) return 'autumn'
  return 'winter'
}

/* Seeded PRNG */
function rng(seed: number) {
  let s = seed
  return () => { s = (s * 16807) % 2147483647; return s / 2147483647 }
}

interface Tree { x: number; h: number; w: number; layer: number; phase: number; speed: number; amp: number }
interface Star { x: number; y: number; r: number; phase: number; speed: number }
interface Meteor { x: number; y: number; angle: number; speed: number; life: number; maxLife: number }

const SKY: Record<Phase, [string, string, string]> = {
  dawn: ['#1a1035', '#c05050', '#f0c878'],
  day: ['#4a90d0', '#88c4f0', '#c0d8c0'],
  dusk: ['#1a1040', '#802050', '#806040'],
  night: ['#050510', '#0e1030', '#0a1020'],
}

const TREE_COLORS: Record<Season, [string, string, string]> = {
  winter: ['#0c1418', '#101c22', '#18282e'],
  spring: ['#0c1f0c', '#143214', '#1c441c'],
  summer: ['#0a2a0a', '#123a12', '#1a501a'],
  autumn: ['#1a1808', '#28220c', '#3a2e10'],
}

const GROUND_COLORS: Record<Season, string> = {
  winter: 'rgba(200,210,230,0.15)',
  spring: 'rgba(60,120,40,0.12)',
  summer: 'rgba(30,80,20,0.15)',
  autumn: 'rgba(120,80,20,0.12)',
}

export default function ForestBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let phase = getPhase()
    let season = getSeason()

    /* Resize */
    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      canvas.style.width = window.innerWidth + 'px'
      canvas.style.height = window.innerHeight + 'px'
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    /* Generate trees: 12 + 10 + 8 = 30 */
    const r = rng(42)
    const trees: Tree[] = []
    const counts = [12, 10, 8]
    for (let layer = 0; layer < 3; layer++) {
      for (let i = 0; i < counts[layer]; i++) {
        const baseH = [60, 100, 160][layer]
        const varH = [40, 60, 100][layer]
        const h = baseH + r() * varH
        trees.push({
          x: r() * 1.1 - 0.05,
          h, w: h * (0.18 + r() * 0.1),
          layer,
          phase: r() * Math.PI * 2,
          speed: 0.3 + r() * 0.5,
          amp: (1.5 + layer * 1.5 + r() * 2) * (Math.PI / 180),
        })
      }
    }

    /* Stars (40) */
    const stars: Star[] = []
    for (let i = 0; i < 40; i++) {
      stars.push({ x: r(), y: r() * 0.55, r: 0.5 + r() * 1.5, phase: r() * Math.PI * 2, speed: 0.5 + r() * 1 })
    }

    /* Meteors */
    let meteors: Meteor[] = []
    let nextMeteor = 5000 + r() * 15000

    /* Draw tree shape on canvas */
    function drawTree(cx: number, baseY: number, w: number, h: number, color: string, angle: number) {
      ctx!.save()
      ctx!.translate(cx, baseY)
      ctx!.rotate(angle)
      const tw = w * 0.12
      const th = h * 0.18
      const crownH = h - th

      ctx!.fillStyle = color
      // Trunk
      ctx!.fillRect(-tw, -th, tw * 2, th)
      // Crown layers
      for (let i = 0; i < 3; i++) {
        const layerY = th + crownH * (i / 3) * 0.7
        const layerTop = th + crownH * ((i + 0.3) / 3)
        const layerW = w * (1 - i * 0.2) * 0.5
        ctx!.beginPath()
        ctx!.moveTo(0, -layerTop)
        ctx!.lineTo(-layerW, -layerY)
        ctx!.lineTo(layerW, -layerY)
        ctx!.closePath()
        ctx!.fill()
      }
      ctx!.restore()
    }

    /* Draw sky gradient */
    function drawSky(w: number, h: number) {
      const colors = SKY[phase]
      const grad = ctx!.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, colors[0])
      grad.addColorStop(0.5, colors[1])
      grad.addColorStop(1, colors[2])
      ctx!.fillStyle = grad
      ctx!.fillRect(0, 0, w, h)
    }

    /* Draw sun or moon */
    function drawCelestial(w: number, h: number) {
      if (phase === 'night') {
        // Moon
        const mx = w * 0.82, my = h * 0.1
        // Glow
        const glow = ctx!.createRadialGradient(mx, my, 0, mx, my, 60)
        glow.addColorStop(0, 'rgba(200,210,255,0.08)')
        glow.addColorStop(1, 'transparent')
        ctx!.fillStyle = glow
        ctx!.fillRect(mx - 60, my - 60, 120, 120)
        // Disc
        const disc = ctx!.createRadialGradient(mx - 4, my - 4, 0, mx, my, 18)
        disc.addColorStop(0, '#f0f0ff')
        disc.addColorStop(0.5, '#c8d0e0')
        disc.addColorStop(1, '#a0a8c0')
        ctx!.beginPath()
        ctx!.arc(mx, my, 18, 0, Math.PI * 2)
        ctx!.fillStyle = disc
        ctx!.fill()
      } else {
        // Sun
        const sx = phase === 'dawn' ? w * 0.2 : phase === 'dusk' ? w * 0.75 : w * 0.6
        const sy = phase === 'day' ? h * 0.1 : h * 0.45
        const size = phase === 'day' ? 22 : 18
        // Glow
        const glow = ctx!.createRadialGradient(sx, sy, 0, sx, sy, 100)
        glow.addColorStop(0, 'rgba(255,220,120,0.12)')
        glow.addColorStop(1, 'transparent')
        ctx!.fillStyle = glow
        ctx!.fillRect(sx - 100, sy - 100, 200, 200)
        // Disc
        const disc = ctx!.createRadialGradient(sx - 3, sy - 3, 0, sx, sy, size)
        disc.addColorStop(0, '#fffbe0')
        disc.addColorStop(0.4, '#ffd040')
        disc.addColorStop(1, '#e0a020')
        ctx!.beginPath()
        ctx!.arc(sx, sy, size, 0, Math.PI * 2)
        ctx!.fillStyle = disc
        ctx!.fill()
      }
    }

    /* Draw stars */
    function drawStars(w: number, _h: number, t: number) {
      if (phase !== 'night') return
      for (const s of stars) {
        const alpha = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase))
        ctx!.globalAlpha = alpha
        ctx!.fillStyle = '#fff'
        ctx!.beginPath()
        ctx!.arc(s.x * w, s.y * _h, s.r, 0, Math.PI * 2)
        ctx!.fill()
      }
      ctx!.globalAlpha = 1
    }

    /* Draw & update meteors */
    function drawMeteors(w: number, h: number, dt: number) {
      if (phase !== 'night') { meteors = []; return }

      nextMeteor -= dt * 1000
      if (nextMeteor <= 0 && meteors.length < 2) {
        meteors.push({
          x: 0.1 + Math.random() * 0.6,
          y: 0.05 + Math.random() * 0.25,
          angle: (20 + Math.random() * 30) * Math.PI / 180,
          speed: 300 + Math.random() * 200,
          life: 0,
          maxLife: 0.6 + Math.random() * 0.6,
        })
        nextMeteor = 20000 + Math.random() * 40000
      }

      meteors = meteors.filter(m => m.life < m.maxLife)
      for (const m of meteors) {
        m.life += dt
        const progress = m.life / m.maxLife
        const px = m.x * w + Math.cos(m.angle) * m.speed * m.life
        const py = m.y * h + Math.sin(m.angle) * m.speed * m.life
        const alpha = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8
        const len = 60

        ctx!.save()
        ctx!.translate(px, py)
        ctx!.rotate(m.angle)
        const grad = ctx!.createLinearGradient(0, 0, -len, 0)
        grad.addColorStop(0, `rgba(255,255,255,${alpha * 0.9})`)
        grad.addColorStop(1, 'transparent')
        ctx!.strokeStyle = grad
        ctx!.lineWidth = 1.5
        ctx!.beginPath()
        ctx!.moveTo(0, 0)
        ctx!.lineTo(-len, 0)
        ctx!.stroke()
        ctx!.restore()
      }
    }

    /* Draw fog */
    function drawFog(w: number, h: number, t: number) {
      const shift1 = Math.sin(t * 0.04) * w * 0.03
      const shift2 = Math.sin(t * 0.025 + 1) * w * 0.02

      const fog1 = ctx!.createLinearGradient(0, h, 0, h * 0.7)
      fog1.addColorStop(0, 'rgba(255,255,255,0.06)')
      fog1.addColorStop(0.5, 'rgba(255,255,255,0.02)')
      fog1.addColorStop(1, 'transparent')
      ctx!.fillStyle = fog1
      ctx!.fillRect(-w * 0.1 + shift1, h * 0.7, w * 1.2, h * 0.3)

      const fog2 = ctx!.createLinearGradient(0, h, 0, h * 0.75)
      fog2.addColorStop(0, 'rgba(255,255,255,0.04)')
      fog2.addColorStop(1, 'transparent')
      ctx!.fillStyle = fog2
      ctx!.fillRect(-w * 0.05 + shift2, h * 0.75, w * 1.15, h * 0.25)
    }

    /* Draw snow on ground (winter) */
    function drawSeasonalGround(w: number, h: number) {
      const grad = ctx!.createLinearGradient(0, h, 0, h - 80)
      grad.addColorStop(0, GROUND_COLORS[season])
      grad.addColorStop(1, 'transparent')
      ctx!.fillStyle = grad
      ctx!.fillRect(0, h - 80, w, 80)
    }

    /* Main loop */
    let lastTime = 0
    function frame(timestamp: number) {
      const dt = lastTime ? (timestamp - lastTime) / 1000 : 0.016
      lastTime = timestamp
      const t = timestamp / 1000
      const w = window.innerWidth
      const h = window.innerHeight

      ctx!.clearRect(0, 0, w, h)

      drawSky(w, h)
      drawCelestial(w, h)
      drawStars(w, h, t)
      drawMeteors(w, h, dt)

      // Trees by layer (back to front)
      const treeColors = TREE_COLORS[season]
      for (let layer = 0; layer < 3; layer++) {
        const opacity = [0.4, 0.5, 0.6][layer]
        ctx!.globalAlpha = opacity
        for (const tree of trees) {
          if (tree.layer !== layer) continue
          const angle = Math.sin(t * tree.speed + tree.phase) * tree.amp
          const tx = tree.x * w
          const ty = h
          drawTree(tx, ty, tree.w, tree.h, treeColors[layer], angle)
        }
      }
      ctx!.globalAlpha = 1

      drawFog(w, h, t)
      drawSeasonalGround(w, h)

      raf = requestAnimationFrame(frame)
    }

    raf = requestAnimationFrame(frame)

    // Update phase/season every minute
    const interval = setInterval(() => {
      phase = getPhase()
      season = getSeason()
    }, 60000)

    return () => {
      cancelAnimationFrame(raf)
      clearInterval(interval)
      window.removeEventListener('resize', resize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 0,
      }}
    />
  )
}
