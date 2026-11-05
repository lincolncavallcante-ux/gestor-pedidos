import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const $=id=>document.getElementById(id);
const config=window.APP_CONFIG||{};
const db=config.supabaseUrl&&config.supabaseAnonKey?createClient(config.supabaseUrl,config.supabaseAnonKey):null;
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:''}catch{return''}};
const storageKey='mf64_carrinho_v1';
let products=[],settings=null,cart={},submitting=false,checkoutKey=null,detailProduct=null,detailIndex=0,zoomIndex=0,detailSelected=[];
try{const v=JSON.parse(sessionStorage.getItem(storageKey)||'{}'); if(v&&typeof v==='object'&&!Array.isArray(v))cart=v}catch{}
// Os preços e as escolhas são recalculados no Supabase ao finalizar.
function persist(){sessionStorage.setItem(storageKey,JSON.stringify(cart))}
function kitOptions(p){return Array.isArray(p?.opcoes)?p.opcoes.filter(x=>typeof x==='string'&&x.length>0):[]}
function isKit(p){return kitOptions(p).length>=2}
function orderedSelected(p,list){const allowed=kitOptions(p);const selected=Array.isArray(list)?list:[];return allowed.filter(x=>selected.includes(x))}
function itemPrice(p,selected=[]){
 if(!isKit(p))return Number(p.preco)||0;
 const n=orderedSelected(p,selected).length,full=kitOptions(p).length;
 return n===full&&p.preco_kit!==null&&p.preco_kit!==undefined?Number(p.preco_kit):Number((n*Number(p.preco)).toFixed(2));
}
function cartKey(p,selected){const ids=orderedSelected(p,selected).map(x=>kitOptions(p).indexOf(x));return `${p.id}::${ids.join('-')}`}
function totalItems(){return Object.values(cart).reduce((s,val)=>s+(Number(typeof val==='number'?val:val?.qtd)||0),0)}
function validCart(){
 return Object.entries(cart).flatMap(([key,val])=>{
  const p=products.find(x=>x.id===key.split('::')[0]);if(!p)return[];
  const qtd=Number(typeof val==='number'?val:val?.qtd),selected=isKit(p)?orderedSelected(p,val?.selecionados):[];
  if(!Number.isInteger(qtd)||qtd<1||qtd>99|| (isKit(p)&&(!selected.length||key!==cartKey(p,selected))) || (!isKit(p)&&key!==p.id))return[];
  return [{...p,cartKey:key,qtd,selecionados:selected,preco_selecao:itemPrice(p,selected)}];
 });
}
function total(){return validCart().reduce((s,p)=>s+Math.round(p.preco_selecao*100)*p.qtd,0)/100}
function stockUsed(id){return validCart().filter(x=>x.id===id).reduce((n,x)=>n+x.qtd,0)}
function notice(msg,error=false){$('store-notice').textContent=msg;$('store-notice').classList.remove('hidden');$('store-notice').style.borderColor=error?'#a53b30':'#63432e'}
function render(){
 const ids=new Set(validCart().map(p=>p.cartKey));for(const id of Object.keys(cart))if(!ids.has(id))delete cart[id];persist();
 $('cart-count').textContent=totalItems();
 const cats=[...new Set(products.map(p=>p.categoria||'Outros'))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const sel=$('category'),prev=sel.value;sel.innerHTML='<option value="">Todas as categorias</option>'+cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');sel.value=cats.includes(prev)?prev:'';
 renderCategories();renderProducts();renderCart();
}
function renderCategories(){
 const current=$('category').value;
 const counts=new Map();for(const p of products){const key=p.categoria||'Outros';counts.set(key,(counts.get(key)||0)+1)}
 $('category-chips').innerHTML=`<button type="button" class="mf64-chip ${current?'':'active'}" data-cat="" aria-pressed="${!current}">Todos (${products.length})</button>`+[...counts.entries()].sort((a,b)=>a[0].localeCompare(b[0],'pt-BR')).map(([cat,n])=>`<button type="button" class="mf64-chip ${current===cat?'active':''}" data-cat="${esc(cat)}" aria-pressed="${current===cat}">${esc(cat)} (${n})</button>`).join('');
}
function unavailable(p){return Boolean(p.controlar_estoque && Number(p.estoque)<=0)}
function maxQty(p){return p.controlar_estoque?Math.max(0,Number(p.estoque)||0):99}
function photosFor(p){
 const list=(Array.isArray(p.fotos)?p.fotos:[]).filter(v=>typeof v==='string'&&safeUrl(v));
 const original=safeUrl(p.imagem_url);if(original&&!list.includes(original))list.unshift(original);
 return list.slice(0,6);
}
function renderProducts(){
 const q=$('search').value.toLocaleLowerCase('pt-BR').trim(),category=$('category').value;
 renderCategories();
 const found=products.filter(p=>(!category||p.categoria===category)&&(!q||(`${p.nome} ${p.descricao} ${p.categoria} ${kitOptions(p).join(' ')}`).toLocaleLowerCase('pt-BR').includes(q)));
 $('catalog-count').textContent=`${found.length} produto(s)`;
 $('empty-products').classList.toggle('hidden',found.length>0||products.length===0);
 $('products').innerHTML=found.map(p=>{
  const photo=photosFor(p)[0];
  return `<article class="product-card">
   <button type="button" class="product-media" data-detail="${esc(p.id)}" aria-label="Ver fotos e detalhes de ${esc(p.nome)}">${photo?`<img src="${esc(photo)}" alt="${esc(p.nome)}" loading="lazy">`:'<span class="product-placeholder" aria-hidden="true">◈</span>'}</button>
   <div class="product-content"><span class="product-category">${esc(p.categoria)}</span><h3>${esc(p.nome)}</h3>${unavailable(p)?'<span class="mf64-stock-label empty-stock">Esgotado</span>':p.controlar_estoque?`<span class="mf64-stock-label">${Number(p.estoque)} unidade(s) disponível(is)</span>`:'<span class="mf64-stock-label">Feito sob encomenda</span>'}<p>${esc(p.descricao||'Peça para sua coleção.')}</p>
   <div class="product-bottom"><strong class="product-price">${isKit(p)?`A partir de ${money(p.preco)}`:money(p.preco)}</strong><button type="button" ${isKit(p)?`data-detail="${esc(p.id)}"`:`data-add="${esc(p.id)}"`} ${unavailable(p)?'disabled aria-disabled="true"':''}>${unavailable(p)?'Esgotado':isKit(p)?'Escolher peças':'Adicionar +'}</button></div>
   <div class="mf64-card-actions"><button type="button" class="product-details-link" data-detail="${esc(p.id)}">Ver fotos e detalhes</button><button type="button" class="mf64-share" data-share="${esc(p.id)}" aria-label="Compartilhar ${esc(p.nome)}">Compartilhar ↗</button></div></div></article>`
 }).join('');
}
function updateDetailImage(){
 const photos=photosFor(detailProduct||{});
 if(!photos.length){$('detail-img').classList.add('hidden');$('detail-photo').disabled=true;$('detail-thumbs').innerHTML='';return}
 const img=$('detail-img');img.src=photos[detailIndex];img.alt=`Foto ${detailIndex+1} de ${photos.length} de ${detailProduct.nome}`;img.classList.remove('hidden');$('detail-photo').disabled=false;
 $('detail-thumbs').innerHTML=photos.map((u,i)=>`<button type="button" data-photo="${i}" class="${i===detailIndex?'active':''}" aria-label="Ver foto ${i+1}" aria-pressed="${i===detailIndex}"><img src="${esc(u)}" alt="Miniatura ${i+1}"></button>`).join('');
}
function renderKitSelector(){
 const p=detailProduct,host=$('mf64-kit-options');if(!p||!isKit(p)){host.classList.add('hidden');host.innerHTML='';return}
 const options=kitOptions(p),selected=orderedSelected(p,detailSelected);detailSelected=selected;
 const all=selected.length===options.length;
 host.classList.remove('hidden');
 host.innerHTML=`<div class="mf64-kit-heading"><strong>Escolha os personagens</strong><span>Selecione um ou vários</span></div>
  <div class="mf64-kit-buttons">${options.map((o,i)=>`<button type="button" class="mf64-kit-choice ${selected.includes(o)?'selected':''}" data-kit-choice="${i}" aria-pressed="${selected.includes(o)}">${selected.includes(o)?'✓ ':''}${esc(o)}</button>`).join('')}</div>
  <div class="mf64-kit-actions"><button type="button" data-kit-all="1" class="mf64-kit-all ${all?'on':''}">✓ Kit completo (${options.length}) · ${money(p.preco_kit??Number(p.preco)*options.length)}</button><button type="button" class="mf64-kit-clear" data-kit-clear="1">Limpar</button></div>
  <p class="mf64-kit-selection-status">${!selected.length?'Escolha pelo menos uma peça.':all?'Kit completo selecionado!':`${selected.length} de ${options.length} peças selecionadas.`}${all&&p.preco_kit!=null&&Number(p.preco_kit)<Number(p.preco)*options.length?` <span class="mf64-kit-discount">Economia de ${money(Number(p.preco)*options.length-Number(p.preco_kit))}</span>`:''}</p>`;
 $('detail-price').textContent=selected.length?money(itemPrice(p,selected)):`A partir de ${money(p.preco)}`;
 $('detail-add').disabled=unavailable(p)||!selected.length;
 $('detail-add').textContent=selected.length?`Adicionar seleção ao carrinho`:'Escolha ao menos um personagem';
}
function addSelectedKit(p){
 const selected=orderedSelected(p,detailSelected);if(!selected.length){flash('Selecione ao menos um personagem.');return}
 const key=cartKey(p,selected);if(stockUsed(p.id)>=maxQty(p)){flash('Limite de estoque atingido.');return}
 const current=cart[key];cart[key]={qtd:Math.min(99,Number(current?.qtd||0)+1),selecionados:selected};render();closeDetail();showDrawer(true);
}
function openDetail(id){
 const p=products.find(x=>x.id===id);if(!p)return;
 detailProduct=p;detailIndex=0;detailSelected=[];$('detail-title').textContent=p.nome;$('detail-category').textContent=p.categoria||'';$('detail-description').textContent=p.descricao||'Entre em contato para saber mais detalhes sobre esta miniatura.';$('detail-price').textContent=money(p.preco);$('detail-add').disabled=unavailable(p);$('detail-add').textContent=unavailable(p)?'Produto esgotado':'Adicionar ao carrinho';renderKitSelector();
 $('detail-stock').textContent=unavailable(p)?'Esgotado':p.controlar_estoque?`${Number(p.estoque)} unidade(s) em estoque`:'Disponível sob encomenda';
 $('detail-share').dataset.share=p.id;updateDetailImage();
 $('detail-backdrop').classList.remove('hidden');
}
function closeDetail(){$('detail-backdrop').classList.add('hidden')}
function refreshZoom(){
 const photos=photosFor(detailProduct||{});if(!photos.length)return;
 zoomIndex=(zoomIndex+photos.length)%photos.length;$('zoom-image').src=photos[zoomIndex];$('zoom-image').alt=`Foto ${zoomIndex+1} de ${photos.length} de ${detailProduct.nome}`;$('zoom-count').textContent=`${zoomIndex+1} / ${photos.length}`;
 $('zoom-prev').classList.toggle('hidden',photos.length<2);$('zoom-next').classList.toggle('hidden',photos.length<2);
}
function openZoom(){if(!detailProduct||!photosFor(detailProduct).length)return;zoomIndex=detailIndex;refreshZoom();$('zoom-backdrop').classList.remove('hidden')}
function closeZoom(){$('zoom-backdrop').classList.add('hidden')}
function renderCart(){
 const rows=validCart();
 $('cart-items').innerHTML=rows.length?rows.map(p=>`<div class="cart-row"><div><h3>${esc(p.nome)}</h3>${isKit(p)?`<small class="mf64-cart-choices">${p.selecionados.length===kitOptions(p).length?'<b>Kit completo: </b>':'<b>Personagens: </b>'}${esc(p.selecionados.join(', '))}</small>`:''}<small>${money(p.preco_selecao)} por ${isKit(p)?'seleção':'unidade'}</small><div class="qty-tools"><button type="button" data-decrement="${esc(p.cartKey)}" aria-label="Diminuir ${esc(p.nome)}">−</button><strong>${p.qtd}</strong><button type="button" data-increment="${esc(p.cartKey)}" aria-label="Aumentar ${esc(p.nome)}" ${stockUsed(p.id)>=maxQty(p)?'disabled':''}>+</button></div></div><div class="price">${money(p.preco_selecao*p.qtd)}<button type="button" class="remove-link" data-remove="${esc(p.cartKey)}">Remover</button></div></div>`).join(''):'<div class="empty">Seu carrinho está vazio. Escolha uma miniatura para começar.</div>';
 $('cart-total').textContent=money(total());$('checkout').disabled=!rows.length||!settings?.ativa||rows.some(p=>stockUsed(p.id)>maxQty(p));
}
function change(key,delta){
 const line=validCart().find(x=>x.cartKey===key);
 const p=line||products.find(x=>x.id===key);if(!p||isKit(p)&&!line)return;
 const v=Number(line?.qtd||cart[key]||0)+delta;
 if(delta>0&&stockUsed(p.id)>=maxQty(p)){flash('Quantidade indisponível em estoque.');return}
 if(v<=0)delete cart[key];else cart[key]=line&&isKit(p)?{qtd:Math.min(99,v),selecionados:line.selecionados}:Math.min(99,v);
 render();
}
function flash(message){let box=document.getElementById('mf64-v4-toast');if(!box){box=document.createElement('div');box.id='mf64-v4-toast';box.setAttribute('role','status');document.body.append(box)}box.textContent=message;box.classList.add('shown');clearTimeout(flash.timeout);flash.timeout=setTimeout(()=>box.classList.remove('shown'),2600)}
async function shareProduct(id){const p=products.find(p=>p.id===id);if(!p)return;const url=new URL(location.href);url.searchParams.set('produto',id);url.hash='';const link=url.toString();try{if(navigator.share){await navigator.share({title:p.nome,text:`Veja esta miniatura na Mini Forge 64: ${p.nome}`,url:link});return}if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(link);flash('Link do produto copiado!');return}window.prompt('Copie o link do produto:',link)}catch(e){if(e?.name!=='AbortError')window.prompt('Copie o link do produto:',link)}}
function showDrawer(show){$('drawer-backdrop').classList.toggle('hidden',!show);$('cart-drawer').classList.toggle('hidden',!show)}
function showCheckout(show){$('checkout-backdrop').classList.toggle('hidden',!show)}
function newRequestId(){return globalThis.crypto?.randomUUID?.()||'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{let r=Math.floor(Math.random()*16);return(c==='x'?r:(r&3|8)).toString(16)})}
function phoneDigits(s){return String(s).replace(/\D/g,'')}
async function fetchCatalog(){
 if(!db){notice('Configure o arquivo config.js do Supabase para publicar o catálogo.',true);return}
 try{
  const [c,p]=await Promise.all([db.from('mf64_loja_config').select('nome,descricao,whatsapp,ativa').eq('slug','miniforge64').maybeSingle(),db.from('mf64_produtos').select('id,nome,descricao,preco,preco_kit,opcoes,categoria,imagem_url,fotos,controlar_estoque,estoque').eq('ativo',true).order('created_at',{ascending:false})]);
  if(c.error||p.error)throw c.error||p.error;
  settings=c.data;
  products=p.data||[];
  if(!settings){notice('Nossa loja ainda está sendo preparada. Volte em breve.');products=[]}
  else if(!settings.ativa)notice('Prévia administrativa: loja ainda desativada. Você pode conferir o catálogo, mas os pedidos estão bloqueados.');
  else if(products.length===0)notice('Nosso catálogo está sendo atualizado. Em breve teremos novidades!');
  else $('store-notice').classList.add('hidden');
  render();
  const productParam=new URLSearchParams(location.search).get('produto');
  if(productParam&&products.some(p=>p.id===productParam)){openDetail(productParam)}
 }catch(e){notice('Não foi possível carregar o catálogo. Tente atualizar a página.',true);console.error(e)}
}
$('open-cart').addEventListener('click',()=>showDrawer(true));$('close-cart').addEventListener('click',()=>showDrawer(false));$('drawer-backdrop').addEventListener('click',()=>showDrawer(false));
$('search').addEventListener('input',renderProducts);$('category').addEventListener('change',renderProducts);
$('category-chips').addEventListener('click',e=>{const chip=e.target.closest('[data-cat]');if(!chip)return;$('category').value=chip.dataset.cat;renderProducts()});
$('detail-share').addEventListener('click',()=>{if(detailProduct)shareProduct(detailProduct.id)});
$('products').addEventListener('click',e=>{const shared=e.target.closest('[data-share]');if(shared){shareProduct(shared.dataset.share);return}const detail=e.target.closest('button[data-detail]');if(detail){openDetail(detail.dataset.detail);return}const btn=e.target.closest('button[data-add]');if(!btn)return;change(btn.dataset.add,1);showDrawer(true)});
$('close-detail').addEventListener('click',closeDetail);
$('detail-backdrop').addEventListener('click',e=>{if(e.target===$('detail-backdrop'))closeDetail()});
$('detail-thumbs').addEventListener('click',e=>{const b=e.target.closest('[data-photo]');if(b){detailIndex=Number(b.dataset.photo);updateDetailImage()}});
$('detail-photo').addEventListener('click',openZoom);
$('mf64-kit-options').addEventListener('click',e=>{
 if(!detailProduct||!isKit(detailProduct))return;
 const choice=e.target.closest('[data-kit-choice]');
 if(choice){const option=kitOptions(detailProduct)[Number(choice.dataset.kitChoice)];detailSelected=detailSelected.includes(option)?detailSelected.filter(x=>x!==option):[...detailSelected,option];renderKitSelector();return}
 if(e.target.closest('[data-kit-all]')){detailSelected=kitOptions(detailProduct);renderKitSelector();return}
 if(e.target.closest('[data-kit-clear]')){detailSelected=[];renderKitSelector()}
});
$('detail-add').addEventListener('click',()=>{if(!detailProduct||unavailable(detailProduct))return;if(isKit(detailProduct)){addSelectedKit(detailProduct);return}change(detailProduct.id,1);closeDetail();showDrawer(true)});
$('zoom-close').addEventListener('click',closeZoom);
$('zoom-backdrop').addEventListener('click',e=>{if(e.target===$('zoom-backdrop'))closeZoom()});
$('zoom-prev').addEventListener('click',()=>{zoomIndex--;refreshZoom()});
$('zoom-next').addEventListener('click',()=>{zoomIndex++;refreshZoom()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!$('zoom-backdrop').classList.contains('hidden'))closeZoom();else if(!$('detail-backdrop').classList.contains('hidden'))closeDetail();else{showCheckout(false);showDrawer(false)}}else if(!$('zoom-backdrop').classList.contains('hidden')&&e.key==='ArrowRight'){zoomIndex++;refreshZoom()}else if(!$('zoom-backdrop').classList.contains('hidden')&&e.key==='ArrowLeft'){zoomIndex--;refreshZoom()}});
$('cart-items').addEventListener('click',e=>{const btn=e.target.closest('button');if(!btn)return;if(btn.dataset.increment)change(btn.dataset.increment,1);else if(btn.dataset.decrement)change(btn.dataset.decrement,-1);else if(btn.dataset.remove){delete cart[btn.dataset.remove];render()}});
$('checkout').addEventListener('click',()=>{if(!validCart().length)return;showDrawer(false);showCheckout(true)});
$('close-checkout').addEventListener('click',()=>showCheckout(false));
$('close-success').addEventListener('click',()=>{$('success-backdrop').classList.add('hidden')});
$('checkout-form').addEventListener('submit',async e=>{
 e.preventDefault();if(submitting||!db||!settings?.ativa||!validCart().length)return;
 const name=$('buyer-name').value.trim(),tel=phoneDigits($('buyer-phone').value);
 if(tel.length<10||tel.length>13){$('checkout-error').textContent='Confira o WhatsApp com DDD.';$('checkout-error').classList.remove('hidden');return}
 $('checkout-error').classList.add('hidden');submitting=true;$('submit-order').disabled=true;$('submit-order').textContent='Registrando pedido...';
 checkoutKey ||=newRequestId();
 try{
  const payload={p_nome:name,p_telefone:tel,p_email:$('buyer-email').value.trim(),p_observacoes:$('buyer-note').value.trim(),p_itens:validCart().map(p=>({id:p.id,quantidade:p.qtd,...(isKit(p)?{selecionados:p.selecionados}:{})})),p_solicitacao:checkoutKey,p_verificacao:$('buyer-site').value};
  const {data,error}=await db.rpc('mf64_enviar_pedido',payload);if(error)throw error;
  const totalOrder=data?.total===undefined?total():Number(data.total);
  const shortId=String(data.pedido_id||'').slice(0,8).toUpperCase();
  const resumo=validCart().map(p=>isKit(p)?`${p.nome}: ${p.selecionados.join(', ')} (${p.qtd}x)`: `${p.nome} (${p.qtd}x)`).join(' | ');
  const message=`Olá, Mini Forge 64! Fiz o pedido #${shortId} pelo site. Nome: ${name}. Itens: ${resumo}. Valor dos produtos: ${money(totalOrder)}. Gostaria de confirmar disponibilidade, entrega e pagamento.`;
  const wa=phoneDigits(data.whatsapp||settings.whatsapp);
  $('whatsapp-link').href=`https://wa.me/${wa}?text=${encodeURIComponent(message)}`;
  $('success-detail').textContent=`Referência: #${shortId} · Produtos: ${money(totalOrder)} · Status: Pendente`;
  cart={};persist();checkoutKey=null;render();$('checkout-form').reset();showCheckout(false);$('success-backdrop').classList.remove('hidden');
 }catch(err){$('checkout-error').textContent=err?.message||'Não conseguimos registrar o pedido. Tente novamente.';$('checkout-error').classList.remove('hidden');console.error(err)}
 finally{submitting=false;$('submit-order').disabled=false;$('submit-order').textContent='Registrar pedido'}
});
fetchCatalog();
