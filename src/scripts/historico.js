document.addEventListener('DOMContentLoaded', () => {
  // Elementos do DOM
  const dataInicio = document.getElementById('data-inicio');
  const dataFim = document.getElementById('data-fim');
  const clienteInput = document.getElementById('cliente');
  const vendedorSelect = document.getElementById('vendedor');
  const formaPagamento = document.getElementById('forma-pagamento');
  const btnFiltrar = document.getElementById('btn-filtrar');
  const btnLimpar = document.getElementById('btn-limpar');
  const btnVoltar = document.getElementById('btn-voltar');
  const vendasBody = document.getElementById('vendas-body');
  const paginationDiv = document.getElementById('pagination');
  const detalheVenda = document.getElementById('detalhe-venda');
  const codigoVenda = document.getElementById('codigo-venda');
  const infoValor = document.getElementById('info-valor');
  const infoPagamento = document.getElementById('info-pagamento');
  const itensVenda = document.getElementById('itens-venda');
  
  // Estado da aplicação
  let vendasData = [];
  let currentPage = 1;
  let itemsPerPage = 20;
  let totalPages = 0;
  let vendedores = [];
  let vendaSelecionada = null;
  
  // Funções de formatação
  const formatarData = (data) => {
    if (!data) return '-';
    const options = { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    return new Date(data).toLocaleDateString('pt-BR', options);
  };
  
  const formatarMoeda = (valor) => {
    return `R$ ${parseFloat(valor).toFixed(2).replace('.', ',')}`;
  };
  
  const formatarMetodoPagamento = (metodo) => {
    const metodos = {
      dinheiro: 'Dinheiro',
      cartao_credito: 'Cartão de Crédito',
      cartao_debito: 'Cartão de Débito',
      pix: 'PIX'
    };
    return metodos[metodo] || metodo;
  };
  
  // Carregar vendedores para o filtro
  const carregarVendedores = async () => {
    try {
      vendedores = await window.vendasAPI.getVendedores();
      
      // Limpar opções atuais
      vendedorSelect.innerHTML = '<option value="">Todos os vendedores</option>';
      
      // Adicionar vendedores ao select
      vendedores.forEach(vendedor => {
        const option = document.createElement('option');
        option.value = vendedor.id;
        option.textContent = vendedor.nome;
        vendedorSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Erro ao carregar vendedores:', error);
    }
  };
  
  // Buscar vendas com filtros
  const buscarVendas = async () => {
    const filtros = {
      dataInicio: dataInicio.value || null,
      dataFim: dataFim.value || null,
      cliente: clienteInput.value.trim() || null,
      vendedor: vendedorSelect.value || null,
      formaPagamento: formaPagamento.value || null,
      pagina: currentPage,
      itensPorPagina: itemsPerPage
    };
    
    try {
      const resultado = await window.vendasAPI.buscarVendas(filtros);
      vendasData = resultado.vendas;
      totalPages = Math.ceil(resultado.total / itemsPerPage);
      
      renderizarVendas();
      renderizarPaginacao();
      
      // Ocultar detalhes se estiver mostrando
      detalheVenda.style.display = 'none';
      vendaSelecionada = null;
    } catch (error) {
      console.error('Erro ao buscar vendas:', error);
      vendasBody.innerHTML = `
        <tr>
          <td colspan="8" class="no-data">
            Erro ao carregar dados. Tente novamente.
          </td>
        </tr>
      `;
    }
  };
  
  // Renderizar vendas na tabela
  const renderizarVendas = () => {
    vendasBody.innerHTML = '';
    
    if (!vendasData || vendasData.length === 0) {
      vendasBody.innerHTML = `
        <tr>
          <td colspan="8" class="no-data">
            Nenhuma venda encontrada com os filtros aplicados.
          </td>
        </tr>
      `;
      return;
    }
    
    vendasData.forEach(venda => {
      const row = document.createElement('tr');
      row.dataset.id = venda._id;
      
      // Adicionar classe se for a venda selecionada
      if (vendaSelecionada && vendaSelecionada._id === venda._id) {
        row.classList.add('venda-selecionada');
      }
      
      const statusClass = `status-${venda.status.toLowerCase()}`;
      
      row.innerHTML = `
        <td>${venda.codigo}</td>
        <td>${formatarData(venda.dataVenda)}</td>
        <td>${venda.cliente?.nome || '-'}</td>
        <td>${venda.nomeVendedor}</td>
        <td>${venda.itens.length}</td>
        <td>${formatarMoeda(venda.total)}</td>
        <td class="metodo-pagamento">${formatarMetodoPagamento(venda.pagamento.metodo)}</td>
        <td><span class="status-badge ${statusClass}">${venda.status}</span></td>
      `;
      
      vendasBody.appendChild(row);
      
      // Adicionar evento de clique para mostrar detalhes
      row.addEventListener('click', () => exibirDetalhesVenda(venda));
    });
  };
  
  // Renderizar paginação
  const renderizarPaginacao = () => {
    paginationDiv.innerHTML = '';
    
    if (totalPages <= 1) return;
    
    // Botão anterior
    const prevButton = document.createElement('button');
    prevButton.textContent = '«';
    prevButton.disabled = currentPage === 1;
    prevButton.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        buscarVendas();
      }
    });
    paginationDiv.appendChild(prevButton);
    
    // Limitar número de botões de página
    let startPage = Math.max(1, currentPage - 2);
    let endPage = Math.min(totalPages, startPage + 4);
    
    if (endPage - startPage < 4) {
      startPage = Math.max(1, endPage - 4);
    }
    
    // Primeira página sempre visível
    if (startPage > 1) {
      const pageButton = document.createElement('button');
      pageButton.textContent = 1;
      pageButton.addEventListener('click', () => {
        currentPage = 1;
        buscarVendas();
      });
      paginationDiv.appendChild(pageButton);
      
      if (startPage > 2) {
        const ellipsis = document.createElement('span');
        ellipsis.textContent = '...';
        ellipsis.style.margin = '0 5px';
        paginationDiv.appendChild(ellipsis);
      }
    }
    
    // Páginas numeradas
    for (let i = startPage; i <= endPage; i++) {
      const pageButton = document.createElement('button');
      pageButton.textContent = i;
      pageButton.className = currentPage === i ? 'active' : '';
      pageButton.addEventListener('click', () => {
        currentPage = i;
        buscarVendas();
      });
      paginationDiv.appendChild(pageButton);
    }
    
    // Última página sempre visível
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        const ellipsis = document.createElement('span');
        ellipsis.textContent = '...';
        ellipsis.style.margin = '0 5px';
        paginationDiv.appendChild(ellipsis);
      }
      
      const pageButton = document.createElement('button');
      pageButton.textContent = totalPages;
      pageButton.addEventListener('click', () => {
        currentPage = totalPages;
        buscarVendas();
      });
      paginationDiv.appendChild(pageButton);
    }
    
    // Botão próximo
    const nextButton = document.createElement('button');
    nextButton.textContent = '»';
    nextButton.disabled = currentPage === totalPages;
    nextButton.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        buscarVendas();
      }
    });
    paginationDiv.appendChild(nextButton);
  };
  
  // Exibir detalhes da venda
  const exibirDetalhesVenda = (venda) => {
    // Atualizar venda selecionada
    vendaSelecionada = venda;
    
    // Remover seleção anterior
    const selectedRow = document.querySelector('.venda-selecionada');
    if (selectedRow) {
      selectedRow.classList.remove('venda-selecionada');
    }
    
    // Adicionar seleção à linha atual
    const currentRow = document.querySelector(`tr[data-id="${venda._id}"]`);
    if (currentRow) {
      currentRow.classList.add('venda-selecionada');
    }
    
    // Atualizar cabeçalho dos detalhes
    codigoVenda.textContent = venda.codigo;
    infoValor.textContent = `Total: ${formatarMoeda(venda.total)}`;
    infoPagamento.textContent = `Pagamento: ${formatarMetodoPagamento(venda.pagamento.metodo)}`;
    
    // Limpar tabela de itens
    itensVenda.innerHTML = '';
    
    // Adicionar itens à tabela
    venda.itens.forEach(item => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${item.codigoProduto}</td>
        <td>${item.nomeProduto}</td>
        <td>${item.quantidade}</td>
        <td>${formatarMoeda(item.precoUnitario)}</td>
        <td>${formatarMoeda(item.subtotal)}</td>
      `;
      itensVenda.appendChild(row);
    });
    
    // Exibir os detalhes
    detalheVenda.style.display = 'block';
    
    // Scroll para os detalhes
    detalheVenda.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  
  // Limpar filtros
  const limparFiltros = () => {
    dataInicio.value = '';
    dataFim.value = '';
    clienteInput.value = '';
    vendedorSelect.value = '';
    formaPagamento.value = '';
    currentPage = 1;
    buscarVendas();
  };
  
  // Configurar datas padrão (últimos 30 dias)
  const configurarDatasIniciais = () => {
    const hoje = new Date();
    const trintaDiasAtras = new Date();
    trintaDiasAtras.setDate(hoje.getDate() - 30);
    
    dataFim.value = hoje.toISOString().split('T')[0];
    dataInicio.value = trintaDiasAtras.toISOString().split('T')[0];
  };
  
  // Event Listeners
  btnFiltrar.addEventListener('click', () => {
    currentPage = 1;
    buscarVendas();
  });
  
  btnLimpar.addEventListener('click', limparFiltros);
  
  // Botão voltar
  btnVoltar.addEventListener('click', () => {
    window.location.href = 'main.html';
  });
  
  // Inicializar a página
  configurarDatasIniciais();
  carregarVendedores();
  buscarVendas();
});
