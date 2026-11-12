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
- Tema claro/escuro, backup em JSON (exportar/importar), funciona no celular

## Como rodar
Não precisa de build. Abra `index.html` no navegador ou rode um servidor local:

```bash
npx serve .
```

Os dados ficam salvos no `localStorage` do navegador (por dispositivo). Use **⋯ → Exportar backup** para guardar uma cópia.

## Publicar
```bash
git init && git add . && git commit -m "Minhas Leituras: protótipo"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/minhas-leituras.git
git push -u origin main
```
Na Vercel: **Add New → Project → importar o repositório** → Framework Preset: **Other** → Deploy (sem comando de build).

## Próximos passos possíveis
- Sincronizar entre dispositivos (Supabase/Firebase) no lugar do localStorage
- PWA (instalar como app) e modo offline
- Fotos “que descrevem o livro” (mood board) por leitura
