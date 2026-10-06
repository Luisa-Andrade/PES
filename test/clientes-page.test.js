const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const dbConnection = require('../src/db/connection');

const originalEnsureConnected = dbConnection.ensureConnected;
dbConnection.ensureConnected = async () => {};
const clientesController = require('../src/controllers/clientesController');
dbConnection.ensureConnected = originalEnsureConnected;
const Cliente = require('../src/models/cliente');
const Venda = require('../src/models/venda');
const HistoricoCredito = require('../src/models/historicoCredito');

test('busca por nome não inclui um filtro numérico vazio', async () => {
  const originals = { ensureConnected: dbConnection.ensureConnected, find: Cliente.find };
  let query;
  dbConnection.ensureConnected = async () => {};
  Cliente.find = value => {
    query = value;
    return { sort: () => ({ limit: async () => [] }) };
  };
  try {
    await clientesController.getClientes('Ana');
    assert.deepEqual(query.$or, [
      { nome: { $regex: 'Ana', $options: 'i' } },
      { email: { $regex: 'Ana', $options: 'i' } }
    ]);
    await clientesController.getClientes('(21) 99999-0000');
    assert.equal(query.$or.length, 5);
    assert.equal(query.$or[2].cpfCnpj.$regex, '21999990000');
    await clientesController.getClientes('.');
    assert.equal(query.$or[0].nome.$regex, '\\.');
    assert.equal(query.$or.length, 2);
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    Cliente.find = originals.find;
  }
});

test('editar cliente salva dados e endereços juntos, inclusive lista vazia', async () => {
  const id = new mongoose.Types.ObjectId();
  const originals = { ensureConnected: dbConnection.ensureConnected, findById: Cliente.findById };
  let saves = 0;
  const client = {
    _id: id, nome: 'Antes', tipo: 'pessoa_fisica', cpfCnpj: '12345678909', limiteCredito: 10, statusCredito: 'analise',
    enderecos: [{ logradouro: 'Rua antiga', numero: '1' }],
    async save() { saves += 1; return this; }
  };
  dbConnection.ensureConnected = async () => {};
  Cliente.findById = async () => client;
  try {
    const updated = await clientesController.updateCliente(String(id), {
      nome: 'Depois', cpfCnpj: '123.456.789-09', limiteCredito: 50, statusCredito: 'ativo',
      enderecos: [{ logradouro: 'Rua nova', numero: '2' }]
    });
    assert.equal(updated.success, true);
    assert.equal(client.nome, 'Depois');
    assert.equal(client.cpfCnpj, '12345678909');
    assert.equal(client.limiteCredito, 50);
    assert.equal(client.statusCredito, 'ativo');
    assert.equal(client.enderecos[0].logradouro, 'Rua nova');
    assert.equal(saves, 1);

    const cleared = await clientesController.updateCliente(String(id), { nome: 'Sem endereço', cpfCnpj: '', enderecos: [] });
    assert.equal(cleared.success, true);
    assert.equal(client.nome, 'Sem endereço');
    assert.equal(client.cpfCnpj, undefined);
    assert.deepEqual(client.enderecos, []);
    assert.equal(saves, 2);
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    Cliente.findById = originals.findById;
  }
});

test('cadastro aceita mais de um cliente sem CPF/CNPJ', async () => {
  const originals = {
    ensureConnected: dbConnection.ensureConnected,
    findOne: Cliente.findOne,
    save: Cliente.prototype.save
  };
  let duplicateChecks = 0;
  const saved = [];
  dbConnection.ensureConnected = async () => {};
  Cliente.findOne = async () => { duplicateChecks += 1; return null; };
  Cliente.prototype.save = async function () { saved.push(this); return this; };
  try {
    const first = await clientesController.addCliente({ nome: 'Cliente A', tipo: 'pessoa_fisica', cpfCnpj: '' });
    const second = await clientesController.addCliente({ nome: 'Cliente B', tipo: 'pessoa_fisica', cpfCnpj: '' });
    assert.equal(first.success, true);
    assert.equal(second.success, true);
    assert.equal(duplicateChecks, 0);
    assert.equal(saved.length, 2);
    assert.equal(saved[0].cpfCnpj, undefined);
    assert.equal(saved[1].cpfCnpj, undefined);
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    Cliente.findOne = originals.findOne;
    Cliente.prototype.save = originals.save;
  }
});

