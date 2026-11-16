'use strict';

/* =========================================================
   Calendário de leitura, séries e mood board.
   - Cada leitura guarda um pequeno registro diário: log = [{ d: 'AAAA-MM-DD', p: página }]
     (um item por dia, só a última página daquele dia). Ele alimenta o calendário,
     a sequência de dias e a previsão de término.
   - Livro pode ter serie + serieVol.
   - Leitura pode ter fotos = [url] (mood board), comprimidas e carregadas só na página do livro.
   ========================================================= */

/* ---------------- Registro diário ---------------- */
function registrarDia(leitura, pagina, dia = hoje()) {
  if (!leitura) return;
  leitura.log = Array.isArray(leitura.log) ? leitura.log : [];
  const i = leitura.log.findIndex((e) => e.d === dia);
  const item = { d: dia, p: Math.max(0, +pagina || 0) };
  if (i >= 0) leitura.log[i] = item; else leitura.log.push(item);
  leitura.log.sort((a, b) => a.d.localeCompare(b.d));
  if (leitura.log.length > 400) leitura.log = leitura.log.slice(-400);
}

/* todos os dias lidos: { 'AAAA-MM-DD': [{ livro, leitura, paginas, evento }] } */
function diasLidos() {
  const mapa = {};
  const add = (d, item) => { (mapa[d] ||= []).push(item); };
  db.livros.forEach((livro) => livro.leituras.forEach((leitura) => {
    const log = leitura.log || [];
    log.forEach((e, k) => {
      const ant = k ? log[k - 1].p : (leitura.inicio === e.d ? 0 : e.p);
      add(e.d, { livro, leitura, paginas: Math.max(0, e.p - ant), evento: 'leu' });
    });
    const temDia = (d) => (mapa[d] || []).some((x) => x.leitura === leitura);
    if (leitura.inicio && (leitura.inicioPrecisao || 'dia') === 'dia' && !temDia(leitura.inicio)) add(leitura.inicio, { livro, leitura, paginas: 0, evento: 'começou' });
    if (leitura.fim && (leitura.fimPrecisao || 'dia') === 'dia') {
      const ja = (mapa[leitura.fim] || []).find((x) => x.leitura === leitura);
      if (ja) ja.evento = 'terminou'; else add(leitura.fim, { livro, leitura, paginas: 0, evento: 'terminou' });
    }
  }));
  return mapa;
}
const somarDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function sequencias(mapa) {
  const dias = Object.keys(mapa).sort();
  let maior = 0, run = 0, ant = null;
  dias.forEach((d) => { run = ant && somarDias(ant, 1) === d ? run + 1 : 1; maior = Math.max(maior, run); ant = d; });
  let atual = 0, d = hoje();
  if (!mapa[d]) d = somarDias(d, -1); // hoje ainda dá tempo: conta a partir de ontem
  while (mapa[d]) { atual++; d = somarDias(d, -1); }
  return { atual, maior, leuHoje: !!mapa[hoje()] };
}

/* ritmo e previsão da leitura atual */
function previsao(livro, leitura) {
  const tot = +livro.paginas || 0, cur = +leitura.paginaAtual || 0;
  const log = (leitura.log || []).slice();
  if (leitura.inicio && (leitura.inicioPrecisao || 'dia') === 'dia' && !log.some((e) => e.d === leitura.inicio)) log.unshift({ d: leitura.inicio, p: 0 });
  const limite = somarDias(hoje(), -21);
  const janela = log.filter((e) => e.d >= limite);
  const base = janela[0] && janela[0].p < cur ? janela[0] : log.filter((e) => e.d < limite).at(-1);
  if (!base || cur <= base.p) return { tot, cur, ritmo: 0 };
  const passaram = Math.max(1, dias(base.d, hoje()) - 1);
  const ritmo = (cur - base.p) / passaram;
  if (!tot || cur >= tot) return { tot, cur, ritmo };
  const faltam = Math.ceil((tot - cur) / ritmo);
  return { tot, cur, ritmo, faltam, termina: somarDias(hoje(), faltam) };
}

