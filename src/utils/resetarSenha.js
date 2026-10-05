/**
 * Script para resetar a senha de um usuário no banco de dados
 * 
 * Como usar:
 * 1. Abra o terminal na pasta raiz do projeto
 * 2. Execute: node src/utils/resetarSenha.js username novaSenha
 */

const mongoose = require('mongoose');
const User = require('../models/user');
const config = require('../config/env');

// String de conexão com o MongoDB
const MONGO_URI = config.DB_LOCAL_URI;

async function resetarSenha() {
  try {
    // Verificar se os argumentos necessários foram passados
    const args = process.argv.slice(2);
    
    if (args.length !== 2) {
      console.log('\nUso incorreto. Utilize:');
      console.log('node src/utils/resetarSenha.js username novaSenha\n');
      console.log('Argumentos:');
      console.log('  username: Nome de usuário (obrigatório)');
      console.log('  novaSenha: Nova senha do usuário (obrigatório)\n');
      console.log('Exemplo:');
      console.log('node src/utils/resetarSenha.js admin123 novaSenha123\n');
      process.exit(1);
    }
    
    const [username, novaSenha] = args;
    
    console.log('Conectando ao banco de dados...');
    
    // Conectar ao MongoDB
    await mongoose.connect(MONGO_URI, config.MONGO_OPTIONS);
    
    console.log('Conexão estabelecida com sucesso!');
    
    // Buscar o usuário pelo username
    const usuario = await User.findOne({ username });
    
    if (!usuario) {
      console.error(`\nERRO: Usuário com username '${username}' não encontrado!\n`);
      await mongoose.disconnect();
      process.exit(1);
    }
    
    // Atualizar a senha
    usuario.password = novaSenha;
    await usuario.save(); // O hook pre-save vai criptografar a senha automaticamente
    
    console.log(`\nSenha do usuário '${username}' resetada com sucesso!\n`);
    
    // Desconectar do banco de dados
    await mongoose.disconnect();
    console.log('Conexão com o banco de dados encerrada.');
    
  } catch (error) {
    console.error('\nERRO ao resetar senha:', error.message);
    
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
resetarSenha();