test('CPF e CNPJ informados precisam corresponder ao tipo de pessoa', async () => {
  const id = new mongoose.Types.ObjectId();
  const originals = {
    ensureConnected: dbConnection.ensureConnected,
    findById: Cliente.findById,
    findOne: Cliente.findOne,
    save: Cliente.prototype.save
  };
  const cliente = { _id: id, nome: 'Empresa', tipo: 'pessoa_juridica', cpfCnpj: '11222333000181', async save() {} };
  dbConnection.ensureConnected = async () => {};
  Cliente.findById = async () => cliente;
  Cliente.findOne = async () => null;
  Cliente.prototype.save = async function () { return this; };
  try {
    const cpfNoCadastroPj = await clientesController.addCliente({ nome: 'Empresa', tipo: 'pessoa_juridica', cpfCnpj: '123.456.789-09' });
    assert.equal(cpfNoCadastroPj.success, false);
    assert.match(cpfNoCadastroPj.message, /CNPJ deve ter 14 dígitos/);

    const cnpjNaEdicaoPf = await clientesController.updateCliente(String(id), { tipo: 'pessoa_fisica', cpfCnpj: '11.222.333/0001-81' });
    assert.equal(cnpjNaEdicaoPf.success, false);
    assert.match(cnpjNaEdicaoPf.message, /CPF deve ter 11 dígitos/);
    assert.equal(cliente.tipo, 'pessoa_juridica');
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    Cliente.findById = originals.findById;
    Cliente.findOne = originals.findOne;
    Cliente.prototype.save = originals.save;
  }
});

test('falha ao consultar vendas em fiado não aparece como resumo vazio', async () => {
  const id = new mongoose.Types.ObjectId();
  const originals = { ensureConnected: dbConnection.ensureConnected, findOne: Cliente.findOne, find: Venda.find };
  dbConnection.ensureConnected = async () => {};
  Cliente.findOne = async () => ({ _id: id, limiteCredito: 100, saldoDevedor: 30, creditoAdicional: 0, statusCredito: 'ativo' });
  Venda.find = () => ({ sort: async () => { throw new Error('consulta indisponível'); } });
  try {
    const resultado = await clientesController.getResumoFiado(String(id));
    assert.equal(resultado.success, false);
    assert.match(resultado.message, /consulta indisponível/);
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    Cliente.findOne = originals.findOne;
    Venda.find = originals.find;
  }
});

test('crédito extra salva o ajuste no histórico na mesma transação', async () => {
  const id = new mongoose.Types.ObjectId();
  const originals = {
    ensureConnected: dbConnection.ensureConnected,
    startSession: mongoose.startSession,
    findById: Cliente.findById,
    saveHistory: HistoricoCredito.prototype.save
  };
  let active = false;
  let committed = false;
  let savedHistory;
  const session = {
    startTransaction() { active = true; },
    inTransaction() { return active; },
    async commitTransaction() { committed = true; active = false; },
    async abortTransaction() { active = false; },
    async endSession() {}
  };
  const cliente = {
    _id: id, nome: 'Cliente crédito', saldoDevedor: 20, creditoAdicional: 10,
    async adicionarCreditoExtra(valor, observacao, usedSession) {
      assert.equal(usedSession, session);
      assert.equal(observacao, 'Devolução');
      this.creditoAdicional += valor;
    }
  };
  dbConnection.ensureConnected = async () => {};
  mongoose.startSession = async () => session;
  Cliente.findById = () => ({ session: async usedSession => {
    assert.equal(usedSession, session);
    return cliente;
  } });
  HistoricoCredito.prototype.save = async function (options) {
    assert.equal(options.session, session);
    savedHistory = this;
  };
  try {
    const resultado = await clientesController.adicionarCreditoExtra(String(id), { valor: 15, observacao: 'Devolução' });
    assert.equal(resultado.success, true);
    assert.equal(committed, true);
    assert.equal(cliente.creditoAdicional, 25);
    assert.equal(savedHistory.tipo, 'ajuste_credito');
    assert.equal(savedHistory.valor, 15);
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    mongoose.startSession = originals.startSession;
    Cliente.findById = originals.findById;
    HistoricoCredito.prototype.save = originals.saveHistory;
  }
});

