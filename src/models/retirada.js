const mongoose = require('mongoose');

const retiradaSchema = new mongoose.Schema({
  dataRetirada: {
    type: Date,
    required: true
  },
  horaRetirada: {
    type: String,
    required: true
  },
  valor: {
    type: Number,
    required: true,
    min: 0
  },
  responsavel: {
    type: String,
    required: true
  },
  motivo: {
    type: String,
    default: 'Não especificado'
  },
  observacoes: {
    type: String,
    default: ''
  },
  usuarioId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  dataCriacao: {
    type: Date,
    default: Date.now
  },
  dataAtualizacao: {
    type: Date,
    default: Date.now
  },
  ativo: {
    type: Boolean,
    default: true
  }
});

// Índices para melhor performance
retiradaSchema.index({ dataCriacao: -1 });
retiradaSchema.index({ dataRetirada: -1 });
retiradaSchema.index({ usuarioId: 1 });
retiradaSchema.index({ ativo: 1 });

// Middleware para atualizar dataAtualizacao antes de salvar
retiradaSchema.pre('save', function(next) {
  this.dataAtualizacao = Date.now();
  next();
});

module.exports = mongoose.model('Retirada', retiradaSchema);
