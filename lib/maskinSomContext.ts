'use client';

// Bär ?som=<maskin_id> från /maskin-routen in i PlannerPage utan att ändra dess signatur (PlannerPage är
// default-export för /planering och får inga egna props). null = vanliga appen (/planering).
import { createContext } from 'react';

export const MaskinSomContext = createContext<string | null>(null);
