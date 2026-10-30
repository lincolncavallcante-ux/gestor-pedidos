/* Gestor de Pedidos v2 - múltiplos itens por pedido; local e Supabase. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const LOCAL_KEY = 'gestor_pedidos_v1';
  const MODE_KEY = 'gestor_pedidos_mode_v1';
  // Comprovante não fiscal: abre uma página de impressão protegida pelo login.
  const VALID_STATUS = ['Pendente', 'Em andamento', 'Concluído', 'Cancelado'];
  const state = { page: 'pedidos', clients: [], orders: [], mode: localStorage.getItem(MODE_KEY) === 'cloud' ? 'cloud' : 'local', supabase: null, session: null, modal: null, registering: false, busy: false };
  const config = window.APP_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  const money = (v) => Number(v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const uid = () => (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const formatDate = (date) => date ? new Date(`${date}T12:00:00`).toLocaleDateString('pt-BR') : '—';

  // Pedidos antigos não possuem a coluna 'itens': representá-los como um único item.
  const MAX_ITEMS = 100;
  const getItems = (order) => (Array.isArray(order?.itens) && order.itens.length ? order.itens : [{ descricao: order?.descricao || 'Item do pedido', quantidade: 1, valor_unitario: Number(order?.valor || 0) }]);
  const toCents = (v) => Math.round(Number(v || 0) * 100);
  const itemsTotalCents = (items) => items.reduce((sum, item) => sum + Number(item.quantidade) * toCents(item.valor_unitario), 0);
  const orderSummary = (items) => items.length === 1 ? items[0].descricao : `${items[0].descricao} (+ ${items.length-1} ${items.length===2?'item':'itens'})`.slice(0, 250);
  function validateItems(items) {
    if (!items.length || items.length > MAX_ITEMS) throw Error('O pedido deve ter de 1 a 100 itens.');
    for (const item of items) {
      if (typeof item.descricao !== 'string' || !item.descricao.trim() || item.descricao.length > 250) throw Error('Informe a descrição de cada item (até 250 caracteres).');
      if (!Number.isInteger(item.quantidade) || item.quantidade < 1 || item.quantidade > 99999) throw Error('A quantidade deve ser um número inteiro entre 1 e 99.999.');
      if (!Number.isFinite(item.valor_unitario) || item.valor_unitario < 0 || item.valor_unitario > 999999999.99) throw Error('Confira o valor unitário dos itens.');
      if (Math.abs(item.valor_unitario * 100 - toCents(item.valor_unitario)) > 0.000001) throw Error('O valor unitário deve ter no máximo duas casas decimais.');
    }
    const total = itemsTotalCents(items);
    if (!Number.isSafeInteger(total) || total > 999999999999) throw Error('O total do pedido excede o limite permitido.');
    return total / 100;
  }
  function itemRow(item={descricao:'', quantidade:1, valor_unitario:0}) {
    return `<div class="order-item-row" data-item-row>
      <div class="field item-name"><label>Produto / serviço *</label><input class="item-descricao" type="text" required maxlength="250" placeholder="Ex.: Camiseta azul" value="${esc(item.descricao)}"></div>
      <div class="field item-qty"><label>Quantidade *</label><input class="item-quantidade" type="number" required min="1" max="99999" step="1" value="${esc(Number(item.quantidade))}"></div>
      <div class="field item-price"><label>Valor unitário (R$) *</label><input class="item-valor" type="number" required min="0" max="999999999.99" step="0.01" inputmode="decimal" value="${esc(Number(item.valor_unitario))}"></div>
      <div class="item-subtotal"><span>Subtotal</span><strong data-item-subtotal>R$ 0,00</strong></div>
      <button class="item-remove" type="button" data-remove-item aria-label="Remover item">✕</button>
    </div>`;
  }
  function updateItemsPreview() {
    const list = $('itens-list');
    if (!list) return;
    let sum = 0;
    const rows = [...list.querySelectorAll('[data-item-row]')];
    rows.forEach(row => {
      const qty = Number(row.querySelector('.item-quantidade').value);
      const unit = Number(row.querySelector('.item-valor').value);
      const subtotal = Number.isInteger(qty) && qty > 0 && Number.isFinite(unit) && unit >= 0 ? qty * toCents(unit) : 0;
      sum += subtotal;
      row.querySelector('[data-item-subtotal]').textContent = money(subtotal / 100);
      row.querySelector('[data-remove-item]').disabled = rows.length === 1;
    });
    $('items-total').textContent = money(sum / 100);
    $('items-count').textContent = `${rows.length} ${rows.length === 1 ? 'item' : 'itens'}`;
    $('add-item-btn').disabled = rows.length >= MAX_ITEMS;
  }
  function collectItems() {
    return [...$('itens-list').querySelectorAll('[data-item-row]')].map(row => ({
      descricao: row.querySelector('.item-descricao').value.trim(),
      quantidade: Number(row.querySelector('.item-quantidade').value),
      valor_unitario: Number(row.querySelector('.item-valor').value)
    }));
  }
  const toast = (msg) => { $('toast').textContent = msg; $('toast').classList.remove('hidden'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('toast').classList.add('hidden'), 4400); };
  const setAlert = (msg) => { $('app-alert').textContent = msg; $('app-alert').classList.toggle('hidden', !msg); };
  const errMsg = (e) => e?.message || 'Ocorreu um erro inesperado.';
  function download(filename, content, type) { const blob = new Blob([content], {type}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function readLocal() { try { const data = JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}'); state.clients = Array.isArray(data.clients) ? data.clients : []; state.orders = Array.isArray(data.orders) ? data.orders : []; } catch { state.clients = []; state.orders = []; toast('Não foi possível ler os dados locais. Restaure um backup.'); } }
  function saveLocal() { localStorage.setItem(LOCAL_KEY, JSON.stringify({clients:state.clients,orders:state.orders})); }
  async function initCloud() {
    if (!configured) { state.mode = 'local'; localStorage.setItem(MODE_KEY, 'local'); readLocal(); setAlert('Para ativar a nuvem, preencha config.js e execute supabase.sql. Enquanto isso, seus dados estão salvos neste navegador.'); render(); return; }
    try {
      const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
      state.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);
      const { data, error } = await state.supabase.auth.getSession();
      if (error) throw error;
      state.session = data.session;
      state.supabase.auth.onAuthStateChange((_event, session) => {
        state.session = session;
        if (state.mode === 'cloud') { updateMode(); if (session) setTimeout(() => loadCloud(), 0); else render(); }
      });
      if (state.session) await loadCloud(); else updateMode();
    } catch(e) { toast(`Não foi possível conectar ao banco: ${errMsg(e)}`); state.mode = 'local'; localStorage.setItem(MODE_KEY, 'local'); readLocal(); render(); }
  }
  async function loadCloud() {
    if (!state.supabase || !state.session || state.mode !== 'cloud') return;
    const [c,o] = await Promise.all([
      state.supabase.from('clientes').select('*').order('nome', {ascending:true}),
      state.supabase.from('pedidos').select('*').order('data_pedido', {ascending:false})
    ]);
    if (c.error || o.error) { setAlert(`Erro ao consultar o banco: ${errMsg(c.error || o.error)}. Verifique se o SQL foi executado.`); return; }
    state.clients = c.data || []; state.orders = o.data || []; setAlert(''); render();
  }
  function updateMode() {
    const cloud = state.mode === 'cloud';
    $('storage-label').textContent = cloud ? 'Banco de dados online' : 'Armazenamento local';
    $('storage-description').textContent = cloud ? (state.session?.user?.email || 'Entre com sua conta') : 'Dados neste navegador';
    $('mode-btn').textContent = cloud ? '▣ Trocar armazenamento' : '☁ Configurar nuvem';
    $('logout-btn').classList.toggle('hidden', !cloud || !state.session);
    $('auth-screen').classList.toggle('hidden', !cloud || Boolean(state.session));
    $('import-btn').disabled = cloud;
    $('backup-btn').disabled = cloud && !state.session;
  }
  function render() {
    updateMode();
    $('today-label').textContent = new Intl.DateTimeFormat('pt-BR', { day:'numeric',month:'long',year:'numeric' }).format(new Date());
    const ordersPage = state.page === 'pedidos';
    $('orders-view').classList.toggle('hidden', !ordersPage);
    $('clients-view').classList.toggle('hidden', ordersPage);
    $('page-title').textContent = ordersPage ? 'Controle de pedidos' : 'Meus clientes';
    $('breadcrumb-current').textContent = ordersPage ? 'Pedidos' : 'Clientes';
    $('page-subtitle').textContent = ordersPage ? 'Acompanhe os pedidos de cada cliente em um só lugar.' : 'Organize seus contatos e consulte o histórico de cada cliente.';
    $('new-btn').textContent = ordersPage ? '+ Novo pedido' : '+ Novo cliente';
    $('export-csv').textContent = ordersPage ? '↓ Exportar CSV' : '↓ Exportar clientes';
    document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === state.page));
    renderOrders(); renderClients();
  }
  function renderOrders() {
    $('metric-orders').textContent = state.orders.length;
    $('metric-pending').textContent = state.orders.filter(x => ['Pendente','Em andamento'].includes(x.status)).length;
    $('metric-done').textContent = state.orders.filter(x => x.status === 'Concluído').length;
    $('metric-value').textContent = money(state.orders.filter(x => x.status !== 'Cancelado').reduce((n,x) => n + Number(x.valor || 0), 0));
    const selected = $('client-filter').value;
    const options = [...state.clients].sort((a,b) => a.nome.localeCompare(b.nome,'pt-BR')).map(c => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join('');
    $('client-filter').innerHTML = '<option value="">Todos os clientes</option>' + options;
    $('client-filter').value = state.clients.some(x=> x.id === selected) ? selected : '';
    const search = norm($('order-search').value), status = $('status-filter').value, client = $('client-filter').value;
    const cMap = new Map(state.clients.map(x => [x.id,x]));
    const rows = state.orders.filter(o => {
      const c = cMap.get(o.cliente_id);
      return (!search || norm(`${o.descricao} ${getItems(o).map(i=>i.descricao).join(' ')} ${o.observacoes} ${c?.nome || ''}`).includes(search)) && (!status || o.status === status) && (!client || o.cliente_id === client);
    }).sort((a,b) => {
      const cmp = String(a.data_pedido).localeCompare(String(b.data_pedido));
      const tie = String(a.created_at||'').localeCompare(String(b.created_at||''));
      return $('date-sort').value === 'old' ? cmp || tie : -(cmp || tie);
    });
    $('order-count').textContent = `${rows.length} resultado${rows.length === 1 ? '' : 's'}`;
    $('order-rows').innerHTML = rows.map(o=>{
      const c = cMap.get(o.cliente_id);
      const statusClass = {'Pendente':'pendente','Em andamento':'em-andamento','Concluído':'concluido','Cancelado':'cancelado'}[o.status] || 'pendente';
      const itens = getItems(o);
      const itemDescriptions = itens.map(i => `${i.quantidade}× ${i.descricao}`).join(' · ');
      return `<tr><td class="date-cell">${esc(formatDate(o.data_pedido))}</td><td><div class="cell-main">${esc(c?.nome || 'Cliente removido')}</div><div class="cell-sub">${esc(c?.telefone || '')}</div></td><td><div class="cell-main">${itens.length} ${itens.length === 1 ? 'item' : 'itens'} no pedido</div><div class="cell-sub order-item-preview" title="${esc(itemDescriptions)}">${esc(itemDescriptions)}</div>${o.observacoes ? `<div class="cell-sub">${esc(o.observacoes.slice(0,100))}</div>`:''}</td><td class="price-cell">${esc(money(o.valor))}</td><td><span class="status status-${statusClass}">${esc(o.status)}</span></td><td class="actions-col"><div class="row-actions"><button class="icon-btn" type="button" data-action="edit-order" data-id="${esc(o.id)}" title="Ver ou editar itens">Ver / editar</button><button class="icon-btn" type="button" data-action="receipt-order" data-id="${esc(o.id)}" title="Gerar comprovante de pedido para imprimir ou salvar PDF">Comprovante</button><button class="icon-btn danger" type="button" data-action="delete-order" data-id="${esc(o.id)}" title="Excluir pedido">Excluir</button></div></td></tr>`;
    }).join('');
    $('orders-empty').classList.toggle('hidden',rows.length !== 0);
    $('orders-empty-title').textContent = state.orders.length ? 'Nenhum pedido encontrado' : 'Nenhum pedido cadastrado';
    $('orders-empty-text').textContent = state.orders.length ? 'Altere a busca ou os filtros para visualizar mais pedidos.' : 'Comece cadastrando um cliente e depois crie o primeiro pedido.';
  }
  function renderClients() {
    const q = norm($('client-search').value);
    const clients = [...state.clients].filter(c=> !q || norm(`${c.nome} ${c.telefone} ${c.email}`).includes(q)).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
    $('client-count').textContent = `${clients.length} cliente${clients.length===1?'':'s'}`;
    $('client-rows').innerHTML = clients.map(c => `<tr><td><div class="cell-main">${esc(c.nome)}</div><div class="cell-sub">ID ${esc(String(c.id).slice(0,8))}</div></td><td><div>${esc(c.telefone||'—')}</div><div class="cell-sub">${esc(c.email||'')}</div></td><td><strong>${state.orders.filter(o=>o.cliente_id === c.id).length}</strong></td><td class="date-cell">${esc(formatDate((c.created_at||'').slice(0,10)))}</td><td class="actions-col"><div class="row-actions"><button type="button" class="icon-btn" data-action="view-client" data-id="${esc(c.id)}">Pedidos</button><button type="button" class="icon-btn" data-action="edit-client" data-id="${esc(c.id)}">Editar</button><button type="button" class="icon-btn danger" data-action="delete-client" data-id="${esc(c.id)}">Excluir</button></div></td></tr>`).join('');
    $('clients-empty').classList.toggle('hidden',clients.length !== 0);
  }
  function openModal(type,id=null) {
    const rec = id ? (type === 'order' ? state.orders : state.clients).find(x=>x.id===id) : null;
    if (type === 'order' && !state.clients.length) { toast('Primeiro cadastre um cliente para vincular o pedido.'); state.page='clientes'; render(); openModal('client'); return; }
    state.modal = {type,id};
    document.querySelector('#modal-backdrop .modal').classList.toggle('modal-wide',type==='order');
    const editing = !!rec;
    $('modal-title').textContent = `${editing?'Editar':'Novo'} ${type==='order'?'pedido':'cliente'}`;
    $('modal-kicker').textContent = editing ? 'EDITAR REGISTRO' : 'CADASTRO';
    if (type === 'client') {
      $('form-fields').innerHTML = `<div class="field"><label for="f-nome">Nome do cliente *</label><input id="f-nome" name="nome" type="text" maxlength="160" required placeholder="Nome completo ou empresa" value="${esc(rec?.nome||'')}"></div><div class="form-grid"><div class="field"><label for="f-telefone">Telefone</label><input id="f-telefone" name="telefone" maxlength="35" type="tel" placeholder="(99) 99999-9999" value="${esc(rec?.telefone||'')}"></div><div class="field"><label for="f-email">E-mail</label><input id="f-email" name="email" maxlength="200" type="email" placeholder="contato@exemplo.com" value="${esc(rec?.email||'')}"></div></div>`;
    } else {
      const items = rec ? getItems(rec) : [{ descricao:'', quantidade:1, valor_unitario:0 }];
      $('form-fields').innerHTML = `<div class="form-grid">
        <div class="field span2"><label for="f-cliente">Cliente *</label><select id="f-cliente" name="cliente_id" required><option value="">Selecione um cliente</option>${[...state.clients].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(c=>`<option value="${esc(c.id)}" ${rec?.cliente_id === c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select><button class="inline-link" id="add-client-in-order" type="button">+ Cadastrar outro cliente</button></div>
        <div class="field"><label for="f-data">Data do pedido *</label><input id="f-data" name="data_pedido" type="date" required value="${esc(rec?.data_pedido||today())}"></div>
        <div class="field"><label for="f-status">Status</label><select id="f-status" name="status">${VALID_STATUS.map(s=>`<option ${rec?.status===s?'selected':''}>${s}</option>`).join('')}</select></div>
        <section class="order-items-section span2" aria-label="Itens do pedido">
          <div class="order-items-head"><div><h3>Itens do pedido <span class="order-items-count" id="items-count"></span></h3><p>Inclua quantos produtos ou serviços precisar no mesmo pedido.</p></div><button class="btn btn-light add-item-btn" type="button" id="add-item-btn" data-add-item>+ Adicionar item</button></div>
          <div id="itens-list">${items.map(itemRow).join('')}</div>
          <div class="order-items-total"><span>Total do pedido</span><strong id="items-total">R$ 0,00</strong></div>
        </section>
        <div class="field span2"><label for="f-notes">Observações</label><textarea id="f-notes" name="observacoes" maxlength="3000" placeholder="Detalhes adicionais sobre o pedido">${esc(rec?.observacoes||'')}</textarea></div>
      </div>`;
      updateItemsPreview();
      $('add-client-in-order').addEventListener('click',()=>{closeModal(); state.page='clientes'; render(); openModal('client'); toast('Cadastre o cliente e depois crie o pedido.');});
    }
    $('form-save').textContent = editing ? 'Salvar alterações' : `Cadastrar ${type === 'order' ? 'pedido' : 'cliente'}`;
    $('modal-backdrop').classList.remove('hidden');
    document.body.style.overflow='hidden';
    $('form-fields').querySelector('input,select')?.focus();
  }
  function closeModal() { $('modal-backdrop').classList.add('hidden'); state.modal=null; document.body.style.overflow=''; }
  async function writeRecord(type,id,payload) {
    if (state.mode === 'cloud') {
      if (!state.session) throw Error('Entre na sua conta para salvar.');
      const table = type === 'order' ? 'pedidos' : 'clientes';
      const query = id ? state.supabase.from(table).update(payload).eq('id',id) : state.supabase.from(table).insert({...payload,user_id:state.session.user.id});
      const {error} = await query;
      if (error) throw error;
      await loadCloud();
    } else {
      const key = type === 'order' ? 'orders':'clients';
      if (id) state[key] = state[key].map(x => x.id===id ? {...x,...payload} : x);
      else state[key].push({...payload,id:uid(),created_at:new Date().toISOString()});
      saveLocal(); render();
    }
  }
  async function submitRecord(e) {
    e.preventDefault(); if (!state.modal || state.busy) return;
    const {type,id} = state.modal;
    const f = new FormData($('record-form'));
    let payload;
    if (type === 'client') {
      payload = {nome: String(f.get('nome')||'').trim(),telefone:String(f.get('telefone')||'').trim(),email:String(f.get('email')||'').trim()};
      if (!payload.nome) return toast('Informe o nome do cliente.');
    } else {
      const itens = collectItems();
      let valor;
      try { valor = validateItems(itens); } catch (error) { return toast(errMsg(error)); }
      payload = {cliente_id:String(f.get('cliente_id')||''),descricao:orderSummary(itens),itens,data_pedido:String(f.get('data_pedido')||''),valor,status:String(f.get('status')||''),observacoes:String(f.get('observacoes')||'').trim()};
      if (!state.clients.some(x=>x.id===payload.cliente_id)) return toast('Selecione um cliente válido.');
      if (!/^\d{4}-\d\d-\d\d$/.test(payload.data_pedido) || !VALID_STATUS.includes(payload.status)) return toast('Confira a data e o status do pedido.');
    }
    state.busy=true; $('form-save').disabled=true;
    try { await writeRecord(type,id,payload); closeModal(); toast(`${type==='client'?'Cliente':'Pedido'} ${id?'atualizado':'cadastrado'} com sucesso.`); }
    catch(e){toast(e?.code === 'PGRST204' || /column.*itens|itens.*column/i.test(errMsg(e)) ? 'Atualize o banco: execute MIGRACAO_SUPABASE.sql antes de usar vários itens.' : `Erro ao salvar: ${errMsg(e)}`)}
    finally{state.busy=false;$('form-save').disabled=false;}
  }
  async function removeRecord(type,id) {
    const isClient = type === 'client';
    const item = (isClient ? state.clients:state.orders).find(x=>x.id===id);
    if (!item) return;
    if (isClient && state.orders.some(x=>x.cliente_id===id)) return toast('Este cliente possui pedidos. Exclua ou transfira os pedidos antes de removê-lo.');
    if (!window.confirm(`Excluir ${isClient?`o cliente "${item.nome}"`:`o pedido "${item.descricao}"`}? Esta ação não pode ser desfeita.`)) return;
    try {
      if (state.mode === 'cloud') {
        const {error} = await state.supabase.from(isClient?'clientes':'pedidos').delete().eq('id',id);
        if (error) throw error;
        await loadCloud();
      } else {
        if (isClient) state.clients=state.clients.filter(x=>x.id!==id);
        else state.orders=state.orders.filter(x=>x.id!==id);
        saveLocal(); render();
      }
      toast('Registro excluído.');
    } catch(e) {toast(`Não foi possível excluir: ${errMsg(e)}`);}
  }
  function toCSV(rows) {
    // Neutraliza fórmulas para abertura segura em planilhas.
    const cell = (v) => { let str=String(v??''); if (/^[\s]*[=+@\-\t\r]/.test(str) && !/^-?\d+(?:[.,]\d+)?$/.test(str.trim())) str="'"+str; return `"${str.replace(/"/g,'""')}"`; };
    return '\ufeff'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
  }
  function exportCSV() {
    const date = today();
    if (state.page === 'clientes') {
      download(`clientes-${date}.csv`,toCSV([['Nome','Telefone','E-mail','Cadastro','Pedidos'],...state.clients.map(c=>[c.nome,c.telefone,c.email,formatDate((c.created_at||'').slice(0,10)),state.orders.filter(x=>x.cliente_id===c.id).length])]),'text/csv;charset=utf-8');
    } else {
      const cMap = new Map(state.clients.map(c=>[c.id,c.nome]));
      const rows = [...state.orders].sort((a,b)=>b.data_pedido.localeCompare(a.data_pedido));
      const lines = rows.flatMap(o => getItems(o).map((i,idx) => [o.id,formatDate(o.data_pedido),cMap.get(o.cliente_id)||'',i.descricao,i.quantidade,Number(i.valor_unitario).toFixed(2).replace('.',','),(Number(i.quantidade)*toCents(i.valor_unitario)/100).toFixed(2).replace('.',','),idx===0?Number(o.valor||0).toFixed(2).replace('.',','):'',o.status,idx===0?o.observacoes:'']));
      download(`pedidos-${date}.csv`,toCSV([['ID pedido','Data','Cliente','Item','Quantidade','Valor unitário (R$)','Subtotal (R$)','Total pedido (R$)','Status','Observações'],...lines]),'text/csv;charset=utf-8');
    }
    toast('Arquivo CSV exportado.');
  }
  function exportBackup() {
    download(`backup-pedidos-${today()}.json`,JSON.stringify({app:'gestor-pedidos',version:2,exported_at:new Date().toISOString(),clients:state.clients,orders:state.orders},null,2),'application/json');toast('Backup JSON salvo. Guarde em local seguro.');
  }
  async function importBackup(file) {
    if (!file || state.mode !== 'local') return;
    try {
      if (file.size > 10*1024*1024) throw Error('Arquivo maior que 10 MB.');
      const data = JSON.parse(await file.text());
      if (data.app !== 'gestor-pedidos' || !Array.isArray(data.clients) || !Array.isArray(data.orders)) throw Error('Arquivo de backup inválido.');
      if (data.clients.length > 50000 || data.orders.length > 200000) throw Error('Backup grande demais para armazenamento local.');
      const ids = new Set();
      const clients = data.clients.map(c=>{
        if (typeof c.id!=='string'||!c.id||typeof c.nome!=='string'||!c.nome.trim()||ids.has(c.id)) throw Error('Dados de clientes inválidos.');
        ids.add(c.id);return {id:c.id,nome:c.nome.slice(0,160),telefone:String(c.telefone||'').slice(0,35),email:String(c.email||'').slice(0,200),created_at:String(c.created_at||new Date().toISOString())};
      });
      const orderIds = new Set();
      const orders = data.orders.map(o=>{
        if(typeof o.id!=='string'||!o.id||orderIds.has(o.id)||!ids.has(o.cliente_id)||typeof o.descricao!=='string'||!/^\d{4}-\d\d-\d\d$/.test(o.data_pedido)||!VALID_STATUS.includes(o.status)||!Number.isFinite(Number(o.valor))||Number(o.valor)<0) throw Error('Dados de pedidos inválidos.');
        const itens = getItems(o).map(i=>({descricao:String(i.descricao || '').trim(), quantidade:Number(i.quantidade), valor_unitario:Number(i.valor_unitario)}));
        const total = validateItems(itens);
        orderIds.add(o.id); return {id:o.id,cliente_id:o.cliente_id,descricao:orderSummary(itens),itens,data_pedido:o.data_pedido,valor:total,status:o.status,observacoes:String(o.observacoes||'').slice(0,3000),created_at:String(o.created_at||new Date().toISOString())};
      });
      if (!window.confirm(`Restaurar ${clients.length} clientes e ${orders.length} pedidos? Todos os dados LOCAIS atuais serão substituídos. Faça um backup antes de continuar.`)) return;
      localStorage.setItem(LOCAL_KEY,JSON.stringify({clients,orders})); state.clients=clients;state.orders=orders;render();toast('Backup restaurado com sucesso.');
    } catch(e) { toast(`Falha na restauração: ${errMsg(e)}`); }
    finally { $('import-file').value=''; }
  }
  async function switchMode(mode) {
    $('cloud-backdrop').classList.add('hidden');
    if (mode === 'cloud' && !configured) {toast('Primeiro configure a URL e a chave pública do Supabase em config.js.');return;}
    if (mode === state.mode) {updateMode();return;}
    state.mode=mode;localStorage.setItem(MODE_KEY,mode);setAlert('');
    if (mode === 'local'){readLocal();render();}else if(!state.supabase){await initCloud();}else if(state.session){await loadCloud();}else{state.clients=[];state.orders=[];render();}
  }
  function handleRowAction(e) {
    const b = e.target.closest('button[data-action]');if(!b)return;
    const {action,id} = b.dataset;
    if(action==='receipt-order') {
      const order = state.orders.find(o => o.id === id);
      if (!order) return toast('Pedido não encontrado.');
      const url = new URL('comprovante.html', window.location.href);
      url.searchParams.set('pedido', String(order.id));
      if (state.mode === 'local') url.searchParams.set('local', '1');
      // O comprovante usa o login atual ou os registros locais, sem divulgar códigos do portal.
      window.open(url.href, '_blank', 'noopener');
    }
    if(action==='edit-order') openModal('order',id);
    if(action==='edit-client') openModal('client',id);
    if(action==='delete-order') removeRecord('order',id);
    if(action==='delete-client') removeRecord('client',id);
    if(action==='view-client'){state.page='pedidos';$('client-filter').value=id;render();$('client-filter').value=id;renderOrders();window.scrollTo({top:0,behavior:'smooth'});}
  }
  async function authSubmit(e) {
    e.preventDefault();if(!state.supabase)return;
    const email=$('auth-email').value.trim(),password=$('auth-password').value;
    $('auth-submit').disabled=true;$('auth-message').textContent='';
    try {
      if(state.registering){
        const {data,error}=await state.supabase.auth.signUp({email,password});if(error)throw error;
        $('auth-message').textContent = data.session ? 'Conta criada. Entrando...' : 'Conta criada! Verifique o e-mail para confirmar o cadastro, caso exigido pelo Supabase.';
      } else {
        const {error}=await state.supabase.auth.signInWithPassword({email,password});if(error)throw error;
      }
    }catch(e){$('auth-message').textContent=errMsg(e);}finally{$('auth-submit').disabled=false;}
  }
  function setup() {
    document.querySelectorAll('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{state.page=btn.dataset.page;render();document.querySelector('.sidebar').classList.remove('open');}));
    $('mobile-menu').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));
    $('new-btn').addEventListener('click',()=>openModal(state.page==='pedidos'?'order':'client'));
    $('empty-create-order').addEventListener('click',()=>openModal('order'));
    $('empty-create-client').addEventListener('click',()=>openModal('client'));
    ['order-search','status-filter','date-sort','client-filter'].forEach(id=>$(id).addEventListener(id==='order-search'?'input':'change',renderOrders));
    $('client-search').addEventListener('input',renderClients);
    $('order-rows').addEventListener('click',handleRowAction);$('client-rows').addEventListener('click',handleRowAction);
    $('record-form').addEventListener('submit',submitRecord);

    $('form-fields').addEventListener('click', (e) => {
      if (e.target.closest('[data-add-item]')) {
        const list = $('itens-list');
        if (!list || list.children.length >= MAX_ITEMS) return toast('Limite de 100 itens por pedido.');
        list.insertAdjacentHTML('beforeend',itemRow());
        updateItemsPreview();
        list.lastElementChild.querySelector('.item-descricao').focus();
      }
      if (e.target.closest('[data-remove-item]')) {
        const list = $('itens-list'), row = e.target.closest('[data-item-row]');
        if (!list || !row || list.children.length <= 1) return;
        row.remove(); updateItemsPreview();
      }
    });
    $('form-fields').addEventListener('input', (e) => {
      if (e.target.matches('.item-quantidade, .item-valor')) updateItemsPreview();
    });
    $('modal-close').addEventListener('click',closeModal);$('modal-cancel').addEventListener('click',closeModal);
    $('modal-backdrop').addEventListener('click',(e)=>{if(e.target===$('modal-backdrop'))closeModal();});
    document.addEventListener('keydown',(e)=>{if(e.key==='Escape'){$('cloud-backdrop').classList.add('hidden');closeModal();}});
    $('export-csv').addEventListener('click',exportCSV);
    $('backup-btn').addEventListener('click',exportBackup);
    $('import-btn').addEventListener('click',()=>{if(state.mode==='local')$('import-file').click();else toast('A restauração de backup está disponível apenas no modo local.');});
    $('import-file').addEventListener('change',(e)=>importBackup(e.target.files[0]));
    $('mode-btn').addEventListener('click',()=>$('cloud-backdrop').classList.remove('hidden'));
    $('cloud-close').addEventListener('click',()=>$('cloud-backdrop').classList.add('hidden'));
    $('cloud-backdrop').addEventListener('click',(e)=>{if(e.target===$('cloud-backdrop'))$('cloud-backdrop').classList.add('hidden');});
    $('use-local').addEventListener('click',()=>switchMode('local'));
    $('use-cloud').addEventListener('click',()=>switchMode('cloud'));
    $('logout-btn').addEventListener('click',async()=>{if(state.supabase)await state.supabase.auth.signOut();state.session=null;state.clients=[];state.orders=[];render();});
    $('auth-form').addEventListener('submit',authSubmit);
    $('auth-toggle').addEventListener('click',()=>{state.registering=!state.registering;$('auth-toggle').textContent=state.registering?'Já tenho uma conta':'Criar uma conta';$('auth-submit').textContent=state.registering?'Cadastrar':'Entrar';$('auth-message').textContent='';});
    $('auth-local').addEventListener('click',()=>switchMode('local'));
  }
  setup();
  if(state.mode==='cloud')initCloud();else{readLocal();render();}
})();
