'use client';

// Historiken bor nu på maskinsidan ("Visa alla N poster" fäller ut den på plats). Gamla länkar leder dit.
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function HistorikPage() {
  const params = useParams();
  const router = useRouter();
  useEffect(() => { router.replace(`/maskin-service/${params.id as string}`); }, [params.id, router]);
  return null;
}
