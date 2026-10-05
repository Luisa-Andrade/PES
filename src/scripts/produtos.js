document.addEventListener('DOMContentLoaded', () => {
  // Buscar elementos do DOM
  const produtosTableBody = document.getElementById('produtosTableBody');
  const formTitle = document.getElementById('formTitle');
  const produtoForm = document.getElementById('produtoForm');
  const produtoId = document.getElementById('produtoId');
  const codigo = document.getElementById('codigo');
  const codigoBarras = document.getElementById('codigoBarras');
  const nome = document.getElementById('nome');
  const descricao = document.getElementById('descricao');
  const exigeReceita = document.getElementById('exigeReceita');
  const categoria = document.getElementById('categoria');
  const unidadeMedida = document.getElementById('unidadeMedida');
  const preco = document.getElementById('preco');
  const precoVenda = document.getElementById('precoVenda');
  const estoque = document.getElementById('estoque');
  const estoqueMinimo = document.getElementById('estoqueMinimo');
  const btnSalvar = document.getElementById('btnSalvar');
  const btnCancelar = document.getElementById('btnCancelar');
  const btnVoltarMenu = document.getElementById('btn-voltar-menu');
  const statusMessage = document.getElementById('statusMessage');
  
  // Elementos de pesquisa e filtros
  const searchInput = document.getElementById('searchInput');
  const searchButton = document.getElementById('searchButton');
  const clearSearchButton = document.getElementById('clearSearchButton');
  const filterCategoria = document.getElementById('filterCategoria');
  const filterEstoque = document.getElementById('filterEstoque');
  
  // Estado local
  let modoEdicao = false;
  let produtoAtual = null;
  const categoriasFarmacia = new Set([
    'medicamentos', 'genericos', 'higiene pessoal', 'perfumaria',
    'dermocosmeticos', 'vitaminas e suplementos', 'primeiros socorros',
    'infantil', 'conveniencia'
  ]);
  const isProdutoFarmacia = (produto) => categoriasFarmacia.has(
    String(produto.categoria || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  );
  
  // Exibir mensagem de status
  const showMessage = (message, isError = false) => {
    if (!statusMessage) {
      console.error("Elemento statusMessage não encontrado");
      alert(message);
      return;
    }
    
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${isError ? 'error' : 'success'}`;
    statusMessage.style.display = 'block';
    
    // Rolar até a mensagem para que seja visível
    statusMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Ocultar mensagem após 5 segundos
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 5000);
  };
  
  // Formatação de valores para exibição
  const formatarMoeda = (valor) => {
    return `R$ ${parseFloat(valor).toFixed(2).replace('.', ',')}`;
  };
  
  // Função para buscar produtos
  const buscarProdutos = async (filtros = {}) => {
    try {
      if (!produtosTableBody) {
        console.error("Elemento tbody não encontrado para exibir produtos");
        return;
      }
      
      // Mostrar indicador de carregamento
      produtosTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="no-data">
            <div>Carregando produtos...</div>
          </td>
        </tr>
      `;
      
      console.log("Iniciando busca de produtos com filtros:", JSON.stringify(filtros));
      
      // Verificar se a API está disponível
      if (!window.produtosAPI || !window.produtosAPI.getProdutos) {
        console.error("API de produtos não está disponível");
        showMessage("Erro interno: API de produtos não disponível", true);
        return;
      }
      
      // Buscar dados do banco (sempre consulta o banco de dados)
      const produtos = await window.produtosAPI.getProdutos(filtros);
      console.log(`Recebidos ${produtos?.length || 0} produtos do backend`);
      console.log("Primeiros 3 produtos:", produtos.slice(0, 3));
      
      if (!produtos) {
        showMessage("Erro ao carregar produtos: resposta vazia", true);
        return;
      }
      
      exibirProdutos(produtos.filter(isProdutoFarmacia));
    } catch (error) {
      console.error('Erro detalhado ao buscar produtos:', error);
      showMessage(`Erro ao carregar produtos: ${error.message || error}`, true);
      
      if (produtosTableBody) {
        produtosTableBody.innerHTML = `
          <tr>
            <td colspan="6" class="no-data">
              Erro ao carregar produtos. Por favor, tente novamente.
            </td>
          </tr>
        `;
      }
    }
  };
  
  // Calcular classe de estoque
  const getEstoqueClass = (estoque, minimo) => {
    if (estoque <= 0) return '';
    if (minimo === undefined || minimo === null) minimo = 10;
    if (estoque <= minimo) return 'badge badge-stock-low';
    if (estoque > minimo * 3) return 'badge badge-stock-high';
    return 'badge badge-stock-ok';
  };
  
  // Obter texto de status do estoque
  const getEstoqueStatus = (estoque, minimo) => {
    if (estoque <= 0) return 'Em falta';
    if (minimo === undefined || minimo === null) minimo = 10;
    if (estoque <= minimo) return 'Baixo';
    return estoque;
  };
  
  // Exibir produtos na tabela
  const exibirProdutos = (produtos) => {
    if (!produtosTableBody) {
      console.error("Elemento tbody não encontrado");
      return;
    }
    
    // Limpar a tabela
    produtosTableBody.innerHTML = '';
    
    // Verificar se há produtos para exibir
    if (!produtos || !Array.isArray(produtos) || produtos.length === 0) {
      produtosTableBody.innerHTML = `
        <tr>
          <td colspan="6" class="no-data">Nenhum produto encontrado</td>
        </tr>
      `;
      return;
    }
    
    console.log(`Exibindo ${produtos.length} produtos na tabela`);
    
    // Exibir cada produto
    produtos.forEach(produto => {
      if (!produto) return;
      
      const row = document.createElement('tr');
      row.className = produto.ativo ? '' : 'produto-inativo';
      
      const produtoId = produto._id || produto.id || '';
      const codigo = produto.codigo || '';
      const nome = produto.nome || '';
      const categoria = produto.categoria || '-';
      const preco = parseFloat(produto.precoVenda || produto.preco || 0);
      const estoque = produto.estoque || 0;
      const estoqueMinimo = produto.estoqueMinimo || 10;
      const estoqueClass = getEstoqueClass(estoque, estoqueMinimo);
      const estoqueText = getEstoqueStatus(estoque, estoqueMinimo);
      
      row.innerHTML = `
        <td>${codigo}</td>
        <td>${nome}</td>
        <td>${categoria}</td>
        <td>${formatarMoeda(preco)}</td>
        <td>
          <span class="${estoqueClass}">${estoqueText}</span>
        </td>
        <td class="acoes">
          <button class="btn-edit" data-id="${produtoId}">Editar</button>
          ${produto.ativo 
            ? `<button class="btn-delete" data-id="${produtoId}">Desativar</button>`
            : `<button class="btn-restore" data-id="${produtoId}">Restaurar</button>`
          }
          <button class="btn-remove-permanent" data-id="${produtoId}">Remover</button>
        </td>
      `;
      
      produtosTableBody.appendChild(row);
    });
    
    console.log(`Total de ${produtosTableBody.children.length} produtos exibidos na tabela`);
    
    // Adicionar eventos aos botões de ação
    adicionarEventosBotoes();
  };
  
  // Adicionar eventos aos botões da tabela
  const adicionarEventosBotoes = () => {
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        carregarProduto(id);
      });
    });
    
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        desativarProduto(id);
      });
    });
    
    document.querySelectorAll('.btn-restore').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        restaurarProduto(id);
      });
    });
    
    document.querySelectorAll('.btn-remove-permanent').forEach(btn => {
      btn.addEventListener('click', function() {
        const id = this.getAttribute('data-id');
        removerProduto(id);
      });
    });
  };
  
  // Função para carregar dados de um produto para edição
  const carregarProduto = async (id) => {
    try {
      if (!id) {
        showMessage('ID de produto não fornecido', true);
        return;
      }
      
      const produto = await window.produtosAPI.getProdutoById(id);
      
      if (!produto) {
        showMessage('Produto não encontrado', true);
        return;
      }
      
      // Limpar o formulário primeiro para evitar dados residuais
      limparFormulario();
      
      // Preencher o formulário com os dados do produto
      produtoId.value = produto._id || produto.id;
      codigo.value = produto.codigo || '';
      codigoBarras.value = produto.codigoBarras || '';
      nome.value = produto.nome || '';
      descricao.value = produto.descricao || '';
      exigeReceita.checked = Boolean(produto.exigeReceita);
      categoria.value = produto.categoria || '';
      unidadeMedida.value = produto.unidadeMedida || 'un';
      preco.value = produto.preco || 0;
      precoVenda.value = produto.precoVenda || produto.preco || 0;
      estoque.value = produto.estoque || 0;
      estoqueMinimo.value = produto.estoqueMinimo || 10;
      
      modoEdicao = true;
      produtoAtual = produto;
      formTitle.textContent = 'Editar Produto';
      btnSalvar.textContent = 'Atualizar Produto';
      
      // Scroll para o formulário
      document.querySelector('.main-container').scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
      console.error('Erro ao carregar produto:', error);
      showMessage(`Erro ao carregar produto: ${error.message || 'Falha na requisição'}`, true);
    }
  };
  
  // Função para desativar um produto (exclusão lógica)
  const desativarProduto = async (id) => {
    try {
      if (!confirm('Deseja realmente desativar este produto?')) {
        return;
      }
      
      const result = await window.produtosAPI.deleteProduto(id);
      
      if (result && result.success) {
        showMessage('Produto desativado com sucesso');
        atualizarProdutos();
      } else {
        showMessage(result.message || 'Erro ao desativar produto', true);
      }
    } catch (error) {
      console.error('Erro ao desativar produto:', error);
      showMessage(`Erro ao desativar produto: ${error.message || error}`, true);
    }
  };
  
  // Função para restaurar um produto
  const restaurarProduto = async (id) => {
    try {
      const result = await window.produtosAPI.restoreProduto(id);
      
      if (result && result.success) {
        showMessage('Produto restaurado com sucesso');
        atualizarProdutos();
      } else {
        showMessage(result.message || 'Erro ao restaurar produto', true);
      }
    } catch (error) {
      console.error('Erro ao restaurar produto:', error);
      showMessage(`Erro ao restaurar produto: ${error.message || error}`, true);
    }
  };
  
  // Função para remover permanentemente um produto
  const removerProduto = async (id) => {
    try {
      if (!confirm('Esta ação não pode ser desfeita. Deseja realmente remover permanentemente este produto?')) {
        return;
      }
      
      const result = await window.produtosAPI.removeProduto(id);
      
      if (result && result.success) {
        showMessage('Produto removido permanentemente com sucesso');
        atualizarProdutos();
      } else {
        showMessage(result.message || 'Erro ao remover produto', true);
      }
    } catch (error) {
      console.error('Erro ao remover produto:', error);
      showMessage(`Erro ao remover produto: ${error.message || error}`, true);
    }
  };
  
  // Atualizar lista de produtos (recarrega todos os produtos do banco)
  const atualizarProdutos = () => {
    // Busca todos os produtos sem filtros
    buscarProdutos({});
  };
  
  // Função para limpar o formulário
  const limparFormulario = () => {
    produtoForm.reset();
    produtoId.value = '';
    modoEdicao = false;
    produtoAtual = null;
    formTitle.textContent = 'Novo Produto';
    btnSalvar.textContent = 'Salvar Produto';
  };
  
  // Inicializar preço de venda quando o preço de custo mudar
  preco.addEventListener('change', () => {
    // Só atualiza se o campo estiver vazio ou em modo de criação
    if (!modoEdicao || !precoVenda.value || precoVenda.value === '0') {
      // Define o preço de venda como 30% acima do preço de custo como sugestão
      const precoCusto = parseFloat(preco.value) || 0;
      const markup = precoCusto * 0.3;
      precoVenda.value = (precoCusto + markup).toFixed(2);
    }
  });
  
  // Manipulador de evento para o formulário
  produtoForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    btnSalvar.disabled = true;
    btnSalvar.textContent = modoEdicao ? 'Atualizando...' : 'Salvando...';
    
    try {
      // Validar campos obrigatórios manualmente
      if (!nome.value.trim()) {
        throw new Error('O nome do produto é obrigatório');
      }
      
      // Preparar dados do produto
      const produtoData = {
        codigo: codigo.value.trim(),
        codigoBarras: codigoBarras.value.trim(),
        nome: nome.value.trim(),
        descricao: descricao.value.trim(),
        exigeReceita: exigeReceita.checked,
        categoria: categoria.value,
        unidadeMedida: unidadeMedida.value,
        preco: parseFloat(preco.value) || 0,
        precoVenda: parseFloat(precoVenda.value) || parseFloat(preco.value) || 0,
        estoque: parseInt(estoque.value) || 0,
        estoqueMinimo: parseInt(estoqueMinimo.value) || 10
      };
      
      let result;
      
      // Verificar se é edição ou criação
      if (modoEdicao) {
        result = await window.produtosAPI.updateProduto(produtoId.value, produtoData);
      } else {
        result = await window.produtosAPI.addProduto(produtoData);
      }
      
      if (result && result.success) {
        showMessage(modoEdicao ? 'Produto atualizado com sucesso!' : 'Produto cadastrado com sucesso!');
        limparFormulario();
        atualizarProdutos();
      } else {
        const errorMessage = result && result.message ? result.message : 'Erro desconheido ao salvar produto';
        showMessage(errorMessage, true);
      }
    } catch (error) {
      console.error('Erro ao salvar produto:', error);
      showMessage(error.message || 'Erro ao salvar produto', true);
    } finally {
      btnSalvar.disabled = false;
      btnSalvar.textContent = modoEdicao ? 'Atualizar Produto' : 'Salvar Produto';
    }
  });
  
  // Botão cancelar
  btnCancelar.addEventListener('click', () => {
    if (modoEdicao && !confirm('Deseja cancelar a edição? As alterações não salvas serão perdidas.')) {
      return;
    }
    limparFormulario();
  });
  
  // Botão voltar ao menu
  btnVoltarMenu.addEventListener('click', () => {
    window.location.href = 'main.html';
  });
  
  // Botão de pesquisa (sempre busca no banco de dados)
  searchButton.addEventListener('click', () => {
    const termo = searchInput.value.trim();
    console.log('Buscando no banco de dados por:', termo);
    // Se tiver termo de busca, envia para o backend
    // Se não tiver, busca todos os produtos
    buscarProdutos(termo ? { termo } : {});
  });
  
  // Pesquisar ao pressionar Enter (sempre busca no banco de dados)
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      const termo = searchInput.value.trim();
      console.log('Buscando no banco de dados por:', termo);
      buscarProdutos(termo ? { termo } : {});
    }
  });
  
  // Botão limpar pesquisa (recarrega todos os produtos do banco)
  clearSearchButton.addEventListener('click', () => {
    searchInput.value = '';
    filterCategoria.value = '';
    filterEstoque.value = '';
    console.log('Recarregando todos os produtos do banco de dados');
    buscarProdutos({});
  });
  
  // Filtrar ao mudar categoria (sempre busca no banco de dados)
  filterCategoria.addEventListener('change', () => {
    const termo = searchInput.value.trim();
    const categoria = filterCategoria.value;
    const estoque = filterEstoque.value;
    console.log('Filtrando no banco de dados:', { termo, categoria, estoque });
    
    const filtros = {};
    if (termo) filtros.termo = termo;
    if (categoria) filtros.categoria = categoria;
    if (estoque) filtros.estoque = estoque;
    
    buscarProdutos(filtros);
  });
  
  // Filtrar ao mudar filtro de estoque (sempre busca no banco de dados)
  filterEstoque.addEventListener('change', () => {
    const termo = searchInput.value.trim();
    const categoria = filterCategoria.value;
    const estoque = filterEstoque.value;
    console.log('Filtrando no banco de dados:', { termo, categoria, estoque });
    
    const filtros = {};
    if (termo) filtros.termo = termo;
    if (categoria) filtros.categoria = categoria;
    if (estoque) filtros.estoque = estoque;
    
    buscarProdutos(filtros);
  });
  
  // Carregar todos os produtos ao iniciar (busca no banco de dados)
  console.log('Carregando todos os produtos do banco de dados...');
  buscarProdutos({});
});
