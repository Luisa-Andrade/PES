function calcularBaixasEstoque(itens, opcoes = {}) {
  const totais = new Map();
  for (const item of itens) {
    const id = String(item.produto);
    const quantidade = Number(item.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) throw new Error('A quantidade dos produtos deve ser maior que zero.');
    totais.set(id, (totais.get(id) || 0) + quantidade);
  }

  const reservas = opcoes.quantidadesReservadas instanceof Map
    ? opcoes.quantidadesReservadas
    : new Map(Object.entries(opcoes.quantidadesReservadas || {}));
  const baixas = new Map();
  for (const [id, total] of totais) {
    const reservado = !opcoes.estoqueReservado ? 0
      : opcoes.quantidadesReservadas == null ? total : Number(reservas.get(id) || 0);
    if (!Number.isFinite(reservado) || reservado < 0) {
      throw new Error('A reserva de estoque da pré-venda está inconsistente. Recarregue antes de confirmar.');
    }
    baixas.set(id, total - reservado);
  }
  if (opcoes.estoqueReservado && opcoes.quantidadesReservadas != null) {
    for (const [rawId, rawReserved] of reservas) {
      const id = String(rawId);
      if (totais.has(id)) continue;
      const reservado = Number(rawReserved);
      if (!Number.isFinite(reservado) || reservado < 0) {
        throw new Error('A reserva de estoque da pré-venda está inconsistente. Recarregue antes de confirmar.');
      }
      baixas.set(id, -reservado);
    }
  }
  return baixas;
}

module.exports = calcularBaixasEstoque;
