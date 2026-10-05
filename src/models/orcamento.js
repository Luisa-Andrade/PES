const mongoose = require('mongoose');

const ItemOrcamentoSchema = new mongoose.Schema({
  produto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Produto',
    required: true
  },
  codigoProduto: {
    type: String,
    required: true
  },
  nomeProduto: {
    type: String,
    required: true
  },
  quantidade: {
    type: Number,
    required: true,
    min: 0.01
  },
  unidadeMedida: {
    type: String,
    required: true
  },
  precoUnitario: {
    type: Number,
    required: true,
    min: 0
  },
  desconto: {
    type: Number,
    default: 0,
    min: 0
  },
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  observacoes: String
});

const OrcamentoSchema = new mongoose.Schema({
  codigo: {
    type: String,
    required: true,
    unique: true
  },
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: true
  },
  nomeCliente: {
    type: String,
    required: true
  },
  dataOrcamento: {
    type: Date,
    default: Date.now,
    required: true
  },
  validadeOrcamento: {
    type: Date,
    required: true
  },
  vendedor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  nomeVendedor: {
    type: String,
    required: true
  },
  itens: [ItemOrcamentoSchema],
  subtotal: {
    type: Number,
    required: true,
    min: 0
  },
  desconto: {
    type: Number,
    default: 0,
    min: 0
  },
  total: {
    type: Number,
    required: true,
    min: 0
  },
  formaPagamento: {
    type: String,
    enum: ['a_vista', 'cartao', 'boleto', 'transferencia', 'cheque', 'prazo'],
    default: 'a_vista'
  },
  condicoesPagamento: {
    parcelas: {
      type: Number,
      default: 1,
      min: 1
    },
    valorParcela: Number,
    entrada: Number
  },
  temEntrega: {
    type: Boolean,
    default: false
  },
  dadosEntrega: {
    endereco: {
      type: mongoose.Schema.Types.Mixed
    },
    dataEstimada: Date,
    valorFrete: {
      type: Number,
      default: 0
    },
    observacoes: String
  },
  status: {
    type: String,
    enum: ['aberto', 'aprovado', 'recusado', 'convertido', 'vencido'],
    default: 'aberto'
  },
  convertidoVendaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venda'
  },
  observacoes: String
});

// Método para verificar se o orçamento está válido
OrcamentoSchema.methods.estaValido = function() {
  return new Date() <= this.validadeOrcamento;
};

// Método para converter orçamento em venda
OrcamentoSchema.methods.converterParaVenda = async function(vendaId, session = null) {
  this.status = 'convertido';
  this.convertidoVendaId = vendaId;
  
  if (session) {
    await this.save({ session });
  } else {
    await this.save();
  }
};

// Gerar código automático para orçamentos
OrcamentoSchema.pre('save', async function(next) {
  if (!this.isNew) {
    return next();
  }
  
  try {
    const data = new Date();
    const ano = data.getFullYear().toString().substr(-2);
    const mes = (data.getMonth() + 1).toString().padStart(2, '0');
    
    const baseCode = `ORC${ano}${mes}`;
    
    // Encontrar o último código do mês atual
    const ultimoOrcamento = await this.constructor.findOne({
      codigo: new RegExp(`^${baseCode}`)
    }).sort({ codigo: -1 });
    
    let sequencial = 1;
    if (ultimoOrcamento) {
      sequencial = parseInt(ultimoOrcamento.codigo.substr(-3)) + 1;
    }
    
    this.codigo = `${baseCode}${sequencial.toString().padStart(3, '0')}`;
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Orcamento', OrcamentoSchema);