/* ---------------- Séries ---------------- */
const normSerie = (s) => semAcento(s || '').trim();
function seriesExistentes() { return [...new Set(db.livros.map((l) => (l.serie || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')); }
function livrosDaSerie(nome) {
  const k = normSerie(nome);
  return db.livros.filter((l) => l.serie && normSerie(l.serie) === k).sort((a, b) => (+a.serieVol || 999) - (+b.serieVol || 999) || a.titulo.localeCompare(b.titulo));
}
function proximoDaSerie(l) {
  if (!l?.serie) return null;
  const lista = livrosDaSerie(l.serie);
  const i = lista.indexOf(l);
  return lista.slice(i + 1).find((x) => status(x) !== 'lido') || null;
}
function serieHTML(l) {
  if (!l.serie) return '';
  const lista = livrosDaSerie(l.serie);
  const prox = proximoDaSerie(l);
  return `<div class="serie-linha">
    <span class="pill serie-pill">${esc(l.serie)}${l.serieVol !== '' && l.serieVol != null ? ` · vol. ${fmtNota(l.serieVol)}` : ''}${lista.length > 1 ? ` · ${lista.length} na estante` : ''}</span>
    ${prox ? `<button type="button" class="btn small olive" data-action="abrir" data-id="${prox.id}">Próximo: ${esc(prox.titulo)} →</button>` : ''}
  </div>`;
}

/* ---------------- Mood board ---------------- */
const MAX_FOTOS = 9;
function moodHTML(l, x) {
  const fotos = x.fotos || [];
  return `<section class="mood">
    <div class="mood-topo"><span class="jlbl">mood board</span><span class="muted">${fotos.length ? `${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}` : 'fotos que lembram esta leitura'}</span></div>
    <div class="mood-grade">
      ${fotos.map((u, i) => `<button type="button" class="mood-foto tape ${['', 'olive', 'tang'][i % 3]}" style="--r:${((hash(u) % 9) - 4) * 1.1}deg" data-action="foto-abrir" data-id="${l.id}" data-lid="${x.id}" data-i="${i}" aria-label="Ver foto ${i + 1}">
          <img src="${esc(u)}" alt="" loading="lazy" decoding="async"></button>`).join('')}
      ${fotos.length < MAX_FOTOS ? `<label class="mood-add" title="Adicionar fotos">
          <input type="file" accept="image/*" multiple hidden data-mood-livro="${l.id}" data-mood-leitura="${x.id}">
          <span aria-hidden="true">＋</span><small>${fotos.length ? 'mais fotos' : 'adicionar fotos'}</small></label>` : ''}
    </div>
  </section>`;
}
function comprimirFoto(arquivo, lado = 900, q = 0.72) {
  return new Promise((ok) => {
    const url = URL.createObjectURL(arquivo);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); ok(null); };
    img.src = url;
  });
}
async function adicionarFotos(input) {
  const l = acharLivro(input.dataset.moodLivro); const x = l?.leituras.find((y) => y.id === input.dataset.moodLeitura);
  if (!x) return;
  x.fotos = x.fotos || [];
  const livres = MAX_FOTOS - x.fotos.length;
  const arquivos = [...input.files].slice(0, livres);
  if (input.files.length > livres) toast(`Cabem só mais ${livres} ${livres === 1 ? 'foto' : 'fotos'} nesta leitura.`);
  const grade = input.closest('.mood-grade'); grade?.classList.add('carregando-fotos');
  for (const f of arquivos) {
    const dataUrl = await comprimirFoto(f, Nuvem.ativo ? 900 : 640, Nuvem.ativo ? 0.72 : 0.6);
    if (dataUrl) x.fotos.push(dataUrl);
  }
  salvar(); // na nuvem, as fotos sobem para o Storage antes de sincronizar
  renderDetalhe();
  if (arquivos.length) toast(`${arquivos.length} ${arquivos.length === 1 ? 'foto colada' : 'fotos coladas'} no mood board!`);
}
function abrirFoto(livroId, leituraId, i) {
  const l = acharLivro(livroId); const x = l?.leituras.find((y) => y.id === leituraId); if (!x?.fotos?.[i]) return;
  const d = $('#modal-foto');
  const n = x.fotos.length;
  d.innerHTML = `<div class="foto-polaroid"><img src="${esc(x.fotos[i])}" alt="Foto ${i + 1} do mood board de ${esc(l.titulo)}">
      <p class="script">${esc(l.titulo)} · ${i + 1}/${n}</p></div>
    <div class="foto-acoes">
      ${n > 1 ? `<button type="button" class="btn small" data-action="foto-abrir" data-id="${l.id}" data-lid="${x.id}" data-i="${(i - 1 + n) % n}">← anterior</button>` : ''}
      <button type="button" class="btn small ghost danger" data-action="foto-remover" data-id="${l.id}" data-lid="${x.id}" data-i="${i}">Remover</button>
      ${n > 1 ? `<button type="button" class="btn small" data-action="foto-abrir" data-id="${l.id}" data-lid="${x.id}" data-i="${(i + 1) % n}">próxima →</button>` : ''}
      <button type="button" class="x" data-action="fechar" aria-label="Fechar">×</button>
    </div>`;
  if (!d.open) d.showModal();
}
function removerFoto(livroId, leituraId, i) {
  const l = acharLivro(livroId); const x = l?.leituras.find((y) => y.id === leituraId); if (!x?.fotos) return;
  if (!confirm('Remover esta foto do mood board?')) return;
  const [url] = x.fotos.splice(i, 1);
  Nuvem.removerImagem?.(url);
  salvar(); $('#modal-foto').close(); renderDetalhe();
}

/* ---------------- Tela: Calendário ---------------- */
const SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
function viewCalendario() {
  const mapa = diasLidos();
  const seq = sequencias(mapa);
  const [ay, am] = (ui.calMes || hoje().slice(0, 7)).split('-').map(Number);
  const prefixo = `${ay}-${String(am).padStart(2, '0')}`;
  const doMes = Object.entries(mapa).filter(([d]) => d.startsWith(prefixo));
  const pagMes = doMes.reduce((s, [, it]) => s + it.reduce((t, x) => t + x.paginas, 0), 0);
  const maxPag = Math.max(1, ...doMes.map(([, it]) => it.reduce((t, x) => t + x.paginas, 0)));
  const primeiro = new Date(ay, am - 1, 1).getDay();
  const total = ultimoDia(ay, am);
  const sel = ui.calDia && ui.calDia.startsWith(prefixo) ? ui.calDia : null;

  let celulas = '';
  for (let k = 0; k < primeiro; k++) celulas += '<span class="dia vazio"></span>';
  for (let dd = 1; dd <= total; dd++) {
    const iso = `${prefixo}-${String(dd).padStart(2, '0')}`;
    const it = mapa[iso] || [];
    const pag = it.reduce((t, x) => t + x.paginas, 0);
    const nivel = it.length ? Math.max(1, Math.ceil((pag / maxPag) * 4)) : 0;
    const terminou = it.some((x) => x.evento === 'terminou');
    const dica = it.length ? it.map((x) => `${x.livro.titulo}${x.paginas ? ` · ${x.paginas} pág.` : ''}${x.evento !== 'leu' ? ` (${x.evento})` : ''}`).join('\n') : '';
    celulas += `<button type="button" class="dia n${nivel} ${iso === hoje() ? 'hoje' : ''} ${iso === sel ? 'sel' : ''} ${iso > hoje() ? 'futuro' : ''}" data-action="cal-dia" data-d="${iso}" ${dica ? `title="${esc(dica)}"` : ''} aria-label="${dd} de ${MESES_LONGOS[am - 1]}${it.length ? `: leu ${it.length} ${it.length === 1 ? 'livro' : 'livros'}` : ''}">
      <b>${dd}</b>${pag ? `<small>${pag}p</small>` : ''}${terminou ? '<i class="fim-marca" aria-hidden="true">★</i>' : ''}</button>`;
  }
  const itensSel = sel ? mapa[sel] || [] : [];
  const lendo = db.livros.filter((l) => status(l) === 'lendo');
  const series = seriesExistentes().map((s) => ({ nome: s, livros: livrosDaSerie(s) }));

  return `<section class="cabecalho mesh grain">
    <div><p class="script">um dia de cada vez...</p><h1>Calendário <span class="hl-hot">de leitura</span></h1>
      <p>${seq.atual ? `Você está há <b>${seq.atual} ${seq.atual === 1 ? 'dia' : 'dias'} seguidos</b> lendo${seq.leuHoje ? '!' : ' — leia hoje para não quebrar a sequência.'}` : 'Atualize a página do livro que está lendo e o calendário se preenche sozinho.'}</p></div>
    ${seloHTML(`${seq.atual} ${seq.atual === 1 ? 'dia' : 'dias'} seguidos`, '🔥')}
  </section>
  <div class="wrap">
    <div class="adesivos cal-adesivos">
      <div class="adesivo a1"><b>${seq.atual}</b><span>dias seguidos</span></div>
      <div class="adesivo a2"><b>${seq.maior}</b><span>maior sequência</span></div>
      <div class="adesivo a3"><b>${doMes.length}</b><span>dias lidos em ${MESES[am - 1]}</span></div>
      <div class="adesivo a4"><b>${pagMes.toLocaleString('pt-BR')}</b><span>páginas no mês</span></div>
    </div>

    <div class="cal-layout">
      <section class="cal-card">
        <div class="cal-topo">
          <button type="button" class="icon-btn" data-action="cal-mes" data-delta="-1" aria-label="Mês anterior">‹</button>
          <h2>${MESES_LONGOS[am - 1]} <span class="muted">${ay}</span></h2>
          <button type="button" class="icon-btn" data-action="cal-mes" data-delta="1" aria-label="Próximo mês">›</button>
        </div>
        <div class="cal-grade">${SEMANA.map((s) => `<span class="sem">${s}</span>`).join('')}${celulas}</div>
        <div class="cal-legenda"><span>menos</span>${[1, 2, 3, 4].map((n) => `<i class="dia n${n}"></i>`).join('')}<span>mais páginas</span><span class="sep">★ terminou um livro</span></div>
        ${sel ? `<div class="cal-detalhe"><p class="script">${fmtData(sel)}</p>${itensSel.length ? itensSel.map((x) => `
            <button type="button" class="cal-item" data-action="abrir" data-id="${x.livro.id}" data-lid="${x.leitura.id}">
              <span class="cal-capa">${capaHTML(x.livro)}</span><span><b>${esc(x.livro.titulo)}</b><small>${x.evento === 'leu' ? (x.paginas ? `${x.paginas} páginas` : 'leu') : x.evento}</small></span></button>`).join('')
          : '<p class="muted">Nenhuma leitura registrada neste dia.</p>'}</div>` : ''}
      </section>

      <section class="cal-lado">
        <h3 class="cal-sub">Lendo agora</h3>
        ${lendo.length ? lendo.map((l) => {
          const lt = leituraAtual(l); const pv = previsao(l, lt);
          const pct = pv.tot ? Math.round((pv.cur / pv.tot) * 100) : 0;
          return `<article class="prev-card">
            <button type="button" class="prev-capa" data-action="abrir" data-id="${l.id}">${capaHTML(l)}</button>
            <div><b>${esc(l.titulo)}</b>
              <div class="progresso"><span style="width:${pct}%"></span></div>
              <div class="prog-row" style="justify-content:flex-start"><span>pág.</span><input type="number" min="0" ${pv.tot ? `max="${pv.tot}"` : ''} value="${pv.cur}" data-change="progresso" data-id="${l.id}" aria-label="Página atual de ${esc(l.titulo)}"><span>${pv.tot ? `de ${pv.tot}` : ''}</span></div>
              <p class="prev-txt">${pv.ritmo ? `No seu ritmo (~${Math.max(1, Math.round(pv.ritmo))} pág./dia)${pv.termina ? `, você termina por volta de <b>${fmtData(pv.termina)}</b>` : ''}.` : 'Atualize a página por alguns dias e eu calculo quando você termina.'}</p>
              ${mapa[hoje()]?.some((x) => x.leitura === lt) ? '<span class="pill lido">li hoje ✓</span>' : `<button type="button" class="btn small pink" data-action="li-hoje" data-id="${l.id}">Li hoje</button>`}
            </div></article>`;
        }).join('') : '<p class="muted">Nenhum livro em andamento.</p>'}

        <h3 class="cal-sub">Suas séries</h3>
        ${series.length ? series.map(({ nome, livros }) => {
          const lidos = livros.filter((l) => status(l) === 'lido').length;
          const prox = livros.find((l) => status(l) !== 'lido');
          return `<article class="serie-card">
            <div class="serie-cab"><b>${esc(nome)}</b><span class="muted">${lidos} de ${livros.length} lidos</span></div>
            <div class="serie-lombadas">${livros.map((l) => `<button type="button" class="mini-lombada ${status(l)}" style="--c:${corDe(l)}" data-action="abrir" data-id="${l.id}" title="${esc(l.titulo)}${l.serieVol !== '' && l.serieVol != null ? ` (vol. ${fmtNota(l.serieVol)})` : ''}">${l.serieVol !== '' && l.serieVol != null ? fmtNota(l.serieVol) : '·'}</button>`).join('')}</div>
            ${prox ? `<button type="button" class="serie-prox" data-action="abrir" data-id="${prox.id}">${status(prox) === 'lendo' ? 'Lendo agora' : 'Próximo'}: <b>${esc(prox.titulo)}</b> →</button>` : '<p class="serie-ok">Série completa ✓</p>'}
          </article>`;
        }).join('') : '<p class="muted">Ao cadastrar ou editar um livro, preencha o campo <b>Série</b> (ex.: “Jogos Vorazes”, volume 2) para acompanhar a ordem aqui.</p>'}
      </section>
    </div>
  </div>`;
}

/* ---------------- Ações ---------------- */
Object.assign(acoes, {
  'cal-mes': (t) => {
    const [y, m] = (ui.calMes || hoje().slice(0, 7)).split('-').map(Number);
    const d = new Date(y, m - 1 + +t.dataset.delta, 1);
    ui.calMes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; ui.calDia = null; render();
  },
  'cal-dia': (t) => { ui.calDia = ui.calDia === t.dataset.d ? null : t.dataset.d; render(); },
  'li-hoje': (t) => {
    const l = acharLivro(t.dataset.id); const lt = leituraAtual(l); if (!lt) return;
    registrarDia(lt, lt.paginaAtual); salvar(); render(); toast('Dia marcado no calendário!');
  },
  'foto-abrir': (t) => abrirFoto(t.dataset.id, t.dataset.lid, +t.dataset.i),
  'foto-remover': (t) => removerFoto(t.dataset.id, t.dataset.lid, +t.dataset.i),
});
document.addEventListener('change', (e) => { if (e.target.dataset?.moodLeitura) adicionarFotos(e.target).finally(() => { e.target.value = ''; }); });
// a janela da foto também fecha ao clicar no fundo
$('#modal-foto')?.addEventListener('click', (e) => { if (e.target.id === 'modal-foto') e.target.close(); });
