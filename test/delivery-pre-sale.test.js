const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dbConnection = require('../src/db/connection');

// Os controllers tentam conectar no construtor; este teste exercita a transação com dependências locais.
const originalEnsureConnected = dbConnection.ensureConnected;
dbConnection.ensureConnected = async () => {};
const deliveryController = require('../src/controllers/deliveryController');
dbConnection.ensureConnected = originalEnsureConnected;

const Cliente = require('../src/models/cliente');
const PreVenda = require('../src/models/preVenda');
const Entrega = require('../src/models/entrega');
const produtosController = require('../src/controllers/produtosController');
const vendasController = require('../src/controllers/vendasController');
const routeService = require('../src/services/routeService');

test('entrega usa itens e estoque reservados da pré-venda e a finaliza na mesma transação', async () => {
  const clientId = new mongoose.Types.ObjectId();
  const productId = new mongoose.Types.ObjectId();
  const removedProductId = new mongoose.Types.ObjectId();
  const creatorId = new mongoose.Types.ObjectId();
  const cashierId = new mongoose.Types.ObjectId();
  const preSaleId = new mongoose.Types.ObjectId();
  const saleId = new mongoose.Types.ObjectId();
  const preSale = {
    _id: preSaleId, codigo: 'PV-42', __v: 3, status: 'aberta', cliente: clientId,
    criadoPor: creatorId, estoqueReservado: true,
    itens: [{ produto: productId, nomeProduto: 'Produto teste', quantidade: 2, precoUnitario: 12.5 }]
  };
  const originals = {
    ensureConnected: dbConnection.ensureConnected,
    findClient: Cliente.findOne,
    findPreSale: PreVenda.findOne,
    updatePreSale: PreVenda.findOneAndUpdate,
    findUser: dbConnection.User.findById,
    getProducts: produtosController.getProdutos,
    quote: routeService.quote,
    registerSale: vendasController.registrarVenda,
    saveOrder: Entrega.prototype.save
  };
  let updateCount = 0;
  let saleCount = 0;
  let availableStock = 0;
  dbConnection.ensureConnected = async () => {};
  Cliente.findOne = () => ({ lean: async () => ({ _id: clientId, nome: 'Cliente teste' }) });
  PreVenda.findOne = async () => preSale;
  PreVenda.findOneAndUpdate = async (filter, update, options) => {
    updateCount += 1;
    assert.equal(filter.__v, preSale.__v);
    assert.equal(update.$set.status, 'finalizada');
    assert.equal(String(update.$set.venda), String(saleId));
    assert.equal(String(update.$set.cliente), String(clientId));
    assert.equal(update.$set.nomeCliente, 'Cliente teste');
    assert.equal(update.$set.itens[0].quantidade, preSale.__v === 7 ? 4 : preSale.__v === 8 ? 1 : 2);
    if (preSale.__v === 9) {
      assert.equal(update.$set.itens.length, 1);
      assert.equal(String(update.$set.itens[0].produto), String(productId));
    }
    assert.ok(options.session);
    return { ...preSale, status: 'finalizada' };
  };
  dbConnection.User.findById = () => ({ select: async () => ({ nome: 'Vendedor teste' }) });
  produtosController.getProdutos = async () => [{
    _id: productId.toString(), nome: 'Produto teste', codigo: 'P42', estoque: availableStock,
    precoVenda: 99, unidadeMedida: 'un', exigeReceita: false, ativo: true
  }, {
    _id: removedProductId.toString(), nome: 'Produto removido', codigo: 'P43', estoque: 0,
    precoVenda: 25, unidadeMedida: 'un', exigeReceita: false, ativo: true
  }];
  routeService.quote = async () => ({ distanceKm: 1, deliveryFee: 7 });
  Entrega.prototype.save = async function () { this.codigo = 'ENT-42'; return this; };
  vendasController.registrarVenda = async (saleData, options) => {
    saleCount += 1;
    assert.equal(options.estoqueReservado, true);
    assert.equal(options.quantidadesReservadas.get(productId.toString()), 2);
    if (saleCount === 7) {
      assert.equal(options.quantidadesReservadas.get(removedProductId.toString()), 1);
      assert.equal(saleData.itens.length, 1);
      assert.ok(saleData.itens.every(item => String(item.produto) !== String(removedProductId)));
    }
    assert.equal(saleData.preVendaCodigo, 'PV-42');
    assert.equal(saleData.vendedor, preSale.criadoPor ? String(preSale.criadoPor) : String(cashierId));
    assert.equal(saleData.itens[0].precoUnitario, 12.5);
    assert.equal(saleData.subtotal, saleData.itens.reduce((sum, item) => sum + item.subtotal, 0));
    assert.equal(saleData.total, saleData.subtotal + 7);
    if (saleCount === 4) {
      assert.equal(saleData.itens[1].quantidade, 1);
      assert.equal(saleData.itens[1].precoUnitario, 99);
      assert.equal(saleData.subtotal, 124);
      assert.equal(saleData.total, 131);
    } else if (saleCount === 5) assert.equal(saleData.itens[0].quantidade, 4);
    else if (saleCount === 6) assert.equal(saleData.itens[0].quantidade, 1);
    else assert.equal(saleData.itens[0].quantidade, 2);
    const related = await options.antesCommit({ venda: { _id: saleId }, session: {} });
    return { success: true, venda: { codigo: 'VEN-42' }, ...related };
  };

  const data = {
    cliente: clientId.toString(), preVendaCodigo: 'PV-42', preVendaVersao: '3',
    endereco: { logradouro: 'Rua Teste', numero: '1', bairro: 'Centro', cidade: 'Cidade', estado: 'RJ', cep: '28610000' },
    formaPagamento: 'pix', itens: [{ produto: productId.toString(), quantidade: 99 }]
  };
  try {
    const stale = await deliveryController.createOrder({ ...data, preVendaVersao: '2' }, { id: cashierId.toString(), nome: 'Caixa' });
    assert.equal(stale.success, false);
    assert.match(stale.message, /alterada/);
    assert.equal(saleCount, 0);

    const result = await deliveryController.createOrder(data, { id: cashierId.toString(), nome: 'Caixa' });
    assert.equal(result.success, true);
    assert.equal(result.pedido.codigo, 'ENT-42');
    assert.equal(result.preVendaCodigo, 'PV-42');
    assert.equal(saleCount, 1);
    assert.equal(updateCount, 1);

    preSale.cliente = null;
    preSale.__v = 4;
    const withoutClient = await deliveryController.createOrder({ ...data, preVendaVersao: '4' }, { id: cashierId.toString(), nome: 'Caixa' });
    assert.equal(withoutClient.success, true);
    assert.equal(saleCount, 2);
    assert.equal(updateCount, 2);

    preSale.criadoPor = undefined;
    preSale.__v = 5;
    const withoutCreator = await deliveryController.createOrder({ ...data, preVendaVersao: '5' }, { id: cashierId.toString(), nome: 'Caixa' });
    assert.equal(withoutCreator.success, true);
    assert.equal(saleCount, 3);
    assert.equal(updateCount, 3);

    availableStock = 5;
    preSale.__v = 6;
    const withExtra = await deliveryController.createOrder({
      ...data, preVendaVersao: '6',
      itensAdicionais: [{ produto: productId.toString(), quantidade: 1 }]
    }, { id: cashierId.toString(), nome: 'Caixa' });
    assert.equal(withExtra.success, true);
    assert.equal(saleCount, 4);
    assert.equal(updateCount, 4);

    preSale.__v = 7;
    const invalidAdjustment = await deliveryController.createOrder({
      ...data, preVendaVersao: '7',
      itensPreVenda: [{ produto: productId.toString(), quantidade: 1.5 }]
    }, { id: cashierId.toString(), nome: 'Caixa' });
    assert.equal(invalidAdjustment.success, false);
    assert.equal(saleCount, 4);
    const withIncrease = await deliveryController.createOrder({
      ...data, preVendaVersao: '7',
      itensPreVenda: [{ produto: productId.toString(), quantidade: 4 }]
    }, { id: cashierId.toString(), nome: 'Caixa' });
    assert.equal(withIncrease.success, true);
    assert.equal(saleCount, 5);
    assert.equal(updateCount, 5);

    availableStock = 0;
    preSale.__v = 8;
    const withDecrease = await deliveryController.createOrder({
      ...data, preVendaVersao: '8',
      itensPreVenda: [{ produto: productId.toString(), quantidade: 1 }]
    }, { id: cashierId.toString(), nome: 'Caixa' });
    assert.equal(withDecrease.success, true);
    assert.equal(saleCount, 6);
    assert.equal(updateCount, 6);

    preSale.__v = 9;
    preSale.itens.push({ produto: removedProductId, nomeProduto: 'Produto removido', quantidade: 1, precoUnitario: 25 });
    const withRemovedItem = await deliveryController.createOrder({
      ...data, preVendaVersao: '9',
      itensPreVenda: [{ produto: productId.toString(), quantidade: 2 }]
    }, { id: cashierId.toString(), nome: 'Caixa' });
    assert.equal(withRemovedItem.success, true);
    assert.equal(saleCount, 7);
    assert.equal(updateCount, 7);

    preSale.__v = 10;
    const withoutItems = await deliveryController.createOrder({
      ...data, preVendaVersao: '10', itensPreVenda: []
    }, { id: cashierId.toString(), nome: 'Caixa' });
    assert.equal(withoutItems.success, false);
    assert.match(withoutItems.message, /Adicione ao menos um produto/);
    assert.equal(saleCount, 7);
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    Cliente.findOne = originals.findClient;
    PreVenda.findOne = originals.findPreSale;
    PreVenda.findOneAndUpdate = originals.updatePreSale;
    dbConnection.User.findById = originals.findUser;
    produtosController.getProdutos = originals.getProducts;
    routeService.quote = originals.quote;
    vendasController.registrarVenda = originals.registerSale;
    Entrega.prototype.save = originals.saveOrder;
  }
});

