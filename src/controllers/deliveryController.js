const mongoose = require('mongoose');
const Cliente = require('../models/cliente');
const Entrega = require('../models/entrega');
const vendasController = require('./vendasController');
const produtosController = require('./produtosController');
const routeService = require('../services/routeService');
const dbConnection = require('../db/connection');

const DELIVERY_STATUSES = [
  'NOVO',
  'PREPARANDO',
  'PRONTO_PARA_ENTREGA',
  'SAIU_PARA_ENTREGA',
  'ENTREGUE',
  'CANCELADO'
];

const PAYMENT_METHODS = ['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'fiado'];

const NEXT_STATUSES = {
  NOVO: ['PREPARANDO', 'CANCELADO'],
  PREPARANDO: ['PRONTO_PARA_ENTREGA', 'CANCELADO'],
  PRONTO_PARA_ENTREGA: ['SAIU_PARA_ENTREGA', 'CANCELADO'],
  SAIU_PARA_ENTREGA: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADO: []
};

const plain = value => JSON.parse(JSON.stringify(value));
const cleanText = value => String(value || '').trim();

class DeliveryController {
  normalizeAddress(address = {}) {
    return {
      logradouro: cleanText(address.logradouro),
      numero: cleanText(address.numero),
      complemento: cleanText(address.complemento),
      bairro: cleanText(address.bairro),
      cidade: cleanText(address.cidade),
      estado: cleanText(address.estado).toUpperCase().slice(0, 2),
      cep: cleanText(address.cep).replace(/\D/g, ''),
      pontoReferencia: cleanText(address.pontoReferencia || address.referencia)
    };
  }

  validateAddress(address) {
    const missing = ['logradouro', 'numero', 'bairro', 'cidade', 'estado', 'cep'].filter(field => !address[field]);
    if (missing.length) throw new Error(`Preencha o endereço de entrega completo. Campos ausentes: ${missing.join(', ')}.`);
  }

  async calculateQuote(address) {
    const normalized = this.normalizeAddress(address);
    this.validateAddress(normalized);
    return routeService.quote(normalized);
  }

  async getClient(id) {
    await dbConnection.ensureConnected();
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('ID de cliente inválido.');
    const client = await Cliente.findOne({ _id: id, ativo: { $ne: false } }).lean();
    if (!client) throw new Error('Cliente não encontrado ou inativo.');
    return plain(client);
  }

  async buildSaleItems(rawItems) {
    if (!Array.isArray(rawItems) || rawItems.length === 0) throw new Error('Adicione ao menos um produto ao pedido.');

    const quantities = new Map();
    for (const item of rawItems) {
      const productId = cleanText(item.produto || item.produtoId);
      const quantity = Number.parseFloat(item.quantidade);
      if (!mongoose.Types.ObjectId.isValid(productId)) throw new Error('Um dos produtos informados é inválido.');
      if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('A quantidade dos produtos deve ser maior que zero.');
      quantities.set(productId, (quantities.get(productId) || 0) + quantity);
    }

    // Usa exatamente o mesmo catálogo filtrado das telas Produtos e Vendas.
    const catalog = await produtosController.getProdutos({});
    const requestedIds = new Set(quantities.keys());
    const products = catalog.filter(product => requestedIds.has(product._id) && product.ativo !== false);
    if (products.length !== quantities.size) throw new Error('Um ou mais produtos não existem, estão inativos ou não pertencem ao catálogo da farmácia.');

    return products.map(product => {
      const quantity = quantities.get(product._id.toString());
      if (product.estoque < quantity) {
        throw new Error(`Estoque insuficiente para "${product.nome}". Disponível: ${product.estoque}.`);
      }
      const unitPrice = Number(product.precoVenda ?? product.preco ?? 0);
      const subtotal = Math.round(quantity * unitPrice * 100) / 100;
      return {
        produto: product._id.toString(),
        codigoProduto: product.codigo || product.codigoBarras || product._id.toString(),
        nomeProduto: product.nome,
        quantidade: quantity,
        precoUnitario: unitPrice,
        subtotal,
        unidadeMedida: product.unidadeMedida || 'un'
      };
    });
  }

  async createOrder(data, currentUser) {
    try {
      await dbConnection.ensureConnected();
      const clientId = cleanText(data.cliente || data.clienteId);
      if (!mongoose.Types.ObjectId.isValid(clientId)) return { success: false, message: 'Selecione um cliente válido.' };
      const client = await Cliente.findOne({ _id: clientId, ativo: { $ne: false } }).lean();
      if (!client) return { success: false, message: 'Cliente não encontrado ou inativo.' };

      const address = this.normalizeAddress(data.endereco);
      this.validateAddress(address);
      const paymentMethod = cleanText(data.formaPagamento);
      if (!PAYMENT_METHODS.includes(paymentMethod)) return { success: false, message: 'Selecione uma forma de pagamento válida.' };

      const items = await this.buildSaleItems(data.itens);
      const subtotal = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
      const quote = await this.calculateQuote(address);
      const total = Math.round((subtotal + quote.deliveryFee) * 100) / 100;
      const changeFor = paymentMethod === 'dinheiro' && data.trocoPara ? Number.parseFloat(data.trocoPara) : null;
      if (changeFor !== null && (!Number.isFinite(changeFor) || changeFor < total)) {
        return { success: false, message: 'O valor de troco deve ser igual ou superior ao total do pedido.' };
      }

      const userId = cleanText(currentUser?._id || currentUser?.id);
      const saleData = {
        cliente: clientId,
        nomeCliente: client.nome,
        vendedor: mongoose.Types.ObjectId.isValid(userId) ? userId : null,
        nomeVendedor: currentUser?.nome || 'Usuário autenticado',
        itens: items,
        subtotal,
        desconto: 0,
        total,
        origem: 'DELIVERY',
        taxaEntrega: quote.deliveryFee,
        pagamento: {
          metodo: paymentMethod,
          parcelas: 1,
          valorRecebido: changeFor,
          troco: changeFor === null ? null : Math.round((changeFor - total) * 100) / 100
        },
        observacoes: cleanText(data.observacoes)
      };

      return await vendasController.registrarVenda(saleData, {
        antesCommit: async ({ venda, session }) => {
          const order = new Entrega({
            tipoEntrega: 'DELIVERY_ONLINE',
            venda: venda._id,
            cliente: client._id,
            nomeCliente: client.nome,
            telefone: cleanText(data.telefone || client.celular || client.telefone),
            endereco: address,
            dataAgendamento: new Date(),
            periodoEntrega: 'comercial',
            itens: items.map(item => ({
              produto: item.produto,
              codigoProduto: item.codigoProduto,
              nomeProduto: item.nomeProduto,
              quantidade: item.quantidade,
              valorUnitario: item.precoUnitario,
              subtotal: item.subtotal
            })),
            status: 'NOVO',
            valorFrete: quote.deliveryFee,
            distanciaKm: quote.distanceKm,
            subtotal,
            total,
            formaPagamento: paymentMethod,
            trocoPara: changeFor,
            motoboy: cleanText(data.motoboy),
            observacoes: cleanText(data.observacoes)
          });
          order.usuario = mongoose.Types.ObjectId.isValid(userId) ? userId : null;
          await order.save({ session });
          return { pedido: { _id: order._id.toString(), codigo: order.codigo, status: order.status } };
        }
      });
    } catch (error) {
      console.error('Erro ao criar pedido delivery:', error);
      return { success: false, message: error.message || 'Não foi possível criar o pedido delivery.' };
    }
  }

  async listOrders(filters = {}) {
    await dbConnection.ensureConnected();
    const query = { tipoEntrega: 'DELIVERY_ONLINE' };
    if (cleanText(filters.numero)) query.codigo = { $regex: cleanText(filters.numero), $options: 'i' };
    if (cleanText(filters.status) && DELIVERY_STATUSES.includes(filters.status)) query.status = filters.status;
    if (cleanText(filters.motoboy)) query.motoboy = { $regex: cleanText(filters.motoboy), $options: 'i' };
    if (cleanText(filters.cliente)) {
      const clients = await Cliente.find({ nome: { $regex: cleanText(filters.cliente), $options: 'i' } }).select('_id').lean();
      query.cliente = { $in: clients.map(client => client._id) };
    }
    if (filters.data) {
      const start = new Date(`${filters.data}T00:00:00`);
      const end = new Date(`${filters.data}T23:59:59.999`);
      if (!Number.isNaN(start.getTime())) query.criadoEm = { $gte: start, $lte: end };
    }
    const orders = await Entrega.find(query)
      .populate('cliente', 'nome telefone celular cpfCnpj')
      .populate('venda', 'codigo dataVenda total status origem')
      .sort({ criadoEm: -1 })
      .limit(500)
      .lean();
    return plain(orders);
  }

  async getOrder(id) {
    await dbConnection.ensureConnected();
    if (!mongoose.Types.ObjectId.isValid(id)) throw new Error('ID de pedido inválido.');
    const order = await Entrega.findOne({ _id: id, tipoEntrega: 'DELIVERY_ONLINE' })
      .populate('cliente')
      .populate('venda')
      .populate('itens.produto', 'nome codigo codigoBarras precoVenda estoque')
      .lean();
    if (!order) throw new Error('Pedido não encontrado.');
    return plain(order);
  }

  async updateStatus(id, status, currentUser, motoboy = '') {
    try {
      await dbConnection.ensureConnected();
      if (!mongoose.Types.ObjectId.isValid(id)) return { success: false, message: 'ID de pedido inválido.' };
      if (!DELIVERY_STATUSES.includes(status)) return { success: false, message: 'Status inválido.' };
      const order = await Entrega.findOne({ _id: id, tipoEntrega: 'DELIVERY_ONLINE' });
      if (!order) return { success: false, message: 'Pedido não encontrado.' };
      if (!(NEXT_STATUSES[order.status] || []).includes(status)) {
        return { success: false, message: `Não é possível alterar de ${order.status} para ${status}.` };
      }

      const userId = cleanText(currentUser?._id || currentUser?.id);
      if (status === 'CANCELADO') {
        if (!order.venda) return { success: false, message: 'O pedido não possui venda vinculada.' };
        return vendasController.cancelarVenda(order.venda.toString(), {
          permitirDelivery: true,
          reverterFiado: true,
          antesCommit: async ({ session }) => {
            order.atualizarStatus('CANCELADO', mongoose.Types.ObjectId.isValid(userId) ? userId : null, 'Cancelado pela tela de Delivery');
            if (motoboy !== undefined) order.motoboy = cleanText(motoboy);
            await order.save({ session });
          }
        });
      }

      order.atualizarStatus(status, mongoose.Types.ObjectId.isValid(userId) ? userId : null, 'Status atualizado pela tela de Delivery');
      if (motoboy !== undefined) order.motoboy = cleanText(motoboy);
      await order.save();
      return { success: true, pedido: { _id: order._id.toString(), status: order.status, motoboy: order.motoboy } };
    } catch (error) {
      console.error('Erro ao atualizar pedido delivery:', error);
      return { success: false, message: error.message || 'Não foi possível atualizar o pedido.' };
    }
  }
}

module.exports = new DeliveryController();
module.exports.DELIVERY_STATUSES = DELIVERY_STATUSES;
