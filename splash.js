'use strict';

/* =========================================================
   Tela de entrada: aparece sempre que o app abre (e depois do login).
   A concha cai, o nome se escreve, os livros sobem na estante
   e a "capa" se abre como um livro revelando o app.
   Toque/clique pula.
   ========================================================= */
const Splash = (() => {
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MINIMO = reduzido ? 400 : 2700;
  const CORES = ['#e8458b', '#b8b23e', '#f2703d', '#cdb0f0', '#8f1d4a', '#f49ac1', '#d9822b', '#6d7a2a', '#b5338a', '#ff9e7a', '#5e0b2b'];
  let inicio = 0, saindo = false, aguardando = null, limite = null;

  function markup() {
    const letras = [...'Minhas'].map((c, i) => `<span style="--i:${i}">${c}</span>`).join('');
    const livros = CORES.map((c, i) => `<i style="--c:${c};--h:${42 + ((i * 37) % 30)}px;--w:${14 + ((i * 13) % 10)}px;--i:${i}"></i>`).join('');
    return `<div class="sp-capa sp-esq"></div><div class="sp-capa sp-dir"></div>
      <div class="sp-conteudo">
        <div class="sp-sol"></div>
        <img class="sp-logo" src="logo.png" alt="" width="150" height="150">
        <h1 class="sp-titulo" aria-label="Minhas Leituras"><span class="sp-l1" aria-hidden="true">${letras}</span><span class="sp-l2" aria-hidden="true">Leituras</span></h1>
        <div class="sp-estante" aria-hidden="true">${livros}</div>
        <p class="sp-msg">abrindo sua estante...</p>
      </div>
      <span class="sp-dica">toque para entrar</span>`;
  }

  function mostrar() {
    document.getElementById('splash')?.remove();
    const s = document.createElement('div');
    s.id = 'splash'; s.className = 'splash'; s.setAttribute('role', 'presentation');
    s.innerHTML = markup();
    s.addEventListener('click', () => sair());
    document.body.prepend(s);
    document.body.classList.add('com-splash');
    inicio = performance.now(); saindo = false;
    clearTimeout(aguardando); clearTimeout(limite);
    limite = setTimeout(() => pronto(), 10000); // nunca prende a pessoa aqui
  }

  /* chamado quando o app terminou de carregar (com o primeiro nome, se houver) */
  function pronto(nome) {
    const s = document.getElementById('splash');
    if (!s || saindo) return;
    if (nome) {
      const m = s.querySelector('.sp-msg');
      m.textContent = `oi, ${nome}!`; m.classList.add('nome');
    }
    clearTimeout(limite); clearTimeout(aguardando);
    const falta = Math.max(0, MINIMO - (performance.now() - inicio));
    aguardando = setTimeout(sair, falta + (nome && !reduzido ? 450 : 0));
  }

  function sair() {
    const s = document.getElementById('splash');
    if (!s || saindo) return;
    saindo = true;
    clearTimeout(aguardando); clearTimeout(limite);
    s.classList.add('saindo');
    document.body.classList.remove('com-splash');
    setTimeout(() => s.remove(), reduzido ? 300 : 1150);
  }

  mostrar();
  return { mostrar, pronto, sair };
})();
