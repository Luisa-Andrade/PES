const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dbConnection = require('../src/db/connection');

const initialEnsureConnected = dbConnection.ensureConnected;
dbConnection.ensureConnected = async () => {};
const vendasController = require('../src/controllers/vendasController');
dbConnection.ensureConnected = initialEnsureConnected;

const Produto = require('../src/models/produto');
const Venda = require('../src/models/venda');

test('venda com pré-venda reservada baixa somente o produto adicional na transação', async () => {
  const id = new mongoose.Types.ObjectId();
  const otherId = new mongoose.Types.ObjectId();
  const originals = {
    ensureConnected: dbConnection.ensureConnected,
    findById: Produto.findById,
    findOneAndUpdate: Produto.findOneAndUpdate,
    updateOne: Produto.updateOne,
    startSession: mongoose.startSession,
    saveSale: Venda.prototype.save
  };
  let debits = 0;
  let releases = 0;
  let committed = false;
  let availableStock = 1;
  let expectedDebitId = id;
  let expectedReleaseQuantity = 1;
  dbConnection.ensureConnected = async () => {};
  Produto.findById = () => ({ select: async () => ({ nome: 'Produto teste', estoque: availableStock, ativo: true, exigeReceita: false }) });
  Produto.findOneAndUpdate = async (filter, update, options) => {
    debits += 1;
    assert.equal(String(filter._id), String(expectedDebitId));
    assert.equal(filter.estoque.$gte, 1);
    assert.equal(update.$inc.estoque, -1);
    assert.ok(options.session);
    return { _id: id };
  };
  Produto.updateOne = async (filter, update, options) => {
    releases += 1;
    assert.equal(String(filter._id), String(id));
    assert.equal(update.$inc.estoque, expectedReleaseQuantity);
    assert.ok(options.session);
    return { matchedCount: 1 };
  };
  mongoose.startSession = async () => ({
    startTransaction() {},
    async commitTransaction() { committed = true; },
    async abortTransaction() {},
    endSession() {}
  });
  Venda.prototype.save = async function () { this.codigo = 'VEN-TESTE'; return this; };

  try {
    const result = await vendasController.registrarVenda({
      itens: [
        { produto: id, codigoProduto: 'P1', nomeProduto: 'Produto teste', quantidade: 2, precoUnitario: 5, subtotal: 10 },
        { produto: id, codigoProduto: 'P1', nomeProduto: 'Produto teste', quantidade: 1, precoUnitario: 5, subtotal: 5 }
      ],
      subtotal: 15, total: 15, pagamento: { metodo: 'pix' }
    }, {
      estoqueReservado: true,
      quantidadesReservadas: new Map([[String(id), 2]])
    });
    assert.equal(result.success, true);
    assert.equal(debits, 1);
    assert.equal(committed, true);

    availableStock = 0;
    const reduced = await vendasController.registrarVenda({
      itens: [{ produto: id, codigoProduto: 'P1', nomeProduto: 'Produto teste', quantidade: 1, precoUnitario: 5, subtotal: 5 }],
      subtotal: 5, total: 5, pagamento: { metodo: 'pix' }
    }, {
      estoqueReservado: true,
      quantidadesReservadas: new Map([[String(id), 2]])
    });
    assert.equal(reduced.success, true);
    assert.equal(debits, 1);
    assert.equal(releases, 1);

    expectedDebitId = otherId;
    expectedReleaseQuantity = 2;
    availableStock = 1;
    const removedReserved = await vendasController.registrarVenda({
      itens: [{ produto: otherId, codigoProduto: 'P2', nomeProduto: 'Outro produto', quantidade: 1, precoUnitario: 8, subtotal: 8 }],
      subtotal: 8, total: 8, pagamento: { metodo: 'pix' }
    }, {
      estoqueReservado: true,
      quantidadesReservadas: new Map([[String(id), 2]])
    });
    assert.equal(removedReserved.success, true);
    assert.equal(debits, 2);
    assert.equal(releases, 2);
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    Produto.findById = originals.findById;
    Produto.findOneAndUpdate = originals.findOneAndUpdate;
    Produto.updateOne = originals.updateOne;
    mongoose.startSession = originals.startSession;
    Venda.prototype.save = originals.saveSale;
  }
});
