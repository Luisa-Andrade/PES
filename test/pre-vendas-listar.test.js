const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dbConnection = require('../src/db/connection');
const PreVenda = require('../src/models/preVenda');
const initialEnsureConnected = dbConnection.ensureConnected;
dbConnection.ensureConnected = async () => {};
const preVendasController = require('../src/controllers/preVendasController');
dbConnection.ensureConnected = initialEnsureConnected;

test('lista pré-vendas antigas mesmo com criador ou produto ausente', async () => {
  const originalEnsureConnected = dbConnection.ensureConnected;
  const originalFind = PreVenda.find;
  const id = new mongoose.Types.ObjectId();
  dbConnection.ensureConnected = async () => {};
  PreVenda.find = () => ({
    sort: () => ({
      limit: async () => [{
        _id: id, codigo: 'PV-ANTIGA', __v: 0, status: 'aberta',
        itens: [{ nomeProduto: 'Item antigo', quantidade: 1, precoUnitario: 10 }]
      }]
    })
  });
  try {
    const list = await preVendasController.listar();
    assert.equal(list.length, 1);
    assert.equal(list[0].codigo, 'PV-ANTIGA');
    assert.equal(list[0].criadoPor, null);
    assert.equal(list[0].itens[0].produto, null);
  } finally {
    dbConnection.ensureConnected = originalEnsureConnected;
    PreVenda.find = originalFind;
  }
});
