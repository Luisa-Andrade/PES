const mongoose = require('mongoose');

const EntregaSchema = new mongoose.Schema({
  tipoEntrega: {
    type: String,
    enum: ['AGENDADA', 'DELIVERY_ONLINE'],
    default: 'AGENDADA',
    index: true
  },
  codigo: {
    type: String,
    unique: true,
    sparse: true
  },
  venda: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venda'
  },
  orcamento: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Orcamento'
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
  endereco: {
    logradouro: {
      type: String,
      required: true
    },
    numero: {
      type: String,
      required: true
    },
    complemento: String,
    bairro: {
      type: String,
      required: true
    },
    cidade: {
      type: String,
      required: true
    },
    estado: {
      type: String,
      required: true
    },
    cep: {
      type: String,
      required: true
    },
    pontoReferencia: String
  },
  dataAgendamento: {
    type: Date,
    required: true
  },
  periodoEntrega: {
    type: String,
    enum: ['manha', 'tarde', 'comercial', 'especifico'],
    default: 'comercial'
  },
  horarioEspecifico: {
    hora: Number,
    minuto: Number
  },
  itens: [{
    produto: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Produto'
    },
    codigoProduto: String,
    nomeProduto: String,
    quantidade: Number,
    valorUnitario: Number,
    subtotal: Number
  }],
  veiculo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Veiculo'
  },
  motorista: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Funcionario'
  },
  ajudante: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Funcionario'
  },
  status: {
    type: String,
    enum: [
      'agendada', 'em_separacao', 'separada', 'em_transito', 'entregue', 'cancelada', 'devolvida',
      'NOVO', 'PREPARANDO', 'PRONTO_PARA_ENTREGA', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'CANCELADO'
    ],
    default: 'agendada',
    index: true
  },
  valorFrete: {
    type: Number,
    default: 0
  },
  distanciaKm: {
    type: Number,
    min: 0,
    default: 0
  },
  subtotal: {
    type: Number,
    min: 0,
    default: 0
  },
  total: {
    type: Number,
    min: 0,
    default: 0
  },
  telefone: String,
  motoboy: {
    type: String,
    trim: true,
    default: ''
  },
  formaPagamento: {
    type: String,
    enum: ['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'fiado']
  },
  trocoPara: Number,
  observacoes: String,
  historicoStatus: [{
    status: {
      type: String,
      enum: [
        'agendada', 'em_separacao', 'separada', 'em_transito', 'entregue', 'cancelada', 'devolvida',
        'NOVO', 'PREPARANDO', 'PRONTO_PARA_ENTREGA', 'SAIU_PARA_ENTREGA', 'ENTREGUE', 'CANCELADO'
      ]
    },
    data: {
      type: Date,
      default: Date.now
    },
    usuario: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    observacao: String
  }],
  comprovante: {
    assinatura: String,
    nome: String,
    cpf: String,
    dataCriacao: Date,
    foto: String
  },
  criadoEm: {
    type: Date,
    default: Date.now
  },
  atualizadoEm: {
    type: Date,
    default: Date.now
  }
});

// Middleware para atualizar a data de modificação
EntregaSchema.pre('save', function(next) {
  this.atualizadoEm = Date.now();
  next();
});

// Middleware para registrar mudanças de status
EntregaSchema.pre('save', function(next) {
  if (this.isModified('status')) {
    // Adiciona um novo registro ao histórico de status
    this.historicoStatus.push({
      status: this.status,
      data: new Date(),
      usuario: this.usuario || null,
      observacao: this.statusObservacao || null
    });
    
    // Limpa os campos temporários
    this.usuario = undefined;
    this.statusObservacao = undefined;
  }
  next();
});

// Método para atualizar status com usuário e observação
EntregaSchema.methods.atualizarStatus = function(status, usuario, observacao) {
  this.status = status;
  this.usuario = usuario;
  this.statusObservacao = observacao;
};

// Gerar código automático para entregas
EntregaSchema.pre('save', async function(next) {
  if (!this.isNew || this.codigo) {
    return next();
  }
  
  try {
    const data = new Date();
    const ano = data.getFullYear().toString().substr(-2);
    const mes = (data.getMonth() + 1).toString().padStart(2, '0');
    
    const baseCode = `ENT${ano}${mes}`;
    
    // Encontrar o último código do mês atual
    const ultimaEntrega = await this.constructor.findOne({
      codigo: new RegExp(`^${baseCode}`)
    }).sort({ codigo: -1 });
    
    let sequencial = 1;
    if (ultimaEntrega) {
      sequencial = parseInt(ultimaEntrega.codigo.substr(-3)) + 1;
    }
    
    this.codigo = `${baseCode}${sequencial.toString().padStart(3, '0')}`;
    next();
  } catch (error) {
    next(error);
  }
});

module.exports = mongoose.model('Entrega', EntregaSchema);
