const Venda = require('../models/venda');
const Retirada = require('../models/retirada');
const Produto = require('../models/produto');
const User = require('../models/user');
const dbConnection = require('../db/connection');
const mongoose = require('mongoose');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const fs = require('fs'); // Usando fs diretamente, não fs.promises

class RelatoriosController {
  constructor() {
    dbConnection.ensureConnected();
  }
  
  // Gerar relatório com melhor tratamento de erros e fallbacks
  async gerarRelatorio(filtros = {}) {
    try {
      await dbConnection.ensureConnected();
      
      console.log("Gerando relatório com filtros:", JSON.stringify(filtros));
      
      // Validar filtros
      if (!filtros || typeof filtros !== 'object') {
        console.warn("Filtros inválidos, usando valores padrão");
        filtros = {};
      }
      
      // Construir query com valores padrão
      let query = { status: { $ne: 'cancelada' } };
      
      // Filtrar por data
      if (filtros.dataInicio || filtros.dataFim) {
        query.dataVenda = {};
        
        if (filtros.dataInicio) {
          try {
            const dataInicio = new Date(filtros.dataInicio);
            if (!isNaN(dataInicio)) {
              dataInicio.setHours(0, 0, 0, 0);
              query.dataVenda.$gte = dataInicio;
              console.log(`Filtro de data início: ${dataInicio.toISOString()}`);
            }
          } catch (err) {
            console.error('Data de início inválida:', filtros.dataInicio);
          }
        }
        
        if (filtros.dataFim) {
          try {
            const dataFim = new Date(filtros.dataFim);
            if (!isNaN(dataFim)) {
              dataFim.setHours(23, 59, 59, 999);
              query.dataVenda.$lte = dataFim;
              console.log(`Filtro de data fim: ${dataFim.toISOString()}`);
            }
          } catch (err) {
            console.error('Data de fim inválida:', filtros.dataFim);
          }
        }
      }
      
      // Filtrar por vendedor com melhor validação
      if (filtros.vendedor && filtros.vendedor !== '' && filtros.vendedor !== 'null') {
        try {
          // Verificar se é um ObjectId válido
          if (mongoose.Types.ObjectId.isValid(filtros.vendedor)) {
            query.vendedor = new mongoose.Types.ObjectId(filtros.vendedor);
            console.log(`Filtro por vendedor ID: ${filtros.vendedor}`);
          } else {
            console.warn('ID de vendedor inválido ignorado:', filtros.vendedor);
          }
        } catch (err) {
          console.error('Erro ao processar ID do vendedor:', err);
        }
      }
      
      console.log("Query final para MongoDB:", JSON.stringify(query));
      
      // Buscar vendas com timeout
      const timeout = 20000;
      const vendas = await Promise.race([
        Venda.find(query).sort({ dataVenda: 1 }).lean().exec(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout ao buscar vendas')), timeout)
        )
      ]);
      
      console.log(`Encontradas ${vendas.length} vendas`);
      
      // Processar vendas encontradas
      let totalVendas = 0;
      let totalItens = 0;
      const produtosMap = new Map();
      const vendasPorDia = new Map();
      const vendasPorMetodo = new Map();
      
      vendas.forEach(venda => {
        // Verificar venda e somar totais
        if (typeof venda !== 'object') return;
        
        const valorTotal = parseFloat(venda.total) || 0;
        totalVendas += valorTotal;
        
        // Agrupar por data
        if (venda.dataVenda) {
          const dataKey = new Date(venda.dataVenda).toISOString().split('T')[0];
          if (!vendasPorDia.has(dataKey)) {
            vendasPorDia.set(dataKey, { total: 0, quantidade: 0 });
          }
          const dadosDia = vendasPorDia.get(dataKey);
          dadosDia.total += valorTotal;
          dadosDia.quantidade += 1;
        }
        
        // Agrupar por método de pagamento
        if (venda.pagamento && venda.pagamento.metodo) {
          const metodo = venda.pagamento.metodo;
          if (!vendasPorMetodo.has(metodo)) {
            vendasPorMetodo.set(metodo, { total: 0, quantidade: 0 });
          }
          const dadosMetodo = vendasPorMetodo.get(metodo);
          dadosMetodo.total += valorTotal;
          dadosMetodo.quantidade += 1;
        }
        
        // Processar itens da venda
        if (Array.isArray(venda.itens)) {
          venda.itens.forEach(item => {
            if (!item || typeof item !== 'object') return;
            
            // Validar e somar quantidade
            const quantidade = parseFloat(item.quantidade) || 0;
            if (quantidade <= 0) return;
            
            totalItens += quantidade;
            
            // Identificar produto
            const prodId = item.produto ? item.produto.toString() : 
                        (item.codigoProduto || `produto_${Math.random().toString(36).substring(2, 9)}`);
            
            // Adicionar ao mapa de produtos
            if (!produtosMap.has(prodId)) {
              produtosMap.set(prodId, {
                codigo: item.codigoProduto || 'N/A',
                nome: item.nomeProduto || 'Produto sem nome',
                quantidade: 0,
                total: 0
              });
            }
            
            const dadosProduto = produtosMap.get(prodId);
            dadosProduto.quantidade += quantidade;
            dadosProduto.total += parseFloat(item.subtotal) || 0;
          });
        }
      });
      
      // Calcular estatísticas
      const qtdVendas = vendas.length;
      const ticketMedio = qtdVendas > 0 ? totalVendas / qtdVendas : 0;
      
      // Converter dados para arrays
      const vendasPorDiaArray = Array.from(vendasPorDia.entries())
        .map(([data, dados]) => ({
          data,
          total: dados.total,
          quantidade: dados.quantidade
        }))
        .sort((a, b) => a.data.localeCompare(b.data));
      
      const vendasPorMetodoArray = Array.from(vendasPorMetodo.entries())
        .map(([metodo, dados]) => ({
          metodo,
          total: dados.total,
          quantidade: dados.quantidade
        }))
        .sort((a, b) => b.total - a.total);
      
      const produtosArray = Array.from(produtosMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 10); // Top 10 produtos
      
      // Buscar retiradas no mesmo período
      let queryRetirada = { ativo: true };
      if (filtros.dataInicio || filtros.dataFim) {
        queryRetirada.dataCriacao = {};
        if (filtros.dataInicio) {
          const dIni = new Date(filtros.dataInicio);
          if (!isNaN(dIni)) {
            dIni.setHours(0,0,0,0);
            queryRetirada.dataCriacao.$gte = dIni;
          }
        }
        if (filtros.dataFim) {
          const dFim = new Date(filtros.dataFim);
          if (!isNaN(dFim)) {
            dFim.setHours(23,59,59,999);
            queryRetirada.dataCriacao.$lte = dFim;
          }
        }
      }

      const retiradas = await Retirada.find(queryRetirada).sort({ dataCriacao: -1 }).lean().exec();
      const totalRetiradas = retiradas.reduce((s, r) => s + (parseFloat(r.valor) || 0), 0);

      // Resultado final com valores garantidos
      return {
        totalVendas,
        ticketMedio,
        qtdVendas,
        totalItens,
        produtosMaisVendidos: produtosArray,
        vendasPorDia: vendasPorDiaArray,
        vendasPorMetodo: vendasPorMetodoArray,
        retiradas: retiradas,
        totalRetiradas: totalRetiradas
      };
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      
      // Retornar dados vazios em vez de lançar exceção
      return {
        totalVendas: 0,
        ticketMedio: 0,
        qtdVendas: 0,
        totalItens: 0,
        produtosMaisVendidos: [],
        vendasPorDia: [],
        vendasPorMetodo: []
      };
    }
  }
  
