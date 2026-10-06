function valorEmCentavos(valor) {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

function dentroDoPeriodo(data, intervalo) {
  if (!intervalo) return true;
  const instante = new Date(data);
  return Number.isFinite(instante.getTime()) && instante >= intervalo.$gte && instante <= intervalo.$lte;
}

function calcularSaldoCaixa(vendas = [], retiradas = [], intervalo = null) {
  const vendasDinheiro = vendas.reduce((total, venda) => {
    if (venda.status === 'cancelada') return total;
    if (venda.pagamento?.metodo === 'dinheiro') {
      return dentroDoPeriodo(venda.dataVenda, intervalo) ? total + valorEmCentavos(venda.total ?? venda.valorTotal) : total;
    }
    if (venda.pagamento?.metodo !== 'fiado') return total;
    return total + (venda.pagamento.fiado?.historicoPagamentos || []).reduce((soma, pagamento) => {
      if (pagamento.formaPagamento !== 'dinheiro' || !dentroDoPeriodo(pagamento.data, intervalo)) return soma;
      return soma + valorEmCentavos(pagamento.valor);
    }, 0);
  }, 0);
  const retirado = retiradas.reduce((total, retirada) =>
    retirada.ativo === false || !dentroDoPeriodo(retirada.dataCriacao, intervalo) ? total : total + valorEmCentavos(retirada.valor), 0);
  return {
    totalVendas: vendasDinheiro / 100,
    totalRetiradas: retirado / 100,
    saldo: (vendasDinheiro - retirado) / 100
  };
}

function intervaloLocal(inicio, fim) {
  const analisar = (valor, fimDoDia) => {
    if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error('Data inválida');
    const [ano, mes, dia] = valor.split('-').map(Number);
    const data = new Date(ano, mes - 1, dia, fimDoDia ? 23 : 0, fimDoDia ? 59 : 0, fimDoDia ? 59 : 0, fimDoDia ? 999 : 0);
    if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) throw new Error('Data inválida');
    return data;
  };
  const dataInicio = analisar(inicio, false);
  const dataFim = analisar(fim, true);
  if (dataInicio > dataFim) throw new Error('O início do período deve ser anterior ao fim');
  return { $gte: dataInicio, $lte: dataFim };
}

function validarRetirada(valor, saldo) {
  const numero = Number(valor);
  if (!Number.isFinite(numero) || valorEmCentavos(numero) <= 0 || Math.abs(numero * 100 - Math.round(numero * 100)) > 0.000001) {
    return 'Informe um valor positivo com até duas casas decimais.';
  }
  if (saldo !== undefined && valorEmCentavos(numero) > valorEmCentavos(saldo)) {
    return `Saldo insuficiente no caixa. Disponível: ${Number(saldo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`;
  }
  return null;
}

module.exports = { calcularSaldoCaixa, intervaloLocal, valorEmCentavos, validarRetirada };
