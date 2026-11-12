# 📚 Minhas Leituras

Diário de leituras pessoal, com visual de scrapbook retrô (rosa, vinho, oliva e tangerina, gradientes granulados, adesivos e polaroids): estante com lombadas animadas, avaliações por estrelas (com meia estrela),
critérios por livro e **releituras que não sobrescrevem as avaliações anteriores**.

## Funcionalidades
- **Status**: Quero ler · Lendo agora · Lido (calculado automaticamente a partir das leituras)
- **Avaliação**: nota geral + 6 critérios (tensão, conteúdo, tristeza, romance, humor, final), personagem favorito, citação, impressões, "recomendaria?"
- **Releituras**: cada leitura é um registro separado (1ª, 2ª, 3ª…), com evolução da nota e comparação por critério (▲/▼)
- **Capas**: envio de imagem, link, ou busca online (Google Books + Open Library). A cor da capa pinta a lombada na estante
- **Estante**: lombadas em prateleiras (passe o mouse para “puxar” o livro) ou grade de capas; filtros, busca e ordenação
- **Início**: lendo agora com progresso por página, meta anual, livros por mês, gêneros, citação favorita, fila de “quero ler”
- **Diário**: linha do tempo por ano/mês de todas as leituras
- **Importar planilha**: CSV do Goodreads, do Skoob ou qualquer planilha (Título, Autor, Nota, Status, Data de leitura), com prévia e sem duplicar livros
- **Escanear código de barras**: aponte a câmera para o ISBN no verso do livro (ou digite) e o app preenche título, autor, páginas e capa
- **Roleta da fila**: sorteia a próxima leitura entre os livros de "quero ler"
- Tema claro/escuro, backup em JSON (exportar/importar), funciona no celular

## Contas e banco de dados (Supabase)
Com o Supabase configurado, o app abre numa **tela de login**: cada pessoa cria a própria conta (e-mail e senha) e os livros, leituras, metas e tema ficam salvos no banco, acessíveis de qualquer aparelho. Se a pessoa já tinha livros salvos só no navegador, o app oferece levá-los para a conta no primeiro acesso.

**Configurar (uma vez):**
1. Crie um projeto grátis em [supabase.com](https://supabase.com).
2. Em **SQL Editor → New query**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**. Isso cria as tabelas `perfis`, `livros` e `leituras` com as regras de segurança (cada usuário só vê os próprios dados).
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public** e cole em `config.js`.
4. Em **Authentication → URL Configuration**, coloque o endereço do site da Vercel em **Site URL** (e também em **Redirect URLs**), para os links de confirmação de e-mail e de "esqueci minha senha" voltarem para o app.
5. Opcional: em **Authentication → Providers → Email**, desligue "Confirm email" se não quiser exigir confirmação por e-mail.

A chave `anon` é pública por natureza (fica no navegador); quem protege os dados é o RLS do `schema.sql`. **Nunca** coloque a chave `service_role` no `config.js`.

Sem `config.js` preenchido, o app funciona como antes: sem login, com os dados só no navegador.

## Como rodar
Não precisa de build. Abra `index.html` no navegador ou rode um servidor local:

```bash
npx serve .
```

Use **⋯ → Exportar backup** para guardar uma cópia dos seus dados em JSON.

## Publicar
```bash
git init && git add . && git commit -m "Minhas Leituras: protótipo"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/minhas-leituras.git
git push -u origin main
```
Na Vercel: **Add New → Project → importar o repositório** → Framework Preset: **Other** → Deploy (sem comando de build).

## Próximos passos possíveis
- Guardar as capas no Supabase Storage em vez de dentro do banco
- PWA (instalar como app) e modo offline
- Fotos “que descrevem o livro” (mood board) por leitura
