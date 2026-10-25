'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { vapidPublikSomBytes } from '@/lib/push/vapid';

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
            applicationServerKey: vapidPublikSomBytes(),
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
