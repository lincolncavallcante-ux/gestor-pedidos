// SuperFrete v7 - logotipos oficiais + CEP de origem atualizado; apenas simula frete.
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const originCep = '87114-091';
  const formatBRL = n => Number(n).toLocaleString('pt-BR', {style:'currency',currency:'BRL'});
  const strip = value => String(value || '').replace(/\D/g, '').slice(0,8);
  const escapeHtml = s => String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const sfUrl = (window.APP_CONFIG?.supabaseUrl || '').replace(/\/$/, '') + '/functions/v1/mf64-cotar-frete';
  let quote = null;
  let signature = '';
  let lastCep = '';
  let requestCounter = 0;
  const key = 'mf64:frete-simulado:';
  // Logotipos hospedados nos sites oficiais das transportadoras.
  // Se a imagem não carregar, o nome da empresa permanece visível.
  const carrierData = Object.freeze({
    correios: { name: 'Correios', logo: 'https://www.correios.com.br/@@site-logo/correios.svg' },
    jadlog: { name: 'Jadlog', logo: 'https://www.jadlog.com.br/portalcliente/images/logo_home.png' },
    loggi: { name: 'Loggi', logo: 'https://ajuda.loggi.com/hc/theming_assets/01KKD9JHZTKN51ACA8RQYGRFQ8' }
  });
  function carrierKey(option) {
    const descriptor = String(option.carrier || '') + ' ' + String(option.service || '');
    const name = descriptor.toLowerCase();
    if (name.includes('jadlog')) return 'jadlog';
    if (name.includes('loggi')) return 'loggi';
    if (name.includes('correios') || /\b(pac|sedex)\b/i.test(descriptor)) return 'correios';
    return '';
  }
  function renderService(option, index) {
    const carrier = carrierData[carrierKey(option)];
    const service = String(option.service || 'Entrega').trim();
    const companyName = carrier?.name || String(option.carrier || 'Transportadora');
    // Ex.: Jadlog.Package passa a "Package" (Jadlog já aparece no logotipo).
    const serviceLabel = companyName === 'Jadlog' ? service.replace(/^jadlog[.\s-]*/i, '') || 'Package' : service;
    const prazo = Number(option.deliveryDays);
    const labelPrazo = option.deliveryDays !== null && option.deliveryDays !== undefined && Number.isFinite(prazo)
      ? `Até ${prazo} ${prazo === 1 ? 'dia útil' : 'dias úteis'}`
      : 'Prazo a confirmar';
    const logo = carrier
      ? `<span class="mf64-frete-logo"><img src="${carrier.logo}" alt="${escapeHtml(companyName)}" loading="lazy"><span class="mf64-frete-logo-fallback">${escapeHtml(companyName)}</span></span>`
      : `<span class="mf64-frete-logo mf64-frete-logo-unknown"><span class="mf64-frete-logo-fallback">${escapeHtml(companyName)}</span></span>`;
    return `<label class="mf64-frete-choice${index === 0 ? ' mf64-frete-best' : ''}">
      <input type="radio" name="mf64-frete-opcao" value="${index}">
      ${logo}
      <span class="mf64-frete-service"><strong>${escapeHtml(serviceLabel)}</strong><small>${labelPrazo}</small></span>
      <span class="mf64-frete-price">${formatBRL(option.price)}</span>
      ${index === 0 ? '<span class="mf64-frete-best-tag">Melhor preço</span>' : ''}
    </label>`;
  }
  function attachLogoFallbacks(results) {
    results.querySelectorAll('.mf64-frete-logo img').forEach(img => {
      const fail = () => img.closest('.mf64-frete-logo')?.classList.add('mf64-frete-no-logo');
      img.addEventListener('error', fail, { once: true });
      if (img.complete && img.naturalWidth === 0) fail();
    });
  }


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
        results.innerHTML = '<strong class="mf64-frete-results-title">Compare as opções de envio</strong>'
          + opts.map(renderService).join('')
          + '<p class="mf64-frete-note">Selecione uma opção para registrar a estimativa nas observações do pedido.</p>';
        attachLogoFallbacks(results);
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
