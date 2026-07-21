import dynamic from 'next/dynamic'

const PlatserClient = dynamic(() => import('./PlatserClient'), { ssr: false })

export default function PlatserPage() {
  return <PlatserClient />
}
