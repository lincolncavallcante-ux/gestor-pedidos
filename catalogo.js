import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const $=id=>document.getElementById(id);
const cfg=window.APP_CONFIG||{};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:''}catch{return''}};
const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const db=cfg.supabaseUrl&&cfg.supabaseAnonKey?createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
let user=null,settings=null,products=[],busy=false,photoEntries=[],objectUrls=[];
function clearTempUrls(){for(const u of objectUrls)URL.revokeObjectURL(u);objectUrls=[]}
function safePhotos(p){
 const photos=Array.isArray(p?.fotos)?p.fotos.filter(u=>typeof u==='string'&&safeUrl(u)):[];
 const old=safeUrl(p?.imagem_url||'');if(old&&!photos.includes(old))photos.unshift(old);
 return photos.slice(0,6);
}
function renderPhotoEditor(){
 clearTempUrls();
 $('photos-preview').innerHTML=photoEntries.length?photoEntries.map((entry,i)=>{
  const url=entry.type==='file'?(objectUrls.push(URL.createObjectURL(entry.file)),objectUrls.at(-1)):entry.url;
  return `<div class="preview-tile"><img src="${esc(url)}" alt="Foto ${i+1} do produto"><span class="cover-indicator">${i===0?'★ Foto principal':`Foto ${i+1}`}</span><div class="preview-buttons"><button type="button" data-cover="${i}" ${i===0?'disabled':''}>Usar como capa</button><button type="button" data-remove-photo="${i}" aria-label="Remover foto ${i+1}">Remover</button></div></div>`
 }).join(''):'<div class="preview-empty">Nenhuma foto selecionada. Você pode acrescentar até 6 fotos.</div>';
 const count=photoEntries.length;
 $('photo-counter').textContent=`${count} de 6 fotos`;
 $('photo-counter').classList.toggle('at-limit', count>=6);
 $('choose-photos').disabled=count>=6;
 $('choose-photos').textContent=count>=6?'Limite de 6 fotos atingido':count?'+ Adicionar mais fotos':'+ Adicionar fotos';
}
function insertPhoto(entry){
 if(photoEntries.length>=6){showError('Limite de 6 fotos por produto. Remova uma foto para adicionar outra.');return false}
 photoEntries.push(entry);renderPhotoEditor();return true;
}
function message(msg,bad=false){$('warning').textContent=msg;$('warning').classList.remove('hidden');$('warning').classList.toggle('error',bad)}
function toast(msg){$('toast').textContent=msg;$('toast').classList.remove('hidden');setTimeout(()=>$('toast').classList.add('hidden'),3800)}
async function init(){
 if(!db){message('A configuração config.js do Supabase não foi encontrada.',true);return}
 try{
  const {data,error}=await db.auth.getUser();if(error||!data.user){message('Faça login no Gestor de Pedidos e volte para esta página: index.html.',true);return}
  user=data.user;
  const result=await db.from('mf64_loja_config').select('*').eq('slug','miniforge64').maybeSingle();if(result.error)throw result.error;
  if(!result.data){message('A loja ainda não foi vinculada a uma conta. Confira o resultado do SQL de instalação.',true);return}
  if(result.data.user_id!==user.id){message('Esta conta não é a proprietária da loja. Confira o resultado do SQL de instalação.',true);return}
  settings=result.data;
  $('store-name').value=settings.nome;$('store-phone').value=settings.whatsapp;$('store-description').value=settings.descricao;$('store-active').checked=settings.ativa;
  $('workspace').classList.remove('hidden');$('warning').classList.add('hidden');renderStatus();await loadProducts();
 }catch(e){message('Erro ao verificar sua conta: '+e.message,true);console.error(e)}
}
function renderStatus(){$('store-status').textContent=settings.ativa?'Loja ativa':'Loja desativada';$('store-status').classList.toggle('on',settings.ativa)}
async function loadProducts(){const {data,error}=await db.from('mf64_produtos').select('*').eq('user_id',user.id).order('created_at',{ascending:false});if(error)throw error;products=data||[];renderProducts()}
function renderProducts(){
 $('prod-count').textContent=`${products.length} produto(s) cadastrado(s).`;
 const low=products.filter(p=>p.controlar_estoque && p.estoque<=p.estoque_minimo);
 $('mf64-stock-summary').textContent=low.length?`${low.length} produto(s) com estoque baixo ou esgotado`:'Estoque sem alertas';
 $('mf64-stock-summary').classList.toggle('low',low.length>0);
 $('prod-list').innerHTML=products.length?products.map(p=>`<article class="product-row">${safeUrl(p.imagem_url)?`<img src="${esc(safeUrl(p.imagem_url))}" alt="${esc(p.nome)}" loading="lazy">`:'<span class="product-placeholder">⚙</span>'}<div class="product-info"><strong>${esc(p.nome)}</strong><p>${esc(p.categoria)} · ${!p.ativo?'Oculto no catálogo':p.controlar_estoque?(p.estoque===0?'Esgotado':`Estoque: ${p.estoque}`):'Sob encomenda'}</p><span>${money(p.preco)}</span>${Array.isArray(p.opcoes)&&p.opcoes.length>1?`<small class="mf64-kit-list-label">Coleção: ${p.opcoes.length} opções · Kit ${money(p.preco_kit??p.preco*p.opcoes.length)}</small>`:''}</div><div class="product-actions"><button type="button" data-edit="${p.id}">Editar</button><button class="danger" type="button" data-delete="${p.id}">Excluir</button></div></article>`).join(''):'<p class="help">Cadastre seu primeiro produto para começar.</p>';
}
function showForm(product=null){
 $('product-form').reset();$('product-id').value=product?.id||'';$('product-title').textContent=product?'Editar produto':'Novo produto';
 $('product-name').value=product?.nome||'';$('product-category').value=product?.categoria||'Miniaturas';$('product-price').value=product?.preco??'';$('product-description').value=product?.descricao||'';$('product-active').checked=product?.ativo??true;
 $('product-control-stock').checked=product?.controlar_estoque??true;
 $('product-stock').value=product?.estoque??0; $('product-stock-min').value=product?.estoque_minimo??2;
 $('mf64-stock-inputs').hidden=!$('product-control-stock').checked;
 $('product-is-kit').checked=Array.isArray(product?.opcoes)&&product.opcoes.length>=2;
 $('product-kit-options').value=$('product-is-kit').checked?product.opcoes.join('\n'):'';
 $('product-kit-price').value=$('product-is-kit').checked?(product?.preco_kit??''):'';
 $('mf64-kit-fields').hidden=!$('product-is-kit').checked;

 photoEntries=safePhotos(product).map(url=>({type:'url',url}));$('form-error').classList.add('hidden');renderPhotoEditor();$('product-overlay').classList.remove('hidden');
}
function closeForm(){$('product-overlay').classList.add('hidden');clearTempUrls()}
$('choose-photos').addEventListener('click',()=>{
 $('form-error').classList.add('hidden');
 $('product-file').click();
});
$('product-file').addEventListener('change',e=>{
 const chosen=Array.from(e.target.files||[]);
 // Permite selecionar uma foto por vez ou muitas na mesma seleção.
 // A seleção anterior é guardada em photoEntries, não no input.
 e.target.value='';
 if(!chosen.length)return;
 const problems=[];
 let added=0;
 for(const file of chosen){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)){
   problems.push(`${file.name}: use JPG, PNG ou WebP.`);continue;
  }
  if(file.size>3*1024*1024){problems.push(`${file.name}: arquivo maior que 3 MB.`);continue;}
  if(photoEntries.length>=6){problems.push('Limite de 6 fotos atingido.');break;}
  if(photoEntries.some(p=>p.type==='file'&&p.file.name===file.name&&p.file.size===file.size&&p.file.lastModified===file.lastModified)){
   problems.push(`${file.name}: foto já adicionada.`);continue;
  }
  photoEntries.push({type:'file',file});added++;
 }
 renderPhotoEditor();
 if(problems.length)showError(problems.join(' '));
 else if(added)$('form-error').classList.add('hidden');
});
$('photos-preview').addEventListener('click',e=>{
 const move=e.target.closest('[data-cover]');if(move){const i=Number(move.dataset.cover);photoEntries.unshift(photoEntries.splice(i,1)[0]);renderPhotoEditor();return}
 const remove=e.target.closest('[data-remove-photo]');if(remove){photoEntries.splice(Number(remove.dataset.removePhoto),1);renderPhotoEditor()}
});
$('add-photo-url').addEventListener('click',()=>{const url=$('product-url').value.trim();if(!safeUrl(url)){showError('Use um link HTTPS de imagem válido.');return}if(insertPhoto({type:'url',url})){ $('product-url').value='';$('form-error').classList.add('hidden')}});
$('product-control-stock').addEventListener('change',()=>{$('mf64-stock-inputs').hidden=!$('product-control-stock').checked});
$('product-is-kit').addEventListener('change',()=>{$('mf64-kit-fields').hidden=!$('product-is-kit').checked});
$('new-product').addEventListener('click',()=>showForm());$('close-product').addEventListener('click',closeForm);$('cancel-product').addEventListener('click',closeForm);
$('store-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!user)return;let w=$('store-phone').value.replace(/\D/g,'');if(w.length===10||w.length===11)w='55'+w;
 if(w.length<12||w.length>13||!w.startsWith('55')){toast('Informe WhatsApp comercial com DDD, incluindo 55.');return}
 const nome=$('store-name').value.trim(),desc=$('store-description').value.trim();if(!nome){toast('Informe o nome da loja.');return}
 if($('store-active').checked&&!products.some(p=>p.ativo)){toast('Cadastre ao menos um produto disponível antes de ativar.');return}
 busy=true;try{const {data,error}=await db.from('mf64_loja_config').update({nome,descricao:desc,whatsapp:w,ativa:$('store-active').checked,updated_at:new Date().toISOString()}).eq('slug','miniforge64').eq('user_id',user.id).select().single();if(error)throw error;settings=data;renderStatus();toast('Configuração salva.')}catch(e){toast('Erro: '+e.message)}finally{busy=false}
});
$('prod-list').addEventListener('click',async e=>{
 const edit=e.target.closest('[data-edit]');if(edit){showForm(products.find(p=>p.id===edit.dataset.edit));return}
 const del=e.target.closest('[data-delete]');if(!del)return;
 const p=products.find(p=>p.id===del.dataset.delete);if(!p||!confirm(`Excluir ${p.nome}? Pedidos já registrados serão preservados.`))return;
 const {error}=await db.from('mf64_produtos').delete().eq('id',p.id).eq('user_id',user.id);if(error)toast(error.message);else{await loadProducts();toast('Produto excluído.')}
});
$('product-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!user)return;
 const nome=$('product-name').value.trim(),categoria=$('product-category').value.trim(),preco=Number($('product-price').value);
 if(!nome||!categoria||!Number.isFinite(preco)||preco<0||preco>100000){showError('Confira nome, categoria e preço do produto.');return}
 if(!photoEntries.length){showError('Adicione pelo menos uma foto do produto.');return}
 let opcoes=[],precoKit=null;
 if($('product-is-kit').checked){
  opcoes=$('product-kit-options').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  precoKit=$('product-kit-price').value===''?null:Number($('product-kit-price').value);
  if(opcoes.length<2||opcoes.length>12||opcoes.some(x=>x.length>60)||new Set(opcoes.map(x=>x.toLocaleLowerCase('pt-BR'))).size!==opcoes.length){showError('Informe de 2 a 12 opções diferentes, com até 60 caracteres por linha.');return}
  if(precoKit!==null&&(!Number.isFinite(precoKit)||precoKit<=0||precoKit>preco*opcoes.length)){showError('O valor do kit deve ser positivo e não pode superar a soma das peças avulsas.');return}
 }

 const controlarEstoque=$('product-control-stock').checked;
 const estoque=Number($('product-stock').value),estoqueMinimo=Number($('product-stock-min').value);
 if(!Number.isInteger(estoque)||estoque<0||estoque>1000000||!Number.isInteger(estoqueMinimo)||estoqueMinimo<0||estoqueMinimo>1000000){showError('Informe quantidades inteiras e não negativas para estoque e alerta.');return}
 busy=true;$('save-product').disabled=true;$('save-product').textContent='Salvando fotos e produto...';$('form-error').classList.add('hidden');
 const uploaded=[];let persisted=false;
 try{
  const fotos=[];
  for(const entry of photoEntries){
   if(entry.type==='url'){fotos.push(entry.url);continue}
   const file=entry.file,ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg',path=`${user.id}/${crypto.randomUUID()}.${ext}`;
   const {error}=await db.storage.from('mf64-produtos').upload(path,file,{contentType:file.type,upsert:false});if(error)throw new Error(`Falha ao enviar ${file.name}: ${error.message}`);
   uploaded.push(path);fotos.push(db.storage.from('mf64-produtos').getPublicUrl(path).data.publicUrl);
  }
  const body={user_id:user.id,nome,categoria,descricao:$('product-description').value.trim(),preco,opcoes,preco_kit:precoKit,imagem_url:fotos[0],fotos,ativo:$('product-active').checked,controlar_estoque:controlarEstoque,estoque,estoque_minimo:estoqueMinimo};
  const id=$('product-id').value;
  const {error}=await (id?db.from('mf64_produtos').update(body).eq('id',id).eq('user_id',user.id):db.from('mf64_produtos').insert(body));
  if(error){
   const msg=String(error.message||'');
   if(/fotos|schema cache|column/i.test(msg))throw new Error('O Supabase ainda não reconhece a coluna de várias fotos. Execute o arquivo VERIFICAR_OU_ATUALIZAR_FOTOS.sql no SQL Editor. Detalhe: '+msg);
   throw error;
  }
  persisted=true;
  closeForm();
  try{await loadProducts();toast(`Produto salvo com ${fotos.length} foto(s)!`)}
  catch(refreshError){toast('Produto salvo; atualize a página para ver a lista.');console.error(refreshError)}
 }catch(err){
  if(!persisted&&uploaded.length){await db.storage.from('mf64-produtos').remove(uploaded).catch(()=>{})}
  showError(err?.message||'Não foi possível salvar o produto.');console.error(err);
 }
 finally{busy=false;$('save-product').disabled=false;$('save-product').textContent='Salvar produto'}
});
function showError(t){$('form-error').textContent=t;$('form-error').classList.remove('hidden')}
init();
