-- EntityDex ⇄ DBD Companion – Datenbank einrichten (einmal im Supabase "SQL Editor" ausführen).
-- von FGSeRaser – https://github.com/FGSeRaser

create table if not exists public.challenges (
  id          text        not null,
  user_id     uuid        not null default auth.uid() references auth.users on delete cascade,
  daten       jsonb       not null default '{}'::jsonb,
  geaendert   timestamptz not null default now(),
  geloescht   boolean     not null default false,
  primary key (user_id, id)
);

-- Zeitstempel kommt immer vom Server (Handy- und PC-Uhr müssen nicht stimmen)
create or replace function public.setze_geaendert() returns trigger language plpgsql as $$
begin new.geaendert = now(); return new; end $$;
drop trigger if exists challenges_geaendert on public.challenges;
create trigger challenges_geaendert before insert or update on public.challenges
  for each row execute function public.setze_geaendert();

-- Jeder sieht und ändert nur seine eigenen Challenges
alter table public.challenges enable row level security;
drop policy if exists "eigene lesen" on public.challenges;
drop policy if exists "eigene anlegen" on public.challenges;
drop policy if exists "eigene aendern" on public.challenges;
drop policy if exists "eigene loeschen" on public.challenges;
create policy "eigene lesen"    on public.challenges for select using (auth.uid() = user_id);
create policy "eigene anlegen"  on public.challenges for insert with check (auth.uid() = user_id);
create policy "eigene aendern"  on public.challenges for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "eigene loeschen" on public.challenges for delete using (auth.uid() = user_id);

-- Live-Updates (Handy legt an → PC sieht es sofort)
do $$ begin
  alter publication supabase_realtime add table public.challenges;
exception when duplicate_object then null; end $$;
