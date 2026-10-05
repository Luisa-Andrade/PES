const mongoose = require('mongoose');
const Venda = require('../models/venda');
const Produto = require('../models/produto');
const HistoricoCredito = require('../models/historicoCredito');
const dbConnection = require('../db/connection');

class VendasController {
  constructor() {
    // Garantir conexão com o banco
    dbConnection.ensureConnected();
  }
  
  // Registrar nova venda
  async registrarVenda(dadosVenda, opcoes = {}) {
    try {
      await dbConnection.ensureConnected();
      
      console.log("Iniciando registro de venda:", JSON.stringify(dadosVenda));
      
      // Validar dados básicos
      if (!dadosVenda.itens || dadosVenda.itens.length === 0) {
        return {
          success: false,
          message: 'A venda deve conter pelo menos um item'
        };
      }
      
      // Validar pagamento
      if (!dadosVenda.pagamento || !dadosVenda.pagamento.metodo) {
        return {
          success: false,
          message: 'Método de pagamento não especificado'
        };
      }
      
      // Processar o ID do vendedor - correção para o formato buffer
      let vendedorId = null;
      if (dadosVenda.vendedor) {
        // Verificar se é um objeto com buffer
        if (typeof dadosVenda.vendedor === 'object' && dadosVenda.vendedor.buffer) {
          try {
            // Extrair valores do buffer e criar uma string hexadecimal
            const bufferValues = Object.values(dadosVenda.vendedor.buffer);
            const hexString = Array.from(bufferValues)
              .map(b => b.toString(16).padStart(2, '0'))
              .join('');
            
            vendedorId = hexString;
            console.log('Vendedor ID convertido de buffer para hex:', vendedorId);
          } catch (err) {
            console.error('Erro ao converter buffer do vendedor:', err);
          }
        } else if (typeof dadosVenda.vendedor === 'string') {
          vendedorId = dadosVenda.vendedor;
        }
      }
      
      // Criar objeto da venda com vendedorId processado
      const vendaData = {
        cliente: dadosVenda.cliente || null,
        nomeCliente: dadosVenda.nomeCliente || 'Cliente Balcão',
        nomeVendedor: dadosVenda.nomeVendedor || 'Vendedor não especificado',
        itens: dadosVenda.itens.map(item => ({
          produto: item.produto,
          codigoProduto: item.codigoProduto,
          nomeProduto: item.nomeProduto,
          quantidade: parseFloat(item.quantidade) || 0,
          precoUnitario: parseFloat(item.precoUnitario) || 0,
          subtotal: parseFloat(item.subtotal) || 0,
          unidadeMedida: item.unidadeMedida || 'un',
          exigeReceita: Boolean(item.exigeReceita),
          receitaApresentada: item.receitaApresentada === true
        })),
        subtotal: parseFloat(dadosVenda.subtotal) || 
                  dadosVenda.itens.reduce((total, item) => total + (parseFloat(item.subtotal) || 0), 0),
        desconto: parseFloat(dadosVenda.desconto) || 0,
        total: parseFloat(dadosVenda.total) || 
               (parseFloat(dadosVenda.subtotal) || 
                dadosVenda.itens.reduce((total, item) => total + (parseFloat(item.subtotal) || 0), 0)) - 
               (parseFloat(dadosVenda.desconto) || 0),
        origem: dadosVenda.origem === 'DELIVERY' ? 'DELIVERY' : 'BALCAO',
        taxaEntrega: Math.max(0, parseFloat(dadosVenda.taxaEntrega) || 0),
        pagamento: {
          metodo: dadosVenda.pagamento.metodo,
          parcelas: parseInt(dadosVenda.pagamento.parcelas) || 1,
          valorRecebido: dadosVenda.pagamento.valorRecebido ? parseFloat(dadosVenda.pagamento.valorRecebido) : null,
          troco: dadosVenda.pagamento.troco ? parseFloat(dadosVenda.pagamento.troco) : null
        },
        observacoes: dadosVenda.observacoes || '',
        preVendaCodigo: dadosVenda.preVendaCodigo || undefined,
        operadorCaixa: dadosVenda.operadorCaixa || undefined,
        entrega: dadosVenda.entrega || { necessita: false }
      };
      
      // Adicionar o vendedor apenas se o ID for válido
      if (vendedorId) {
        vendaData.vendedor = vendedorId;
      }
      
      // Verificar se é venda fiado e processar adequadamente
      if (dadosVenda.pagamento && dadosVenda.pagamento.metodo === 'fiado') {
        // Validar cliente para fiado
        if (!dadosVenda.cliente) {
          return {
            success: false,
            message: 'É necessário selecionar um cliente para vendas fiado'
          };
        }
        
        // Buscar cliente para verificar limite de crédito
        const Cliente = mongoose.model('Cliente');
        const cliente = await Cliente.findById(dadosVenda.cliente);
        
        if (!cliente) {
          return {
            success: false,
            message: 'Cliente não encontrado'
          };
        }
        
        // Converter valor total para número
        const valorTotal = parseFloat(vendaData.total) || 0;
        
        console.log(`[CREDITO] Verificação de crédito para cliente ${cliente.nome}:`);
        console.log(`  - Valor da compra: R$ ${valorTotal}`);
        console.log(`  - Limite de crédito: R$ ${cliente.limiteCredito}`);
        console.log(`  - Saldo devedor atual: R$ ${cliente.saldoDevedor}`);
        console.log(`  - Crédito disponível: R$ ${cliente.limiteCredito - cliente.saldoDevedor}`);
        console.log(`  - Status do crédito: ${cliente.statusCredito}`);
        
        // Verificar se cliente possui crédito disponível
        if (!cliente.possuiCreditoDisponivel(valorTotal)) {
          const creditoDisponivel = cliente.limiteCredito - cliente.saldoDevedor;
          return {
            success: false,
            message: `Cliente não possui limite de crédito suficiente. Disponível: R$ ${creditoDisponivel.toFixed(2)} | Necessário: R$ ${valorTotal.toFixed(2)}`
          };
        }
        
        // Configurar dados do fiado
        const dataVencimento = new Date();
        dataVencimento.setDate(dataVencimento.getDate() + 30); // Vencimento padrão em 30 dias
        
        vendaData.pagamento.fiado = {
          dataVencimento: dadosVenda.pagamento.fiado?.dataVencimento || dataVencimento,
          status: 'pendente',
          valorPago: 0,
          historicoPagamentos: []
        };
      }
      
      // Validar estoque antes de registrar a venda (evita vender mais do que existe)
      for (const item of vendaData.itens) {
        if (!item.produto || !mongoose.Types.ObjectId.isValid(item.produto)) {
          return { success: false, message: 'Um dos itens não possui produto válido.' };
        }
        const quantidadeNum = Number(item.quantidade);
        if (!Number.isFinite(quantidadeNum) || quantidadeNum <= 0) {
          return { success: false, message: 'A quantidade dos produtos deve ser maior que zero.' };
        }
        
        const produto = await Produto.findById(item.produto).select('nome estoque exigeReceita ativo');
        if (!produto || !produto.ativo) {
          return { success: false, message: 'Um dos produtos não está mais disponível.' };
        }
        if (produto.exigeReceita && item.receitaApresentada !== true) {
          return {
            success: false,
            message: `Confirme que há receita para "${produto.nome}" antes de finalizar.`
          };
        }
        
        if (!opcoes.estoqueReservado && produto.estoque < quantidadeNum) {
          return {
            success: false,
            message: `Estoque insuficiente para "${produto.nome}". Disponível: ${produto.estoque}`
          };
        }
      }
      
      // Criar a venda
      const venda = new Venda(vendaData);
      
      // Usar sessão para garantir que todas as operações sejam atômicas
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        // Salvar a venda
        await venda.save({ session });
        
        // Pré-vendas com reserva já baixaram o estoque ao salvar seus itens.
        if (!opcoes.estoqueReservado) {
          for (const item of vendaData.itens) {
            if (!item.produto || !mongoose.Types.ObjectId.isValid(item.produto)) continue;
            const quantidadeNum = parseFloat(item.quantidade) || 0;
            if (quantidadeNum <= 0) continue;

            const produtoAtualizado = await Produto.findOneAndUpdate(
              { _id: item.produto, estoque: { $gte: quantidadeNum } },
              { $inc: { estoque: -quantidadeNum } },
              { session, new: true }
            );

            if (!produtoAtualizado) {
              const produto = await Produto.findById(item.produto).session(session).select('nome estoque');
              const nome = produto ? produto.nome : item.nomeProduto || 'produto';
              const disponivel = produto ? produto.estoque : 0;
              throw new Error(`Estoque insuficiente para "${nome}". Disponível: ${disponivel}`);
            }
          }
        }
        
        // Se for fiado, atualizar saldo devedor do cliente e registrar no histórico
        if (dadosVenda.pagamento.metodo === 'fiado' && dadosVenda.cliente) {
          const Cliente = mongoose.model('Cliente');
          const cliente = await Cliente.findById(dadosVenda.cliente).session(session);
          
          if (cliente) {
            // Garantir que o valor é numérico
            const valorTotal = parseFloat(vendaData.total) || 0;
            const saldoAnterior = parseFloat(cliente.saldoDevedor) || 0;
            
            await cliente.registrarFiado(valorTotal, session);
            
            console.log(`[CREDITO] Registrando compra fiado no histórico - Cliente ID:`, dadosVenda.cliente, 'tipo:', typeof dadosVenda.cliente);
            
            // Registrar no histórico de crédito
            const historico = new HistoricoCredito({
              cliente: dadosVenda.cliente,
              nomeCliente: cliente.nome,
              tipo: 'compra_fiado',
              descricao: `Compra fiado - Venda ${venda.codigo}`,
              valor: valorTotal,
              saldoAnterior: saldoAnterior,
              saldoNovo: saldoAnterior + valorTotal,
              venda: venda._id,
              codigoVenda: venda.codigo,
              usuario: vendedorId,
              nomeUsuario: dadosVenda.nomeVendedor
            });
            
            console.log(`[CREDITO] Histórico de compra criado:`, JSON.stringify(historico.toObject()));
            await historico.save({ session });
            console.log(`[CREDITO] Histórico de compra salvo com sucesso, ID:`, historico._id);
            
            console.log(`[CREDITO] Compra fiado registrada no histórico do cliente ${cliente.nome}`);
          }
        }

        // Permite que funcionalidades integradas (como Delivery) persistam seus
        // próprios documentos na mesma transação da venda e da baixa de estoque.
        let dadosRelacionados = {};
        if (typeof opcoes.antesCommit === 'function') {
          dadosRelacionados = await opcoes.antesCommit({ venda, session, vendaData }) || {};
        }
        
        // Confirmar a transação
        await session.commitTransaction();
        
        console.log(`Venda registrada com sucesso. Código: ${venda.codigo}`);
        
        return {
          success: true,
          venda: {
            codigo: venda.codigo,
            data: venda.dataVenda,
            total: venda.total,
            _id: venda._id.toString()
          },
          ...dadosRelacionados
        };
      } catch (error) {
        // Em caso de erro, reverter a transação
        await session.abortTransaction();
        console.error('Erro durante a transação:', error);
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      console.error('Erro ao registrar venda:', error);
      return {
        success: false,
        message: `Erro ao registrar venda: ${error.message}`
      };
    }
  }
  
