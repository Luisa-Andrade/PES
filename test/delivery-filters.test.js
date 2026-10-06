const test = require('node:test');
const assert = require('node:assert/strict');
const dbConnection = require('../src/db/connection');

const originalEnsureConnected = dbConnection.ensureConnected;
dbConnection.ensureConnected = async () => {};
const deliveryController = require('../src/controllers/deliveryController');
dbConnection.ensureConnected = originalEnsureConnected;

const Cliente = require('../src/models/cliente');
const Entrega = require('../src/models/entrega');

test('filtros de pedidos combinam número, cliente, data, status e motoboy', async () => {
  const originals = {
    ensureConnected: dbConnection.ensureConnected,
    findClient: Cliente.find,
    findOrder: Entrega.find
  };
  const clientId = 'cliente-1';
  let clientQuery;
  let orderQuery;
  dbConnection.ensureConnected = async () => {};
  Cliente.find = query => {
    clientQuery = query;
    return { select: () => ({ lean: async () => [{ _id: clientId }] }) };
  };
  Entrega.find = query => {
    orderQuery = query;
    const chain = {
      populate: () => chain,
      sort: () => chain,
      limit: () => chain,
      lean: async () => []
    };
    return chain;
  };

  try {
    await deliveryController.listOrders({
      numero: ' #ENT.100 ', cliente: ' Ana (Silva) ', data: '2026-10-01',
      status: 'ENTREGUE', motoboy: 'Rafa.+'
    });
    assert.equal(orderQuery.tipoEntrega, 'DELIVERY_ONLINE');
    assert.deepEqual(orderQuery.codigo, { $regex: 'ENT\\.100', $options: 'i' });
    assert.deepEqual(orderQuery.motoboy, { $regex: 'Rafa\\.\\+', $options: 'i' });
    assert.equal(orderQuery.status, 'ENTREGUE');
    assert.deepEqual(clientQuery, { nome: { $regex: 'Ana \\(Silva\\)', $options: 'i' } });
    assert.deepEqual(orderQuery.$or, [
      { nomeCliente: clientQuery.nome },
      { cliente: { $in: [clientId] } }
    ]);
    assert.equal(orderQuery.criadoEm.$gte.getFullYear(), 2026);
    assert.equal(orderQuery.criadoEm.$gte.getMonth(), 9);
    assert.equal(orderQuery.criadoEm.$gte.getDate(), 1);
    assert.equal(orderQuery.criadoEm.$gte.getHours(), 0);
    assert.equal(orderQuery.criadoEm.$lt.getDate(), 2);

    await deliveryController.listOrders({});
    assert.deepEqual(orderQuery, { tipoEntrega: 'DELIVERY_ONLINE' });
    await assert.rejects(deliveryController.listOrders({ status: 'DESCONHECIDO' }), /Status de filtro inválido/);
    await assert.rejects(deliveryController.listOrders({ data: '2026-02-30' }), /Data de filtro inválida/);
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    Cliente.find = originals.findClient;
    Entrega.find = originals.findOrder;
  }
});
