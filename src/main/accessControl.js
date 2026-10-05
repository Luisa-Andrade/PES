const ROLES = ['vendedor_loja', 'vendedor_balcao', 'caixa', 'gerencia'];

function normalizeRole(role) {
  if (role === 'admin') return 'gerencia';
  if (role === 'usuario') return 'vendedor_balcao';
  return ROLES.includes(role) ? role : null;
}

function canCheckout(role) {
  return ['caixa', 'gerencia'].includes(normalizeRole(role));
}

function canAccessChannel(role, channel) {
  if (['auth:login', 'auth:logout', 'auth:getCurrentUser'].includes(channel)) return true;
  const currentRole = normalizeRole(role);
  if (!currentRole) return false;
  if (currentRole === 'gerencia') return true;

  if (channel.startsWith('preVendas:')) {
    if (channel === 'preVendas:cancelar') return currentRole === 'gerencia';
    return channel !== 'preVendas:finalizar' || canCheckout(currentRole);
  }
  if (['produtos:getAll', 'produtos:getById', 'produtos:getCategorias', 'scanner:getSnapshot'].includes(channel)) return true;
  if (channel.startsWith('clientes:')) {
    if (['clientes:delete', 'clientes:zerarSaldoDevedor', 'clientes:adicionarCreditoExtra',
      'clientes:sincronizarDadosCredito'].includes(channel)) return false;
    if (channel === 'clientes:adicionarPagamento') return canCheckout(currentRole);
    return true;
  }
  if (channel.startsWith('delivery:')) return canCheckout(currentRole);
  if (['vendas:registrar', 'vendas:buscar', 'vendas:detalhes', 'vendas:getVendedores',
    'vendas:registrarPagamentoFiado', 'vendas:getFiadoCliente', 'print:generatePdf'].includes(channel)) {
    return canCheckout(currentRole);
  }
  return false;
}

function canAccessPage(role, page) {
  if (page === 'login.html') return true;
  const currentRole = normalizeRole(role);
  if (!currentRole) return false;
  if (currentRole === 'gerencia') return true;
  if (['main.html', 'vendas.html', 'consulta-preco.html', 'clientes.html'].includes(page)) return true;
  return currentRole === 'caixa' && page === 'delivery.html';
}

module.exports = { ROLES, normalizeRole, canCheckout, canAccessChannel, canAccessPage };
