import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $ = id => document.getElementById(id);
const cfg = window.APP_CONFIG || {};
const sb = cfg.supabaseUrl && cfg.supabaseAnonKey ? createClient(
  cfg.supabaseUrl, cfg.supabaseAnonKey,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
) : null;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const chave = new URLSearchParams(location.hash.slice(1)).get('chave') || '';
const date = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '')
  ? new Date(s + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const NORMAL_STATUS = new Set(['Pendente', 'Em andamento', 'Concluído', 'Cancelado']);

function notice(message, kind = '') {
  $('notice').textContent = message;
  $('notice').className = `notice ${kind}`;
}
function text(tag, content, cls = '') {
  const node = document.createElement(tag);
  node.textContent = String(content ?? '');
  if (cls) node.className = cls;
  return node;
}
function badgeStatus(status) {
  const value = NORMAL_STATUS.has(status) ? status : 'Não informado';
  const map = {Pendente:'pendente','Em andamento':'em-andamento',Concluído:'concluido',Cancelado:'cancelado'};
  return text('span', value, `badge status-${map[value] || 'pendente'}`);
}
function render(data) {
  const firstName = typeof data.primeiro_nome === 'string' ? data.primeiro_nome.trim().slice(0,40) : '';
  $('title').textContent = firstName ? `Olá, ${firstName}!` : 'Meus pedidos';
  const orders = Array.isArray(data.pedidos) ? data.pedidos : [];
  $('total').textContent = orders.length;
  $('andamento').textContent = orders.filter(o => ['Pendente','Em andamento'].includes(o.status)).length;
  $('concluidos').textContent = orders.filter(o => o.status === 'Concluído').length;
  const root = $('orders'); root.replaceChildren();
  if (!orders.length) {
    root.append(text('div', 'Nenhuma encomenda cadastrada no momento. Novos pedidos aparecerão aqui automaticamente.', 'empty'));
  }
  for (const order of orders) {
    const card = document.createElement('article'); card.className = 'order-card';
    const main = document.createElement('div'); main.className = 'order-main';
    const top = document.createElement('div'); top.className = 'order-top';
    top.append(text('span', `PEDIDO #${order.referencia || '—'}`, 'order-id'), badgeStatus(order.status));
    const title = text('h2', order.descricao || 'Encomenda Mini Forge 64', 'order-title');
    const d = text('div', `Registrado em ${date(order.data_pedido)}`, 'order-date');
    const note = text('p', order.status === 'Cancelado'
      ? 'Pedido cancelado. Entre em contato com a loja para mais detalhes.'
      : order.status === 'Concluído' ? 'Encomenda marcada como concluída.'
      : order.status === 'Em andamento' ? 'Sua encomenda está em andamento.'
      : 'Aguardando a próxima atualização.', 'status-note');
    main.append(top, title, d, note);
    const details = document.createElement('details'); details.className = 'detail-toggle';
    details.append(text('summary', 'Ver itens do pedido'));
    const body = document.createElement('div'); body.className = 'detail-body';
    const list = document.createElement('ul'); list.className = 'items';
    const items = Array.isArray(order.itens) ? order.itens : [];
    if (items.length) {
      for (const item of items.slice(0,100)) {
        const li = document.createElement('li');
        const name = String(item.descricao || 'Item da encomenda');
        const quantity = Number(item.quantidade);
        li.append(text('span', name), text('strong', Number.isInteger(quantity) && quantity > 0 ? `${quantity} un.` : '—'));
        list.append(li);
      }
    } else {
      const li = text('li', order.descricao || 'Encomenda registrada');
      list.append(li);
    }
    body.append(list);
    details.append(body);
    card.append(main, details);
    root.append(card);
  }
  $('workspace').classList.remove('hidden');
  $('notice').classList.add('hidden');
}
async function load() {
  if (!UUID_RE.test(chave)) {
    $('workspace').classList.add('hidden');
    return notice('Link de acompanhamento ausente ou inválido. Solicite à Mini Forge 64 seu acesso individual.', 'error');
  }
  if (!sb) return notice('A página não está configurada. Entre em contato com a loja.', 'error');
  notice('Atualizando suas encomendas…');
  $('notice').classList.remove('hidden');
  try {
    const { data, error } = await sb.rpc('consultar_portal_cliente', { codigo: chave });
    if (error) throw error;
    if (!data) {
      $('workspace').classList.add('hidden');
      return notice('Link não encontrado ou revogado. Solicite um novo acesso à Mini Forge 64.', 'error');
    }
    render(data);
  } catch (error) {
    console.error('Falha ao consultar encomendas:', error.code || error.name || 'erro');
    $('workspace').classList.add('hidden');
    notice('Não foi possível buscar os pedidos agora. Atualize a página ou entre em contato com a loja.', 'error');
  }
}
$('refresh').addEventListener('click', load);
load();
