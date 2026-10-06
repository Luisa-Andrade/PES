const mongoose = require('mongoose');
const PreVenda = require('../models/preVenda');
const Produto = require('../models/produto');
const Cliente = require('../models/cliente');
const vendasController = require('./vendasController');
const dbConnection = require('../db/connection');
const { canCheckout, normalizeRole } = require('../main/accessControl');

function codigoValido(value) {
  const codigo = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{1,32}$/.test(codigo)) {
    throw new Error('Use um código de pré-venda com até 32 letras, números ou hífens.');
  }
  return codigo;
}

function formatar(preVenda) {
  return {
    id: preVenda._id.toString(),
    codigo: preVenda.codigo,
    versao: preVenda.__v,
    status: preVenda.status,
    estoqueReservado: preVenda.estoqueReservado === true,
    cliente: preVenda.cliente ? preVenda.cliente.toString() : null,
    nomeCliente: preVenda.nomeCliente,
    itens: (preVenda.itens || []).map(item => ({
      produto: item.produto?.toString() || null,
      codigoProduto: item.codigoProduto || '',
      nomeProduto: item.nomeProduto,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
      unidadeMedida: item.unidadeMedida,
      exigeReceita: item.exigeReceita,
      receitaApresentada: item.receitaApresentada
    })),
    criadoPor: preVenda.criadoPor?.toString() || null,
    atualizadoEm: preVenda.updatedAt,
    venda: preVenda.venda ? preVenda.venda.toString() : null
  };
}

async function abrir(codigoInformado, usuario) {
  await dbConnection.ensureConnected();
  const codigo = codigoValido(codigoInformado);
  let preVenda = await PreVenda.findOne({ codigo });
  if (!preVenda) {
    try {
      preVenda = await PreVenda.create({ codigo, criadoPor: usuario.id, atualizadoPor: usuario.id, estoqueReservado: true });
    } catch (error) {
      if (error.code !== 11000) throw error;
      preVenda = await PreVenda.findOne({ codigo });
    }
  }
  if (preVenda.status !== 'aberta') throw new Error(`Esta pré-venda já foi ${preVenda.status}.`);
  return formatar(preVenda);
}

async function listar() {
  await dbConnection.ensureConnected();
  const preVendas = await PreVenda.find({ status: 'aberta' }).sort({ updatedAt: -1 }).limit(100);
  return preVendas.map(formatar);
}

