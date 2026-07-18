import dynamic from 'next/dynamic'

const SammanstallningClient = dynamic(() => import('./SammanstallningClient'), { ssr: false })

export default function SammanstallningPage() {
  return <SammanstallningClient />
}
