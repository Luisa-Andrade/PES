const Venda = require('../models/venda');
const User = require('../models/user');
const dbConnection = require('../db/connection');

class HistoricoController {
  constructor() {
    // Garantir conexão com o banco
    dbConnection.ensureConnected();
  }
  
  // Buscar vendas com filtros e paginação
  async buscarVendas(filtros = {}) {
    try {
      await dbConnection.ensureConnected();
      
      // Construir query
      let query = {};
      
      // Filtro por data
      if (filtros.dataInicio || filtros.dataFim) {
        query.dataVenda = {};
        
        if (filtros.dataInicio) {
          const dataInicio = new Date(filtros.dataInicio);
          dataInicio.setHours(0, 0, 0, 0);
          query.dataVenda.$gte = dataInicio;
        }
        
        if (filtros.dataFim) {
          const dataFim = new Date(filtros.dataFim);
          dataFim.setHours(23, 59, 59, 999);
          query.dataVenda.$lte = dataFim;
        }
      }
      
      // Filtro por cliente
      if (filtros.cliente) {
        query['cliente.nome'] = { $regex: filtros.cliente, $options: 'i' };
      }
      
      // Filtro por vendedor
      if (filtros.vendedor) {
        query.vendedor = filtros.vendedor;
      }
      
      // Filtro por forma de pagamento
      if (filtros.formaPagamento) {
        query['pagamento.metodo'] = filtros.formaPagamento;
      }
      
      // Paginação
      const pagina = parseInt(filtros.pagina) || 1;
      const itensPorPagina = parseInt(filtros.itensPorPagina) || 20;
      const skip = (pagina - 1) * itensPorPagina;
      
      // Contar total de registros
      const total = await Venda.countDocuments(query);
      
      // Buscar vendas com paginação
      const vendas = await Venda.find(query)
        .sort({ dataVenda: -1 })
        .skip(skip)
        .limit(itensPorPagina);
      
      return {
        vendas,
        total,
        pagina,
        itensPorPagina,
        totalPaginas: Math.ceil(total / itensPorPagina)
      };
    } catch (error) {
      console.error('Erro ao buscar vendas:', error);
      throw error;
    }
  }
  
  // Buscar detalhes de uma venda específica
  async buscarVendaPorId(id) {
    try {
      await dbConnection.ensureConnected();
      return await Venda.findById(id);
    } catch (error) {
      console.error(`Erro ao buscar venda ID ${id}:`, error);
      throw error;
    }
  }
  
  // Buscar vendedores para filtro
  async getVendedores() {
    try {
      await dbConnection.ensureConnected();
      
      // Buscar vendedores distintos que fizeram vendas
      const vendedores = await Venda.distinct('vendedor');
      
      // Buscar informações de cada vendedor
      const vendedoresInfo = await User.find(
        { _id: { $in: vendedores } },
        { nome: 1 }
      );
      
      return vendedoresInfo.map(v => ({
        id: v._id,
        nome: v.nome
      }));
    } catch (error) {
      console.error('Erro ao buscar vendedores:', error);
      throw error;
    }
  }
  
  // Buscar cliente para filtro
  async getClientes() {
    try {
      await dbConnection.ensureConnected();
      
      // Buscar clientes distintos das vendas
      const clientes = await Venda.distinct('cliente.nome');
      
      return clientes.filter(cliente => cliente && cliente.trim());
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      throw error;
    }
  }
}

module.exports = new HistoricoController();
