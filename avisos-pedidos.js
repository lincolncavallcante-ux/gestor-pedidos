/* Mini Forge 64 | Avisos de pedidos da loja v1
 * Módulo isolado: não altera o código do gestor, carrinho, e-mail ou Supabase Auth.
 * Requer: config.js + 01_INSTALAR_AVISOS_PAINEL.sql.
 */
(() => {
  'use strict';
  const UPDATE_MS = 30000;
  const OPEN_KEY = 'mf64_avisos_abrir_pedido_v1';
  const config = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const nav = document.querySelector('button.nav-item[data-page="pedidos"]');
  const ordersView = $('orders-view');
  const authScreen = $('auth-screen');
  if (!nav || !ordersView || !config.supabaseUrl || !config.supabaseAnonKey) return;

  let sb = null;
  let busy = false;
  let marking = false;
  let currentUser = '';
  let firstPoll = true;
  let latestIds = [];
  let displayed = [];
  let lastTotal = 0;
  let silentTimer = null;

  const badge = document.createElement('span');
  badge.className = 'mf64-novo-badge';
  badge.hidden = true;
  badge.setAttribute('aria-label', 'Pedidos novos da loja');
  nav.appendChild(badge);

  const box = document.createElement('section');
  box.className = 'mf64-novos-painel';
  box.hidden = true;
  box.setAttribute('aria-label', 'Novos pedidos recebidos na loja');
  box.innerHTML = `
    <div class="mf64-novos-topo">
      <div>
        <div class="mf64-novos-titulo"><span class="mf64-icone" aria-hidden="true">🔔</span><span id="mf64-avisos-titulo">Novos pedidos da loja</span></div>
        <p class="mf64-novos-ajuda">Encomendas recebidas na loja virtual e ainda não marcadas como vistas.</p>
      </div>
      <div class="mf64-novos-acoes">
        <button class="mf64-novos-botao" id="mf64-avisos-atualizar" type="button">Atualizar</button>
        <button class="mf64-novos-botao" id="mf64-avisos-marcar-todos" type="button">Marcar todos como vistos</button>
      </div>
    </div>
    <ul class="mf64-novos-lista" id="mf64-avisos-lista"></ul>
    <p class="mf64-novos-erro" id="mf64-avisos-erro" hidden role="alert"></p>`;
  ordersView.prepend(box);

  function showMessage(message) {
    let toast = document.getElementById('mf64-avisos-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'mf64-avisos-toast';
      toast.className = 'mf64-avisos-toast';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(silentTimer);
    silentTimer = setTimeout(() => { toast.hidden = true; }, 4800);
  }
  function setError(message) {
    const el = $('mf64-avisos-erro');
    el.textContent = message || '';
    el.hidden = !message;
    if (message) box.hidden = false;
  }
  const currency = (value) => Number(value || 0).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
  const showDate = (value) => {
    const d = new Date(value);
    return Number.isNaN(d.valueOf()) ? '' : d.toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
  };
  const isLoggedInUI = () => authScreen && authScreen.classList.contains('hidden');
  function resetUI() {
    badge.hidden = true;
    box.hidden = true;
    badge.textContent = '';
    latestIds = [];
    displayed = [];
    lastTotal = 0;
    setError('');
  }
  function render(total, pedidos) {
    const count = Math.max(0, Number(total) || 0);
    lastTotal = count;
    displayed = Array.isArray(pedidos) ? pedidos : [];
    badge.hidden = count === 0;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.title = `${count} pedido${count===1?'':'s'} novo${count===1?'':'s'} da loja`;
    box.hidden = count === 0;
    $('mf64-avisos-titulo').textContent = `${count} novo${count===1?' pedido':'s pedidos'} da loja`;
    const list = $('mf64-avisos-lista');
    list.replaceChildren();
    displayed.forEach(order => {
      const li = document.createElement('li');
      li.className = 'mf64-novos-item';
      const desc = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'mf64-novos-cliente';
      name.textContent = String(order.cliente || 'Cliente');
      const detail = document.createElement('div');
      detail.className = 'mf64-novos-info';
      detail.textContent = `#${String(order.pedido_id || '').slice(0,8).toUpperCase()} • ${currency(order.valor)} • ${showDate(order.criado_em)}`;
      desc.append(name,detail);
      const actions = document.createElement('div');
      actions.className = 'mf64-novos-acoes mf64-novos-abertura';
      const open = document.createElement('button');
      open.className = 'mf64-novos-botao';
      open.type = 'button';
      open.textContent = 'Ver pedido';
      open.addEventListener('click', () => openOrder(order));
      const seen = document.createElement('button');
      seen.className = 'mf64-novos-botao';
      seen.type = 'button';
      seen.textContent = 'Marcar como visto';
      seen.addEventListener('click', () => markSeen([String(order.checkout_id)]));
      actions.append(open,seen);
      li.append(desc,actions);
      list.append(li);
    });
    if (count > displayed.length) {
      const li = document.createElement('li');
      li.className = 'mf64-novos-info';
      li.style.paddingTop = '9px';
      li.textContent = `Mais ${count - displayed.length} pedido(s) novo(s). Marque os visíveis como vistos para mostrar os demais.`;
      list.appendChild(li);
    }
    setError('');
  }
  function findOrderButton(orderId) {
    return [...document.querySelectorAll('#order-rows button[data-action="edit-order"]')]
      .find(el => el.dataset.id === String(orderId));
  }
  function makeOrdersVisible() {
    const navOrders = document.querySelector('button.nav-item[data-page="pedidos"]');
    if (navOrders && !navOrders.classList.contains('active')) navOrders.click();
    const orderSearch = $('order-search');
    const status = $('status-filter');
    const client = $('client-filter');
    if (orderSearch && orderSearch.value) { orderSearch.value = ''; orderSearch.dispatchEvent(new Event('input', {bubbles:true})); }
    if (status && status.value) { status.value=''; status.dispatchEvent(new Event('change', {bubbles:true})); }
    if (client && client.value) { client.value=''; client.dispatchEvent(new Event('change', {bubbles:true})); }
  }
  async function openOrder(order) {
    const pedidoId = String(order.pedido_id || '');
    const checkoutId = String(order.checkout_id || '');
    if (!pedidoId || !checkoutId) return;
    makeOrdersVisible();
    const button = findOrderButton(pedidoId);
    if (button) {
      button.click();
      await markSeen([checkoutId]);
      return;
    }
    // O app.js antigo não atualiza sua lista enquanto o painel fica aberto.
    // Recarrega o gestor, abre a encomenda e só então marca o aviso como visto.
    sessionStorage.setItem(OPEN_KEY, JSON.stringify({ userId:currentUser, pedidoId, checkoutId }));
    window.location.reload();
  }
  let restoreBusy = false;
  function tryOpenAfterReload() {
    if (restoreBusy || !sb || !currentUser || !isLoggedInUI()) return;
    let record;
    try { record = JSON.parse(sessionStorage.getItem(OPEN_KEY) || 'null'); }
    catch (_) { sessionStorage.removeItem(OPEN_KEY); return; }
    if (!record || record.userId !== currentUser) return;
    const button = findOrderButton(record.pedidoId);
    if (!button) return;
    restoreBusy = true;
    sessionStorage.removeItem(OPEN_KEY);
    makeOrdersVisible();
    button.click();
    Promise.resolve(markSeen([record.checkoutId])).finally(() => { restoreBusy=false; });
  }
  async function markSeen(ids = null) {
    if (marking || !sb || !currentUser) return;
    marking = true;
    const all = !ids;
    const buttons = [...box.querySelectorAll('button')];
    buttons.forEach(b => { b.disabled = true; });
    try {
      const {error} = await sb.rpc('mf64_marcar_avisos_lidos', {
        p_ate: new Date().toISOString(),
        p_ids: ids || null
      });
      if (error) throw error;
      await refresh(true);
      if (all) showMessage('Pedidos marcados como vistos.');
    } catch (err) {
      setError('Não foi possível marcar como visto. Confira a conexão e o SQL de instalação.');
      console.warn('[Mini Forge 64] Avisos:', err?.message || err);
    } finally {
      marking=false;
      buttons.forEach(b => { b.disabled = false; });
    }
  }
  async function refresh(force = false) {
    if (busy || !sb) return;
    if (document.hidden && !force) return;
    if (!isLoggedInUI()) { currentUser=''; firstPoll=true; resetUI(); return; }
    busy = true;
    try {
      const {data:sessionData,error:sessionError} = await sb.auth.getSession();
      if (sessionError) throw sessionError;
      const session = sessionData?.session;
      if (!session?.user?.id) { currentUser=''; firstPoll=true; resetUI(); return; }
      if (currentUser !== session.user.id) {
        currentUser = session.user.id;
        firstPoll = true;
        latestIds = [];
      }
      const {data,error} = await sb.rpc('mf64_obter_avisos_pedidos');
      if (error) throw error;
      const incoming = data?.pedidos || [];
      const ids = incoming.map(x => String(x.checkout_id));
      if (!firstPoll && ids.some(id => !latestIds.includes(id))) {
        showMessage('Nova encomenda recebida na Mini Forge 64!');
      }
      latestIds = ids;
      firstPoll = false;
      render(data?.total || 0, incoming);
      tryOpenAfterReload();
    } catch (err) {
      console.warn('[Mini Forge 64] Erro ao consultar avisos:', err?.message || err);
      setError('Avisos indisponíveis. Confira se o SQL de instalação foi executado.');
    } finally { busy = false; }
  }
  $('mf64-avisos-atualizar').addEventListener('click', () => refresh(true));
  $('mf64-avisos-marcar-todos').addEventListener('click', () => markSeen());
  const table = $('order-rows');
  if (table) new MutationObserver(tryOpenAfterReload).observe(table, {childList:true,subtree:false});
  if (authScreen) new MutationObserver(() => setTimeout(() => refresh(true), 250)).observe(authScreen, {attributes:true,attributeFilter:['class']});
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(true); });
  window.addEventListener('online', () => refresh(true));

  (async () => {
    try {
      const {createClient} = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      // Cliente exclusivo de LEITURA/controle de avisos. Compartilha a sessão
      // persistida pelo gestor, mas não cria tokens públicos adicionais.
      sb = createClient(config.supabaseUrl, config.supabaseAnonKey, {
        auth: { autoRefreshToken:false, persistSession:true, detectSessionInUrl:false }
      });
      await refresh(true);
      setInterval(() => refresh(false), UPDATE_MS);
    } catch (err) {
      console.warn('[Mini Forge 64] Não foi possível iniciar os avisos:', err?.message || err);
    }
  })();
})();
