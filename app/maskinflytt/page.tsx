import dynamic from 'next/dynamic'

const MaskinflyttClient = dynamic(() => import('./MaskinflyttClient'), { ssr: false })

export default function MaskinflyttPage() {
  return <MaskinflyttClient />
}
