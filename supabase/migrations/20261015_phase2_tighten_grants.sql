-- Applied to project ksaluzkbeejrlmihqksq as "phase2_tighten_grants" (the ask_log / fx_rates tables came from "phase2_ask_log_fx_rates").
-- TRUNCATE / REFERENCES / TRIGGER are not governed by RLS; remove them from client roles on every public table.
revoke truncate, references, trigger on public.trips, public.members, public.items, public.ask_log, public.fx_rates from anon, authenticated;
-- ask_log: server only.
revoke all on public.ask_log from anon, authenticated;
-- fx_rates: members can read (policy fx_rates_select_member); writes only via service role.
revoke all on public.fx_rates from anon, authenticated;
grant select on public.fx_rates to authenticated;
