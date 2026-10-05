const mongoose = require('mongoose');

const ProdutoSchema = new mongoose.Schema({
  codigo: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  nome: {
    type: String,
    required: true,
    trim: true
  },
  descricao: {
    type: String,
    default: '',
    trim: true
  },
  categoria: {
    type: String,
    default: 'Outros',
    trim: true
  },
  unidadeMedida: {
    type: String,
    enum: ['un', 'cx', 'fr', 'bl', 'tb', 'pc', 'kg', 'lt', 'mt', 'm²', 'm³'],
    default: 'un'
  },
  preco: {
    type: Number,
    min: 0,
    default: 0
  },
  precoVenda: {
    type: Number,
    min: 0,
    default: function() {
      return this.preco; // Valor padrão igual ao preço de compra
    }
  },
  estoque: {
    type: Number,
    default: 0,
    min: 0
  },
  estoqueMinimo: {
    type: Number,
    default: 10,
    min: 0
  },
  marca: {
    type: String,
    trim: true
  },
  codigoBarras: {
    type: String,
    trim: true
  },
  exigeReceita: {
    type: Boolean,
    default: false
  },
  ativo: {
    type: Boolean,
    default: true
  },
  criadoEm: {
    type: Date,
    default: Date.now
  },
  atualizadoEm: {
    type: Date,
    default: Date.now
  }
}, {
  versionKey: false, // Remove o campo __v
  toJSON: {
    transform: function(doc, ret) {
      ret.id = ret._id.toString();
      delete ret.__v;
    }
  }
});

// Middleware para atualizar a data de modificação
ProdutoSchema.pre('save', function(next) {
  this.atualizadoEm = new Date();
  next();
});

// Método para verificar se o estoque está baixo
ProdutoSchema.methods.estoqueEstaBaixo = function() {
  return this.estoque <= this.estoqueMinimo;
};

module.exports = mongoose.model('Produto', ProdutoSchema);
