'use client'

// Vilken sheet/panel som är öppen, för hela /helikopter. På iPad och stor skärm visas flera flikar samtidigt, och då får
// ändå bara EN panel vara öppen: tillståndet bor i skalet, flikarna läser och sätter det via den här hooken.
// Samma form som useState: [val, setVal].
import { createContext, useCallback, useContext } from 'react'

export type PanelPost = { agare: string; val: string } | null
export type PanelStyrning = { panel: PanelPost; satt: (p: PanelPost) => void }

export const PanelContext = createContext<PanelStyrning>({ panel: null, satt: () => {} })

export function usePanelVal<T extends string>(agare: string): [T | null, (v: T | null) => void] {
  const { panel, satt } = useContext(PanelContext)
  const val = panel && panel.agare === agare ? (panel.val as T) : null
  const sattVal = useCallback((v: T | null) => satt(v == null ? null : { agare, val: v }), [satt, agare])
  return [val, sattVal]
}
