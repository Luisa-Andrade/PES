const mongoose = require('mongoose');

const ItemPreVendaSchema = new mongoose.Schema({
  produto: { type: mongoose.Schema.Types.ObjectId, ref: 'Produto', required: true },
  codigoProduto: String,
  nomeProduto: { type: String, required: true },
  quantidade: { type: Number, required: true, min: 0.01 },
  precoUnitario: { type: Number, required: true, min: 0 },
  unidadeMedida: String,
  exigeReceita: { type: Boolean, default: false },
  receitaApresentada: { type: Boolean, default: null }
}, { _id: false });

const PreVendaSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true, trim: true, uppercase: true },
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente', default: null },
  nomeCliente: { type: String, default: 'Cliente Padrão' },
  itens: [ItemPreVendaSchema],
  status: { type: String, enum: ['aberta', 'finalizada', 'cancelada'], default: 'aberta', index: true },
  // Pré-vendas antigas não tinham reserva; o valor padrão preserva sua baixa na finalização.
  estoqueReservado: { type: Boolean, default: false },
  criadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  atualizadoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  finalizadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  finalizadaEm: Date,
  canceladaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  canceladaEm: Date,
  venda: { type: mongoose.Schema.Types.ObjectId, ref: 'Venda' }
}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('PreVenda', PreVendaSchema);
