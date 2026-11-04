/* Link opcional para encaixar as encomendas no menu do gestor, sem editar app.js */
(() => {
  const apply = () => {
    const nav=document.querySelector('.sidebar nav');
    if(!nav || nav.querySelector('a[href="personalizados.html"]'))return Boolean(nav);
    const a=document.createElement('a');
    a.href='personalizados.html';a.className='nav-item';a.style.textDecoration='none';
    const symbol=document.createElement('span');symbol.className='nav-symbol';symbol.textContent='✎';
    a.append(symbol,document.createTextNode(' Personalizados'));
    const store=nav.querySelector('a[href="loja.html"]');
    if(store)store.after(a);else nav.append(a);
    return true;
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',apply,{once:true});else apply();
})();