  // Buscar vendas com filtros
  async getVendas(filtros = {}) {
    try {
      await dbConnection.ensureConnected();
      
      let query = {};
      
      // Aplicar filtros de data
      if (filtros.dataInicio || filtros.dataFim) {
        query.dataVenda = {};
        if (filtros.dataInicio) {
          query.dataVenda.$gte = new Date(filtros.dataInicio);
        }
        if (filtros.dataFim) {
          const dataFim = new Date(filtros.dataFim);
          dataFim.setHours(23, 59, 59, 999);
          query.dataVenda.$lte = dataFim;
        }
      }
      
      // Filtro por vendedor
      if (filtros.vendedor) {
        query.vendedor = filtros.vendedor;
      }
      
      // Filtro por cliente
      if (filtros.cliente) {
        query.cliente = filtros.cliente;
      }
      
      // Filtro por status
      if (filtros.status) {
        query.status = filtros.status;
      }
      
      // Buscar vendas
      const vendas = await Venda.find(query)
        .sort({ dataVenda: -1 })
        .limit(filtros.limite || 100);
      
      console.log(`Encontradas ${vendas.length} vendas`);
      
      return vendas.map(venda => ({
        _id: venda._id,
        codigo: venda.codigo,
        nomeCliente: venda.nomeCliente,
        nomeVendedor: venda.nomeVendedor,
        dataVenda: venda.dataVenda,
        total: venda.total,
        origem: venda.origem || 'BALCAO',
        taxaEntrega: venda.taxaEntrega || 0,
        status: venda.status,
        pagamento: venda.pagamento.metodo,
        itensCount: venda.itens.length
      }));
    } catch (error) {
      console.error('Erro ao buscar vendas:', error);
      throw error;
    }
  }
  
