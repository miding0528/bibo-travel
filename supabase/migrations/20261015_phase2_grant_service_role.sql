-- Applied as "phase2_grant_service_role". Edge Functions use the service role; it bypasses RLS but still needs GRANTs.
grant select, insert, update, delete on public.ask_log, public.fx_rates, public.members, public.trips, public.items to service_role;
grant usage, select on all sequences in schema public to service_role;
