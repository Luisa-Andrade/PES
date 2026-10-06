const mongoose = require('mongoose');
const Cliente = require('../models/cliente');
const Entrega = require('../models/entrega');
const PreVenda = require('../models/preVenda');
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
    const receitasConfirmadas = new Map();
    for (const item of rawItems) {
      const productId = cleanText(item.produto || item.produtoId);
      const quantity = Number(item.quantidade);
      if (!mongoose.Types.ObjectId.isValid(productId)) throw new Error('Um dos produtos informados é inválido.');
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('A quantidade dos produtos deve ser um número inteiro maior que zero.');
      quantities.set(productId, (quantities.get(productId) || 0) + quantity);
      receitasConfirmadas.set(productId, (receitasConfirmadas.get(productId) ?? true) && item.receitaApresentada === true);
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
      if (product.exigeReceita && !receitasConfirmadas.get(product._id.toString())) {
        throw new Error(`Confirme que há receita para "${product.nome}" antes de finalizar.`);
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
        unidadeMedida: product.unidadeMedida || 'un',
        exigeReceita: Boolean(product.exigeReceita),
        receitaApresentada: product.exigeReceita ? true : null
      };
    });
  }

  async buildPreSaleItems(preSale, quantidadesDesejadas = null) {
    if (!preSale.itens.length) throw new Error('A pré-venda selecionada não tem produtos.');
    const catalog = await produtosController.getProdutos({});
    const byId = new Map(catalog.filter(product => product.ativo !== false).map(product => [String(product._id), product]));
    return preSale.itens.filter(item => quantidadesDesejadas === null || quantidadesDesejadas.has(String(item.produto))).map(item => {
      const product = byId.get(String(item.produto));
      if (!product) throw new Error(`O produto ${item.nomeProduto} não está mais disponível.`);
      if (product.exigeReceita && item.receitaApresentada !== true) {
        throw new Error(`Confirme que há receita para ${product.nome} na pré-venda antes de finalizar.`);
      }
      const quantity = quantidadesDesejadas?.get(String(item.produto)) ?? Number(item.quantidade);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error(`A quantidade de ${product.nome} na pré-venda deve ser um número inteiro maior que zero.`);
      const reserved = preSale.estoqueReservado ? Number(item.quantidade) : 0;
      const additional = quantity - reserved;
      if (additional > product.estoque) {
        throw new Error(`Estoque insuficiente para ${product.nome}. Disponível para acrescentar: ${product.estoque}.`);
      }
      const price = Number(item.precoUnitario);
      if (!Number.isFinite(price) || price < 0) throw new Error(`Preço inválido para ${product.nome} na pré-venda.`);
      return {
        produto: String(product._id),
        codigoProduto: product.codigo || product.codigoBarras || String(product._id),
        nomeProduto: product.nome,
        quantidade: quantity,
        precoUnitario: price,
        subtotal: Math.round(quantity * price * 100) / 100,
        unidadeMedida: product.unidadeMedida || 'un',
        exigeReceita: Boolean(product.exigeReceita),
        receitaApresentada: item.receitaApresentada === true
      };
    });
  }

  async createOrder(data, currentUser) {
    try {
      await dbConnection.ensureConnected();
      const clientId = cleanText(data.cliente || data.clienteId);
      if (!mongoose.Types.ObjectId.isValid(clientId)) return { success: false, message: 'Selecione um cliente válido.' };
      let preSale = null;
      if (cleanText(data.preVendaCodigo)) {
        const code = cleanText(data.preVendaCodigo).toUpperCase();
        if (!/^[A-Z0-9-]{1,32}$/.test(code)) return { success: false, message: 'Código de pré-venda inválido.' };
        preSale = await PreVenda.findOne({ codigo: code, status: 'aberta' });
        if (!preSale) return { success: false, message: 'Pré-venda aberta não encontrada. Atualize a lista.' };
        const version = Number(data.preVendaVersao);
        if (data.preVendaVersao === undefined || data.preVendaVersao === null || data.preVendaVersao === '' ||
            !Number.isInteger(version) || version !== preSale.__v) {
          return { success: false, message: 'Esta pré-venda foi alterada. Recarregue antes de confirmar.' };
        }
        if (preSale.cliente && String(preSale.cliente) !== clientId) {
          return { success: false, message: 'Use o cliente vinculado à pré-venda para esta entrega.' };
        }
      }
      const client = await Cliente.findOne({ _id: clientId, ativo: { $ne: false } }).lean();
      if (!client) return { success: false, message: 'Cliente não encontrado ou inativo.' };

      const address = this.normalizeAddress(data.endereco);
      this.validateAddress(address);
      const paymentMethod = cleanText(data.formaPagamento);
      if (!PAYMENT_METHODS.includes(paymentMethod)) return { success: false, message: 'Selecione uma forma de pagamento válida.' };

      let items;
      let quantidadesReservadas;
      let quantidadesPreVenda;
      if (preSale) {
        const itensAdicionais = data.itensAdicionais ?? [];
        if (!Array.isArray(itensAdicionais)) throw new Error('Os produtos adicionais são inválidos.');
        if (data.itensPreVenda !== undefined) {
          if (!Array.isArray(data.itensPreVenda) || data.itensPreVenda.length > preSale.itens.length) {
            throw new Error('Os itens da pré-venda foram alterados. Recarregue antes de confirmar.');
          }
          const produtosOriginais = new Set(preSale.itens.map(item => String(item.produto)));
          quantidadesPreVenda = new Map();
          for (const item of data.itensPreVenda) {
            const id = cleanText(item?.produto);
            const quantidade = Number(item?.quantidade);
            if (!mongoose.Types.ObjectId.isValid(id) || !produtosOriginais.has(id) || quantidadesPreVenda.has(id) ||
                !Number.isSafeInteger(quantidade) || quantidade < 1) {
              throw new Error('Informe quantidades inteiras e válidas para os produtos da pré-venda.');
            }
            quantidadesPreVenda.set(id, quantidade);
          }
        }
        const itensPreVenda = await this.buildPreSaleItems(preSale, quantidadesPreVenda);
        const extras = itensAdicionais.length ? await this.buildSaleItems(itensAdicionais) : [];
        items = [...itensPreVenda, ...extras];
        if (preSale.estoqueReservado) {
          quantidadesReservadas = new Map();
          for (const item of preSale.itens) {
            const id = String(item.produto);
            quantidadesReservadas.set(id, (quantidadesReservadas.get(id) || 0) + Number(item.quantidade));
          }
        }
      } else {
        items = await this.buildSaleItems(data.itens);
      }
      if (!items.length) throw new Error('Adicione ao menos um produto ao pedido.');
      const subtotal = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
      const quote = await this.calculateQuote(address);
      const total = Math.round((subtotal + quote.deliveryFee) * 100) / 100;
      const changeFor = paymentMethod === 'dinheiro' && data.trocoPara ? Number.parseFloat(data.trocoPara) : null;
      if (changeFor !== null && (!Number.isFinite(changeFor) || changeFor < total)) {
        return { success: false, message: 'O valor de troco deve ser igual ou superior ao total do pedido.' };
      }

      const userId = cleanText(currentUser?._id || currentUser?.id);
      const creatorId = preSale?.criadoPor && mongoose.Types.ObjectId.isValid(String(preSale.criadoPor))
        ? String(preSale.criadoPor) : null;
      const creator = creatorId ? await dbConnection.User.findById(creatorId).select('nome') : null;
      const saleData = {
        cliente: clientId,
        nomeCliente: client.nome,
        vendedor: creatorId || (mongoose.Types.ObjectId.isValid(userId) ? userId : null),
        nomeVendedor: creator?.nome || currentUser?.nome || 'Usuário autenticado',
        operadorCaixa: mongoose.Types.ObjectId.isValid(userId) ? userId : null,
        preVendaCodigo: preSale?.codigo,
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
        estoqueReservado: preSale?.estoqueReservado === true,
        quantidadesReservadas,
        antesCommit: async ({ venda, session }) => {
          if (preSale) {
            const updated = await PreVenda.findOneAndUpdate(
              { _id: preSale._id, status: 'aberta', __v: preSale.__v },
              {
                $set: {
                  status: 'finalizada', venda: venda._id, finalizadaPor: userId, finalizadaEm: new Date(),
                  cliente: client._id, nomeCliente: client.nome,
                  itens: preSale.itens.filter(item => !quantidadesPreVenda || quantidadesPreVenda.has(String(item.produto))).map(item => ({
                    ...(typeof item.toObject === 'function' ? item.toObject() : item),
                    quantidade: quantidadesPreVenda?.get(String(item.produto)) ?? Number(item.quantidade)
                  }))
                },
                $inc: { __v: 1 }
              },
              { session, new: true }
            );
            if (!updated) throw new Error('Esta pré-venda foi alterada ou finalizada. Recarregue antes de confirmar.');
          }
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
          return { pedido: { _id: order._id.toString(), codigo: order.codigo, status: order.status }, preVendaCodigo: preSale?.codigo };
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
    const literalSearch = value => ({ $regex: cleanText(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' });
    const number = cleanText(filters.numero).replace(/^#\s*/, '');
    if (number) query.codigo = literalSearch(number);
    const status = cleanText(filters.status);
    if (status) {
      if (!DELIVERY_STATUSES.includes(status)) throw new Error('Status de filtro inválido.');
      query.status = status;
    }
    if (cleanText(filters.motoboy)) query.motoboy = literalSearch(filters.motoboy);
    if (cleanText(filters.cliente)) {
      const nameSearch = literalSearch(filters.cliente);
      const clients = await Cliente.find({ nome: nameSearch }).select('_id').lean();
      query.$or = [{ nomeCliente: nameSearch }, { cliente: { $in: clients.map(client => client._id) } }];
    }
    if (filters.data) {
      const dateText = cleanText(filters.data);
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
      if (!match) throw new Error('Data de filtro inválida.');
      const year = Number(match[1]);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const start = new Date(year, month - 1, day);
      if (start.getFullYear() !== year || start.getMonth() !== month - 1 || start.getDate() !== day) {
        throw new Error('Data de filtro inválida.');
      }
      const end = new Date(year, month - 1, day + 1);
      query.criadoEm = { $gte: start, $lt: end };
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
