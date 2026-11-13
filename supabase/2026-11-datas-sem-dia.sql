-- Atualização: datas de leitura só com mês ou só com ano.
-- Rode uma vez em: Supabase → SQL Editor → New query → Run
alter table public.leituras add column if not exists inicio_precisao text not null default 'dia' check (inicio_precisao in ('dia', 'mes', 'ano'));
alter table public.leituras add column if not exists fim_precisao    text not null default 'dia' check (fim_precisao in ('dia', 'mes', 'ano'));
