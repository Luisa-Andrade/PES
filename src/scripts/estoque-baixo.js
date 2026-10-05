// Variáveis globais
let produtosFiltrados = [];
let todosProdutos = [];

// Função para mostrar mensagem
function mostrarMensagem(mensagem, tipo = 'info') {
  const elementoMensagem = document.getElementById('mensagem');
  elementoMensagem.textContent = mensagem;
  elementoMensagem.className = `mensagem ${tipo}`;
  elementoMensagem.style.display = 'block';
  
  setTimeout(() => {
    elementoMensagem.style.display = 'none';
  }, 5000);
}

// Função para formatar valor monetário
function formatarValor(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor || 0);
}

// Função para determinar status do produto
function determinarStatus(produto) {
  if (produto.estoque === 0) {
    return { tipo: 'critico', texto: 'Crítico - Sem Estoque' };
  } else if (produto.estoque <= produto.estoqueMinimo) {
    return { tipo: 'baixo', texto: 'Baixo - Reabastecer' };
  } else {
    return { tipo: 'normal', texto: 'Normal' };
  }
}

// Função para carregar categorias
async function carregarCategorias() {
  try {
    const categorias = await window.produtosAPI.getCategorias();
    const selectCategoria = document.getElementById('filtroCategoria');
    
    // Limpar opções existentes (exceto a primeira)
    while (selectCategoria.options.length > 1) {
      selectCategoria.remove(1);
    }
    
    // Adicionar categorias
    categorias.forEach(categoria => {
      const option = document.createElement('option');
      option.value = categoria;
      option.textContent = categoria;
      selectCategoria.appendChild(option);
    });
  } catch (erro) {
    console.error('Erro ao carregar categorias:', erro);
  }
}

// Função para carregar produtos
async function carregarProdutos() {
  try {
    mostrarLoading(true);
    
    // Buscar produtos com estoque baixo ou zero
    const produtos = await window.produtosAPI.getProdutos();
    
    // Filtrar apenas produtos com estoque baixo ou zero
    todosProdutos = produtos.filter(p => {
      return p.estoque === 0 || p.estoque <= p.estoqueMinimo;
    });
    
    // Aplicar filtros
    aplicarFiltros();
    
    mostrarLoading(false);
  } catch (erro) {
    console.error('Erro ao carregar produtos:', erro);
    mostrarMensagem('Erro ao carregar produtos. Tente novamente.', 'erro');
    mostrarLoading(false);
  }
}

// Função para aplicar filtros
function aplicarFiltros() {
  const filtroStatus = document.getElementById('filtroStatus').value;
  const filtroCategoria = document.getElementById('filtroCategoria').value;
  const filtroBusca = document.getElementById('filtroBusca').value.toLowerCase().trim();
  
  produtosFiltrados = todosProdutos.filter(produto => {
    // Filtro de status
    let passaStatus = true;
    if (filtroStatus === 'critico') {
      passaStatus = produto.estoque === 0;
    } else if (filtroStatus === 'baixo') {
      passaStatus = produto.estoque > 0 && produto.estoque <= produto.estoqueMinimo;
    }
    
    // Filtro de categoria
    const passaCategoria = !filtroCategoria || produto.categoria === filtroCategoria;
    
    // Filtro de busca
    const passaBusca = !filtroBusca || 
      produto.nome.toLowerCase().includes(filtroBusca) ||
      produto.codigo.toLowerCase().includes(filtroBusca);
    
    return passaStatus && passaCategoria && passaBusca;
  });
  
  renderizarTabela();
  atualizarResumo();
}

