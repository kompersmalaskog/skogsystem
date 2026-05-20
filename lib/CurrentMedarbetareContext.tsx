'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type CurrentMedarbetare = {
  id: string;
  namn: string;
  roll: 'forare' | 'chef' | 'admin';
  maskin_id: string | null;
  partner_user_id: string | null;
};

type CurrentMedarbetareCtx = {
  medarbetare: CurrentMedarbetare | null;
  loading: boolean;
};

const Ctx = createContext<CurrentMedarbetareCtx>({ medarbetare: null, loading: true });

export function CurrentMedarbetareProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CurrentMedarbetareCtx>({ medarbetare: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user?.id) {
        // Middleware borde ha redirectat innan denna komponent renderar,
        // men hantera defensivt: medarbetare = null → komponenter får visa felmeddelande.
        setState({ medarbetare: null, loading: false });
        return;
      }
      const { data } = await supabase
        .from('medarbetare')
        .select('id, namn, roll, maskin_id, partner_user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled) return;
      setState({ medarbetare: (data as CurrentMedarbetare | null) ?? null, loading: false });
    })();
    return () => { cancelled = true; };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export function useCurrentMedarbetare(): CurrentMedarbetareCtx {
  return useContext(Ctx);
}
