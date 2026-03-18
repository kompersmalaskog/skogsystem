'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const GLOW_SEQUENCE = [
  { color: 'rgba(0, 180, 0, 0.9)', shadow: '0 0 20px rgba(0,180,0,0.8), 0 0 40px rgba(0,180,0,0.4)' },
  { color: 'rgba(220, 0, 0, 0.85)', shadow: '0 0 20px rgba(220,0,0,0.7), 0 0 40px rgba(220,0,0,0.35)' },
  { color: 'rgba(250, 220, 0, 0.9)', shadow: '0 0 20px rgba(250,220,0,0.7), 0 0 40px rgba(250,220,0,0.35)' },
  { color: 'rgba(50, 80, 220, 0.85)', shadow: '0 0 20px rgba(50,80,220,0.7), 0 0 40px rgba(50,80,220,0.35)' },
]

const PARTICLE_COLORS = ['#22c55e', '#ef4444', '#eab308', '#3b82f6']

interface Particle {
  id: number
  x: number
  y: number
  color: string
  size: number
  duration: number
  delay: number
  drift: number
}

function generateParticles(count: number): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    particles.push({
      id: i,
      x: 35 + Math.random() * 30, // centered around the tree (35-65% of width)
      y: 50 + Math.random() * 15,  // start from middle area
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
      size: 2 + Math.random() * 4,
      duration: 1.5 + Math.random() * 2,
      delay: 0.8 + Math.random() * 1.5, // start after logo appears
      drift: -15 + Math.random() * 30,
    })
  }
  return particles
}

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [glowIndex, setGlowIndex] = useState(-1)
  const [showText, setShowText] = useState(false)
  const [showSince, setShowSince] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)
  const [particles] = useState(() => generateParticles(24))
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const timers = [
      setTimeout(() => setGlowIndex(0), 300),
      setTimeout(() => setGlowIndex(1), 600),
      setTimeout(() => setGlowIndex(2), 900),
      setTimeout(() => setGlowIndex(3), 1200),
      setTimeout(() => setShowText(true), 1500),
      setTimeout(() => setShowSince(true), 1800),
      setTimeout(() => setFadeOut(true), 2600),
      setTimeout(() => onCompleteRef.current(), 3200),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  const glowFilter = GLOW_SEQUENCE
    .slice(0, glowIndex + 1)
    .map(g => `drop-shadow(${g.shadow.split(',')[0].replace('0 0', '0 0')})`)
    .join(' ')

  const combinedFilter = GLOW_SEQUENCE
    .slice(0, glowIndex + 1)
    .map(g => `drop-shadow(0 0 16px ${g.color})`)
    .join(' ')

  return (
    <AnimatePresence>
      {!fadeOut ? (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 9999,
            background: '#000',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {/* Partiklar */}
          {particles.map((p) => (
            <motion.div
              key={p.id}
              initial={{
                opacity: 0,
                x: `${p.x}vw`,
                y: `${p.y}vh`,
                scale: 0,
              }}
              animate={{
                opacity: [0, 0.8, 0.6, 0],
                y: `${p.y - 30 - Math.random() * 20}vh`,
                x: `${p.x + p.drift / 5}vw`,
                scale: [0, 1.2, 0.8, 0],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: 'easeOut',
              }}
              style={{
                position: 'absolute',
                width: p.size,
                height: p.size,
                borderRadius: '50%',
                background: p.color,
                boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
                pointerEvents: 'none',
              }}
            />
          ))}

          {/* Logga */}
          <motion.img
            src="/icon.png"
            alt="Kompersmåla Skog"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              filter: glowIndex >= 0 ? combinedFilter : 'brightness(0.3)',
            }}
            transition={{
              scale: { type: 'spring', stiffness: 160, damping: 12, mass: 1.2 },
              opacity: { duration: 0.4 },
              filter: { duration: 0.5, ease: 'easeOut' },
            }}
            style={{
              width: 180,
              height: 180,
              zIndex: 2,
            }}
          />

          {/* Text container */}
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 6, marginTop: 28, zIndex: 2,
          }}>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={showText ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: '#fff',
                letterSpacing: -0.5,
                textShadow: '0 0 30px rgba(34,197,94,0.25), 0 2px 10px rgba(0,0,0,0.5)',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
              }}
            >
              Kompersmåla Skog
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={showSince ? { opacity: 0.5, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
              style={{
                fontSize: 14,
                fontWeight: 400,
                color: '#fff',
                letterSpacing: 3,
                textTransform: 'uppercase',
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif",
              }}
            >
              Since 1980
            </motion.div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
