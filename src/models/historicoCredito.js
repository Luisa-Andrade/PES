const mongoose = require('mongoose');

const HistoricoCreditoSchema = new mongoose.Schema({
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente',
    required: true,
    index: true
  },
  nomeCliente: {
    type: String,
    required: true
  },
  tipo: {
    type: String,
    enum: ['compra_fiado', 'pagamento', 'ajuste_credito', 'limite_alterado', 'status_alterado'],
    required: true
  },
  descricao: {
    type: String,
    required: true
  },
  valor: {
    type: Number,
    default: 0
  },
  saldoAnterior: {
    type: Number,
    default: 0
  },
  saldoNovo: {
    type: Number,
    default: 0
  },
  venda: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Venda'
  },
  codigoVenda: {
    type: String
  },
  usuario: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  nomeUsuario: {
    type: String
  },
  observacoes: {
    type: String
  },
  dataRegistro: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Índice composto para buscas eficientes
HistoricoCreditoSchema.index({ cliente: 1, dataRegistro: -1 });
HistoricoCreditoSchema.index({ tipo: 1, dataRegistro: -1 });

module.exports = mongoose.model('HistoricoCredito', HistoricoCreditoSchema);
