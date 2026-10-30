/* Mini Forge 64 · Comprovante de pedido NÃO FISCAL */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const $ = id => document.getElementById(id);
const cfg = window.APP_CONFIG || {};
const uuidRE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const query = new URLSearchParams(location.search);
const fragment = new URLSearchParams(location.hash.slice(1));
const pedidoId = fragment.get('pedido') || query.get('pedido') || '';
const chave = fragment.get('chave') || '';
const formatMoney = num => new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'}).format(num);
const formatDate = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) ? new Date(s+'T12:00:00').toLocaleDateString('pt-BR') : '—';
const string = s => typeof s === 'string' ? s : '';
const number = n => Number(n);
const roundCents = n => Math.round(n * 100);
function financialCents(rawPaid, totalCents) {
  if (rawPaid === null || rawPaid === undefined || rawPaid === '') return null;
  const n = Number(rawPaid);
  if (!Number.isFinite(n) || n < 0 || !Number.isSafeInteger(roundCents(n)))
    throw Error('Valor pago inválido. Confira os recebimentos registrados.');
  const paidCents = roundCents(n);
  if (paidCents > totalCents) throw Error('O valor pago supera o total do pedido. Confira os recebimentos registrados.');
  return paidCents;
}
function fail(message) {
  const el = $('message'); el.textContent = message; el.classList.add('error'); el.hidden = false;
  $('receipt').hidden = true; $('print').disabled = true;
}
function makeCell(row, value, cls = '') {
  const td = document.createElement('td'); td.textContent = String(value);
  if (cls) td.className = cls;
  row.append(td);
}
function normaliseItems(order) {
  const items = Array.isArray(order.itens) && order.itens.length ? order.itens : [{descricao: order.descricao || 'Item do pedido', quantidade:1, valor_unitario:order.valor ?? 0}];
  if (items.length > 100) throw Error('Este pedido tem muitos itens para o comprovante.');
  const result = items.map(item => ({
    descricao: string(item.descricao).trim().slice(0,250) || 'Item',
    quantidade: number(item.quantidade),
    preco: number(item.valor_unitario)
  }));
  if (result.some(i => !Number.isInteger(i.quantidade) || i.quantidade < 1 || i.quantidade > 99999 || !Number.isFinite(i.preco) || i.preco < 0 || i.preco > 999999999.99)) throw Error('Há informações inválidas nos itens do pedido.');
  return result;
}
function render(order, client, rawPaid) {
  const items = normaliseItems(order);
  const totalStored = Number(order.valor);
  if (!Number.isFinite(totalStored) || totalStored < 0) throw Error('Total do pedido inválido.');
  let computedCents = 0;
  const rows = document.createDocumentFragment();
  for (const item of items) {
    const subtotalCents = item.quantidade * roundCents(item.preco);
    if (!Number.isSafeInteger(subtotalCents)) throw Error('Subtotal inválido.');
    computedCents += subtotalCents;
    const row = document.createElement('tr');
    makeCell(row, item.descricao);
    makeCell(row, item.quantidade, 'numeric');
    makeCell(row, formatMoney(item.preco), 'numeric');
    makeCell(row, formatMoney(subtotalCents/100), 'numeric');
    rows.append(row);
  }
  const storedCents = roundCents(totalStored);
  if (!Number.isSafeInteger(computedCents) || Math.abs(computedCents-storedCents)>1) throw Error('O total do pedido não corresponde à soma dos itens. Revise o cadastro antes de emitir o comprovante.');
  $('items').replaceChildren(rows);
  const reference = String(order.referencia || order.id || '').slice(0,8).toUpperCase();
  $('ref').textContent = '#' + reference;
  document.title = `Pedido ${reference} | Comprovante não fiscal — Mini Forge 64`;
  $('date').textContent = formatDate(order.data_pedido);
  $('client').textContent = string(client).slice(0,160) || 'Cliente';
  $('status').textContent = string(order.status) || '—';
  $('total').textContent = formatMoney(storedCents / 100);
  const paidCents = financialCents(rawPaid, storedCents);
  if (paidCents === null) {
    $('paid').textContent = '—';
    $('balance').textContent = '—';
    $('payment-state').textContent = 'Informações de pagamento não disponíveis neste modo de armazenamento.';
  } else {
    $('paid').textContent = formatMoney(paidCents / 100);
    $('balance').textContent = formatMoney((storedCents - paidCents) / 100);
    $('payment-state').textContent = paidCents === storedCents
      ? 'Situação financeira: quitado conforme lançamentos registrados.'
      : paidCents > 0
        ? 'Situação financeira: pagamento parcial registrado.'
        : 'Situação financeira: nenhum pagamento registrado.';
  }
  $('generated').textContent = new Date().toLocaleString('pt-BR');
  $('message').hidden = true;
  $('receipt').hidden = false;
  $('print').disabled = false;
}
async function load() {
  const localOrder = query.get('local') === '1' && !chave;
  const localId = /^local-\d{10,15}-[a-z0-9]{4,35}$/i.test(pedidoId);
  if (!uuidRE.test(pedidoId) && !(localOrder && localId)) return fail('Pedido não identificado. Abra o comprovante pelo gestor ou pela área Meus pedidos.');
  try {
    // Cliente: a consulta só usa seu código individual. Nenhuma tabela é aberta ao público.
    if (chave) {
      if (!uuidRE.test(chave)) return fail('Link individual inválido.');
      if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return fail('Conexão com a nuvem indisponível.');
      const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const {data,error} = await sb.rpc('consultar_portal_cliente',{codigo:chave});
      if (error) throw error;
      if (!data) return fail('Link de acesso expirado ou revogado.');
      const found = (Array.isArray(data.pedidos) ? data.pedidos : []).find(x => x.id === pedidoId);
      if (!found) return fail('Este pedido não está disponível para esse cliente.');
      if (!Object.prototype.hasOwnProperty.call(found, 'valor_pago'))
        return fail('A atualização do financeiro do Portal do Cliente ainda não foi aplicada no Supabase. Entre em contato com a loja.');
      return render(found, data.primeiro_nome, found.valor_pago);
    }
    // Administrador em modo local: mesmos dados já mantidos no próprio navegador.
    if (query.get('local') === '1') {
      if (localStorage.getItem('gestor_pedidos_mode_v1') !== 'local') return fail('O armazenamento local não está ativo.');
      const storage = JSON.parse(localStorage.getItem('gestor_pedidos_v1') || '{}');
      const order = (storage.orders || []).find(x => x.id === pedidoId);
      const client = (storage.clients || []).find(x => x.id === order?.cliente_id);
      if (!order) return fail('Pedido não encontrado no navegador.');
      return render(order, client?.nome, null);
    }
    // Administrador em nuvem: sessão normal + políticas RLS do Supabase.
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return fail('Conexão com a nuvem indisponível.');
    const sb = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const {data:authData,error:authError} = await sb.auth.getSession();
    if (authError || !authData?.session) return fail('Faça login no Gestor de Pedidos e abra o comprovante por lá.');
    const {data:order,error:orderError} = await sb.from('pedidos').select('id, cliente_id, descricao, data_pedido, itens, valor, status').eq('id', pedidoId).single();
    if (orderError || !order) return fail('Pedido não encontrado na sua conta.');
    const {data:client,error:clientError} = await sb.from('clientes').select('nome').eq('id',order.cliente_id).single();
    if (clientError || !client) return fail('Cliente do pedido não encontrado.');
    // Consulta SOMENTE os recebimentos do usuário autenticado e deste pedido.
    // Políticas RLS do Supabase permanecem ativas na tabela recebimentos.
    const {data:receipts,error:receiptsError} = await sb.from('recebimentos')
      .select('valor')
      .eq('pedido_id', pedidoId)
      .eq('user_id', authData.session.user.id)
      .is('estornado_em', null);
    if (receiptsError) throw receiptsError;
    if (!Array.isArray(receipts)) throw Error('Resposta inválida do módulo financeiro.');
    let paidCents = 0;
    for (const receipt of receipts) {
      const value = Number(receipt.valor);
      if (!Number.isFinite(value) || value < 0) throw Error('Recebimento inválido.');
      paidCents += roundCents(value);
      if (!Number.isSafeInteger(paidCents)) throw Error('Total de recebimentos inválido.');
    }
    render(order, client.nome, paidCents / 100);
  } catch (err) {
    console.error('Não foi possível montar comprovante:', err?.code || err?.name || 'erro');
    const msg = String(err?.message || '');
    fail(/^(O total do pedido|O valor pago supera|Valor pago inválido)/.test(msg)
      ? msg
      : 'Não foi possível consultar o valor pago deste pedido. Confira o acesso ao Financeiro e tente novamente.');
  }
}
$('print').addEventListener('click', () => window.print());
load();