async function salvar(dados, usuario) {
  await dbConnection.ensureConnected();
  const codigo = codigoValido(dados?.codigo);
  if (!Array.isArray(dados?.itens) || dados.itens.length > 100) {
    throw new Error('A pré-venda deve ter até 100 itens.');
  }
  const ids = dados.itens.map(item => String(item.produto || ''));
  if (ids.some(id => !mongoose.Types.ObjectId.isValid(id)) || new Set(ids).size !== ids.length) {
    throw new Error('Há produtos inválidos ou repetidos na pré-venda.');
  }
  const session = await mongoose.startSession();
  try {
    let resultado;
    await session.withTransaction(async () => {
      const preVenda = await PreVenda.findOne({ codigo }).session(session);
      if (!preVenda || preVenda.status !== 'aberta') throw new Error('Pré-venda aberta não encontrada.');
      if (!Number.isInteger(dados.versao) || dados.versao !== preVenda.__v) {
        throw new Error('Esta pré-venda foi alterada por outro usuário. Reabra para ver a versão atual.');
      }

      let cliente = null;
      if (dados.cliente) {
        if (!mongoose.Types.ObjectId.isValid(dados.cliente)) throw new Error('Cliente inválido.');
        cliente = await Cliente.findById(dados.cliente).session(session).select('nome');
        if (!cliente) throw new Error('Cliente não encontrado.');
      }

      const antigos = new Map(preVenda.itens.map(item => [item.produto.toString(), item]));
      const produtos = await Produto.find({ _id: { $in: ids }, ativo: true }).session(session);
      const porId = new Map(produtos.map(produto => [produto._id.toString(), produto]));
      if (porId.size !== ids.length) throw new Error('Um dos produtos não está mais disponível.');

      const itens = dados.itens.map(item => {
        const produto = porId.get(String(item.produto));
        const quantidade = Number(item.quantidade);
        if (!Number.isFinite(quantidade) || quantidade <= 0) {
          throw new Error(`Quantidade inválida para ${produto.nome}.`);
        }
        let receitaApresentada = null;
        if (produto.exigeReceita) {
          if (normalizeRole(usuario.tipo) === 'vendedor_loja') {
            receitaApresentada = antigos.get(produto._id.toString())?.receitaApresentada ?? null;
          } else if (item.receitaApresentada === true || item.receitaApresentada === false) {
            receitaApresentada = item.receitaApresentada;
          }
        }
        return {
          produto: produto._id,
          codigoProduto: produto.codigo || '',
          nomeProduto: produto.nome,
          quantidade,
          precoUnitario: produto.precoVenda,
          unidadeMedida: produto.unidadeMedida,
          exigeReceita: Boolean(produto.exigeReceita),
          receitaApresentada
        };
      });

      const novasQuantidades = new Map(itens.map(item => [item.produto.toString(), item.quantidade]));
      const todosIds = new Set([...antigos.keys(), ...novasQuantidades.keys()]);
      for (const id of todosIds) {
        const anterior = preVenda.estoqueReservado ? Number(antigos.get(id)?.quantidade || 0) : 0;
        const desejada = novasQuantidades.get(id) || 0;
        const diferenca = desejada - anterior;
        if (diferenca > 0) {
          const atualizado = await Produto.findOneAndUpdate(
            { _id: id, ativo: true, estoque: { $gte: diferenca } },
            { $inc: { estoque: -diferenca } },
            { session, new: true }
          );
          if (!atualizado) throw new Error(`Estoque insuficiente para ${porId.get(id)?.nome || 'um produto'}.`);
        } else if (diferenca < 0) {
          const devolucao = await Produto.updateOne({ _id: id }, { $inc: { estoque: -diferenca } }, { session });
          if (devolucao.matchedCount !== 1) throw new Error('Um produto reservado não foi encontrado.');
        }
      }

      preVenda.cliente = cliente?._id || null;
      preVenda.nomeCliente = cliente?.nome || 'Cliente Padrão';
      preVenda.itens = itens;
      preVenda.estoqueReservado = true;
      preVenda.atualizadoPor = usuario.id;
      await preVenda.save({ session });
      resultado = formatar(preVenda);
    });
    return resultado;
  } catch (error) {
    if (error.name === 'VersionError') {
      throw new Error('Esta pré-venda foi alterada por outro usuário. Reabra para ver a versão atual.');
    }
    throw error;
  } finally {
    await session.endSession();
  }
}

async function cancelar(codigoInformado, versao, usuario) {
  if (normalizeRole(usuario?.tipo) !== 'gerencia') throw new Error('Somente GERÊNCIA pode cancelar pré-vendas.');
  await dbConnection.ensureConnected();
  const codigo = codigoValido(codigoInformado);
  const session = await mongoose.startSession();
  try {
    let resultado;
    await session.withTransaction(async () => {
      const preVenda = await PreVenda.findOne({ codigo }).session(session);
      if (!preVenda || preVenda.status !== 'aberta') throw new Error('Pré-venda aberta não encontrada.');
      if (!Number.isInteger(versao) || versao !== preVenda.__v) {
        throw new Error('Esta pré-venda foi alterada por outro usuário. Reabra antes de cancelar.');
      }
      if (preVenda.estoqueReservado) {
        for (const item of preVenda.itens) {
          const devolucao = await Produto.updateOne(
            { _id: item.produto },
            { $inc: { estoque: item.quantidade } },
            { session }
          );
          if (devolucao.matchedCount !== 1) throw new Error('Um produto reservado não foi encontrado.');
        }
      }
      preVenda.status = 'cancelada';
      preVenda.canceladaPor = usuario.id;
      preVenda.canceladaEm = new Date();
      preVenda.atualizadoPor = usuario.id;
      await preVenda.save({ session });
      resultado = formatar(preVenda);
    });
    return resultado;
  } catch (error) {
    if (error.name === 'VersionError') throw new Error('Esta pré-venda foi alterada por outro usuário. Reabra antes de cancelar.');
    throw error;
  } finally {
    await session.endSession();
  }
}

