document.addEventListener('DOMContentLoaded', () => {
  // Elementos do DOM
  const periodoSelect = document.getElementById('periodo');
  const dataInicio = document.getElementById('data-inicio');
  const dataFim = document.getElementById('data-fim');
  const vendedorSelect = document.getElementById('vendedor');
  const btnGerar = document.getElementById('btn-gerar');
  const btnVoltar = document.getElementById('btn-voltar');
  const periodoPersonalizadoCampos = document.querySelectorAll('.periodo-personalizado');
  const periodoExibido = document.getElementById('periodo-exibido');
  
  // Elementos para exportação
  const btnPDF = document.getElementById('btn-pdf');
  const btnExcel = document.getElementById('btn-excel');
  
  // Elementos de resumo
  const totalVendas = document.getElementById('total-vendas');
  const ticketMedio = document.getElementById('ticket-medio');
  const qtdVendas = document.getElementById('qtd-vendas');
  const totalItens = document.getElementById('total-itens');
  const totalCaixa = document.getElementById('total-caixa');
  const detailCaixa = document.getElementById('detail-caixa');
  const produtosTable = document.getElementById('produtos-table');
  const retiradasTable = document.getElementById('retiradas-table');
  const totalRetiradasDisplay = document.getElementById('total-retiradas');
  
  // Elementos para gráficos
  const chartVendasDia = document.getElementById('chart-vendas-dia');
  const chartPagamentos = document.getElementById('chart-pagamentos');
  
  // Referências dos gráficos
  let vendasDiaChart = null;
  let pagamentosChart = null;
  
  // Estado atual
  let currentPeriod = '7dias';
  let currentVendedor = '';
  let vendedores = [];
  let dadosRelatorio = null;
  
  // Cores para gráficos
  const coresPagamentos = {
    dinheiro: '#4CAF50',
    cartao_credito: '#2196F3',
    cartao_debito: '#9C27B0',
    pix: '#FF9800',
    fiado: '#FF5722',
    default: '#607D8B'
  };
  
  // Formatação de valores
  const formatarMoeda = (valor) => {
    const numero = Number(valor);
    return (Number.isFinite(numero) ? numero : 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  const dataLocal = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
  
  const formatarDataExibicao = (data) => {
    try {
      if (!data) return '';
      const dataObj = /^\d{4}-\d{2}-\d{2}$/.test(data) ? new Date(`${data}T12:00:00`) : new Date(data);
      if (isNaN(dataObj.getTime())) {
        return '';
      }
      return dataObj.toLocaleDateString('pt-BR');
    } catch (e) {
      console.error('Erro ao formatar data:', e);
      return '';
    }
  };
  
  // Formatar nome do método de pagamento
  const formatarMetodo = (metodo) => {
    const metodos = {
      dinheiro: 'Dinheiro',
      cartao_credito: 'Cartão de Crédito',
      cartao_debito: 'Cartão de Débito',
      pix: 'PIX',
      fiado: 'Fiado'
    };
    return metodos[metodo] || metodo;
  };
  
  // Verificar se um elemento existe no DOM
  const elementoExiste = (elemento) => {
    return elemento !== null && elemento !== undefined;
  };
  
  // Verificação inicial de elementos críticos da UI
  const verificarElementos = () => {
    const elementosCriticos = [
      { el: periodoSelect, nome: 'Seletor de Período' },
      { el: btnGerar, nome: 'Botão Gerar Relatório' },
      { el: totalVendas, nome: 'Total de Vendas' },
      { el: chartVendasDia, nome: 'Gráfico de Vendas por Dia' },
      { el: chartPagamentos, nome: 'Gráfico de Métodos de Pagamento' },
      { el: produtosTable, nome: 'Tabela de Produtos' }
    ];
    
    let elementosFaltando = elementosCriticos
      .filter(({ el }) => !elementoExiste(el))
      .map(({ nome }) => nome);
    
    if (elementosFaltando.length > 0) {
      console.error('Elementos críticos faltando na página:', elementosFaltando.join(', '));
      alert(`Erro: Elementos faltando na página: ${elementosFaltando.join(', ')}`);
      return false;
    }
    
    return true;
  };
  
  // Mostrar ou ocultar campos de período personalizado
  if (elementoExiste(periodoSelect)) {
    periodoSelect.addEventListener('change', () => {
      const selecionado = periodoSelect.value;
      currentPeriod = selecionado;
      
      if (selecionado === 'personalizado') {
        periodoPersonalizadoCampos.forEach(campo => {
          campo.style.display = 'block';
        });
        
        // Configurar datas padrão caso não estejam definidas
        if (!dataInicio.value) {
          const dataDefault = new Date();
          dataDefault.setDate(dataDefault.getDate() - 6);
          dataInicio.value = dataLocal(dataDefault);
        }
        
        if (!dataFim.value) {
          const hoje = new Date();
          dataFim.value = dataLocal(hoje);
        }
      } else {
        periodoPersonalizadoCampos.forEach(campo => {
          campo.style.display = 'none';
        });
      }
      
      // Atualizar texto do período após mudança
      atualizarTextoPeriodo();
    });
  }
  
  // Carregar vendedores
  const carregarVendedores = async () => {
    try {
      if (!elementoExiste(vendedorSelect)) {
        console.warn("Elemento de seleção de vendedor não encontrado");
        return;
      }
      
      if (!window.vendasAPI || !window.vendasAPI.getVendedores) {
        console.error("API de vendedores não disponível");
        vendedorSelect.innerHTML = '<option value="">API vendedores não disponível</option>';
        vendedorSelect.disabled = true;
        return;
      }
      
      console.log("Carregando vendedores...");
      const resultado = await window.vendasAPI.getVendedores();
      
      if (!resultado || !Array.isArray(resultado)) {
        console.error("Resposta inválida ao carregar vendedores:", resultado);
        vendedorSelect.innerHTML = '<option value="">Erro ao carregar vendedores</option>';
        return;
      }
      
      vendedores = resultado;
      console.log(`Carregados ${vendedores.length} vendedores`);
      
      // Limpar opções anteriores
      vendedorSelect.innerHTML = '<option value="">Todos os vendedores</option>';
      
      // Adicionar vendedores
      vendedores.forEach(vendedor => {
        if (!vendedor || !vendedor.id || !vendedor.nome) return;
        
        const option = document.createElement('option');
        option.value = vendedor.id;
        option.textContent = vendedor.nome;
        vendedorSelect.appendChild(option);
      });
    } catch (error) {
      console.error('Erro ao carregar vendedores:', error);
      vendedorSelect.replaceChildren(new Option('Erro ao carregar vendedores', ''));
    }
  };
  
  // Definir períodos com mais precisão
  const definirPeriodo = () => {
    const hoje = new Date();
    let inicio = new Date();
    let fim = new Date();
    
    switch (currentPeriod) {
      case 'hoje':
        inicio.setHours(0, 0, 0, 0);
        fim.setHours(23, 59, 59, 999);
        break;
      
      case 'ontem':
        inicio.setDate(hoje.getDate() - 1);
        inicio.setHours(0, 0, 0, 0);
        fim.setDate(hoje.getDate() - 1);
        fim.setHours(23, 59, 59, 999);
        break;
      
      case '7dias':
        inicio.setDate(hoje.getDate() - 6);
        inicio.setHours(0, 0, 0, 0);
        fim.setHours(23, 59, 59, 999);
        break;
      
      case '30dias':
        inicio.setDate(hoje.getDate() - 29);
        inicio.setHours(0, 0, 0, 0);
        fim.setHours(23, 59, 59, 999);
        break;
      
      case 'personalizado':
        if (!dataInicio.value || !dataFim.value) throw new Error('Informe as duas datas do período.');
        if (dataInicio.value > dataFim.value) throw new Error('A data inicial deve ser anterior à data final.');
        return { inicio: dataInicio.value, fim: dataFim.value };
        break;
    }
    
    // Verificar se as datas são válidas
    if (isNaN(inicio.getTime()) || isNaN(fim.getTime())) throw new Error('Período inválido.');
    
    // Formatar para string
    const inicioStr = dataLocal(inicio);
    const fimStr = dataLocal(fim);
    
    console.log(`Período definido: ${inicioStr} até ${fimStr}`);
    
    return {
      inicio: inicioStr,
      fim: fimStr,
      inicioObj: inicio,
      fimObj: fim
    };
  };
  
  // Atualizar o texto do período exibido
  const atualizarTextoPeriodo = () => {
    if (!elementoExiste(periodoExibido)) {
      console.warn("Elemento de período exibido não encontrado");
      return;
    }
    
    let periodo;
    try { periodo = definirPeriodo(); }
    catch (error) { periodoExibido.textContent = error.message; return; }
    
    let texto = 'Exibindo dados ';
    
    switch (currentPeriod) {
      case 'hoje':
        texto += 'de hoje';
        break;
      case 'ontem':
        texto += 'de ontem';
        break;
      case '7dias':
        texto += 'dos últimos 7 dias';
        break;
      case '30dias':
        texto += 'dos últimos 30 dias';
        break;
      case 'personalizado':
        // Formatar as datas para exibição no formato brasileiro
        const dataInicioStr = formatarDataExibicao(periodo.inicio);
        const dataFimStr = formatarDataExibicao(periodo.fim);
        
        texto += `do período de ${dataInicioStr} até ${dataFimStr}`;
        break;
    }
    
    // Adicionar informação do vendedor, se selecionado
    if (currentVendedor) {
      const vendedor = vendedores.find(v => v && v.id === currentVendedor);
      if (vendedor) {
        texto += ` (Vendedor: ${vendedor.nome})`;
      }
    }
    
    console.log("Texto de período atualizado:", texto);
    periodoExibido.textContent = texto;
  };
  
  // Verificar se a API de relatórios está disponível
  const verificarAPIRelatorios = () => {
    if (!window.relatoriosAPI) {
      console.error("API de relatórios (window.relatoriosAPI) não está disponível");
      mostrarErro("API de relatórios não está disponível no sistema");
      return false;
    }
    
    if (!window.relatoriosAPI.gerarRelatorio) {
      console.error("Método gerarRelatorio não está disponível na API");
      mostrarErro("Função de geração de relatório não implementada");
      return false;
    }
    
    return true;
  };
  
  // Gerar relatório
  const gerarRelatorio = async () => {
    try {
      if (!verificarElementos()) return;
      
      // Verificar API de relatórios
      if (!verificarAPIRelatorios()) return;
      
      const periodo = definirPeriodo();
      dadosRelatorio = null;
      if (btnPDF) btnPDF.disabled = true;
      if (btnExcel) btnExcel.disabled = true;
      // Feedback visual de início do processamento
      btnGerar.disabled = true;
      btnGerar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...';
      
      // Mostrar loaders nos cards e gráficos
      exibirLoading();
      
      // Obter dados para filtro
      currentVendedor = elementoExiste(vendedorSelect) ? vendedorSelect.value : '';
      
      // Atualizar texto do período
      atualizarTextoPeriodo();
      
      // Log dos filtros que serão enviados
      console.log("Gerando relatório com filtros:", {
        dataInicio: periodo.inicio,
        dataFim: periodo.fim,
        vendedor: currentVendedor || null
      });
      
      const resultado = await window.relatoriosAPI.gerarRelatorio({
        dataInicio: periodo.inicio,
        dataFim: periodo.fim,
        vendedor: currentVendedor || null
      });
      
      console.log("Resposta recebida do servidor:", resultado);
      
      // Verificar erro na resposta
      if (!resultado || resultado.error === true) {
        throw new Error(resultado.message || 'Erro desconhecido ao gerar relatório');
      }
      
      // Adicionar filtros aos dados do relatório para exportação
      resultado.filtros = {
        dataInicio: periodo.inicio,
        dataFim: periodo.fim,
        vendedor: currentVendedor || null
      };
      
      // Atualizar estado global
      dadosRelatorio = resultado;
      document.querySelector('.error-alert')?.remove();
      if (btnPDF) btnPDF.disabled = false;
      if (btnExcel) btnExcel.disabled = false;
      
      // Atualizar UI com os dados recebidos
      await atualizarDadosUI(resultado);
      
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      // Resetar UI para valores vazios
      resetarUI();
      mostrarErro(error.message || 'Erro ao gerar relatório');
    } finally {
      // Restaurar botão de gerar relatório
      if (elementoExiste(btnGerar)) {
        btnGerar.disabled = false;
        btnGerar.innerHTML = '<i class="fas fa-sync-alt"></i> Gerar Relatório';
      }
    }
  };
  
  // Exibir indicadores de carregamento
  const exibirLoading = () => {
    const loadingHTML = '<i class="fas fa-spinner fa-spin"></i>';
    
    if (elementoExiste(totalVendas)) totalVendas.innerHTML = loadingHTML;
    if (elementoExiste(ticketMedio)) ticketMedio.innerHTML = loadingHTML;
    if (elementoExiste(qtdVendas)) qtdVendas.innerHTML = loadingHTML;
    if (elementoExiste(totalItens)) totalItens.innerHTML = loadingHTML;
    
    if (elementoExiste(chartVendasDia)) {
      chartVendasDia.innerHTML = '<div class="msg-container"><i class="fas fa-spinner fa-spin"></i> Carregando dados...</div>';
    }
    
    if (elementoExiste(chartPagamentos)) {
      chartPagamentos.innerHTML = '<div class="msg-container"><i class="fas fa-spinner fa-spin"></i> Carregando dados...</div>';
    }
    
    if (elementoExiste(produtosTable)) {
      produtosTable.innerHTML = '<tr><td colspan="4" class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando produtos...</td></tr>';
    }
  };
  
  // Atualizar interface com os dados recebidos
  const atualizarDadosUI = async (dados) => {
    if (!dados) {
      console.error("Dados nulos recebidos");
      mostrarErro("Dados não disponíveis");
      return;
    }
    
    // Obter período atual para usar nas funções que precisam dos filtros
    const periodo = definirPeriodo();
    
    // Verificar e atribuir valores padrão se faltarem dados
    const totalVendasValor = parseFloat(dados.totalVendas) || 0;
    const ticketMedioValor = parseFloat(dados.ticketMedio) || 0;
    const qtdVendasValor = dados.qtdVendas || 0;
    const totalItensValor = dados.totalItens || 0;
    
    // Atualizar cards de resumo com os valores
    if (elementoExiste(totalVendas)) totalVendas.textContent = formatarMoeda(totalVendasValor);
    if (elementoExiste(ticketMedio)) ticketMedio.textContent = formatarMoeda(ticketMedioValor);
    if (elementoExiste(qtdVendas)) qtdVendas.textContent = qtdVendasValor.toString();
    if (elementoExiste(totalItens)) totalItens.textContent = totalItensValor.toString();
    
    // Verificar dados para tabela e gráficos
    if (elementoExiste(produtosTable)) {
      if (Array.isArray(dados.produtosMaisVendidos)) {
        atualizarTabelaProdutos(dados.produtosMaisVendidos);
      } else {
        console.warn("Dados de produtos inválidos:", dados.produtosMaisVendidos);
        atualizarTabelaProdutos([]);
      }
    }

    // Carregar retiradas
    const adicionais = [];
    if (elementoExiste(retiradasTable)) adicionais.push(carregarRetiradas(periodo.inicio, periodo.fim));
    if (elementoExiste(totalCaixa)) adicionais.push(carregarTotalCaixa(periodo.inicio, periodo.fim));
    
    if (elementoExiste(chartVendasDia)) {
      if (Array.isArray(dados.vendasPorDia)) {
        criarGraficoVendasPorDia(dados.vendasPorDia);
      } else {
        console.warn("Dados de vendas por dia inválidos:", dados.vendasPorDia);
        chartVendasDia.innerHTML = '<div class="msg-container">Não há vendas para exibir no gráfico</div>';
      }
    }
    
    if (elementoExiste(chartPagamentos)) {
      if (Array.isArray(dados.vendasPorMetodo)) {
        criarGraficoPagamentos(dados.vendasPorMetodo);
      } else {
        console.warn("Dados de vendas por método inválidos:", dados.vendasPorMetodo);
        chartPagamentos.innerHTML = '<div class="msg-container">Não há dados de pagamento para exibir</div>';
      }
    }
    await Promise.all(adicionais);
  };
  
  // Resetar interface para valores vazios
  const resetarUI = () => {
    dadosRelatorio = null;
    if (btnPDF) btnPDF.disabled = true;
    if (btnExcel) btnExcel.disabled = true;
    
    if (elementoExiste(totalVendas)) totalVendas.textContent = formatarMoeda(0);
    if (elementoExiste(ticketMedio)) ticketMedio.textContent = formatarMoeda(0);
    if (elementoExiste(qtdVendas)) qtdVendas.textContent = '0';
    if (elementoExiste(totalItens)) totalItens.textContent = '0';
    if (elementoExiste(totalCaixa)) totalCaixa.textContent = '—';
    if (elementoExiste(detailCaixa)) detailCaixa.textContent = 'Saldo indisponível';
    atualizarTabelaRetiradas([]);
    
    if (elementoExiste(produtosTable)) {
      produtosTable.innerHTML = '<tr><td colspan="4" class="msg-container">Nenhum dado disponível</td></tr>';
    }
    
    if (elementoExiste(chartVendasDia)) {
      chartVendasDia.innerHTML = '<div class="msg-container">Nenhum dado disponível</div>';
    }
    
    if (elementoExiste(chartPagamentos)) {
      chartPagamentos.innerHTML = '<div class="msg-container">Nenhum dado disponível</div>';
    }
  };
  
  // Mostrar mensagem de erro
  const mostrarErro = (mensagem) => {
    console.error("ERRO:", mensagem);
    
    const errorAlert = document.createElement('div');
    errorAlert.className = 'error-alert';
    errorAlert.textContent = `Erro: ${mensagem}`;
    
    const container = document.querySelector('.container');
    if (!container) {
      alert(`Erro: ${mensagem}`);
      return;
    }
    
    const existingError = container.querySelector('.error-alert');
    if (existingError) {
      container.removeChild(existingError);
    }
    
    const cardsGrid = document.querySelector('.cards-grid');
    if (cardsGrid) {
      container.insertBefore(errorAlert, cardsGrid);
    } else {
      container.insertBefore(errorAlert, container.firstChild);
    }
    
  };
  
  // Eventos para datas personalizadas
  if (elementoExiste(dataInicio)) {
    dataInicio.addEventListener('change', () => {
      if (currentPeriod === 'personalizado') {
        atualizarTextoPeriodo();
      }
    });
  }
  
  if (elementoExiste(dataFim)) {
    dataFim.addEventListener('change', () => {
      if (currentPeriod === 'personalizado') {
        atualizarTextoPeriodo();
      }
    });
  }
  
  // Atualizar ao mudar vendedor
  if (elementoExiste(vendedorSelect)) {
    vendedorSelect.addEventListener('change', () => {
      currentVendedor = vendedorSelect.value;
      atualizarTextoPeriodo();
    });
  }
  
  // Botão para gerar relatório
  if (elementoExiste(btnGerar)) {
    btnGerar.addEventListener('click', () => {
      console.log("Botão Gerar Relatório clicado");
      // Remover handlers duplicados
      btnGerar.removeEventListener('click', gerarRelatorio);
      gerarRelatorio();
    });
  }
  
  // Botão para voltar
  if (elementoExiste(btnVoltar)) {
    if (btnVoltar.tagName === 'A') {
      console.log('Botão voltar é um link, não é necessário adicionar event listener');
    } else {
      btnVoltar.addEventListener('click', () => {
        window.location.href = 'main.html';
      });
    }
  }
  
  // Atualizar tabela de produtos
  const atualizarTabelaProdutos = (produtos) => {
    if (!elementoExiste(produtosTable)) {
      console.error("Elemento de tabela de produtos não encontrado");
      return;
    }
    
    produtosTable.innerHTML = '';
    
    if (!produtos || !Array.isArray(produtos) || produtos.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td colspan="4" class="msg-container">Nenhum produto vendido no período</td>
      `;
      produtosTable.appendChild(row);
      return;
    }
    
    produtos.forEach((produto, index) => {
      if (!produto || typeof produto !== 'object') return;
      
      const row = document.createElement('tr');
      
      if (index < 3) {
        row.classList.add('top-produto');
      }
      
      [produto.codigo || 'N/A', produto.nome || 'Produto sem nome', produto.quantidade || 0, formatarMoeda(produto.total || 0)]
        .forEach(valor => { const td = row.insertCell(); td.textContent = String(valor); });
      produtosTable.appendChild(row);
    });
  };

  const criarGraficoSimples = (container, dados, chave, rotulo) => {
    container.replaceChildren();
    const validos = (Array.isArray(dados) ? dados : []).filter(item => item && Number.isFinite(Number(item.total)) && Number(item.total) >= 0);
    if (!validos.length) {
      const vazio = document.createElement('div');
      vazio.className = 'msg-container';
      vazio.textContent = 'Sem dados para exibir';
      container.appendChild(vazio);
      return;
    }
    const maior = Math.max(...validos.map(item => Number(item.total)), 1);
    const grafico = document.createElement('div');
    grafico.className = 'simple-chart';
    validos.forEach(item => {
      const linha = document.createElement('div');
      linha.className = 'simple-chart-row';
      const nome = document.createElement('span');
      nome.textContent = rotulo(item[chave]);
      const trilha = document.createElement('div');
      trilha.className = 'simple-chart-track';
      const barra = document.createElement('span');
      barra.className = 'simple-chart-bar';
      barra.style.width = `${Math.max(1, Number(item.total) / maior * 100)}%`;
      trilha.appendChild(barra);
      const valor = document.createElement('span');
      valor.className = 'simple-chart-value';
      valor.textContent = formatarMoeda(item.total);
      linha.append(nome, trilha, valor);
      grafico.appendChild(linha);
    });
    container.appendChild(grafico);
  };
  
  // Criar gráfico de vendas por dia
  const criarGraficoVendasPorDia = (dados) => {
    if (!elementoExiste(chartVendasDia)) {
      console.error("Elemento do gráfico de vendas por dia não encontrado");
      return;
    }
    
    // Verificar se Chart.js está disponível
    if (typeof Chart === 'undefined') {
      criarGraficoSimples(chartVendasDia, dados, 'data', formatarDataExibicao);
      return;
    }
    
    // Destruir gráfico anterior se existir
    if (vendasDiaChart) {
      try {
        vendasDiaChart.destroy();
      } catch (e) {
        console.error("Erro ao destruir gráfico anterior:", e);
      }
    }
    
    if (!dados || dados.length === 0) {
      chartVendasDia.innerHTML = '<div class="msg-container">Sem dados para exibir</div>';
      return;
    }
    
    try {
      const ctx = document.createElement('canvas');
      chartVendasDia.innerHTML = '';
      chartVendasDia.appendChild(ctx);
      
      // Garantir dados válidos
      const dadosFiltrados = dados.filter(item => item && item.data && !isNaN(parseFloat(item.total)));
      
      if (dadosFiltrados.length === 0) {
        chartVendasDia.innerHTML = '<div class="msg-container">Dados de vendas inválidos</div>';
        return;
      }
      
      const labels = dadosFiltrados.map(item => formatarDataExibicao(item.data));
      const values = dadosFiltrados.map(item => parseFloat(item.total) || 0);
      const quantities = dadosFiltrados.map(item => parseInt(item.quantidade) || 0);
      
      vendasDiaChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'Valor Total',
              data: values,
              backgroundColor: 'rgba(54, 162, 235, 0.7)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1,
              borderRadius: 4,
              yAxisID: 'y'
            },
            {
              label: 'Quantidade',
              data: quantities,
              backgroundColor: 'rgba(255, 159, 64, 0)',
              borderColor: 'rgba(255, 159, 64, 1)',
              borderWidth: 2,
              type: 'line',
              yAxisID: 'y1',
              tension: 0.3,
              pointBackgroundColor: 'rgba(255, 159, 64, 1)',
              pointRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: {
              beginAtZero: true,
              position: 'left',
              title: {
                display: true,
                text: 'Valor (R$)',
                color: '#666'
              },
              ticks: {
                callback: function(value) {
                  return 'R$ ' + value.toLocaleString('pt-BR');
                }
              }
            },
            y1: {
              beginAtZero: true,
              position: 'right',
              title: {
                display: true,
                text: 'Quantidade',
                color: '#666'
              },
              grid: {
                drawOnChartArea: false
              }
            },
            x: {
              grid: {
                display: false
              }
            }
          },
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 20,
                boxWidth: 15,
                usePointStyle: true
              }
            },
            tooltip: {
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              titleColor: '#333',
              bodyColor: '#555',
              borderColor: '#ddd',
              borderWidth: 1,
              padding: 12,
              boxPadding: 6,
              callbacks: {
                label: function(context) {
                  const label = context.dataset.label || '';
                  const value = context.raw;
                  
                  if (label === 'Valor Total') {
                    return `${label}: ${formatarMoeda(value)}`;
                  }
                  return `${label}: ${value}`;
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error("Erro ao criar gráfico de vendas por dia:", error);
      chartVendasDia.textContent = 'Erro ao criar gráfico.';
    }
  };
  
  // Criar gráfico de vendas por método de pagamento
  const criarGraficoPagamentos = (dados) => {
    if (!elementoExiste(chartPagamentos)) {
      console.error("Elemento do gráfico de pagamentos não encontrado");
      return;
    }
    
    // Verificar se Chart.js está disponível
    if (typeof Chart === 'undefined') {
      criarGraficoSimples(chartPagamentos, dados, 'metodo', formatarMetodo);
      return;
    }
    
    // Destruir gráfico anterior se existir
    if (pagamentosChart) {
      try {
        pagamentosChart.destroy();
      } catch (e) {
        console.error("Erro ao destruir gráfico anterior:", e);
      }
    }
    
    if (!dados || dados.length === 0) {
      chartPagamentos.innerHTML = '<div class="msg-container">Sem dados para exibir</div>';
      return;
    }
    
    try {
      const ctx = document.createElement('canvas');
      chartPagamentos.innerHTML = '';
      chartPagamentos.appendChild(ctx);
      
      // Garantir dados válidos
      const dadosFiltrados = dados.filter(item => 
        item && item.metodo && !isNaN(parseFloat(item.total))
      );
      
      if (dadosFiltrados.length === 0) {
        chartPagamentos.innerHTML = '<div class="msg-container">Dados de pagamentos inválidos</div>';
        return;
      }
      
      const labels = dadosFiltrados.map(item => formatarMetodo(item.metodo));
      const values = dadosFiltrados.map(item => parseFloat(item.total) || 0);
      const quantities = dadosFiltrados.map(item => parseInt(item.quantidade) || 0);
      const backgroundColors = dadosFiltrados.map(item => 
        coresPagamentos[item.metodo] || coresPagamentos.default
      );
      
      pagamentosChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [
            {
              data: values,
              backgroundColor: backgroundColors,
              borderColor: 'white',
              borderWidth: 2,
              hoverOffset: 8
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '65%',
          plugins: {
            legend: {
              position: 'bottom',
              labels: {
                padding: 15,
                boxWidth: 15,
                usePointStyle: true
              }
            },
            tooltip: {
              backgroundColor: 'rgba(255, 255, 255, 0.9)',
              titleColor: '#333',
              bodyColor: '#555',
              borderColor: '#ddd',
              borderWidth: 1,
              padding: 12,
              boxPadding: 6,
              callbacks: {
                label: function(context) {
                  const label = context.label || '';
                  const value = context.raw;
                  const totalSum = context.dataset.data.reduce((a, b) => a + b, 0);
                  const percentage = totalSum > 0 ? Math.round(value * 100 / totalSum) + '%' : '0%';
                  return `${label}: ${formatarMoeda(value)} (${percentage})`;
                }
              }
            }
          }
        }
      });
      
      // Adicionar informação sobre quantidade de vendas com design melhorado
      const subtitle = document.createElement('div');
      subtitle.className = 'chart-subtitle';
      subtitle.innerHTML = dadosFiltrados.map(item => 
        `<span style="color:${coresPagamentos[item.metodo] || coresPagamentos.default}; font-weight:500;">
          ${formatarMetodo(item.metodo)}: ${item.quantidade} ${item.quantidade === 1 ? 'venda' : 'vendas'}
         </span>`
      ).join(' &nbsp;|&nbsp; ');
      
      chartPagamentos.appendChild(subtitle);
    } catch (error) {
      console.error("Erro ao criar gráfico de pagamentos:", error);
      chartPagamentos.textContent = 'Erro ao criar gráfico.';
    }
  };
  
  // Carregar retiradas
  const carregarRetiradas = async (dataInicio, dataFim) => {
    try {
      console.log('carregarRetiradas chamado com:', { dataInicio, dataFim });
      
      if (!window.relatoriosAPI) {
        console.warn("API de relatórios não disponível para retiradas");
        return;
      }

      const parametros = {
        dataInicio: dataInicio,
        dataFim: dataFim
      };
      
      console.log('Chamando listarRetiradas com parâmetros:', parametros);
      const resultado = await window.relatoriosAPI.listarRetiradas(parametros);
      console.log('Resultado de listarRetiradas:', resultado);

      if (resultado && resultado.sucesso && Array.isArray(resultado.dados)) {
        atualizarTabelaRetiradas(resultado.dados);
      } else {
        throw new Error(resultado?.mensagem || 'Não foi possível carregar as retiradas.');
      }
    } catch (error) {
      console.error('Erro ao carregar retiradas:', error);
      retiradasTable.replaceChildren();
      const linha = retiradasTable.insertRow();
      const celula = linha.insertCell();
      celula.colSpan = 5;
      celula.textContent = 'Não foi possível carregar as retiradas.';
      totalRetiradasDisplay.parentElement.style.display = 'none';
    }
  };

  // Atualizar tabela de retiradas
  const atualizarTabelaRetiradas = (retiradas) => {
    if (!elementoExiste(retiradasTable)) {
      return;
    }

    if (!Array.isArray(retiradas) || retiradas.length === 0) {
      retiradasTable.innerHTML = '<tr><td colspan="5" class="msg-container">Nenhuma retirada registrada neste período</td></tr>';
      if (elementoExiste(totalRetiradasDisplay)) {
        totalRetiradasDisplay.parentElement.style.display = 'none';
      }
      return;
    }

    const totalRetirado = retiradas.reduce((sum, retirada) => sum + (Number(retirada.valor) || 0), 0);
    retiradasTable.replaceChildren();
    retiradas.forEach(retirada => {
      const dataHora = retirada.dataCriacao ? new Date(retirada.dataCriacao).toLocaleString('pt-BR') : 'N/A';
      const row = retiradasTable.insertRow();
      [dataHora, retirada.responsavel || 'N/A', formatarMoeda(retirada.valor || 0), retirada.motivo || '-', retirada.observacoes || '-']
        .forEach(valor => { const td = row.insertCell(); td.textContent = String(valor); });
    });

    if (elementoExiste(totalRetiradasDisplay)) {
      totalRetiradasDisplay.textContent = formatarMoeda(totalRetirado);
      totalRetiradasDisplay.parentElement.style.display = 'block';
    }
  };
  
  // Carregar total do caixa (vendas - retiradas) com filtros de período
  const carregarTotalCaixa = async (dataInicio, dataFim) => {
    try {
      console.log('carregarTotalCaixa chamada com parâmetros:', { dataInicio, dataFim });
      
      if (!window.electronAPI || !window.electronAPI.invoke) {
        console.warn("electronAPI não disponível para total do caixa");
        return;
      }

      // Usar o novo handler com filtros de período
      const filtros = {
        dataInicio: dataInicio,
        dataFim: dataFim
      };
      
      console.log('Enviando filtros para obter-saldo-caixa-periodo:', filtros);
      const resultado = await window.electronAPI.invoke('obter-saldo-caixa-periodo', filtros);
      console.log('Resultado do saldo do caixa com filtros:', resultado);

      if (resultado && resultado.sucesso) {
        const saldo = resultado.dados.saldo || 0;
        const totalVendasValor = resultado.dados.totalVendas || 0;
        const totalRetiradasValor = resultado.dados.totalRetiradas || 0;

        console.log(`Total do caixa no período: R$${saldo} (Vendas: R$${totalVendasValor}, Retiradas: R$${totalRetiradasValor})`);

        // Atualizar elementos
        if (elementoExiste(totalCaixa)) {
          totalCaixa.textContent = formatarMoeda(saldo);
          totalCaixa.classList.remove('loading-spinner');
        }
        
        if (elementoExiste(detailCaixa)) {
          detailCaixa.textContent = `${formatarMoeda(totalVendasValor)} em entradas de dinheiro − ${formatarMoeda(totalRetiradasValor)} em retiradas`;
        }
      } else {
        console.error('Erro ao carregar saldo do caixa:', resultado);
        if (elementoExiste(totalCaixa)) {
          totalCaixa.textContent = 'Indisponível';
          totalCaixa.classList.remove('loading-spinner');
        }
      }
    } catch (error) {
      console.error('Erro ao carregar total do caixa:', error);
      if (elementoExiste(totalCaixa)) {
        totalCaixa.textContent = 'Indisponível';
        totalCaixa.classList.remove('loading-spinner');
      }
    }
  };
  
  // Exportar para PDF
  if (elementoExiste(btnPDF)) {
    btnPDF.addEventListener('click', async () => {
      if (!dadosRelatorio) {
        alert('Primeiro gere o relatório para exportar');
        return;
      }
      
      try {
        btnPDF.disabled = true;
        btnPDF.textContent = 'Exportando...';
        
        if (!window.relatoriosAPI || !window.relatoriosAPI.exportarPDF) {
          throw new Error("API de exportação para PDF não disponível");
        }
        
        const result = await window.relatoriosAPI.exportarPDF(dadosRelatorio);
        if (result && result.success) {
          alert(result.message || 'Relatório exportado com sucesso!');
        } else {
          throw new Error(result && result.message ? result.message : "Falha ao exportar para PDF");
        }
      } catch (error) {
        console.error('Erro ao exportar para PDF:', error);
        alert('Erro ao exportar para PDF: ' + error.message);
      } finally {
        btnPDF.disabled = false;
        btnPDF.innerHTML = '<span class="export-icon">📄</span> Exportar PDF';
      }
    });
  }
  
  // Exportar para Excel
  if (elementoExiste(btnExcel)) {
    btnExcel.addEventListener('click', async () => {
      if (!dadosRelatorio) {
        alert('Primeiro gere o relatório para exportar');
        return;
      }
      
      try {
        btnExcel.disabled = true;
        btnExcel.textContent = 'Exportando...';
        
        if (!window.relatoriosAPI || !window.relatoriosAPI.exportarExcel) {
          throw new Error("API de exportação para Excel não disponível");
        }
        
        const result = await window.relatoriosAPI.exportarExcel(dadosRelatorio);
        if (result && result.success) {
          alert(result.message || 'Relatório exportado com sucesso!');
        } else {
          throw new Error(result && result.message ? result.message : "Falha ao exportar para Excel");
        }
      } catch (error) {
        console.error('Erro ao exportar para Excel:', error);
        alert('Erro ao exportar para Excel: ' + error.message);
      } finally {
        btnExcel.disabled = false;
        btnExcel.innerHTML = '<span class="export-icon">📊</span> Exportar Excel';
      }
    });
  }
  
  // Configurar data atual
  const configurarDatasIniciais = () => {
    if (!elementoExiste(dataInicio) || !elementoExiste(dataFim)) {
      console.warn("Elementos de data não encontrados");
      return;
    }
    
    const hoje = new Date();
    const seteAtras = new Date();
    seteAtras.setDate(hoje.getDate() - 6);
    
    dataFim.value = dataLocal(hoje);
    dataInicio.value = dataLocal(seteAtras);
  };
  
  // Inicializar a aplicação
  const inicializar = async () => {
    try {
      console.log("Inicializando aplicação de relatórios...");
      
      // Verificar elementos críticos
      if (!verificarElementos()) return;
      
      // Configurar datas iniciais
      configurarDatasIniciais();
      
      // Atualizar texto do período
      atualizarTextoPeriodo();
      
      // Carregar vendedores antes de gerar relatório
      await carregarVendedores();
      
      // Mostrar indicadores de carregamento
      exibirLoading();
      
      // Verificar API de relatórios
      if (!verificarAPIRelatorios()) {
        resetarUI();
        return;
      }
      
      // Gerar relatório inicial
      await gerarRelatorio();
      
    } catch (error) {
      console.error("Erro durante inicialização:", error);
      mostrarErro("Falha ao carregar relatório inicial: " + error.message);
      
      resetarUI();
    }
  };
  
  // Iniciar aplicação
  inicializar();
});
