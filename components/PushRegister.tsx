'use client';
import { useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const VAPID_PUBLIC_KEY = 'BGe21_FkdZWkOiaLTWE2GXADsaA08uC2eRGglHIyJ85rL35YkrkUY1L3jTJ7fGvAQlDRjJsH3AMMeX62B63hr34';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function deviceName(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent || '';
  const platform = (navigator as any).userAgentData?.platform || navigator.platform || '';
  return `${platform} · ${ua}`.slice(0, 120);
}

export default function PushRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        // Återanvänd existerande prenumeration om den finns, annars skapa ny
        let subscription = await reg.pushManager.getSubscription();
        if (!subscription) {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;
          subscription = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
        }

        // Koppla till inloggad medarbetare
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;
        const { data: med } = await supabase
          .from('medarbetare')
          .select('id')
          .eq('epost', user.email)
          .single();
        if (!med) return;

        // Upsert i push_subscriptions via server-route (unik på endpoint)
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            medarbetare_id: med.id,
            subscription: subscription.toJSON(),
            device_name: deviceName(),
          }),
        });
      } catch (e) {
        console.error('Push registration failed:', e);
      }
    };

    // Delay to not block initial render
    setTimeout(register, 3000);
  }, []);

  return null;
}