async function finalizar(codigoInformado, pagamento, usuario) {
  if (!canCheckout(usuario.tipo)) throw new Error('Somente CAIXA ou GERÊNCIA pode finalizar vendas.');
  await dbConnection.ensureConnected();
  const codigo = codigoValido(codigoInformado);
  const preVenda = await PreVenda.findOne({ codigo, status: 'aberta' });
  if (!preVenda) throw new Error('Pré-venda aberta não encontrada.');
  if (preVenda.itens.length === 0) throw new Error('Adicione produtos antes de finalizar.');

  const ids = preVenda.itens.map(item => item.produto);
  const produtos = await Produto.find({ _id: { $in: ids }, ativo: true });
  const porId = new Map(produtos.map(produto => [produto._id.toString(), produto]));
  if (porId.size !== ids.length) throw new Error('Um dos produtos não está mais disponível.');
  const itens = preVenda.itens.map(item => {
    const produto = porId.get(item.produto.toString());
    if (produto.exigeReceita && item.receitaApresentada !== true) {
      throw new Error(`Confirme que há receita para ${produto.nome} antes de finalizar.`);
    }
    if (!preVenda.estoqueReservado && item.quantidade > produto.estoque) {
      throw new Error(`Estoque insuficiente para ${produto.nome}.`);
    }
    return {
      produto: produto._id,
      codigoProduto: produto.codigo || '',
      nomeProduto: produto.nome,
      quantidade: item.quantidade,
      precoUnitario: item.precoUnitario,
      subtotal: item.quantidade * item.precoUnitario,
      unidadeMedida: produto.unidadeMedida,
      exigeReceita: Boolean(produto.exigeReceita),
      receitaApresentada: item.receitaApresentada
    };
  });
  const subtotal = itens.reduce((total, item) => total + item.subtotal, 0);
  const metodos = ['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'fiado'];
  if (!metodos.includes(pagamento?.metodo)) throw new Error('Selecione uma forma de pagamento válida.');
  const pagamentoSeguro = { ...pagamento };
  if (pagamentoSeguro.metodo === 'dinheiro') {
    const recebido = Number(pagamentoSeguro.valorRecebido);
    if (!Number.isFinite(recebido) || recebido < subtotal) {
      throw new Error('O valor recebido é menor que o total da pré-venda.');
    }
    pagamentoSeguro.valorRecebido = recebido;
    pagamentoSeguro.troco = Number((recebido - subtotal).toFixed(2));
  }
  if (pagamentoSeguro.metodo === 'fiado' && !preVenda.cliente) {
    throw new Error('Selecione um cliente para concluir uma venda fiado.');
  }
  const criador = await dbConnection.User.findById(preVenda.criadoPor).select('nome');
  const dadosVenda = {
    preVendaCodigo: codigo,
    cliente: preVenda.cliente,
    nomeCliente: preVenda.nomeCliente,
    vendedor: preVenda.criadoPor.toString(),
    nomeVendedor: criador?.nome || 'Vendedor',
    operadorCaixa: usuario.id,
    itens,
    subtotal,
    total: subtotal,
    pagamento: pagamentoSeguro
  };

  return vendasController.registrarVenda(dadosVenda, {
    estoqueReservado: preVenda.estoqueReservado === true,
    antesCommit: async ({ venda, session }) => {
      const atualizada = await PreVenda.findOneAndUpdate(
        { _id: preVenda._id, status: 'aberta', __v: preVenda.__v },
        {
          $set: { status: 'finalizada', venda: venda._id, finalizadaPor: usuario.id, finalizadaEm: new Date() },
          $inc: { __v: 1 }
        },
        { session, new: true }
      );
      if (!atualizada) throw new Error('Esta pré-venda foi alterada ou finalizada. Reabra antes de cobrar.');
      return { preVendaCodigo: codigo };
    }
  });
}

module.exports = { abrir, listar, salvar, finalizar, cancelar };
