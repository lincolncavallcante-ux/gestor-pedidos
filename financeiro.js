/* Mini Forge 64 | Financeiro v4 — exclusivamente para gestores autenticados.
   Não libera acesso público à tabela de recebimentos. */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const $ = id => document.getElementById(id);
const cfg = window.APP_CONFIG || {};
const fmtBRL = new Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'});
const money = cents => fmtBRL.format(cents / 100);
const toCents = value => Math.round(Number(value || 0) * 100);
const esc = v => String(v ?? '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const normal = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const short = id => String(id || '').slice(0,8).toUpperCase();
const formatDate = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v||'')) ? new Date(`${v}T12:00:00`).toLocaleDateString('pt-BR') : '—';
const today = () => {const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const state = {sb:null,user:null,orders:[],clients:[],receipts:[],busy:false,openOrder:null};
let toastTimer;

function message(text) { $('notice').textContent=text; $('notice').classList.toggle('hidden', !text); }
function toast(text) { $('toast').textContent=text; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),5000); }
function showAuth() { $('auth-box').classList.remove('hidden'); $('app').classList.add('hidden'); }
function showApp() { $('auth-box').classList.add('hidden'); $('app').classList.remove('hidden'); }
function cMap() {return new Map(state.clients.map(c=>[c.id,c]));}
function activeReceipts(id) {return state.receipts.filter(r=>r.pedido_id===id && !r.estornado_em);}
function sumPaid(id) {return activeReceipts(id).reduce((sum,r)=>sum+toCents(r.valor),0);}
function balance(o) {return Math.max(0,toCents(o.valor)-sumPaid(o.id));}
function paidStatus(o) {
  if(o.status==='Cancelado') return ['cancelled','Cancelado'];
  const paid=sumPaid(o.id),total=toCents(o.valor);
  if (paid===0 && total>0) return ['open','Sem pagamento'];
  if (paid>=total) return ['paid','Pago'];
  return ['partial','Parcial'];
}
function orderItems(o) {
  return Array.isArray(o.itens) && o.itens.length ? o.itens.map(i=>i.descricao).join(', ') : o.descricao || '';
}
async function fetchAll(table) {
  const output=[];
  const pageSize=900;
  for(let offset=0;offset<20000;offset+=pageSize){
    const {data,error}=await state.sb.from(table).select('*').order('id',{ascending:true}).range(offset,offset+pageSize-1);
    if(error) throw error;
    output.push(...data);
    if(data.length<pageSize) return output;
  }
  throw new Error('Há mais de 20.000 registros. Solicite paginação avançada antes de consultar todos os dados.');
}
async function load() {
  if (!state.sb || !state.user || state.busy) return;
  message('');
  $('refresh').disabled=true;
  try {
    const [orders,clients,receipts] = await Promise.all([fetchAll('pedidos'),fetchAll('clientes'),fetchAll('recebimentos')]);
    state.orders=orders;
    state.clients=clients;
    state.receipts=receipts;
    render();
  } catch(e) {
    console.error('Falha ao carregar módulo financeiro:',e?.code||e?.name||'erro');
    message(/recebimentos|schema cache|does not exist/i.test(e.message||'')
      ? 'A tabela de recebimentos ainda não foi configurada. Execute o arquivo ATUALIZACAO_FINANCEIRO.sql no Supabase antes de usar esta página.'
      : `Não foi possível carregar os dados: ${e.message||'falha na conexão'}`);
  } finally { $('refresh').disabled=false; }
}
function render() {
  const active = state.orders.filter(o=>o.status!=='Cancelado');
  const total=active.reduce((s,o)=>s+toCents(o.valor),0);
  const received=active.reduce((s,o)=>s+sumPaid(o.id),0);
  const pending=active.reduce((s,o)=>s+balance(o),0);
  const partial=active.filter(o=>paidStatus(o)[0]==='partial').length;
  $('metric-orders').textContent=money(total);
  $('metric-received').textContent=money(received);
  $('metric-due').textContent=money(pending);
  $('metric-partial').textContent=String(partial);
  const canceledPaid=state.orders.filter(o=>o.status==='Cancelado'&&sumPaid(o.id)>0);
  $('cancel-warning').classList.toggle('hidden',!canceledPaid.length);
  $('cancel-warning').textContent = canceledPaid.length ? `${canceledPaid.length} pedido(s) cancelado(s) possuem recebimentos registrados. Confira se há devolução pendente. O sistema não realiza reembolso bancário.` : '';
  const clients=cMap();
  const search=normal($('search').value.trim()), filter=$('filter').value;
  const rows=state.orders.filter(o=>{
    if (filter!=='all' && paidStatus(o)[0]!==filter) return false;
    const c=clients.get(o.cliente_id);
    return !search || normal(`${o.id} ${c?.nome||''} ${o.descricao||''} ${orderItems(o)}`).includes(search);
  }).sort((a,b)=>{
    const diff=String(a.data_pedido).localeCompare(String(b.data_pedido)) || String(a.id).localeCompare(String(b.id));
    return $('sort').value==='old' ? diff : -diff;
  });
  $('record-count').textContent = `${rows.length} ${rows.length===1?'pedido':'pedidos'}`;
  $('orders-body').innerHTML=rows.map(o=>{
    const cliente=clients.get(o.cliente_id)?.nome||'Cliente removido';
    const [slug,label]=paidStatus(o);
    const saldo=o.status==='Cancelado' ? '—' : money(balance(o));
    return `<tr><td><strong>#${esc(short(o.id))}</strong><small>${esc(formatDate(o.data_pedido))} · ${esc(orderItems(o).slice(0,65))}</small></td><td>${esc(cliente)}</td><td class="money">${esc(money(toCents(o.valor)))}</td><td class="money">${esc(money(sumPaid(o.id)))}</td><td class="money due">${esc(saldo)}</td><td><span class="label ${slug}">${label}</span></td><td><div class="table-actions"><button class="btn secondary" type="button" data-action="history" data-id="${esc(o.id)}">Histórico</button>${slug!=='paid'&&slug!=='cancelled' ? `<button class="btn primary" type="button" data-action="pay" data-id="${esc(o.id)}">+ Receber</button>`:''}</div></td></tr>`;
  }).join('');
  $('empty').classList.toggle('hidden',rows.length!==0);
}
function openDialog(id) {$(id).classList.remove('hidden');document.body.style.overflow='hidden';}
function closeDialog(id) {$(id).classList.add('hidden');document.body.style.overflow='';}
function getOrder(id){return state.orders.find(o=>o.id===id);}
function context(o) {
  const name=cMap().get(o.cliente_id)?.nome||'Cliente';
  return `<strong>Pedido #${esc(short(o.id))}</strong> · ${esc(name)}<br>Total: <strong>${esc(money(toCents(o.valor)))}</strong> · Recebido: <strong>${esc(money(sumPaid(o.id)))}</strong> · Saldo: <strong>${esc(money(balance(o)))}</strong>`;
}
function openPayment(id) {
  const o=getOrder(id);
  if(!o || o.status==='Cancelado' || balance(o)<=0) return toast('Este pedido não possui saldo disponível para novo recebimento.');
  $('pay-order').value=id;
  $('pay-context').innerHTML=context(o);
  $('pay-date').value=today();
  $('pay-amount').value=(balance(o)/100).toFixed(2);
  $('pay-amount').max=(balance(o)/100).toFixed(2);
  $('pay-type').value=sumPaid(id)===0?'Sinal':'Parcela';
  $('pay-method').value='Pix';
  $('pay-notes').value='';
  $('pay-error').classList.add('hidden');
  $('pay-submit').disabled=false;
  openDialog('payment-dialog');
  $('pay-amount').focus();
}
function openHistory(id) {
  const o=getOrder(id);
  if(!o)return;
  state.openOrder=id;
  $('history-context').innerHTML=context(o);
  const receipts=state.receipts.filter(r=>r.pedido_id===id).sort((a,b)=>String(b.data_recebimento).localeCompare(String(a.data_recebimento))||String(b.created_at).localeCompare(String(a.created_at)));
  $('history-body').innerHTML=receipts.map(r=>{
    const annul=Boolean(r.estornado_em);
    return `<tr><td>${esc(formatDate(r.data_recebimento))}</td><td>${esc(r.tipo)}</td><td>${esc(r.forma_pagamento)}</td><td class="money"><strong class="${annul?'strike':''}">${esc(money(toCents(r.valor)))}</strong>${annul?'<small class="storno">Estornado</small>':''}</td><td>${esc(r.observacoes||'—')}${annul?`<small>Estorno: ${esc(r.motivo_estorno||'')}</small>`:''}</td><td>${annul?'—':`<button class="btn secondary" type="button" data-action="storno" data-id="${esc(r.id)}">Estornar</button>`}</td></tr>`;
  }).join('');
  $('history-empty').classList.toggle('hidden',receipts.length!==0);
  openDialog('history-dialog');
}
async function addReceipt(event) {
  event.preventDefault();
  if (state.busy) return;
  const id=$('pay-order').value,o=getOrder(id);
  const value=Number($('pay-amount').value), cents=toCents(value);
  const date=$('pay-date').value;
  const type=$('pay-type').value;
  const method=$('pay-method').value;
  const notes=$('pay-notes').value.trim();
  const error=txt=>{$('pay-error').textContent=txt;$('pay-error').classList.remove('hidden');};
  if(!o) return error('Pedido não encontrado.');
  if(!Number.isFinite(value)||cents<=0||Math.abs(value*100-cents)>0.000001) return error('Informe um valor positivo com até duas casas decimais.');
  if(o.status==='Cancelado'||cents>balance(o))return error('O valor excede o saldo a receber. Atualize a página e confira o pedido.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return error('Informe uma data válida.');
  if(notes.length>500)return error('A observação excede 500 caracteres.');
  if(!['Sinal','Parcela','Quitação'].includes(type))return error('Tipo de pagamento inválido.');
  if(!['Pix','Dinheiro','Cartão de crédito','Cartão de débito','Transferência','Outro'].includes(method))return error('Forma de pagamento inválida.');
  state.busy=true;$('pay-submit').disabled=true;
  try {
    const {error:e}=await state.sb.from('recebimentos').insert({pedido_id:id,user_id:state.user.id,data_recebimento:date,valor:cents/100,tipo:type,forma_pagamento:method,observacoes:notes});
    if(e)throw e;
    closeDialog('payment-dialog');toast('Recebimento registrado com sucesso.');
  }catch(e){error(e.message||'Não foi possível registrar o pagamento.');}
  finally{state.busy=false;$('pay-submit').disabled=false;await load();}
}
async function annulReceipt(id) {
  if(state.busy)return;
  const r=state.receipts.find(x=>x.id===id);
  if(!r||r.estornado_em)return;
  const reason=window.prompt(`Estornar o lançamento de ${money(toCents(r.valor))}?\nO histórico será preservado. Informe o motivo:`);
  if(reason===null)return;
  if(reason.trim().length<3||reason.trim().length>500)return toast('Informe um motivo entre 3 e 500 caracteres.');
  if(!window.confirm('Confirmar estorno do registro? Essa ação não devolve dinheiro ao cliente; apenas corrige o controle financeiro.'))return;
  state.busy=true;
  try{
    const {error:e}=await state.sb.from('recebimentos').update({estornado_em:new Date().toISOString(),motivo_estorno:reason.trim()}).eq('id',id).eq('user_id',state.user.id);
    if(e)throw e;
    toast('Lançamento estornado.');
    closeDialog('history-dialog');
  }catch(e){toast(`Falha ao estornar: ${e.message||'verifique a conexão'}`);}
  finally{state.busy=false;await load();}
}
function download(name, content, type){const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function csvCell(v){let s=String(v??'');if(/^[\s]*[=+@\-\t\r]/.test(s) && !/^-?\d+(?:[.,]\d+)?$/.test(s.trim())) s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function exportCSV(){
  const clients=cMap();
  const head=['Pedido','Cliente','Data do pedido','Valor do pedido','Data do pagamento','Tipo','Forma','Recebido','Estornado','Motivo do estorno','Observações'];
  const lines=state.receipts.map(r=>{const o=getOrder(r.pedido_id);return [short(r.pedido_id),clients.get(o?.cliente_id)?.nome||'',o?.data_pedido||'',o?Number(o.valor).toFixed(2):'',r.data_recebimento,r.tipo,r.forma_pagamento,Number(r.valor).toFixed(2),r.estornado_em?'Sim':'Não',r.motivo_estorno||'',r.observacoes||''];});
  download(`financeiro-mini-forge64-${today()}.csv`,'\ufeff'+[head,...lines].map(row=>row.map(csvCell).join(';')).join('\r\n'),'text/csv;charset=utf-8');toast('CSV financeiro exportado.');
}
function exportBackup() {
  const content={app:'mini-forge64-financeiro',version:4,exportado_em:new Date().toISOString(),recebimentos:state.receipts};
  download(`backup-financeiro-${today()}.json`,JSON.stringify(content,null,2),'application/json;charset=utf-8');toast('Backup financeiro exportado. Guarde em local privado.');
}
async function init(){
  if(!cfg.supabaseUrl || !cfg.supabaseAnonKey){message('O arquivo config.js não está configurado. Volte ao gestor principal.');showAuth();return;}
  try{
    state.sb=createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
    const {data,error}=await state.sb.auth.getSession();
    if(error)throw error;
    state.user=data.session?.user||null;
    state.sb.auth.onAuthStateChange((_event,session)=>{
      const previous=state.user?.id;
      state.user=session?.user||null;
      if(state.user){$('account-label').textContent=state.user.email||'Sessão ativa';showApp();if(state.user.id!==previous)setTimeout(load,0);}
      else{state.orders=[];state.clients=[];state.receipts=[];showAuth();}
    });
    if(!state.user){showAuth();return;}
    $('account-label').textContent=state.user.email||'Sessão ativa';
    showApp();await load();
    const initialId=new URLSearchParams(location.hash.slice(1)).get('pedido');
    if(initialId && getOrder(initialId)) openHistory(initialId);
  }catch(e){console.error('Financeiro: falha de inicialização',e?.code||e?.name||'erro');message('Não foi possível autenticar. Abra o Gestor de Pedidos, entre na sua conta e tente novamente.');showAuth();}
}
$('orders-body').addEventListener('click',e=>{const b=e.target.closest('button[data-action]');if(!b)return;if(b.dataset.action==='pay')openPayment(b.dataset.id);if(b.dataset.action==='history')openHistory(b.dataset.id);});
$('history-body').addEventListener('click',e=>{const b=e.target.closest('button[data-action="storno"]');if(b)annulReceipt(b.dataset.id);});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.close)));
['payment-dialog','history-dialog'].forEach(id=>$(id).addEventListener('click',e=>{if(e.target===$(id))closeDialog(id)}));
document.addEventListener('keydown',e=>{if(e.key==='Escape') ['payment-dialog','history-dialog'].forEach(id=>{if(!$(id).classList.contains('hidden'))closeDialog(id)})});
$('payment-form').addEventListener('submit',addReceipt);
['search','filter','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
$('refresh').addEventListener('click',load);
$('export-csv').addEventListener('click',exportCSV);
$('export-backup').addEventListener('click',exportBackup);
init();
