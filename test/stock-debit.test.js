const test = require('node:test');
const assert = require('node:assert/strict');
const calcularBaixasEstoque = require('../src/utils/calcularBaixasEstoque');

test('baixa apenas o adicional quando o mesmo produto já está reservado', () => {
  const itens = [
    { produto: 'produto-a', quantidade: 2 },
    { produto: 'produto-a', quantidade: 1 },
    { produto: 'produto-b', quantidade: 3 }
  ];
  const baixas = calcularBaixasEstoque(itens, {
    estoqueReservado: true,
    quantidadesReservadas: new Map([['produto-a', 2]])
  });
  assert.equal(baixas.get('produto-a'), 1);
  assert.equal(baixas.get('produto-b'), 3);
});

test('mantém os fluxos de venda comum e pré-venda totalmente reservada', () => {
  const itens = [{ produto: 'produto-a', quantidade: 2 }];
  assert.equal(calcularBaixasEstoque(itens).get('produto-a'), 2);
  assert.equal(calcularBaixasEstoque(itens, { estoqueReservado: true }).get('produto-a'), 0);
  assert.equal(calcularBaixasEstoque(itens, {
    estoqueReservado: true,
    quantidadesReservadas: new Map([['produto-a', 3]])
  }).get('produto-a'), -1);
  assert.throws(() => calcularBaixasEstoque(itens, {
    estoqueReservado: true,
    quantidadesReservadas: new Map([['produto-a', -1]])
  }), /reserva de estoque/);
});

test('devolve a reserva de um produto removido da pré-venda', () => {
  const baixas = calcularBaixasEstoque([{ produto: 'produto-b', quantidade: 1 }], {
    estoqueReservado: true,
    quantidadesReservadas: new Map([['produto-a', 2], ['produto-b', 1]])
  });
  assert.equal(baixas.get('produto-a'), -2);
  assert.equal(baixas.get('produto-b'), 0);
});
