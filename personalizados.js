import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const cfg=window.APP_CONFIG||{};
const db=cfg.supabaseUrl&&cfg.supabaseAnonKey?createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const date=v=>new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
const money=v=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
function notice(message,bad=false){$('admin-status').textContent=message;$('admin-status').classList.toggle('bad',bad)}
async function load(){
 if(!db){notice('Abra este painel pelo Gestor de Pedidos; configuração Supabase ausente.',true);return}
 try{
  const {data:{user},error:authError}=await db.auth.getUser();if(authError||!user){notice('Faça login no Gestor de Pedidos e recarregue esta página.',true);return}
  const {data:cfgRow,error:cfgError}=await db.from('mf64_loja_config').select('user_id').eq('slug','miniforge64').maybeSingle();
  if(cfgError||cfgRow?.user_id!==user.id){notice('Conta sem permissão para visualizar encomendas.',true);return}
  const {data:requests,error:reqError}=await db.from('mf64_personalizados').select('pedido_id,checkout_id,escala,detalhes,imagens,alerta_upload,criado_em').order('criado_em',{ascending:false}).limit(100);
  if(reqError)throw reqError;
  if(!requests?.length){notice('Nenhuma encomenda personalizada por enquanto.');$('personalized-list').innerHTML='<p class="empty">As solicitações aparecerão aqui quando os clientes preencherem o formulário da loja.</p>';return}
  const ids=requests.map(r=>r.pedido_id);
  const {data:orders,error:ordersError}=await db.from('pedidos').select('id,cliente_id,valor,status').in('id',ids);
  if(ordersError)throw ordersError;
  const lookup=new Map((orders||[]).map(o=>[o.id,o]));
  const clientIds=[...new Set((orders||[]).map(o=>o.cliente_id).filter(Boolean))];
  const {data:clients,error:clientError}=clientIds.length?await db.from('clientes').select('id,nome,telefone,email').in('id',clientIds):{data:[],error:null};
  if(clientError)throw clientError;
  const buyers=new Map((clients||[]).map(c=>[c.id,c]));
  notice(`${requests.length} solicitação(ões) personalizada(s) encontrada(s).`);
  $('personalized-list').innerHTML=requests.map(r=>{
    const order=lookup.get(r.pedido_id)||{},buyer=buyers.get(order.cliente_id)||{};
    const tel=String(buyer.telefone||'').replace(/\D/g,'');
    return `<article class="order-card" data-checkout="${esc(r.checkout_id)}"><div class="order-top"><div><small>#${esc(r.pedido_id.slice(0,8).toUpperCase())} · ${date(r.criado_em)}</small><h2>${esc(buyer.nome||'Cliente')}</h2><p>Escala: <strong>${esc(r.escala)}</strong> · Status: ${esc(order.status||'Pendente')} · ${money(order.valor)} (orçamento)</p></div><a href="https://wa.me/${tel}" target="_blank" rel="noopener noreferrer" class="wa-link">Conversar no WhatsApp ↗</a></div><p class="order-notes">${esc(r.detalhes)}</p>${r.alerta_upload?`<p class="warn">${esc(r.alerta_upload)}</p>`:''}<div class="photo-list" data-photos="${esc(r.checkout_id)}"><small>Carregando referências privadas...</small></div></article>`;
  }).join('');
  for(const r of requests){
    const target=$('personalized-list').querySelector(`[data-photos="${r.checkout_id}"]`);
    const imgs=[];
    for(const path of r.imagens||[]){
      const {data,error}=await db.storage.from('mf64-referencias').createSignedUrl(path,3600);
      if(!error&&data?.signedUrl)imgs.push(data.signedUrl);
    }
    target.replaceChildren();
    if(!imgs.length){const p=document.createElement('span');p.textContent='Sem imagens anexadas';target.appendChild(p);continue}
    for(let i=0;i<imgs.length;i++){
      const a=document.createElement('a');a.href=imgs[i];a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',`Abrir imagem ${i+1}`);
      const img=document.createElement('img');img.src=imgs[i];img.alt=`Referência da encomenda ${i+1}`;img.loading='lazy';a.appendChild(img);target.appendChild(a);
    }
  }
 }catch(error){console.error(error);notice('Não foi possível carregar as solicitações: '+(error.message||'erro desconhecido'),true)}
}
load();
