'use strict';

/* =========================================================
   Extras: importar planilha (Skoob/Goodreads/CSV),
   leitor de código de barras (ISBN) e roleta da fila.
   ========================================================= */

/* ---------------- Capa que falhou ao carregar vira capa gerada ---------------- */
document.addEventListener('error', (e) => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  const capa = img.closest('.cover');
  if (!capa || capa.classList.contains('gen')) return;
  const l = { titulo: capa.dataset.t || '', autor: capa.dataset.a || '', cor: capa.dataset.c || '' };
  capa.outerHTML = capaHTML(l);
}, true);

/* =========================================================
   1) IMPORTAR PLANILHA
   ========================================================= */
const Importador = (() => {
  let linhas = [];

  /* CSV com aspas, vírgula ou ponto e vírgula, BOM e quebras de linha dentro de campos */
  function lerCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    const primeira = texto.split(/\r?\n/)[0] || '';
    const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ';'
      : (primeira.match(/\t/g) || []).length > (primeira.match(/,/g) || []).length ? '\t' : ',';
    const out = []; let linha = [], campo = '', aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (aspas) {
        if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else aspas = false; }
        else campo += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { linha.push(campo); campo = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); campo = '';
        if (linha.some((v) => v.trim() !== '')) out.push(linha);
        linha = [];
      } else campo += c;
    }
    linha.push(campo); if (linha.some((v) => v.trim() !== '')) out.push(linha);
    return out;
  }

  const norm = (s) => semAcento(s).replace(/[^a-z0-9]+/g, ' ').trim();
  const COLUNAS = {
    titulo: ['title', 'titulo', 'nome', 'livro', 'book title', 'nome do livro'],
    autor: ['author', 'autor', 'autora', 'autor a', 'authors', 'autores', 'author l f'],
    paginas: ['number of pages', 'paginas', 'pages', 'num pages', 'n paginas', 'numero de paginas', 'qtd paginas'],
    nota: ['my rating', 'nota', 'avaliacao', 'rating', 'estrelas', 'minha nota', 'minha avaliacao'],
    status: ['exclusive shelf', 'status', 'estante', 'situacao', 'tipo', 'shelf'],
    fim: ['date read', 'data de leitura', 'lido em', 'data fim', 'fim', 'terminei', 'data de termino', 'data lido', 'termino'],
    inicio: ['date started', 'inicio', 'comecei', 'data de inicio', 'data inicio'],
    adicionado: ['date added', 'adicionado em', 'data adicionado', 'cadastrado em'],
    resenha: ['my review', 'resenha', 'review', 'notas', 'comentario', 'impressoes', 'private notes'],
    isbn: ['isbn13', 'isbn', 'isbn 13', 'isbn10'],
    genero: ['genero', 'categoria', 'genre', 'bookshelves', 'categorias'],
    citacao: ['citacao', 'quote', 'citacao favorita'],
  };
  function mapear(cab) {
    const n = cab.map(norm); const m = {};
    for (const [campo, nomes] of Object.entries(COLUNAS)) {
      let i = n.findIndex((h) => nomes.includes(h));
      if (i < 0) i = n.findIndex((h) => nomes.some((x) => x.length > 3 && h.startsWith(x)));
      if (i >= 0) m[campo] = i;
    }
    return m;
  }
  /* devolve { iso, prec } — aceita 2024/12/20, 20/12/2024, 2024-12, 12/2024, "dez 2024" e 2024 */
  const MES_NOME = { jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
  function data(v, papel = 'fim') {
    v = String(v || '').trim(); if (!v) return { iso: null, prec: 'dia' };
    let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(v);
    if (m) return { iso: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, prec: 'dia' };
    m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/.exec(v);
    if (m) return { iso: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, prec: 'dia' };
    m = /^(\d{4})[-/.](\d{1,2})$/.exec(v) || /^(\d{1,2})[-/.](\d{4})$/.exec(v)?.reverse().slice(0, 3).reverse();
    if (m) { const ano = +(m[1].length === 4 ? m[1] : m[2]), mes = +(m[1].length === 4 ? m[2] : m[1]); if (mes >= 1 && mes <= 12) return { iso: montarData(ano, mes, 0, 'mes', papel), prec: 'mes' }; }
    m = /^([a-zç]{3})[a-zç]*\.?\s*(de\s*)?(\d{4})$/i.exec(semAcento(v));
    if (m && MES_NOME[m[1]]) return { iso: montarData(+m[3], MES_NOME[m[1]], 0, 'mes', papel), prec: 'mes' };
    m = /^(\d{4})$/.exec(v); if (m) return { iso: montarData(+m[1], 0, 0, 'ano', papel), prec: 'ano' };
    return { iso: null, prec: 'dia' };
  }

  function status(v, temFim, temNota) {
    const s = norm(v);
    if (!s) return temFim || temNota ? 'lido' : 'quero';
    if (/abandon/.test(s)) return 'abandonado';
    if (/currently|lendo|relendo|reading/.test(s)) return 'lendo';
    if (/to read|quero|desej|vou ler|wish|want/.test(s)) return 'quero';
    if (/read|lido|relido|lidos|li\b/.test(s)) return 'lido';
    return temFim || temNota ? 'lido' : 'quero';
  }
  const limparIsbn = (v) => String(v || '').replace(/[^0-9Xx]/g, '');

  function interpretar(tabela) {
    const [cab, ...corpo] = tabela;
    const m = mapear(cab);
    if (m.titulo == null) return { erro: 'Não encontrei a coluna de título. A planilha precisa de uma coluna chamada "Título" (ou "Title").' };
    const formato = cab.some((h) => norm(h) === 'exclusive shelf') ? 'Goodreads' : cab.some((h) => /skoob/i.test(h)) ? 'Skoob' : 'planilha';
    const existentes = new Set(db.livros.map((l) => chaveLivro(l)));
    const vistos = new Set();
    const pega = (row, c) => (m[c] != null ? (row[m[c]] || '').trim() : '');
    const itens = corpo.map((row) => {
      const titulo = pega(row, 'titulo').replace(/\s+/g, ' ').replace(/\s*\([^()]*#\s*\d+(\.\d+)?\)\s*$/, '').trim();
      if (!titulo) return null;
      const autor = pega(row, 'autor');
      const notaTxt = pega(row, 'nota').replace(',', '.');
      let nota = parseFloat(notaTxt); nota = isFinite(nota) ? Math.max(0, Math.min(5, nota > 5 ? nota / 2 : nota)) : 0;
      nota = Math.round(nota * 2) / 2;
      const df = data(pega(row, 'fim'), 'fim'), di = data(pega(row, 'inicio'), 'inicio');
      const fim = df.iso, inicio = di.iso;
      const st = status(pega(row, 'status'), !!fim, nota > 0);
      const isbn = limparIsbn(pega(row, 'isbn'));
      const k = chaveLivro({ titulo, autor });
      const dup = existentes.has(k) || vistos.has(k); vistos.add(k);
      return {
        titulo, autor, paginas: parseInt(pega(row, 'paginas'), 10) || '', nota, fim, inicio, fimPrec: df.prec, inicioPrec: di.prec, status: st, isbn,
        adicionado: data(pega(row, 'adicionado')).iso, resenha: pega(row, 'resenha'), citacao: pega(row, 'citacao'),
        genero: generoDe(pega(row, 'genero').split(/[,;|]/).filter(Boolean)), duplicado: dup,
      };
    }).filter(Boolean);
    return { itens, formato, colunas: Object.keys(m) };
  }

  function abrir() {
    fecharMenu();
    linhas = [];
    const d = $('#modal-importar');
    d.innerHTML = `<div class="modal-head"><div><p class="script">trazendo a estante inteira...</p><h2>Importar planilha</h2></div><button type="button" class="x" data-action="fechar" aria-label="Fechar">×</button></div>
      <div class="modal-body">
        <label class="drop" id="drop">
          <input type="file" id="csv-arquivo" accept=".csv,text/csv,.txt,.tsv" hidden>
          <span class="drop-ico" aria-hidden="true"><svg viewBox="0 0 40 40" width="44" height="44"><rect x="8" y="5" width="24" height="30" rx="3" fill="#fff4ea" stroke="#5e0b2b" stroke-width="2.4"/><path d="M13 13h14M13 18h14M13 23h9" stroke="#e8458b" stroke-width="2.4" stroke-linecap="round"/><circle cx="29" cy="29" r="7" fill="#b8b23e" stroke="#5e0b2b" stroke-width="2.4"/><path d="M29 25.5v7M25.5 29l3.5 3.5 3.5-3.5" fill="none" stroke="#fff4ea" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <b>Escolha ou arraste o arquivo .csv</b>
          <small>Funciona com o export do Goodreads, planilhas do Skoob e qualquer planilha com colunas como Título, Autor, Nota, Status e Data de leitura.</small>
        </label>
        <details class="ajuda">
          <summary>Como tirar a planilha do Goodreads ou do Skoob?</summary>
          <p><b>Goodreads:</b> no site, vá em <i>My Books → Import and export → Export Library</i> e baixe o arquivo .csv.</p>
          <p><b>Skoob:</b> o Skoob não tem botão de exportar. Dá para usar uma ferramenta da comunidade (como o <i>skoobpy</i>) ou montar a planilha no Google Planilhas com as colunas <i>Título, Autor, Páginas, Status, Nota, Data de leitura</i> e baixar como .csv.</p>
          <p><b>Datas:</b> pode ser completa (20/12/2024), só mês e ano (12/2024 ou dez 2024) ou só o ano (2024).</p>
          <p><b>Status aceitos:</b> lido, lendo, quero ler, relendo, abandonei — ou read, currently-reading, to-read.</p>
        </details>
        <div id="previa"></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn ghost" data-action="fechar">Cancelar</button><button type="button" class="btn hot" id="btn-importar" data-action="importar-csv" disabled>Importar</button></div>`;
    d.showModal();
  }

  async function carregar(arquivo) {
    const previa = $('#previa');
    if (!arquivo) return;
    if (arquivo.size > 15 * 1024 * 1024) { previa.innerHTML = '<p class="login-msg erro">Arquivo grande demais (máx. 15 MB).</p>'; return; }
    let texto = await arquivo.text();
    if (texto.includes('�')) { // provavelmente salvo pelo Excel em Latin-1
      try { texto = new TextDecoder('windows-1252').decode(await arquivo.arrayBuffer()); } catch (e) { /* ignora */ }
    }
    const tabela = lerCSV(texto);
    if (tabela.length < 2) { previa.innerHTML = '<p class="login-msg erro">Não encontrei linhas nessa planilha.</p>'; return; }
    const r = interpretar(tabela);
    if (r.erro) { previa.innerHTML = `<p class="login-msg erro">${esc(r.erro)}</p>`; $('#btn-importar').disabled = true; return; }
    linhas = r.itens;
    const novos = linhas.filter((x) => !x.duplicado);
    const conta = (s) => novos.filter((x) => (s === 'lido' ? ['lido', 'abandonado'].includes(x.status) : x.status === s)).length;
    const semData = novos.filter((x) => ['lido', 'abandonado'].includes(x.status) && !x.fim).length;
    previa.innerHTML = `<div class="previa-resumo">
        <p class="script">encontrei ${linhas.length} livros no ${esc(r.formato === 'planilha' ? 'arquivo' : r.formato)}</p>
        <div class="previa-pills">
          <span class="pill lido">${conta('lido')} lidos</span><span class="pill lendo">${conta('lendo')} lendo</span><span class="pill quero">${conta('quero')} quero ler</span>
          ${linhas.length - novos.length ? `<span class="pill">${linhas.length - novos.length} já estão na estante (vou pular)</span>` : ''}
        </div>
        ${semData ? `<p class="muted previa-aviso">${semData} livros lidos estão sem data de leitura — vou usar a data em que foram adicionados (ou hoje).</p>` : ''}
      </div>
      <div class="previa-lista">${novos.slice(0, 60).map((x) => `<div class="previa-item">
          <div class="previa-capa">${capaHTML({ titulo: x.titulo, autor: x.autor, capa: x.isbn ? `https://covers.openlibrary.org/b/isbn/${x.isbn}-M.jpg?default=false` : '' })}</div>
          <div><b>${esc(x.titulo)}</b><small>${esc(x.autor || 'autor desconhecido')}</small>
            <span class="previa-meta"><span class="pill ${x.status === 'abandonado' ? 'lido' : x.status}">${{ lido: 'Lido', lendo: 'Lendo', quero: 'Quero ler', abandonado: 'Abandonado' }[x.status]}</span>${x.nota ? starsHTML(x.nota, { size: 'sm' }) : ''}${x.fim ? `<span class="muted">${fmtData(x.fim, x.fimPrec)}</span>` : ''}</span></div>
        </div>`).join('')}${novos.length > 60 ? `<p class="muted" style="text-align:center">… e mais ${novos.length - 60}</p>` : ''}</div>`;
    const b = $('#btn-importar');
    b.disabled = !novos.length;
    b.textContent = novos.length ? `Importar ${novos.length} ${novos.length === 1 ? 'livro' : 'livros'}` : 'Nada novo para importar';
  }

  function importar() {
    const novos = linhas.filter((x) => !x.duplicado);
    if (!novos.length) return;
    const agora = Date.now();
    novos.forEach((x, i) => {
      const l = {
        id: uid(), titulo: x.titulo, autor: x.autor, genero: x.genero || '', paginas: x.paginas,
        capa: x.isbn ? `https://covers.openlibrary.org/b/isbn/${x.isbn}-L.jpg?default=false` : '', cor: '',
        criadoEm: new Date((x.adicionado ? Date.parse(x.adicionado) : agora) + i).toISOString(), leituras: [],
      };
      if (x.status === 'lido' || x.status === 'abandonado') {
        const fim = x.fim || x.adicionado || hoje();
        const fimPrecisao = x.fim ? x.fimPrec : 'dia';
        const temInicio = x.inicio && x.inicio <= fim;
        l.leituras.push(novaLeitura({
          inicio: temInicio ? x.inicio : null, inicioPrecisao: temInicio ? x.inicioPrec : 'dia', fim, fimPrecisao, estrelas: x.nota, paginaAtual: +x.paginas || 0, citacao: x.citacao,
          notas: [x.status === 'abandonado' ? 'Abandonei esta leitura.' : '', x.resenha].filter(Boolean).join('\n\n'),
        }));
      } else if (x.status === 'lendo') {
        l.leituras.push(novaLeitura({ inicio: x.inicio || hoje(), inicioPrecisao: x.inicio ? x.inicioPrec : 'dia' }));
      }
      db.livros.push(l);
    });
    salvar(); render();
    $('#modal-importar').close();
    confete();
    toast(`${novos.length} livros importados para a sua estante!`);
  }

  // arrastar e soltar
  document.addEventListener('dragover', (e) => { const z = e.target.closest?.('#drop'); if (z) { e.preventDefault(); z.classList.add('sobre'); } });
  document.addEventListener('dragleave', (e) => { e.target.closest?.('#drop')?.classList.remove('sobre'); });
  document.addEventListener('drop', (e) => {
    const z = e.target.closest?.('#drop'); if (!z) return;
    e.preventDefault(); z.classList.remove('sobre'); carregar(e.dataTransfer.files[0]);
  });
  document.addEventListener('change', (e) => { if (e.target.id === 'csv-arquivo') carregar(e.target.files[0]).finally(() => { e.target.value = ''; }); });

  return { abrir, importar, lerCSV, interpretar };
})();

/* =========================================================
   2) LEITOR DE CÓDIGO DE BARRAS (ISBN)
   ========================================================= */
const Scanner = (() => {
  let stream = null, rodando = false, zxing = null, detector = null, achou = false;
  const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/library@0.21.3/umd/index.min.js';

  const isbnValido = (s) => {
    if (!/^97[89]\d{10}$/.test(s)) return false;
    const soma = [...s.slice(0, 12)].reduce((t, d, i) => t + (+d) * (i % 2 ? 3 : 1), 0);
    return (10 - (soma % 10)) % 10 === +s[12];
  };
  const isbn10para13 = (s) => {
    if (!/^\d{9}[\dXx]$/.test(s)) return null;
    const base = '978' + s.slice(0, 9);
    const soma = [...base].reduce((t, d, i) => t + (+d) * (i % 2 ? 3 : 1), 0);
    return base + ((10 - (soma % 10)) % 10);
  };

  function carregarScript(url) {
    return new Promise((ok, falha) => {
      const s = document.createElement('script'); s.src = url; s.onload = ok; s.onerror = falha; document.head.appendChild(s);
    });
  }

  async function abrir() {
    achou = false;
    const d = $('#modal-scanner');
    d.innerHTML = `<div class="modal-head"><div><p class="script">aponte para o verso do livro...</p><h2>Escanear código</h2></div><button type="button" class="x" data-action="fechar-scanner" aria-label="Fechar">×</button></div>
      <div class="modal-body">
        <div class="camera">
          <video id="scan-video" playsinline muted></video>
          <div class="mira" aria-hidden="true"><span></span></div>
          <p class="camera-msg" id="scan-msg"><span class="loading"></span> abrindo a câmera...</p>
        </div>
        <p class="muted scan-dica">Centralize o código de barras (o que começa com 978 ou 979) dentro da moldura. Se a câmera não abrir, digite o ISBN:</p>
        <form class="scan-manual" id="scan-manual">
          <input id="isbn-manual" inputmode="numeric" autocomplete="off" placeholder="Ex.: 9788535932171" aria-label="ISBN">
          <button class="btn olive" type="submit">Buscar</button>
        </form>
      </div>`;
    d.showModal();
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('sem-camera');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      const v = $('#scan-video'); if (!v) { parar(); return; }
      v.srcObject = stream; await v.play();
      $('#scan-msg').textContent = 'procurando o código...';
      rodando = true;
      if ('BarcodeDetector' in window) {
        const formatos = await BarcodeDetector.getSupportedFormats?.() || [];
        if (formatos.includes('ean_13')) detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a'] });
      }
      if (detector) loopNativo(v);
      else await usarZXing(v);
    } catch (e) {
      console.warn(e);
      const msg = e?.name === 'NotAllowedError' ? 'Sem permissão para usar a câmera. Libere nas configurações do navegador ou digite o ISBN abaixo.'
        : 'Não consegui abrir a câmera neste aparelho. Digite o ISBN abaixo.';
      const m = $('#scan-msg'); if (m) { m.textContent = msg; m.classList.add('erro'); }
      $('#isbn-manual')?.focus();
    }
  }
  async function loopNativo(v) {
    if (!rodando) return;
    try {
      const cods = await detector.detect(v);
      for (const c of cods) if (tentar(c.rawValue)) return;
    } catch (e) { /* frame ruim, segue */ }
    setTimeout(() => loopNativo(v), 180);
  }
  /* Safari/iPhone não tem leitor nativo: usa a ZXing lendo quadros da câmera num canvas */
  async function usarZXing(v) {
    try {
      if (!window.ZXing) await carregarScript(ZXING_URL);
      const Z = window.ZXing;
      const leitor = new Z.MultiFormatReader();
      const dicas = new Map();
      dicas.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A]);
      dicas.set(Z.DecodeHintType.TRY_HARDER, true);
      leitor.setHints(dicas);
      const cv = document.createElement('canvas'); const ctx = cv.getContext('2d', { willReadFrequently: true });
      zxing = { reset() { leitor.reset?.(); } };
      const passo = () => {
        if (!rodando || achou) return;
        const w = v.videoWidth, h = v.videoHeight;
        if (w && h) {
          // recorta a faixa central (onde fica a moldura) para ler mais rápido
          const cw = Math.round(w * 0.9), ch = Math.round(h * 0.45);
          cv.width = cw; cv.height = ch;
          ctx.drawImage(v, (w - cw) / 2, (h - ch) / 2, cw, ch, 0, 0, cw, ch);
          try {
            const bmp = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(cv)));
            const res = leitor.decodeWithState ? leitor.decodeWithState(bmp) : leitor.decode(bmp, dicas);
            if (res && tentar(res.getText())) return;
          } catch (e) { /* nenhum código neste quadro */ }
        }
        setTimeout(passo, 220);
      };
      passo();
    } catch (e) {
      console.warn('ZXing indisponível', e);
      const m = $('#scan-msg'); if (m) { m.textContent = 'Não consegui ativar o leitor neste navegador. Digite o ISBN abaixo.'; m.classList.add('erro'); }
    }
  }
  function tentar(valor) {
    const s = String(valor || '').replace(/\D/g, '');
    if (achou || !isbnValido(s)) return false;
    achou = true;
    navigator.vibrate?.(80);
    $('.camera')?.classList.add('achou');
    const m = $('#scan-msg'); if (m) m.textContent = `ISBN ${s} — buscando o livro...`;
    setTimeout(() => buscarIsbn(s), 350);
    return true;
  }
  function parar() {
    rodando = false;
    try { zxing?.reset(); } catch (e) { /* ignora */ }
    zxing = null;
    stream?.getTracks().forEach((t) => t.stop()); stream = null;
  }
  function fechar() { parar(); $('#modal-scanner').close(); }

  async function buscarIsbn(isbn) {
    parar();
    const enc = encodeURIComponent(isbn);
    const [gb, ol] = await Promise.allSettled([
      comTempo(`https://www.googleapis.com/books/v1/volumes?q=isbn:${enc}`),
      comTempo(`https://openlibrary.org/api/books?bibkeys=ISBN:${enc}&format=json&jscmd=data`),
    ]);
    const r = { titulo: '', autor: '', paginas: '', genero: '', capa: '' };
    const v = gb.status === 'fulfilled' ? gb.value.items?.[0]?.volumeInfo : null;
    if (v) Object.assign(r, doGoogle(v));
    const o = ol.status === 'fulfilled' ? ol.value[`ISBN:${isbn}`] : null;
    if (o) {
      r.titulo ||= o.title || ''; r.autor ||= (o.authors || []).map((a) => a.name).join(', ');
      r.paginas ||= o.number_of_pages || ''; r.genero ||= generoDe((o.subjects || []).map((s) => s.name).slice(0, 12));
      r.capa ||= o.cover?.large || o.cover?.medium || '';
    }
    if (!r.capa) r.capa = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
    const f = $('#form-livro');
    if (!r.titulo) {
      const m = $('#scan-msg'); if (m) { m.textContent = `Não achei o ISBN ${isbn} nas bibliotecas online. Preencha à mão ou tente a busca por título.`; m.classList.add('erro'); }
      $('.camera')?.classList.remove('achou');
      return;
    }
    $('#modal-scanner').close();
    if (!f) return;
    f.titulo.value = r.titulo; if (r.autor) f.autor.value = r.autor; if (r.paginas) f.paginas.value = r.paginas; if (r.genero) f.genero.value = r.genero;
    $('#q-online').value = r.titulo;
    definirCapa(r.capa, true);
    toast(`Achei: “${r.titulo}”`);
  }

  document.addEventListener('submit', (e) => {
    if (e.target.id !== 'scan-manual') return;
    e.preventDefault();
    let s = $('#isbn-manual').value.replace(/[^0-9Xx]/g, '');
    if (s.length === 10) s = isbn10para13(s) || s;
    if (!isbnValido(s)) { const m = $('#scan-msg'); if (m) { m.textContent = 'Esse ISBN não parece válido. Confira os 13 números (começa com 978 ou 979).'; m.classList.add('erro'); } return; }
    achou = true; $('#scan-msg').textContent = `ISBN ${s} — buscando o livro...`; $('#scan-msg').classList.remove('erro');
    buscarIsbn(s);
  });
  document.addEventListener('close', (e) => { if (e.target.id === 'modal-scanner') parar(); }, true);

  return { abrir, fechar, buscarIsbn, isbnValido };
})();

