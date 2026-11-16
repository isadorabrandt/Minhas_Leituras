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
