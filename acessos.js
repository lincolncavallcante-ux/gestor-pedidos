import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $ = (id) => document.getElementById(id);
const cfg = window.APP_CONFIG || {};
const sb = cfg.supabaseUrl && cfg.supabaseAnonKey
  ? createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let clients = [];
let counts = new Map();
let busy = false;
const clean = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function notice(message, kind = '') {
  const elem = $('notice');
  elem.textContent = message;
  elem.className = `notice ${kind}`;
}
function makeButton(label, action, id, className = 'button light small') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.dataset.action = action;
  b.dataset.id = id;
  return b;
}
function secretUrl(code) {
  const url = new URL('acompanhar.html', location.href);
  // O fragmento (#) não é enviado ao servidor durante a requisição HTTP.
  url.hash = new URLSearchParams({ chave: code }).toString();
  return url.href;
}
async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(value); return; } catch { /* fallback */ }
  }
  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.append(textarea);
  textarea.select();
  const ok = document.execCommand('copy');
  textarea.remove();
  if (!ok) throw new Error('Permissão para copiar negada.');
}
async function fetchAll(table, fields, orderColumn) {
  const list = [];
  const limit = 500;
  for (let offset = 0; offset < 20000; offset += limit) {
    let query = sb.from(table).select(fields).range(offset, offset + limit - 1);
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    list.push(...(data || []));
    if ((data || []).length < limit) return list;
  }
  throw new Error(`Limite de registros excedido na tabela ${table}. Solicite paginação.`);
}
function render() {
  const needle = clean($('search').value.trim());
  const visible = clients.filter(c => clean(c.nome + ' ' + (c.telefone || '')).includes(needle));
  const parent = $('clients');
  parent.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nenhum cliente encontrado.';
    parent.append(empty);
    return;
  }
  for (const customer of visible) {
    const card = document.createElement('article'); card.className = 'customer-card';
    const header = document.createElement('div'); header.className = 'customer-head';
    const left = document.createElement('div');
    const name = document.createElement('h3'); name.textContent = customer.nome;
    const info = document.createElement('p'); info.className = 'meta';
    info.textContent = `${customer.telefone || 'Telefone não cadastrado'} · Link único do cliente`;
    left.append(name, info);
    const count = document.createElement('span'); count.className = 'client-count';
    const n = counts.get(customer.id) || 0;
    count.textContent = `${n} ${n === 1 ? 'pedido' : 'pedidos'}`;
    header.append(left, count);
    const actions = document.createElement('div'); actions.className = 'actions';
    actions.append(makeButton('Copiar link', 'copy', customer.id, 'button small'));
    actions.append(makeButton('Enviar pelo WhatsApp', 'whatsapp', customer.id));
    actions.append(makeButton('Revogar link', 'rotate', customer.id, 'button light warning small'));
    card.append(header, actions);
    parent.append(card);
  }
}
async function load() {
  if (!sb) return notice('Configure o Supabase no config.js.', 'error');
  if (busy) return;
  busy = true;
  notice('Buscando seus clientes e pedidos…');
  try {
    const { data: auth, error: authError } = await sb.auth.getUser();
    if (authError || !auth?.user) {
      $('login-box').classList.remove('hidden');
      $('workspace').classList.add('hidden');
      notice('Faça login para gerar os links dos seus clientes.');
      return;
    }
    const [customerRows, orderRows] = await Promise.all([
      fetchAll('clientes', 'id,nome,telefone,codigo_portal', 'id'),
      fetchAll('pedidos', 'id,cliente_id', 'id')
    ]);
    clients = customerRows.sort((a,b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    counts = new Map();
    for (const row of orderRows) counts.set(row.cliente_id, (counts.get(row.cliente_id) || 0) + 1);
    $('login-box').classList.add('hidden');
    $('workspace').classList.remove('hidden');
    render();
    notice(`${clients.length} cliente(s) carregado(s). Gere um link individual por cliente.`, 'ok');
  } catch (error) {
    console.error('Erro ao carregar portal: ', error.code || error.name || 'erro');
    notice('Não foi possível carregar os clientes. Verifique se executou o SQL do portal no Supabase. Detalhe: ' + (error.message || 'erro de conexão'), 'error');
  } finally { busy = false; }
}
$('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!sb || busy) return;
  busy = true;
  const submit = $('login-form').querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    const { error } = await sb.auth.signInWithPassword({
      email: $('email').value.trim(), password: $('password').value
    });
    if (error) throw error;
    $('password').value = '';
    notice('Login realizado.', 'ok');
  } catch {
    notice('Não foi possível entrar. Confira seu e-mail e sua senha.', 'error');
    return;
  } finally { busy = false; submit.disabled = false; }
  await load();
});
$('search').addEventListener('input', render);
$('reload').addEventListener('click', load);
$('clients').addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button || busy) return;
  const customer = clients.find(c => c.id === button.dataset.id);
  if (!customer) return;
  if (!UUID_RE.test(customer.codigo_portal || '')) {
    notice('Este cliente ainda não tem código. Execute o SQL de atualização.', 'error');
    return;
  }
  const action = button.dataset.action;
  const url = secretUrl(customer.codigo_portal);
  try {
    if (action === 'copy') {
      await copyText(url);
      notice(`Link de ${customer.nome} copiado. Envie somente a esse cliente.`, 'ok');
    } else if (action === 'whatsapp') {
      let phone = String(customer.telefone || '').replace(/\D/g, '');
      if (phone.length === 10 || phone.length === 11) phone = '55' + phone;
      if (!/^55\d{10,11}$/.test(phone)) {
        notice('Telefone não encontrado ou inválido. Use “Copiar link”.', 'error');
        return;
      }
      const message = `Olá, ${customer.nome.split(/\s+/)[0]}! A Mini Forge 64 disponibilizou um acesso para você acompanhar todas as suas encomendas, inclusive os próximos pedidos. Seu link individual: ${url}\n\nNão compartilhe esse link com outras pessoas.`;
      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    } else if (action === 'rotate') {
      if (!confirm(`Revogar o link de ${customer.nome}? O link antigo deixará de funcionar para TODOS os pedidos desse cliente.`)) return;
      if (!crypto.randomUUID) throw new Error('Geração segura indisponível. Use HTTPS.');
      busy = true; button.disabled = true;
      const next = crypto.randomUUID();
      const { data, error } = await sb.from('clientes').update({ codigo_portal: next })
        .eq('id', customer.id).select('codigo_portal').single();
      if (error) throw error;
      customer.codigo_portal = data.codigo_portal;
      await copyText(secretUrl(customer.codigo_portal));
      notice('Link antigo revogado. Novo link copiado! Envie-o ao cliente.', 'ok');
    }
  } catch (error) {
    console.error('Erro na operação:', error.code || error.name || 'erro');
    notice(error.message || 'Não foi possível concluir. Tente novamente.', 'error');
  } finally { busy = false; button.disabled = false; }
});
load();
