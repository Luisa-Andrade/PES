document.addEventListener('DOMContentLoaded', () => {
  // Tabs de navegação
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  
  // Botões
  const btnNovoOrcamento = document.getElementById('btn-novo-orcamento');
  const btnVoltar = document.getElementById('btn-voltar');
  const btnSalvar = document.getElementById('btn-salvar');
  const btnCancelar = document.getElementById('btn-cancelar');
  const btnFiltrar = document.getElementById('btn-filtrar');
  const btnBuscarCliente = document.getElementById('btn-buscar-cliente');
  const btnBuscarProduto = document.getElementById('btn-buscar-produto');
  
  // Campos de orçamento
  const clienteBusca = document.getElementById('cliente-busca');
  const clienteNome = document.getElementById('cliente-nome');
  const clienteDocumento = document.getElementById('cliente-documento');
  const clienteContato = document.getElementById('cliente-contato');
  const clienteCategoria = document.getElementById('cliente-categoria');
  const produtoBusca = document.getElementById('produto-busca');
  const produtosOrcamento = document.getElementById('produtos-orcamento');
  const orcamentoValidade = document.getElementById('orcamento-validade');
  const orcamentoVendedor = document.getElementById('orcamento-vendedor');
  const orcamentoObservacoes = document.getElementById('orcamento-observacoes');
  const formaPagamento = document.getElementById('forma-pagamento');
  const parcelas = document.getElementById('parcelas');
  const temEntrega = document.getElementById('tem-entrega');
  const valorFrete = document.getElementById('valor-frete');
  const subtotalElement = document.getElementById('subtotal');
  const descontoElement = document.getElementById('desconto');
  const totalElement = document.getElementById('total');
  
  // Campos de filtro
  const filtroCliente = document.getElementById('filtro-cliente');
  const filtroStatus = document.getElementById('filtro-status');
  const filtroDataInicio = document.getElementById('filtro-data-inicio');
  const filtroDataFim = document.getElementById('filtro-data-fim');
  const orcamentosTable = document.getElementById('orcamentos-table');
  
  // Estado do orçamento atual
  let clienteSelecionado = null;
  let produtos = [];
  let subtotal = 0;
  let desconto = 0;
  let total = 0;
  
  // Formatar valores monetários
  const formatarMoeda = (valor) => {
    return `R$ ${parseFloat(valor).toFixed(2).replace('.', ',')}`;
  };
  
  // Alternar entre as tabs
  const switchTab = (tabId) => {
    tabs.forEach(tab => {
      tab.classList.remove('active');
      if (tab.dataset.tab === tabId) {
        tab.classList.add('active');
      }
    });
    
    tabContents.forEach(content => {
      content.classList.remove('active');
      if (content.id === `tab-${tabId}`) {
        content.classList.add('active');
      }
    });
  };
  
  // Configurar os listeners das tabs
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.dataset.tab);
    });
  });
  
  // Mostrar tab de novo orçamento
  btnNovoOrcamento.addEventListener('click', () => {
    switchTab('novo');
  });
  
  // Voltar para a tela inicial
  btnVoltar.addEventListener('click', () => {
    window.location.href = 'main.html';
  });
  
  // Cancelar orçamento atual
  btnCancelar.addEventListener('click', () => {
    if (confirm('Deseja cancelar este orçamento? Os dados não salvos serão perdidos.')) {
      limparFormulario();
      switchTab('listar');
    }
  });
  
  // Habilitar/desabilitar campo de frete
  temEntrega.addEventListener('change', () => {
    valorFrete.disabled = temEntrega.value !== 'sim';
    if (temEntrega.value !== 'sim') {
      valorFrete.value = '0.00';
    }
    calcularTotal();
  });
  
  // Buscar cliente
  btnBuscarCliente.addEventListener('click', async () => {
    const termoBusca = clienteBusca.value.trim();
    if (!termoBusca) {
      alert('Digite um nome, CPF ou CNPJ para buscar');
      return;
    }
    
    try {
      // Simulando uma API real
      clienteSelecionado = {
        id: '1',
        nome: 'Cliente Exemplo',
        documento: '123.456.789-00',
        contato: '(11) 98765-4321',
        categoria: 'varejo'
      };
      
      preencherDadosCliente(clienteSelecionado);
    } catch (error) {
      console.error('Erro ao buscar cliente:', error);
      alert('Erro ao buscar cliente. Tente novamente.');
    }
  });
  
  // Preencher dados do cliente no formulário
  const preencherDadosCliente = (cliente) => {
    clienteNome.value = cliente.nome;
    clienteDocumento.value = cliente.documento;
    clienteContato.value = cliente.contato;
    clienteCategoria.value = cliente.categoria;
  };
  
  // Buscar produto
  btnBuscarProduto.addEventListener('click', async () => {
    const termoBusca = produtoBusca.value.trim();
    if (!termoBusca) {
      alert('Digite um nome ou código de produto para buscar');
      return;
    }
    
    try {
      // Simulando uma API real
      const produto = {
        id: Math.random().toString(36).substr(2, 9),
        codigo: 'P' + Math.floor(Math.random() * 1000),
        nome: 'Produto ' + termoBusca,
        preco: Math.floor(Math.random() * 100) + 10,
        unidade: 'un'
      };
      
      adicionarProduto(produto);
      produtoBusca.value = '';
    } catch (error) {
      console.error('Erro ao buscar produto:', error);
      alert('Erro ao buscar produto. Tente novamente.');
    }
  });
  
  // Adicionar produto ao orçamento
  const adicionarProduto = (produto) => {
    // Verificar se o produto já está no orçamento
    const existente = produtos.find(p => p.id === produto.id);
    if (existente) {
      existente.quantidade++;
      existente.subtotal = existente.quantidade * existente.preco;
    } else {
      const novoProduto = {
        ...produto,
        quantidade: 1,
        subtotal: produto.preco
      };
      produtos.push(novoProduto);
    }
    
    atualizarTabelaProdutos();
    calcularTotal();
  };
  
  // Atualizar tabela de produtos no orçamento
  const atualizarTabelaProdutos = () => {
    if (produtos.length === 0) {
      produtosOrcamento.innerHTML = `
        <tr>
          <td colspan="6" class="no-data">Nenhum produto adicionado</td>
        </tr>
      `;
      return;
    }
    
    produtosOrcamento.innerHTML = '';
    
    produtos.forEach((produto, index) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${produto.codigo}</td>
        <td>${produto.nome}</td>
        <td>
          <input type="number" 
            min="1" 
            value="${produto.quantidade}" 
            style="width: 60px; text-align: center;" 
            data-index="${index}" 
            class="quantidade-input">
        </td>
        <td>${formatarMoeda(produto.preco)}</td>
        <td>${formatarMoeda(produto.subtotal)}</td>
        <td>
          <button class="btn btn-sm btn-danger btn-remover" data-index="${index}">
            Remover
          </button>
        </td>
      `;
      produtosOrcamento.appendChild(row);
    });
    
    // Adicionar eventos aos botões de remover
    document.querySelectorAll('.btn-remover').forEach(btn => {
      btn.addEventListener('click', function() {
        const index = parseInt(this.dataset.index);
        produtos.splice(index, 1);
        atualizarTabelaProdutos();
        calcularTotal();
      });
    });
    
    // Adicionar eventos aos campos de quantidade
    document.querySelectorAll('.quantidade-input').forEach(input => {
      input.addEventListener('change', function() {
        const index = parseInt(this.dataset.index);
        const quantidade = parseInt(this.value);
        
        if (quantidade < 1) {
          this.value = 1;
          return;
        }
        
        produtos[index].quantidade = quantidade;
        produtos[index].subtotal = quantidade * produtos[index].preco;
        atualizarTabelaProdutos();
        calcularTotal();
      });
    });
  };
  
  // Calcular valores totais
  const calcularTotal = () => {
    subtotal = produtos.reduce((acc, produto) => acc + produto.subtotal, 0);
    total = subtotal - desconto;
    
    // Adicionar frete se houver
    if (temEntrega.value === 'sim' && valorFrete.value) {
      const frete = parseFloat(valorFrete.value);
      total += frete;
    }
    
    subtotalElement.textContent = formatarMoeda(subtotal);
    descontoElement.textContent = formatarMoeda(desconto);
    totalElement.textContent = formatarMoeda(total);
  };
  
  // Salvar orçamento
  btnSalvar.addEventListener('click', async () => {
    if (!clienteSelecionado) {
      alert('Selecione um cliente para o orçamento');
      return;
    }
    
    if (produtos.length === 0) {
      alert('Adicione pelo menos um produto ao orçamento');
      return;
    }
    
    if (!orcamentoValidade.value) {
      alert('Informe a data de validade do orçamento');
      return;
    }
    
    try {
      // Aqui você chamaria a API para salvar o orçamento
      alert('Orçamento salvo com sucesso!');
      limparFormulario();
      switchTab('listar');
      listarOrcamentos();
    } catch (error) {
      console.error('Erro ao salvar orçamento:', error);
      alert('Erro ao salvar orçamento. Tente novamente.');
    }
  });
  
  // Limpar formulário
  const limparFormulario = () => {
    clienteSelecionado = null;
    produtos = [];
    subtotal = 0;
    desconto = 0;
    total = 0;
    
    clienteBusca.value = '';
    clienteNome.value = '';
    clienteDocumento.value = '';
    clienteContato.value = '';
    clienteCategoria.value = '';
    produtoBusca.value = '';
    orcamentoValidade.value = '';
    orcamentoVendedor.value = '';
    orcamentoObservacoes.value = '';
    formaPagamento.value = 'a_vista';
    parcelas.value = '1';
    temEntrega.value = 'nao';
    valorFrete.value = '0.00';
    
    atualizarTabelaProdutos();
    calcularTotal();
  };
  
  // Filtrar orçamentos
  btnFiltrar.addEventListener('click', () => {
    listarOrcamentos();
  });
  
  // Listar orçamentos
  const listarOrcamentos = async () => {
    // Em uma implementação real, você faria uma chamada à API aqui
    // Por enquanto, exibir uma tabela vazia
    exibirOrcamentos([]);
  };
  
  // Exibir orçamentos na tabela
  const exibirOrcamentos = (orcamentos) => {
    orcamentosTable.innerHTML = '';
    
    if (orcamentos.length === 0) {
      orcamentosTable.innerHTML = `
        <tr>
          <td colspan="7" class="no-data">Nenhum orçamento encontrado</td>
        </tr>
      `;
      return;
    }
    
    orcamentos.forEach(orcamento => {
      const row = document.createElement('tr');
      
      row.innerHTML = `
        <td>${orcamento.codigo}</td>
        <td>${orcamento.cliente}</td>
        <td>${orcamento.data}</td>
        <td>${orcamento.validade}</td>
        <td>${formatarMoeda(orcamento.valor)}</td>
        <td><span class="status-badge status-${orcamento.status}">${formatarStatus(orcamento.status)}</span></td>
        <td>
          <div class="action-buttons">
            <button class="btn btn-sm btn-info btn-ver" data-codigo="${orcamento.codigo}">Ver</button>
            ${getBotoesAcao(orcamento.status, orcamento.codigo)}
          </div>
        </td>
      `;
      
      orcamentosTable.appendChild(row);
    });
    
    // Adicionar eventos aos botões
    document.querySelectorAll('.btn-ver').forEach(btn => {
      btn.addEventListener('click', function() {
        const codigo = this.dataset.codigo;
        alert(`Visualizando orçamento ${codigo}`);
      });
    });
    
    document.querySelectorAll('.btn-aprovar').forEach(btn => {
      btn.addEventListener('click', function() {
        const codigo = this.dataset.codigo;
        alert(`Orçamento ${codigo} aprovado!`);
        listarOrcamentos();
      });
    });
    
    document.querySelectorAll('.btn-recusar').forEach(btn => {
      btn.addEventListener('click', function() {
        const codigo = this.dataset.codigo;
        alert(`Orçamento ${codigo} recusado!`);
        listarOrcamentos();
      });
    });
    
    document.querySelectorAll('.btn-converter').forEach(btn => {
      btn.addEventListener('click', function() {
        const codigo = this.dataset.codigo;
        alert(`Convertendo orçamento ${codigo} em venda...`);
        listarOrcamentos();
      });
    });
  };
  
  // Obter botões de ação conforme o status
  const getBotoesAcao = (status, codigo) => {
    switch (status) {
      case 'aberto':
        return `
          <button class="btn btn-sm btn-success btn-aprovar" data-codigo="${codigo}">Aprovar</button>
          <button class="btn btn-sm btn-danger btn-recusar" data-codigo="${codigo}">Recusar</button>
        `;
      case 'aprovado':
        return `<button class="btn btn-sm btn-primary btn-converter" data-codigo="${codigo}">Converter</button>`;
      default:
        return '';
    }
  };
  
  // Formatar status para exibição
  const formatarStatus = (status) => {
    const statusMap = {
      'aberto': 'Aberto',
      'aprovado': 'Aprovado',
      'recusado': 'Recusado',
      'convertido': 'Convertido',
      'vencido': 'Vencido'
    };
    
    return statusMap[status] || status;
  };
  
  // Configurar data de validade padrão (15 dias a partir de hoje)
  const configurarDataValidade = () => {
    const hoje = new Date();
    const validade = new Date();
    validade.setDate(hoje.getDate() + 15);
    
    orcamentoValidade.value = validade.toISOString().split('T')[0];
  };
  
  // Carregar dados iniciais
  const inicializar = () => {
    configurarDataValidade();
    listarOrcamentos();
  };
  
  // Executar inicialização
  inicializar();
});
