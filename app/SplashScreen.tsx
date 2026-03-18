'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Färgerna i trädet: grön, röd, gul, blå — tänds en i taget
const GLOW_COLORS = [
  'rgba(0, 160, 0, 0.9)',     // grön
  'rgba(220, 0, 0, 0.8)',     // röd
  'rgba(240, 220, 0, 0.8)',   // gul
  'rgba(80, 50, 180, 0.8)',   // blå
]

export default function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [glowIndex, setGlowIndex] = useState(-1)
  const [showText, setShowText] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    // Sekvens: vänta 0.3s, tänds grön, sen röd, gul, blå med 0.3s delay
    const timers: ReturnType<typeof setTimeout>[] = []

    timers.push(setTimeout(() => setGlowIndex(0), 300))
    timers.push(setTimeout(() => setGlowIndex(1), 600))
    timers.push(setTimeout(() => setGlowIndex(2), 900))
    timers.push(setTimeout(() => setGlowIndex(3), 1200))
    timers.push(setTimeout(() => setShowText(true), 1500))
    timers.push(setTimeout(() => setFadeOut(true), 2200))
    timers.push(setTimeout(() => onComplete(), 2700))

    return () => timers.forEach(clearTimeout)
  }, [onComplete])

  // Bygg drop-shadow-sträng baserat på hur många färger som tänts
  const glowFilter = GLOW_COLORS
    .slice(0, glowIndex + 1)
    .map(c => `drop-shadow(0 0 14px ${c})`)
    .join(' ')

  return (
    <AnimatePresence>
      {!fadeOut ? (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: 'easeInOut' }}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 9999,
            background: '#000',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24,
          }}
        >
          <motion.img
            src="/icon.png"
            alt="Kompersmåla Skog"
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: 1,
              opacity: 1,
              filter: glowIndex >= 0 ? glowFilter : 'none',
            }}
            transition={{
              scale: { type: 'spring', stiffness: 180, damping: 14, mass: 1 },
              opacity: { duration: 0.3 },
              filter: { duration: 0.4, ease: 'easeOut' },
            }}
            style={{
              width: 160,
              height: 160,
            }}
          />

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={showText ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: '#fff',
              letterSpacing: -0.5,
              textShadow: '0 2px 20px rgba(34,197,94,0.3)',
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
