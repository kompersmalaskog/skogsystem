'use client';

import { useParams } from 'next/navigation';
import ServiceVy from '@/components/servicelogg/ServiceVy';

export default function MaskinServiceMaskinPage() {
  const params = useParams();
  return <ServiceVy valdId={params.id as string} />;
}
