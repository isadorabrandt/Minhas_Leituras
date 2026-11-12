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
    toast('Livros importados para a sua conta ✿');
  }

  /* ---------- tela de login ---------- */
  function telaLogin(msg = '', tipo = '') {
    document.body.classList.add('deslogado');
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    const criar = abaLogin === 'criar', nova = abaLogin === 'nova-senha', esqueci = abaLogin === 'esqueci';
    const titulo = criar ? 'Criar conta' : nova ? 'Nova senha' : esqueci ? 'Recuperar senha' : 'Entrar';
    const fakes = [
      { titulo: 'Seu livro favorito', autor: 'você', cor: '#e8458b' },
      { titulo: 'A próxima leitura', autor: 'logo ali', cor: '#b8b23e' },
      { titulo: 'Aquela releitura', autor: 'de novo', cor: '#f2703d' },
    ];
    $('#app').innerHTML = `<section class="login mesh grain">
      <div class="login-deco" aria-hidden="true">${fakes.map((f, i) => polaroidHTML(f, { r: [-9, 7, -4][i], fita: ['', 'olive', 'tang'][i] })).join('')}</div>
      <div class="login-card">
        <img class="login-logo" src="logo.png" alt="" width="120" height="120">
        <p class="script">${criar ? 'que bom te ver por aqui...' : 'oi, leitora...'}</p>
        <h1>Minhas Leituras</h1>
        <p class="login-sub">Seu diário de leituras, salvo na sua conta e em qualquer aparelho.</p>
        ${nova || esqueci ? '' : `<div class="seg login-abas" role="tablist">
          <button type="button" class="${!criar ? 'ativo' : ''}" data-action="login-aba" data-aba="entrar">Entrar</button>
          <button type="button" class="${criar ? 'ativo' : ''}" data-action="login-aba" data-aba="criar">Criar conta</button>
        </div>`}
        <form id="form-login" novalidate>
          <h2 class="sr">${titulo}</h2>
          ${criar ? `<div class="field"><label for="lg-nome">Como posso te chamar?</label><input id="lg-nome" name="nome" autocomplete="given-name" required></div>` : ''}
          ${nova ? '' : `<div class="field"><label for="lg-email">E-mail</label><input id="lg-email" name="email" type="email" autocomplete="email" required></div>`}
          ${esqueci ? '' : `<div class="field"><label for="lg-senha">${nova ? 'Nova senha' : 'Senha'}</label><input id="lg-senha" name="senha" type="password" minlength="6" autocomplete="${criar || nova ? 'new-password' : 'current-password'}" required>
            ${criar || nova ? '<small class="muted">mínimo de 6 caracteres</small>' : ''}</div>`}
          <p class="login-msg ${tipo}" role="status">${esc(msg)}</p>
          <button class="btn hot login-btn" type="submit">${criar ? 'Criar minha conta' : nova ? 'Salvar nova senha' : esqueci ? 'Enviar link por e-mail' : 'Entrar'}</button>
        </form>
        <div class="login-links">
          ${abaLogin === 'entrar' ? '<button type="button" data-action="login-aba" data-aba="esqueci">Esqueci minha senha</button>' : ''}
          ${esqueci ? '<button type="button" data-action="login-aba" data-aba="entrar">← voltar para entrar</button>' : ''}
        </div>
      </div>
    </section>`;
    $('#form-login input')?.focus();
  }

  async function enviarLogin(form) {
    const btn = form.querySelector('.login-btn');
    const email = form.email?.value.trim(), senha = form.senha?.value || '', nomeV = form.nome?.value.trim();
    const aviso = (m, t = 'erro') => { const p = form.querySelector('.login-msg'); p.textContent = m; p.className = `login-msg ${t}`; };
    if (form.email && !/^\S+@\S+\.\S+$/.test(email)) return aviso('Digite um e-mail válido.');
    if (form.senha && senha.length < 6) return aviso('A senha precisa ter pelo menos 6 caracteres.');
    if (form.nome && !nomeV) return aviso('Me conta seu nome 🙂');
    btn.disabled = true; btn.innerHTML = '<span class="loading"></span>';
    try {
      if (abaLogin === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else if (abaLogin === 'criar') {
        const { data, error } = await sb.auth.signUp({ email, password: senha, options: { data: { nome: nomeV }, emailRedirectTo: location.origin + location.pathname } });
        if (error) throw error;
        if (!data.session) { abaLogin = 'entrar'; telaLogin('Conta criada! Enviei um link de confirmação para o seu e-mail — confirme e depois entre aqui.', 'ok'); return; }
      } else if (abaLogin === 'esqueci') {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
        if (error) throw error;
        abaLogin = 'entrar'; telaLogin('Se esse e-mail tiver conta, chega um link para criar uma nova senha.', 'ok'); return;
      } else if (abaLogin === 'nova-senha') {
        const { error } = await sb.auth.updateUser({ password: senha });
        if (error) throw error;
        abaLogin = 'entrar'; toast('Senha alterada ✿'); await entrar((await sb.auth.getSession()).data.session); return;
      }
    } catch (e) {
      aviso(traduzir(e));
      btn.disabled = false; btn.textContent = 'Tentar de novo';
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
  async function entrar(sessao) {
    usuario = sessao?.user || null;
    if (!usuario) { telaLogin(); return; }
    document.body.classList.remove('deslogado');
    $('#app').innerHTML = '<div class="carregando"><span class="loading"></span><p class="script">abrindo sua estante...</p></div>';
    try { await baixar(); }
    catch (e) { console.error(e); toast('Não consegui carregar seus livros. Confira a configuração do Supabase.', 'erro'); }
    aplicarTema(); atualizarConta(); render();
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
      if (evento === 'SIGNED_IN' && (!usuario || usuario.id !== sessao?.user?.id) && !ignorarPrimeiro) entrar(sessao);
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
  };
})();