/* =========================================================
   3) ROLETA DA FILA
   ========================================================= */
const Roleta = (() => {
  let livros = [], giro = 0, girando = false, vencedor = null;

  function sortearAmostra(lista, n) {
    const a = [...lista];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a.slice(0, n);
  }
  function rodaSVG() {
    const n = livros.length, R = 150, c = 160, ang = 360 / n;
    const pt = (a, r = R) => [c + r * Math.sin((a * Math.PI) / 180), c - r * Math.cos((a * Math.PI) / 180)];
    const fatias = livros.map((l, i) => {
      const a0 = i * ang, a1 = (i + 1) * ang, [x0, y0] = pt(a0), [x1, y1] = pt(a1);
      const cor = PALETA[(i * 5 + 2) % PALETA.length], txt = textoSobre(cor);
      const meio = a0 + ang / 2;
      const nome = l.titulo.length > 18 ? l.titulo.slice(0, 17) + '…' : l.titulo;
      return `<path d="M${c} ${c}L${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${ang > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}Z" fill="${cor}" stroke="#5e0b2b" stroke-width="2.5"/>
        <text transform="rotate(${meio - 90} ${c} ${c})" x="${c + R - 14}" y="${c + 5}" text-anchor="end" fill="${txt}" font-size="${n > 8 ? 11 : 13}">${esc(nome)}</text>`;
    }).join('');
    return `<svg viewBox="0 0 320 320" class="roda-svg" aria-hidden="true">
      <circle cx="160" cy="160" r="156" fill="#5e0b2b"/>${fatias}
      ${Array.from({ length: n }, (_, i) => { const [x, y] = pt(i * ang, R + 1); return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="#ffcb2e" stroke="#5e0b2b" stroke-width="1.5"/>`; }).join('')}
      <circle cx="160" cy="160" r="26" fill="#fffaf4" stroke="#5e0b2b" stroke-width="3"/></svg>`;
  }

  function abrir() {
    const fila = db.livros.filter((l) => status(l) === 'quero');
    if (fila.length < 2) { toast('Adicione pelo menos 2 livros em "quero ler" para sortear.'); return; }
    livros = sortearAmostra(fila, 12); giro = 0; vencedor = null;
    const d = $('#modal-roleta');
    d.innerHTML = `<div class="modal-head"><div><p class="script">deixa o destino escolher...</p><h2>Qual vai ser a próxima?</h2></div><button type="button" class="x" data-action="fechar" aria-label="Fechar">×</button></div>
      <div class="modal-body roleta-corpo">
        <div class="roleta">
          <div class="ponteiro" aria-hidden="true"></div>
          <div class="roda" id="roda">${rodaSVG()}</div>
          <button type="button" class="miolo" data-action="girar-roleta" aria-label="Girar a roleta"><img src="logo.png" alt=""></button>
        </div>
        ${fila.length > livros.length ? `<p class="muted roleta-nota">Sua fila tem ${fila.length} livros — a roleta mostra ${livros.length} escolhidos ao acaso.</p>` : ''}
        <div class="roleta-resultado" id="roleta-resultado" aria-live="polite"></div>
      </div>
      <div class="modal-foot"><button type="button" class="btn ghost" data-action="fechar">Fechar</button><button type="button" class="btn hot" id="btn-girar" data-action="girar-roleta">Girar a roleta!</button></div>`;
    d.showModal();
  }

  function girar() {
    if (girando) return;
    girando = true;
    const res = $('#roleta-resultado'); res.innerHTML = ''; res.classList.remove('mostrar');
    const btn = $('#btn-girar'); btn.disabled = true; btn.textContent = 'Girando...';
    const n = livros.length, ang = 360 / n;
    const i = Math.floor(Math.random() * n);
    vencedor = livros[i];
    const centro = i * ang + ang / 2;
    const folga = (Math.random() - 0.5) * ang * 0.6;
    const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const voltas = reduzido ? 1 : 6 + Math.floor(Math.random() * 3);
    const atual = ((giro % 360) + 360) % 360;
    giro += voltas * 360 + ((360 - centro - folga - atual) % 360 + 360) % 360;
    const roda = $('#roda');
    const dur = reduzido ? 600 : 4600;
    roda.style.transition = `transform ${dur}ms cubic-bezier(.12,.62,.08,1)`;
    roda.style.transform = `rotate(${giro}deg)`;
    $('.roleta').classList.add('rodando');
    setTimeout(() => {
      girando = false;
      $('.roleta')?.classList.remove('rodando');
      if (!$('#roleta-resultado')) return;
      btn.disabled = false; btn.textContent = 'Girar de novo';
      res.innerHTML = `<div class="sorteado">
          ${polaroidHTML(vencedor, { r: -4, legenda: false })}
          <div><p class="script">a próxima leitura é...</p><h3>${esc(vencedor.titulo)}</h3><p class="muted">${esc(vencedor.autor || '')}${vencedor.paginas ? ` · ${vencedor.paginas} páginas` : ''}</p>
            <button type="button" class="btn olive" data-action="roleta-comecar" data-id="${vencedor.id}">▶ Começar a ler agora</button></div>
        </div>`;
      res.classList.add('mostrar');
      confete();
      res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, dur + 60);
  }

  return { abrir, girar };
})();

/* ---------------- Ações ---------------- */
Object.assign(acoes, {
  'importar-planilha': () => Importador.abrir(),
  'importar-csv': () => Importador.importar(),
  escanear: () => Scanner.abrir(),
  'fechar-scanner': () => Scanner.fechar(),
  roleta: () => Roleta.abrir(),
  'girar-roleta': () => Roleta.girar(),
  'roleta-comecar': (t) => { $('#modal-roleta').close(); comecar(t.dataset.id); },
});
