import dynamic from 'next/dynamic'

const LastbilClient = dynamic(() => import('./LastbilClient'), { ssr: false })

export default function LastbilPage() {
  return <LastbilClient />
}
