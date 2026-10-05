const mongoose = require('mongoose');

const EnderecoSchema = new mongoose.Schema({
  logradouro: {
    type: String,
    required: false
  },
  numero: {
    type: String,
    required: false
  },
  complemento: String,
  bairro: {
    type: String,
    required: false
  },
  cidade: {
    type: String,
    required: false
  },
  estado: {
    type: String,
    required: false
  },
  cep: {
    type: String
  },
  principal: {
    type: Boolean,
    default: true
  }
});

const ClienteSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    trim: true
  },
  tipo: {
    type: String,
    enum: ['pessoa_fisica', 'pessoa_juridica'],
    required: true
  },
  cpfCnpj: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true
  },
  email: {
    type: String,
    trim: true
  },
  telefone: {
    type: String,
    trim: true
  },
  celular: {
    type: String,
    trim: true
  },
  enderecos: [EnderecoSchema],
  observacoes: String,
  
  // Campos para controle de fiado
  limiteCredito: {
    type: Number,
    default: 0
  },
  saldoDevedor: {
    type: Number,
    default: 0
  },
  creditoAdicional: {
    type: Number,
    default: 0,
    comment: 'Crédito extra adicionado (devoluções, ajustes positivos, etc.)'
  },
  statusCredito: {
    type: String,
    enum: ['ativo', 'bloqueado', 'analise'],
    default: 'analise'
  },
  
  // Dados adicionais úteis
  dataNascimento: Date,
  totalCompras: {
    type: Number,
    default: 0
  },
  ultimaCompra: {
    type: Date
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
  timestamps: { 
    createdAt: 'criadoEm',
    updatedAt: 'atualizadoEm'
  }
});

// Middleware para atualizar data de modificação
ClienteSchema.pre('save', function(next) {
  this.atualizadoEm = new Date();
  
  // Formatar e padronizar campos antes de salvar
  if (this.cpfCnpj) {
    // Remove caracteres não numéricos para armazenar apenas números
    this.cpfCnpj = this.cpfCnpj.replace(/\D/g, '');
  }
  
  // Padroniza telefones removendo formatação
  if (this.telefone) this.telefone = this.telefone.replace(/\D/g, '');
  if (this.celular) this.celular = this.celular.replace(/\D/g, '');
  
  // Padroniza email para lowercase
  if (this.email) this.email = this.email.toLowerCase().trim();
  
  next();
});

// Método para verificar disponibilidade de crédito
ClienteSchema.methods.possuiCreditoDisponivel = function(valorCompra) {
  // Se o crédito estiver bloqueado, não permite fiado
  if (this.statusCredito !== 'ativo') {
    console.log(`[CREDITO] Cliente com status ${this.statusCredito} - crédito não ativo`);
    return false;
  }
  
  // Garantir que valores são numéricos
  const valorCompraNum = parseFloat(valorCompra) || 0;
  const saldoDevedorNum = parseFloat(this.saldoDevedor) || 0;
  const limiteCreditoNum = parseFloat(this.limiteCredito) || 0;
  const creditoAdicionalNum = parseFloat(this.creditoAdicional) || 0;
  
  // Verifica se o valor da compra mais o saldo devedor atual não ultrapassam o limite + crédito adicional
  const creditoDisponivel = (limiteCreditoNum + creditoAdicionalNum) - saldoDevedorNum;
  const possuiCredito = valorCompraNum <= creditoDisponivel;
  
  console.log(`[CREDITO] Verificação: ${valorCompraNum} <= ${creditoDisponivel} (limite: ${limiteCreditoNum} + adicional: ${creditoAdicionalNum} - devedor: ${saldoDevedorNum}) = ${possuiCredito}`);
  
  return possuiCredito;
};

// Método para registrar venda fiado
ClienteSchema.methods.registrarFiado = async function(valor, session = null) {
  const valorNum = parseFloat(valor) || 0;
  this.saldoDevedor = (parseFloat(this.saldoDevedor) || 0) + valorNum;
  this.totalCompras = (parseFloat(this.totalCompras) || 0) + valorNum;
  this.ultimaCompra = new Date();
  
  console.log(`[CREDITO] Registrando fiado de R$ ${valorNum.toFixed(2)} para cliente ${this.nome}`);
  console.log(`[CREDITO] Novo saldo devedor: R$ ${this.saldoDevedor.toFixed(2)}`);
  
  if (session) {
    await this.save({ session });
  } else {
    await this.save();
  }
};

// Método para registrar pagamento de fiado
ClienteSchema.methods.registrarPagamento = async function(valor, session = null) {
  let valorNum = parseFloat(valor) || 0;
  const saldoAtual = parseFloat(this.saldoDevedor) || 0;
  
  if (valorNum > saldoAtual) {
    valorNum = saldoAtual;
  }
  
  this.saldoDevedor = saldoAtual - valorNum;
  
  console.log(`[CREDITO] Registrando pagamento de R$ ${valorNum.toFixed(2)} para cliente ${this.nome}`);
  console.log(`[CREDITO] Novo saldo devedor: R$ ${this.saldoDevedor.toFixed(2)}`);
  
  if (session) {
    await this.save({ session });
  } else {
    await this.save();
  }
  
  return valorNum;
};

// Método para adicionar crédito extra (devoluções, ajustes positivos)
ClienteSchema.methods.adicionarCreditoExtra = async function(valor, motivo = 'Ajuste de crédito', session = null) {
  const valorNum = parseFloat(valor) || 0;
  
  if (valorNum <= 0) {
    throw new Error('Valor deve ser positivo');
  }
  
  this.creditoAdicional = (parseFloat(this.creditoAdicional) || 0) + valorNum;
  
  console.log(`[CREDITO] Adicionando crédito extra de R$ ${valorNum.toFixed(2)} para cliente ${this.nome}`);
  console.log(`[CREDITO] Motivo: ${motivo}`);
  console.log(`[CREDITO] Novo crédito adicional: R$ ${this.creditoAdicional.toFixed(2)}`);
  
  if (session) {
    await this.save({ session });
  } else {
    await this.save();
  }
  
  return valorNum;
};

module.exports = mongoose.model('Cliente', ClienteSchema);
