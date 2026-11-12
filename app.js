'use strict';

/* =========================================================
   Minhas Leituras — protótipo
   Dados salvos no navegador (localStorage).
   Modelo:
     livro   = { id, titulo, autor, genero, paginas, capa, cor, criadoEm, leituras: [leitura] }
     leitura = { id, inicio, fim, paginaAtual, estrelas, criterios{}, personagem, citacao, notas, recomenda }
   Cada releitura é uma NOVA leitura: as avaliações anteriores nunca são sobrescritas.
   ========================================================= */

const KEY = 'minhas-leituras:v1';
const CRITERIOS = [
  ['tensao', 'Tensão'], ['conteudo', 'Conteúdo'], ['tristeza', 'Tristeza'],
  ['romance', 'Romance'], ['humor', 'Humor'], ['final', 'Final'],
];
const GENEROS = ['Romance', 'Fantasia', 'Ficção', 'Ficção científica', 'Suspense', 'Terror', 'Clássico',
  'Literatura brasileira', 'Poesia', 'Contos', 'Não ficção', 'Biografia', 'Autoajuda', 'HQ / Mangá',
  'Infantojuvenil', 'Young adult', 'História', 'Filosofia'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const PALETA = ['#8c2f39', '#2f4b7c', '#386641', '#bc6c25', '#5e3c58', '#1d3557', '#9c6644', '#264653',
  '#6a4c93', '#a4505f', '#3a5a40', '#7f5539', '#b23a48', '#003049', '#606c38', '#2a6f97'];
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.94 6.1 6.7.82-4.93 4.6 1.27 6.63L12 17.4l-5.98 3.25 1.27-6.63-4.93-4.6 6.7-.82z"/></svg>';

let db = carregar();
const ui = {
  view: 'inicio', filtro: 'todos', busca: '', ordem: 'recentes', modo: 'lombadas',
  ano: new Date().getFullYear(), aberto: null, aba: null,
  formLivro: null, formLeitura: null, resultados: [],
};

/* ---------------- Persistência ---------------- */
function carregar() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.livros)) return { metas: {}, tema: null, ...d };
  } catch (e) { /* ignora */ }
  return { livros: [], metas: {}, tema: null };
}
function salvar() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Não foi possível salvar: o armazenamento do navegador está cheio. Use capas menores.', 'erro'); }
}

/* ---------------- Utilidades ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtNota = (n) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const ordinal = (n) => `${n}ª`;
function fmtData(iso) {
  if (!iso) return '—';
  const [a, m, d] = iso.split('-').map(Number);
  return `${d} ${MESES[m - 1]} ${a}`;
}
function dias(a, b) { return Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1); }
function hash(s) { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h); }
const corDe = (l) => l.cor || PALETA[hash(l.titulo + l.autor) % PALETA.length];
function textoSobre(cor) {
  let r, g, b;
  const hex = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(cor || '');
  if (hex) [r, g, b] = hex.slice(1).map((v) => parseInt(v, 16));
  else return '#fff';
  return (0.299 * r + 0.587 * g + 0.114 * b) > 165 ? '#2b211b' : '#fff';
}

/* ---------------- Regras de leitura ---------------- */
const leituraAtual = (l) => l.leituras.find((x) => !x.fim);
const concluidas = (l) => l.leituras.filter((x) => x.fim).sort((a, b) => a.fim.localeCompare(b.fim));
function status(l) {
  if (leituraAtual(l)) return 'lendo';
  return l.leituras.length ? 'lido' : 'quero';
}
const STATUS_TXT = { lendo: 'Lendo', lido: 'Lido', quero: 'Quero ler' };
function numeroLeitura(l, leitura) {
  const ord = [...l.leituras].sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));
  return ord.indexOf(leitura) + 1;
}
function notaAtual(l) {
  const c = concluidas(l).filter((x) => x.estrelas > 0);
  return c.length ? c[c.length - 1].estrelas : 0;
}
function todasLeituras() {
  const out = [];
  db.livros.forEach((livro) => livro.leituras.forEach((leitura) => out.push({ livro, leitura, n: numeroLeitura(livro, leitura) })));
  return out;
}
const acharLivro = (id) => db.livros.find((l) => l.id === id);

/* ---------------- Componentes ---------------- */
function starsHTML(v = 0, { input = false, name = '', variant = 'gold', size = '' } = {}) {
  const attrs = input
    ? `tabindex="0" role="slider" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${v}" aria-label="${esc(name)}" data-name="${esc(name)}"`
    : `role="img" aria-label="${fmtNota(v)} de 5 estrelas"`;
  let s = `<div class="stars ${variant} ${size} ${input ? 'input' : ''}" ${attrs} data-value="${v}">`;
  for (let i = 0; i < 5; i++) {
    const f = Math.max(0, Math.min(1, v - i)) * 100;
    s += `<span class="star" data-i="${i}">${STAR}<span class="fill" style="width:${f}%">${STAR}</span></span>`;
  }
  if (input) s += `<span class="stars-val">${v ? fmtNota(v) : '—'}</span>`;
  return s + '</div>';
}
function pintarEstrelas(el, v) {
  el.querySelectorAll('.star').forEach((st, i) => { st.querySelector('.fill').style.width = Math.max(0, Math.min(1, v - i)) * 100 + '%'; });
  const val = el.querySelector('.stars-val'); if (val) val.textContent = v ? fmtNota(v) : '—';
}

function capaHTML(l, extra = '') {
  const cor = corDe(l);
  if (l.capa) return `<div class="cover ${extra}" style="--c:${cor}"><img src="${esc(l.capa)}" alt="Capa de ${esc(l.titulo)}" loading="lazy" referrerpolicy="no-referrer"></div>`;
  return `<div class="cover gen ${extra}" style="--c:${cor}"><span class="gt">${esc(l.titulo)}</span><span class="ga">${esc(l.autor)}</span></div>`;
}
const pillStatus = (l) => `<span class="pill ${status(l)}">${STATUS_TXT[status(l)]}</span>`;

/* ---------------- Render ---------------- */
function render() {
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('ativo', b.dataset.view === ui.view));
  const app = $('#app');
  if (!db.livros.length) { app.innerHTML = viewVazia(); return; }
  app.innerHTML = `<div class="view">${({ inicio: viewInicio, estante: viewEstante, diario: viewDiario })[ui.view]()}</div>`;
  if (ui.view === 'estante') renderLista();
}

function viewVazia() {
  const pilha = PALETA.slice(0, 9).map((c, i) => `<i style="background:${c};height:${80 + (i * 37) % 60}px;animation-delay:${i * 60}ms"></i>`).join('');
  return `<div class="vazio view">
    <div class="pilha">${pilha}</div>
    <h1>Sua estante está esperando.</h1>
    <p>Cadastre os livros que você já leu, está lendo e quer ler. Dê estrelas, guarde citações e registre releituras sem perder as avaliações antigas.</p>
    <div class="acoes">
      <button class="btn primary" data-action="novo-livro">＋ Adicionar meu primeiro livro</button>
      <button class="btn" data-action="exemplos">Ver com livros de exemplo</button>
    </div></div>`;
}

