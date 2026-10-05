const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  nome: { 
    type: String, 
    required: true 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true 
  },
  senha: { 
    type: String, 
    required: true 
  },
  dataCriacao: {
    type: Date,
    default: Date.now
  },
  ultimoAcesso: {
    type: Date
  },
  ativo: {
    type: Boolean,
    default: true
  },
  tipo: {
    type: String,
    enum: ['admin', 'usuario', 'vendedor_loja', 'vendedor_balcao', 'caixa', 'gerencia'],
    default: 'vendedor_balcao'
  }
});

// Criptografa a senha antes de salvar
userSchema.pre('save', async function(next) {
  if (!this.isModified('senha')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.senha = await bcrypt.hash(this.senha, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// Método para comparar senha
userSchema.methods.compararSenha = function(senha) {
  return bcrypt.compare(senha, this.senha);
};

module.exports = mongoose.model('User', userSchema);
