// SuperFrete v6 - apenas simula frete; não altera o valor dos pedidos no Supabase.
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const originCep = '87020-220';
  const formatBRL = n => Number(n).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
  const strip = value => String(value || '').replace(/\D/g, '').slice(0,8);
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sfUrl = (window.APP_CONFIG?.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/mf64-cotar-frete';
  let quote = null;
  let signature = '';
  let lastCep = '';
  let requestCounter = 0;
  const key = 'mf64:frete-simulado:';

  function init() {
    const bottom = document.querySelector('#cart-drawer .drawer-bottom');
    const cartItems = byId('cart-items');
    if(!bottom || !cartItems || byId('mf64-frete')) return;
    const el = document.createElement('section');
    el.id = 'mf64-frete';
    el.innerHTML = `<h3>🚚 Simular frete</h3>
      <p>Origem: ${originCep}. Informe seu CEP para consultar preços e prazos de entrega.</p>
      <form class="mf64-frete-form" id="mf64-frete-form">
        <input id="mf64-frete-cep" type="text" inputmode="numeric" maxlength="9" autocomplete="postal-code" placeholder="CEP de destino" aria-label="CEP de destino" required>
        <button type="submit" id="mf64-frete-calc">Calcular</button>
      </form>
      <div class="mf64-frete-response" id="mf64-frete-results" role="status" aria-live="polite"></div>
      <p class="mf64-frete-note">Simulação para uma embalagem padrão. O valor do frete <strong>não está incluído</strong> no subtotal nem é cobrado pelo site. A entrega será confirmada pelo WhatsApp.</p>`;
    bottom.insertBefore(el, bottom.firstElementChild);

    const form = byId('mf64-frete-form'), cepInput = byId('mf64-frete-cep'), results = byId('mf64-frete-results');
    const button = byId('mf64-frete-calc');
    signature = cartItems.textContent.trim();
    const observer = new MutationObserver(() => {
      const next = cartItems.textContent.trim();
      if (next !== signature) {
        signature = next; quote = null; requestCounter++;
        if(results) results.textContent = 'Carrinho alterado. Calcule novamente para conferir o frete.';
      }
    });
    observer.observe(cartItems, {childList:true, subtree:true, characterData:true});

    cepInput.addEventListener('input', () => {
      const v=strip(cepInput.value);
      cepInput.value=v.length>5?v.slice(0,5)+'-'+v.slice(5):v;
    });
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      const cep = strip(cepInput.value);
      if(!/^\d{8}$/.test(cep)) {results.innerHTML = '<span class="mf64-frete-error">Informe um CEP válido com 8 dígitos.</span>';return}
      if(!byId('cart-items')?.textContent.trim() || byId('cart-count')?.textContent === '0') {results.textContent = 'Adicione um produto ao carrinho antes de calcular.';return}
      if(!window.APP_CONFIG?.supabaseUrl) {results.innerHTML='<span class="mf64-frete-error">A loja ainda não está configurada.</span>';return}
      const counter = ++requestCounter;
      const before = signature;
      button.disabled = true;
      button.textContent = 'Consultando...';
      results.textContent = 'Consultando os serviços disponíveis...';
      quote = null;
      try {
        const res = await fetch(sfUrl, {
          method: 'POST', headers: {'Content-Type':'application/json'},
          body: JSON.stringify({cepDestino:cep})
        });
        const data = await res.json();
        if(counter !== requestCounter || before !== signature) return;
        if(!res.ok) throw Error(data.message || 'Não foi possível consultar o frete. Confirme pelo WhatsApp.');
        const opts = Array.isArray(data.options) ? data.options.filter(o=>Number.isFinite(Number(o.price))&&Number(o.price)>0) : [];
        lastCep=cep;
        if(!opts.length){results.textContent='Sem cotação disponível para este CEP e embalagem. Confirme o frete pelo WhatsApp.';return}
        quote = { cep, options:opts, selectedId:null, createdAt:Date.now() };
        results.innerHTML='<strong>Opções estimadas de envio</strong>' + opts.map((o,i)=>`<label class="mf64-frete-choice"><input type="radio" name="mf64-frete-opcao" value="${i}"><span class="mf64-frete-service">${escapeHtml(o.service)}${o.carrier?' · '+escapeHtml(o.carrier):''}<small>${Number.isFinite(o.deliveryDays)&&o.deliveryDays!==null?`${o.deliveryDays} dia(s) estimados`:'Prazo a confirmar'}</small></span><span class="mf64-frete-price">${formatBRL(o.price)}</span></label>`).join('')+'<p class="mf64-frete-note">Selecione uma opção, se desejar registrá-la como referência nas observações do pedido.</p>';
      } catch (err) {
        if(counter===requestCounter) results.innerHTML = `<span class="mf64-frete-error">${escapeHtml(err.message || 'Não foi possível consultar o frete.')}</span>`;
      } finally {
        if(counter===requestCounter){button.disabled=false;button.textContent='Calcular'}
      }
    });
    results.addEventListener('change', e => {
      if(e.target?.name==='mf64-frete-opcao' && quote){
        const i = Number(e.target.value);
        if(quote.options[i])quote.selectedId=String(quote.options[i].id);
      }
    });
    byId('checkout')?.addEventListener('click', () => {
      if(!quote || !quote.selectedId || Date.now()-quote.createdAt>15*60*1000) return;
      const opt=quote.options.find(o=>String(o.id)===quote.selectedId);
      const note=byId('buyer-note');
      if(!opt || !note)return;
      // Nunca modifica os preços do pedido: apenas registra a simulação.
      const suffix=`[Frete SIMULADO: ${opt.service} / ${opt.carrier||'transportadora'}; destino ${quote.cep}; ${formatBRL(opt.price)}; não incluído no total. Confirmar no WhatsApp.]`;
      let current = note.value.replace(/\n?\[Frete SIMULADO:[^\]]*\]/g,'').trim();
      if(current.length+suffix.length+1<=note.maxLength || note.maxLength<0)note.value=current+(current?'\n':'')+suffix;
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