/* ----- Início ----- */
function viewInicio() {
  const ano = ui.ano;
  const lendo = db.livros.filter((l) => status(l) === 'lendo');
  const fila = db.livros.filter((l) => status(l) === 'quero').sort((a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''));
  const todas = todasLeituras();
  const doAno = todas.filter((x) => x.leitura.fim && x.leitura.fim.startsWith(String(ano)));
  const anos = [...new Set([new Date().getFullYear(), ...todas.filter((x) => x.leitura.fim).map((x) => +x.leitura.fim.slice(0, 4))])].sort((a, b) => b - a);
  const paginas = doAno.reduce((s, x) => s + (+x.livro.paginas || 0), 0);
  const avaliadas = doAno.filter((x) => x.leitura.estrelas > 0);
  const media = avaliadas.length ? avaliadas.reduce((s, x) => s + x.leitura.estrelas, 0) / avaliadas.length : 0;
  const releituras = doAno.filter((x) => x.n > 1).length;
  const alvo = db.metas[ano] || 12;
  const pct = Math.min(1, doAno.length / alvo);
  const C = 2 * Math.PI * 52;

  const porMes = Array(12).fill(0);
  doAno.forEach((x) => porMes[+x.leitura.fim.slice(5, 7) - 1]++);
  const max = Math.max(1, ...porMes);
  const mesAgora = ano === new Date().getFullYear() ? new Date().getMonth() : -1;

  const gen = {};
  doAno.forEach((x) => { const g = x.livro.genero || 'Sem gênero'; gen[g] = (gen[g] || 0) + 1; });
  const genTop = Object.entries(gen).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const genMax = genTop[0]?.[1] || 1;

  const citacoes = todas.filter((x) => x.leitura.citacao);
  const cit = citacoes.length ? citacoes[(new Date().getDate() + citacoes.length) % citacoes.length] : null;

  const h = new Date().getHours();
  const saud = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';

  return `
  <section class="hero">
    <div>
      <p class="eyebrow">${saud}</p>
      <h1>O que você está <em>lendo</em> hoje?</h1>
      <p>${db.livros.length} livros na estante · ${todas.filter((x) => x.leitura.fim).length} leituras concluídas desde sempre</p>
    </div>
    <select class="select-ano" data-change="ano" aria-label="Ano das estatísticas">${anos.map((a) => `<option ${a === ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
  </section>

  <div class="dash">
    <section class="card span-7">
      <h3>Lendo agora <span class="pill lendo">${lendo.length}</span></h3>
      ${lendo.length ? `<div class="lendo-list">${lendo.map(cardLendo).join('')}</div>`
        : `<p class="muted">Nenhuma leitura em andamento. Que tal escolher algo da sua fila?</p>`}
    </section>

    <section class="card span-5">
      <h3>Meta de ${ano}</h3>
      <div class="meta">
        <div class="ring">
          <svg viewBox="0 0 120 120"><circle class="trk" cx="60" cy="60" r="52"/><circle class="val" cx="60" cy="60" r="52"
            stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
          <div><b>${doAno.length}</b><small>de ${alvo}</small></div>
        </div>
        <div>
          <p style="margin:0 0 10px">${pct >= 1 ? '🎉 Meta batida! Hora de sonhar mais alto.' : `Faltam <b>${alvo - doAno.length}</b> livros — ${Math.round(pct * 100)}% do caminho.`}</p>
          <label class="lbl">Meta de livros: <input type="number" min="1" max="999" value="${alvo}" data-change="meta"></label>
        </div>
      </div>
      <div class="stat-tiles" style="margin-top:18px">
        <div class="tile"><b>${doAno.length}</b><span>leituras concluídas</span></div>
        <div class="tile"><b>${paginas.toLocaleString('pt-BR')}</b><span>páginas lidas</span></div>
        <div class="tile"><b>${media ? fmtNota(media) : '—'}</b><span>média de estrelas</span></div>
        <div class="tile"><b>${releituras}</b><span>releituras</span></div>
      </div>
    </section>

    <section class="card span-8">
      <h3>Livros por mês <small class="muted" style="font-family:var(--sans);font-weight:500">${ano}</small></h3>
      <div class="bars">${porMes.map((n, i) => `
        <div class="bar ${i === mesAgora ? 'agora' : ''}" title="${MESES_LONGOS[i]}: ${n} livro(s)">
          <b>${n || ''}</b><i style="height:${(n / max) * 120}px;animation-delay:${i * 40}ms"></i><small>${MESES[i]}</small>
        </div>`).join('')}
      </div>
    </section>

    <section class="card span-4">
      <h3>Gêneros em ${ano}</h3>
      ${genTop.length ? `<div class="hbars">${genTop.map(([g, n]) => `
        <div class="hbar"><span>${esc(g)}</span><span class="trk"><i style="width:${(n / genMax) * 100}%"></i></span><b>${n}</b></div>`).join('')}</div>`
        : '<p class="muted">Conclua leituras para ver seus gêneros.</p>'}
    </section>

    ${cit ? `<section class="card quote-card span-6">
      <p class="eyebrow">Citação favorita</p>
      <blockquote>${esc(cit.leitura.citacao)}</blockquote>
      <p class="muted" style="margin:0">— ${esc(cit.livro.titulo)}${cit.livro.autor ? `, ${esc(cit.livro.autor)}` : ''}</p>
    </section>` : ''}

    <section class="card ${cit ? 'span-6' : 'span-12'}">
      <h3>Quero ler <span class="pill quero">${fila.length}</span></h3>
      ${fila.length ? `<div class="fila">${fila.map((l) => `
        <button data-action="abrir" data-id="${l.id}"><div class="tilt">${capaHTML(l)}</div><small>${esc(l.titulo)}</small></button>`).join('')}</div>`
        : '<p class="muted">Sua lista de desejos está vazia.</p>'}
    </section>
  </div>`;
}

function cardLendo(l) {
  const lt = leituraAtual(l);
  const n = numeroLeitura(l, lt);
  const tot = +l.paginas || 0;
  const pag = Math.min(+lt.paginaAtual || 0, tot || Infinity);
  const pct = tot ? Math.round((pag / tot) * 100) : 0;
  const d = dias(lt.inicio, hoje());
  return `<article class="lendo-card" data-action="abrir" data-id="${l.id}">
    <div class="tilt">${capaHTML(l)}</div>
    <div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${n > 1 ? `<span class="pill reler">${ordinal(n)} leitura</span>` : ''}<span class="pill">${d === 1 ? 'começou hoje' : `há ${d} dias`}</span></div>
      <h4>${esc(l.titulo)}</h4>
      <div class="muted">${esc(l.autor)}</div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="prog-row" data-stop>
        <span>pág.</span><input type="number" min="0" ${tot ? `max="${tot}"` : ''} value="${pag}" data-change="progresso" data-id="${l.id}" aria-label="Página atual">
        <span>${tot ? `de ${tot} · <b>${pct}%</b>` : ''}</span>
        <button class="btn small primary" data-action="concluir" data-id="${l.id}" style="margin-left:auto">Terminei!</button>
      </div>
    </div>
  </article>`;
}

/* ----- Estante ----- */
function viewEstante() {
  const cont = { todos: db.livros.length, lendo: 0, quero: 0, lido: 0, reler: 0 };
  db.livros.forEach((l) => { cont[status(l)]++; if (concluidas(l).length > 1 || (leituraAtual(l) && l.leituras.length > 1)) cont.reler++; });
  const chip = (k, t) => `<button class="chip ${ui.filtro === k ? 'ativo' : ''}" data-action="filtro" data-f="${k}">${t}<em>${cont[k]}</em></button>`;
  return `
  <section class="hero"><div><p class="eyebrow">Sua biblioteca</p><h1>A <em>estante</em></h1>
    <p>Passe o mouse nas lombadas para puxar o livro. Clique para abrir.</p></div></section>
  <div class="toolbar">
    <div class="chips">${chip('todos', 'Todos')}${chip('lendo', 'Lendo')}${chip('quero', 'Quero ler')}${chip('lido', 'Lidos')}${chip('reler', 'Releituras')}</div>
    <label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <span class="sr">Buscar</span><input id="busca-estante" type="search" placeholder="Buscar título, autor ou gênero" value="${esc(ui.busca)}"></label>
    <select data-change="ordem" aria-label="Ordenar">
      ${[['recentes', 'Adicionados recentemente'], ['titulo', 'Título (A–Z)'], ['autor', 'Autor (A–Z)'], ['nota', 'Melhor avaliados'], ['paginas', 'Mais páginas']]
        .map(([v, t]) => `<option value="${v}" ${ui.ordem === v ? 'selected' : ''}>${t}</option>`).join('')}
    </select>
    <div class="seg" role="group" aria-label="Visualização">
      <button class="${ui.modo === 'lombadas' ? 'ativo' : ''}" data-action="modo" data-m="lombadas">Lombadas</button>
      <button class="${ui.modo === 'capas' ? 'ativo' : ''}" data-action="modo" data-m="capas">Capas</button>
    </div>
  </div>
  <div id="lista-estante"></div>`;
}

function filtrarLivros() {
  const q = ui.busca.trim().toLowerCase();
  let ls = db.livros.filter((l) => {
    if (ui.filtro === 'reler') { if (!(concluidas(l).length > 1 || (leituraAtual(l) && l.leituras.length > 1))) return false; }
    else if (ui.filtro !== 'todos' && status(l) !== ui.filtro) return false;
    return !q || `${l.titulo} ${l.autor} ${l.genero}`.toLowerCase().includes(q);
  });
  const cmp = {
    recentes: (a, b) => (b.criadoEm || '').localeCompare(a.criadoEm || ''),
    titulo: (a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'),
    autor: (a, b) => (a.autor || '').localeCompare(b.autor || '', 'pt-BR'),
    nota: (a, b) => notaAtual(b) - notaAtual(a),
    paginas: (a, b) => (+b.paginas || 0) - (+a.paginas || 0),
  }[ui.ordem];
  return ls.sort(cmp);
}

function renderLista() {
  const el = $('#lista-estante'); if (!el) return;
  const ls = filtrarLivros();
  if (!ls.length) { el.innerHTML = `<p class="muted" style="text-align:center;padding:40px">Nenhum livro encontrado.</p>`; return; }
  if (ui.filtro === 'todos') {
    el.innerHTML = [['lendo', 'Lendo agora'], ['lido', 'Lidos'], ['quero', 'Quero ler']]
      .map(([s, t]) => { const g = ls.filter((l) => status(l) === s); return g.length ? `<section class="secao-estante"><h2>${t} <small>${g.length}</small></h2>${blocoLivros(g)}</section>` : ''; }).join('');
  } else el.innerHTML = blocoLivros(ls);
}
function blocoLivros(ls) { return ui.modo === 'lombadas' ? estanteHTML(ls) : `<div class="grid-capas">${ls.map(capaCardHTML).join('')}</div>`; }

function estanteHTML(ls) {
  const largura = ($('#app')?.clientWidth || 1000) - 60;
  const porPrat = Math.max(5, Math.floor(largura / 48));
  let out = '';
  for (let i = 0; i < ls.length; i += porPrat) {
    out += `<div class="shelf"><div class="shelf-row">${ls.slice(i, i + porPrat).map(lombadaHTML).join('')}</div><div class="plank"></div></div>`;
  }
  return out;
}
function lombadaHTML(l) {
  const p = Math.min(+l.paginas || 280, 1000);
  const h = Math.round(175 + (p / 1000) * 60 + (hash(l.titulo) % 20));
  const w = Math.round(30 + (p / 1000) * 26);
  const cor = corDe(l);
  const releu = concluidas(l).length > 1;
  return `<button class="spine" data-action="abrir" data-id="${l.id}" style="--c:${cor};--t:${textoSobre(cor)};--h:${h}px;--w:${w}px"
      title="${esc(l.titulo)} — ${esc(l.autor)}">
    ${status(l) === 'lendo' ? '<span class="marcador"></span>' : ''}
    <span class="spine-face"><span class="st">${esc(l.titulo)}</span><span class="sa">${esc((l.autor || '').split(' ').slice(-1)[0])}</span></span>
    ${releu ? `<span class="reread">↻${concluidas(l).length}</span>` : ''}
    <span class="spine-peek">${capaHTML(l)}</span>
  </button>`;
}
function capaCardHTML(l) {
  const nota = notaAtual(l);
  const n = concluidas(l).length;
  return `<button class="capa-card" data-action="abrir" data-id="${l.id}">
    <div class="capa-wrap tilt">${capaHTML(l)}<div class="badges">${status(l) !== 'lido' ? pillStatus(l) : ''}${n > 1 ? `<span class="pill reler">↻ ${n}x</span>` : ''}</div></div>
    <div class="info"><strong>${esc(l.titulo)}</strong><small>${esc(l.autor)}</small>${nota ? starsHTML(nota, { size: 'sm' }) : ''}</div>
  </button>`;
}

/* ----- Diário ----- */
function viewDiario() {
  const itens = todasLeituras();
  const andamento = itens.filter((x) => !x.leitura.fim);
  const feitas = itens.filter((x) => x.leitura.fim).sort((a, b) => b.leitura.fim.localeCompare(a.leitura.fim));
  let html = `<section class="hero"><div><p class="eyebrow">Linha do tempo</p><h1>Diário de <em>leituras</em></h1>
    <p>Cada leitura (e releitura) fica registrada com a avaliação daquele momento.</p></div></section><div class="timeline">`;
  if (andamento.length) {
    html += `<div class="t-mes">Em andamento</div>` + andamento.map(itemDiario).join('');
  }
  let anoAtual = null, mesAtual = null;
  feitas.forEach((x) => {
    const [a, m] = x.leitura.fim.split('-');
    if (a !== anoAtual) {
      anoAtual = a; mesAtual = null;
      const qtd = feitas.filter((y) => y.leitura.fim.startsWith(a)).length;
      html += `<h2 class="t-ano">${a} <small>${qtd} ${qtd === 1 ? 'leitura' : 'leituras'}</small></h2>`;
    }
    if (m !== mesAtual) { mesAtual = m; html += `<div class="t-mes">${MESES_LONGOS[+m - 1]}</div>`; }
    html += itemDiario(x);
  });
  if (!itens.length) html += `<p class="muted">Nenhuma leitura registrada ainda.</p>`;
  return html + '</div>';
}
function itemDiario({ livro, leitura, n }) {
  const det = leitura.fim
    ? `${fmtData(leitura.inicio)} → ${fmtData(leitura.fim)} · ${dias(leitura.inicio, leitura.fim)} dias`
    : `desde ${fmtData(leitura.inicio)} · pág. ${leitura.paginaAtual || 0}${livro.paginas ? ` de ${livro.paginas}` : ''}`;
  return `<article class="card t-item" data-action="abrir" data-id="${livro.id}" data-lid="${leitura.id}">
    <div class="tilt">${capaHTML(livro)}</div>
    <div><h4>${esc(livro.titulo)}</h4><p>${esc(livro.autor)} · ${det}</p>${leitura.citacao ? `<q>${esc(leitura.citacao)}</q>` : ''}</div>
    <div class="t-side">${n > 1 ? `<span class="pill reler">${ordinal(n)} leitura</span>` : ''}${leitura.fim ? (leitura.estrelas ? starsHTML(leitura.estrelas) : '<span class="muted">sem nota</span>') : '<span class="pill lendo">Lendo</span>'}</div>
  </article>`;
}

/* ---------------- Detalhe do livro ---------------- */
function abrirDetalhe(id, lid) {
  ui.aberto = id;
  const l = acharLivro(id); if (!l) return;
  const ord = [...l.leituras].sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));
  ui.aba = lid || (ord.length ? ord[ord.length - 1].id : null);
  renderDetalhe();
  const d = $('#modal-detalhe'); if (!d.open) d.showModal();
}
function renderDetalhe() {
  const l = acharLivro(ui.aberto); if (!l) { $('#modal-detalhe').close(); return; }
  const st = status(l);
  const ord = [...l.leituras].sort((a, b) => (a.inicio || '').localeCompare(b.inicio || ''));
  const atual = leituraAtual(l);
  const cor = corDe(l);
  const conc = concluidas(l).filter((x) => x.estrelas);

  let acoes = '';
  if (st === 'quero') acoes = `<button class="btn primary" data-action="comecar" data-id="${l.id}">▶ Começar a ler</button>
      <button class="btn" data-action="leitura-passada" data-id="${l.id}">Já li — registrar</button>`;
  if (st === 'lendo') acoes = `<button class="btn primary" data-action="concluir" data-id="${l.id}">✓ Terminei — avaliar</button>`;
  if (st === 'lido') acoes = `<button class="btn primary" data-action="reler" data-id="${l.id}">↻ Reler este livro</button>
      <button class="btn" data-action="leitura-passada" data-id="${l.id}">＋ Registrar leitura antiga</button>`;

  let progresso = '';
  if (atual) {
    const tot = +l.paginas || 0; const pct = tot ? Math.round(((+atual.paginaAtual || 0) / tot) * 100) : 0;
    progresso = `<div><div class="progress"><span style="width:${pct}%"></span></div>
      <div class="prog-row"><span>pág.</span><input type="number" min="0" ${tot ? `max="${tot}"` : ''} value="${+atual.paginaAtual || 0}" data-change="progresso" data-id="${l.id}" aria-label="Página atual"><span>${tot ? `de ${tot} · ${pct}%` : ''}</span></div></div>`;
  }

  const evolucao = conc.length > 1 ? `<div class="evolucao"><span class="lbl" style="width:100%">Evolução da nota</span>${conc.map((x, i) => {
    const d = i ? x.estrelas - conc[i - 1].estrelas : 0;
    return `${i ? '<span class="seta">→</span>' : ''}<span class="ev">${ordinal(numeroLeitura(l, x))} ★ ${fmtNota(x.estrelas)} ${d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '▲' : '▼'}${fmtNota(Math.abs(d))}</span>` : ''}</span>`;
  }).join('')}</div>` : '';

  $('#modal-detalhe').innerHTML = `<div class="detalhe" style="--c:${cor}">
    <aside class="detalhe-side">
      <div class="tilt">${capaHTML(l)}</div>
      <div style="text-align:center">${pillStatus(l)}</div>
      ${progresso}
      <div class="acoes">${acoes}
        <button class="btn ghost" data-action="editar-livro" data-id="${l.id}">✎ Editar livro</button>
        <button class="btn ghost danger" data-action="excluir-livro" data-id="${l.id}">Excluir</button>
      </div>
    </aside>
    <div class="detalhe-main">
      <button class="x" data-action="fechar" aria-label="Fechar">×</button>
      <p class="eyebrow">${[l.genero, l.paginas ? `${l.paginas} páginas` : ''].filter(Boolean).map(esc).join(' · ') || 'Livro'}</p>
      <h2>${esc(l.titulo)}</h2>
      <p class="autor">${esc(l.autor) || 'Autor desconhecido'}</p>
      ${notaAtual(l) ? `<div style="display:flex;align-items:center;gap:12px">${starsHTML(notaAtual(l), { size: 'lg' })}<b style="font-family:var(--serif);font-size:1.5rem">${fmtNota(notaAtual(l))}</b>${conc.length > 1 ? '<span class="muted">nota mais recente</span>' : ''}</div>` : ''}
      ${evolucao}
      ${ord.length ? `<div class="leitura-tabs" role="tablist">${ord.map((x, i) => `
        <button role="tab" class="${x.id === ui.aba ? 'ativo' : ''}" data-action="aba" data-lid="${x.id}">${ordinal(i + 1)} leitura ${x.fim ? (x.estrelas ? `<span style="color:var(--gold)">★</span>${fmtNota(x.estrelas)}` : '') : '<span class="pill lendo">agora</span>'}</button>`).join('')}</div>
        ${paginaLeitura(l, ord.find((x) => x.id === ui.aba) || ord[ord.length - 1], ord)}`
        : `<div class="journal" style="padding:28px;text-align:center"><p class="muted" style="margin:0">Ainda não há leituras deste livro. Quando começar, sua página de diário aparece aqui.</p></div>`}
    </div>
  </div>`;
}

function paginaLeitura(l, x, ord) {
  const idx = ord.indexOf(x);
  const ant = ord.slice(0, idx).reverse().find((y) => y.fim);
  const delta = (k) => {
    if (!ant || !x.criterios?.[k] || !ant.criterios?.[k]) return '';
    const d = x.criterios[k] - ant.criterios[k];
    return d ? `<span class="delta ${d > 0 ? 'up' : 'down'}" title="vs. ${ordinal(numeroLeitura(l, ant))} leitura">${d > 0 ? '▲' : '▼'}${fmtNota(Math.abs(d))}</span>` : '';
  };
  const temCrit = CRITERIOS.some(([k]) => x.criterios?.[k]);
  return `<div class="journal">
    <div class="jrow"><span class="jlbl">período</span><span class="jval">${fmtData(x.inicio)} → ${x.fim ? fmtData(x.fim) : 'em andamento'}${x.fim && x.inicio ? ` <span class="muted">(${dias(x.inicio, x.fim)} dias)</span>` : ''}</span></div>
    <div class="jrow"><span class="jlbl">nota</span>${x.estrelas ? starsHTML(x.estrelas, { size: 'lg' }) : '<span class="muted">ainda sem nota</span>'}</div>
    ${temCrit ? `<div class="jrow"><span class="jlbl">critérios</span><div class="crit-grid">${CRITERIOS.map(([k, t]) => `
      <div class="crit"><span>${t} ${delta(k)}</span>${starsHTML(x.criterios?.[k] || 0, { variant: 'blue', size: 'sm' })}</div>`).join('')}</div></div>` : ''}
    ${x.personagem ? `<div class="jrow"><span class="jlbl">personagem fav.</span><span class="jval">${esc(x.personagem)}</span></div>` : ''}
    ${x.citacao ? `<div class="jrow"><span class="jlbl">citação fav.</span><blockquote>“${esc(x.citacao)}”</blockquote></div>` : ''}
    ${x.notas ? `<div class="jrow"><span class="jlbl">impressões</span><div class="notas">${esc(x.notas)}</div></div>` : ''}
    ${x.recomenda != null ? `<div class="jrow"><span class="jlbl">recomendaria?</span><span class="rec ${x.recomenda ? 'sim' : ''}">✓</span><span class="rec ${x.recomenda ? '' : 'nao'}">✕</span></div>` : ''}
  </div>
  <div class="leitura-acoes">
    <button class="btn small" data-action="editar-leitura" data-id="${l.id}" data-lid="${x.id}">✎ ${x.fim ? 'Editar esta avaliação' : 'Editar leitura'}</button>
    <button class="btn small ghost danger" data-action="excluir-leitura" data-id="${l.id}" data-lid="${x.id}">Excluir esta leitura</button>
  </div>`;
}

/* ---------------- Ações de leitura ---------------- */
function novaLeitura(extra = {}) {
  return { id: uid(), inicio: hoje(), fim: null, paginaAtual: 0, estrelas: 0, criterios: {}, personagem: '', citacao: '', notas: '', recomenda: null, ...extra };
}
function comecar(id) {
  const l = acharLivro(id);
  const lt = novaLeitura(); l.leituras.push(lt); salvar();
  toast(`Boa leitura! “${l.titulo}” está em Lendo agora.`);
  abrirDetalhe(id, lt.id); render();
}
function reler(id) {
  const l = acharLivro(id);
  const n = l.leituras.length + 1;
  const lt = novaLeitura(); l.leituras.push(lt); salvar();
  toast(`${ordinal(n)} leitura iniciada — suas avaliações anteriores continuam guardadas.`);
  abrirDetalhe(id, lt.id); render();
}

/* ---------------- Formulário: livro ---------------- */
function abrirFormLivro(id = null) {
  const l = id ? acharLivro(id) : null;
  ui.formLivro = { id, capa: l?.capa || '', cor: l?.cor || '' };
  ui.resultados = [];
  const d = $('#modal-livro');
  d.innerHTML = `<form method="dialog" id="form-livro">
    <div class="modal-head"><h2>${l ? 'Editar livro' : 'Novo livro'}</h2><button type="button" class="x" data-action="fechar" aria-label="Fechar">×</button></div>
    <div class="modal-body">
      <div class="field">
        <label for="q-online">Buscar dados e capa online</label>
        <div class="busca-online"><input id="q-online" type="search" placeholder="Ex.: Torto Arado" value="${esc(l?.titulo || '')}">
          <button type="button" class="btn" data-action="buscar-online">Buscar</button></div>
        <div class="resultados" id="resultados"></div>
      </div>
      <div class="capa-editor">
        <div id="capa-preview"></div>
        <div>
          <span class="lbl">Capa</span>
          <div class="acoes">
            <label class="btn small">Enviar imagem<input type="file" accept="image/*" id="capa-arquivo" hidden></label>
            <button type="button" class="btn small" data-action="capa-url">Colar link</button>
            <button type="button" class="btn small ghost" data-action="remover-capa">Remover</button>
          </div>
          <p class="muted" style="font-size:.8rem;margin:8px 0 0">Sem capa? Geramos uma com a cor do livro. A cor da capa também pinta a lombada na estante.</p>
        </div>
      </div>
      <div class="field"><label for="f-titulo">Título *</label><input id="f-titulo" name="titulo" required value="${esc(l?.titulo || '')}"></div>
      <div class="row3">
        <div class="field"><label for="f-autor">Autor(a)</label><input id="f-autor" name="autor" value="${esc(l?.autor || '')}"></div>
        <div class="field"><label for="f-paginas">Páginas</label><input id="f-paginas" name="paginas" type="number" min="1" value="${esc(l?.paginas || '')}"></div>
      </div>
      <div class="field"><label for="f-genero">Gênero</label><input id="f-genero" name="genero" list="lista-generos" value="${esc(l?.genero || '')}">
        <datalist id="lista-generos">${GENEROS.map((g) => `<option value="${g}">`).join('')}</datalist></div>
      ${l ? '' : `<div class="field"><span class="lbl">Status</span><div class="radio-cards">
        <label><input type="radio" name="status" value="quero" checked><span>🔖</span>Quero ler</label>
        <label><input type="radio" name="status" value="lendo"><span>📖</span>Lendo agora</label>
        <label><input type="radio" name="status" value="lido"><span>✅</span>Já li</label>
      </div></div>`}
    </div>
    <div class="modal-foot"><button type="button" class="btn ghost" data-action="fechar">Cancelar</button><button class="btn primary" type="submit">${l ? 'Salvar' : 'Adicionar à estante'}</button></div>
  </form>`;
  atualizarPreviewCapa();
  d.showModal();
  $('#f-titulo').focus();
}
function atualizarPreviewCapa() {
  const f = $('#form-livro'); if (!f) return;
  const fake = { titulo: f.titulo.value || 'Título', autor: f.autor.value || '', capa: ui.formLivro.capa, cor: ui.formLivro.cor };
  $('#capa-preview').innerHTML = `<div class="tilt">${capaHTML(fake)}</div>`;
}
function salvarLivro(form) {
  const dados = {
    titulo: form.titulo.value.trim(), autor: form.autor.value.trim(), genero: form.genero.value.trim(),
    paginas: form.paginas.value ? +form.paginas.value : '', capa: ui.formLivro.capa, cor: ui.formLivro.cor,
  };
  if (!dados.titulo) return;
  let l;
  if (ui.formLivro.id) {
    l = acharLivro(ui.formLivro.id); Object.assign(l, dados);
    toast('Livro atualizado.');
  } else {
    l = { id: uid(), criadoEm: new Date().toISOString(), leituras: [], ...dados };
    db.livros.push(l);
    const st = form.status?.value;
    if (st === 'lendo') l.leituras.push(novaLeitura());
    toast(`“${l.titulo}” entrou na estante!`);
    salvar(); $('#modal-livro').close(); render();
    if (st === 'lido') { abrirFormLeitura(l.id, null, { passada: true }); return; }
    abrirDetalhe(l.id); return;
  }
  salvar(); $('#modal-livro').close(); render();
  if ($('#modal-detalhe').open) renderDetalhe();
}

/* Capa: arquivo, link, busca online */
function processarImagem(src, cors) {
  return new Promise((resolve) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const w = Math.min(360, img.naturalWidth), h = Math.round(img.naturalHeight * (w / img.naturalWidth));
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
        const m = document.createElement('canvas'); m.width = m.height = 8;
        const mx = m.getContext('2d'); mx.drawImage(img, 0, 0, 8, 8);
        const px = mx.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0;
        for (let i = 0; i < px.length; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
        const n = px.length / 4; const k = 0.85; // escurece um pouco para a lombada
        const hex = (v) => Math.round((v / n) * k).toString(16).padStart(2, '0');
        resolve({ src: c.toDataURL('image/jpeg', 0.82), cor: `#${hex(r)}${hex(g)}${hex(b)}` });
      } catch (e) { resolve({ src, cor: '' }); } // imagem sem CORS: guarda o link
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}
async function definirCapa(src, cors) {
  $('#capa-preview').innerHTML = '<span class="loading"></span>';
  const r = await processarImagem(src, cors);
  if (!r) { toast('Não consegui carregar essa imagem.', 'erro'); atualizarPreviewCapa(); return; }
  ui.formLivro.capa = r.src; ui.formLivro.cor = r.cor || ui.formLivro.cor;
  atualizarPreviewCapa();
}
async function buscarOnline() {
  const q = $('#q-online').value.trim(); if (!q) return;
  const box = $('#resultados'); box.innerHTML = '<span class="loading"></span>';
  const enc = encodeURIComponent(q);
  const [gb, ol] = await Promise.allSettled([
    fetch(`https://www.googleapis.com/books/v1/volumes?q=${enc}&maxResults=12&printType=books`).then((r) => r.json()),
    fetch(`https://openlibrary.org/search.json?q=${enc}&limit=10&fields=title,author_name,cover_i,number_of_pages_median,subject`).then((r) => r.json()),
  ]);
  const res = [];
  if (gb.status === 'fulfilled') (gb.value.items || []).forEach(({ volumeInfo: v = {} }) => {
    const t = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
    res.push({ titulo: v.title, autor: (v.authors || []).join(', '), paginas: v.pageCount || '', genero: '',
      capa: t ? t.replace('http:', 'https:').replace('&edge=curl', '') : '' });
  });
  if (ol.status === 'fulfilled') (ol.value.docs || []).forEach((d) => res.push({
    titulo: d.title, autor: (d.author_name || []).slice(0, 2).join(', '), paginas: d.number_of_pages_median || '', genero: '',
    capa: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : '',
  }));
  ui.resultados = res.filter((r) => r.titulo);
  if (!ui.resultados.length) { box.innerHTML = '<p class="muted" style="grid-column:1/-1">Nada encontrado. Preencha manualmente 🙂</p>'; return; }
  box.innerHTML = ui.resultados.map((r, i) => `<button type="button" data-action="escolher-resultado" data-i="${i}">
    ${r.capa ? `<img src="${esc(r.capa)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : `<div style="aspect-ratio:2/3;border-radius:4px;margin-bottom:4px;background:${PALETA[i % PALETA.length]}"></div>`}
    <b>${esc(r.titulo).slice(0, 40)}</b><br><span class="muted">${esc(r.autor).slice(0, 30)}</span></button>`).join('');
}
function escolherResultado(i) {
  const r = ui.resultados[i]; const f = $('#form-livro'); if (!r || !f) return;
  f.titulo.value = r.titulo || f.titulo.value;
  if (r.autor) f.autor.value = r.autor;
  if (r.paginas) f.paginas.value = r.paginas;
  $('#resultados').innerHTML = '';
  if (r.capa) definirCapa(r.capa, true); else atualizarPreviewCapa();
}

/* ---------------- Formulário: leitura / avaliação ---------------- */
function abrirFormLeitura(livroId, leituraId, { concluir = false, passada = false } = {}) {
  const l = acharLivro(livroId);
  let x = leituraId ? l.leituras.find((y) => y.id === leituraId) : null;
  if (concluir && !x) x = leituraAtual(l);
  const base = x ? { ...x, criterios: { ...x.criterios } } : novaLeitura({ inicio: '', fim: hoje() });
  if (concluir && !base.fim) base.fim = hoje();
  const n = x ? numeroLeitura(l, x) : l.leituras.length + 1;
  ui.formLeitura = { livroId, leituraId: x?.id || null, concluir, passada };
  const titulo = concluir ? `Terminou! Como foi a ${ordinal(n)} leitura?` : x ? `${ordinal(n)} leitura` : `Registrar ${ordinal(n)} leitura`;
  const d = $('#modal-leitura');
  d.innerHTML = `<form method="dialog" id="form-leitura">
    <div class="modal-head"><div><p class="eyebrow" style="margin:0">${esc(l.titulo)}</p><h2>${titulo}</h2></div><button type="button" class="x" data-action="fechar" aria-label="Fechar">×</button></div>
    <div class="modal-body">
      <div class="row">
        <div class="field"><label for="l-inicio">Comecei em</label><input id="l-inicio" type="date" name="inicio" value="${base.inicio || ''}"></div>
        <div class="field"><label for="l-fim">Terminei em ${!concluir && !passada ? '<span class="muted">(vazio = lendo)</span>' : ''}</label><input id="l-fim" type="date" name="fim" value="${base.fim || ''}" ${concluir || passada ? 'required' : ''}></div>
      </div>
      ${!concluir && !passada && !base.fim ? `<div class="field"><label for="l-pag">Página atual</label><input id="l-pag" type="number" min="0" name="paginaAtual" value="${base.paginaAtual || 0}"></div>` : ''}
      <div class="nota-geral"><span class="lbl" style="font-size:.95rem;color:var(--ink)">Nota geral</span>${starsHTML(base.estrelas || 0, { input: true, name: 'estrelas', size: 'xl' })}</div>
      <p class="lbl" style="margin:0 0 6px">Critérios <span class="muted" style="font-weight:500">— clique na metade da estrela para meia nota</span></p>
      <div class="crit-grid" style="margin-bottom:16px">${CRITERIOS.map(([k, t]) => `<div class="crit"><span>${t}</span>${starsHTML(base.criterios[k] || 0, { input: true, name: k, variant: 'blue' })}</div>`).join('')}</div>
      <div class="field"><label for="l-pers">Personagem favorito</label><input id="l-pers" name="personagem" value="${esc(base.personagem)}"></div>
      <div class="field"><label for="l-cit">Citação favorita</label><textarea id="l-cit" name="citacao" rows="2">${esc(base.citacao)}</textarea></div>
      <div class="field"><label for="l-notas">Impressões / resenha</label><textarea id="l-notas" name="notas" rows="4" placeholder="O que ficou com você?">${esc(base.notas)}</textarea></div>
      <div class="field"><span class="lbl">Recomendaria?</span><div class="seg-rec">
        <label><input type="radio" name="recomenda" value="sim" ${base.recomenda === true ? 'checked' : ''}>👍 Sim</label>
        <label><input type="radio" name="recomenda" value="nao" ${base.recomenda === false ? 'checked' : ''}>👎 Não</label>
        <label><input type="radio" name="recomenda" value="" ${base.recomenda == null ? 'checked' : ''}>Sem opinião</label>
      </div></div>
    </div>
    <div class="modal-foot"><button type="button" class="btn ghost" data-action="fechar">Cancelar</button><button class="btn primary" type="submit">${concluir ? 'Concluir leitura 🎉' : 'Salvar'}</button></div>
  </form>`;
  d.showModal();
}
function salvarLeitura(form) {
  const { livroId, leituraId, concluir } = ui.formLeitura;
  const l = acharLivro(livroId);
  const inicio = form.inicio.value, fim = form.fim.value || null;
  if (inicio && fim && fim < inicio) { toast('A data de término é antes do início.', 'erro'); return; }
  const crit = {};
  form.querySelectorAll('.stars.input').forEach((s) => { if (s.dataset.name !== 'estrelas') crit[s.dataset.name] = +s.dataset.value; });
  const rec = form.recomenda.value;
  const dados = {
    inicio: inicio || fim || hoje(), fim,
    estrelas: +form.querySelector('.stars.input[data-name="estrelas"]').dataset.value,
    criterios: crit, personagem: form.personagem.value.trim(), citacao: form.citacao.value.trim(), notas: form.notas.value.trim(),
    recomenda: rec === '' ? null : rec === 'sim',
  };
  if (form.paginaAtual) dados.paginaAtual = +form.paginaAtual.value || 0;
  if (!fim && leituraAtual(l) && leituraAtual(l).id !== leituraId) { toast('Já existe uma leitura em andamento deste livro.', 'erro'); return; }
  let x;
  if (leituraId) { x = l.leituras.find((y) => y.id === leituraId); Object.assign(x, dados); }
  else { x = novaLeitura(dados); l.leituras.push(x); }
  if (x.fim && l.paginas) x.paginaAtual = +l.paginas;
  salvar();
  $('#modal-leitura').close();
  if (concluir) { confete(); toast(`Leitura concluída! ${x.estrelas ? '★ ' + fmtNota(x.estrelas) : ''}`); }
  else toast('Leitura salva.');
  render();
  abrirDetalhe(livroId, x.id);
}

/* ---------------- Interação: estrelas ---------------- */
function valorDoPonteiro(starsEl, e) {
  const st = e.target.closest('.star'); if (!st) return null;
  const r = st.getBoundingClientRect();
  return +st.dataset.i + ((e.clientX - r.left) < r.width / 2 ? 0.5 : 1);
}
document.addEventListener('pointermove', (e) => {
  const s = e.target.closest('.stars.input');
  if (s) { const v = valorDoPonteiro(s, e); if (v != null) pintarEstrelas(s, v); }
  // efeito 3D nas capas
  const t = e.target.closest('.tilt');
  if (t && e.pointerType === 'mouse') {
    const r = t.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    t.style.setProperty('--ry', `${(px - 0.5) * 22}deg`); t.style.setProperty('--rx', `${(0.5 - py) * 18}deg`);
    t.style.setProperty('--mx', `${px * 100}%`); t.style.setProperty('--my', `${py * 100}%`); t.style.setProperty('--glare', 1);
  }
});
document.addEventListener('pointerout', (e) => {
  const s = e.target.closest('.stars.input');
  if (s && !s.contains(e.relatedTarget)) pintarEstrelas(s, +s.dataset.value);
  const t = e.target.closest('.tilt');
  if (t && !t.contains(e.relatedTarget)) { ['--rx', '--ry'].forEach((p) => t.style.setProperty(p, '0deg')); t.style.setProperty('--glare', 0); }
});
function definirEstrelas(s, v) {
  v = Math.max(0, Math.min(5, v));
  s.dataset.value = v; s.setAttribute('aria-valuenow', v); pintarEstrelas(s, v);
  s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop');
}
document.addEventListener('keydown', (e) => {
  const s = e.target.closest?.('.stars.input'); if (!s) return;
  const v = +s.dataset.value;
  if (['ArrowRight', 'ArrowUp'].includes(e.key)) { definirEstrelas(s, v + 0.5); e.preventDefault(); }
  if (['ArrowLeft', 'ArrowDown'].includes(e.key)) { definirEstrelas(s, v - 0.5); e.preventDefault(); }
  if (e.key === 'Delete' || e.key === 'Backspace' || e.key === '0') { definirEstrelas(s, 0); e.preventDefault(); }
});

/* ---------------- Delegação de eventos ---------------- */
const acoes = {
  nav: (t, e) => { e.preventDefault(); ui.view = t.dataset.view; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  'novo-livro': () => abrirFormLivro(),
  abrir: (t) => abrirDetalhe(t.dataset.id, t.dataset.lid),
  filtro: (t) => { ui.filtro = t.dataset.f; render(); },
  modo: (t) => { ui.modo = t.dataset.m; render(); },
  comecar: (t) => comecar(t.dataset.id),
  concluir: (t) => abrirFormLeitura(t.dataset.id, null, { concluir: true }),
  reler: (t) => reler(t.dataset.id),
  'leitura-passada': (t) => abrirFormLeitura(t.dataset.id, null, { passada: true }),
  'editar-leitura': (t) => abrirFormLeitura(t.dataset.id, t.dataset.lid),
  'excluir-leitura': (t) => {
    const l = acharLivro(t.dataset.id);
    if (!confirm('Excluir esta leitura e a avaliação dela? As outras leituras não são afetadas.')) return;
    l.leituras = l.leituras.filter((x) => x.id !== t.dataset.lid); salvar(); ui.aba = null; abrirDetalhe(l.id); render();
  },
  'editar-livro': (t) => abrirFormLivro(t.dataset.id),
  'excluir-livro': (t) => {
    const l = acharLivro(t.dataset.id);
    if (!confirm(`Excluir “${l.titulo}” e todas as ${l.leituras.length} leitura(s)?`)) return;
    db.livros = db.livros.filter((x) => x.id !== l.id); salvar(); $('#modal-detalhe').close(); render(); toast('Livro excluído.');
  },
  aba: (t) => { ui.aba = t.dataset.lid; renderDetalhe(); },
  fechar: (t) => t.closest('dialog').close(),
  'buscar-online': () => buscarOnline(),
  'escolher-resultado': (t) => escolherResultado(+t.dataset.i),
  'capa-url': () => { const u = prompt('Cole o link (URL) da imagem da capa:'); if (u) definirCapa(u.trim(), true); },
  'remover-capa': () => { ui.formLivro.capa = ''; ui.formLivro.cor = ''; atualizarPreviewCapa(); },
  tema: () => {
    const escuro = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
    db.tema = escuro ? 'light' : 'dark'; aplicarTema(); salvar();
  },
  exportar: () => {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `minhas-leituras-${hoje()}.json` });
    a.click(); URL.revokeObjectURL(a.href); fecharMenu();
  },
  importar: () => { $('#importar-arquivo').click(); fecharMenu(); },
  exemplos: () => {
    if (db.livros.length && !confirm('Isso adiciona os livros de exemplo à sua estante. Continuar?')) return;
    db.livros.push(...exemplos()); db.metas[new Date().getFullYear()] ||= 24; salvar(); render(); fecharMenu(); toast('Exemplos carregados — explore à vontade!');
  },
  limpar: () => { if (confirm('Apagar TODOS os livros e leituras? Exporte um backup antes.')) { db.livros = []; salvar(); render(); } fecharMenu(); },
};
document.addEventListener('click', (e) => {
  const s = e.target.closest('.stars.input');
  if (s) { const v = valorDoPonteiro(s, e); if (v != null) definirEstrelas(s, v === +s.dataset.value ? 0 : v); return; }
  const t = e.target.closest('[data-action]');
  const stop = e.target.closest('[data-stop]');
  if (stop && t && t.contains(stop)) return; // cliques dentro de controles internos de um card
  if (t && acoes[t.dataset.action]) acoes[t.dataset.action](t, e);
  if (!e.target.closest('.menu')) fecharMenu();
});
// fecha modal clicando no fundo
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

document.addEventListener('change', (e) => {
  const t = e.target;
  const k = t.dataset.change;
  if (k === 'progresso') {
    const l = acharLivro(t.dataset.id); const lt = leituraAtual(l); if (!lt) return;
    lt.paginaAtual = Math.max(0, +t.value || 0); salvar();
    if (l.paginas && lt.paginaAtual >= +l.paginas) { toast('Chegou na última página! Hora de avaliar 🎉'); abrirFormLeitura(l.id, null, { concluir: true }); }
    render(); if ($('#modal-detalhe').open) renderDetalhe();
  }
  if (k === 'meta') { db.metas[ui.ano] = Math.max(1, +t.value || 1); salvar(); render(); }
  if (k === 'ano') { ui.ano = +t.value; render(); }
  if (k === 'ordem') { ui.ordem = t.value; renderLista(); }
  if (t.id === 'capa-arquivo' && t.files[0]) {
    const r = new FileReader(); r.onload = () => definirCapa(r.result, false); r.readAsDataURL(t.files[0]);
  }
  if (t.id === 'importar-arquivo' && t.files[0]) {
    t.files[0].text().then((txt) => {
      const d = JSON.parse(txt);
      if (!Array.isArray(d.livros)) throw new Error();
      if (!confirm(`Importar ${d.livros.length} livros? Isso substitui a estante atual.`)) return;
      db = { metas: {}, tema: db.tema, ...d }; salvar(); render(); toast('Backup importado!');
    }).catch(() => toast('Arquivo inválido.', 'erro')).finally(() => { t.value = ''; });
  }
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'busca-estante') { ui.busca = e.target.value; renderLista(); }
  if (e.target.form?.id === 'form-livro' && ['titulo', 'autor'].includes(e.target.name)) atualizarPreviewCapa();
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'form-livro') { e.preventDefault(); salvarLivro(e.target); }
  if (e.target.id === 'form-leitura') { e.preventDefault(); salvarLeitura(e.target); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'q-online') { e.preventDefault(); buscarOnline(); }
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('article[data-action]')) { e.preventDefault(); e.target.click(); }
});
$('#modal-detalhe').addEventListener('close', () => { ui.aberto = null; });
let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => ui.view === 'estante' && renderLista(), 200); });

function fecharMenu() { document.querySelectorAll('.menu[open]').forEach((m) => m.removeAttribute('open')); }
function aplicarTema() {
  if (db.tema) document.documentElement.dataset.theme = db.tema; else delete document.documentElement.dataset.theme;
}

/* ---------------- Feedback ---------------- */
function toast(msg, tipo = '') {
  const el = document.createElement('div'); el.className = `toast ${tipo}`; el.textContent = msg;
  $('#toasts').appendChild(el); setTimeout(() => el.remove(), 3800);
}
function confete() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cores = ['#f2b705', '#b4532a', '#2f6db3', '#e9437a', '#3a8a4f', '#8a4fd1'];
  for (let i = 0; i < 110; i++) {
    const c = document.createElement('i'); c.className = 'confete';
    c.style.background = cores[i % cores.length];
    document.body.appendChild(c);
    const x0 = innerWidth / 2, y0 = innerHeight * 0.55;
    const ang = Math.random() * Math.PI * 2, v = 200 + Math.random() * 380;
    const dx = Math.cos(ang) * v, dy = Math.sin(ang) * v - 280;
    c.animate([
      { transform: `translate(${x0}px, ${y0}px) rotate(0)`, opacity: 1 },
      { transform: `translate(${x0 + dx}px, ${y0 + dy + 520}px) rotate(${Math.random() * 900}deg)`, opacity: 0 },
    ], { duration: 1400 + Math.random() * 900, easing: 'cubic-bezier(.15,.6,.4,1)' }).onfinish = () => c.remove();
  }
}

/* ---------------- Exemplos ---------------- */
function exemplos() {
  const L = (titulo, autor, genero, paginas, leituras = [], dias = 0) => ({
    id: uid(), titulo, autor, genero, paginas, capa: '', cor: '',
    criadoEm: new Date(Date.now() - dias * 864e5).toISOString(),
    leituras: leituras.map((x) => novaLeitura({ criterios: {}, ...x })),
  });
  return [
    L('Corte de espinhos e rosas', 'Sarah J. Maas', 'Fantasia', 419, [
      { inicio: '2024-12-02', fim: '2024-12-20', estrelas: 5, criterios: { tensao: 5, conteudo: 5, tristeza: 5, romance: 5, humor: 1, final: 4 },
        personagem: 'Tamlin e Feyre', citacao: 'Be glad of your human heart, Feyre. Pity those who don’t feel anything at all.', recomenda: true },
      { inicio: '2026-09-03', fim: '2026-09-15', estrelas: 4, criterios: { tensao: 4, conteudo: 4, tristeza: 3.5, romance: 3, humor: 2, final: 4.5 },
        personagem: 'Rhysand', notas: 'Na releitura o Tamlin perdeu o encanto — dá pra ver tudo que o livro está preparando para o próximo.', recomenda: true },
    ], 30),
    L('Dom Casmurro', 'Machado de Assis', 'Clássico', 256, [
      { inicio: '2025-03-01', fim: '2025-03-18', estrelas: 4.5, criterios: { tensao: 3, conteudo: 5, tristeza: 3, romance: 4, humor: 3, final: 5 },
        personagem: 'Capitu', citacao: 'Olhos de cigana oblíqua e dissimulada.', recomenda: true },
    ], 120),
    L('Torto Arado', 'Itamar Vieira Junior', 'Literatura brasileira', 264, [{ inicio: '2026-11-01', paginaAtual: 132 }], 12),
    L('A hora da estrela', 'Clarice Lispector', 'Literatura brasileira', 88, [
      { inicio: '2025-06-10', fim: '2025-06-14', estrelas: 4, criterios: { tensao: 2, conteudo: 5, tristeza: 4, romance: 1, humor: 1.5, final: 4 }, personagem: 'Macabéa', recomenda: true },
      { inicio: '2026-05-02', fim: '2026-05-05', estrelas: 5, criterios: { tensao: 2.5, conteudo: 5, tristeza: 5, romance: 1, humor: 2, final: 5 }, personagem: 'Macabéa',
        notas: 'Na segunda vez entendi o Rodrigo S.M. Que livro.', recomenda: true },
    ], 90),
    L('Quarto de despejo', 'Carolina Maria de Jesus', 'Biografia', 200, [
      { inicio: '2026-02-01', fim: '2026-02-12', estrelas: 5, criterios: { conteudo: 5, tristeza: 5, final: 4 }, citacao: 'A fome também é professora.', recomenda: true },
    ], 200),
    L('Ensaio sobre a cegueira', 'José Saramago', 'Ficção', 312, [
      { inicio: '2026-07-04', fim: '2026-07-25', estrelas: 4.5, criterios: { tensao: 5, conteudo: 5, tristeza: 4.5, romance: 1.5, humor: 1, final: 4 },
        personagem: 'A mulher do médico', citacao: 'Se podes olhar, vê. Se podes ver, repara.', recomenda: true },
    ], 150),
    L('Jogos vorazes', 'Suzanne Collins', 'Young adult', 400, [
      { inicio: '2026-03-08', fim: '2026-03-16', estrelas: 4, criterios: { tensao: 5, conteudo: 4, tristeza: 3, romance: 2.5, humor: 1.5, final: 3.5 }, personagem: 'Katniss', recomenda: true },
    ], 180),
    L('Tudo é rio', 'Carla Madeira', 'Romance', 210, [
      { inicio: '2026-10-05', fim: '2026-10-11', estrelas: 4.5, criterios: { tensao: 4, conteudo: 4.5, tristeza: 5, romance: 4, humor: 1, final: 4 }, personagem: 'Lucy', recomenda: true },
    ], 40),
    L('Duna', 'Frank Herbert', 'Ficção científica', 680, [{ inicio: '2026-10-20', paginaAtual: 210 }], 25),
    L('O Hobbit', 'J.R.R. Tolkien', 'Fantasia', 336, [], 5),
    L('Circe', 'Madeline Miller', 'Fantasia', 400, [], 3),
    L('Pequeno manual antirracista', 'Djamila Ribeiro', 'Não ficção', 136, [], 1),
  ];
}

/* ---------------- Início ---------------- */
aplicarTema();
render();
