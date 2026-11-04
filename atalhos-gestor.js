/* Mini Forge 64 — Sino de notificações + atalho para loja virtual (v2)
 * Complemento visual do módulo avisos-pedidos.js já instalado.
 * Sem novas consultas, tokens, alterações no banco ou sons.
 */
(() => {
  'use strict';

  const nav = document.querySelector('.sidebar nav[aria-label="Navegação principal"]');
  const topRight = document.querySelector('.topbar .top-right');
  if (!nav || !topRight) return;

  // Atalho permanente para a loja pública (em uma nova aba).
  if (!nav.querySelector('#mf64-atalho-loja')) {
    const link = document.createElement('a');
    link.id = 'mf64-atalho-loja';
    link.className = 'nav-item mf64-atalho-loja';
    link.href = 'loja.html';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.title = 'Abrir catálogo da Mini Forge 64 em uma nova aba';
    link.innerHTML = '<span class="nav-symbol" aria-hidden="true">↗</span><span>Loja virtual</span>';
    const financeiro = nav.querySelector('a[href="financeiro.html"]');
    nav.insertBefore(link, financeiro || null);
  }

  // CSS embutido para manter esta atualização em um único arquivo isolado.
  if (!document.querySelector('#mf64-atalhos-estilo-v2')) {
    const style = document.createElement('style');
    style.id = 'mf64-atalhos-estilo-v2';
    style.textContent = `
      .mf64-atalho-loja {text-decoration:none;}
      .mf64-sino-topo {
        position:relative; display:inline-flex; align-items:center; justify-content:center;
        flex:0 0 38px; width:38px; height:38px; padding:0;
        background:#fff; border:1px solid #dce5ee; border-radius:10px;
        color:#304c6e; cursor:pointer; transition:background-color .15s ease, border-color .15s ease;
      }
      .mf64-sino-topo:hover {background:#f4f7fa; border-color:#bfcfdf;}
      .mf64-sino-topo:focus-visible {outline:3px solid #88b7df; outline-offset:2px;}
      .mf64-sino-topo svg {width:19px; height:19px; display:block; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round;}
      .mf64-sino-contador {
        position:absolute; top:-7px; right:-8px; min-width:20px; height:20px;
        display:flex; align-items:center; justify-content:center;
        padding:0 4px; border-radius:20px; background:#edb943; color:#0b2545;
        border:2px solid #fff; font:700 11px/1 system-ui,sans-serif;
      }
      .mf64-sino-contador[hidden] {display:none!important;}
      @media (max-width:820px) {
        .mf64-sino-topo {width:36px;height:36px;flex-basis:36px;}
        .topbar .top-right {gap:12px;}
      }
    `;
    document.head.appendChild(style);
  }

  const bell = document.createElement('button');
  bell.id = 'mf64-sino-topo';
  bell.className = 'mf64-sino-topo';
  bell.type = 'button';
  bell.title = 'Abrir avisos de novos pedidos da loja';
  bell.setAttribute('aria-label', 'Ver avisos de novos pedidos');
  bell.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
    <span class="mf64-sino-contador" hidden aria-hidden="true"></span>`;
  const avatar = topRight.querySelector('.avatar');
  topRight.insertBefore(bell, avatar || null);
  const topCount = bell.querySelector('.mf64-sino-contador');

  // Reaproveita o contador criado por avisos-pedidos.js, sem fazer nova leitura do banco.
  const sourceBadge = document.querySelector('button.nav-item[data-page="pedidos"] .mf64-novo-badge');
  const sync = () => {
    const text = sourceBadge && !sourceBadge.hidden ? (sourceBadge.textContent || '').trim() : '';
    const hasUnread = !!text;
    topCount.hidden = !hasUnread;
    topCount.textContent = hasUnread ? text : '';
    bell.setAttribute('aria-label', hasUnread
      ? `${text} pedido(s) novo(s) da loja. Ver avisos.`
      : 'Ver avisos de pedidos da loja');
  };
  if (sourceBadge) {
    const watcher = new MutationObserver(sync);
    watcher.observe(sourceBadge, {
      attributes: true, attributeFilter: ['hidden', 'class'],
      childList: true, characterData: true, subtree: true
    });
  }
  sync();

  bell.addEventListener('click', () => {
    const auth = document.getElementById('auth-screen');
    if (auth && !auth.classList.contains('hidden')) return;
    const ordersNav = nav.querySelector('button.nav-item[data-page="pedidos"]');
    if (ordersNav && !ordersNav.classList.contains('active')) ordersNav.click();
    const notificationPanel = document.querySelector('.mf64-novos-painel');
    const target = notificationPanel && !notificationPanel.hidden
      ? notificationPanel
      : document.getElementById('orders-view');
    if (target) target.scrollIntoView({behavior:'smooth', block:'start'});
  });
})();