// Função para renderizar tabela
function renderizarTabela() {
  const corpoTabela = document.getElementById('corpoTabela');
  const tabela = document.getElementById('tabelaProdutos');
  const emptyState = document.getElementById('emptyState');
  
  corpoTabela.innerHTML = '';
  
  if (produtosFiltrados.length === 0) {
    tabela.style.display = 'none';
    emptyState.style.display = 'block';
    return;
  }
  
  tabela.style.display = 'table';
  emptyState.style.display = 'none';
  
  produtosFiltrados.forEach(produto => {
    const status = determinarStatus(produto);
    const tr = document.createElement('tr');
    
    tr.innerHTML = `
      <td>${produto.codigo}</td>
      <td><strong>${produto.nome}</strong></td>
      <td>${produto.categoria}</td>
      <td style="text-align: center; font-weight: bold; color: ${produto.estoque === 0 ? 'var(--danger-color)' : 'var(--warning-color)'}">
        ${produto.estoque} ${produto.unidadeMedida}
      </td>
      <td style="text-align: center;">${produto.estoqueMinimo} ${produto.unidadeMedida}</td>
      <td style="text-align: center;">${produto.unidadeMedida}</td>
      <td>
        <span class="status-badge ${status.tipo}">${status.texto}</span>
      </td>
      <td>
        <button onclick="editarProduto('${produto._id}')" style="background-color: var(--accent-color); color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; margin-right: 5px;">
          ✏️ Editar
        </button>
      </td>
    `;
    
    corpoTabela.appendChild(tr);
  });
}

// Função para atualizar resumo
function atualizarResumo() {
  const totalCriticos = todosProdutos.filter(p => p.estoque === 0).length;
  const totalBaixos = todosProdutos.filter(p => p.estoque > 0 && p.estoque <= p.estoqueMinimo).length;
  const totalProdutos = todosProdutos.length;
  
  document.getElementById('totalCriticos').textContent = totalCriticos;
  document.getElementById('totalBaixos').textContent = totalBaixos;
  document.getElementById('totalProdutos').textContent = totalProdutos;
}

// Função para mostrar loading
function mostrarLoading(mostrar) {
  const loading = document.getElementById('loading');
  const tabela = document.getElementById('tabelaProdutos');
  const emptyState = document.getElementById('emptyState');
  
  if (mostrar) {
    loading.style.display = 'block';
    tabela.style.display = 'none';
    emptyState.style.display = 'none';
  } else {
    loading.style.display = 'none';
  }
}

// Função para editar produto (redireciona para página de produtos)
async function editarProduto(produtoId) {
  try {
    // Armazenar o ID do produto para edição
    sessionStorage.setItem('editarProdutoId', produtoId);
    
    // Redirecionar para página de produtos
    window.location.href = 'produtos.html';
  } catch (erro) {
    console.error('Erro ao editar produto:', erro);
    mostrarMensagem('Erro ao abrir produto para edição.', 'erro');
  }
}

