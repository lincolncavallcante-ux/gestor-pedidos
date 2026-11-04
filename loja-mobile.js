/* Mini Forge 64 · experiência mobile V3 · não altera checkout, Supabase ou pagamentos */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const openOverlays = ['detail-backdrop','zoom-backdrop','drawer-backdrop','checkout-backdrop','success-backdrop'];
  function init() {
    const count = $('cart-count'), total = $('cart-total'), items = $('cart-items');
    const checkout = $('checkout-backdrop'), form = $('checkout-form'), submit = $('submit-order');
    if (!count || !total || !items || !checkout || !form || !submit) return;

    const mobileCart = document.createElement('div');
    mobileCart.className = 'mf64-mobile-cart';
    mobileCart.hidden = true;
    mobileCart.innerHTML = '<button type="button" aria-label="Abrir carrinho"><span>🛒 Carrinho <span class="mf64-cart-badge">0</span></span><strong>R$ 0,00</strong></button>';
    document.body.appendChild(mobileCart);
    mobileCart.querySelector('button').addEventListener('click', () => $('open-cart')?.click());

    const summary = document.createElement('div');
    summary.id = 'mf64-checkout-summary';
    summary.className = 'mf64-checkout-summary';
    summary.setAttribute('aria-label','Resumo da encomenda');
    summary.innerHTML = '<div class="mf64-checkout-summary-top"><span>Resumo do pedido</span><strong>R$ 0,00</strong></div><p></p>';
    form.before(summary);

    const dock = document.createElement('div');
    dock.className = 'mf64-checkout-dock';
    dock.innerHTML = '<div class="mf64-dock-total"><small>Total dos produtos</small><strong>R$ 0,00</strong></div><button type="button" class="button-primary">Registrar pedido</button>';
    checkout.querySelector('.checkout-modal')?.appendChild(dock);
    const dockButton = dock.querySelector('button');
    dockButton.addEventListener('click', () => {
      if (!submit.disabled) form.requestSubmit(submit);
    });

    function update() {
      const n = Math.max(0, Number.parseInt(count.textContent, 10) || 0);
      const price = total.textContent.trim() || 'R$ 0,00';
      mobileCart.hidden = n === 0;
      mobileCart.querySelector('.mf64-cart-badge').textContent = String(n);
      mobileCart.querySelector('strong').textContent = price;
      mobileCart.querySelector('button').setAttribute('aria-label', `Abrir carrinho com ${n} itens, total ${price}`);
      summary.querySelector('strong').textContent = price;
      dock.querySelector('strong').textContent = price;
      const names = [...items.querySelectorAll('.cart-row')].map(row => {
        const name = row.querySelector('h3')?.textContent?.trim() || 'Produto';
        const qty = row.querySelector('.qty-tools strong')?.textContent?.trim() || '1';
        return `${qty}× ${name}`;
      });
      summary.querySelector('p').textContent = names.length ? names.join(' · ') : 'Nenhum item selecionado';
      dockButton.disabled = submit.disabled || n === 0;
      dockButton.textContent = submit.disabled ? 'Registrando…' : 'Registrar pedido';
    }
    const cartObserver = new MutationObserver(update);
    cartObserver.observe(count, {childList:true, characterData:true, subtree:true});
    cartObserver.observe(total, {childList:true, characterData:true, subtree:true});
    cartObserver.observe(items, {childList:true, characterData:true, subtree:true});
    cartObserver.observe(submit, {attributes:true, attributeFilter:['disabled'], childList:true});
    update();

    let previousFocus = null;
    let lastOpen = null;
    function updateOverlays() {
      const visible = openOverlays.filter(id => { const el = $(id); return el && !el.classList.contains('hidden'); });
      document.body.classList.toggle('mf64-overlay-open', visible.length > 0);
      const top = visible.includes('zoom-backdrop') ? 'zoom-backdrop' : visible.includes('success-backdrop') ? 'success-backdrop' :
        visible.includes('checkout-backdrop') ? 'checkout-backdrop' : visible.includes('detail-backdrop') ? 'detail-backdrop' : visible.includes('cart-drawer') ? 'cart-drawer' : visible[0];
      if (top && top !== lastOpen) {
        previousFocus = document.activeElement;
        const el = $(top);
        const focusable = el?.querySelector('button[aria-label],button:not([disabled])');
        if (focusable) requestAnimationFrame(() => focusable.focus({preventScroll:true}));
      } else if (!top && lastOpen && previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus({preventScroll:true});
      }
      lastOpen = top || null;
    }
    [...openOverlays, 'cart-drawer'].forEach(id => {
      const el = $(id); if(el) new MutationObserver(updateOverlays).observe(el, {attributes:true,attributeFilter:['class']});
    });
    updateOverlays();

    const gallery = $('detail-gallery') || document.querySelector('.detail-gallery');
    const thumbs = $('detail-thumbs');
    if (gallery && thumbs) {
      const hint = document.createElement('span');
      hint.className = 'mf64-swipe-hint';
      hint.textContent = 'Deslize para ver outras fotos';
      thumbs.after(hint);
      const updateHint = () => { hint.hidden = thumbs.querySelectorAll('button[data-photo]').length < 2; };
      new MutationObserver(updateHint).observe(thumbs, {childList:true});
      updateHint();
    }
    function swipe(node, onLeft, onRight) {
      if (!node) return;
      let start = null;
      node.addEventListener('touchstart', e => {
        if (e.touches.length !== 1) { start=null; return; }
        start = {x:e.touches[0].clientX, y:e.touches[0].clientY};
      }, {passive:true});
      node.addEventListener('touchend', e => {
        if (!start || e.changedTouches.length !== 1) return;
        const dx = e.changedTouches[0].clientX-start.x;
        const dy = e.changedTouches[0].clientY-start.y;
        start = null;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)*1.4) return;
        (dx < 0 ? onLeft : onRight)();
      }, {passive:true});
      node.addEventListener('touchcancel', () => { start=null; }, {passive:true});
    }
    swipe($('zoom-image'), ()=>$('zoom-next')?.click(), ()=>$('zoom-prev')?.click());
    swipe($('detail-photo'), () => {
      const btns=[...document.querySelectorAll('#detail-thumbs button[data-photo]')];
      const i=btns.findIndex(b=>b.classList.contains('active'));
      if (i>=0 && i<btns.length-1) btns[i+1].click();
    }, () => {
      const btns=[...document.querySelectorAll('#detail-thumbs button[data-photo]')];
      const i=btns.findIndex(b=>b.classList.contains('active'));
      if (i>0) btns[i-1].click();
    });
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
