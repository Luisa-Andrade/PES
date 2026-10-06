document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const state = { client: null, preSale: null, items: [], quote: null };
  const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const formatDate = value => value && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toLocaleString('pt-BR') : '—';
  const paymentLabels = { dinheiro: 'Dinheiro', pix: 'PIX', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito', fiado: 'Fiado' };
  const statusLabels = {
    NOVO: 'Novo', PREPARANDO: 'Preparando', PRONTO_PARA_ENTREGA: 'Pronto para entrega',
    SAIU_PARA_ENTREGA: 'Saiu para entrega', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado'
  };
  let cepLookupSequence = 0;
  let cepLookupTimer = null;
  const nextStatuses = {
    NOVO: ['PREPARANDO', 'CANCELADO'], PREPARANDO: ['PRONTO_PARA_ENTREGA', 'CANCELADO'],
    PRONTO_PARA_ENTREGA: ['SAIU_PARA_ENTREGA', 'CANCELADO'], SAIU_PARA_ENTREGA: ['ENTREGUE'],
    ENTREGUE: [], CANCELADO: []
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
  const debounce = (fn, delay = 300) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; };
  const formatCep = value => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 8);
    return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  };

  function showMessage(text, type = 'error') {
    const element = $('message');
    element.textContent = text;
    element.className = `message show ${type}`;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => element.classList.remove('show'), 6000);
  }

  function getAddress() {
    return {
      logradouro: $('logradouro').value.trim(), numero: $('numero').value.trim(), complemento: $('complemento').value.trim(),
      bairro: $('bairro').value.trim(), cidade: $('cidade').value.trim(), estado: $('estado').value.trim(),
      cep: $('cep').value.trim(), pontoReferencia: $('referencia').value.trim()
    };
  }

  function invalidateQuote() {
    state.quote = null;
    renderSummary();
  }

  function setCepStatus(message, type = '') {
    const status = $('cepStatus');
    status.textContent = message;
    status.className = `field-help${type ? ` is-${type}` : ''}`;
  }

  async function lookupCep(cep, sequence) {
    if (sequence !== cepLookupSequence || cep.length !== 8) return;
    setCepStatus('Buscando endereço…', 'loading');
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      if (!response.ok) throw new Error('Serviço de CEP indisponível.');
      const address = await response.json();
      if (sequence !== cepLookupSequence) return;
      if (address.erro) {
        setCepStatus('CEP não encontrado. Confira os números ou preencha o endereço manualmente.', 'error');
        return;
      }
      $('logradouro').value = address.logradouro || '';
      $('bairro').value = address.bairro || '';
      $('cidade').value = address.localidade || '';
      $('estado').value = (address.uf || '').toUpperCase();
      setCepStatus('Endereço preenchido. Confira e informe o número.', 'success');
      invalidateQuote();
    } catch (error) {
      if (sequence !== cepLookupSequence) return;
      setCepStatus('Não foi possível buscar o CEP. Você pode preencher o endereço manualmente.', 'error');
    }
  }

  function subtotal() {
    return Math.round(state.items.reduce((sum, item) => sum + item.quantidade * item.precoUnitario, 0) * 100) / 100;
  }

  function renderSummary() {
    const sub = subtotal();
    $('subtotal').textContent = money(sub);
    $('distance').textContent = state.quote ? `${Number(state.quote.distanceKm).toLocaleString('pt-BR')} km` : '—';
    $('deliveryFee').textContent = state.quote ? money(state.quote.deliveryFee) : '—';
    $('total').textContent = money(sub + (state.quote?.deliveryFee || 0));
  }

  function renderItems() {
    if (!state.items.length) {
      $('itemsBody').innerHTML = '<tr><td colspan="5" class="empty">Nenhum produto adicionado.</td></tr>';
      renderSummary();
      return;
    }
    $('itemsBody').innerHTML = state.items.map((item, index) => `
      <tr>
        <td><strong>${escapeHtml(item.nome)}</strong><br><small>${escapeHtml(item.codigo || '')}${item.fromPreSale ? ' · Da pré-venda' : `${state.preSale ? ' · Adicionado na entrega' : ''} · Estoque: ${item.estoque}`}</small>${!item.fromPreSale && item.exigeReceita ? `<label class="receipt-confirm"><input type="checkbox" data-receipt="${index}" ${item.receitaApresentada ? 'checked' : ''}> Receita apresentada</label>` : ''}</td>
        <td><input class="qty-input" type="number" min="1" ${item.fromPreSale ? '' : `max="${item.estoque}"`} step="1" inputmode="numeric" value="${item.quantidade}" data-quantity="${index}"></td>
        <td>${money(item.precoUnitario)}</td><td>${money(item.quantidade * item.precoUnitario)}</td>
        <td><button class="btn btn-danger" data-remove="${index}">Remover</button></td>
      </tr>`).join('');
    document.querySelectorAll('[data-quantity]').forEach(input => {
      input.addEventListener('keydown', event => {
        if (['.', ',', 'e', 'E', '+', '-'].includes(event.key)) event.preventDefault();
      });
      input.addEventListener('change', event => {
        const index = Number(event.target.dataset.quantity);
        const value = Number(event.target.value);
        const item = state.items[index];
        if (!Number.isSafeInteger(value) || value < 1 || (!item.fromPreSale && value > item.estoque)) {
          showMessage(item.fromPreSale ? 'Informe uma quantidade inteira maior que zero.' :
            `Informe uma quantidade inteira entre 1 e ${Math.floor(item.estoque)}.`);
          event.target.value = state.items[index].quantidade;
          return;
        }
        state.items[index].quantidade = value;
        renderItems();
      });
    });
    document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', event => {
      state.items.splice(Number(event.target.dataset.remove), 1);
      renderItems();
    }));
    document.querySelectorAll('[data-receipt]').forEach(input => input.addEventListener('change', event => {
      state.items[Number(event.target.dataset.receipt)].receitaApresentada = event.target.checked;
    }));
    renderSummary();
  }

  async function searchClients(term) {
    const box = $('clientSuggestions');
    if (!term.trim()) { box.classList.remove('open'); return; }
    try {
      const clients = (await window.clientesAPI.getClientes(term)).filter(client => client.ativo !== false);
      box.innerHTML = clients.length ? clients.map(client => `<div class="suggestion" data-client-id="${client._id}"><strong>${escapeHtml(client.nome)}</strong><small>${escapeHtml(client.cpfCnpj || '')} ${escapeHtml(client.telefone || '')}</small></div>`).join('') : '<div class="suggestion">Nenhum cliente encontrado.</div>';
      box.classList.add('open');
      box.querySelectorAll('[data-client-id]').forEach(item => item.addEventListener('click', () => selectClient(item.dataset.clientId)));
    } catch (error) { showMessage(`Erro ao buscar clientes: ${error.message}`); }
  }

  async function selectClient(id, preloadedClient = null, options = {}) {
    clearTimeout(cepLookupTimer);
    cepLookupSequence += 1;
    try {
      $('clientSearch').disabled = true;
      const result = preloadedClient ? { success: true, cliente: preloadedClient } : await window.deliveryAPI.getCliente(id);
      if (!result?.success || !result.cliente) throw new Error(result?.message || 'Cliente não encontrado.');
      const client = result.cliente;
      state.client = client;
      $('clientSearch').value = client.nome;
      $('clientSuggestions').classList.remove('open');
      $('selectedClient').style.display = 'block';
      const clientDocument = client.cpfCnpjFormatado || client.cpfCnpj || '';
      $('selectedClient').textContent = `${client.nome}${clientDocument ? ` · ${clientDocument}` : ''}`;
      $('telefone').value = client.celularFormatado || client.telefoneFormatado || client.celular || client.telefone || '';
      ['logradouro','numero','complemento','bairro','cidade','estado','cep','referencia'].forEach(field => { $(field).value = ''; });
      setCepStatus('Digite o CEP para preencher o endereço automaticamente.');
      const address = client.enderecos?.find(item => item.principal) || client.enderecos?.[0];
      if (address) {
        $('logradouro').value = address.logradouro || '';
        $('numero').value = address.numero || '';
        $('complemento').value = address.complemento || '';
        $('bairro').value = address.bairro || '';
        $('cidade').value = address.cidade || '';
        $('estado').value = address.estado || '';
        $('cep').value = formatCep(address.cep);
        setCepStatus('Endereço carregado do cadastro do cliente.', 'success');
      } else setCepStatus('Cliente sem endereço cadastrado. Digite o CEP para preencher os campos.');
      invalidateQuote();
      if (!options.skipPreSaleSync) {
        const preSales = await loadPreSales();
        const related = preSales.find(preSale =>
          String(preSale.cliente || '') === String(client._id) &&
          preSale.itens.length > 0 && preSale.itens.every(item => item.produto && Number.isSafeInteger(Number(item.quantidade)) && Number(item.quantidade) > 0)
        );
        if (related && state.preSale?.codigo !== related.codigo) await selectPreSale(related.codigo);
      }
      return client;
    } catch (error) {
      state.client = null;
      $('selectedClient').style.display = 'none';
      showMessage(`Erro ao carregar cliente: ${error.message}`);
      return null;
    } finally {
      $('clientSearch').disabled = Boolean(state.preSale?.cliente);
      if (!$('clientSearch').disabled) $('clientSearch').focus();
    }
  }

  async function loadPreSales() {
    const select = $('preSaleSelect');
    const refresh = $('refreshPreSalesBtn');
    refresh.disabled = true;
    try {
      const preSales = await window.preVendasAPI.listar();
      select.replaceChildren(new Option('Montar pedido sem pré-venda', ''));
      preSales.forEach(preSale => {
        const validProducts = preSale.itens.every(item => item.produto);
        const validQuantities = preSale.itens.every(item => Number.isSafeInteger(Number(item.quantidade)) && Number(item.quantidade) > 0);
        const ready = preSale.itens.length > 0 && validProducts && validQuantities;
        const suffix = !preSale.itens.length ? ' · sem produtos' : !validProducts ? ' · produto inválido' : !validQuantities ? ' · quantidade inválida' : !preSale.cliente ? ' · escolha cliente' : '';
        const option = new Option(`${preSale.codigo} · ${preSale.nomeCliente} · ${preSale.itens.length} produto(s)${suffix}`, preSale.codigo);
        option.disabled = !ready;
        select.add(option);
      });
      if (state.preSale) select.value = state.preSale.codigo;
      return preSales;
    } catch (error) {
      showMessage(`Não foi possível carregar as pré-vendas: ${error.message}`);
      return [];
    } finally {
      refresh.disabled = false;
    }
  }

  async function selectPreSale(code) {
    const previousCode = state.preSale?.codigo || '';
    const changedReserved = state.items.some(item => item.fromPreSale && item.quantidade !== item.originalQuantity) ||
      (state.preSale && state.items.filter(item => item.fromPreSale).length !== state.preSale.itens.length);
    if (code !== previousCode && changedReserved && !window.confirm('Descartar as alterações dos produtos da pré-venda atual?')) {
      $('preSaleSelect').value = previousCode;
      return;
    }
    if (!code) {
      state.preSale = null;
      state.items = state.items.filter(item => !item.fromPreSale);
      $('clientSearch').disabled = false;
      renderItems();
      return;
    }
    $('preSaleSelect').disabled = true;
    try {
      const preSale = await window.preVendasAPI.abrir(code);
      if (!preSale.itens.length) throw new Error('A pré-venda precisa ter produtos para entrega.');
      if (preSale.itens.some(item => !item.produto)) throw new Error('Esta pré-venda contém um produto inválido. Corrija-a em Vendas.');
      if (preSale.itens.some(item => !Number.isSafeInteger(Number(item.quantidade)) || Number(item.quantidade) < 1)) {
        throw new Error('Esta pré-venda contém quantidade fracionada. Corrija-a em Vendas.');
      }
      if (preSale.cliente && String(state.client?._id) !== String(preSale.cliente)) {
        const result = await window.deliveryAPI.getCliente(preSale.cliente);
        if (!result?.success || !result.cliente) throw new Error('O cliente da pré-venda não está disponível.');
        const client = await selectClient(preSale.cliente, result.cliente, { skipPreSaleSync: true });
        if (!client) throw new Error('O cliente da pré-venda não está disponível.');
      }
      state.preSale = preSale;
      state.items = [...preSale.itens.map(item => ({
        produto: item.produto, nome: item.nomeProduto, codigo: item.codigoProduto,
        quantidade: Number(item.quantidade), originalQuantity: Number(item.quantidade),
        precoUnitario: Number(item.precoUnitario), fromPreSale: true
      })), ...state.items.filter(item => !item.fromPreSale)];
      $('clientSearch').disabled = Boolean(preSale.cliente);
      renderItems();
    } catch (error) {
      $('preSaleSelect').value = previousCode;
      showMessage(error.message);
    } finally {
      $('preSaleSelect').disabled = false;
    }
  }

  async function searchProducts(term) {
    const box = $('productSuggestions');
    if (!term.trim() || term !== $('productSearch').value) { box.classList.remove('open'); return; }
    try {
      const products = (await window.produtosAPI.getProdutos({ termo: term })).filter(product => product.ativo !== false);
      if (term !== $('productSearch').value) return;
      box.innerHTML = products.length ? products.slice(0, 30).map(product => `<div class="suggestion" data-product-id="${product._id}"><strong>${escapeHtml(product.nome)}</strong><small>${escapeHtml(product.codigo || product.codigoBarras || '')} · ${money(product.precoVenda || product.preco)} · Estoque: ${product.estoque}</small></div>`).join('') : '<div class="suggestion">Nenhum produto encontrado.</div>';
      box.classList.add('open');
      box.querySelectorAll('[data-product-id]').forEach(item => item.addEventListener('click', () => {
        const product = products.find(candidate => candidate._id === item.dataset.productId);
        if (addProduct(product)) {
          $('productSearch').focus();
        }
      }));
    } catch (error) { showMessage(`Erro ao buscar produtos: ${error.message}`); }
  }

  const searchProductsDebounced = debounce(searchProducts);

  function addProduct(product) {
    if (!product) { showMessage('Selecione um produto para adicionar.'); return false; }
    const existing = state.items.find(item => !item.fromPreSale && item.produto === product._id);
    const finalQuantity = 1 + (existing?.quantidade || 0);
    if (finalQuantity > product.estoque) { showMessage(`Estoque insuficiente. Disponível: ${product.estoque}.`); return false; }
    if (existing) existing.quantidade = finalQuantity;
    else state.items.push({
      produto: product._id, nome: product.nome, codigo: product.codigo || product.codigoBarras,
      estoque: Number(product.estoque), quantidade: 1, precoUnitario: Number(product.precoVenda || product.preco || 0),
      exigeReceita: Boolean(product.exigeReceita), receitaApresentada: false
    });
    $('productSearch').value = '';
    $('productSuggestions').classList.remove('open');
    renderItems();
    return true;
  }

  async function addByBarcode() {
    const input = $('productSearch');
    const code = input.value.trim();
    if (!code) { showMessage('Leia ou digite um código de barras.'); return; }
    input.disabled = true;
    $('barcodeAddBtn').disabled = true;
    try {
      const products = (await window.produtosAPI.getProdutos({ termo: code })).filter(product => product.ativo !== false);
      const exact = products.filter(product =>
        String(product.codigoBarras || '').trim() === code ||
        String(product.codigo || '').trim().toUpperCase() === code.toUpperCase()
      );
      if (!exact.length) throw new Error(`Código ${code} não encontrado no cadastro.`);
      if (exact.length > 1) throw new Error(`Há mais de um produto com o código ${code}. Selecione pela busca de produtos.`);
      addProduct(exact[0]);
    } catch (error) {
      showMessage(error.message || 'Não foi possível ler o código.');
    } finally {
      input.disabled = false;
      $('barcodeAddBtn').disabled = false;
      input.focus();
    }
  }

  async function calculateDelivery() {
    const button = $('calculateBtn');
    button.disabled = true;
    button.textContent = 'Calculando...';
    try {
      const result = await window.deliveryAPI.calcularEntrega(getAddress());
      if (!result.success) throw new Error(result.message);
      state.quote = { distanceKm: result.distanceKm, deliveryFee: result.deliveryFee };
      renderSummary();
      return true;
    } catch (error) {
      invalidateQuote();
      showMessage(error.message || 'Não foi possível calcular a entrega.');
      return false;
    } finally { button.disabled = false; button.textContent = 'Calcular entrega'; }
  }

  function resetForm() {
    state.client = null; state.preSale = null; state.items = []; state.quote = null;
    clearTimeout(cepLookupTimer);
    cepLookupSequence += 1;
    document.querySelectorAll('#newOrder input, #newOrder textarea').forEach(input => input.value = '');
    $('payment').value = ''; $('changeField').hidden = true;
    $('selectedClient').style.display = 'none';
    $('clientSearch').disabled = false;
    $('preSaleSelect').value = '';
    setCepStatus('Digite o CEP para preencher o endereço automaticamente.');
    renderItems();
  }

  async function submitOrder() {
    if (!state.client) return showMessage('Selecione um cliente existente.');
    if (!state.items.length) return showMessage('Adicione ao menos um produto.');
    if (!$('payment').value) return showMessage('Selecione a forma de pagamento.');
    const button = $('submitOrderBtn'); button.disabled = true; button.textContent = 'Confirmando...';
    try {
      const result = await window.deliveryAPI.criarPedido({
        cliente: state.client._id, endereco:getAddress(), telefone:$('telefone').value,
        itens: state.preSale ? [] : state.items.map(item => ({ produto:item.produto, quantidade:item.quantidade, receitaApresentada:item.receitaApresentada === true })),
        itensAdicionais: state.preSale
          ? state.items.filter(item => !item.fromPreSale).map(item => ({ produto:item.produto, quantidade:item.quantidade, receitaApresentada:item.receitaApresentada === true }))
          : [],
        itensPreVenda: state.preSale
          ? state.items.filter(item => item.fromPreSale).map(item => ({ produto:item.produto, quantidade:item.quantidade }))
          : undefined,
        preVendaCodigo: state.preSale?.codigo, preVendaVersao: state.preSale?.versao,
        formaPagamento:$('payment').value, trocoPara:$('changeFor').value,
        motoboy:$('motoboy').value, observacoes:$('notes').value
      });
      if (!result.success) throw new Error(result.message);
      showMessage(`Pedido ${result.pedido?.codigo || ''} confirmado e integrado à venda ${result.venda.codigo}.${result.preVendaCodigo ? ` Pré-venda ${result.preVendaCodigo} finalizada.` : ''}`, 'success');
      resetForm(); await Promise.all([loadOrders(), loadPreSales()]);
    } catch (error) { showMessage(error.message || 'Não foi possível confirmar o pedido.'); }
    finally { button.disabled = false; button.textContent = 'Confirmar pedido'; }
  }

  function currentFilters() {
    return { numero:$('filterNumber').value.trim(), cliente:$('filterClient').value.trim(), data:$('filterDate').value, status:$('filterStatus').value, motoboy:$('filterCourier').value.trim() };
  }

  let ordersRequest = 0;
  async function loadOrders() {
    const request = ++ordersRequest;
    $('ordersBody').innerHTML = '<tr><td colspan="8" class="empty">Carregando pedidos...</td></tr>';
    try {
      const result = await window.deliveryAPI.listarPedidos(currentFilters());
      if (request !== ordersRequest) return;
      if (!result.success) throw new Error(result.message);
      if (!result.pedidos.length) { $('ordersBody').innerHTML = '<tr><td colspan="8" class="empty">Nenhum pedido encontrado.</td></tr>'; return; }
      $('ordersBody').innerHTML = result.pedidos.map(order => `
        <tr><td>#${escapeHtml(order.codigo)}</td><td>${escapeHtml(order.cliente?.nome || order.nomeCliente)}</td>
        <td>${formatDate(order.criadoEm || order.dataAgendamento)}</td><td>${money(order.total)}</td>
        <td>${Number(order.distanciaKm || 0).toLocaleString('pt-BR')} km</td><td>${escapeHtml(order.motoboy || '—')}</td>
        <td><span class="status ${order.status}">${escapeHtml(statusLabels[order.status] || order.status)}</span></td>
        <td><button class="btn btn-secondary" data-details="${order._id}">Detalhes</button></td></tr>`).join('');
      document.querySelectorAll('[data-details]').forEach(button => button.addEventListener('click', () => openDetails(button.dataset.details)));
    } catch (error) { if (request !== ordersRequest) return; $('ordersBody').innerHTML = '<tr><td colspan="8" class="empty">Falha ao carregar pedidos.</td></tr>'; showMessage(error.message); }
  }

  async function openDetails(id) {
    try {
      const result = await window.deliveryAPI.getPedido(id);
      if (!result.success) throw new Error(result.message);
      const order = result.pedido;
      const address = order.endereco || {};
      const options = (nextStatuses[order.status] || []).map(status => `<option value="${status}">${statusLabels[status]}</option>`).join('');
      const items = order.itens || [];
      const addressLine = [address.logradouro, address.numero, address.complemento].filter(Boolean).join(', ');
      const addressArea = [address.bairro, address.cidade, address.estado].filter(Boolean).join(' · ');
      const phone = order.telefone || order.cliente?.celular || order.cliente?.telefone || '—';
      const payment = order.formaPagamento || order.venda?.pagamento?.metodo;
      const history = Array.isArray(order.historicoStatus) ? [...order.historicoStatus].reverse().slice(0, 4) : [];
      $('detailsBody').innerHTML = `
        <div class="details-hero">
          <div><span class="details-overline">Pedido de entrega</span><strong class="details-code">#${escapeHtml(order.codigo)}</strong><span class="details-date">Criado em ${formatDate(order.criadoEm || order.dataAgendamento)}</span></div>
          <span class="status ${escapeHtml(order.status)}">${escapeHtml(statusLabels[order.status] || order.status)}</span>
        </div>
        <div class="details-feedback" id="detailsFeedback" role="alert" hidden></div>
        <div class="details-grid">
          <section class="details-section"><h3>Cliente</h3><dl class="details-facts">
            <div><dt>Nome</dt><dd>${escapeHtml(order.cliente?.nome || order.nomeCliente || '—')}</dd></div>
            <div><dt>Telefone</dt><dd>${escapeHtml(phone)}</dd></div>
            ${order.venda?.preVendaCodigo ? `<div><dt>Pré-venda</dt><dd>${escapeHtml(order.venda.preVendaCodigo)}</dd></div>` : ''}
          </dl></section>
          <section class="details-section"><h3>Endereço de entrega</h3><div class="details-address"><strong>${escapeHtml(addressLine || 'Endereço não informado')}</strong><span>${escapeHtml(addressArea || '—')}</span><span>CEP ${escapeHtml(address.cep || '—')}</span>${address.pontoReferencia ? `<span>Referência: ${escapeHtml(address.pontoReferencia)}</span>` : ''}</div></section>
        </div>
        <section class="details-section details-products"><div class="details-section-title"><h3>Produtos</h3><span>${items.length} ${items.length === 1 ? 'item' : 'itens'}</span></div>
          <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Valor unitário</th><th>Subtotal</th></tr></thead><tbody>
            ${items.map(item => `<tr><td><strong>${escapeHtml(item.nomeProduto || item.produto?.nome || 'Produto')}</strong>${item.codigoProduto ? `<small>${escapeHtml(item.codigoProduto)}</small>` : ''}</td><td>${escapeHtml(item.quantidade)}</td><td>${money(item.valorUnitario)}</td><td>${money(item.subtotal)}</td></tr>`).join('')}
          </tbody></table></div>
        </section>
        <div class="details-grid details-bottom">
          <section class="details-section"><h3>Pagamento</h3><dl class="details-facts"><div><dt>Forma de pagamento</dt><dd>${escapeHtml(paymentLabels[payment] || payment || '—')}</dd></div><div><dt>Distância</dt><dd>${Number(order.distanciaKm || 0).toLocaleString('pt-BR')} km</dd></div></dl>
            <div class="details-totals"><div><span>Produtos</span><strong>${money(order.subtotal)}</strong></div><div><span>Taxa de entrega</span><strong>${money(order.valorFrete)}</strong></div><div class="details-grand-total"><span>Total</span><strong>${money(order.total)}</strong></div></div>
          </section>
          <section class="details-section"><h3>Andamento</h3>
            ${options ? `<div class="detail-status-controls"><label for="detailCourier">Motoboy<input id="detailCourier" value="${escapeHtml(order.motoboy || '')}" placeholder="Nome do motoboy"></label><label for="detailStatus">Próximo status<select id="detailStatus"><option value="">Selecione</option>${options}</select></label><button class="btn btn-primary" id="updateStatusBtn" type="button">Atualizar status</button></div>` : `<div class="details-facts"><div><dt>Motoboy</dt><dd>${escapeHtml(order.motoboy || '—')}</dd></div></div>`}
            ${history.length ? `<ol class="details-history">${history.map(entry => `<li><span>${escapeHtml(statusLabels[entry.status] || entry.status || 'Atualização')}</span><time>${formatDate(entry.data)}</time></li>`).join('')}</ol>` : ''}
          </section>
        </div>
        ${order.observacoes ? `<section class="details-section details-notes"><h3>Observações</h3><p>${escapeHtml(order.observacoes)}</p></section>` : ''}`;
      if (options) $('updateStatusBtn').addEventListener('click', () => updateStatus(order._id));
      $('detailsModal').classList.add('open');
      $('closeModal').focus();
    } catch (error) { showMessage(error.message); }
  }

  async function updateStatus(id) {
    const status = $('detailStatus').value;
    const feedback = $('detailsFeedback');
    if (!status) { feedback.textContent = 'Selecione o próximo status.'; feedback.hidden = false; return; }
    if (status === 'CANCELADO' && !window.confirm('Cancelar este pedido e devolver os itens ao estoque?')) return;
    const button = $('updateStatusBtn');
    button.disabled = true;
    feedback.hidden = true;
    try {
      const result = await window.deliveryAPI.atualizarStatus(id, status, $('detailCourier').value);
      if (!result.success) throw new Error(result.message);
      $('detailsModal').classList.remove('open');
      showMessage(status === 'CANCELADO' ? 'Pedido cancelado e estoque restaurado.' : 'Status atualizado.', 'success');
      await loadOrders();
    } catch (error) {
      feedback.textContent = error.message || 'Não foi possível atualizar o pedido.';
      feedback.hidden = false;
    } finally {
      button.disabled = false;
    }
  }

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab,.tab-panel').forEach(element => element.classList.remove('active'));
    tab.classList.add('active'); $(tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'orders') loadOrders();
  }));
  $('backBtn').addEventListener('click', () => { window.location.href = 'main.html'; });
  $('clientSearch').addEventListener('input', debounce(event => { state.client = null; $('selectedClient').style.display = 'none'; searchClients(event.target.value); }));
  $('productSearch').addEventListener('input', event => {
    searchProductsDebounced(event.target.value);
  });
  $('preSaleSelect').addEventListener('change', event => selectPreSale(event.target.value));
  $('refreshPreSalesBtn').addEventListener('click', loadPreSales);
  $('productSearch').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.code === 'NumpadEnter') { event.preventDefault(); addByBarcode(); }
  });
  $('barcodeAddBtn').addEventListener('click', addByBarcode);
  $('barcodeReaderBtn').addEventListener('click', () => {
    $('productSearch').focus();
  });
  ['logradouro','numero','complemento','bairro','cidade','estado','referencia'].forEach(id => $(id).addEventListener('input', event => {
    if (['logradouro','bairro','cidade','estado'].includes(event.currentTarget.id)) {
      cepLookupSequence += 1;
      setCepStatus('Endereço editado manualmente.');
    }
    invalidateQuote();
  }));
  $('cep').addEventListener('input', event => {
    const cep = event.target.value.replace(/\D/g, '').slice(0, 8);
    event.target.value = formatCep(cep);
    clearTimeout(cepLookupTimer);
    const sequence = ++cepLookupSequence;
    invalidateQuote();
    if (cep.length < 8) {
      setCepStatus(cep.length ? 'Digite os 8 números do CEP para buscar o endereço.' : 'Digite o CEP para preencher o endereço automaticamente.');
      return;
    }
    cepLookupTimer = setTimeout(() => lookupCep(cep, sequence), 250);
  });
  $('calculateBtn').addEventListener('click', calculateDelivery);
  $('submitOrderBtn').addEventListener('click', submitOrder);
  $('clearBtn').addEventListener('click', resetForm);
  $('payment').addEventListener('change', event => { $('changeField').hidden = event.target.value !== 'dinheiro'; if (event.target.value !== 'dinheiro') $('changeFor').value = ''; });
  $('orderFilters').addEventListener('submit', event => { event.preventDefault(); loadOrders(); });
  $('resetFiltersBtn').addEventListener('click', () => { $('orderFilters').reset(); loadOrders(); });
  $('closeModal').addEventListener('click', () => $('detailsModal').classList.remove('open'));
  $('detailsModal').addEventListener('click', event => { if (event.target === $('detailsModal')) $('detailsModal').classList.remove('open'); });
  document.addEventListener('click', event => { if (!event.target.closest('#clientSearch,#clientSuggestions')) $('clientSuggestions').classList.remove('open'); if (!event.target.closest('#productSearch,#productSuggestions')) $('productSuggestions').classList.remove('open'); });

  const user = await window.authAPI.getCurrentUser();
  if (!user) { window.location.href = 'login.html'; return; }
  renderItems();
  loadOrders();
  loadPreSales();
});
