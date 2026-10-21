'use client'
import { useEffect, useState } from 'react'

/** Aktuell tid i ms som tickar varje minut — så "för X min sedan" inte står still medan sidan är öppen. */
export function useMinutklocka(): number {
  const [nu, setNu] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNu(Date.now()), 60000)
    return () => window.clearInterval(id)
  }, [])
  return nu
}
