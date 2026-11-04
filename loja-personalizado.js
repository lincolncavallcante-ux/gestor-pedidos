/* Mini Forge 64 V4 · solicitação personalizada (não altera o checkout tradicional) */
(() => {
 'use strict';
 const $=id=>document.getElementById(id);
 const cfg=window.APP_CONFIG||{};
 const start=()=>{
  const open=$('mf64-open-custom');if(!open)return;
  const cover=document.createElement('div');cover.id='mf64-custom-backdrop';cover.className='mf64-custom-backdrop hidden';
  cover.innerHTML=`<section class="mf64-custom-modal" role="dialog" aria-modal="true" aria-labelledby="mf64-custom-title">
   <header><div><span class="eyebrow">SOLICITE UM ORÇAMENTO</span><h2 id="mf64-custom-title">Miniatura personalizada</h2></div><button id="mf64-custom-close" type="button" aria-label="Fechar">×</button></header>
   <p>Conte como você imagina a peça. O orçamento, o prazo e o pagamento serão combinados pelo WhatsApp.</p>
   <form id="mf64-custom-form">
    <label>Nome completo *<input name="nome" type="text" minlength="2" maxlength="160" required autocomplete="name"></label>
    <div class="mf64-custom-grid"><label>WhatsApp com DDD *<input name="telefone" type="tel" minlength="10" maxlength="22" required autocomplete="tel-national" inputmode="tel" placeholder="(99) 99999-9999"></label>
    <label>E-mail (opcional)<input name="email" type="email" maxlength="160" autocomplete="email"></label></div>
    <label>Escala desejada *<select name="escala" required><option value="">Selecione a escala</option><option>1:64</option><option>1:43</option><option>1:32</option><option>1:24</option><option>1:18</option><option>1:12</option><option>Outra / a combinar</option></select></label>
    <label>Descrição da peça *<textarea name="detalhes" minlength="12" maxlength="1500" rows="4" required placeholder="Personagem, posição, tamanho, cores, acabamento, observações para impressão 3D..."></textarea></label>
    <label>Imagens de referência (opcional, até 3 imagens, 2 MB cada)<input id="mf64-custom-files" name="fotos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label>
    <div id="mf64-custom-photos" class="mf64-custom-previews"></div>
    <label class="mf64-custom-consent"><input type="checkbox" required> <span>Autorizo o uso dos meus dados e imagens exclusivamente para avaliar esta encomenda e entrar em contato sobre ela.</span></label>
    <label class="mf64-offscreen">Não preencha<input name="site" autocomplete="off" tabindex="-1"></label>
    <div id="mf64-custom-error" class="mf64-custom-error hidden" role="alert"></div>
    <button id="mf64-custom-submit" type="submit" class="button-primary full">Enviar solicitação de orçamento</button>
   </form>
   <div id="mf64-custom-success" class="mf64-custom-success hidden"><h3>Solicitação recebida!</h3><p id="mf64-custom-success-text"></p><a id="mf64-custom-whatsapp" class="button-primary full" target="_blank" rel="noopener noreferrer">Conversar no WhatsApp ↗</a><button type="button" id="mf64-custom-done" class="button-secondary full">Voltar à loja</button></div>
  </section>`;
  document.body.appendChild(cover);
  const form=$('mf64-custom-form'),errorBox=$('mf64-custom-error'),files=$('mf64-custom-files');
  let requestId=null,previewUrls=[];
  const close=()=>{cover.classList.add('hidden');document.body.classList.remove('mf64-custom-open')};
  const show=()=>{cover.classList.remove('hidden');document.body.classList.add('mf64-custom-open');setTimeout(()=>cover.querySelector('input[name="nome"]')?.focus(),30)};
  open.addEventListener('click',show);$('mf64-custom-close').addEventListener('click',close);
  $('mf64-custom-done').addEventListener('click',close);
  cover.addEventListener('click',e=>{if(e.target===cover)close()});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!cover.classList.contains('hidden'))close()});
  const fail=msg=>{errorBox.textContent=msg;errorBox.classList.remove('hidden')};
  function refreshPhotos(){for(const u of previewUrls)URL.revokeObjectURL(u);previewUrls=[];
   $('mf64-custom-photos').replaceChildren();const list=Array.from(files.files||[]);
   for(const file of list){const u=URL.createObjectURL(file);previewUrls.push(u);const img=document.createElement('img');img.src=u;img.alt=`Referência ${list.indexOf(file)+1}`;$('mf64-custom-photos').appendChild(img)}
  }
  files.addEventListener('change',()=>{errorBox.classList.add('hidden');const list=[...files.files];if(list.length>3||list.some(f=>!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>2*1024*1024)){files.value='';refreshPhotos();fail('Use até 3 imagens JPG/PNG/WebP com no máximo 2 MB cada.');return}refreshPhotos()});
  form.addEventListener('submit',async e=>{
   e.preventDefault();errorBox.classList.add('hidden');
   if(!cfg.supabaseUrl){fail('A configuração do banco não foi encontrada.');return}
   const btn=$('mf64-custom-submit');if(btn.disabled)return;
   requestId ||= crypto.randomUUID();
   const fd=new FormData(form);fd.set('solicitacao',requestId);
   btn.disabled=true;btn.textContent='Registrando encomenda...';
   try{
    const response=await fetch(`${String(cfg.supabaseUrl).replace(/\/$/,'')}/functions/v1/mf64-personalizado`,{
     method:'POST',body:fd,headers:{'apikey':cfg.supabaseAnonKey||''}
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw Error(data.error||`Erro HTTP ${response.status}`);
    $('mf64-custom-form').classList.add('hidden');$('mf64-custom-success').classList.remove('hidden');
    const shortId=String(data.pedido_id||'').slice(0,8).toUpperCase();
    $('mf64-custom-success-text').textContent=`Pedido #${shortId} registrado como Pendente, valor a combinar. ${data.fotos_recebidas||0} foto(s) anexada(s). ${data.aviso||''}`;
    const tel=String(data.whatsapp||'').replace(/\D/g,'');
    $('mf64-custom-whatsapp').href=`https://wa.me/${tel}?text=${encodeURIComponent(`Olá, Mini Forge 64! Fiz a solicitação de miniatura personalizada #${shortId} no site. Gostaria de confirmar orçamento, fotos de referência e prazo.`)}`;
    form.reset();refreshPhotos();requestId=null;
   }catch(err){fail(err.message||'Não foi possível registrar a solicitação.');}
   finally{btn.disabled=false;btn.textContent='Enviar solicitação de orçamento'}
  });
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
