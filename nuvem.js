'use strict';

/* =========================================================
   Nuvem (Supabase): login e sincronização dos dados.
   - Se config.js tiver a URL e a chave pública, cada pessoa entra
     com e-mail e senha e os dados ficam salvos na conta dela.
   - Sem configuração, o app funciona só neste navegador (localStorage).
   Tabelas: perfis, livros, leituras (ver supabase/schema.sql).
   ========================================================= */

const Nuvem = (() => {
  const cfg = window.ML_CONFIG || {};
  const pronto = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase?.createClient);
  const sb = pronto ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  let usuario = null;
  let foto = { livros: new Map(), leituras: new Map(), perfil: '' };
  let timer = null, sincronizando = false, pendente = false;
  let abaLogin = 'entrar';
  const veioDoLinkDeSenha = location.hash.includes('type=recovery');
  const vazio = () => ({ livros: new Map(), leituras: new Map(), perfil: '' });

  /* ---------- conversão app <-> tabelas ---------- */
  const linhaLivro = (l) => ({
    user_id: usuario.id, id: l.id, titulo: l.titulo, autor: l.autor || null, genero: l.genero || null,
    paginas: l.paginas ? +l.paginas : null, capa: l.capa || null, cor: l.cor || null,
    criado_em: l.criadoEm || new Date().toISOString(),
  });
  const linhaLeitura = (l, x) => ({
    user_id: usuario.id, id: x.id, livro_id: l.id, inicio: x.inicio || null, fim: x.fim || null,
    pagina_atual: +x.paginaAtual || 0, estrelas: +x.estrelas || 0, criterios: x.criterios || {},
    personagem: x.personagem || null, citacao: x.citacao || null, notas: x.notas || null,
    recomenda: x.recomenda ?? null,
  });
  const linhaPerfil = () => ({
    user_id: usuario.id, nome: nome() || null, metas: db.metas || {}, tema: db.tema || null,
  });
  const paraLivro = (r) => ({
    id: r.id, titulo: r.titulo, autor: r.autor || '', genero: r.genero || '', paginas: r.paginas ?? '',
    capa: r.capa || '', cor: r.cor || '', criadoEm: r.criado_em, leituras: [],
  });
  const paraLeitura = (r) => ({
    id: r.id, inicio: r.inicio, fim: r.fim, paginaAtual: r.pagina_atual || 0, estrelas: +r.estrelas || 0,
    criterios: r.criterios || {}, personagem: r.personagem || '', citacao: r.citacao || '', notas: r.notas || '',
    recomenda: r.recomenda,
  });

  function estadoAtual() {
    const livros = new Map(), leituras = new Map();
    db.livros.forEach((l) => {
      livros.set(l.id, JSON.stringify(linhaLivro(l)));
      l.leituras.forEach((x) => leituras.set(x.id, JSON.stringify(linhaLeitura(l, x))));
    });
    return { livros, leituras, perfil: JSON.stringify(linhaPerfil()) };
  }

  const ok = ({ error }) => { if (error) throw error; };
  async function emLotes(lista, fn, n = 40) { for (let i = 0; i < lista.length; i += n) ok(await fn(lista.slice(i, i + n))); }

  /* ---------- sincronização: envia só o que mudou ---------- */
  function agendar() {
    if (!usuario) return;
    status('salvando');
    clearTimeout(timer);
    timer = setTimeout(sincronizar, 700);
  }
  async function sincronizar() {
    if (!usuario) return;
    if (sincronizando) { pendente = true; return; }
    sincronizando = true;
    const agora = estadoAtual();
    try {
      const mudou = (atual, antes) => [...atual].filter(([id, j]) => antes.get(id) !== j).map(([, j]) => JSON.parse(j));
      const sumiu = (atual, antes) => [...antes.keys()].filter((id) => !atual.has(id));
      const upLivros = mudou(agora.livros, foto.livros);
      const upLeituras = mudou(agora.leituras, foto.leituras);
      const delLeituras = sumiu(agora.leituras, foto.leituras);
      const delLivros = sumiu(agora.livros, foto.livros);

      if (delLeituras.length) await emLotes(delLeituras, (ids) => sb.from('leituras').delete().in('id', ids), 100);
      if (delLivros.length) await emLotes(delLivros, (ids) => sb.from('livros').delete().in('id', ids), 100);
      if (upLivros.length) await emLotes(upLivros, (rows) => sb.from('livros').upsert(rows, { onConflict: 'user_id,id' }));
      if (upLeituras.length) await emLotes(upLeituras, (rows) => sb.from('leituras').upsert(rows, { onConflict: 'user_id,id' }));
      if (agora.perfil !== foto.perfil) ok(await sb.from('perfis').upsert(JSON.parse(agora.perfil), { onConflict: 'user_id' }));

      foto = agora;
      status('salvo');
    } catch (e) {
      console.error(e);
      status('erro');
      toast('Não consegui salvar na nuvem. Vou tentar de novo na próxima alteração.', 'erro');
    } finally {
      sincronizando = false;
      if (pendente) { pendente = false; sincronizar(); }
    }
  }

  async function baixar() {
    status('carregando');
    const [lv, lt, pf] = await Promise.all([
      sb.from('livros').select('*').order('criado_em'),
      sb.from('leituras').select('*'),
      sb.from('perfis').select('*').maybeSingle(),
    ]);
    [lv, lt, pf].forEach(ok);
    const porId = new Map();
    const livros = (lv.data || []).map((r) => { const l = paraLivro(r); porId.set(l.id, l); return l; });
    (lt.data || []).forEach((r) => porId.get(r.livro_id)?.leituras.push(paraLeitura(r)));
    db = { livros, metas: pf.data?.metas || {}, tema: pf.data?.tema || db.tema || null };
    foto = estadoAtual();
    if (!pf.data) foto.perfil = ''; // cria o perfil no próximo salvamento
    status('salvo');
  }

  /* ---------- trazer dados que estavam só neste navegador ---------- */
  async function oferecerMigracao() {
    const chave = `${KEY}:migrado:${usuario.id}`;
    if (localStorage.getItem(chave) || db.livros.length) return;
    let local = null;
    try { local = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* ignora */ }
    if (!local?.livros?.length) return;
    localStorage.setItem(chave, '1');
    if (!confirm(`Encontrei ${local.livros.length} livros salvos neste navegador. Quer levar todos para a sua conta?`)) return;
    db.livros = local.livros;
    db.metas = { ...local.metas, ...db.metas };
    render(); agendar();
    toast('Livros importados para a sua conta!');
  }

  /* ---------- tela de login: ficha de biblioteca ---------- */
  let portao = null; // segura a troca de tela enquanto o carimbo anima

  const linha = (id, rotulo, attrs, extra = '') => `<div class="linha ${extra}"><label for="${id}">${rotulo}</label><input id="${id}" ${attrs}></div>`;

  function faceEntrar(n) {
    const esqueci = abaLogin === 'esqueci', nova = abaLogin === 'nova-senha';
    return `<div class="ficha-topo"><span>Ficha de leitora</span><span>nº ${n}</span></div>
      <p class="script">${nova ? 'quase lá...' : esqueci ? 'acontece com todo mundo...' : 'oi, leitora...'}</p>
      <h1>Minhas Leituras</h1>
      <form class="form-login" data-modo="${nova ? 'nova-senha' : esqueci ? 'esqueci' : 'entrar'}" novalidate>
        ${nova ? '' : linha('lg-email', 'e-mail', 'name="email" type="email" autocomplete="email" required')}
        ${esqueci ? '' : linha('lg-senha', nova ? 'nova senha' : 'senha', `name="senha" type="password" minlength="6" autocomplete="${nova ? 'new-password' : 'current-password'}" required`)}
        <p class="login-msg" role="status"></p>
        <button class="btn hot login-btn" type="submit">${nova ? 'Salvar nova senha' : esqueci ? 'Enviar link por e-mail' : 'Entrar'}</button>
      </form>
      <div class="login-links">
        ${esqueci || nova ? '<button type="button" data-action="login-aba" data-aba="entrar">← voltar para entrar</button>'
          : '<button type="button" data-action="login-aba" data-aba="esqueci">esqueci minha senha</button>'}
      </div>
      ${esqueci || nova ? '' : '<button type="button" class="virar" data-action="login-virar" data-aba="criar">ainda não tem ficha? <b>criar conta →</b></button>'}`;
  }
  function faceCriar(n) {
    return `<div class="ficha-topo"><span>Nova ficha</span><span>nº ${n + 1}</span></div>
      <p class="script">que bom te ver por aqui...</p>
      <h1>Criar conta</h1>
      <form class="form-login" data-modo="criar" novalidate>
        ${linha('lg-nome', 'como posso te chamar?', 'name="nome" autocomplete="given-name" required', 'empilhada')}
        ${linha('lg-email2', 'e-mail', 'name="email" type="email" autocomplete="email" required')}
        ${linha('lg-senha2', 'senha', 'name="senha" type="password" minlength="6" autocomplete="new-password" required placeholder="mín. 6 caracteres"')}
        <p class="login-msg" role="status"></p>
        <button class="btn olive login-btn" type="submit">Criar minha ficha</button>
      </form>
      <button type="button" class="virar" data-action="login-virar" data-aba="entrar"><b>← já tenho ficha</b>, quero entrar</button>`;
  }

  function telaLogin(msg = '', tipo = '') {
    document.body.classList.add('deslogado');
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    const n = 1000 + (hash(navigator.userAgent) % 8999);
    const criar = abaLogin === 'criar';
    const fakes = [
      { titulo: 'Seu livro favorito', autor: 'você', cor: '#e8458b' },
      { titulo: 'A próxima leitura', autor: 'logo ali', cor: '#b8b23e' },
      { titulo: 'Aquela releitura', autor: 'de novo', cor: '#f2703d' },
      { titulo: 'O que vem depois', autor: 'surpresa', cor: '#cdb0f0' },
    ];
    $('#app').innerHTML = `<section class="login mesh grain">
      <div class="login-deco" aria-hidden="true">${fakes.map((f, i) => `<div class="deco-item" style="--prof:${[18, -24, 14, -12][i]}">${polaroidHTML(f, { r: [-9, 7, -5, 10][i], fita: ['', 'olive', 'tang', ''][i] })}</div>`).join('')}</div>
      <div class="login-palco">
        <img class="login-logo" src="logo.png" alt="" width="130" height="130">
        <div class="ficha-wrap">
          <div class="ficha ${criar ? 'virada' : ''}">
            <div class="ficha-face frente" ${criar ? 'inert' : ''}>${faceEntrar(n)}</div>
            <div class="ficha-face verso" ${criar ? '' : 'inert'}>${faceCriar(n)}</div>
          </div>
          <div class="bolso" aria-hidden="true"><b>Minhas Leituras</b></div>
        </div>
      </div>
    </section>`;
    if (msg) avisoNaFace(msg, tipo);
    setTimeout(() => $('.ficha-face:not([inert]) input')?.focus({ preventScroll: true }), 900);
    if (typeof Splash !== 'undefined') Splash.pronto();
  }
  function avisoNaFace(msg, tipo = 'erro') {
    const p = $('.ficha-face:not([inert]) .login-msg'); if (!p) return;
    p.textContent = msg; p.className = `login-msg ${tipo}`;
  }
  function virar(aba) {
    abaLogin = aba;
    const f = $('.ficha'); if (!f) return telaLogin();
    f.classList.toggle('virada', aba === 'criar');
    $('.ficha-face.frente').inert = aba === 'criar';
    $('.ficha-face.verso').inert = aba !== 'criar';
    setTimeout(() => $('.ficha-face:not([inert]) input')?.focus({ preventScroll: true }), 650);
  }
  function carimbar(texto) {
    return new Promise((ok) => {
      const face = $('.ficha-face:not([inert])'); if (!face) return ok();
      const c = document.createElement('div');
      c.className = 'carimbo';
      const d = new Date();
      c.innerHTML = `<b>${texto}</b><small>${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()].toUpperCase()} ${d.getFullYear()}</small>`;
      face.appendChild(c);
      $('.ficha').classList.add('carimbada');
      setTimeout(ok, matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 950);
    });
  }

  async function enviarLogin(form) {
    const modo = form.dataset.modo;
    const btn = form.querySelector('.login-btn');
    const email = form.email?.value.trim(), senha = form.senha?.value || '', nomeV = form.nome?.value.trim();
    const aviso = (m, t = 'erro') => { const p = form.querySelector('.login-msg'); p.textContent = m; p.className = `login-msg ${t}`; };
    if (form.nome && !nomeV) return aviso('Me conta seu nome 🙂');
    if (form.email && !/^\S+@\S+\.\S+$/.test(email)) return aviso('Digite um e-mail válido.');
    if (form.senha && senha.length < 6) return aviso('A senha precisa ter pelo menos 6 caracteres.');
    aviso('', '');
    const texto = btn.textContent;
    btn.disabled = true; btn.innerHTML = '<span class="loading"></span>';
    let liberar = () => {};
    try {
      if (modo === 'entrar' || modo === 'criar') {
        portao = new Promise((r) => { liberar = r; });
        let sessao = null;
        if (modo === 'entrar') {
          const { data, error } = await sb.auth.signInWithPassword({ email, password: senha });
          if (error) throw error; sessao = data.session;
        } else {
          const { data, error } = await sb.auth.signUp({ email, password: senha, options: { data: { nome: nomeV }, emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error; sessao = data.session;
          if (!sessao) { liberar(); portao = null; abaLogin = 'entrar'; telaLogin('Ficha criada! Enviei um link de confirmação para o seu e-mail — confirme e depois entre aqui.', 'ok'); return; }
        }
        await carimbar(modo === 'criar' ? 'Ficha nova!' : 'Bem-vinda!');
        if (typeof Splash !== 'undefined') Splash.mostrar();
        liberar();
        if (!usuario || usuario.id !== sessao?.user?.id) entrar(sessao);
        return;
      }
      if (modo === 'esqueci') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        abaLogin = 'entrar'; telaLogin('Se esse e-mail tiver conta, chega um link para criar uma nova senha.', 'ok'); return;
      }
      if (modo === 'nova-senha') {
        const { error } = await sb.auth.updateUser({ password: senha });
        if (error) throw error;
        await carimbar('Senha nova!');
        abaLogin = 'entrar'; if (typeof Splash !== 'undefined') Splash.mostrar();
        await entrar((await sb.auth.getSession()).data.session); return;
      }
    } catch (e) {
      liberar(); portao = null;
      aviso(traduzir(e));
      btn.disabled = false; btn.textContent = texto;
      form.closest('.ficha')?.classList.remove('treme'); void form.offsetWidth; form.closest('.ficha')?.classList.add('treme');
    }
  }
  function traduzir(e) {
    const m = (e?.message || '').toLowerCase();
    if (m.includes('invalid login')) return 'E-mail ou senha incorretos.';
    if (m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos antes de entrar.';
    if (m.includes('already registered') || m.includes('already been registered')) return 'Esse e-mail já tem conta. Tente entrar.';
    if (m.includes('rate limit') || m.includes('security purposes')) return 'Muitas tentativas seguidas. Espere um minutinho e tente de novo.';
    if (m.includes('password')) return 'Senha inválida: use pelo menos 6 caracteres.';
    if (m.includes('fetch') || m.includes('network')) return 'Sem conexão com o servidor. Confira sua internet.';
    return e?.message || 'Algo deu errado. Tente de novo.';
  }

  /* ---------- sessão ---------- */
  let entrando = false;
  async function entrar(sessao) {
    if (portao) { await portao; portao = null; }
    if (sessao?.user && usuario?.id === sessao.user.id && entrando) return;
    usuario = sessao?.user || null;
    if (!usuario) { telaLogin(); return; }
    entrando = true;
    document.body.classList.remove('deslogado');
    $('#app').innerHTML = '<div class="carregando"><span class="loading"></span><p class="script">abrindo sua estante...</p></div>';
    try { await baixar(); }
    catch (e) { console.error(e); toast('Não consegui carregar seus livros. Confira a configuração do Supabase.', 'erro'); }
    aplicarTema(); atualizarConta(); render();
    entrando = false;
    if (typeof Splash !== 'undefined') Splash.pronto((nome() || '').split(' ')[0]);
    await oferecerMigracao();
  }
  async function sair() {
    clearTimeout(timer);
    if (pendente || timer) await sincronizar();
    await sb.auth.signOut();
  }
  function atualizarConta() {
    const el = $('#conta'); if (!el) return;
    document.body.classList.toggle('com-conta', !!usuario);
    el.hidden = !usuario;
    if (usuario) el.querySelector('.conta-email').textContent = usuario.email;
  }
  function status(s) {
    const el = $('#sync'); if (!el) return;
    el.hidden = !pronto;
    el.dataset.s = s;
    el.textContent = { salvando: 'salvando…', salvo: '☁ salvo', erro: '⚠ não salvo', carregando: 'carregando…' }[s] || '';
  }
  function nome() { return (usuario?.user_metadata?.nome || '').trim(); }

  async function iniciar() {
    if (!pronto) return false;
    status('carregando');
    let ignorarPrimeiro = true;
    // (o Supabase recomenda não chamar o banco direto dentro deste callback; por isso o setTimeout)
    sb.auth.onAuthStateChange((evento, sessao) => setTimeout(() => {
      if (evento === 'PASSWORD_RECOVERY') { abaLogin = 'nova-senha'; telaLogin('Escolha sua nova senha.', 'ok'); return; }
      if (evento === 'SIGNED_OUT') { usuario = null; db = { livros: [], metas: {}, tema: db.tema }; foto = vazio(); abaLogin = 'entrar'; atualizarConta(); telaLogin(); return; }
      if (evento === 'SIGNED_IN' && (!usuario || usuario.id !== sessao?.user?.id) && !ignorarPrimeiro && !portao) entrar(sessao);
      if (evento === 'USER_UPDATED' && sessao) usuario = sessao.user;
    }, 0));
    const { data } = await sb.auth.getSession();
    ignorarPrimeiro = false;
    if (veioDoLinkDeSenha) { abaLogin = 'nova-senha'; telaLogin('Escolha sua nova senha.', 'ok'); return true; }
    await entrar(data.session);
    return true;
  }

  return {
    get ativo() { return pronto; },
    get logado() { return !!usuario; },
    nome, iniciar, agendar, sair, telaLogin, enviarLogin,
    trocarAba(a) { abaLogin = a; telaLogin(); },
    virar,
  };
})();
