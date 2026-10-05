document.addEventListener('DOMContentLoaded', () => {
  // Função para forçar foco em input (workaround para problema do Electron)
  const forceFocusOnInput = (element, retries = 3) => {
    if (!element || retries <= 0) return;
    
    element.focus();
    
    // Verificar se o foco foi aplicado
    setTimeout(() => {
      if (document.activeElement !== element) {
        forceFocusOnInput(element, retries - 1);
      }
    }, 50);
  };
  
  // Função para resetar foco de todos os inputs
  const resetInputsFocus = () => {
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input[type="email"], input[type="password"], textarea');
    inputs.forEach(input => {
      if (!input.disabled && !input.readOnly) {
        input.style.pointerEvents = 'auto';
        input.tabIndex = 0;
      }
    });
  };
  
  // Elementos do DOM
  const productSearchInput = document.getElementById('productSearchInput');
  const productSearchResults = document.getElementById('productSearchResults');
  const productsGrid = document.getElementById('productsGrid');
  const cartItems = document.getElementById('cart-items');
  const subtotalEl = document.getElementById('subtotal');
  const discountEl = document.getElementById('discount');
  const totalEl = document.getElementById('total');
  const payBtn = document.getElementById('payBtn');
  const clearCartBtn = document.getElementById('clearCartBtn');
  const barcodeBtn = document.getElementById('barcodeBtn');
  const barcodeReaderBtn = document.getElementById('barcodeReaderBtn');
  const barcodeScannerModal = document.getElementById('barcodeScannerModal');
  const closeScannerBtn = document.getElementById('closeScannerBtn');
  const scannerStatus = document.getElementById('scannerStatus');
  const manualBarcodeInput = document.getElementById('manualBarcodeInput');
  const manualBarcodeBtn = document.getElementById('manualBarcodeBtn');
  const categoryBtns = document.querySelectorAll('.category-btn');
  const vendedorEl = document.getElementById('vendedor');
  const dataHoraEl = document.getElementById('data-hora');
  const btnVoltarMenu = document.getElementById('btn-voltar-menu');
  const preSaleCode = document.getElementById('preSaleCode');
  const preSaleList = document.getElementById('preSaleList');
  const preSaleStatus = document.getElementById('preSaleStatus');
  const openPreSaleBtn = document.getElementById('openPreSaleBtn');
  const savePreSaleBtn = document.getElementById('savePreSaleBtn');
  const cancelPreSaleBtn = document.getElementById('cancelPreSaleBtn');
  const newPreSaleBtn = document.getElementById('newPreSaleBtn');
  const refreshPreSalesBtn = document.getElementById('refreshPreSalesBtn');
  
  // Elementos do modal de pagamento
  const paymentModal = document.getElementById('paymentModal');
  const closePaymentModalBtns = paymentModal.querySelectorAll('.close-btn, .btn-cancel');
  const confirmPaymentBtn = paymentModal.querySelector('.btn-confirm');
  const modalTotalValue = document.getElementById('modalTotalValue');
  const paymentMethods = document.querySelectorAll('.payment-method');
  const valorRecebidoInput = document.getElementById('valorRecebido');
  const trocoInput = document.getElementById('troco');
  const dinheiroGroup = document.getElementById('dinheiroGroup');
  const trocoGroup = document.getElementById('trocoGroup');
  const parcelamentoGroup = document.getElementById('parcelamentoGroup');
  
  // Elementos do modal de cliente
  const clientModal = document.getElementById('clientModal');
  const changeClientBtn = document.getElementById('changeClientBtn');
  const clearClientBtn = document.getElementById('clearClientBtn');
  const closeClientModalBtns = clientModal.querySelectorAll('.close-btn, .btn-cancel');
  const clientSearchInput = document.getElementById('clientSearchInput');
  const searchClientBtn = document.getElementById('searchClientBtn');
  const clientList = document.getElementById('clientList');
  const newClientBtn = document.getElementById('newClientBtn');
  
  // Estado da aplicação
  let currentUser = null;
  let cart = [];
  let products = [];
  let selectedCategory = '';
  let currentClient = null;
  let currentPreSale = null;
  let pendingConsultationProduct = null;
  let preSaleDirty = false;
  let preSaleRevision = 0;
  let selectedPaymentMethod = null;
  let tempVenda = null;
  let updateCartTimeout = null; // Para debounce
  const canCheckout = () => ['caixa', 'gerencia'].includes(currentUser?.tipo);
  const canMarkPrescription = () => ['vendedor_balcao', 'caixa', 'gerencia'].includes(currentUser?.tipo);
  const markPreSaleDirty = () => {
    if (!currentPreSale) return;
    preSaleDirty = true;
    preSaleRevision += 1;
    savePreSaleBtn.disabled = false;
    preSaleStatus.textContent = `Pré-venda ${currentPreSale.codigo} com alterações não salvas. Salve para atualizar a reserva de estoque.`;
  };

  const categoriasFarmacia = new Set([
    'medicamentos', 'genericos', 'higiene pessoal', 'perfumaria',
    'dermocosmeticos', 'vitaminas e suplementos', 'primeiros socorros',
    'infantil', 'conveniencia'
  ]);
  const isProdutoFarmacia = (produto) => categoriasFarmacia.has(
    String(produto.categoria || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  );
  
  // Formatar valores monetários
  const formatCurrency = (value) => {
    return `R$ ${parseFloat(value).toFixed(2).replace('.', ',')}`;
  };
  
  // Função debounce para otimizar atualizações
  const debounce = (func, wait) => {
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(updateCartTimeout);
        func(...args);
      };
      clearTimeout(updateCartTimeout);
      updateCartTimeout = setTimeout(later, wait);
    };
  };
  
  // Atualizar data e hora
  const updateDateTime = () => {
    const now = new Date();
    const options = { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric', 
      hour: '2-digit', 
      minute: '2-digit' 
    };
    dataHoraEl.textContent = now.toLocaleString('pt-BR', options);
  };
  
  // Atualizar carrinho (otimizado)
  const updateCart = () => {
    // Usar requestAnimationFrame para melhor performance
    requestAnimationFrame(() => {
      // Mostrar/ocultar o botão de limpar conforme o carrinho
      clearCartBtn.style.display = cart.length > 0 ? 'flex' : 'none';
      
      // Limpar lista de itens
      cartItems.innerHTML = '';
      
      // Verificar se o carrinho está vazio
      if (cart.length === 0) {
        cartItems.innerHTML = `
          <li class="empty-cart">
            <span class="material-icon">shopping_cart</span>
            <p>Carrinho vazio</p>
            <p>Use a busca para adicionar produtos</p>
          </li>
        `;
        payBtn.disabled = true;
        subtotalEl.textContent = formatCurrency(0);
        discountEl.textContent = formatCurrency(0);
        totalEl.textContent = formatCurrency(0);
        return;
      }
      
      // Calcular totais
      let subtotal = 0;
      const discount = 0;
      
      // Criar fragment para melhor performance
      const fragment = document.createDocumentFragment();
      
      // Adicionar itens ao carrinho
      cart.forEach((item, index) => {
        const listItem = document.createElement('li');
        listItem.className = 'cart-item';
        
        const itemSubtotal = item.price * item.quantity;
        subtotal += itemSubtotal;
        
        const receitaControl = item.exigeReceita ? `
          <label class="prescription-control">Receita do medicamento
            <select class="prescription-select" data-index="${index}" ${canMarkPrescription() ? '' : 'disabled'}>
              <option value="" ${item.receitaApresentada == null ? 'selected' : ''}>Não informado</option>
              <option value="sim" ${item.receitaApresentada === true ? 'selected' : ''}>Tem receita</option>
              <option value="nao" ${item.receitaApresentada === false ? 'selected' : ''}>Não tem receita</option>
            </select>
          </label>` : '';
        listItem.innerHTML = `
          <div class="cart-item-details">
            <div class="cart-item-name">${item.name}</div>
            <div class="cart-item-price">${formatCurrency(item.price)} × ${item.quantity} = ${formatCurrency(itemSubtotal)}</div>
            ${receitaControl}
          </div>
          <div class="cart-item-controls">
            <button class="quantity-btn minus-btn" data-index="${index}">-</button>
            <input type="number" class="cart-item-quantity" value="${item.quantity}" data-index="${index}" min="1">
            <button class="quantity-btn plus-btn" data-index="${index}">+</button>
            <button class="remove-btn" data-index="${index}">×</button>
          </div>
        `;
        
        fragment.appendChild(listItem);
      });
      
      // Adicionar todos os itens de uma vez
      cartItems.appendChild(fragment);
      
      // Atualizar valores totais
      const total = subtotal - discount;
      subtotalEl.textContent = formatCurrency(subtotal);
      discountEl.textContent = formatCurrency(discount);
      totalEl.textContent = formatCurrency(total);
      
      // Habilitar botão de finalizar compra
      payBtn.disabled = !canCheckout();
    });
  };
  
  // Carregar produtos
  const loadProducts = async () => {
    try {
      productsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 20px;">
          <div>Carregando produtos...</div>
        </div>
      `;
      
      console.log("Iniciando carregamento de produtos...");
      
      // Verificar se a API está disponível
      if (!window.produtosAPI || !window.produtosAPI.getProdutos) {
        console.error("API de produtos não está disponível");
        throw new Error("API de produtos não disponível");
      }
      
      // Buscar produtos do banco de dados
      const result = await window.produtosAPI.getProdutos({
        categoria: selectedCategory,
        limite: 100  // Limitar a 100 produtos para melhor desempenho
      });
      
      console.log(`Recebidos ${result?.length || 0} produtos do banco de dados`);
      
      if (Array.isArray(result) && result.length > 0) {
        products = result.filter(isProdutoFarmacia);
      } else {
        console.warn("Nenhum produto encontrado ou resposta inválida");
        products = [];
      }
      
      // Carregar produtos iniciais baseado na categoria selecionada
      loadProductsByCategory(selectedCategory);
    } catch (error) {
      console.error('Erro ao carregar produtos:', error);
      productsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: red;">
          Erro ao carregar produtos: ${error.message || 'Falha na conexão com o banco de dados'}
        </div>
      `;
    }
  };
  
  // Buscar produtos por categoria
  const loadProductsByCategory = async (category) => {
    try {
      // Mostrar carregamento
      productsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 20px;">
          <div>Filtrando produtos...</div>
        </div>
      `;
      
      console.log(`Filtrando produtos por categoria: ${category || 'todas'}`);
      
      let filteredProducts = [];
      
      if (category && category !== '') {
        filteredProducts = products.filter(p => p.categoria === category);
        console.log(`Encontrados ${filteredProducts.length} produtos na categoria ${category}`);
      } else {
        filteredProducts = [...products];
        console.log(`Mostrando todos os ${filteredProducts.length} produtos`);
      }
      
      // Se não houver produtos, tentar carregar novamente do banco
      if (filteredProducts.length === 0 && products.length === 0) {
        // Buscar produtos diretamente do banco para esta categoria
        if (window.produtosAPI && window.produtosAPI.getProdutos) {
          const result = await window.produtosAPI.getProdutos({
            categoria: category,
            limite: 100
          });
          
          if (Array.isArray(result) && result.length > 0) {
            filteredProducts = result.filter(isProdutoFarmacia);
            // Atualizar a lista geral de produtos também
            products = Array.isArray(products) ? [...products, ...filteredProducts] : filteredProducts;
          }
        }
      }
      
      // Limitar a quantidade de produtos mostrados para melhorar o desempenho
      const limitedProducts = filteredProducts.slice(0, 50);
      
      displayProducts(limitedProducts);
    } catch (error) {
      console.error('Erro ao carregar produtos por categoria:', error);
      productsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: red;">
          Erro ao filtrar produtos: ${error.message || 'Tente novamente'}
        </div>
      `;
    }
  };
  
  // Exibir produtos no grid
  const displayProducts = (products) => {
    productsGrid.innerHTML = '';
    
    if (products.length === 0) {
      productsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 20px; color: #888;">
          Nenhum produto encontrado nesta categoria.
        </div>
      `;
      return;
    }
    
    products.forEach(product => {
      const productCard = document.createElement('div');
      productCard.className = 'product-card';
      productCard.dataset.id = product._id;
      
      const disponivel = getRemainingStock(product._id);
      const stockClass = disponivel <= 0 ? 'out-stock' :
                         disponivel <= product.estoqueMinimo ? 'low-stock' : 'stock';
      
      const stockText = disponivel <= 0 ? 'Sem estoque' :
                        `${disponivel} ${product.unidadeMedida}${disponivel <= product.estoqueMinimo ? ' (baixo)' : ''}`;
      
      productCard.innerHTML = `
        <div class="product-name">${product.nome}</div>
        <div class="product-price">${formatCurrency(product.precoVenda)}</div>
        ${product.exigeReceita ? '<div class="prescription-control">Exige receita</div>' : ''}
        <div class="product-stock">
          <span class="badge badge-${stockClass}">${stockText}</span>
        </div>
        <div class="product-stock-warning" style="display:none; color:#e53935; font-size:11px; font-weight:bold; margin-top:4px;"></div>
      `;
      
      if (getRemainingStock(product._id) > 0) {
        productCard.addEventListener('click', () => addToCart(product));
      } else {
        productCard.classList.add('disabled');
        productCard.style.opacity = '0.6';
        productCard.style.cursor = 'not-allowed';
      }
      
      productsGrid.appendChild(productCard);
    });
  };
  
  // Mostrar aviso visual (toast) na tela
  const showToast = (message, type = 'success') => {
    const toast = document.createElement('div');
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.left = '50%';
    toast.style.transform = 'translateX(-50%)';
    toast.style.backgroundColor = type === 'error' ? '#e53935' : (type === 'warning' ? '#fb8c00' : '#43a047');
    toast.style.color = 'white';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '4px';
    toast.style.zIndex = '1000';
    toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
    toast.textContent = message;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.transition = 'opacity 0.5s';
      toast.style.opacity = '0';
      setTimeout(() => document.body.removeChild(toast), 500);
    }, 2500);
  };

  // Quantidade máxima permitida para um produto (estoque total cadastrado)
  const getMaxQuantity = (productId) => {
    const product = products.find(p => p._id === productId);
    const reservadaNestaPreVenda = currentPreSale?.estoqueReservado
      ? Number(currentPreSale.itens.find(item => item.produto === productId)?.quantidade || 0)
      : 0;
    return product ? (parseFloat(product.estoque) || 0) + reservadaNestaPreVenda : reservadaNestaPreVenda;
  };

  // Estoque restante considerando o que já está no carrinho
  const getRemainingStock = (productId) => {
    const inCart = cart.reduce((sum, item) => item.id === productId ? sum + item.quantity : sum, 0);
    return getMaxQuantity(productId) - inCart;
  };

  // Atualizar o badge de estoque e o aviso no card do produto
  const updateProductCardStock = (productId) => {
    const card = productsGrid.querySelector(`.product-card[data-id="${productId}"]`);
    if (!card) return;
    
    const product = products.find(p => p._id === productId);
    if (!product) return;
    
    const remaining = getRemainingStock(productId);
    const badge = card.querySelector('.product-stock .badge');
    const warningEl = card.querySelector('.product-stock-warning');
    
    if (remaining <= 0) {
      if (badge) {
        badge.textContent = 'Sem estoque';
        badge.className = 'badge badge-out-stock';
      }
      card.classList.add('disabled');
      card.style.opacity = '0.6';
      card.style.cursor = 'not-allowed';
      if (warningEl) {
        warningEl.textContent = '⚠ Estoque zerado';
        warningEl.style.display = 'block';
      }
    } else {
      if (badge) {
        const isLow = remaining <= (parseFloat(product.estoqueMinimo) || 0);
        badge.textContent = `${remaining} ${product.unidadeMedida || 'un'}${isLow ? ' (baixo)' : ''}`;
        badge.className = isLow ? 'badge badge-low-stock' : 'badge badge-stock';
      }
      card.classList.remove('disabled');
      card.style.opacity = '1';
      card.style.cursor = 'pointer';
      if (warningEl) {
        warningEl.textContent = '';
        warningEl.style.display = 'none';
      }
    }
  };

  // Restaurar o estoque exibido em todos os cards (usado ao limpar o carrinho)
  const refreshAllProductCards = () => {
    products.forEach(p => updateProductCardStock(p._id));
  };

  // Adicionar produto ao carrinho
  const addToCart = (product, quantity = 1) => {
    if (!canCheckout() && !currentPreSale) {
      showToast('Abra uma pré-venda antes de adicionar produtos.', 'error');
      preSaleCode.focus();
      return false;
    }
    if (!Number.isInteger(quantity) || quantity < 1) return false;
    // Verificar se o produto já está no carrinho
    const existingItem = cart.find(item => item.id === product._id);
    
    // Impedir adicionar mais do que o estoque disponível
    const currentQuantity = existingItem ? existingItem.quantity : 0;
    const availableStock = getMaxQuantity(product._id);
    if (currentQuantity + quantity > availableStock) {
      showToast(`Estoque zerado para "${product.nome}". Máximo: ${availableStock}`, 'error');
      updateProductCardStock(product._id);
      return false;
    }
    
    if (existingItem) {
      existingItem.quantity += quantity;
    } else {
      cart.push({
        id: product._id,
        name: product.nome,
        price: product.precoVenda,
        quantity,
        codigo: product.codigo,
        unidade: product.unidadeMedida,
        exigeReceita: Boolean(product.exigeReceita),
        receitaApresentada: null
      });
    }
    
    updateCart();
    markPreSaleDirty();
    
    // Atualizar o card para refletir o estoque restante
    updateProductCardStock(product._id);
    
    const remaining = getRemainingStock(product._id);
    if (remaining <= 0) {
      showToast(`Estoque zerado para "${product.nome}"`, 'warning');
    } else {
      showToast(`${product.nome} adicionado ao carrinho`, 'success');
    }
    return true;
  };
  
  // Buscar produtos
  const searchProducts = async (query) => {
    if (query.length < 2) {
      productSearchResults.style.display = 'none';
      return;
    }
    
    try {
      const matchedProducts = products.filter(p => 
        p.nome.toLowerCase().includes(query.toLowerCase()) || 
        p.codigo.toLowerCase().includes(query.toLowerCase()) ||
        String(p.codigoBarras || '').includes(query)
      ).slice(0, 10);
      
      if (matchedProducts.length > 0) {
        productSearchResults.innerHTML = '';
        
        matchedProducts.forEach(product => {
          const resultItem = document.createElement('div');
          resultItem.className = 'product-search-item';
          
          const disponivel = getRemainingStock(product._id);
          const stockClass = disponivel <= 0 ? 'out-stock' :
                            disponivel <= product.estoqueMinimo ? 'low-stock' : 'stock';
          
          const stockText = disponivel <= 0 ? 'Sem estoque' :
                           disponivel <= product.estoqueMinimo ? 'Baixo estoque' :
                           `${disponivel} ${product.unidadeMedida}`;
          
          resultItem.innerHTML = `
            <div class="product-search-name">${product.nome}</div>
            <div class="product-search-details">
              <div>Código: ${product.codigo}${product.codigoBarras ? ` | Barras: ${product.codigoBarras}` : ''}</div>
              <div>${formatCurrency(product.precoVenda)} <span class="badge badge-${stockClass}">${stockText}</span></div>
            </div>
          `;
          
          if (disponivel > 0) {
            resultItem.addEventListener('click', () => {
              addToCart(product);
              productSearchResults.style.display = 'none';
              productSearchInput.value = '';
            });
          } else {
            resultItem.style.opacity = '0.6';
            resultItem.style.cursor = 'not-allowed';
          }
          
          productSearchResults.appendChild(resultItem);
        });
        
        productSearchResults.style.display = 'block';
      } else {
        productSearchResults.style.display = 'none';
      }
    } catch (error) {
      console.error('Erro na busca:', error);
      productSearchResults.style.display = 'none';
    }
  };
  
  // Funções do modal de pagamento
  const openPaymentModal = () => {
    // Reset do modal
    paymentMethods.forEach(method => method.classList.remove('selected'));
    selectedPaymentMethod = null;
    dinheiroGroup.style.display = 'none';
    trocoGroup.style.display = 'none';
    parcelamentoGroup.style.display = 'none';
    valorRecebidoInput.value = '';
    trocoInput.value = '';
    
    // Calcular total
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    modalTotalValue.value = formatCurrency(total);
    
    // Abrir modal
    paymentModal.style.display = 'block';
  };
  
  const closePaymentModal = () => {
    paymentModal.style.display = 'none';
  };
  
  // Funções do modal de cliente
  const openClientModal = () => {
    clientSearchInput.value = '';
    clientList.innerHTML = '';
    clientModal.style.display = 'block';
    loadClients();
  };
  
  const closeClientModal = () => {
    clientModal.style.display = 'none';
  };
  
  // Carregar clientes
  const loadClients = async () => {
    try {
      clientList.innerHTML = '<div style="text-align:center; padding:20px;">Carregando clientes...</div>';
      
      // Verificar se a API de clientes está disponível
      if (!window.clientesAPI || !window.clientesAPI.getClientes) {
        console.error("API de clientes não disponível");
        throw new Error("API de clientes não disponível");
      }
      
      // Obter clientes da API
      const filtro = clientSearchInput.value.trim();
      const clientes = await window.clientesAPI.getClientes(filtro);
      
      if (!Array.isArray(clientes)) {
        console.error("Resposta inválida da API de clientes:", clientes);
        throw new Error("Resposta inválida da API de clientes");
      }
      
      console.log(`Carregados ${clientes.length} clientes`);
      
      // Exibir clientes
      displayClients(clientes);
    } catch (error) {
      console.error('Erro ao carregar clientes:', error);
      clientList.innerHTML = `<div style="text-align:center; color:red; padding:20px;">
        Erro ao carregar clientes: ${error.message || 'Falha na conexão com o banco de dados'}
        <div style="margin-top:10px;">
          <button id="retryLoadClients" style="padding:5px 10px; cursor:pointer;">Tentar novamente</button>
          <button id="useTestClients" style="padding:5px 10px; margin-left:10px; cursor:pointer;">Usar clientes de teste</button>
        </div>
      </div>`;
      
      // Adicionar eventos aos botões de recuperação
      document.getElementById('retryLoadClients')?.addEventListener('click', loadClients);
      document.getElementById('useTestClients')?.addEventListener('click', () => {
        // Clientes de teste para quando a API falhar
        const clientesTeste = [
          { id: 'test1', _id: 'test1', nome: 'Cliente Teste 1', documento: 'CPF: 111.111.111-11', tipo: 'pessoa_fisica' },
          { id: 'test2', _id: 'test2', nome: 'Cliente Teste 2', documento: 'CPF: 222.222.222-22', tipo: 'pessoa_fisica' },
          { id: 'test3', _id: 'test3', nome: 'Empresa Teste', documento: 'CNPJ: 33.333.333/0001-33', tipo: 'pessoa_juridica' }
        ];
        displayClients(clientesTeste);
      });
    }
  };
  
  // Exibir clientes
  const displayClients = (clients) => {
    if (!Array.isArray(clients) || clients.length === 0) {
      clientList.innerHTML = '<div style="text-align:center; padding:20px;">Nenhum cliente encontrado</div>';
      return;
    }
    
    clientList.innerHTML = '';
    
    clients.forEach(client => {
      const clientItem = document.createElement('div');
      clientItem.className = 'client-item';
      clientItem.style.padding = '10px';
      clientItem.style.borderBottom = '1px solid #eee';
      clientItem.style.cursor = 'pointer';
      
      // Obter documento formatado
      let documentoFormatado = '';
      if (client.cpfCnpj) {
        documentoFormatado = client.tipo === 'pessoa_juridica' ? 
          `CNPJ: ${client.cpfCnpj}` : `CPF: ${client.cpfCnpj}`;
      } else if (client.documento) {
        documentoFormatado = client.documento;
      }
      
      clientItem.innerHTML = `
        <div style="font-weight:500;">${client.nome || 'Cliente sem nome'}</div>
        <div style="font-size:12px; color:#777;">
          ${documentoFormatado}
          ${client.telefone ? `<div>Tel: ${client.telefone}</div>` : ''}
        </div>
      `;
      
      clientItem.addEventListener('click', () => {
        selectClient(client);
      });
      
      clientItem.addEventListener('mouseover', () => {
        clientItem.style.backgroundColor = '#f5f5f5';
      });
      
      clientItem.addEventListener('mouseout', () => {
        clientItem.style.backgroundColor = '';
      });
      
      clientList.appendChild(clientItem);
    });
  };
  
  // Selecionar cliente
  const selectClient = (client) => {
    currentClient = {
      id: client._id || client.id,
      nome: client.nome,
      tipo: client.tipo || 'pessoa_fisica',
      cpfCnpj: client.cpfCnpj || ''
    };
    
    // Garantir que o ID do cliente seja uma string
    if (typeof currentClient.id !== 'string') {
      currentClient.id = String(currentClient.id);
    }
    
    console.log("Cliente selecionado:", currentClient);
    
    // Atualizar UI
    const clientNameEl = document.querySelector('.client-name');
    const clientDetailsEl = document.querySelector('.client-details');
    
    clientNameEl.textContent = currentClient.nome;
    clientDetailsEl.textContent = currentClient.tipo === 'pessoa_fisica' ? 'Cliente Pessoa Física' : 'Cliente Pessoa Jurídica';
    
    // Verificar se estamos em modo fiado e carregar informações de crédito
    if (selectedPaymentMethod === 'fiado') {
      carregarInfoCredito(currentClient.id);
    }

    markPreSaleDirty();
    
    closeClientModal();
  };

  const resetClient = () => {
    currentClient = null;
    document.querySelector('.client-name').textContent = 'Cliente Padrão';
    document.querySelector('.client-details').textContent = 'Venda balcão';
    markPreSaleDirty();
  };

  const applyPreSale = (preVenda) => {
    currentPreSale = preVenda;
    preSaleDirty = false;
    preSaleCode.value = preVenda.codigo;
    cart = preVenda.itens.map(item => ({
      id: item.produto,
      name: item.nomeProduto,
      price: item.precoUnitario,
      quantity: item.quantidade,
      codigo: item.codigoProduto,
      unidade: item.unidadeMedida,
      exigeReceita: item.exigeReceita,
      receitaApresentada: item.receitaApresentada
    }));
    currentClient = preVenda.cliente ? { id: preVenda.cliente, nome: preVenda.nomeCliente, tipo: 'pessoa_fisica' } : null;
    document.querySelector('.client-name').textContent = currentClient?.nome || 'Cliente Padrão';
    document.querySelector('.client-details').textContent = currentClient ? 'Cliente vinculado' : 'Venda balcão';
    savePreSaleBtn.disabled = true;
    cancelPreSaleBtn.disabled = false;
    preSaleStatus.textContent = `Pré-venda ${preVenda.codigo} aberta. ${cart.length} produto(s). Estoque reservado para os itens salvos.`;
    updateCart();
    refreshAllProductCards();
  };

  const loadPreSaleList = async () => {
    try {
      const preVendas = await window.preVendasAPI.listar();
      preSaleList.replaceChildren(new Option('Selecione uma pré-venda aberta', ''));
      preVendas.forEach(preVenda => {
        preSaleList.add(new Option(`${preVenda.codigo} · ${preVenda.nomeCliente} · ${preVenda.itens.length} produto(s)`, preVenda.codigo));
      });
    } catch (error) {
      preSaleStatus.textContent = `Erro ao listar pré-vendas: ${error.message}`;
    }
  };

  const openPreSale = async codigo => {
    if (!codigo) {
      preSaleStatus.textContent = 'Informe um código de pré-venda.';
      return;
    }
    if (preSaleDirty && !confirm('Há alterações não salvas. Deseja descartá-las?')) return;
    try {
      const preVenda = await window.preVendasAPI.abrir(codigo);
      applyPreSale(preVenda);
      await loadProducts();
      if (pendingConsultationProduct && addToCart(pendingConsultationProduct.product, pendingConsultationProduct.quantity)) {
        pendingConsultationProduct = null;
      }
      await loadPreSaleList();
    } catch (error) {
      preSaleStatus.textContent = error.message;
    }
  };

  const savePreSale = async () => {
    if (!currentPreSale) throw new Error('Abra uma pré-venda antes de salvar.');
    const codigo = currentPreSale.codigo;
    const revision = preSaleRevision;
    savePreSaleBtn.disabled = true;
    try {
      const saved = await window.preVendasAPI.salvar({
        codigo,
        versao: currentPreSale.versao,
        cliente: currentClient?.id || null,
        itens: cart.map(item => ({
          produto: item.id,
          quantidade: item.quantity,
          receitaApresentada: item.receitaApresentada
        }))
      });
      if (currentPreSale?.codigo === codigo) {
        currentPreSale = saved;
        if (revision === preSaleRevision) applyPreSale(saved);
        else {
          preSaleDirty = true;
          savePreSaleBtn.disabled = false;
          preSaleStatus.textContent = 'Novas alterações ainda precisam ser salvas.';
        }
      }
      await loadPreSaleList();
      await loadProducts();
      return saved;
    } catch (error) {
      savePreSaleBtn.disabled = false;
      preSaleStatus.textContent = `Erro ao salvar: ${error.message}`;
      throw error;
    }
  };

  openPreSaleBtn.addEventListener('click', () => openPreSale(preSaleCode.value.trim()));
  preSaleCode.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); openPreSale(preSaleCode.value.trim()); }
  });
  savePreSaleBtn.addEventListener('click', () => savePreSale().catch(error => alert(error.message)));
  cancelPreSaleBtn.addEventListener('click', async () => {
    if (currentUser?.tipo !== 'gerencia' || !currentPreSale) return;
    const codigo = currentPreSale.codigo;
    if (!confirm(`Cancelar a pré-venda ${codigo}? O estoque reservado será devolvido e alterações não salvas serão descartadas.`)) return;
    try {
      await window.preVendasAPI.cancelar(codigo, currentPreSale.versao);
      currentPreSale = null;
      preSaleDirty = false;
      pendingConsultationProduct = null;
      preSaleCode.value = '';
      cart = [];
      resetClient();
      savePreSaleBtn.disabled = true;
      cancelPreSaleBtn.disabled = true;
      preSaleStatus.textContent = `Pré-venda ${codigo} cancelada pela GERÊNCIA. Estoque devolvido.`;
      updateCart();
      await Promise.all([loadPreSaleList(), loadProducts()]);
    } catch (error) {
      alert(error.message);
    }
  });
  refreshPreSalesBtn.addEventListener('click', async () => {
    await Promise.all([loadPreSaleList(), loadProducts()]);
  });
  preSaleList.addEventListener('change', () => {
    if (preSaleList.value) openPreSale(preSaleList.value);
  });
  newPreSaleBtn.addEventListener('click', () => {
    if (preSaleDirty && !confirm('Há alterações não salvas. Deseja descartá-las?')) return;
    currentPreSale = null;
    pendingConsultationProduct = null;
    preSaleDirty = false;
    preSaleCode.value = '';
    cart = [];
    resetClient();
    savePreSaleBtn.disabled = true;
    cancelPreSaleBtn.disabled = true;
    preSaleStatus.textContent = 'Informe um código para montar ou continuar uma pré-venda. O estoque é reservado ao salvar.';
    updateCart();
    loadProducts();
  });
  clearClientBtn.addEventListener('click', resetClient);
  
  // Carregar informações de crédito para fiado
  const carregarInfoCredito = async (clienteId) => {
    try {
      if (!clienteId) {
        fiadoInfo.innerHTML = '<p style="margin:0; color:#666;">Selecione um cliente para ver informações de crédito</p>';
        return;
      }
      
      console.log("Carregando informações de crédito para cliente ID:", clienteId);
      
      fiadoInfo.innerHTML = '<p style="margin:0;">Carregando informações de crédito...</p>';
      
      if (!window.clientesAPI || !window.clientesAPI.getResumoFiado) {
        fiadoInfo.innerHTML = '<p style="margin:0; color:red;">Não foi possível carregar informações de crédito</p>';
        return;
      }
      
      // Garantir que o ID do cliente seja uma string simples
      let idParaConsulta = clienteId;
      if (typeof clienteId === 'object' && clienteId !== null) {
        // Se for um objeto, tentar converter para string
        if (clienteId.toString && typeof clienteId.toString === 'function' && 
            clienteId.toString !== Object.prototype.toString) {
          idParaConsulta = clienteId.toString();
        }
      } else if (typeof clienteId !== 'string') {
        idParaConsulta = String(clienteId);
      }
      
      const resposta = await window.clientesAPI.getResumoFiado(idParaConsulta);
      console.log("Resposta do resumo de fiado:", resposta);
      
      if (!resposta || !resposta.success) {
        const mensagem = resposta && resposta.message ? resposta.message : 'Erro ao obter dados de crédito';
        fiadoInfo.innerHTML = `<p style="margin:0; color:red;">${mensagem}</p>`;
        return;
      }
      
      const resumo = resposta.resumo;
      const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const formatMoney = valor => `R$ ${parseFloat(valor).toFixed(2).replace('.', ',')}`;
      
      // Limite total = limite base + crédito adicional (devoluções/ajustes)
      const limiteTotal = (parseFloat(resumo.limiteCredito) || 0) + (parseFloat(resumo.creditoAdicional) || 0);
      const creditoAdicional = parseFloat(resumo.creditoAdicional) || 0;
      const statusCredito = resumo.statusCredito || 'analise';
      
      // Mensagem e cor conforme o status do crédito
      let mensagemCredito = '';
      let corCredito = '#e53935';
      
      if (statusCredito === 'bloqueado') {
        mensagemCredito = 'Crédito bloqueado.';
        corCredito = '#e53935';
      } else if (statusCredito === 'analise') {
        mensagemCredito = 'Crédito em análise. Aguardando aprovação.';
        corCredito = '#fb8c00';
      } else if ((parseFloat(resumo.creditoDisponivel) || 0) >= total) {
        mensagemCredito = 'Cliente possui crédito disponível para esta compra.';
        corCredito = '#2e7d32';
      } else {
        mensagemCredito = `Crédito insuficiente. Disponível: ${formatMoney(resumo.creditoDisponivel)} | Necessário: ${formatMoney(total)}`;
        corCredito = '#e53935';
      }
      
      const rotuloStatus = {
        ativo: 'Ativo',
        bloqueado: 'Bloqueado',
        analise: 'Em análise'
      }[statusCredito] || statusCredito;
      
      fiadoInfo.innerHTML = `
        <div style="margin-bottom:5px; display:flex; justify-content:space-between;">
          <span>Limite de Crédito:</span>
          <span>${formatMoney(limiteTotal)}</span>
        </div>
        ${creditoAdicional > 0 ? `
        <div style="margin-bottom:5px; display:flex; justify-content:flex-end; font-size:11px; color:#888;">
          <span>Inclui ${formatMoney(creditoAdicional)} de crédito adicional</span>
        </div>
        ` : ''}
        <div style="margin-bottom:5px; display:flex; justify-content:space-between;">
          <span>Saldo Devedor:</span>
          <span>${formatMoney(resumo.saldoDevedor)}</span>
        </div>
        <div style="margin-bottom:5px; display:flex; justify-content:space-between; font-weight:bold;">
          <span>Crédito Disponível:</span>
          <span>${formatMoney(resumo.creditoDisponivel)}</span>
        </div>
        <div style="margin-bottom:10px; display:flex; justify-content:space-between;">
          <span>Status do Crédito:</span>
          <span style="font-weight:bold; color:${corCredito};">${rotuloStatus}</span>
        </div>
        ${resumo.vendasVencidas > 0 ? `
        <div style="color:red; margin-top:10px;">
          Atenção: Cliente possui ${resumo.vendasVencidas} venda(s) vencida(s) 
          no valor de ${formatMoney(resumo.valorVencido)}
        </div>
        ` : ''}
        <div style="margin-top:10px; font-weight:bold; color:${corCredito}">
          ${mensagemCredito}
        </div>
      `;
    } catch (error) {
      console.error('Erro ao carregar informações de crédito:', error);
      fiadoInfo.innerHTML = `<p style="margin:0; color:red;">Erro: ${error.message || 'Falha ao carregar dados'}</p>`;
    }
  };
  
  // Finalizar venda
  const finalizeSale = async () => {
    try {
      if (!canCheckout()) {
        alert('Somente CAIXA ou GERÊNCIA pode finalizar vendas.');
        return;
      }
      if (cart.some(item => item.exigeReceita && item.receitaApresentada !== true)) {
        alert('Confirme que há receita para todos os medicamentos que exigem receita.');
        return;
      }
      if (currentPreSale && preSaleDirty) await savePreSale();
      // Validar forma de pagamento
      if (!selectedPaymentMethod) {
        alert('Selecione uma forma de pagamento');
        return;
      }
      
      // Validação específica para fiado
      if (selectedPaymentMethod === 'fiado') {
        if (!currentClient) {
          alert('Selecione um cliente para venda fiado');
          return;
        }
        
        if (!dataVencimento.value) {
          alert('Informe a data de vencimento para venda fiado');
          return;
        }
      }
      
      // Validar valor recebido para pagamento em dinheiro
      if (selectedPaymentMethod === 'dinheiro') {
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const valorRecebido = parseFloat(valorRecebidoInput.value);
        
        if (isNaN(valorRecebido) || valorRecebido < total) {
          alert('O valor recebido deve ser pelo menos igual ao valor total da venda');
          return;
        }
      }
      
      // Mostrar indicador de carregamento
      confirmPaymentBtn.disabled = true;
      confirmPaymentBtn.innerHTML = '<span class="loading-spinner"></span> Processando...';
      
      // Calcular subtotal e total
      const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const desconto = 0; // Implementar lógica de desconto se necessário
      const total = subtotal - desconto;
      
      // Extrair ID do vendedor de forma segura
      let vendedorId = null;
      let vendedorNome = 'Vendedor não especificado';
      
      if (currentUser) {
        // Se tivermos um ID como string, usá-lo diretamente
        if (typeof currentUser.id === 'string') {
          vendedorId = currentUser.id;
        } 
        // Se tivermos um ID como objeto, usamos o toString()
        else if (currentUser._id) {
          vendedorId = currentUser._id.toString();
        }
        
        vendedorNome = currentUser.nome || 'Vendedor';
        console.log('Usando ID do vendedor:', vendedorId);
      }
      
      // Preparar dados da venda
      const venda = {
        cliente: currentClient ? currentClient.id : null,
        nomeCliente: currentClient ? currentClient.nome : 'Cliente Balcão',
        vendedor: vendedorId,
        nomeVendedor: vendedorNome,
        itens: cart.map(item => ({
          produto: item.id,
          codigoProduto: item.codigo || '',
          nomeProduto: item.name,
          quantidade: item.quantity,
          precoUnitario: item.price,
          subtotal: item.price * item.quantity,
          unidadeMedida: item.unidade || 'un',
          exigeReceita: item.exigeReceita,
          receitaApresentada: item.receitaApresentada
        })),
        subtotal: subtotal,
        desconto: desconto,
        total: total,
        pagamento: {
          metodo: selectedPaymentMethod,
          parcelas: selectedPaymentMethod === 'cartao_credito' ? 
                  parseInt(document.getElementById('parcelas').value) : 1,
          valorRecebido: selectedPaymentMethod === 'dinheiro' ? 
                       parseFloat(valorRecebidoInput.value) : null,
          troco: selectedPaymentMethod === 'dinheiro' && trocoInput.value ? 
                parseFloat(trocoInput.value.replace('R$ ', '').replace(',', '.')) : null
        }
      };
      
      // Adicionar dados específicos para fiado
      if (selectedPaymentMethod === 'fiado') {
        venda.pagamento.fiado = {
          dataVencimento: dataVencimento.value
        };
      }
      
      console.log('Dados da venda a enviar:', JSON.stringify(venda));
      
      // Verificar se a API está disponível
      if (!window.vendasAPI || !window.vendasAPI.registrarVenda) {
        console.error("API de vendas não disponível");
        alert("Erro: API de vendas não disponível.");
        confirmPaymentBtn.disabled = false;
        confirmPaymentBtn.textContent = 'Confirmar Pagamento';
        return;
      }
      
      // Enviar dados para o backend
      const resultado = currentPreSale
        ? await window.preVendasAPI.finalizar(currentPreSale.codigo, venda.pagamento)
        : await window.vendasAPI.registrarVenda(venda);
      
      if (resultado.success) {
        const estoqueJaReservado = currentPreSale?.estoqueReservado === true;
        // Capturar itens vendidos antes de limpar o carrinho
        const itensVendidos = cart.map(item => ({
          id: item.id,
          quantidade: item.quantity
        }));
        
        // Fechar modal
        closePaymentModal();
        
        // Mostrar recibo/comprovante
        showReceipt(resultado.venda);
        
        // Limpar carrinho
        cart = [];
        if (currentPreSale) {
          preSaleStatus.textContent = `Pré-venda ${currentPreSale.codigo} finalizada.`;
          currentPreSale = null;
          preSaleDirty = false;
          preSaleCode.value = '';
          savePreSaleBtn.disabled = true;
          cancelPreSaleBtn.disabled = true;
          loadPreSaleList();
        }
        updateCart();
        
        // Reset cliente
        currentClient = null;
        document.querySelector('.client-name').textContent = 'Cliente Padrão';
        document.querySelector('.client-details').textContent = 'Venda balcão';
        
        // Atualizar o estoque local dos produtos vendidos imediatamente
        if (!estoqueJaReservado) itensVendidos.forEach(item => {
          const prod = products.find(p => p._id === item.id);
          if (prod) prod.estoque = Math.max(0, (parseFloat(prod.estoque) || 0) - item.quantidade);
        });
        
        // Re-renderizar a grade com o estoque já atualizado
        loadProductsByCategory(selectedCategory);
        
        // Sincronizar com o banco de dados em segundo plano
        loadProducts();
      } else {
        alert(`Erro ao registrar venda: ${resultado.message || 'Erro desconhecido'}`);
        confirmPaymentBtn.disabled = false;
        confirmPaymentBtn.textContent = 'Confirmar Pagamento';
      }
    } catch (error) {
      console.error('Erro ao finalizar venda:', error);
      alert(`Erro ao finalizar venda: ${error.message || 'Tente novamente'}`);
      confirmPaymentBtn.disabled = false;
      confirmPaymentBtn.textContent = 'Confirmar Pagamento';
    }
  };
  
  // Mostrar recibo/comprovante e emitir nota fiscal imprimível
  const showReceipt = async (venda) => {
    try {
      // Capturar snapshot do carrinho imediatamente (evita race com limpeza do carrinho)
      const cartSnapshot = (Array.isArray(cart) ? cart.map(it => ({
        nomeProduto: it.name,
        quantidade: it.quantity,
        precoUnitario: it.price,
        subtotal: (it.price || 0) * (it.quantity || 1)
      })) : []);

      // Tentar buscar detalhes completos da venda no backend
      let vendaDetalhes = null;
      if (window.vendasAPI && window.vendasAPI.getVendaDetalhes && venda && venda._id) {
        try {
          vendaDetalhes = await window.vendasAPI.getVendaDetalhes(venda._id);
        } catch (err) {
          console.warn('Não foi possível obter detalhes da venda:', err);
        }
      }

      // Usar itens do detalhe se disponível, senão usar o snapshot do carrinho
      const itens = (vendaDetalhes && Array.isArray(vendaDetalhes.itens)) ? vendaDetalhes.itens : cartSnapshot;
      const total = (vendaDetalhes && vendaDetalhes.total) ? vendaDetalhes.total : itens.reduce((s, it) => s + (it.precoUnitario || it.price || 0) * (it.quantidade || it.quantity || 1), 0);
      const dataVenda = (vendaDetalhes && vendaDetalhes.dataVenda) ? new Date(vendaDetalhes.dataVenda).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR');

      // Montar HTML da nota fiscal (formato simples, otimizado para impressão térmica)
      let itemsHtml = '';
      itens.forEach(it => {
        const nome = it.nomeProduto || it.name || it.nome || '-';
        const qtd = it.quantidade || it.quantity || 1;
        const preco = (it.precoUnitario || it.price || 0).toFixed(2).replace('.', ',');
        const subtotal = ((it.subtotal) ? it.subtotal : ((it.precoUnitario || it.price || 0) * qtd)).toFixed(2).replace('.', ',');
        itemsHtml += `<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;"><div style="width:60%">${nome} x${qtd}</div><div style="width:40%; text-align:right">R$ ${subtotal}</div></div>`;
      });

        const empresaNome = 'FARMAVIDA DROGARIA E PERFUMARIA';
      const empresaCnpj = '42.613.368/0001-75';
      const empresaEndereco = 'Nova Friburgo - RJ';
      const clienteNome = (vendaDetalhes && vendaDetalhes.nomeCliente) ? vendaDetalhes.nomeCliente : (currentClient ? currentClient.nome : '');
      const vendedorNome = (vendaDetalhes && vendaDetalhes.nomeVendedor) ? vendaDetalhes.nomeVendedor : (currentUser ? currentUser.nome : '');
      const pagamentoMetodo = (vendaDetalhes && vendaDetalhes.pagamento && vendaDetalhes.pagamento.metodo) ? vendaDetalhes.pagamento.metodo : (selectedPaymentMethod || '');

      // Determinar data da venda (dia, mês, ano) para preencher no recibo
      const vendaDateObj = (vendaDetalhes && vendaDetalhes.dataVenda) ? new Date(vendaDetalhes.dataVenda) : new Date();
      const diaVenda = String(vendaDateObj.getDate()).padStart(2, '0');
      const mesVenda = String(vendaDateObj.getMonth() + 1).padStart(2, '0');
      const anoVenda = String(vendaDateObj.getFullYear());

      // Montar tabela com linhas fixas (para parecer formulário do anexo)
      const maxRows = 12;
      const filledRows = itemsHtml ? itens.length : 0;
      let tableRowsHtml = '';

      // Preencher com itens reais primeiro
      for (let i = 0; i < maxRows; i++) {
        if (i < itens.length) {
          const it = itens[i];
          const qtd = it.quantidade || it.quantity || 1;
          const desc = it.nomeProduto || it.name || it.nome || '';
          const valNum = (it.subtotal) ? parseFloat(it.subtotal) : parseFloat((it.precoUnitario || it.price || 0) * qtd);
          const val = isNaN(valNum) ? '0,00' : valNum.toFixed(2).replace('.', ',');
          tableRowsHtml += `
            <tr>
              <td style="width:10%; text-align:center; padding:6px">${qtd}</td>
              <td style="width:75%; padding:6px">${desc}</td>
              <td style="width:15%; text-align:right; padding:6px">R$ ${val}</td>
            </tr>`;
        } else {
          tableRowsHtml += `
            <tr>
              <td style="width:10%; text-align:center; padding:6px">&nbsp;</td>
              <td style="width:75%; padding:6px">&nbsp;</td>
              <td style="width:15%; text-align:right; padding:6px">&nbsp;</td>
            </tr>`;
        }
      }

      const totalFormat = parseFloat(total || 0).toFixed(2).replace('.', ',');

      const receiptHtml = `<!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Recibo de Vendas - ${venda.codigo || venda._id || ''}</title>
          <style>
            @page { size: A4; margin: 10mm; }
            body { font-family: Arial, Helvetica, sans-serif; color:#000; margin:0; }
            .container { padding:10px; }
            .header { display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #000; padding-bottom:8px }
            .logo { width:18%; }
            .company { width:60%; text-align:center }
            .company h1 { margin:0; font-size:18px; letter-spacing:1px }
            .company small { display:block; font-size:12px }
            .address { width:18%; border:1px solid #ccc; padding:6px; font-size:12px; text-align:center }
            .promo { margin-top:8px; font-size:12px; border:1px solid transparent }
            .nome-row { display:flex; justify-content:space-between; margin-top:8px }
            .nome-row .name-box { border:1px solid #000; padding:6px; width:70% }
            .nome-row .date-box { display:flex; gap:6px; align-items:center }
            .title { background:#ddd; text-align:center; padding:10px; margin-top:8px; font-size:20px; font-weight:700 }
            table.items { width:100%; border-collapse:collapse; margin-top:8px }
            table.items th, table.items td { border:1px solid #000 }
            table.items th { background:#f3f3f3; padding:8px; text-align:left }
            table.items td { padding:6px; vertical-align:top }
            .footer { display:flex; justify-content:space-between; margin-top:10px }
            .footer .left { width:70%; text-align:center; font-size:12px }
            .footer .right { width:28%; border:1px solid #000; padding:10px; text-align:right; font-weight:700 }
            .small { font-size:11px }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">&nbsp;</div>
              <div class="company">
                <h1>${empresaNome}</h1>
                <small>CNPJ: ${empresaCnpj}</small>
              </div>
              <div class="address">${empresaEndereco}</div>
            </div>

            <div class="nome-row">
              <div class="name-box"><strong>NOME:</strong> ${clienteNome || '&nbsp;'}</div>
              <div style="text-align:right; width:28%">
                <div style="font-size:12px"><strong>Pagamento:</strong> ${getPaymentMethodName(pagamentoMetodo)}</div>
                <div class="date-box" style="margin-top:6px; display:flex; gap:6px; justify-content:flex-end">
                  <div style="border:1px solid #000; padding:6px; text-align:center">${diaVenda}</div>
                  <div style="border:1px solid #000; padding:6px; text-align:center">${mesVenda}</div>
                  <div style="border:1px solid #000; padding:6px; text-align:center">${anoVenda}</div>
                </div>
              </div>
            </div>

            <div class="title">Recibo de Vendas</div>

            <table class="items">
              <thead>
                <tr>
                  <th style="width:10%; text-align:center">QUANT.</th>
                  <th style="width:75%">DESCRIÇÃO MATERIAIS</th>
                  <th style="width:15%; text-align:right">VALOR</th>
                </tr>
              </thead>
              <tbody>
                ${tableRowsHtml}
              </tbody>
            </table>

            <div class="footer">
              <div class="left small">
                Segunda a sexta 08:00 às 17:00 h<br>
                Sábados/Domingos e Feriados 08:00 às 14:00 h<br>
                Aceitamos Cartões de Débito / Crédito / Pix<br>
                Obrigado pela Preferência - Volte sempre.
              </div>
              <div class="right">TOTAL:<br>R$ ${totalFormat}</div>
            </div>
          </div>
        </body>
        </html>`;

      // Armazenar HTML do recibo para uso posterior
      window.currentReceiptHtml = receiptHtml;
      window.currentReceiptData = {
        venda: venda,
        vendaDetalhes: vendaDetalhes
      };

      // Mostrar modal de confirmação
      const receiptModal = document.createElement('div');
      receiptModal.className = 'modal';
      receiptModal.id = 'receiptModal';
      receiptModal.style.display = 'block';
      receiptModal.innerHTML = `
        <div class="modal-content" style="width:350px">
          <div class="modal-header">
            <h2>Venda Realizada com Sucesso!</h2>
            <button class="close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div style="text-align:center; margin-bottom:10px">
              <div class="bold">${empresaNome}</div>
              <div>${dataVenda}</div>
            </div>
            <div style="text-align:center; margin-top:10px; font-weight:700">Total: R$ ${parseFloat(total).toFixed(2).replace('.', ',')}</div>
          </div>
          <div class="modal-footer" style="justify-content:center">
            <button class="modal-btn btn-confirm">Imprimir / Abrir PDF</button>
            <button class="modal-btn btn-secondary close-modal">Fechar</button>
          </div>
        </div>
      `;

      document.body.appendChild(receiptModal);

      // Função para fechar modal e re-habilitar botão
      const closeReceiptModal = () => {
        document.body.removeChild(receiptModal);
        // Re-habilitar botão de pagamento para nova venda
        confirmPaymentBtn.disabled = false;
        confirmPaymentBtn.textContent = 'Confirmar Pagamento';
        // Limpar dados temporários
        window.currentReceiptHtml = null;
        window.currentReceiptData = null;
      };

      receiptModal.querySelector('.close-btn').addEventListener('click', closeReceiptModal);

      receiptModal.querySelector('.close-modal').addEventListener('click', closeReceiptModal);

      receiptModal.querySelector('.btn-confirm').addEventListener('click', async () => {
        // Gerar PDF apenas quando o usuário clicar em imprimir
        let pdfResult = null;
        
        if (window.printAPI && window.printAPI.generatePDF && window.currentReceiptHtml) {
          try {
            const receiptData = window.currentReceiptData || {};
            const vendaData = receiptData.venda || {};
            const suggestedName = `${(vendaData && vendaData.codigo) ? vendaData.codigo : 'recibo'}-${Date.now()}.pdf`;
            
            console.log('Gerando PDF da nota fiscal...');
            pdfResult = await window.printAPI.generatePDF(window.currentReceiptHtml, suggestedName);
            
            if (pdfResult && pdfResult.success) {
              console.log('PDF gerado com sucesso:', pdfResult.path);
              // Abrir o arquivo PDF gerado
              try {
                if (window.electronAPI && window.electronAPI.openFile) {
                  await window.electronAPI.openFile(pdfResult.path);
                } else {
                  window.open(pdfResult.path, '_blank');
                }
              } catch (err) {
                console.error('Erro ao abrir PDF gerado:', err);
                alert('PDF gerado em: ' + pdfResult.path + '\nMas houve erro ao abrir: ' + (err && err.message));
              }
            } else {
              console.warn('Geração de PDF retornou falha:', pdfResult);
              alert('Falha ao gerar PDF. Tentando abrir visualização em nova janela.');
              // Fallback para janela de visualização
              const reprint = window.open('', '_blank', 'width=400,height=600');
              if (!reprint) {
                alert('Bloqueador de popups impediu a visualização. Libere popups e tente novamente.');
              } else {
                reprint.document.open();
                reprint.document.write(window.currentReceiptHtml);
                reprint.document.close();
                reprint.focus();
              }
            }
          } catch (err) {
            console.error('Erro ao gerar PDF:', err);
            alert('Erro ao gerar PDF: ' + (err && err.message));
            // Fallback para janela de visualização em caso de erro
            const reprint = window.open('', '_blank', 'width=400,height=600');
            if (!reprint) {
              alert('Bloqueador de popups impediu a visualização. Libere popups e tente novamente.');
            } else {
              reprint.document.open();
              reprint.document.write(window.currentReceiptHtml);
              reprint.document.close();
              reprint.focus();
            }
          }
        } else {
          // Se não há API de PDF ou HTML, usar fallback de visualização
          const reprint = window.open('', '_blank', 'width=400,height=600');
          if (!reprint) {
            alert('Bloqueador de popups impediu a visualização. Libere popups e tente novamente.');
          } else {
            reprint.document.open();
            reprint.document.write(window.currentReceiptHtml || '<html><body><p>Erro: dados do recibo não encontrados</p></body></html>');
            reprint.document.close();
            reprint.focus();
          }
        }
        
        // Fechar modal e limpar dados temporários
        document.body.removeChild(receiptModal);
        confirmPaymentBtn.disabled = false;
        confirmPaymentBtn.textContent = 'Confirmar Pagamento';
        window.currentReceiptHtml = null;
        window.currentReceiptData = null;
      });
    } catch (error) {
      console.error('Erro ao montar/emitir nota fiscal:', error);
      alert('Erro ao emitir nota fiscal: ' + (error && error.message));
    }
  };
  
  // Obter nome do método de pagamento para exibição
  const getPaymentMethodName = (method) => {
    const methods = {
      dinheiro: 'Dinheiro',
      cartao_credito: 'Cartão de Crédito',
      cartao_debito: 'Cartão de Débito',
      pix: 'PIX'
    };
    return methods[method] || method;
  };
  
  // Event Listeners
  
  // Busca de produtos com múltiplos event listeners
  if (productSearchInput) {
    // Event listener principal
    productSearchInput.addEventListener('input', function() {
      const query = this.value.trim();
      searchProducts(query);
    });
    
    // Forçar foco ao clicar
    productSearchInput.addEventListener('mousedown', function(e) {
      e.preventDefault();
      forceFocusOnInput(this);
    });
    
    // Forçar foco ao tentar focar
    productSearchInput.addEventListener('focus', function() {
      this.style.pointerEvents = 'auto';
    });
    
    // Alternativa com click
    productSearchInput.addEventListener('click', function() {
      setTimeout(() => forceFocusOnInput(this), 10);
    });
  }
  
  // Ocultar resultados de pesquisa ao clicar fora
  document.addEventListener('click', (e) => {
    if (e.target !== productSearchInput && e.target !== productSearchResults) {
      productSearchResults.style.display = 'none';
    }
  });
  
  // Botões de categoria
  categoryBtns.forEach(btn => {
    btn.addEventListener('click', function() {
      categoryBtns.forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      selectedCategory = this.dataset.category;
      loadProductsByCategory(selectedCategory);
    });
  });
  
  // Botão limpar carrinho
  clearCartBtn.addEventListener('click', () => {
    if (cart.length > 0) {
      if (confirm('Deseja realmente limpar o carrinho?')) {
        cart = [];
        updateCart();
        markPreSaleDirty();
        refreshAllProductCards();
      }
    }
  });
  
  // Botão finalizar venda
  payBtn.addEventListener('click', async () => {
    if (!canCheckout()) return;
    try {
      if (currentPreSale && preSaleDirty) await savePreSale();
      openPaymentModal();
    } catch (error) {
      alert(error.message);
    }
  });
  
  // Leitor de código envia os dados como teclado e termina com Enter.
  const setScannerStatus = (message, isError = false) => {
    scannerStatus.textContent = message;
    scannerStatus.classList.toggle('error', isError);
  };

  const findProductByBarcode = (barcode) => products.find(product =>
    String(product.codigoBarras || '').trim() === barcode ||
    String(product.codigo || '').trim().toUpperCase() === barcode.toUpperCase()
  );

  const addScannedProductToCart = (rawBarcode) => {
    const barcode = String(rawBarcode || '').trim();
    if (!barcode) return { success: false, message: 'Código vazio.' };
    if (!canCheckout() && !currentPreSale) {
      return { success: false, message: 'Abra uma pré-venda antes de adicionar produtos.' };
    }
    const product = findProductByBarcode(barcode);
    if (!product) return { success: false, message: `Código ${barcode} não encontrado no cadastro.` };
    if (getRemainingStock(product._id) <= 0) return { success: false, message: `${product.nome} está sem estoque disponível.` };
    if (!addToCart(product)) return { success: false, message: `Não foi possível adicionar ${product.nome}.` };
    return { success: true, message: `${product.nome} adicionado ao carrinho.` };
  };

  // Apps como "Bluetooth QR & Barcode to PC" enviam o valor como se fossem
  // um teclado e terminam com Enter. Isso dispensa IP, stream e câmera no PC.
  productSearchInput.addEventListener('keydown', (event) => {
    const isEnter = event.key === 'Enter' || event.code === 'Enter' ||
      event.code === 'NumpadEnter' || event.keyCode === 13;
    if (!isEnter) return;
    event.preventDefault();
    const result = addScannedProductToCart(productSearchInput.value);
    if (result.success) {
      productSearchInput.value = '';
      productSearchResults.style.display = 'none';
    } else {
      productSearchResults.replaceChildren();
      const errorMessage = document.createElement('div');
      errorMessage.className = 'product-search-item';
      errorMessage.style.color = '#e53935';
      errorMessage.textContent = result.message;
      productSearchResults.appendChild(errorMessage);
      productSearchResults.style.display = 'block';
    }
    forceFocusOnInput(productSearchInput);
  });

  const processBarcode = (rawBarcode) => {
    const result = addScannedProductToCart(rawBarcode);
    if (!result.success) {
      setScannerStatus(result.message, true);
      return false;
    }
    setScannerStatus(result.message);
    manualBarcodeInput.value = '';
    barcodeScannerModal.style.display = 'none';
    showToast(result.message, 'success');
    forceFocusOnInput(productSearchInput);
    return true;
  };

  const openBarcodeReader = () => {
    barcodeScannerModal.style.display = 'block';
    manualBarcodeInput.value = '';
    setScannerStatus('Aguardando leitura do código.');
    setTimeout(() => forceFocusOnInput(manualBarcodeInput), 50);
  };

  barcodeBtn.addEventListener('click', () => {
    const result = addScannedProductToCart(productSearchInput.value);
    if (result.success) {
      productSearchInput.value = '';
      productSearchResults.style.display = 'none';
    } else {
      showToast(result.message, 'error');
    }
    forceFocusOnInput(productSearchInput);
  });
  barcodeReaderBtn.addEventListener('click', openBarcodeReader);

  manualBarcodeBtn.addEventListener('click', () => processBarcode(manualBarcodeInput.value));
  manualBarcodeInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      processBarcode(manualBarcodeInput.value);
    }
  });
  closeScannerBtn.addEventListener('click', () => {
    barcodeScannerModal.style.display = 'none';
    forceFocusOnInput(productSearchInput);
  });
  
  // Fechar modal de pagamento
  closePaymentModalBtns.forEach(btn => {
    btn.addEventListener('click', closePaymentModal);
  });
  
  // Selecionar forma de pagamento
  paymentMethods.forEach(method => {
    method.addEventListener('click', function() {
      // Remover seleção anterior
      paymentMethods.forEach(m => m.classList.remove('selected'));
      
      // Adicionar seleção atual
      this.classList.add('selected');
      selectedPaymentMethod = this.dataset.method;
      
      // Mostrar campos específicos
      dinheiroGroup.style.display = selectedPaymentMethod === 'dinheiro' ? 'block' : 'none';
      trocoGroup.style.display = selectedPaymentMethod === 'dinheiro' ? 'block' : 'none';
      parcelamentoGroup.style.display = selectedPaymentMethod === 'cartao_credito' ? 'block' : 'none';
      fiadoGroup.style.display = selectedPaymentMethod === 'fiado' ? 'block' : 'none';
      
      // Configurações específicas para fiado
      if (selectedPaymentMethod === 'fiado') {
        // Configurar data de vencimento padrão (30 dias)
        const hoje = new Date();
        const vencimento = new Date();
        vencimento.setDate(hoje.getDate() + 30);
        dataVencimento.value = vencimento.toISOString().split('T')[0];
        
        // Verificar se tem cliente selecionado
        if (!currentClient) {
          alert('Selecione um cliente para venda fiado');
          openClientModal();
          return;
        }
        
        // Buscar informações de crédito do cliente
        carregarInfoCredito(currentClient.id);
      }
      
      // Limpar campos
      valorRecebidoInput.value = '';
      trocoInput.value = '';
    });
  });
  
  // Calcular troco
  valorRecebidoInput.addEventListener('input', function() {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const valorRecebido = parseFloat(this.value) || 0;
    const troco = valorRecebido - total;
    
    trocoInput.value = troco >= 0 ? formatCurrency(troco) : 'Valor insuficiente';
  });
  
  // Confirmar pagamento
  confirmPaymentBtn.addEventListener('click', finalizeSale);
  
  // Delegação de eventos para botões do carrinho (melhor performance)
  cartItems.addEventListener('click', function(e) {
    const target = e.target;
    
    // Botão de diminuir quantidade
    if (target.classList.contains('minus-btn')) {
      const index = parseInt(target.dataset.index);
      if (cart[index] && cart[index].quantity > 1) {
        cart[index].quantity--;
        updateCart();
        markPreSaleDirty();
        updateProductCardStock(cart[index].id);
      }
    }
    
    // Botão de aumentar quantidade
    else if (target.classList.contains('plus-btn')) {
      const index = parseInt(target.dataset.index);
      if (cart[index]) {
        const max = getMaxQuantity(cart[index].id);
        if (cart[index].quantity + 1 > max) {
          showToast(`Estoque zerado para "${cart[index].name}". Máximo: ${max}`, 'error');
          updateProductCardStock(cart[index].id);
        } else {
          cart[index].quantity++;
          updateCart();
          markPreSaleDirty();
          updateProductCardStock(cart[index].id);
        }
      }
    }
    
    // Botão de remover item
    else if (target.classList.contains('remove-btn')) {
      const index = parseInt(target.dataset.index);
      if (cart[index]) {
        const removed = cart[index];
        cart.splice(index, 1);
        updateCart();
        markPreSaleDirty();
        updateProductCardStock(removed.id);
      }
    }
  });
  
  // Delegação de eventos para input de quantidade
  cartItems.addEventListener('change', function(e) {
    const target = e.target;
    
    if (target.classList.contains('cart-item-quantity')) {
      const index = parseInt(target.dataset.index);
      const newQty = parseInt(target.value);
      
      if (isNaN(newQty) || newQty < 1) {
        target.value = cart[index] ? cart[index].quantity : 1;
        return;
      }
      
      if (cart[index]) {
        const item = cart[index];
        const max = getMaxQuantity(item.id);
        let finalQty = newQty;
        if (finalQty > max) {
          finalQty = max;
          showToast(`Estoque zerado para "${item.name}". Máximo: ${max}`, 'error');
        }
        cart[index].quantity = finalQty;
        updateCart();
        markPreSaleDirty();
        updateProductCardStock(item.id);
      }
    }
  });
  cartItems.addEventListener('change', event => {
    if (!event.target.classList.contains('prescription-select')) return;
    const item = cart[Number(event.target.dataset.index)];
    if (!item || !canMarkPrescription()) return;
    item.receitaApresentada = event.target.value === 'sim' ? true : event.target.value === 'nao' ? false : null;
    markPreSaleDirty();
  });
  
  // Gerenciamento de clientes
  changeClientBtn.addEventListener('click', openClientModal);
  closeClientModalBtns.forEach(btn => {
    btn.addEventListener('click', closeClientModal);
  });
  
  // Buscar clientes com termo de busca
  searchClientBtn.addEventListener('click', () => {
    const query = clientSearchInput.value.trim();
    loadClients(); // Irá usar o valor atual de clientSearchInput
  });
  
  // Também pesquisar ao pressionar Enter
  clientSearchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      loadClients();
    }
  });
  
  // Botão novo cliente
  newClientBtn.addEventListener('click', async () => {
    try {
      if (currentPreSale && preSaleDirty) await savePreSale();
      window.location.href = 'clientes.html';
    } catch (error) {
      alert(error.message);
    }
  });
  
  // Botão voltar
  btnVoltarMenu.addEventListener('click', () => {
    if (preSaleDirty || cart.length > 0) {
      if (confirm(preSaleDirty ? 'Há alterações não salvas na pré-venda. Deseja sair?' : 'Existem itens no carrinho. Deseja realmente sair?')) {
        window.location.href = 'main.html';
      }
    } else {
      window.location.href = 'main.html';
    }
  });
  
  // Carregar usuário atual
  const loadCurrentUser = async () => {
    try {
      if (window.authAPI && window.authAPI.getCurrentUser) {
        currentUser = await window.authAPI.getCurrentUser();
        if (currentUser) {
          vendedorEl.textContent = `Vendedor: ${currentUser.nome}`;
          payBtn.style.display = canCheckout() ? '' : 'none';
          cancelPreSaleBtn.hidden = currentUser.tipo !== 'gerencia';
          
          // Garantir que temos um ID utilizável
          if (currentUser._id) {
            if (typeof currentUser._id === 'object') {
              currentUser.id = currentUser._id.toString();
            } else {
              currentUser.id = currentUser._id;
            }
          }
          
          console.log('Usuário carregado:', currentUser.nome, 'ID:', currentUser.id);
        } else {
          window.location.href = 'login.html';
        }
      }
    } catch (error) {
      console.error('Erro ao carregar usuário:', error);
    }
  };
  
  // Inicializar aplicação
  const init = async () => {
    // Atualizar data/hora
    updateDateTime();
    setInterval(updateDateTime, 60000);
    
    // Carregar usuário atual
    await loadCurrentUser();
    
    // Carregar produtos
    await loadProducts();
    await loadPreSaleList();
    const transfer = new URLSearchParams(window.location.search);
    if (transfer.has('produto')) {
      window.history.replaceState(null, '', 'vendas.html');
      const productId = transfer.get('produto');
      const quantity = Number(transfer.get('quantidade'));
      if (!/^[a-f\d]{24}$/i.test(productId || '') || !Number.isInteger(quantity) || quantity < 1) {
        preSaleStatus.textContent = 'Produto ou quantidade inválida na consulta de preço.';
      } else {
        try {
          const product = await window.produtosAPI.getProdutoById(productId);
          if (!product || product.ativo === false || !isProdutoFarmacia(product)) throw new Error('Produto indisponível.');
          if (!products.some(item => item._id === product._id)) products.push(product);
          if (quantity > getMaxQuantity(product._id)) throw new Error('Quantidade maior que o estoque disponível.');
          if (canCheckout()) addToCart(product, quantity);
          else {
            pendingConsultationProduct = { product, quantity };
            preSaleStatus.textContent = `${product.nome} (${quantity}): abra ou crie uma pré-venda para incluir o produto.`;
            preSaleCode.focus();
          }
        } catch (error) {
          preSaleStatus.textContent = `Não foi possível trazer o produto da consulta: ${error.message}`;
        }
      }
    }
    
    // Inicializar carrinho
    updateCart();
  };
  
  // Listener global para detectar quando DevTools é aberto/fechado
  // e resetar foco dos inputs
  let devToolsOpen = false;
  setInterval(() => {
    const widthThreshold = window.outerWidth - window.innerWidth > 160;
    const heightThreshold = window.outerHeight - window.innerHeight > 160;
    
    if (!(heightThreshold && widthThreshold) && 
        ((window.Firebug && window.Firebug.chrome && window.Firebug.chrome.isInitialized) ||
         widthThreshold || heightThreshold)) {
      if (!devToolsOpen) {
        devToolsOpen = true;
        setTimeout(() => {
          resetInputsFocus();
        }, 100);
      }
    } else {
      if (devToolsOpen) {
        devToolsOpen = false;
        setTimeout(() => {
          resetInputsFocus();
        }, 100);
      }
    }
  }, 500);
  
  // Reset foco quando janela ganha foco
  window.addEventListener('focus', () => {
    setTimeout(resetInputsFocus, 100);
  });
  
  // Reset foco inicial
  setTimeout(resetInputsFocus, 1000);
  
  // Iniciar a aplicação
  init();
});
