const mongoose = require('mongoose');

// Schema para itens da venda
const ItemVendaSchema = new mongoose.Schema({
  produto: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Produto'
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
  precoUnitario: {
    type: Number,
    required: true
  },
  subtotal: {
    type: Number,
    required: true
  },
  unidadeMedida: {
    type: String,
    default: 'un'
  },
  exigeReceita: {
    type: Boolean,
    default: false
  },
  receitaApresentada: {
    type: Boolean,
    default: null
  }
});

// Schema principal da venda
const VendaSchema = new mongoose.Schema({
  codigo: {
    type: String,
    unique: true
  },
  cliente: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Cliente'
  },
  nomeCliente: {
    type: String,
    default: 'Cliente Balcão'
  },
  vendedor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  nomeVendedor: {
    type: String
  },
  operadorCaixa: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  preVendaCodigo: { type: String, index: true },
  dataVenda: {
    type: Date,
    default: Date.now
  },
  itens: [ItemVendaSchema],
  subtotal: {
    type: Number,
    required: true
  },
  desconto: {
    type: Number,
    default: 0
  },
  total: {
    type: Number,
    required: true
  },
  origem: {
    type: String,
    enum: ['BALCAO', 'DELIVERY'],
    default: 'BALCAO',
    index: true
  },
  taxaEntrega: {
    type: Number,
    default: 0,
    min: 0
  },
  pagamento: {
    metodo: {
      type: String,
      enum: ['dinheiro', 'cartao_credito', 'cartao_debito', 'pix', 'fiado'],
      required: true
    },
    parcelas: {
      type: Number,
      default: 1
    },
    valorRecebido: Number,
    troco: Number,
    
    // Dados específicos para fiado
    fiado: {
      dataVencimento: Date,
      status: {
        type: String,
        enum: ['pendente', 'pago', 'atrasado', 'parcial'],
        default: 'pendente'
      },
      valorPago: {
        type: Number,
        default: 0
      },
      historicoPagamentos: [{
        data: {
          type: Date,
          default: Date.now
        },
        valor: Number,
        formaPagamento: String,
        recebidoPor: String
      }]
    }
  },
  status: {
    type: String,
    enum: ['concluida', 'cancelada'],
    default: 'concluida'
  },
  observacoes: String
}, {
  timestamps: {
    createdAt: 'criadoEm',
    updatedAt: 'atualizadoEm'
  }
});

// Middleware para gerar código automático da venda
VendaSchema.pre('save', async function(next) {
  try {
    if (!this.codigo) {
      const data = new Date();
      const ano = data.getFullYear().toString().substr(-2);
      const mes = (data.getMonth() + 1).toString().padStart(2, '0');
      const dia = data.getDate().toString().padStart(2, '0');
      
      const codigoBase = `${ano}${mes}${dia}`;
      
      // Encontrar o último código do dia atual
      const ultimaVenda = await this.constructor.findOne({
        codigo: new RegExp(`^${codigoBase}`)
      }).sort({ codigo: -1 });
      
      let sequencial = 1;
      if (ultimaVenda && ultimaVenda.codigo) {
        const ultimoSequencial = parseInt(ultimaVenda.codigo.substr(6));
        if (!isNaN(ultimoSequencial)) {
          sequencial = ultimoSequencial + 1;
        }
      }
      
      // Gerar o código final com 3 dígitos para o sequencial
      this.codigo = `${codigoBase}${sequencial.toString().padStart(3, '0')}`;
    }
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Venda', VendaSchema);
