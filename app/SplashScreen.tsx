'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const GLOW_COLORS = [
  'rgba(0, 180, 0, 0.9)',
  'rgba(220, 0, 0, 0.85)',
  'rgba(250, 220, 0, 0.9)',
  'rgba(50, 80, 220, 0.85)',
]

// Ljusstrålar i 16 riktningar
const RAY_COUNT = 16
function generateRays() {
  return Array.from({ length: RAY_COUNT }, (_, i) => {
    const angle = (i / RAY_COUNT) * 360
    const rad = (angle * Math.PI) / 180
    const length = 80 + Math.random() * 120
    return {
      id: i,
      angle,
      dx: Math.cos(rad) * length,
      dy: Math.sin(rad) * length,
      width: 1.5 + Math.random() * 2,
      color: GLOW_COLORS[i % 4],
    }
  })
}

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [glowIndex, setGlowIndex] = useState(-1)
  const [showText, setShowText] = useState(false)
  const [showRays, setShowRays] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)
  const [rays] = useState(generateRays)
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const timers = [
      setTimeout(() => setGlowIndex(0), 300),
      setTimeout(() => setGlowIndex(1), 600),
      setTimeout(() => setGlowIndex(2), 900),
      setTimeout(() => { setGlowIndex(3); setShowRays(true) }, 1200),
      setTimeout(() => setShowRays(false), 1700),
      setTimeout(() => setShowText(true), 1500),
      setTimeout(() => setFadeOut(true), 2600),
      setTimeout(() => onCompleteRef.current(), 3200),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  const combinedFilter = GLOW_COLORS
    .slice(0, glowIndex + 1)
    .map(c => `drop-shadow(0 0 16px ${c})`)
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
          {/* Ljusstrålar */}
          <div style={{
            position: 'absolute',
            top: '50%', left: '50%',
            transform: 'translate(-50%, -55%)',
            width: 0, height: 0,
            zIndex: 1,
          }}>
            {rays.map((ray) => (
              <motion.div
                key={ray.id}
                initial={{ opacity: 0, scaleX: 0 }}
                animate={showRays
                  ? { opacity: [0, 0.9, 0], scaleX: [0, 1, 1.2], scaleY: [1, 1, 0.5] }
                  : { opacity: 0, scaleX: 0 }
                }
                transition={{ duration: 0.5, ease: 'easeOut' }}
                style={{
                  position: 'absolute',
                  left: 0, top: 0,
                  width: Math.sqrt(ray.dx * ray.dx + ray.dy * ray.dy),
                  height: ray.width,
                  background: `linear-gradient(90deg, ${ray.color}, transparent)`,
                  borderRadius: ray.width,
                  transformOrigin: '0% 50%',
                  transform: `rotate(${ray.angle}deg)`,
                  boxShadow: `0 0 8px ${ray.color}`,
                }}
              />
            ))}
          </div>

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

          {/* Text */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={showText ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
            transition={{ duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] }}
            style={{
              marginTop: 28,
              zIndex: 2,
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
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
