const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('LOJA cria, BALCÃO continua e CAIXA finaliza uma pré-venda com receita', {
  skip: process.env.RUN_MONGO_INTEGRATION !== '1'
}, async t => {
  const databaseName = `farmavida_pre_venda_test_${process.pid}`;
  const localSecrets = path.resolve(__dirname, '../.mongo-lan-credentials.json');
  if (process.env.DB_TEST_URI) {
    process.env.DB_LOCAL_URI = process.env.DB_TEST_URI.replace('{database}', databaseName);
  } else if (fs.existsSync(localSecrets)) {
    const { adminUser, adminPassword, hostname } = JSON.parse(fs.readFileSync(localSecrets, 'utf8'));
    process.env.DB_LOCAL_URI = `mongodb://${adminUser}:${adminPassword}@${hostname}:27017/${databaseName}?authSource=admin&replicaSet=rs0`;
  } else {
    process.env.DB_LOCAL_URI = `mongodb://127.0.0.1:27017/${databaseName}?replicaSet=rs0`;
  }

  const mongoose = require('mongoose');
  const dbConnection = require('../src/db/connection');
  const User = require('../src/models/user');
  const Produto = require('../src/models/produto');
  const Cliente = require('../src/models/cliente');
  const PreVenda = require('../src/models/preVenda');
  const Venda = require('../src/models/venda');
  const preVendas = require('../src/controllers/preVendasController');
  const vendas = require('../src/controllers/vendasController');

  t.after(async () => {
    if (mongoose.connection.name === databaseName) {
      await mongoose.connection.db.dropDatabase();
    }
    await dbConnection.disconnect();
  });

  await dbConnection.ensureConnected();
  const [lojaUser, balcaoUser, caixaUser, gerenteUser] = await User.create([
    { nome: 'Teste Loja', email: 'loja@teste.local', senha: 'teste1234', tipo: 'vendedor_loja' },
    { nome: 'Teste Balcão', email: 'balcao@teste.local', senha: 'teste1234', tipo: 'vendedor_balcao' },
    { nome: 'Teste Caixa', email: 'caixa@teste.local', senha: 'teste1234', tipo: 'caixa' },
    { nome: 'Teste Gerente', email: 'gerente@teste.local', senha: 'teste1234', tipo: 'gerencia' }
  ]);
  const loja = { id: lojaUser.id, tipo: lojaUser.tipo };
  const balcao = { id: balcaoUser.id, tipo: balcaoUser.tipo };
  const caixa = { id: caixaUser.id, tipo: caixaUser.tipo };
  const gerente = { id: gerenteUser.id, tipo: gerenteUser.tipo };
  const cliente = await Cliente.create({ nome: 'Cliente Teste', tipo: 'pessoa_fisica' });
  const medicamento = await Produto.create({
    codigo: 'TESTE-RECEITA', nome: 'Medicamento Teste', categoria: 'Medicamentos',
    preco: 10, precoVenda: 15, estoque: 4, exigeReceita: true
  });
  const outro = await Produto.create({
    codigo: 'TESTE-OUTRO', nome: 'Outro Produto', categoria: 'Medicamentos',
    preco: 3, precoVenda: 5, estoque: 5
  });

  const vendaDiretaSemReceita = await vendas.registrarVenda({
    vendedor: caixaUser.id,
    itens: [{ produto: medicamento.id, codigoProduto: medicamento.codigo,
      nomeProduto: medicamento.nome, quantidade: 1, precoUnitario: 15, subtotal: 15,
      receitaApresentada: false }],
    subtotal: 15, total: 15, pagamento: { metodo: 'pix' }
  });
  assert.equal(vendaDiretaSemReceita.success, false);
  assert.match(vendaDiretaSemReceita.message, /receita/i);

  let preVenda = await preVendas.abrir('TESTE-001', loja);
  preVenda = await preVendas.salvar({
    codigo: preVenda.codigo, versao: preVenda.versao, cliente: null,
    itens: [
      { produto: medicamento.id, quantidade: 1, receitaApresentada: true },
      { produto: outro.id, quantidade: 1 }
    ]
  }, loja);
  assert.equal(preVenda.itens[0].receitaApresentada, null, 'LOJA não pode confirmar receita');
  assert.equal((await Produto.findById(medicamento.id)).estoque, 3, 'salvar reserva o medicamento');
  assert.equal((await Produto.findById(outro.id)).estoque, 4, 'salvar reserva o outro produto');
  const concorrente = await preVendas.abrir('TESTE-SEM-ESTOQUE', balcao);
  await assert.rejects(() => preVendas.salvar({
    codigo: concorrente.codigo, versao: concorrente.versao, cliente: null,
    itens: [{ produto: medicamento.id, quantidade: 4 }]
  }, balcao), /Estoque insuficiente/i);
  assert.equal((await Produto.findById(medicamento.id)).estoque, 3, 'falha não altera o estoque');
  assert.equal((await preVendas.abrir('TESTE-001', balcao)).itens.length, 2);
  await assert.rejects(() => preVendas.finalizar('TESTE-001', { metodo: 'pix' }, caixa), /receita/i);

  const versaoAntiga = preVenda.versao;
  preVenda = await preVendas.salvar({
    codigo: preVenda.codigo, versao: preVenda.versao, cliente: cliente.id,
    itens: [{ produto: medicamento.id, quantidade: 1, receitaApresentada: true }]
  }, balcao);
  assert.equal(preVenda.itens.length, 1, 'BALCÃO pode retirar itens da LOJA');
  assert.equal((await Produto.findById(outro.id)).estoque, 5, 'retirar item ajusta a reserva');
  assert.equal(preVenda.cliente, cliente.id);
  await assert.rejects(() => preVendas.salvar({
    codigo: preVenda.codigo, versao: versaoAntiga, cliente: null, itens: []
  }, loja), /alterada por outro usuário/);

  const resultado = await preVendas.finalizar('TESTE-001', { metodo: 'pix' }, caixa);
  assert.equal(resultado.success, true, resultado.message);
  assert.equal((await Produto.findById(medicamento.id)).estoque, 3);
  assert.equal((await Produto.findById(outro.id)).estoque, 5);
  assert.equal((await PreVenda.findOne({ codigo: 'TESTE-001' })).status, 'finalizada');
  const venda = await Venda.findById(resultado.venda._id);
  assert.equal(venda.preVendaCodigo, 'TESTE-001');
  assert.equal(venda.operadorCaixa.toString(), caixa.id);
  assert.equal(venda.itens[0].receitaApresentada, true);
  await assert.rejects(() => preVendas.finalizar('TESTE-001', { metodo: 'pix' }, caixa), /não encontrada/i);
  assert.equal(await Venda.countDocuments({ preVendaCodigo: 'TESTE-001' }), 1);

  let cancelavel = await preVendas.abrir('TESTE-CANCELAR', loja);
  cancelavel = await preVendas.salvar({
    codigo: cancelavel.codigo, versao: cancelavel.versao, cliente: null,
    itens: [{ produto: outro.id, quantidade: 2 }]
  }, loja);
  assert.equal((await Produto.findById(outro.id)).estoque, 3);
  await assert.rejects(() => preVendas.cancelar(cancelavel.codigo, cancelavel.versao, caixa), /GERÊNCIA/);
  assert.equal((await Produto.findById(outro.id)).estoque, 3);
  await preVendas.cancelar(cancelavel.codigo, cancelavel.versao, gerente);
  assert.equal((await Produto.findById(outro.id)).estoque, 5, 'cancelamento devolve a reserva');
  await assert.rejects(() => preVendas.cancelar(cancelavel.codigo, cancelavel.versao, gerente), /não encontrada/i);

  await PreVenda.create({
    codigo: 'TESTE-ANTIGA', criadoPor: loja.id, atualizadoPor: loja.id,
    itens: [{ produto: outro.id, nomeProduto: outro.nome, quantidade: 1, precoUnitario: 5 }]
  });
  const vendaAntiga = await preVendas.finalizar('TESTE-ANTIGA', { metodo: 'pix' }, caixa);
  assert.equal(vendaAntiga.success, true, vendaAntiga.message);
  assert.equal((await Produto.findById(outro.id)).estoque, 4, 'pré-venda antiga baixa somente na finalização');
});
