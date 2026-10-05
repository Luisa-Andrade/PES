const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRole, canAccessChannel, canAccessPage } = require('../src/main/accessControl');

test('perfis antigos continuam com acesso compatível', () => {
  assert.equal(normalizeRole('admin'), 'gerencia');
  assert.equal(normalizeRole('usuario'), 'vendedor_balcao');
});

test('LOJA e BALCÃO compartilham pré-vendas sem finalizar pagamentos', () => {
  for (const role of ['vendedor_loja', 'vendedor_balcao']) {
    assert.equal(canAccessChannel(role, 'preVendas:abrir'), true);
    assert.equal(canAccessChannel(role, 'preVendas:salvar'), true);
    assert.equal(canAccessChannel(role, 'preVendas:finalizar'), false);
    assert.equal(canAccessChannel(role, 'preVendas:cancelar'), false);
    assert.equal(canAccessChannel(role, 'vendas:registrar'), false);
    assert.equal(canAccessChannel(role, 'produtos:getAll'), true);
    assert.equal(canAccessChannel(role, 'clientes:getAll'), true);
    assert.equal(canAccessPage(role, 'consulta-preco.html'), true);
    assert.equal(canAccessPage(role, 'usuarios.html'), false);
  }
});

test('CAIXA finaliza e acessa delivery; GERÊNCIA administra o sistema', () => {
  assert.equal(canAccessChannel('caixa', 'preVendas:finalizar'), true);
  assert.equal(canAccessChannel('caixa', 'preVendas:cancelar'), false);
  assert.equal(canAccessChannel('caixa', 'delivery:criar'), true);
  assert.equal(canAccessChannel('caixa', 'usuarios:create'), false);
  assert.equal(canAccessPage('caixa', 'delivery.html'), true);
  assert.equal(canAccessPage('caixa', 'consulta-preco.html'), true);
  assert.equal(canAccessPage('caixa', 'relatorios.html'), false);
  assert.equal(canAccessChannel('gerencia', 'usuarios:create'), true);
  assert.equal(canAccessChannel('gerencia', 'preVendas:cancelar'), true);
  assert.equal(canAccessPage('gerencia', 'relatorios.html'), true);
  assert.equal(canAccessChannel(null, 'produtos:getAll'), false);
});
