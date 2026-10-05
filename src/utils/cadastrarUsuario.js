/**
 * Script para cadastrar usuários manualmente no banco de dados
 * 
 * Como usar:
 * 1. Abra o terminal na pasta raiz do projeto
 * 2. Execute: node src/utils/cadastrarUsuario.js nome email senha tipo
 * 
 * Exemplo: 
 * node src/utils/cadastrarUsuario.js "Administrador Sistema" admin@sistema.com senhasegura admin
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config/env');

const MONGO_URI = config.DB_LOCAL_URI;

// Modelo de usuário
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
  tipo: { 
    type: String, 
    enum: ['admin', 'usuario'], 
    default: 'usuario' 
  },
  dataCriacao: {
    type: Date,
    default: Date.now
  },
  ativo: {
    type: Boolean,
    default: true
  }
});

// Função principal para cadastrar usuário
async function cadastrarUsuario() {
  try {
    // Verificar se os argumentos necessários foram passados
    const args = process.argv.slice(2);
    
    if (args.length < 3) {
      console.log('\nUso incorreto. Utilize:');
      console.log('node src/utils/cadastrarUsuario.js nome email senha [tipo]\n');
      console.log('Argumentos:');
      console.log('  nome: Nome completo (obrigatório)');
      console.log('  email: Email do usuário (obrigatório)');
      console.log('  senha: Senha do usuário (obrigatório)');
      console.log('  tipo: Tipo do usuário - admin ou usuario (opcional, padrão: usuario)\n');
      console.log('Exemplo:');
      console.log('node src/utils/cadastrarUsuario.js "João Silva" joao@empresa.com minhasenha admin\n');
      process.exit(1);
    }
    
    // Extrair informações dos argumentos
    const [nome, email, senha, tipo] = args;
    
    // Validar tipo de usuário
    const tiposValidos = ['admin', 'usuario'];
    const tipoUsuario = tipo && tiposValidos.includes(tipo) ? tipo : 'usuario';
    
    console.log('Conectando ao MongoDB local...');
    
    // Conectar ao MongoDB - sem opções obsoletas
    await mongoose.connect(MONGO_URI, config.MONGO_OPTIONS);
    
    console.log('Conexão estabelecida com sucesso!');
    
    // Criptografar a senha
    const salt = await bcrypt.genSalt(10);
    const senhaHash = await bcrypt.hash(senha, salt);
    
    // Criar modelo User
    const User = mongoose.model('User', userSchema);
    
    // Verificar se o email já existe
    const emailExistente = await User.findOne({ email });
    
    if (emailExistente) {
      console.error(`\nERRO: Usuário com email '${email}' já existe!\n`);
      await mongoose.disconnect();
      process.exit(1);
    }
    
    // Criar novo usuário
    const novoUsuario = new User({
      nome,
      email,
      senha: senhaHash,
      tipo: tipoUsuario,
      ativo: true
    });
    
    // Salvar no banco de dados
    await novoUsuario.save();
    
    console.log('\nUsuário cadastrado com sucesso!');
    console.log('--------------------------------');
    console.log('Nome:', nome);
    console.log('Email:', email);
    console.log('Tipo:', tipoUsuario);
    console.log('--------------------------------\n');
    
    // Desconectar do banco de dados
    await mongoose.disconnect();
    console.log('Conexão com o banco de dados encerrada.');
    
  } catch (error) {
    console.error('\nERRO ao cadastrar usuário:', error.message);
    console.error('\nDetalhes:', error);
    
    // Desconectar em caso de erro
    try {
      await mongoose.disconnect();
    } catch (e) {
      // Ignorar erros ao desconectar
    }
    
    process.exit(1);
  }
}

// Executar a função principal
cadastrarUsuario();