test('quitação de fiado parcial registra somente o valor restante', async () => {
  const id = new mongoose.Types.ObjectId();
  const originals = {
    ensureConnected: dbConnection.ensureConnected,
    startSession: mongoose.startSession,
    findById: Cliente.findById,
    findSales: Venda.find,
    saveHistory: HistoricoCredito.prototype.save
  };
  const session = {
    startTransaction() {},
    async commitTransaction() {},
    async abortTransaction() {},
    async endSession() {}
  };
  const cliente = { _id: id, nome: 'Cliente parcial', saldoDevedor: 60, async save() {} };
  const venda = {
    codigo: 'VEN-1', total: 100,
    pagamento: { fiado: { status: 'parcial', valorPago: 40, historicoPagamentos: [] } },
    async save() {}
  };
  dbConnection.ensureConnected = async () => {};
  mongoose.startSession = async () => session;
  Cliente.findById = () => ({ session: async () => cliente });
  Venda.find = () => ({ session: async () => [venda] });
  HistoricoCredito.prototype.save = async function () {};
  try {
    const resultado = await clientesController.zerarSaldoDevedor(String(id));
    assert.equal(resultado.success, true);
    assert.equal(cliente.saldoDevedor, 0);
    assert.equal(venda.pagamento.fiado.status, 'pago');
    assert.equal(venda.pagamento.fiado.valorPago, 100);
    assert.equal(venda.pagamento.fiado.historicoPagamentos.at(-1).valor, 60);
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    mongoose.startSession = originals.startSession;
    Cliente.findById = originals.findById;
    Venda.find = originals.findSales;
    HistoricoCredito.prototype.save = originals.saveHistory;
  }
});

test('sincronização recompõe o saldo sem quitar uma venda ainda pendente', async () => {
  const id = new mongoose.Types.ObjectId();
  const originals = {
    ensureConnected: dbConnection.ensureConnected,
    startSession: mongoose.startSession,
    findById: Cliente.findById,
    findSales: Venda.find,
    saveHistory: HistoricoCredito.prototype.save
  };
  let committed = false;
  let historico;
  const session = {
    startTransaction() {},
    async commitTransaction() { committed = true; },
    async abortTransaction() {},
    async endSession() {}
  };
  const cliente = { _id: id, nome: 'Cliente pendente', saldoDevedor: 0, async save() {} };
  const venda = {
    codigo: 'VEN-2', total: 100,
    pagamento: { fiado: { status: 'parcial', valorPago: 40 } },
    async save() { throw new Error('Venda com saldo não pode ser quitada pela sincronização'); }
  };
  dbConnection.ensureConnected = async () => {};
  mongoose.startSession = async () => session;
  Cliente.findById = () => ({ session: async () => cliente });
  Venda.find = () => ({ session: async () => [venda] });
  HistoricoCredito.prototype.save = async function () { historico = this; };
  try {
    const resultado = await clientesController.sincronizarDadosCredito(String(id));
    assert.equal(resultado.success, true);
    assert.equal(committed, true);
    assert.equal(cliente.saldoDevedor, 60);
    assert.equal(venda.pagamento.fiado.status, 'parcial');
    assert.equal(venda.pagamento.fiado.valorPago, 40);
    assert.equal(historico.tipo, 'ajuste_credito');
    assert.equal(historico.saldoAnterior, 0);
    assert.equal(historico.saldoNovo, 60);
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    mongoose.startSession = originals.startSession;
    Cliente.findById = originals.findById;
    Venda.find = originals.findSales;
    HistoricoCredito.prototype.save = originals.saveHistory;
  }
});

test('sincronização preserva saldo antigo sem vendas rastreáveis', async () => {
  const id = new mongoose.Types.ObjectId();
  const originals = {
    ensureConnected: dbConnection.ensureConnected,
    startSession: mongoose.startSession,
    findById: Cliente.findById,
    findSales: Venda.find
  };
  let aborted = false;
  const session = {
    startTransaction() {},
    async commitTransaction() { throw new Error('Não deve confirmar'); },
    async abortTransaction() { aborted = true; },
    async endSession() {}
  };
  const cliente = { saldoDevedor: 30, async save() { throw new Error('Não deve alterar o saldo'); } };
  dbConnection.ensureConnected = async () => {};
  mongoose.startSession = async () => session;
  Cliente.findById = () => ({ session: async () => cliente });
  Venda.find = () => ({ session: async () => [] });
  try {
    const resultado = await clientesController.sincronizarDadosCredito(String(id));
    assert.equal(resultado.success, false);
    assert.equal(aborted, true);
    assert.equal(cliente.saldoDevedor, 30);
  } finally {
    dbConnection.ensureConnected = originals.ensureConnected;
    mongoose.startSession = originals.startSession;
    Cliente.findById = originals.findById;
    Venda.find = originals.findSales;
  }
});
