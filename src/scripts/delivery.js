document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const state = { client: null, selectedProduct: null, items: [], quote: null };
  const money = value => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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
        <td><strong>${escapeHtml(item.nome)}</strong><br><small>${escapeHtml(item.codigo || '')} · Estoque: ${item.estoque}</small></td>
        <td><input class="qty-input" type="number" min="0.01" max="${item.estoque}" step="0.01" value="${item.quantidade}" data-quantity="${index}"></td>
        <td>${money(item.precoUnitario)}</td><td>${money(item.quantidade * item.precoUnitario)}</td>
        <td><button class="btn btn-danger" data-remove="${index}">Remover</button></td>
      </tr>`).join('');
    document.querySelectorAll('[data-quantity]').forEach(input => input.addEventListener('change', event => {
      const index = Number(event.target.dataset.quantity);
      const value = Number(event.target.value);
      if (!Number.isFinite(value) || value <= 0 || value > state.items[index].estoque) {
        showMessage(`Informe uma quantidade entre 0,01 e ${state.items[index].estoque}.`);
        event.target.value = state.items[index].quantidade;
        return;
      }
      state.items[index].quantidade = value;
      renderItems();
    }));
    document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', event => {
      state.items.splice(Number(event.target.dataset.remove), 1);
      renderItems();
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

  async function selectClient(id) {
    clearTimeout(cepLookupTimer);
    cepLookupSequence += 1;
    try {
      $('clientSearch').disabled = true;
      const result = await window.deliveryAPI.getCliente(id);
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
    } catch (error) {
      state.client = null;
      $('selectedClient').style.display = 'none';
      showMessage(`Erro ao carregar cliente: ${error.message}`);
    } finally {
      $('clientSearch').disabled = false;
      $('clientSearch').focus();
    }
  }

  async function searchProducts(term) {
    const box = $('productSuggestions');
    if (!term.trim()) { box.classList.remove('open'); return; }
    try {
      const products = (await window.produtosAPI.getProdutos({ termo: term })).filter(product => product.ativo !== false);
      box.innerHTML = products.length ? products.slice(0, 30).map(product => `<div class="suggestion" data-product-id="${product._id}"><strong>${escapeHtml(product.nome)}</strong><small>${escapeHtml(product.codigo || product.codigoBarras || '')} · ${money(product.precoVenda || product.preco)} · Estoque: ${product.estoque}</small></div>`).join('') : '<div class="suggestion">Nenhum produto encontrado.</div>';
      box.classList.add('open');
      box.querySelectorAll('[data-product-id]').forEach(item => item.addEventListener('click', () => {
        state.selectedProduct = products.find(product => product._id === item.dataset.productId);
        $('productSearch').value = state.selectedProduct.nome;
        $('productSuggestions').classList.remove('open');
        $('addProductBtn').disabled = false;
      }));
    } catch (error) { showMessage(`Erro ao buscar produtos: ${error.message}`); }
  }

  function addProduct() {
    const product = state.selectedProduct;
    const quantity = Number($('productQuantity').value);
    if (!product || !Number.isFinite(quantity) || quantity <= 0) return showMessage('Selecione um produto e informe uma quantidade válida.');
    const existing = state.items.find(item => item.produto === product._id);
    const finalQuantity = quantity + (existing?.quantidade || 0);
    if (finalQuantity > product.estoque) return showMessage(`Estoque insuficiente. Disponível: ${product.estoque}.`);
    if (existing) existing.quantidade = finalQuantity;
    else state.items.push({ produto:product._id, nome:product.nome, codigo:product.codigo || product.codigoBarras, estoque:Number(product.estoque), quantidade:quantity, precoUnitario:Number(product.precoVenda || product.preco || 0) });
    state.selectedProduct = null;
    $('productSearch').value = '';
    $('productQuantity').value = 1;
    $('addProductBtn').disabled = true;
    renderItems();
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
    state.client = null; state.selectedProduct = null; state.items = []; state.quote = null;
    clearTimeout(cepLookupTimer);
    cepLookupSequence += 1;
    document.querySelectorAll('#newOrder input, #newOrder textarea').forEach(input => input.value = '');
    $('productQuantity').value = 1; $('payment').value = ''; $('changeField').hidden = true;
    $('selectedClient').style.display = 'none'; $('addProductBtn').disabled = true;
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
        itens:state.items.map(item => ({ produto:item.produto, quantidade:item.quantidade })),
        formaPagamento:$('payment').value, trocoPara:$('changeFor').value,
        motoboy:$('motoboy').value, observacoes:$('notes').value
      });
      if (!result.success) throw new Error(result.message);
      showMessage(`Pedido ${result.pedido?.codigo || ''} confirmado e integrado à venda ${result.venda.codigo}.`, 'success');
      resetForm(); await loadOrders();
    } catch (error) { showMessage(error.message || 'Não foi possível confirmar o pedido.'); }
    finally { button.disabled = false; button.textContent = 'Confirmar pedido'; }
  }

  function currentFilters() {
    return { numero:$('filterNumber').value, cliente:$('filterClient').value, data:$('filterDate').value, status:$('filterStatus').value, motoboy:$('filterCourier').value };
  }

  async function loadOrders() {
    $('ordersBody').innerHTML = '<tr><td colspan="8" class="empty">Carregando pedidos...</td></tr>';
    try {
      const result = await window.deliveryAPI.listarPedidos(currentFilters());
      if (!result.success) throw new Error(result.message);
      if (!result.pedidos.length) { $('ordersBody').innerHTML = '<tr><td colspan="8" class="empty">Nenhum pedido encontrado.</td></tr>'; return; }
      $('ordersBody').innerHTML = result.pedidos.map(order => `
        <tr><td>#${escapeHtml(order.codigo)}</td><td>${escapeHtml(order.cliente?.nome || order.nomeCliente)}</td>
        <td>${new Date(order.criadoEm || order.dataAgendamento).toLocaleString('pt-BR')}</td><td>${money(order.total)}</td>
        <td>${Number(order.distanciaKm || 0).toLocaleString('pt-BR')} km</td><td>${escapeHtml(order.motoboy || '—')}</td>
        <td><span class="status ${order.status}">${escapeHtml(statusLabels[order.status] || order.status)}</span></td>
        <td><button class="btn btn-secondary" data-details="${order._id}">Detalhes</button></td></tr>`).join('');
      document.querySelectorAll('[data-details]').forEach(button => button.addEventListener('click', () => openDetails(button.dataset.details)));
    } catch (error) { $('ordersBody').innerHTML = '<tr><td colspan="8" class="empty">Falha ao carregar pedidos.</td></tr>'; showMessage(error.message); }
  }

  async function openDetails(id) {
    try {
      const result = await window.deliveryAPI.getPedido(id);
      if (!result.success) throw new Error(result.message);
      const order = result.pedido;
      const address = order.endereco || {};
      const options = (nextStatuses[order.status] || []).map(status => `<option value="${status}">${statusLabels[status]}</option>`).join('');
      $('detailsBody').innerHTML = `
        <div class="form-grid">
          <div class="field"><label>Pedido</label><strong>#${escapeHtml(order.codigo)}</strong></div>
          <div class="field"><label>Data</label>${new Date(order.criadoEm || order.dataAgendamento).toLocaleString('pt-BR')}</div>
          <div class="field"><label>Status</label><span class="status ${order.status}">${escapeHtml(statusLabels[order.status] || order.status)}</span></div>
          <div class="field"><label>Cliente</label>${escapeHtml(order.cliente?.nome || order.nomeCliente)}</div>
          <div class="field"><label>Telefone</label>${escapeHtml(order.telefone || order.cliente?.celular || order.cliente?.telefone || '—')}</div>
          <div class="field wide"><label>Endereço</label>${escapeHtml([address.logradouro,address.numero,address.complemento,address.bairro,address.cidade,address.estado,address.cep].filter(Boolean).join(', '))}</div>
          <div class="field"><label>Distância</label>${Number(order.distanciaKm || 0).toLocaleString('pt-BR')} km</div>
          <div class="field"><label>Taxa</label>${money(order.valorFrete)}</div>
          <div class="field"><label>Subtotal</label>${money(order.subtotal)}</div>
          <div class="field"><label>Total</label><strong>${money(order.total)}</strong></div>
          <div class="field"><label>Pagamento</label>${escapeHtml(order.formaPagamento || order.venda?.pagamento?.metodo || '—')}</div>
          <div class="field"><label>Motoboy</label><input id="detailCourier" value="${escapeHtml(order.motoboy || '')}"></div>
          <div class="field full"><label>Observações</label>${escapeHtml(order.observacoes || '—')}</div>
        </div>
        <div class="table-wrap"><table><thead><tr><th>Produto</th><th>Quantidade</th><th>Valor unitário</th><th>Subtotal</th></tr></thead><tbody>
          ${(order.itens || []).map(item => `<tr><td>${escapeHtml(item.nomeProduto || item.produto?.nome)}</td><td>${item.quantidade}</td><td>${money(item.valorUnitario)}</td><td>${money(item.subtotal)}</td></tr>`).join('')}
        </tbody></table></div>
        ${options ? `<div class="actions"><select id="detailStatus" style="max-width:260px"><option value="">Próximo status</option>${options}</select><button class="btn btn-primary" id="updateStatusBtn">Atualizar status</button></div>` : ''}`;
      if (options) $('updateStatusBtn').addEventListener('click', () => updateStatus(order._id));
      $('detailsModal').classList.add('open');
    } catch (error) { showMessage(error.message); }
  }

  async function updateStatus(id) {
    const status = $('detailStatus').value;
    if (!status) return showMessage('Selecione o próximo status.');
    if (status === 'CANCELADO' && !window.confirm('Cancelar este pedido e devolver os itens ao estoque?')) return;
    const result = await window.deliveryAPI.atualizarStatus(id, status, $('detailCourier').value);
    if (!result.success) return showMessage(result.message);
    $('detailsModal').classList.remove('open');
    showMessage(status === 'CANCELADO' ? 'Pedido cancelado e estoque restaurado.' : 'Status atualizado.', 'success');
    await loadOrders();
  }

  document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    document.querySelectorAll('.tab,.tab-panel').forEach(element => element.classList.remove('active'));
    tab.classList.add('active'); $(tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'orders') loadOrders();
  }));
  $('backBtn').addEventListener('click', () => { window.location.href = 'main.html'; });
  $('clientSearch').addEventListener('input', debounce(event => { state.client = null; $('selectedClient').style.display = 'none'; searchClients(event.target.value); }));
  $('productSearch').addEventListener('input', debounce(event => { state.selectedProduct = null; $('addProductBtn').disabled = true; searchProducts(event.target.value); }));
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
  $('addProductBtn').addEventListener('click', addProduct);
  $('calculateBtn').addEventListener('click', calculateDelivery);
  $('submitOrderBtn').addEventListener('click', submitOrder);
  $('clearBtn').addEventListener('click', resetForm);
  $('payment').addEventListener('change', event => { $('changeField').hidden = event.target.value !== 'dinheiro'; if (event.target.value !== 'dinheiro') $('changeFor').value = ''; });
  $('filterBtn').addEventListener('click', loadOrders);
  $('resetFiltersBtn').addEventListener('click', () => { ['filterNumber','filterClient','filterDate','filterCourier'].forEach(id => $(id).value = ''); $('filterStatus').value = ''; loadOrders(); });
  $('closeModal').addEventListener('click', () => $('detailsModal').classList.remove('open'));
  $('detailsModal').addEventListener('click', event => { if (event.target === $('detailsModal')) $('detailsModal').classList.remove('open'); });
  document.addEventListener('click', event => { if (!event.target.closest('#clientSearch,#clientSuggestions')) $('clientSuggestions').classList.remove('open'); if (!event.target.closest('#productSearch,#productSuggestions')) $('productSuggestions').classList.remove('open'); });

  const user = await window.authAPI.getCurrentUser();
  if (!user) { window.location.href = 'login.html'; return; }
  renderItems();
  loadOrders();
});