  // Exportar relatório para PDF - versão corrigida
  async exportarPDF(dados) {
    try {
      console.log("Iniciando exportação para PDF");
      
      if (!dados) {
        throw new Error('Dados não fornecidos para exportação');
      }
      
      // Definir o diretório de downloads do usuário
      const userHomeDir = require('os').homedir();
      const downloadsDir = path.join(userHomeDir, 'Downloads');
      
      // Gerar nome do arquivo único com timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `relatorio_vendas_${timestamp}.pdf`;
      const filePath = path.join(downloadsDir, fileName);
      
      // Criar diretório se não existir
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }
      
      // Criar documento PDF
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const stream = fs.createWriteStream(filePath); // Usando fs diretamente
      
      return new Promise((resolve, reject) => {
        // Gerenciar eventos de stream
        stream.on('error', (err) => {
          console.error('Erro na stream de escrita:', err);
          reject(new Error(`Erro ao criar arquivo: ${err.message}`));
        });
        
        doc.on('error', (err) => {
          console.error('Erro no documento PDF:', err);
          reject(new Error(`Erro ao gerar PDF: ${err.message}`));
        });
        
        // Quando o PDF é finalizado, resolve a promessa
        doc.on('end', () => {
          console.log(`PDF gerado com sucesso em ${filePath}`);
          resolve({
            success: true,
            message: 'Relatório PDF gerado com sucesso!',
            filePath: filePath
          });
        });
        
        // Pipe do documento para o stream
        doc.pipe(stream);
        
        // === CABEÇALHO COM DESIGN MODERNO ===
        // Retângulo de fundo azul para o cabeçalho
        doc.rect(0, 0, doc.page.width, 120).fill('#2196F3');
        
        // Título principal em branco
        doc.fillColor('#FFFFFF')
           .fontSize(28)
           .font('Helvetica-Bold')
           .text('RELATÓRIO DE VENDAS', 50, 30, { align: 'center' });
        
        // Subtítulo
        doc.fontSize(12)
           .font('Helvetica')
      .text('FarmaVida PDV - Gestão Farmacêutica', 50, 65, { align: 'center' });
        
        // Data de geração
        doc.fontSize(10)
           .text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 50, 85, { align: 'center' });
        
        // Resetar cor para preto
        doc.fillColor('#000000');
        
        // Período analisado com box destacado
        doc.y = 140;
        let periodoTexto = '';
        if (dados.filtros && dados.filtros.dataInicio && dados.filtros.dataFim) {
          const dataInicio = new Date(dados.filtros.dataInicio).toLocaleDateString('pt-BR');
          const dataFim = new Date(dados.filtros.dataFim).toLocaleDateString('pt-BR');
          periodoTexto = `${dataInicio} até ${dataFim}`;
        } else {
          periodoTexto = 'Todos os períodos';
        }
        
        // Box do período
        doc.roundedRect(50, 140, doc.page.width - 100, 35, 5)
           .fillAndStroke('#E3F2FD', '#2196F3');
        
        doc.fillColor('#1976D2')
           .fontSize(11)
           .font('Helvetica-Bold')
           .text('Período:', 60, 150);
        
        doc.fillColor('#424242')
           .font('Helvetica')
           .text(periodoTexto, 110, 150);
        
        doc.fillColor('#000000');
        doc.y = 190;
        
        // === CARDS DE RESUMO ===
        const cardY = doc.y;
        const cardWidth = (doc.page.width - 140) / 2;
        const cardHeight = 90;
        
        // Card 1 - Total de Vendas
        doc.roundedRect(50, cardY, cardWidth, cardHeight, 5)
           .fillAndStroke('#E8F5E9', '#4CAF50');
        
        doc.fillColor('#2E7D32')
           .fontSize(10)
           .font('Helvetica-Bold')
           .text('TOTAL EM VENDAS', 60, cardY + 15);
        
        doc.fillColor('#1B5E20')
           .fontSize(20)
           .text(`R$ ${Number(dados.totalVendas).toFixed(2).replace('.', ',')}`, 60, cardY + 40);
        
        doc.fillColor('#666666')
           .fontSize(9)
           .font('Helvetica')
           .text(`${dados.qtdVendas} vendas`, 60, cardY + 70);
        
        // Card 2 - Ticket Médio
        doc.roundedRect(70 + cardWidth, cardY, cardWidth, cardHeight, 5)
           .fillAndStroke('#FFF3E0', '#FF9800');
        
        doc.fillColor('#E65100')
           .fontSize(10)
           .font('Helvetica-Bold')
           .text('TICKET MÉDIO', 80 + cardWidth, cardY + 15);
        
        doc.fillColor('#BF360C')
           .fontSize(20)
           .text(`R$ ${Number(dados.ticketMedio).toFixed(2).replace('.', ',')}`, 80 + cardWidth, cardY + 40);
        
        doc.fillColor('#666666')
           .fontSize(9)
           .font('Helvetica')
           .text(`${dados.totalItens} itens vendidos`, 80 + cardWidth, cardY + 70);
        
        doc.fillColor('#000000');
        doc.y = cardY + cardHeight + 20;
        
        // === PRODUTOS MAIS VENDIDOS ===
        // Título da seção com barra lateral
        const produtosY = doc.y + 10;
        doc.rect(50, produtosY, 4, 20).fill('#2196F3');
        doc.fillColor('#000000')
           .fontSize(16)
           .font('Helvetica-Bold')
           .text('Produtos Mais Vendidos', 60, produtosY + 3);
        
        doc.y = produtosY + 30;
        
        // Verificar se há produtos
        if (Array.isArray(dados.produtosMaisVendidos) && dados.produtosMaisVendidos.length > 0) {
          // Cabeçalho da tabela com fundo
          let tableY = doc.y;
          doc.rect(50, tableY, doc.page.width - 100, 25).fillAndStroke('#F5F5F5', '#E0E0E0');
          
          doc.fillColor('#424242')
             .fontSize(10)
             .font('Helvetica-Bold')
             .text('Código', 60, tableY + 8)
             .text('Produto', 130, tableY + 8)
             .text('Qtd', 380, tableY + 8)
             .text('Total (R$)', 450, tableY + 8);
          
          tableY += 25;
          
          // Linhas de dados com cores alternadas
          dados.produtosMaisVendidos.forEach((produto, index) => {
            // Verificar se precisa de nova página
            if (tableY > doc.page.height - 100) {
              doc.addPage();
              tableY = 50;
              
              // Repetir cabeçalho
              doc.rect(50, tableY, doc.page.width - 100, 25).fillAndStroke('#F5F5F5', '#E0E0E0');
              doc.fillColor('#424242')
                 .fontSize(10)
                 .font('Helvetica-Bold')
                 .text('Código', 60, tableY + 8)
                 .text('Produto', 130, tableY + 8)
                 .text('Qtd', 380, tableY + 8)
                 .text('Total (R$)', 450, tableY + 8);
              tableY += 25;
            }
            
            // Fundo alternado
            if (index % 2 === 0) {
              doc.rect(50, tableY, doc.page.width - 100, 20).fill('#FAFAFA');
            }
            
            // Destacar top 3
            const textColor = index < 3 ? '#1976D2' : '#424242';
            const fontType = index < 3 ? 'Helvetica-Bold' : 'Helvetica';
            
            doc.fillColor(textColor)
               .fontSize(9)
               .font(fontType)
               .text(produto.codigo || 'N/A', 60, tableY + 5)
               .text((produto.nome || 'Produto sem nome').substring(0, 35), 130, tableY + 5)
               .text(String(produto.quantidade || 0), 380, tableY + 5)
               .text(`R$ ${(produto.total || 0).toFixed(2).replace('.', ',')}`, 450, tableY + 5);
            
            tableY += 20;
          });
          
          doc.y = tableY + 10;
        } else {
          doc.fillColor('#666666')
             .fontSize(10)
             .font('Helvetica')
             .text('Nenhum produto vendido no período.', 50, doc.y);
          doc.moveDown(1);
        }
        
        // === MÉTODOS DE PAGAMENTO ===
        const pagamentoY = doc.y + 10;
        doc.rect(50, pagamentoY, 4, 20).fill('#2196F3');
        doc.fillColor('#000000')
           .fontSize(16)
           .font('Helvetica-Bold')
           .text('Métodos de Pagamento', 60, pagamentoY + 3);
        
        doc.y = pagamentoY + 30;
        
        if (Array.isArray(dados.vendasPorMetodo) && dados.vendasPorMetodo.length > 0) {
          const metodoNomes = {
            dinheiro: 'Dinheiro',
            cartao_credito: 'Cartão de Crédito',
            cartao_debito: 'Cartão de Débito',
            pix: 'PIX',
            fiado: 'Fiado',
            default: 'Outros'
          };
          
          const metodosCores = {
            dinheiro: '#4CAF50',
            cartao_credito: '#2196F3',
            cartao_debito: '#9C27B0',
            pix: '#FF9800',
            fiado: '#F44336',
            default: '#607D8B'
          };
          
          dados.vendasPorMetodo.forEach(metodo => {
            const nomeMetodo = metodoNomes[metodo.metodo] || metodo.metodo;
            const cor = metodosCores[metodo.metodo] || metodosCores.default;
            const metodoY = doc.y;
            
            // Círculo colorido como marcador
            doc.circle(60, metodoY + 5, 4).fill(cor);
            
            doc.fillColor('#424242')
               .fontSize(11)
               .font('Helvetica')
               .text(nomeMetodo, 75, metodoY);
            
            doc.fillColor('#1976D2')
               .font('Helvetica-Bold')
               .text(`R$ ${Number(metodo.total).toFixed(2).replace('.', ',')}`, 250, metodoY);
            
            doc.fillColor('#666666')
               .fontSize(9)
               .font('Helvetica')
               .text(`(${metodo.quantidade} ${metodo.quantidade === 1 ? 'venda' : 'vendas'})`, 370, metodoY + 2);
            
            doc.moveDown(0.8);
          });
        } else {
          doc.fillColor('#666666')
             .fontSize(10)
             .text('Nenhum dado de pagamento disponível.');
        }
        
        doc.fillColor('#000000');
        doc.moveDown(1);
        
        doc.fillColor('#000000');
        doc.moveDown(1);
        
        // === RETIRADAS DE DINHEIRO ===
        const retiradasY = doc.y + 10;
        doc.rect(50, retiradasY, 4, 20).fill('#F44336');
        doc.fillColor('#000000')
           .fontSize(16)
           .font('Helvetica-Bold')
           .text('Retiradas de Dinheiro', 60, retiradasY + 3);

        doc.y = retiradasY + 30;

        if (Array.isArray(dados.retiradas) && dados.retiradas.length > 0) {
          // Box de resumo das retiradas
          const resumoRetY = doc.y;
          doc.roundedRect(50, resumoRetY, (doc.page.width - 120) / 2, 50, 5)
             .fillAndStroke('#FFEBEE', '#F44336');
          
          doc.fillColor('#C62828')
             .fontSize(9)
             .font('Helvetica-Bold')
             .text('TOTAL RETIRADAS', 60, resumoRetY + 10);
          
          doc.fontSize(16)
             .text(`R$ ${Number(dados.totalRetiradas || 0).toFixed(2).replace('.', ',')}`, 60, resumoRetY + 25);
          
          const resumoRet2X = 70 + (doc.page.width - 120) / 2;
          doc.roundedRect(resumoRet2X, resumoRetY, (doc.page.width - 120) / 2, 50, 5)
             .fillAndStroke('#FFF3E0', '#FF9800');
          
          doc.fillColor('#E65100')
             .fontSize(9)
             .text('QUANTIDADE', resumoRet2X + 10, resumoRetY + 10);
          
          doc.fontSize(16)
             .text(`${dados.retiradas.length} ${dados.retiradas.length === 1 ? 'retirada' : 'retiradas'}`, resumoRet2X + 10, resumoRetY + 25);
          
          doc.y = resumoRetY + 60;
          
          // Verificar se precisa de nova página
          if (doc.y > doc.page.height - 150) {
            doc.addPage();
          }
          
          // Cabeçalho da tabela
          let tableRetY = doc.y;
          doc.rect(50, tableRetY, doc.page.width - 100, 25).fillAndStroke('#F5F5F5', '#E0E0E0');
          
          doc.fillColor('#424242')
             .fontSize(9)
             .font('Helvetica-Bold')
             .text('Data/Hora', 60, tableRetY + 8)
             .text('Responsável', 145, tableRetY + 8)
             .text('Valor (R$)', 280, tableRetY + 8)
             .text('Motivo', 360, tableRetY + 8);

          tableRetY += 25;

          dados.retiradas.forEach((ret, index) => {
            // Verificar se precisa de nova página
            if (tableRetY > doc.page.height - 100) {
              doc.addPage();
              tableRetY = 50;
              
              // Repetir cabeçalho
              doc.rect(50, tableRetY, doc.page.width - 100, 25).fillAndStroke('#F5F5F5', '#E0E0E0');
              doc.fillColor('#424242')
                 .fontSize(9)
                 .font('Helvetica-Bold')
                 .text('Data/Hora', 60, tableRetY + 8)
                 .text('Responsável', 145, tableRetY + 8)
                 .text('Valor (R$)', 280, tableRetY + 8)
                 .text('Motivo', 360, tableRetY + 8);
              tableRetY += 25;
            }
            
            // Fundo alternado
            if (index % 2 === 0) {
              doc.rect(50, tableRetY, doc.page.width - 100, 22).fill('#FAFAFA');
            }
            
            const dt = ret.dataCriacao ? new Date(ret.dataCriacao).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : '-';
            
            doc.fillColor('#424242')
               .fontSize(8)
               .font('Helvetica')
               .text(dt, 60, tableRetY + 6, { width: 80 })
               .text((ret.responsavel || '-').substring(0, 18), 145, tableRetY + 6, { width: 130 });
            
            doc.fillColor('#C62828')
               .font('Helvetica-Bold')
               .text(`R$ ${(ret.valor || 0).toFixed(2).replace('.', ',')}`, 280, tableRetY + 6, { width: 75 });
            
            doc.fillColor('#666666')
               .font('Helvetica')
               .text((ret.motivo || '-').substring(0, 28), 360, tableRetY + 6, { width: 155 });
            
            tableRetY += 22;
          });
          
          doc.y = tableRetY + 10;
        } else {
          doc.fillColor('#666666')
             .fontSize(10)
             .font('Helvetica')
             .text('Nenhuma retirada registrada no período.');
        }
        
        doc.fillColor('#000000');
        
        // === RESUMO FINAL - SALDO DO CAIXA ===
        doc.moveDown(1.5);
        
        // Verificar se precisa de nova página
        if (doc.y > doc.page.height - 150) {
          doc.addPage();
        }
        
        const saldoCaixa = (dados.totalVendas || 0) - (dados.totalRetiradas || 0);
        const saldoY = doc.y;
        
        // Grande card de saldo
        const saldoColor = saldoCaixa >= 0 ? '#4CAF50' : '#F44336';
        const saldoBgColor = saldoCaixa >= 0 ? '#E8F5E9' : '#FFEBEE';
        
        doc.roundedRect(50, saldoY, doc.page.width - 100, 120, 8)
           .fillAndStroke(saldoBgColor, saldoColor);
        
        // Título
        doc.fillColor(saldoColor)
           .fontSize(14)
           .font('Helvetica-Bold')
           .text('SALDO DO CAIXA', 70, saldoY + 20);
        
        // Linha separadora
        doc.moveTo(70, saldoY + 42)
           .lineTo(doc.page.width - 70, saldoY + 42)
           .strokeColor(saldoColor)
           .lineWidth(2)
           .stroke();
        
        // Detalhes
        doc.fillColor('#424242')
           .fontSize(11)
           .font('Helvetica')
           .text('Total de Vendas:', 70, saldoY + 55);
        
        doc.fillColor('#4CAF50')
           .font('Helvetica-Bold')
           .text(`R$ ${Number(dados.totalVendas || 0).toFixed(2).replace('.', ',')}`, 250, saldoY + 55);
        
        doc.fillColor('#424242')
           .font('Helvetica')
           .text('(-) Total de Retiradas:', 70, saldoY + 75);
        
        doc.fillColor('#F44336')
           .font('Helvetica-Bold')
           .text(`R$ ${Number(dados.totalRetiradas || 0).toFixed(2).replace('.', ',')}`, 250, saldoY + 75);
        
        // Linha de total
        doc.moveTo(70, saldoY + 92)
           .lineTo(doc.page.width - 70, saldoY + 92)
           .strokeColor('#BDBDBD')
           .lineWidth(1)
           .stroke();
        
        // Saldo final destacado
        doc.fillColor(saldoColor)
           .fontSize(16)
           .font('Helvetica-Bold')
           .text('Saldo Final:', 70, saldoY + 100);
        
        doc.fontSize(18)
           .text(`R$ ${saldoCaixa.toFixed(2).replace('.', ',')}`, 250, saldoY + 98);
        
        // Rodapé
        doc.fontSize(8)
           .fillColor('#999999')
           .font('Helvetica')
      .text('Relatório gerado automaticamente pelo FarmaVida PDV', 50, doc.page.height - 40, {
             align: 'center',
             width: doc.page.width - 100
           });
        
        // Finalizar documento
        doc.end();
      });
    } catch (error) {
      console.error('Erro ao exportar para PDF:', error);
      return {
        success: false,
        message: `Erro ao exportar para PDF: ${error.message}`
      };
    }
  }

  // Exportar relatório para Excel - versão corrigida
  async exportarExcel(dados) {
    try {
      console.log("Iniciando exportação para Excel");
      
      if (!dados) {
        throw new Error('Dados não fornecidos para exportação');
      }
      
      // Definir o diretório de downloads do usuário
      const userHomeDir = require('os').homedir();
      const downloadsDir = path.join(userHomeDir, 'Downloads');
      
      // Gerar nome do arquivo único com timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `relatorio_vendas_${timestamp}.xlsx`;
      const filePath = path.join(downloadsDir, fileName);
      
      // Criar diretório se não existir
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }
      
      // Criar workbook e worksheet
      const workbook = new ExcelJS.Workbook();
    workbook.creator = 'FarmaVida PDV';
      workbook.created = new Date();
      
      // Planilha de resumo
      const resumoSheet = workbook.addWorksheet('Resumo');
      
      // Estilização do cabeçalho
      const headerStyle = {
        font: { bold: true, size: 14, color: { argb: 'FF333333' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDEDEDE' } },
        alignment: { horizontal: 'center', vertical: 'middle' }
      };
      
      const subHeaderStyle = {
        font: { bold: true, size: 12 },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEAEA' } }
      };
      
      // Informações do relatório
      resumoSheet.mergeCells('A1:D1');
    resumoSheet.getCell('A1').value = 'Relatório de Vendas FarmaVida PDV';
      resumoSheet.getCell('A1').style = headerStyle;
      resumoSheet.getRow(1).height = 30;
      
      // Data de geração
      resumoSheet.mergeCells('A2:D2');
      resumoSheet.getCell('A2').value = `Gerado em: ${new Date().toLocaleString('pt-BR')}`;
      resumoSheet.getCell('A2').alignment = { horizontal: 'center' };
      
      // Período do relatório
      let periodoTexto = 'Período analisado: ';
      if (dados.filtros && dados.filtros.dataInicio && dados.filtros.dataFim) {
        const dataInicio = new Date(dados.filtros.dataInicio).toLocaleDateString('pt-BR');
        const dataFim = new Date(dados.filtros.dataFim).toLocaleDateString('pt-BR');
        periodoTexto += `${dataInicio} até ${dataFim}`;
      } else {
        periodoTexto += 'Todos os períodos';
      }
      resumoSheet.mergeCells('A3:D3');
      resumoSheet.getCell('A3').value = periodoTexto;
      resumoSheet.getCell('A3').alignment = { horizontal: 'center' };
      resumoSheet.getRow(3).height = 25;
      
      // Resumo de Vendas
      resumoSheet.mergeCells('A5:D5');
      resumoSheet.getCell('A5').value = 'Resumo de Vendas';
      resumoSheet.getCell('A5').style = subHeaderStyle;
      
      // Dados de resumo
      resumoSheet.getCell('A6').value = 'Total em Vendas';
      resumoSheet.getCell('B6').value = dados.totalVendas;
      resumoSheet.getCell('B6').numFmt = 'R$ #,##0.00';
      
      resumoSheet.getCell('A7').value = 'Quantidade de Vendas';
      resumoSheet.getCell('B7').value = dados.qtdVendas;
      
      resumoSheet.getCell('A8').value = 'Ticket Médio';
      resumoSheet.getCell('B8').value = dados.ticketMedio;
      resumoSheet.getCell('B8').numFmt = 'R$ #,##0.00';
      
      resumoSheet.getCell('A9').value = 'Total de Itens';
      resumoSheet.getCell('B9').value = dados.totalItens;
      
      // Produtos mais vendidos
      resumoSheet.mergeCells('A11:D11');
      resumoSheet.getCell('A11').value = 'Produtos Mais Vendidos';
      resumoSheet.getCell('A11').style = subHeaderStyle;
      
      // Cabeçalho da tabela de produtos
      resumoSheet.getCell('A12').value = 'Código';
      resumoSheet.getCell('B12').value = 'Nome do Produto';
      resumoSheet.getCell('C12').value = 'Quantidade';
      resumoSheet.getCell('D12').value = 'Total (R$)';
      
      ['A12', 'B12', 'C12', 'D12'].forEach(cell => {
        resumoSheet.getCell(cell).font = { bold: true };
        resumoSheet.getCell(cell).fill = { 
          type: 'pattern', 
          pattern: 'solid', 
          fgColor: { argb: 'FFEAEAEA' } 
        };
      });
      
      // Dados dos produtos
      let row = 13;
      if (Array.isArray(dados.produtosMaisVendidos) && dados.produtosMaisVendidos.length > 0) {
        dados.produtosMaisVendidos.forEach(produto => {
          resumoSheet.getCell(`A${row}`).value = produto.codigo || 'N/A';
          resumoSheet.getCell(`B${row}`).value = produto.nome || 'Produto sem nome';
          resumoSheet.getCell(`C${row}`).value = produto.quantidade || 0;
          resumoSheet.getCell(`D${row}`).value = produto.total || 0;
          resumoSheet.getCell(`D${row}`).numFmt = 'R$ #,##0.00';
          row++;
        });
      } else {
        resumoSheet.mergeCells(`A13:D13`);
        resumoSheet.getCell('A13').value = 'Nenhum produto vendido no período.';
        resumoSheet.getCell('A13').alignment = { horizontal: 'center' };
        row++;
      }
      
      // Vendas por método de pagamento
      row += 2;
      resumoSheet.mergeCells(`A${row}:D${row}`);
      resumoSheet.getCell(`A${row}`).value = 'Vendas por Método de Pagamento';
      resumoSheet.getCell(`A${row}`).style = subHeaderStyle;
      row++;
      
      resumoSheet.getCell(`A${row}`).value = 'Método';
      resumoSheet.getCell(`B${row}`).value = 'Total (R$)';
      resumoSheet.getCell(`C${row}`).value = 'Quantidade';
      
      ['A'+row, 'B'+row, 'C'+row].forEach(cell => {
        resumoSheet.getCell(cell).font = { bold: true };
        resumoSheet.getCell(cell).fill = { 
          type: 'pattern', 
          pattern: 'solid', 
          fgColor: { argb: 'FFEAEAEA' } 
        };
      });
      
      row++;
      
      // Métodos de pagamento
      const metodoNomes = {
        dinheiro: 'Dinheiro',
        cartao_credito: 'Cartão de Crédito',
        cartao_debito: 'Cartão de Débito',
        pix: 'PIX',
        fiado: 'Fiado',
        default: 'Outros'
      };
      
      if (Array.isArray(dados.vendasPorMetodo) && dados.vendasPorMetodo.length > 0) {
        dados.vendasPorMetodo.forEach(metodo => {
          resumoSheet.getCell(`A${row}`).value = metodoNomes[metodo.metodo] || metodo.metodo;
          resumoSheet.getCell(`B${row}`).value = metodo.total || 0;
          resumoSheet.getCell(`B${row}`).numFmt = 'R$ #,##0.00';
          resumoSheet.getCell(`C${row}`).value = metodo.quantidade || 0;
          row++;
        });
      } else {
        resumoSheet.mergeCells(`A${row}:C${row}`);
        resumoSheet.getCell(`A${row}`).value = 'Nenhum dado de pagamento disponível.';
        resumoSheet.getCell(`A${row}`).alignment = { horizontal: 'center' };
      }
      
      // Ajustar larguras das colunas
      resumoSheet.columns.forEach(column => {
        column.width = 18;
      });
      
      resumoSheet.getColumn(2).width = 40; // Coluna do nome do produto mais larga
      
      // Adicionar informações de retiradas na aba resumo
      row += 2;
      resumoSheet.mergeCells(`A${row}:D${row}`);
      resumoSheet.getCell(`A${row}`).value = 'Resumo de Retiradas';
      resumoSheet.getCell(`A${row}`).style = subHeaderStyle;
      row++;
      
      resumoSheet.getCell(`A${row}`).value = 'Total de Retiradas';
      resumoSheet.getCell(`B${row}`).value = dados.totalRetiradas || 0;
      resumoSheet.getCell(`B${row}`).numFmt = 'R$ #,##0.00';
      resumoSheet.getCell(`B${row}`).font = { bold: true, color: { argb: 'FFFF0000' } };
      row++;
      
      resumoSheet.getCell(`A${row}`).value = 'Quantidade de Retiradas';
      resumoSheet.getCell(`B${row}`).value = (Array.isArray(dados.retiradas) ? dados.retiradas.length : 0);
      row += 2;
      
      // Resumo do Caixa
      resumoSheet.mergeCells(`A${row}:D${row}`);
      resumoSheet.getCell(`A${row}`).value = 'Saldo do Caixa';
      resumoSheet.getCell(`A${row}`).style = {
        font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4CAF50' } },
        alignment: { horizontal: 'center', vertical: 'middle' }
      };
      row++;
      
      const saldoCaixa = (dados.totalVendas || 0) - (dados.totalRetiradas || 0);
      resumoSheet.getCell(`A${row}`).value = 'Total de Vendas';
      resumoSheet.getCell(`B${row}`).value = dados.totalVendas || 0;
      resumoSheet.getCell(`B${row}`).numFmt = 'R$ #,##0.00';
      row++;
      
      resumoSheet.getCell(`A${row}`).value = 'Total de Retiradas';
      resumoSheet.getCell(`B${row}`).value = dados.totalRetiradas || 0;
      resumoSheet.getCell(`B${row}`).numFmt = 'R$ #,##0.00';
      resumoSheet.getCell(`B${row}`).font = { color: { argb: 'FFFF0000' } };
      row++;
      
      resumoSheet.getCell(`A${row}`).value = 'Saldo do Caixa';
      resumoSheet.getCell(`A${row}`).font = { bold: true, size: 12 };
      resumoSheet.getCell(`B${row}`).value = saldoCaixa;
      resumoSheet.getCell(`B${row}`).numFmt = 'R$ #,##0.00';
      resumoSheet.getCell(`B${row}`).font = { bold: true, size: 12, color: { argb: saldoCaixa >= 0 ? 'FF4CAF50' : 'FFFF0000' } };
      
      // Adicionar planilha de retiradas detalhada
      if (Array.isArray(dados.retiradas) && dados.retiradas.length > 0) {
        const retiradasSheet = workbook.addWorksheet('Retiradas');
        
        // Título
        retiradasSheet.mergeCells('A1:E1');
        retiradasSheet.getCell('A1').value = 'Detalhamento de Retiradas';
        retiradasSheet.getCell('A1').style = headerStyle;
        retiradasSheet.getRow(1).height = 30;
        
        // Configurar colunas
        retiradasSheet.columns = [
          { header: 'Data/Hora', key: 'data', width: 20 },
          { header: 'Responsável', key: 'responsavel', width: 25 },
          { header: 'Valor (R$)', key: 'valor', width: 15 },
          { header: 'Motivo', key: 'motivo', width: 30 },
          { header: 'Observações', key: 'observacoes', width: 40 }
        ];
        
        // Estilizar cabeçalho da tabela (linha 3)
        const headerRow = retiradasSheet.getRow(3);
        headerRow.font = { bold: true };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEAEA' } };
        headerRow.height = 20;

        // Adicionar dados
        dados.retiradas.forEach(r => {
          const row = retiradasSheet.addRow({
            data: r.dataCriacao ? new Date(r.dataCriacao).toLocaleString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }) : '',
            responsavel: r.responsavel || '',
            valor: r.valor || 0,
            motivo: r.motivo || '',
            observacoes: r.observacoes || ''
          });
          
          // Formatar valor como moeda
          row.getCell(3).numFmt = 'R$ #,##0.00';
        });

        // Linha em branco
        retiradasSheet.addRow({});
        
        // Linha de total
        const totalRow = retiradasSheet.addRow({ 
          responsavel: 'Total de Retiradas', 
          valor: dados.totalRetiradas || 0 
        });
        totalRow.getCell(2).font = { bold: true };
        totalRow.getCell(3).numFmt = 'R$ #,##0.00';
        totalRow.getCell(3).font = { bold: true, color: { argb: 'FFFF0000' } };
        totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE0E0' } };
      }

      // Salvar o arquivo usando promise
      try {
        await workbook.xlsx.writeFile(filePath);
        console.log(`Excel salvo em ${filePath}`);

        return {
          success: true,
          message: 'Relatório Excel gerado com sucesso!',
          filePath: filePath
        };
      } catch (writeError) {
        console.error('Erro ao salvar arquivo Excel:', writeError);
        throw new Error(`Falha ao salvar arquivo: ${writeError.message}`);
      }
    } catch (error) {
      console.error('Erro ao exportar para Excel:', error);
      return {
        success: false,
        message: `Erro ao exportar para Excel: ${error.message}`
      };
    }
  }
  
  // Método aprimorado para obter dados detalhados de vendas
  async getDetalhesVendas(filtros = {}) {
    try {
      await dbConnection.ensureConnected();
      
      console.log("Buscando detalhes de vendas com filtros:", JSON.stringify(filtros));
      
      // Construir query base
      let query = { status: { $ne: 'cancelada' } };
      
      // Aplicar filtros de data
      if (filtros.dataInicio || filtros.dataFim) {
        query.dataVenda = {};
        
        if (filtros.dataInicio) {
          try {
            const dataInicio = new Date(filtros.dataInicio);
            if (!isNaN(dataInicio)) {
              dataInicio.setHours(0, 0, 0, 0);
              query.dataVenda.$gte = dataInicio;
            }
          } catch (err) {
            console.error('Data de início inválida:', filtros.dataInicio);
          }
        }
        
        if (filtros.dataFim) {
          try {
            const dataFim = new Date(filtros.dataFim);
            if (!isNaN(dataFim)) {
              dataFim.setHours(23, 59, 59, 999);
              query.dataVenda.$lte = dataFim;
            }
          } catch (err) {
            console.error('Data de fim inválida:', filtros.dataFim);
          }
        }
      }
      
      // Filtrar por vendedor
      if (filtros.vendedor && mongoose.Types.ObjectId.isValid(filtros.vendedor)) {
        query.vendedor = new mongoose.Types.ObjectId(filtros.vendedor);
      }
      
      // Filtrar por cliente
      if (filtros.cliente && mongoose.Types.ObjectId.isValid(filtros.cliente)) {
        query.cliente = new mongoose.Types.ObjectId(filtros.cliente);
      }
      
      // Filtrar por método de pagamento
      if (filtros.metodoPagamento) {
        query['pagamento.metodo'] = filtros.metodoPagamento;
      }
      
      // Filtrar por status de pagamento
      if (filtros.statusPagamento) {
        query['pagamento.status'] = filtros.statusPagamento;
      }
      
      // Filtrar por produto específico
      if (filtros.produto && mongoose.Types.ObjectId.isValid(filtros.produto)) {
        query['itens.produto'] = new mongoose.Types.ObjectId(filtros.produto);
      }
      
      // Filtrar por valor mínimo/máximo
      if (filtros.valorMinimo !== undefined && !isNaN(parseFloat(filtros.valorMinimo))) {
        query.total = query.total || {};
        query.total.$gte = parseFloat(filtros.valorMinimo);
      }
      
      if (filtros.valorMaximo !== undefined && !isNaN(parseFloat(filtros.valorMaximo))) {
        query.total = query.total || {};
        query.total.$lte = parseFloat(filtros.valorMaximo);
      }
      
      console.log("Query de vendas detalhadas:", JSON.stringify(query));
      
      // Buscar vendas com dados completos usando populate para relacionamentos
      const vendas = await Venda.find(query)
        .populate('vendedor', 'nome email')
        .populate('cliente', 'nome email telefone')
        .sort({ dataVenda: -1 }) // Ordenar por data decrescente (mais recentes primeiro)
        .lean();
      
      console.log(`Encontradas ${vendas.length} vendas para análise detalhada`);
      
      // Processar dados adicionais
      const vendasProcessadas = await Promise.all(vendas.map(async (venda) => {
        try {
          // Adicionar dados formatados
          const dataVendaFormatada = venda.dataVenda 
            ? new Date(venda.dataVenda).toLocaleDateString('pt-BR') 
            : 'Data não disponível';
            
          const horaVendaFormatada = venda.dataVenda 
            ? new Date(venda.dataVenda).toLocaleTimeString('pt-BR') 
            : '';
          
          // Processar itens da venda
          let itens = [];
          if (Array.isArray(venda.itens) && venda.itens.length > 0) {
            itens = venda.itens.map(item => ({
              codigo: item.codigoProduto || 'N/A',
              nome: item.nomeProduto || 'Produto sem nome',
              quantidade: item.quantidade || 0,
              precoUnitario: item.preco || 0,
              subtotal: item.subtotal || (item.preco * item.quantidade) || 0
            }));
          }
          
          // Informações de pagamento formatadas
          const pagamento = {
            metodo: this.formatarMetodoPagamento(venda.pagamento?.metodo),
            status: this.formatarStatusPagamento(venda.pagamento?.status),
            parcelas: venda.pagamento?.parcelas || 1,
            valorEntrada: venda.pagamento?.valorEntrada || 0,
            dataVencimento: venda.pagamento?.dataVencimento 
              ? new Date(venda.pagamento.dataVencimento).toLocaleDateString('pt-BR') 
              : null
          };
          
          // Calcular informações adicionais
          const quantidadeItens = itens.reduce((acc, item) => acc + (item.quantidade || 0), 0);
          const lucroEstimado = itens.reduce((acc, item) => {
            // Se tivermos custo, calcular lucro
            if (item.custo && item.subtotal) {
              return acc + (item.subtotal - (item.custo * item.quantidade));
            }
            // Estimativa de lucro baseada em margem padrão de 30%
            return acc + (item.subtotal * 0.3);
          }, 0);
          
          return {
            id: venda._id,
            numero: venda.numero || `V${venda._id.toString().slice(-6)}`,
            dataVenda: venda.dataVenda,
            dataFormatada: dataVendaFormatada,
            horaFormatada: horaVendaFormatada,
            vendedor: venda.vendedor?.nome || 'Vendedor não especificado',
            vendedorId: venda.vendedor?._id,
            cliente: venda.cliente?.nome || 'Cliente não especificado',
            clienteEmail: venda.cliente?.email,
            clienteTelefone: venda.cliente?.telefone,
            clienteId: venda.cliente?._id,
            total: venda.total || 0,
            quantidadeItens,
            lucroEstimado,
            pagamento,
            itens,
            observacoes: venda.observacoes || '',
            status: venda.status || 'concluida'
          };
        } catch (err) {
          console.error('Erro ao processar venda:', err);
          return null;
        }
      }));
      
      // Filtrar vendas que falharam no processamento
      const vendasValidas = vendasProcessadas.filter(v => v !== null);
      
      return {
        success: true,
        vendas: vendasValidas,
        total: vendasValidas.length,
        filtros
      };
    } catch (error) {
      console.error('Erro ao obter detalhes de vendas:', error);
      return {
        success: false,
        message: `Erro ao buscar vendas: ${error.message}`,
        vendas: [],
        total: 0
      };
    }
  }
  
  // Método para obter análise de vendas por vendedor
  async getAnaliseVendedores(filtros = {}) {
    try {
      await dbConnection.ensureConnected();
      
      // Construir query base
      let matchQuery = { status: { $ne: 'cancelada' } };
      
      // Aplicar filtros de data
      if (filtros.dataInicio || filtros.dataFim) {
        matchQuery.dataVenda = {};
        
        if (filtros.dataInicio) {
          try {
            const dataInicio = new Date(filtros.dataInicio);
            if (!isNaN(dataInicio)) {
              dataInicio.setHours(0, 0, 0, 0);
              matchQuery.dataVenda.$gte = dataInicio;
            }
          } catch (err) {
            console.error('Data de início inválida:', filtros.dataInicio);
          }
        }
        
        if (filtros.dataFim) {
          try {
            const dataFim = new Date(filtros.dataFim);
            if (!isNaN(dataFim)) {
              dataFim.setHours(23, 59, 59, 999);
              matchQuery.dataVenda.$lte = dataFim;
            }
          } catch (err) {
            console.error('Data de fim inválida:', filtros.dataFim);
          }
        }
      }
      
      // Usar o agregador do MongoDB para análise avançada
      const resultados = await Venda.aggregate([
        // Filtrar vendas
        { $match: matchQuery },
        
        // Agrupar por vendedor
        {
          $group: {
            _id: '$vendedor',
            totalVendas: { $sum: '$total' },
            quantidadeVendas: { $count: {} },
            itensVendidos: { $sum: { $size: { $ifNull: ['$itens', []] } } },
            primeiraNaData: { $min: '$dataVenda' },
            ultimaNaData: { $max: '$dataVenda' },
            vendasPorMetodo: {
              $push: {
                metodo: '$pagamento.metodo',
                total: '$total'
              }
            }
          }
        },
        
        // Adicionar dados do vendedor
        {
          $lookup: {
            from: 'usuarios',
            localField: '_id',
            foreignField: '_id',
            as: 'dadosVendedor'
          }
        },
        
        // Ajustar estrutura
        {
          $project: {
            _id: 1,
            vendedorId: '$_id',
            vendedor: { $arrayElemAt: ['$dadosVendedor.nome', 0] },
            email: { $arrayElemAt: ['$dadosVendedor.email', 0] },
            totalVendas: 1,
            quantidadeVendas: 1,
            itensVendidos: 1,
            primeiraNaData: 1,
            ultimaNaData: 1,
            ticketMedio: { 
              $cond: [
                { $eq: ['$quantidadeVendas', 0] },
                0,
                { $divide: ['$totalVendas', '$quantidadeVendas'] }
              ]
            },
            vendasPorMetodo: 1
          }
        },
        
        // Ordenar por total de vendas
        { $sort: { totalVendas: -1 } }
      ]);
      
      // Processar resultados para formato mais amigável
      const vendedoresProcessados = resultados.map(v => {
        // Processar métodos de pagamento
        let metodosPagamento = {};
        v.vendasPorMetodo.forEach(item => {
          const metodo = item.metodo || 'outro';
          metodosPagamento[metodo] = metodosPagamento[metodo] || { total: 0, quantidade: 0 };
          metodosPagamento[metodo].total += item.total || 0;
          metodosPagamento[metodo].quantidade += 1;
        });
        
        // Converter para array
        const metodosPagamentoArray = Object.entries(metodosPagamento).map(([metodo, dados]) => ({
          metodo,
          nomeMetodo: this.formatarMetodoPagamento(metodo),
          total: dados.total,
          quantidade: dados.quantidade
        }));
        
        return {
          id: v.vendedorId,
          nome: v.vendedor || 'Vendedor não identificado',
          email: v.email,
          totalVendas: v.totalVendas || 0,
          quantidadeVendas: v.quantidadeVendas || 0,
          itensVendidos: v.itensVendidos || 0,
          ticketMedio: v.ticketMedio || 0,
          primeiraVenda: v.primeiraNaData ? new Date(v.primeiraNaData).toLocaleDateString('pt-BR') : null,
          ultimaVenda: v.ultimaNaData ? new Date(v.ultimaNaData).toLocaleDateString('pt-BR') : null,
          metodosPagamento: metodosPagamentoArray
        };
      });
      
      return {
        success: true,
        vendedores: vendedoresProcessados,
        total: vendedoresProcessados.length,
        filtros
      };
    } catch (error) {
      console.error('Erro ao gerar análise de vendedores:', error);
      return {
        success: false,
        message: `Erro ao analisar vendedores: ${error.message}`,
        vendedores: [],
        total: 0
      };
    }
  }
  
  // Método para analisar produtos mais vendidos com detalhes adicionais
  async getAnaliseProdutos(filtros = {}) {
    try {
      await dbConnection.ensureConnected();
      
      // Construir query base
      let matchQuery = { status: { $ne: 'cancelada' } };
      
      // Aplicar filtros de data
      if (filtros.dataInicio || filtros.dataFim) {
        matchQuery.dataVenda = {};
        
        if (filtros.dataInicio) {
          try {
            const dataInicio = new Date(filtros.dataInicio);
            if (!isNaN(dataInicio)) {
              dataInicio.setHours(0, 0, 0, 0);
              matchQuery.dataVenda.$gte = dataInicio;
            }
          } catch (err) {
            console.error('Data de início inválida:', filtros.dataInicio);
          }
        }
        
        if (filtros.dataFim) {
          try {
            const dataFim = new Date(filtros.dataFim);
            if (!isNaN(dataFim)) {
              dataFim.setHours(23, 59, 59, 999);
              matchQuery.dataVenda.$lte = dataFim;
            }
          } catch (err) {
            console.error('Data de fim inválida:', filtros.dataFim);
          }
        }
      }
      
      // Filtrar por vendedor
      if (filtros.vendedor && mongoose.Types.ObjectId.isValid(filtros.vendedor)) {
        matchQuery.vendedor = new mongoose.Types.ObjectId(filtros.vendedor);
      }
      
      // Filtrar por categoria
      let matchProdutoQuery = {};
      if (filtros.categoria) {
        matchProdutoQuery.categoria = filtros.categoria;
      }
      
      // Agregação para análise de produtos vendidos
      const resultados = await Venda.aggregate([
        // Filtrar vendas
        { $match: matchQuery },
        
        // Desagrupar itens
        { $unwind: { 
            path: '$itens', 
            preserveNullAndEmptyArrays: false 
        }},
        
        // Agrupar por produto
        {
          $group: {
            _id: '$itens.produto',
            codigo: { $first: '$itens.codigoProduto' },
            nome: { $first: '$itens.nomeProduto' },
            totalQuantidade: { $sum: '$itens.quantidade' },
            totalVendido: { $sum: '$itens.subtotal' },
            ocorrencias: { $sum: 1 },
            vendas: { $addToSet: '$_id' }
          }
        },
        
        // Adicionar informações do produto
        {
          $lookup: {
            from: 'produtos',
            localField: '_id',
            foreignField: '_id',
            as: 'dadosProduto'
          }
        },
        
        // Filtrar por categoria se necessário
        ...(Object.keys(matchProdutoQuery).length > 0 ? [
          { $match: { 'dadosProduto.categoria': filtros.categoria } }
        ] : []),
        
        // Estruturar resultado
        {
          $project: {
            _id: 1,
            produtoId: '$_id',
            codigo: { $ifNull: ['$codigo', { $arrayElemAt: ['$dadosProduto.codigo', 0] }] },
            nome: { $ifNull: ['$nome', { $arrayElemAt: ['$dadosProduto.nome', 0] }] },
            categoria: { $arrayElemAt: ['$dadosProduto.categoria', 0] },
            totalQuantidade: 1,
            totalVendido: 1,
            ocorrencias: 1,
            qtdVendas: { $size: '$vendas' },
            precoMedio: { 
              $cond: [
                { $eq: ['$totalQuantidade', 0] },
                0,
                { $divide: ['$totalVendido', '$totalQuantidade'] }
              ]
            },
            precoAtual: { $arrayElemAt: ['$dadosProduto.precoVenda', 0] },
            estoque: { $arrayElemAt: ['$dadosProduto.estoque', 0] }
          }
        },
        
        // Ordenar por total vendido
        { $sort: { totalVendido: -1 } },
        
        // Limitar resultados (opcional)
        ...(filtros.limite && !isNaN(parseInt(filtros.limite)) ? [
          { $limit: parseInt(filtros.limite) }
        ] : [])
      ]);
      
      // Calcular totais gerais
      const totalQuantidadeGeral = resultados.reduce((acc, item) => acc + (item.totalQuantidade || 0), 0);
      const totalVendidoGeral = resultados.reduce((acc, item) => acc + (item.totalVendido || 0), 0);
      
      // Adicionar percentuais e formatar valores
      const produtosProcessados = resultados.map(item => ({
        id: item.produtoId,
        codigo: item.codigo || 'N/A',
        nome: item.nome || 'Produto sem nome',
        categoria: item.categoria || 'Sem categoria',
        quantidadeVendida: item.totalQuantidade || 0,
        percentualQuantidade: totalQuantidadeGeral > 0 
          ? ((item.totalQuantidade / totalQuantidadeGeral) * 100).toFixed(2) + '%' 
          : '0%',
        totalVendido: item.totalVendido || 0,
        percentualValor: totalVendidoGeral > 0 
          ? ((item.totalVendido / totalVendidoGeral) * 100).toFixed(2) + '%' 
          : '0%',
        ocorrencias: item.ocorrencias || 0,
        quantidadeVendas: item.qtdVendas || 0,
        precoMedio: item.precoMedio || 0,
        precoAtual: item.precoAtual || 0,
        estoque: item.estoque !== undefined ? item.estoque : 'N/D'
      }));
      
      return {
        success: true,
        produtos: produtosProcessados,
        total: produtosProcessados.length,
        totalQuantidade: totalQuantidadeGeral,
        totalVendido: totalVendidoGeral,
        filtros
      };
    } catch (error) {
      console.error('Erro ao analisar produtos vendidos:', error);
      return {
        success: false,
        message: `Erro ao analisar produtos: ${error.message}`,
        produtos: [],
        total: 0
      };
    }
  }
  
  // Método para análise de vendas por período (diário, semanal, mensal)
  async getAnalisePeriodo(filtros = {}) {
    try {
      await dbConnection.ensureConnected();
      
      // Determinar tipo de agrupamento
      const tipoPeriodo = filtros.tipo || 'diario';
      
      // Configurar formato de data para agrupamento
      let formatoData;
      let nomeCampo;
      
      switch (tipoPeriodo) {
        case 'semanal':
          formatoData = { $dateToString: { format: '%G-W%V', date: '$dataVenda' } };
          nomeCampo = 'Semana';
          break;
        case 'mensal':
          formatoData = { $dateToString: { format: '%Y-%m', date: '$dataVenda' } };
          nomeCampo = 'Mês';
          break;
        default: // diário
          formatoData = { $dateToString: { format: '%Y-%m-%d', date: '$dataVenda' } };
          nomeCampo = 'Data';
      }
      
      // Construir query base
      let matchQuery = { status: { $ne: 'cancelada' } };
      
      // Aplicar filtros de data
      if (filtros.dataInicio || filtros.dataFim) {
        matchQuery.dataVenda = {};
        
        if (filtros.dataInicio) {
          try {
            const dataInicio = new Date(filtros.dataInicio);
            if (!isNaN(dataInicio)) {
              dataInicio.setHours(0, 0, 0, 0);
              matchQuery.dataVenda.$gte = dataInicio;
            }
          } catch (err) {
            console.error('Data de início inválida:', filtros.dataInicio);
          }
        }
        
        if (filtros.dataFim) {
          try {
            const dataFim = new Date(filtros.dataFim);
            if (!isNaN(dataFim)) {
              dataFim.setHours(23, 59, 59, 999);
              matchQuery.dataVenda.$lte = dataFim;
            }
          } catch (err) {
            console.error('Data de fim inválida:', filtros.dataFim);
          }
        }
      }
      
      // Filtrar por vendedor
      if (filtros.vendedor && mongoose.Types.ObjectId.isValid(filtros.vendedor)) {
        matchQuery.vendedor = new mongoose.Types.ObjectId(filtros.vendedor);
      }
      
      // Agregação para análise por período
      const resultados = await Venda.aggregate([
        // Filtrar vendas
        { $match: matchQuery },
        
        // Adicionar campo para agrupamento
        {
          $addFields: {
            periodoAgrupamento: formatoData
          }
        },
        
        // Agrupar por período
        {
          $group: {
            _id: '$periodoAgrupamento',
            totalVendas: { $sum: '$total' },
            quantidadeVendas: { $count: {} },
            // Contar itens vendidos
            itensVendidos: {
              $sum: {
                $reduce: {
                  input: '$itens',
                  initialValue: 0,
                  in: { $add: ['$$value', { $ifNull: ['$$this.quantidade', 0] }] }
                }
              }
            },
            // Agrupar métodos de pagamento
            metodosPagamento: {
              $push: {
                metodo: '$pagamento.metodo',
                total: '$total'
              }
            },
            // Manter registro das datas exatas para ordenação correta
            primeiraData: { $min: '$dataVenda' },
            ultimaData: { $max: '$dataVenda' }
          }
        },
        
        // Estruturar resultado
        {
          $project: {
            _id: 0,
            periodo: '$_id',
            totalVendas: 1,
            quantidadeVendas: 1,
            itensVendidos: 1,
            metodosPagamento: 1,
            primeiraData: 1,
            ultimaData: 1,
            ticketMedio: { 
              $cond: [
                { $eq: ['$quantidadeVendas', 0] },
                0,
                { $divide: ['$totalVendas', '$quantidadeVendas'] }
              ]
            }
          }
        },
        
        // Ordenar por data
        { $sort: { primeiraData: 1 } }
      ]);
      
      // Processamento adicional dos resultados
      const periodos = resultados.map(periodo => {
        // Formatar nome do período conforme o tipo
        let nomePeriodo = periodo.periodo;
        if (tipoPeriodo === 'diario' && periodo.periodo) {
          // Formatar data no formato brasileiro
          const partes = periodo.periodo.split('-');
          if (partes.length === 3) {
            nomePeriodo = `${partes[2]}/${partes[1]}/${partes[0]}`;
          }
        } else if (tipoPeriodo === 'mensal' && periodo.periodo) {
          // Formatar mês em formato legível
          const partes = periodo.periodo.split('-');
          if (partes.length === 2) {
            const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                         'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
            const mes = parseInt(partes[1]) - 1;
            nomePeriodo = `${meses[mes]} de ${partes[0]}`;
          }
        } else if (tipoPeriodo === 'semanal' && periodo.periodo) {
          // Formatar semana em formato legível
          const partes = periodo.periodo.split('-W');
          if (partes.length === 2) {
            nomePeriodo = `Semana ${partes[1]} de ${partes[0]}`;
          }
        }
        
        // Processar métodos de pagamento
        let metodosPorTipo = {};
        if (Array.isArray(periodo.metodosPagamento)) {
          periodo.metodosPagamento.forEach(item => {
            if (item.metodo) {
              metodosPorTipo[item.metodo] = metodosPorTipo[item.metodo] || { 
                total: 0, 
                quantidade: 0 
              };
              metodosPorTipo[item.metodo].total += item.total || 0;
              metodosPorTipo[item.metodo].quantidade += 1;
            }
          });
        }
        
        // Converter para array
        const metodosPagamento = Object.entries(metodosPorTipo).map(([metodo, dados]) => ({
          metodo,
          nomeMetodo: this.formatarMetodoPagamento(metodo),
          total: dados.total,
          quantidade: dados.quantidade
        }));
        
        return {
          periodo: periodo.periodo,
          nomePeriodo,
          totalVendas: periodo.totalVendas || 0,
          quantidadeVendas: periodo.quantidadeVendas || 0,
          itensVendidos: periodo.itensVendidos || 0,
          ticketMedio: periodo.ticketMedio || 0,
          metodosPagamento,
          primeiraData: periodo.primeiraData ? new Date(periodo.primeiraData) : null,
          ultimaData: periodo.ultimaData ? new Date(periodo.ultimaData) : null
        };
      });
      
      return {
        success: true,
        periodos,
        tipo: tipoPeriodo,
        nomeCampo,
        total: periodos.length,
        filtros
      };
    } catch (error) {
      console.error('Erro ao analisar vendas por período:', error);
      return {
        success: false,
        message: `Erro ao analisar vendas por período: ${error.message}`,
        periodos: [],
        total: 0
      };
    }
  }
  
  // Método para resumo financeiro comparativo
  async getResumoFinanceiro(filtros = {}) {
    try {
      await dbConnection.ensureConnected();
      
      // Definir períodos para comparação
      const hoje = new Date();
      const periodoAtual = {
        inicio: filtros.dataInicio ? new Date(filtros.dataInicio) : new Date(hoje.getFullYear(), hoje.getMonth(), 1),
        fim: filtros.dataFim ? new Date(filtros.dataFim) : hoje
      };
      
      // Garantir que as datas são válidas
      if (isNaN(periodoAtual.inicio.getTime())) {
        periodoAtual.inicio = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      }
      if (isNaN(periodoAtual.fim.getTime())) {
        periodoAtual.fim = hoje;
      }
      
      // Ajustar horários
      periodoAtual.inicio.setHours(0, 0, 0, 0);
      periodoAtual.fim.setHours(23, 59, 59, 999);
      
      // Calcular período anterior (mesmo intervalo de dias)
      const diasPeriodo = Math.ceil(
        (periodoAtual.fim - periodoAtual.inicio) / (1000 * 60 * 60 * 24)
      );
      
      const periodoAnterior = {
        inicio: new Date(periodoAtual.inicio),
        fim: new Date(periodoAtual.fim)
      };
      periodoAnterior.inicio.setDate(periodoAnterior.inicio.getDate() - diasPeriodo);
      periodoAnterior.fim.setDate(periodoAnterior.fim.getDate() - diasPeriodo);
      
      // Buscar dados do período atual
      const dadosAtual = await this.buscarDadosFinanceiros(periodoAtual.inicio, periodoAtual.fim, filtros);
      
      // Buscar dados do período anterior
      const dadosAnterior = await this.buscarDadosFinanceiros(periodoAnterior.inicio, periodoAnterior.fim, filtros);
      
      // Calcular variações percentuais
      const calcularVariacao = (atual, anterior) => {
        if (anterior === 0) return atual > 0 ? 100 : 0;
        return ((atual - anterior) / anterior) * 100;
      };
      
      // Estruturar resultado
      const resultado = {
        periodoAtual: {
          inicio: periodoAtual.inicio.toISOString().split('T')[0],
          fim: periodoAtual.fim.toISOString().split('T')[0],
          totalVendas: dadosAtual.totalVendas,
          totalRecebido: dadosAtual.totalRecebido,
          quantidadeVendas: dadosAtual.quantidadeVendas,
          ticketMedio: dadosAtual.ticketMedio,
          itensVendidos: dadosAtual.itensVendidos,
          vendasPorMetodo: dadosAtual.vendasPorMetodo
        },
        periodoAnterior: {
          inicio: periodoAnterior.inicio.toISOString().split('T')[0],
          fim: periodoAnterior.fim.toISOString().split('T')[0],
          totalVendas: dadosAnterior.totalVendas,
          totalRecebido: dadosAnterior.totalRecebido,
          quantidadeVendas: dadosAnterior.quantidadeVendas,
          ticketMedio: dadosAnterior.ticketMedio,
          itensVendidos: dadosAnterior.itensVendidos,
          vendasPorMetodo: dadosAnterior.vendasPorMetodo
        },
        variacoes: {
          totalVendas: calcularVariacao(dadosAtual.totalVendas, dadosAnterior.totalVendas),
          totalRecebido: calcularVariacao(dadosAtual.totalRecebido, dadosAnterior.totalRecebido),
          quantidadeVendas: calcularVariacao(dadosAtual.quantidadeVendas, dadosAnterior.quantidadeVendas),
          ticketMedio: calcularVariacao(dadosAtual.ticketMedio, dadosAnterior.ticketMedio),
          itensVendidos: calcularVariacao(dadosAtual.itensVendidos, dadosAnterior.itensVendidos)
        }
      };
      
      return {
        success: true,
        resumo: resultado,
        filtros: {
          ...filtros,
          diasPeriodo
        }
      };
    } catch (error) {
      console.error('Erro ao gerar resumo financeiro:', error);
      return {
        success: false,
        message: `Erro ao gerar resumo financeiro: ${error.message}`,
        resumo: null
      };
    }
  }
  
  // Método auxiliar para buscar dados financeiros
  async buscarDadosFinanceiros(dataInicio, dataFim, filtrosAdicionais = {}) {
    // Construir query base
    let match = { 
      status: { $ne: 'cancelada' },
      dataVenda: {
        $gte: dataInicio,
        $lte: dataFim
      }
    };
    
    // Adicionar filtro de vendedor, se houver
    if (filtrosAdicionais.vendedor && mongoose.Types.ObjectId.isValid(filtrosAdicionais.vendedor)) {
      match.vendedor = new mongoose.Types.ObjectId(filtrosAdicionais.vendedor);
    }
    
    const resultados = await Venda.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalVendas: { $sum: '$total' },
          totalRecebido: { 
            $sum: { 
              $cond: [
                { $eq: ['$pagamento.status', 'pago'] },
                '$total',
                0
              ]
            } 
          },
          quantidadeVendas: { $count: {} },
          // Contar itens vendidos
          itensVendidos: {
            $sum: {
              $reduce: {
                input: '$itens',
                initialValue: 0,
                in: { $add: ['$$value', { $ifNull: ['$$this.quantidade', 0] }] }
              }
            }
          },
          // Agrupar por método de pagamento
          metodos: {
            $push: {
              metodo: '$pagamento.metodo',
              total: '$total'
            }
          }
        }
      }
    ]);
    
    // Valores padrão para o caso de não haver dados
    const dadosPadrao = {
      totalVendas: 0,
      totalRecebido: 0,
      quantidadeVendas: 0,
      ticketMedio: 0,
      itensVendidos: 0,
      vendasPorMetodo: []
    };
    
    // Se não há resultados, retornar dados padrão
    if (!resultados || resultados.length === 0) {
      return dadosPadrao;
    }
    
    const dados = resultados[0];
    
    // Processar métodos de pagamento
    let metodosPorTipo = {};
    if (Array.isArray(dados.metodos)) {
      dados.metodos.forEach(item => {
        if (item.metodo) {
          metodosPorTipo[item.metodo] = metodosPorTipo[item.metodo] || { 
            total: 0, 
            quantidade: 0 
          };
          metodosPorTipo[item.metodo].total += item.total || 0;
          metodosPorTipo[item.metodo].quantidade += 1;
        }
      });
    }
    
    // Converter para array
    const vendasPorMetodo = Object.entries(metodosPorTipo).map(([metodo, dados]) => ({
      metodo,
      nomeMetodo: this.formatarMetodoPagamento(metodo),
      total: dados.total,
      quantidade: dados.quantidade
    }));
    
    // Calcular ticket médio
    const ticketMedio = dados.quantidadeVendas > 0 ? 
      dados.totalVendas / dados.quantidadeVendas : 0;
    
    return {
      totalVendas: dados.totalVendas || 0,
      totalRecebido: dados.totalRecebido || 0,
      quantidadeVendas: dados.quantidadeVendas || 0,
      ticketMedio,
      itensVendidos: dados.itensVendidos || 0,
      vendasPorMetodo
    };
  }
  
  // Métodos auxiliares de formatação
  formatarMetodoPagamento(metodo) {
    const metodos = {
      dinheiro: 'Dinheiro',
      cartao_credito: 'Cartão de Crédito',
      cartao_debito: 'Cartão de Débito',
      pix: 'PIX',
      fiado: 'Fiado',
      transferencia: 'Transferência',
      cheque: 'Cheque',
      outro: 'Outro'
    };
    return metodos[metodo] || metodo || 'Outro';
  }
  
  formatarStatusPagamento(status) {
    const statusMap = {
      pago: 'Pago',
      pendente: 'Pendente',
      parcial: 'Parcialmente Pago',
      cancelado: 'Cancelado',
      estornado: 'Estornado'
    };
    return statusMap[status] || status || 'Desconhecido';
  }
}

module.exports = new RelatoriosController();
