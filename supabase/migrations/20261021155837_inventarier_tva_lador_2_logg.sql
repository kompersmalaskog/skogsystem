-- Inventarier, två lådor (2/4): loggen får händelserna reserv_oppnad och reserv_angrad.
alter table public.inventarie_logg drop constraint inventarie_logg_handelse_check;
alter table public.inventarie_logg add constraint inventarie_logg_handelse_check
  check (handelse in ('uttag','pafyllning','justering','flytt','bestalld','kommit_in','skapad','borttagen','kollad','reserv_oppnad','reserv_angrad'));
