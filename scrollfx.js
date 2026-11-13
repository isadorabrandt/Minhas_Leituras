'use strict';

/* =========================================================
   Scroll animado da página inicial — SÓ NO DESKTOP.
   Conceito: um scrapbook que se monta enquanto você rola.
   - topo em paralaxe (título se espalha, polaroids flutuam, selo gira)
   - cards "colados" voando de lados opostos
   - anel da meta se desenha conforme a rolagem, números contam
   - adesivos caem e quicam, livrinhos despencam nas pilhas
   - citação acende palavra por palavra no ritmo da rolagem
   - fila de "quero ler" sai de um monte e se abre em leque
   - marcador de página na lateral mostra quanto da página você "leu"
   No celular (ou com "reduzir movimento") nada disso liga.
   ========================================================= */
const ScrollFX = (() => {
  const desktop = matchMedia('(min-width: 901px) and (hover: hover) and (pointer: fine)');
  const calmo = matchMedia('(prefers-reduced-motion: reduce)');
  let ativo = false, raf = 0, observador = null, ultimaView = null, animarEntrada = true;
  let el = {};

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const suave = (t) => 1 - Math.pow(1 - t, 3);
  /* 0 quando o topo do elemento chega a `ini` da tela, 1 quando chega a `fim` */
  function progresso(no, ini = 0.92, fim = 0.35) {
    const r = no.getBoundingClientRect(), vh = innerHeight;
    return clamp((vh * ini - r.top) / (vh * (ini - fim)));
  }

  function fita() {
    let f = document.getElementById('fita-scroll');
    if (!f) {
      f = document.createElement('div');
      f.id = 'fita-scroll'; f.setAttribute('aria-hidden', 'true');
      f.innerHTML = '<span class="fita-trilho"></span><span class="fita-marcador"><b>0%</b></span>';
      document.body.appendChild(f);
    }
    return f;
  }

  function montar(view) {
    desmontar();
    if (view !== 'inicio' || !desktop.matches || calmo.matches) { ultimaView = view; return; }
    // anima a entrada só quando chega na página inicial; re-renderizações (ex.: mudar página atual) não repetem tudo
    animarEntrada = ultimaView !== 'inicio';
    ultimaView = view;
    const app = document.getElementById('app');
    el = {
      heroTxt: app.querySelector('.hero > div:first-child'),
      heroPalavras: [...app.querySelectorAll('.hero h1 span')],
      heroArte: [...app.querySelectorAll('.hero-art > button, .hero-art > .polaroid')],
      selo: app.querySelector('.hero-art .selo'),
      balao: app.querySelector('.balao'),
      lendo: [...app.querySelectorAll('#fx-lendo > .card-oferta')],
      meta: app.querySelector('.meta-anel'),
      anel: app.querySelector('.meta-anel .val'),
      adesivos: [...app.querySelectorAll('.adesivo')],
      pilhas: app.querySelector('.pilhas'),
      generos: [...app.querySelectorAll('.generos .pill')],
      citacao: app.querySelector('.citacao'),
      palavras: [...app.querySelectorAll('.citacao .palavra')],
      fila: app.querySelector('#fx-fila'),
      filaCards: [...app.querySelectorAll('#fx-fila > .card-oferta')],
      titulos: [...app.querySelectorAll('.secao-titulo')],
    };
    document.body.classList.add('scroll-fx');

    // anel: guarda o valor final para desenhar conforme a rolagem
    if (el.anel) {
      el.anelTotal = parseFloat(el.anel.getAttribute('stroke-dasharray'));
      el.anelFinal = parseFloat(el.anel.getAttribute('stroke-dashoffset'));
    }
    // cards de "lendo agora" vêm de lados alternados
    el.lendo.forEach((c, i) => { c.classList.add('fx-cola'); c.style.setProperty('--de', i % 2 ? '1' : '-1'); c.style.setProperty('--i', i); });
    el.adesivos.forEach((a, i) => { a.classList.add('fx-cai'); a.style.setProperty('--i', i); });
    el.generos.forEach((g, i) => { g.classList.add('fx-pop'); g.style.setProperty('--i', i); });
    el.titulos.forEach((t) => t.classList.add('fx-titulo'));
    if (el.balao) el.balao.classList.add('fx-balao');
    if (el.pilhas) el.pilhas.classList.add('fx-pilhas');
    if (el.meta) el.meta.classList.add('fx-meta');

    // entradas disparadas uma vez quando aparecem
    observador = new IntersectionObserver((itens) => itens.forEach((it) => {
      if (!it.isIntersecting) return;
      it.target.classList.add('visto');
      if (it.target === el.meta && animarEntrada) contar(el.meta.querySelector('.centro b'));
      if (it.target.classList.contains('adesivo') && animarEntrada) contar(it.target.querySelector('b'));
      observador.unobserve(it.target);
    }), { threshold: 0.25, rootMargin: '0px 0px -8% 0px' });
    const entradas = [el.balao, ...el.lendo, el.meta, ...el.adesivos, el.pilhas, ...el.generos, ...el.titulos].filter(Boolean);
    if (animarEntrada) entradas.forEach((n) => observador.observe(n));
    else entradas.forEach((n) => n.classList.add('visto')); // já estava na página: mostra direto
    medirFila();

    fita().classList.add('mostrar');
    ativo = true;
    addEventListener('scroll', agendar, { passive: true });
    addEventListener('resize', agendar);
    quadro();
  }

  function desmontar() {
    ativo = false;
    removeEventListener('scroll', agendar); removeEventListener('resize', agendar);
    cancelAnimationFrame(raf);
    observador?.disconnect(); observador = null;
    document.body.classList.remove('scroll-fx');
    el.filaCards?.forEach((c) => { c.style.translate = ''; c.style.rotate = ''; c.style.zIndex = ''; });
    document.getElementById('fita-scroll')?.classList.remove('mostrar');
    el = {};
  }

  /* posição natural de cada card da fila (sem transformações), relativa à grade */
  function medirFila() {
    if (!el.fila) return;
    el.filaCards.forEach((c) => { c.style.translate = ''; c.style.rotate = ''; });
    const caixa = el.fila.getBoundingClientRect();
    el.filaMeio = caixa.width / 2;
    el.filaCards.forEach((c) => { const r = c.getBoundingClientRect(); c._cx = r.left - caixa.left + r.width / 2; c._cy = r.top - caixa.top; });
    el.filaTopo = Math.min(...el.filaCards.map((c) => c._cy)); // empilha na altura da primeira linha
  }

  function agendar(e) {
    if (e?.type === 'resize') medirFila();
    if (ativo) { cancelAnimationFrame(raf); raf = requestAnimationFrame(quadro); }
  }

  /* efeitos "presos" à rolagem (calculados a cada quadro) */
  function quadro() {
    if (!ativo) return;
    const y = scrollY, vh = innerHeight;
    const maxY = document.documentElement.scrollHeight - vh;
    const noFim = maxY > 0 && y >= maxY - 6; // chegou ao fim: tudo se completa

    // 1) topo em paralaxe
    if (el.heroTxt) {
      const t = clamp(y / (vh * 0.8));
      el.heroTxt.style.transform = `translateY(${y * 0.32}px)`;
      el.heroTxt.style.opacity = String(1 - suave(t) * 0.9);
      el.heroPalavras.forEach((s, i) => { s.style.translate = `${(i - 1) * y * 0.12}px ${-y * 0.04 * (i + 1)}px`; s.style.rotate = `${(i % 2 ? 1 : -1) * y * 0.015}deg`; });
      el.heroArte.forEach((p, i) => { p.style.transform = `translateY(${-y * (0.18 + i * 0.12)}px) rotate(${(i ? 1 : -1) * y * 0.03}deg)`; });
      if (el.selo) el.selo.style.transform = `translateY(${-y * 0.1}px) rotate(${y * 0.35}deg) scale(${1 + clamp(y / vh) * 0.25})`;
    }

    // 2) anel da meta se desenha
    if (el.anel && el.meta) {
      const p = noFim ? 1 : suave(progresso(el.meta, 0.95, 0.4));
      const vazio = el.anelTotal, alvo = el.anelFinal;
      el.anel.style.strokeDashoffset = String(vazio - (vazio - alvo) * p);
    }

    // 3) citação acende palavra por palavra
    if (el.citacao && el.palavras.length) {
      const p = noFim ? 1 : progresso(el.citacao, 0.85, 0.25);
      const n = el.palavras.length, acesas = p * (n + 2);
      el.palavras.forEach((w, i) => w.classList.toggle('acesa', i < acesas));
      el.citacao.style.setProperty('--fx-p', p.toFixed(3));
    }

    // 4) fila: sai de um monte e abre em leque
    if (el.fila && el.filaCards.length) {
      const p = noFim ? 1 : suave(progresso(el.fila, 0.98, 0.45));
      const meio = (el.filaCards.length - 1) / 2;
      el.filaCards.forEach((c, i) => {
        if (p >= 0.999) { c.style.translate = ''; c.style.rotate = ''; c.style.zIndex = ''; return; }
        const dx = (el.filaMeio - c._cx) * (1 - p), dy = (el.filaTopo - c._cy) * (1 - p);
        c.style.translate = `${dx}px ${dy + (1 - p) * 40}px`;
        c.style.rotate = `${(i - meio) * 9 * (1 - p) + (i - meio) * 1.2}deg`;
        c.style.zIndex = String(10 + i);
      });
    }

    // 5) marcador de página na lateral
    const max = document.documentElement.scrollHeight - vh;
    const lido = max > 0 ? clamp(y / max) : 0;
    const f = document.getElementById('fita-scroll');
    if (f) { f.style.setProperty('--vis', y > vh * 0.6 ? 1 : 0); f.style.setProperty('--lido', lido.toFixed(4)); f.querySelector('b').textContent = `${Math.round(lido * 100)}%`; }
  }

  function contar(b) {
    if (!b) return;
    const txt = b.textContent.trim();
    const num = parseFloat(txt.replace(/\./g, '').replace(',', '.'));
    if (!isFinite(num) || num === 0) return;
    const decimal = txt.includes(',');
    const t0 = performance.now(), dur = 1100;
    const passo = (t) => {
      const k = suave(clamp((t - t0) / dur));
      const v = num * k;
      b.textContent = decimal ? fmtNota(Math.round(v * 10) / 10) : Math.round(v).toLocaleString('pt-BR');
      if (k < 1) requestAnimationFrame(passo); else b.textContent = txt;
    };
    requestAnimationFrame(passo);
  }

  document.addEventListener('ml:render', (e) => montar(e.detail.view));
  // o app pode ter desenhado a tela antes deste arquivo carregar
  if (document.querySelector('#app .view') && typeof ui !== 'undefined') montar(db.livros.length ? ui.view : 'vazia');
  desktop.addEventListener?.('change', () => montar(ultimaView === 'inicio' ? 'inicio' : ultimaView));
  return { montar, desmontar };
})();
