const test = require('node:test');
const assert = require('node:assert/strict');
const { calcularSaldoCaixa, intervaloLocal, validarRetirada } = require('../src/utils/caixa');

test('saldo físico considera somente vendas em dinheiro e retiradas ativas', () => {
  const vendas = [
    { total: 59.90, pagamento: { metodo: 'dinheiro' }, status: 'concluida' },
    { total: 20.10, pagamento: { metodo: 'dinheiro' }, status: 'concluida' },
    { total: 500, pagamento: { metodo: 'pix' }, status: 'concluida' },
    { total: 300, pagamento: { metodo: 'cartao_credito' }, status: 'concluida' },
    { total: 200, pagamento: { metodo: 'fiado' }, status: 'concluida' },
    { total: 100, pagamento: { metodo: 'dinheiro' }, status: 'cancelada' }
  ];
  const retiradas = [{ valor: 12.35, ativo: true }, { valor: 999, ativo: false }];
  assert.deepEqual(calcularSaldoCaixa(vendas, retiradas), {
    totalVendas: 80,
    totalRetiradas: 12.35,
    saldo: 67.65
  });
});

test('retirada exige centavos válidos e não pode ultrapassar o saldo', () => {
  assert.match(validarRetirada(0, 100), /valor positivo/);
  assert.match(validarRetirada(10.001, 100), /duas casas/);
  assert.match(validarRetirada(100.01, 100), /Saldo insuficiente/);
  assert.equal(validarRetirada(100, 100), null);
});

test('pagamento de fiado em dinheiro entra no caixa na data do recebimento', () => {
  const vendas = [{
    total: 100,
    dataVenda: new Date(2026, 8, 1),
    status: 'concluida',
    pagamento: { metodo: 'fiado', fiado: { historicoPagamentos: [
      { valor: 40, formaPagamento: 'dinheiro', data: new Date(2026, 9, 3) },
      { valor: 60, formaPagamento: 'pix', data: new Date(2026, 9, 4) }
    ] } }
  }];
  const periodo = intervaloLocal('2026-10-01', '2026-10-05');
  assert.deepEqual(calcularSaldoCaixa(vendas, [], periodo), {
    totalVendas: 40,
    totalRetiradas: 0,
    saldo: 40
  });
});

test('período usa o dia local completo e rejeita datas inválidas', () => {
  const periodo = intervaloLocal('2026-10-01', '2026-10-05');
  assert.equal(periodo.$gte.getDate(), 1);
  assert.equal(periodo.$gte.getHours(), 0);
  assert.equal(periodo.$lte.getDate(), 5);
  assert.equal(periodo.$lte.getHours(), 23);
  assert.throws(() => intervaloLocal('2026-10-05', '2026-10-01'));
  assert.throws(() => intervaloLocal('2026-02-30', '2026-03-01'));
});