// Função para exportar para Excel
async function exportarParaExcel() {
  try {
    if (produtosFiltrados.length === 0) {
      mostrarMensagem('Não há produtos para exportar.', 'info');
      return;
    }
    
    // Preparar dados para exportação
    const dados = produtosFiltrados.map(produto => {
      const status = determinarStatus(produto);
      return {
        'Código': produto.codigo,
        'Nome': produto.nome,
        'Categoria': produto.categoria,
        'Estoque Atual': `${produto.estoque} ${produto.unidadeMedida}`,
        'Estoque Mínimo': `${produto.estoqueMinimo} ${produto.unidadeMedida}`,
        'Status': status.texto,
        'Preço': formatarValor(produto.preco),
        'Preço Venda': formatarValor(produto.precoVenda)
      };
    });
    
    // Converter para CSV
    const cabecalhos = Object.keys(dados[0]);
    let csv = cabecalhos.join(';') + '\n';
    
    dados.forEach(linha => {
      csv += Object.values(linha).join(';') + '\n';
    });
    
    // Criar blob e fazer download
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    const dataAtual = new Date().toISOString().split('T')[0];
    link.setAttribute('href', url);
    link.setAttribute('download', `produtos-baixo-estoque-${dataAtual}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    mostrarMensagem('Relatório exportado com sucesso!', 'sucesso');
  } catch (erro) {
    console.error('Erro ao exportar:', erro);
    mostrarMensagem('Erro ao exportar relatório.', 'erro');
  }
}

// Função para exportar para PDF
async function exportarParaPDF() {
  try {
    if (produtosFiltrados.length === 0) {
      mostrarMensagem('Não há produtos para exportar.', 'info');
      return;
    }
    
    // Verificar se jsPDF está disponível
    if (typeof window.jspdf === 'undefined') {
      mostrarMensagem('Biblioteca PDF não carregada. Recarregue a página.', 'erro');
      return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape'); // Modo paisagem para caber mais colunas
    
    // Configurar fonte e título
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Relatório de Produtos em Baixa Quantidade', 15, 20);
    
    // Informações do relatório
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const dataAtual = new Date().toLocaleDateString('pt-BR');
    const horaAtual = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    doc.text(`Data: ${dataAtual} às ${horaAtual}`, 15, 28);
    
    // Estatísticas resumidas
    const totalCriticos = produtosFiltrados.filter(p => p.estoque === 0).length;
    const totalBaixos = produtosFiltrados.filter(p => p.estoque > 0 && p.estoque <= p.estoqueMinimo).length;
    doc.text(`Total de Produtos: ${produtosFiltrados.length} | Críticos: ${totalCriticos} | Baixos: ${totalBaixos}`, 15, 35);
    
    // Preparar dados para a tabela
    const dadosTabela = produtosFiltrados.map(produto => {
      const status = determinarStatus(produto);
      return [
        produto.codigo,
        produto.nome,
        produto.categoria,
        `${produto.estoque} ${produto.unidadeMedida}`,
        `${produto.estoqueMinimo} ${produto.unidadeMedida}`,
        status.texto,
        formatarValor(produto.precoVenda)
      ];
    });
    
    // Configurar tabela com autoTable
    doc.autoTable({
      startY: 42,
      head: [['Código', 'Nome', 'Categoria', 'Estoque Atual', 'Estoque Mínimo', 'Status', 'Preço Venda']],
      body: dadosTabela,
      theme: 'striped',
      headStyles: {
        fillColor: [245, 124, 0], // Cor laranja do tema
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center'
      },
      bodyStyles: {
        fontSize: 9
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 25 }, // Código
        1: { halign: 'left', cellWidth: 60 }, // Nome
        2: { halign: 'center', cellWidth: 30 }, // Categoria
        3: { halign: 'center', cellWidth: 30 }, // Estoque Atual
        4: { halign: 'center', cellWidth: 30 }, // Estoque Mínimo
        5: { halign: 'center', cellWidth: 35 }, // Status
        6: { halign: 'right', cellWidth: 25 } // Preço Venda
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245]
      },
      margin: { left: 15, right: 15 },
      didDrawCell: (data) => {
        // Colorir células de status baseado no tipo
        if (data.column.index === 5 && data.section === 'body') {
          const status = data.cell.raw;
          if (status.includes('Crítico')) {
            data.cell.styles.textColor = [211, 47, 47]; // Vermelho
            data.cell.styles.fontStyle = 'bold';
          } else if (status.includes('Baixo')) {
            data.cell.styles.textColor = [251, 140, 0]; // Laranja
            data.cell.styles.fontStyle = 'bold';
          }
        }
      }
    });
    
    // Adicionar rodapé
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'italic');
      doc.text(
        `Página ${i} de ${pageCount}`,
        doc.internal.pageSize.width / 2,
        doc.internal.pageSize.height - 10,
        { align: 'center' }
      );
      doc.text(
            'Sistema FarmaVida - PDV Farmacêutico',
        15,
        doc.internal.pageSize.height - 10
      );
    }
    
    // Salvar o PDF
    const nomeArquivo = `produtos-baixo-estoque-${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(nomeArquivo);
    
    mostrarMensagem('PDF exportado com sucesso!', 'sucesso');
  } catch (erro) {
    console.error('Erro ao exportar PDF:', erro);
    mostrarMensagem('Erro ao exportar PDF. Tente novamente.', 'erro');
  }
}

// Função para voltar ao menu
function voltarMenu() {
  window.location.href = 'main.html';
}

// Event listeners
document.getElementById('filtroStatus').addEventListener('change', aplicarFiltros);
document.getElementById('filtroCategoria').addEventListener('change', aplicarFiltros);
document.getElementById('filtroBusca').addEventListener('input', aplicarFiltros);

// Inicializar ao carregar a página
document.addEventListener('DOMContentLoaded', () => {
  carregarCategorias();
  carregarProdutos();
});
