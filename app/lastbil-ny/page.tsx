import dynamic from 'next/dynamic'

// Dold prototyp-rutt: Lastbilen som EN karta-först-hubb (Mellanvägen).
// Ersätter inte /lastbil förrän Martin klickat igenom och sagt go.
const LastbilNyClient = dynamic(() => import('./LastbilNyClient'), { ssr: false })

export default function LastbilNyPage() {
  return <LastbilNyClient />
}
