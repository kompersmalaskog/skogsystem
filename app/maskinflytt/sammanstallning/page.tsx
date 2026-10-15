import { redirect } from 'next/navigation'

// Flyttloggen är ersatt av Lastbilen (omtaget 2026-10, steg 4): rundorna ligger under Körningar och
// kvittot under Fakturering. Gamla länkar och bokmärken hamnar där, inte på en 404.
export default function SammanstallningPage() {
  redirect('/lastbil?flik=korningar')
}
