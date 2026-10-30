/* Gestor de Pedidos - funciona localmente ou com Supabase + login. */
(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const LOCAL_KEY = 'gestor_pedidos_v1';
  const MODE_KEY = 'gestor_pedidos_mode_v1';
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
      return (!search || norm(`${o.descricao} ${o.observacoes} ${c?.nome || ''}`).includes(search)) && (!status || o.status === status) && (!client || o.cliente_id === client);
    }).sort((a,b) => {
      const cmp = String(a.data_pedido).localeCompare(String(b.data_pedido));
      const tie = String(a.created_at||'').localeCompare(String(b.created_at||''));
      return $('date-sort').value === 'old' ? cmp || tie : -(cmp || tie);
    });
    $('order-count').textContent = `${rows.length} resultado${rows.length === 1 ? '' : 's'}`;
    $('order-rows').innerHTML = rows.map(o=>{
      const c = cMap.get(o.cliente_id);
      const statusClass = {'Pendente':'pendente','Em andamento':'em-andamento','Concluído':'concluido','Cancelado':'cancelado'}[o.status] || 'pendente';
      return `<tr><td class="date-cell">${esc(formatDate(o.data_pedido))}</td><td><div class="cell-main">${esc(c?.nome || 'Cliente removido')}</div><div class="cell-sub">${esc(c?.telefone || '')}</div></td><td><div class="cell-main">${esc(o.descricao)}</div>${o.observacoes ? `<div class="cell-sub">${esc(o.observacoes).slice(0,100)}</div>`:''}</td><td class="price-cell">${esc(money(o.valor))}</td><td><span class="status status-${statusClass}">${esc(o.status)}</span></td><td class="actions-col"><div class="row-actions"><button class="icon-btn" type="button" data-action="edit-order" data-id="${esc(o.id)}" title="Editar pedido">Editar</button><button class="icon-btn danger" type="button" data-action="delete-order" data-id="${esc(o.id)}" title="Excluir pedido">Excluir</button></div></td></tr>`;
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
    const editing = !!rec;
    $('modal-title').textContent = `${editing?'Editar':'Novo'} ${type==='order'?'pedido':'cliente'}`;
    $('modal-kicker').textContent = editing ? 'EDITAR REGISTRO' : 'CADASTRO';
    if (type === 'client') {
      $('form-fields').innerHTML = `<div class="field"><label for="f-nome">Nome do cliente *</label><input id="f-nome" name="nome" type="text" maxlength="160" required placeholder="Nome completo ou empresa" value="${esc(rec?.nome||'')}"></div><div class="form-grid"><div class="field"><label for="f-telefone">Telefone</label><input id="f-telefone" name="telefone" maxlength="35" type="tel" placeholder="(99) 99999-9999" value="${esc(rec?.telefone||'')}"></div><div class="field"><label for="f-email">E-mail</label><input id="f-email" name="email" maxlength="200" type="email" placeholder="contato@exemplo.com" value="${esc(rec?.email||'')}"></div></div>`;
    } else {
      $('form-fields').innerHTML = `<div class="form-grid"><div class="field span2"><label for="f-cliente">Cliente *</label><select id="f-cliente" name="cliente_id" required><option value="">Selecione um cliente</option>${[...state.clients].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')).map(c=>`<option value="${esc(c.id)}" ${rec?.cliente_id === c.id?'selected':''}>${esc(c.nome)}</option>`).join('')}</select><button class="inline-link" id="add-client-in-order" type="button">+ Cadastrar outro cliente</button></div><div class="field span2"><label for="f-desc">Descrição do pedido *</label><input id="f-desc" name="descricao" type="text" maxlength="250" placeholder="Ex.: 2 unidades do produto X" required value="${esc(rec?.descricao||'')}"></div><div class="field"><label for="f-data">Data do pedido *</label><input id="f-data" name="data_pedido" type="date" required value="${esc(rec?.data_pedido||today())}"></div><div class="field"><label for="f-valor">Valor (R$)</label><input id="f-valor" name="valor" type="number" inputmode="decimal" min="0" max="999999999" step="0.01" value="${rec ? esc(Number(rec.valor||0)) : '0'}"></div><div class="field span2"><label for="f-status">Status</label><select id="f-status" name="status">${VALID_STATUS.map(s=>`<option ${rec?.status===s?'selected':''}>${s}</option>`).join('')}</select></div><div class="field span2"><label for="f-notes">Observações</label><textarea id="f-notes" name="observacoes" maxlength="3000" placeholder="Detalhes adicionais sobre o pedido">${esc(rec?.observacoes||'')}</textarea></div></div>`;
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
      payload = {cliente_id:String(f.get('cliente_id')||''),descricao:String(f.get('descricao')||'').trim(),data_pedido:String(f.get('data_pedido')||''),valor:Number(f.get('valor')||0),status:String(f.get('status')||''),observacoes:String(f.get('observacoes')||'').trim()};
      if (!state.clients.some(x=>x.id===payload.cliente_id)) return toast('Selecione um cliente válido.');
      if (!payload.descricao || !/^\d{4}-\d\d-\d\d$/.test(payload.data_pedido) || !VALID_STATUS.includes(payload.status) || !Number.isFinite(payload.valor) || payload.valor < 0) return toast('Confira os dados do pedido.');
    }
    state.busy=true; $('form-save').disabled=true;
    try { await writeRecord(type,id,payload); closeModal(); toast(`${type==='client'?'Cliente':'Pedido'} ${id?'atualizado':'cadastrado'} com sucesso.`); }
    catch(e){toast(`Erro ao salvar: ${errMsg(e)}`)}
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
      download(`pedidos-${date}.csv`,toCSV([['Data','Cliente','Descrição','Valor (R$)','Status','Observações'],...rows.map(o=>[formatDate(o.data_pedido),cMap.get(o.cliente_id)||'',o.descricao,Number(o.valor||0).toFixed(2).replace('.',','),o.status,o.observacoes])]),'text/csv;charset=utf-8');
    }
    toast('Arquivo CSV exportado.');
  }
  function exportBackup() {
    download(`backup-pedidos-${today()}.json`,JSON.stringify({app:'gestor-pedidos',version:1,exported_at:new Date().toISOString(),clients:state.clients,orders:state.orders},null,2),'application/json');toast('Backup JSON salvo. Guarde em local seguro.');
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
        orderIds.add(o.id); return {id:o.id,cliente_id:o.cliente_id,descricao:o.descricao.slice(0,250),data_pedido:o.data_pedido,valor:Number(o.valor),status:o.status,observacoes:String(o.observacoes||'').slice(0,3000),created_at:String(o.created_at||new Date().toISOString())};
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
