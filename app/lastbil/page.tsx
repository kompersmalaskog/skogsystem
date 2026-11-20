import dynamic from 'next/dynamic'

const LastbilVy = dynamic(() => import('./LastbilVy'), { ssr: false })

export default function LastbilPage() {
  return <LastbilVy />
}
