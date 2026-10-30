import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
const $=id=>document.getElementById(id);
const cfg=window.APP_CONFIG||{};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:''}catch{return''}};
const money=v=>Number(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const db=cfg.supabaseUrl&&cfg.supabaseAnonKey?createClient(cfg.supabaseUrl,cfg.supabaseAnonKey):null;
let user=null,settings=null,products=[],busy=false,previewObjectUrl=null;
function clearImagePreviewObjectUrl(){if(previewObjectUrl){URL.revokeObjectURL(previewObjectUrl);previewObjectUrl=null}}
function updateImagePreview(){
 clearImagePreviewObjectUrl();
 const file=$('product-file').files[0];
 const img=$('photo-preview-img');
 const url=file?(previewObjectUrl=URL.createObjectURL(file)):safeUrl($('product-url').value.trim());
 if(url){img.src=url;img.classList.remove('hidden');$('photo-placeholder').classList.add('hidden')}
 else{img.removeAttribute('src');img.classList.add('hidden');$('photo-placeholder').classList.remove('hidden')}
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
 $('prod-list').innerHTML=products.length?products.map(p=>`<article class="product-row">${safeUrl(p.imagem_url)?`<img src="${esc(safeUrl(p.imagem_url))}" alt="${esc(p.nome)}" loading="lazy">`:'<span class="product-placeholder">⚙</span>'}<div class="product-info"><strong>${esc(p.nome)}</strong><p>${esc(p.categoria)} · ${p.ativo?'Disponível':'Oculto no catálogo'}</p><span>${money(p.preco)}</span></div><div class="product-actions"><button type="button" data-edit="${p.id}">Editar</button><button class="danger" type="button" data-delete="${p.id}">Excluir</button></div></article>`).join(''):'<p class="help">Cadastre seu primeiro produto para começar.</p>';
}
function showForm(product=null){
 $('product-form').reset();$('product-id').value=product?.id||'';$('product-title').textContent=product?'Editar produto':'Novo produto';
 $('product-name').value=product?.nome||'';$('product-category').value=product?.categoria||'Miniaturas';$('product-price').value=product?.preco??'';$('product-description').value=product?.descricao||'';$('product-url').value=product?.imagem_url||'';$('product-active').checked=product?.ativo??true;
 $('form-error').classList.add('hidden');updateImagePreview();$('product-overlay').classList.remove('hidden');
}
function closeForm(){$('product-overlay').classList.add('hidden');clearImagePreviewObjectUrl()}
$('product-file').addEventListener('change', updateImagePreview);$('product-url').addEventListener('input',()=>{if(!$('product-file').files.length)updateImagePreview()});
$('new-product').addEventListener('click',()=>showForm());$('close-product').addEventListener('click',closeForm);$('cancel-product').addEventListener('click',closeForm);
$('store-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!user)return;let w=$('store-phone').value.replace(/\D/g,'');if(w.length===10||w.length===11)w='55'+w;
 if(w.length<12||w.length>13||!w.startsWith('55')){toast('Informe WhatsApp comercial com DDD, incluindo 55.');return}
 const nome=$('store-name').value.trim(),desc=$('store-description').value.trim();if(!nome){toast('Informe o nome da loja.');return}
 busy=true;try{const {data,error}=await db.from('mf64_loja_config').update({nome,descricao:desc,whatsapp:w,ativa:$('store-active').checked,updated_at:new Date().toISOString()}).eq('slug','miniforge64').eq('user_id',user.id).select().single();if(error)throw error;settings=data;renderStatus();toast('Configuração salva.')}catch(e){toast('Erro: '+e.message)}finally{busy=false}
});
$('prod-list').addEventListener('click',async e=>{
 const edit=e.target.closest('[data-edit]');if(edit){showForm(products.find(p=>p.id===edit.dataset.edit));return}
 const del=e.target.closest('[data-delete]');if(!del)return;
 const p=products.find(p=>p.id===del.dataset.delete);if(!p||!confirm(`Excluir ${p.nome}? Pedidos já registrados serão preservados.`))return;
 const {error}=await db.from('mf64_produtos').delete().eq('id',p.id).eq('user_id',user.id);if(error)toast(error.message);else{await loadProducts();toast('Produto excluído.')}
});
$('product-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy||!user)return;const img=$('product-file').files[0];let url=$('product-url').value.trim();
 if(img&&(!['image/jpeg','image/png','image/webp'].includes(img.type)||img.size>3*1024*1024)){showError('Use imagem JPG, PNG ou WebP com até 3 MB.');return}
 if(url&&!safeUrl(url)){showError('URL de imagem inválida: utilize HTTPS.');return}
 busy=true;$('save-product').disabled=true;$('save-product').textContent='Salvando...';$('form-error').classList.add('hidden');
 try{
  if(img){const ext=img.type==='image/png'?'png':img.type==='image/webp'?'webp':'jpg',path=`${user.id}/${crypto.randomUUID()}.${ext}`;const {error}=await db.storage.from('mf64-produtos').upload(path,img,{contentType:img.type,upsert:false});if(error)throw error;url=db.storage.from('mf64-produtos').getPublicUrl(path).data.publicUrl}
  const body={user_id:user.id,nome:$('product-name').value.trim(),categoria:$('product-category').value.trim(),descricao:$('product-description').value.trim(),preco:Number($('product-price').value),imagem_url:url,ativo:$('product-active').checked};
  if(!body.nome||!body.categoria||!Number.isFinite(body.preco))throw Error('Confira os campos do produto.');
  const id=$('product-id').value;
  const q=id?db.from('mf64_produtos').update(body).eq('id',id).eq('user_id',user.id):db.from('mf64_produtos').insert(body);
  const {error}=await q;if(error)throw error;
  closeForm();await loadProducts();toast('Produto salvo com sucesso!');
 }catch(e){showError(e.message)}finally{busy=false;$('save-product').disabled=false;$('save-product').textContent='Salvar produto'}
});
function showError(t){$('form-error').textContent=t;$('form-error').classList.remove('hidden')}
init();