  // Buscar detalhes de uma venda
  async getVendaDetalhes(id) {
    try {
      await dbConnection.ensureConnected();
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('ID de venda inválido');
      }
      
      const venda = await Venda.findById(id);
      
      if (!venda) {
        throw new Error('Venda não encontrada');
      }
      
      // Serializar para evitar problemas de clonagem no IPC
      return {
        _id: venda._id ? venda._id.toString() : null,
        codigo: venda.codigo,
        cliente: venda.cliente ? venda.cliente.toString() : null,
        nomeCliente: venda.nomeCliente,
        vendedor: venda.vendedor ? venda.vendedor.toString() : null,
        nomeVendedor: venda.nomeVendedor,
        dataVenda: venda.dataVenda,
        itens: venda.itens.map(item => ({
          produto: item.produto ? item.produto.toString() : null,
          codigoProduto: item.codigoProduto,
          nomeProduto: item.nomeProduto,
          quantidade: item.quantidade,
          precoUnitario: item.precoUnitario,
          subtotal: item.subtotal,
          unidadeMedida: item.unidadeMedida
        })),
        subtotal: venda.subtotal,
        desconto: venda.desconto,
        total: venda.total,
        origem: venda.origem || 'BALCAO',
        taxaEntrega: venda.taxaEntrega || 0,
        pagamento: {
          metodo: venda.pagamento.metodo,
          parcelas: venda.pagamento.parcelas,
          valorRecebido: venda.pagamento.valorRecebido,
          troco: venda.pagamento.troco,
          fiado: venda.pagamento.fiado ? {
            dataVencimento: venda.pagamento.fiado.dataVencimento,
            status: venda.pagamento.fiado.status,
            valorPago: venda.pagamento.fiado.valorPago,
            historicoPagamentos: venda.pagamento.fiado.historicoPagamentos || []
          } : null
        },
        status: venda.status,
        observacoes: venda.observacoes,
        criadoEm: venda.criadoEm,
        atualizadoEm: venda.atualizadoEm
      };
    } catch (error) {
      console.error(`Erro ao buscar detalhes da venda ${id}:`, error);
      throw error;
    }
  }
  
  // Cancelar uma venda
  async cancelarVenda(id, opcoes = {}) {
    try {
      await dbConnection.ensureConnected();
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return {
          success: false,
          message: 'ID de venda inválido'
        };
      }
      
      // Buscar a venda a ser cancelada
      const venda = await Venda.findById(id);
      
      if (!venda) {
        return {
          success: false,
          message: 'Venda não encontrada'
        };
      }
      
      if (venda.status === 'cancelada') {
        return {
          success: false,
          message: 'Esta venda já está cancelada'
        };
      }

      if (venda.origem === 'DELIVERY' && !opcoes.permitirDelivery) {
        return {
          success: false,
          message: 'Cancele vendas delivery pela página Delivery para manter o pedido e o estoque sincronizados.'
        };
      }
      
      // Usar sessão para garantir que todas as operações sejam atômicas
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        // Atualizar status da venda para cancelada
        venda.status = 'cancelada';
        await venda.save({ session });
        
        // Restaurar estoque dos produtos
        for (const item of venda.itens) {
          if (item.produto) {
            await Produto.updateOne(
              { _id: item.produto },
              { $inc: { estoque: item.quantidade } },
              { session }
            );
          }
        }

        // Delivery usa a mesma venda para faturamento. Ao cancelar um pedido
        // fiado ainda não entregue, também desfaz o débito criado pela venda.
        if (opcoes.reverterFiado && venda.pagamento?.metodo === 'fiado' && venda.cliente) {
          const Cliente = mongoose.model('Cliente');
          const cliente = await Cliente.findById(venda.cliente).session(session);
          if (cliente) {
            const saldoAnterior = Number(cliente.saldoDevedor || 0);
            const valorPago = Number(venda.pagamento.fiado?.valorPago || 0);
            const valorPendente = Math.max(0, Number(venda.total || 0) - valorPago);
            cliente.saldoDevedor = Math.max(0, saldoAnterior - valorPendente);
            cliente.totalCompras = Math.max(0, Number(cliente.totalCompras || 0) - Number(venda.total || 0));
            await cliente.save({ session });

            const historico = new HistoricoCredito({
              cliente: cliente._id,
              nomeCliente: cliente.nome,
              tipo: 'ajuste_credito',
              descricao: `Cancelamento da venda delivery ${venda.codigo}`,
              valor: -valorPendente,
              saldoAnterior,
              saldoNovo: cliente.saldoDevedor,
              venda: venda._id,
              codigoVenda: venda.codigo,
              observacoes: 'Estorno automático pelo cancelamento do pedido delivery'
            });
            await historico.save({ session });
          }
        }


        if (typeof opcoes.antesCommit === 'function') {
          await opcoes.antesCommit({ venda, session });
        }
        
        // Confirmar a transação
        await session.commitTransaction();
        
        console.log(`Venda ${venda.codigo} cancelada com sucesso`);
        
        return {
          success: true,
          message: 'Venda cancelada com sucesso'
        };
      } catch (error) {
        // Em caso de erro, reverter a transação
        await session.abortTransaction();
        console.error('Erro durante o cancelamento:', error);
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      console.error(`Erro ao cancelar venda ${id}:`, error);
      return {
        success: false,
        message: `Erro ao cancelar venda: ${error.message}`
      };
    }
  }
  
  // Registrar pagamento de venda fiado
  async registrarPagamentoFiado(id, dadosPagamento) {
    try {
      await dbConnection.ensureConnected();
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return {
          success: false,
          message: 'ID de venda inválido'
        };
      }
      
      // Validar dados de pagamento
      if (!dadosPagamento.valor || dadosPagamento.valor <= 0) {
        return {
          success: false,
          message: 'Valor de pagamento inválido'
        };
      }
      
      // Buscar venda
      const venda = await Venda.findById(id);
      
      if (!venda) {
        return {
          success: false,
          message: 'Venda não encontrada'
        };
      }
      
      // Verificar se é uma venda fiado
      if (venda.pagamento.metodo !== 'fiado') {
        return {
          success: false,
          message: 'Esta venda não é do tipo fiado'
        };
      }
      
      // Calcular valor do pagamento (não pode exceder o valor pendente)
      const valorPendente = venda.total - (venda.pagamento.fiado.valorPago || 0);
      const valorPagamento = Math.min(dadosPagamento.valor, valorPendente);
      
      if (valorPagamento <= 0) {
        return {
          success: false,
          message: 'Esta venda já está totalmente paga'
        };
      }
      
      // Iniciar sessão para transação
      const session = await mongoose.startSession();
      session.startTransaction();
      
      try {
        // Adicionar pagamento ao histórico
        if (!venda.pagamento.fiado.historicoPagamentos) {
          venda.pagamento.fiado.historicoPagamentos = [];
        }
        
        venda.pagamento.fiado.historicoPagamentos.push({
          data: new Date(),
          valor: valorPagamento,
          formaPagamento: dadosPagamento.formaPagamento || 'dinheiro',
          recebidoPor: dadosPagamento.recebidoPor || 'Operador de sistema'
        });
        
        // Atualizar valor pago
        venda.pagamento.fiado.valorPago = (venda.pagamento.fiado.valorPago || 0) + valorPagamento;
        
        // Atualizar status
        if (venda.pagamento.fiado.valorPago >= venda.total) {
          venda.pagamento.fiado.status = 'pago';
        } else {
          venda.pagamento.fiado.status = 'parcial';
        }
        
        // Salvar venda
        await venda.save({ session });
        
        // Atualizar saldo devedor do cliente
        if (venda.cliente) {
          const Cliente = mongoose.model('Cliente');
          const cliente = await Cliente.findById(venda.cliente);
          
          if (cliente) {
            await cliente.registrarPagamento(valorPagamento, session);
          }
        }
        
        // Confirmar transação
        await session.commitTransaction();
        
        return {
          success: true,
          message: `Pagamento de ${valorPagamento.toFixed(2)} registrado com sucesso`,
          valorPago: venda.pagamento.fiado.valorPago,
          status: venda.pagamento.fiado.status
        };
      } catch (error) {
        // Em caso de erro, reverter a transação
        await session.abortTransaction();
        console.error('Erro durante o registro de pagamento:', error);
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      console.error(`Erro ao registrar pagamento fiado para venda ${id}:`, error);
      return {
        success: false,
        message: `Erro ao registrar pagamento: ${error.message}`
      };
    }
  }
  
  // Obter lista de vendas fiado pendentes para um cliente
  async getVendasFiadoCliente(clienteId) {
    try {
      await dbConnection.ensureConnected();
      
      console.log("Buscando vendas fiado para cliente:", clienteId, "tipo:", typeof clienteId);
      
      // Validar se o ID é um ObjectId válido ou converter para um formato adequado
      if (!clienteId) {
        throw new Error('ID de cliente não fornecido');
      }
      
      // Converter para String caso seja número
      if (typeof clienteId === 'number') {
        clienteId = clienteId.toString();
      }
      
      let query = {
        'pagamento.metodo': 'fiado',
        'pagamento.fiado.status': { $in: ['pendente', 'parcial', 'atrasado'] }
      };
      
      // Adicionar condição de cliente apenas se o ID for válido
      if (mongoose.Types.ObjectId.isValid(clienteId)) {
        query.cliente = clienteId;
      } else {
        // Se não for um ObjectId válido, tente buscar por outros meios
        // Isso pode ser personalizado conforme necessário
        console.warn(`ID de cliente ${clienteId} não é um ObjectId válido`);
        
        // Aqui você pode implementar uma lógica alternativa,
        // como buscar o cliente por outro campo primeiro
      }
      
      const vendasFiado = await Venda.find(query).sort({ dataVenda: -1 });
      
      console.log(`Encontradas ${vendasFiado.length} vendas fiado para cliente ${clienteId}`);
      
      return vendasFiado.map(venda => ({
        _id: venda._id.toString(),
        codigo: venda.codigo,
        dataVenda: venda.dataVenda,
        total: venda.total,
        valorPago: venda.pagamento.fiado.valorPago || 0,
        valorPendente: venda.total - (venda.pagamento.fiado.valorPago || 0),
        status: venda.pagamento.fiado.status,
        dataVencimento: venda.pagamento.fiado.dataVencimento
      }));
    } catch (error) {
      console.error(`Erro ao buscar vendas fiado para cliente ${clienteId}:`, error);
      return []; // Retornar array vazio em caso de erro para evitar quebrar o fluxo
    }
  }
  
  // Obter lista de vendedores ativos
  async getVendedores() {
    try {
      await dbConnection.ensureConnected();
      
      const vendedores = await dbConnection.User.find(
        { ativo: true },
        { nome: 1, email: 1, tipo: 1 }
      ).sort({ nome: 1 });
      
      return vendedores.map(v => ({
        id: v._id,
        nome: v.nome,
        email: v.email,
        tipo: v.tipo
      }));
    } catch (error) {
      console.error('Erro ao buscar vendedores:', error);
      return [];
    }
  }
}

module.exports = new VendasController();
