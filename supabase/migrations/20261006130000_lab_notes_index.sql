-- LAB read path: trade_lab_read fetches the notes of each listed observation (up to 5000), so the
-- foreign key needs an index. Additive only.
create index if not exists trade_setup_notes_observation on public.trade_setup_notes(observation_id, id);
