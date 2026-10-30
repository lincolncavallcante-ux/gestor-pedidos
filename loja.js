import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const $=id=>document.getElementById(id);
const config=window.APP_CONFIG||{};
const db=config.supabaseUrl&&config.supabaseAnonKey?createClient(config.supabaseUrl,config.supabaseAnonKey):null;
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:''}catch{return''}};
const storageKey='mf64_carrinho_v1';
let products=[],settings=null,cart={},submitting=false,checkoutKey=null;
try{const v=JSON.parse(sessionStorage.getItem(storageKey)||'{}'); if(v&&typeof v==='object'&&!Array.isArray(v))cart=v}catch{}
function persist(){sessionStorage.setItem(storageKey,JSON.stringify(cart))}
function totalItems(){return Object.values(cart).reduce((s,q)=>s+q,0)}
function validCart(){return products.filter(p=>cart[p.id]>0).map(p=>({...p,qtd:cart[p.id]}))}
function total(){return validCart().reduce((s,p)=>s+Math.round(Number(p.preco)*100)*p.qtd,0)/100}
function notice(msg,error=false){$('store-notice').textContent=msg;$('store-notice').classList.remove('hidden');$('store-notice').style.borderColor=error?'#a53b30':'#63432e'}
function render(){
 const ids=new Set(products.map(p=>p.id));for(const id of Object.keys(cart))if(!ids.has(id))delete cart[id];persist();
 $('cart-count').textContent=totalItems();
 const cats=[...new Set(products.map(p=>p.categoria||'Outros'))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const sel=$('category'),prev=sel.value;sel.innerHTML='<option value="">Todas as categorias</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');sel.value=cats.includes(prev)?prev:'';
 renderProducts();renderCart();
}
function renderProducts(){
 const q=$('search').value.toLocaleLowerCase('pt-BR').trim(),category=$('category').value;
 const found=products.filter(p=>(!category||p.categoria===category)&&(!q||(`${p.nome} ${p.descricao} ${p.categoria}`).toLocaleLowerCase('pt-BR').includes(q)));
 $('catalog-count').textContent=`${found.length} produto(s)`;
 $('empty-products').classList.toggle('hidden',found.length>0||products.length===0);
 $('products').innerHTML=found.map(p=>`<article class="product-card"><div class="product-media">${safeUrl(p.imagem_url)?`<img src="${esc(safeUrl(p.imagem_url))}" alt="${esc(p.nome)}" loading="lazy">`:'<span class="product-placeholder">⚙</span>'}</div><div class="product-content"><div class="product-category">${esc(p.categoria)}</div><h3>${esc(p.nome)}</h3><p>${esc(p.descricao||'Feito para sua coleção.')}</p><div class="product-bottom"><strong class="product-price">${money(p.preco)}</strong><button type="button" data-add="${esc(p.id)}">+ Adicionar</button></div></div></article>`).join('');
}
function renderCart(){
 const rows=validCart();$('cart-items').innerHTML=rows.length?rows.map(p=>`<div class="cart-row"><div><h3>${esc(p.nome)}</h3><small>${money(p.preco)} cada</small><div class="qty-tools"><button type="button" data-decrement="${p.id}" aria-label="Diminuir ${esc(p.nome)}">−</button><strong>${p.qtd}</strong><button type="button" data-increment="${p.id}" aria-label="Aumentar ${esc(p.nome)}">+</button></div></div><div class="price">${money(p.preco*p.qtd)}<button type="button" class="remove-link" data-remove="${p.id}">Remover</button></div></div>`).join(''):'<div class="empty">Seu carrinho está vazio. Escolha uma miniatura para começar.</div>';
 $('cart-total').textContent=money(total());$('checkout').disabled=!rows.length;
}
function change(id,delta){const v=Number(cart[id]||0)+delta;if(v<=0)delete cart[id];else cart[id]=Math.min(99,v);render();}
function showDrawer(show){$('drawer-backdrop').classList.toggle('hidden',!show);$('cart-drawer').classList.toggle('hidden',!show)}
function showCheckout(show){$('checkout-backdrop').classList.toggle('hidden',!show)}
function newRequestId(){return globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{let r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3|8)).toString(16)})}
function phoneDigits(s){return String(s).replace(/\D/g,'')}
async function fetchCatalog(){
 if(!db){notice('Configure o arquivo config.js do Supabase para publicar o catálogo.',true);return}
 try{
  const [c,p]=await Promise.all([db.from('mf64_loja_config').select('nome,descricao,whatsapp,ativa').eq('slug','miniforge64').maybeSingle(),db.from('mf64_produtos').select('id,nome,descricao,preco,categoria,imagem_url').eq('ativo',true).order('created_at',{ascending:false})]);
  if(c.error||p.error)throw c.error||p.error;
  settings=c.data;
  products=p.data||[];
  if(!settings){notice('Nossa loja ainda está sendo preparada. Volte em breve.');products=[]}
  else if(products.length===0)notice('Nosso catálogo está sendo atualizado. Em breve teremos novidades!');
  else $('store-notice').classList.add('hidden');
  render();
 }catch(e){notice('Não foi possível carregar o catálogo. Tente atualizar a página.',true);console.error(e)}
}
$('open-cart').addEventListener('click',()=>showDrawer(true));$('close-cart').addEventListener('click',()=>showDrawer(false));$('drawer-backdrop').addEventListener('click',()=>showDrawer(false));
$('search').addEventListener('input',renderProducts);$('category').addEventListener('change',renderProducts);
$('products').addEventListener('click',e=>{const btn=e.target.closest('button[data-add]');if(!btn)return;change(btn.dataset.add,1);showDrawer(true)});
$('cart-items').addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.dataset.increment)change(btn.dataset.increment,1);else if(btn.dataset.decrement)change(btn.dataset.decrement,-1);else if(btn.dataset.remove){delete cart[btn.dataset.remove];render()}});
$('checkout').addEventListener('click',()=>{if(!validCart().length)return;showDrawer(false);showCheckout(true)});
$('close-checkout').addEventListener('click',()=>showCheckout(false));
$('close-success').addEventListener('click',()=>{$('success-backdrop').classList.add('hidden')});
$('checkout-form').addEventListener('submit',async e=>{
 e.preventDefault();if(submitting||!db||!settings||!validCart().length)return;
 const name=$('buyer-name').value.trim(),tel=phoneDigits($('buyer-phone').value);
 if(tel.length<10||tel.length>13){$('checkout-error').textContent='Confira o WhatsApp com DDD.';$('checkout-error').classList.remove('hidden');return}
 $('checkout-error').classList.add('hidden');submitting=true;$('submit-order').disabled=true;$('submit-order').textContent='Registrando pedido...';
 checkoutKey ||=newRequestId();
 try{
  const payload={p_nome:name,p_telefone:tel,p_email:$('buyer-email').value.trim(),p_observacoes:$('buyer-note').value.trim(),p_itens:validCart().map(p=>({id:p.id,quantidade:p.qtd})),p_solicitacao:checkoutKey,p_verificacao:$('buyer-site').value};
  const {data,error}=await db.rpc('mf64_enviar_pedido',payload);if(error)throw error;
  const totalOrder=data?.total===undefined?total():Number(data.total);
  const shortId=String(data.pedido_id||'').slice(0,8).toUpperCase();
  const message=`Olá, Mini Forge 64! Fiz o pedido #${shortId} pelo site. Nome: ${name}. Valor dos produtos: ${money(totalOrder)}. Gostaria de confirmar disponibilidade, entrega e pagamento.`;
  const wa=phoneDigits(data.whatsapp||settings.whatsapp);
  $('whatsapp-link').href=`https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
  $('success-detail').textContent=`Referência: #${shortId} · Produtos: ${money(totalOrder)} · Status: Pendente`;
  cart={};persist();checkoutKey=null;render();$('checkout-form').reset();showCheckout(false);$('success-backdrop').classList.remove('hidden');
 }catch(err){$('checkout-error').textContent=err?.message||'Não conseguimos registrar o pedido. Tente novamente.';$('checkout-error').classList.remove('hidden');console.error(err)}
 finally{submitting=false;$('submit-order').disabled=false;$('submit-order').textContent='Registrar pedido'}
});
fetchCatalog();
