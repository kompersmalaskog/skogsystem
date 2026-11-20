'use client';
import { useParams } from 'next/navigation';
import Trakt from '@/components/gallring/Trakt';

// /gallring/<vo>: en trakt. Listan bredvid (bred skärm) ritas av ramen i app/gallring/layout.tsx.
export default function GallringTraktPage() {
  const params = useParams<{ vo: string }>();
  const vo = decodeURIComponent(String(params?.vo ?? ''));
  return <Trakt key={vo} vo={vo} />;
}
