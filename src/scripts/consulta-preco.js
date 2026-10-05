document.addEventListener('DOMContentLoaded', async () => {
  const queryInput = document.getElementById('productQuery');
  const results = document.getElementById('results');
  const selectedDetails = document.getElementById('selectedDetails');
  const emptySelection = document.getElementById('emptySelection');
  const searchStatus = document.getElementById('searchStatus');
  const nameEl = document.getElementById('productName');
  const priceEl = document.getElementById('unitPrice');
  const codeEl = document.getElementById('productCode');
  const stockEl = document.getElementById('productStock');
  const quantityInput = document.getElementById('quantity');
  const subtotalEl = document.getElementById('subtotal');
  const statusEl = document.getElementById('status');
  const goButton = document.getElementById('goToSale');
  let selectedProduct = null;
  let searchTimer = null;
  let searchSequence = 0;

  const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const stock = product => Math.max(0, Math.floor(Number(product.estoque) || 0));

  const updateSubtotal = () => {
    if (!selectedProduct) return;
    const available = stock(selectedProduct);
    const quantity = Number(quantityInput.value);
    const valid = available > 0 && Number.isInteger(quantity) && quantity > 0 && quantity <= available;
    subtotalEl.textContent = valid ? `Total: ${money(quantity * selectedProduct.precoVenda)}` : '';
    goButton.disabled = !valid;
    goButton.textContent = available > 0 ? 'Ir para venda' : 'Sem estoque disponível';
    statusEl.classList.toggle('is-error', !valid);
    if (available === 0) {
      statusEl.textContent = 'Este produto está sem estoque e não pode ser enviado para venda.';
    } else {
      statusEl.textContent = valid ? '' : `Escolha uma quantidade entre 1 e ${available}.`;
    }
  };

  const chooseProduct = product => {
    selectedProduct = product;
    selectedDetails.hidden = false;
    emptySelection.hidden = true;
    nameEl.textContent = product.nome;
    priceEl.textContent = money(product.precoVenda);
    const available = stock(product);
    codeEl.textContent = `${product.codigo || 'Sem código'}${product.codigoBarras ? ` · Barras: ${product.codigoBarras}` : ''}${product.exigeReceita ? ' · Exige receita' : ''}`;
    stockEl.textContent = available > 0 ? `Disponível · ${available} ${product.unidadeMedida || 'un'}` : 'Sem estoque';
    stockEl.className = `consult-stock ${available > 0 ? 'is-available' : 'is-empty'}`;
    quantityInput.value = available > 0 ? '1' : '0';
    quantityInput.disabled = available === 0;
    quantityInput.max = String(available);
    updateSubtotal();
    if (available > 0) quantityInput.focus();
  };

  const search = async (selectExact = false) => {
    const term = queryInput.value.trim();
    const sequence = ++searchSequence;
    results.replaceChildren();
    results.textContent = 'Buscando produtos...';
    try {
      const products = await window.produtosAPI.getProdutos(term ? { termo: term } : {});
      if (sequence !== searchSequence) return;
      results.replaceChildren();
      const available = (Array.isArray(products) ? products : []).filter(product => product.ativo !== false);
      if (!available.length) { searchStatus.textContent = 'Nenhum produto encontrado.'; return; }
      if (selectExact) {
        const exact = available.find(product =>
          String(product.codigo || '').trim().toLowerCase() === term.toLowerCase() ||
          String(product.codigoBarras || '').trim() === term
        );
        if (exact) chooseProduct(exact);
        else searchStatus.textContent = 'Código exato não encontrado. Escolha um produto da lista.';
      }
      searchStatus.textContent ||= `${Math.min(available.length, 40)} produto(s) exibido(s)${available.length > 40 ? ' — refine a busca para ver mais' : ''}.`;
      available.slice(0, 40).forEach(product => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'consult-result';
        const details = document.createElement('span');
        const name = document.createElement('strong');
        const code = document.createElement('small');
        const price = document.createElement('span');
        name.textContent = product.nome;
        code.textContent = `${product.codigo || 'Sem código'}${product.codigoBarras ? ` · Barras: ${product.codigoBarras}` : ''}`;
        price.className = 'price';
        price.textContent = money(product.precoVenda);
        details.append(name, code);
        const stockBadge = document.createElement('span');
        const availableStock = stock(product);
        stockBadge.className = `consult-stock-badge ${availableStock > 0 ? 'is-available' : 'is-empty'}`;
        stockBadge.textContent = availableStock > 0 ? `${availableStock} disponível` : 'Sem estoque';
        const aside = document.createElement('span');
        aside.className = 'consult-result-aside';
        aside.append(price, stockBadge);
        button.append(details, aside);
        button.addEventListener('click', () => chooseProduct(product));
        results.appendChild(button);
      });
    } catch (error) {
      if (sequence === searchSequence) searchStatus.textContent = `Não foi possível consultar os produtos: ${error.message}`;
    }
  };

  queryInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchSequence++;
    searchStatus.textContent = '';
    selectedProduct = null;
    selectedDetails.hidden = true;
    emptySelection.hidden = false;
    quantityInput.disabled = false;
    quantityInput.value = '1';
    statusEl.classList.remove('is-error');
    statusEl.textContent = '';
    results.replaceChildren();
    searchTimer = setTimeout(() => search(), 180);
  });
  queryInput.addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    clearTimeout(searchTimer);
    if (!queryInput.value.trim()) return;
    search(true);
  });
  document.getElementById('lookupBarcode').addEventListener('click', () => {
    clearTimeout(searchTimer);
    if (!queryInput.value.trim()) {
      searchStatus.textContent = 'Informe um código de produto ou código de barras.';
      queryInput.focus();
      return;
    }
    searchStatus.textContent = '';
    search(true);
  });
  document.getElementById('refreshProducts').addEventListener('click', () => {
    searchStatus.textContent = '';
    search();
  });
  quantityInput.addEventListener('input', updateSubtotal);
  goButton.addEventListener('click', () => {
    if (!selectedProduct || goButton.disabled) return;
    const params = new URLSearchParams({ produto: selectedProduct._id, quantidade: quantityInput.value });
    window.location.href = `vendas.html?${params}`;
  });
  document.getElementById('backBtn').addEventListener('click', () => { window.location.href = 'main.html'; });
  const user = await window.authAPI.getCurrentUser();
  if (!user) { window.location.href = 'login.html'; return; }
  await search();
  queryInput.focus();
});
