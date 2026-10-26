'use client';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { vapidPublikSomBytes } from '@/lib/push/vapid';
import { ENHET_MASKIN_ANDRAD, hamtaEnhetMaskin } from '@/lib/enhetMaskin';

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
          let permission = Notification.permission;
          if (permission === 'default') {
            // Maskindator: frågan ställs av kortet "Tillåt notiser" (ett riktigt tryck, en gång) – inte här utan tryck. Kortet säger till (hytt-notiser-andrad) när svaret kommit.
            if (hamtaEnhetMaskin()) return;
            permission = await Notification.requestPermission();
          }
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
            // Maskindator: prenumerationen hör till MASKINEN (hyttnotiser går dit oavsett vem som är inloggad). Förarens telefon har ingen maskin → null.
            maskin_id: hamtaEnhetMaskin(),
          }),
        });
      } catch (e) {
        console.error('Push registration failed:', e);
      }
    };

    // Delay to not block initial render
    const t = setTimeout(register, 3000);
    // En enhet som görs till maskin (eller släpps) anmäler sig direkt på nytt, så maskinen står rätt utan att appen laddas om.
    const omMaskinAndrad = () => { void register(); };
    window.addEventListener(ENHET_MASKIN_ANDRAD, omMaskinAndrad);
    window.addEventListener('hytt-notiser-andrad', omMaskinAndrad);   // tillståndet just givet i kortet eller i Inställningar → anmäl prenumerationen nu
    return () => { clearTimeout(t); window.removeEventListener(ENHET_MASKIN_ANDRAD, omMaskinAndrad); window.removeEventListener('hytt-notiser-andrad', omMaskinAndrad); };
  }, []);

  return null;
}
