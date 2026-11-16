-- =========================================================
-- Minhas Leituras — banco de dados (Supabase / Postgres)
-- Rode este arquivo inteiro em: Supabase → SQL Editor → New query → Run
-- Cada pessoa só enxerga e altera os próprios dados (Row Level Security).
-- =========================================================

-- Perfil: nome, metas anuais e tema
create table if not exists public.perfis (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  nome        text,
  metas       jsonb not null default '{}'::jsonb,   -- { "2026": 24, ... }
  tema        text check (tema in ('light', 'dark')),
  atualizado_em timestamptz not null default now()
);

-- Livros da estante
create table if not exists public.livros (
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id        text not null,
  titulo    text not null,
  autor     text,
  genero    text,
  paginas   integer check (paginas is null or paginas > 0),
  capa      text,          -- URL ou imagem reduzida (data URL)
  cor       text,          -- cor da lombada
  serie     text,          -- ex.: Jogos Vorazes
  serie_volume numeric(5,1),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, id)
);

-- Leituras: cada leitura/releitura é uma linha nova (avaliações antigas nunca são sobrescritas)
create table if not exists public.leituras (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           text not null,
  livro_id     text not null,
  inicio       date,
  fim          date,                       -- vazio = lendo agora
  pagina_atual integer not null default 0,
  estrelas     numeric(2,1) not null default 0 check (estrelas between 0 and 5),
  criterios    jsonb not null default '{}'::jsonb,  -- { "tensao": 4.5, "final": 5, ... }
  personagem   text,
  citacao      text,
  notas        text,
  recomenda    boolean,
  inicio_precisao text not null default 'dia' check (inicio_precisao in ('dia', 'mes', 'ano')),
  fim_precisao    text not null default 'dia' check (fim_precisao in ('dia', 'mes', 'ano')),
  atualizado_em timestamptz not null default now(),
  primary key (user_id, id),
  foreign key (user_id, livro_id) references public.livros (user_id, id) on delete cascade,
  check (fim is null or inicio is null or fim >= inicio)
);

-- (para bancos criados antes) datas só com mês ou só com ano
alter table public.leituras add column if not exists inicio_precisao text not null default 'dia' check (inicio_precisao in ('dia', 'mes', 'ano'));
alter table public.leituras add column if not exists fim_precisao    text not null default 'dia' check (fim_precisao in ('dia', 'mes', 'ano'));

create index if not exists leituras_livro_idx on public.leituras (user_id, livro_id);
create index if not exists leituras_fim_idx on public.leituras (user_id, fim);

-- atualizado_em automático
create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql as $$ begin new.atualizado_em = now(); return new; end $$;

drop trigger if exists perfis_atualizado on public.perfis;
create trigger perfis_atualizado before update on public.perfis for each row execute function public.tocar_atualizado_em();
drop trigger if exists livros_atualizado on public.livros;
create trigger livros_atualizado before update on public.livros for each row execute function public.tocar_atualizado_em();
drop trigger if exists leituras_atualizado on public.leituras;
create trigger leituras_atualizado before update on public.leituras for each row execute function public.tocar_atualizado_em();

-- Segurança: cada usuário só acessa as próprias linhas
alter table public.perfis   enable row level security;
alter table public.livros   enable row level security;
alter table public.leituras enable row level security;

drop policy if exists "perfil próprio" on public.perfis;
create policy "perfil próprio" on public.perfis for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "livros próprios" on public.livros;
create policy "livros próprios" on public.livros for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "leituras próprias" on public.leituras;
create policy "leituras próprias" on public.leituras for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- =========================================================
-- Atualização: capas e fotos no Supabase Storage + séries.
-- Rode uma vez em: Supabase → SQL Editor → New query → Run
-- (pode rodar de novo sem problema)
-- =========================================================

-- 1) Pasta de arquivos "midia" (capas e mood board). Pública para leitura:
--    as imagens abrem rápido e ficam em cache; os nomes são aleatórios.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('midia', 'midia', true, 3145728, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- 2) Cada pessoa só envia, troca e apaga arquivos dentro da própria pasta (<id do usuário>/...)
drop policy if exists "midia: enviar na propria pasta" on storage.objects;
create policy "midia: enviar na propria pasta" on storage.objects for insert to authenticated
  with check (bucket_id = 'midia' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "midia: atualizar na propria pasta" on storage.objects;
create policy "midia: atualizar na propria pasta" on storage.objects for update to authenticated
  using (bucket_id = 'midia' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "midia: apagar na propria pasta" on storage.objects;
create policy "midia: apagar na propria pasta" on storage.objects for delete to authenticated
  using (bucket_id = 'midia' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- 3) Séries
alter table public.livros add column if not exists serie text;
alter table public.livros add column if not exists serie_volume numeric(5,1);

-- 4) (se ainda não rodou) datas só com mês ou só com ano
alter table public.leituras add column if not exists inicio_precisao text not null default 'dia' check (inicio_precisao in ('dia', 'mes', 'ano'));
alter table public.leituras add column if not exists fim_precisao    text not null default 'dia' check (fim_precisao in ('dia', 'mes', 'ano'));