test('entrega aceita somente quantidades inteiras de produtos', async () => {
  const productId = new mongoose.Types.ObjectId();
  const originalGetProducts = produtosController.getProdutos;
  let requiresPrescription = false;
  produtosController.getProdutos = async () => [{
    _id: productId.toString(), nome: 'Produto teste', codigo: 'P1',
    estoque: 10, precoVenda: 5, ativo: true, exigeReceita: requiresPrescription
  }];
  try {
    for (const quantidade of [1.5, '1,5', 0, -1]) {
      await assert.rejects(
        deliveryController.buildSaleItems([{ produto: productId.toString(), quantidade }]),
        /número inteiro maior que zero/
      );
    }
    const items = await deliveryController.buildSaleItems([{ produto: productId.toString(), quantidade: 2 }]);
    assert.equal(items[0].quantidade, 2);
    requiresPrescription = true;
    const withPrescription = await deliveryController.buildSaleItems([{
      produto: productId.toString(), quantidade: 1, receitaApresentada: true
    }]);
    assert.equal(withPrescription[0].exigeReceita, true);
    assert.equal(withPrescription[0].receitaApresentada, true);
    await assert.rejects(
      deliveryController.buildSaleItems([{ produto: productId.toString(), quantidade: 1 }]),
      /Confirme que há receita/
    );
    requiresPrescription = false;
    await assert.rejects(
      deliveryController.buildPreSaleItems({ itens: [{ produto: productId, nomeProduto: 'Produto teste', quantidade: 1.5, precoUnitario: 5 }], estoqueReservado: true }),
      /número inteiro maior que zero/
    );
  } finally {
    produtosController.getProdutos = originalGetProducts;
  }
});
