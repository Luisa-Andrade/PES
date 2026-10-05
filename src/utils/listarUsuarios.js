/**
 * Script para listar todos os usuários cadastrados no banco de dados
 * 
 * Como usar:
 * 1. Abra o terminal na pasta raiz do projeto
 * 2. Execute: node src/utils/listarUsuarios.js
 */

const mongoose = require('mongoose');
const User = require('../models/user');
const config = require('../config/env');

// String de conexão com o MongoDB
const MONGO_URI = config.DB_LOCAL_URI;

async function listarUsuarios() {
  try {
    console.log('Conectando ao banco de dados...');
    
    // Conectar ao MongoDB
    await mongoose.connect(MONGO_URI, config.MONGO_OPTIONS);
    
    console.log('Conexão estabelecida com sucesso!');
    
    // Buscar todos os usuários (excluindo o campo password)
    const usuarios = await User.find({}, { senha: 0 }).sort({ nome: 1 });
    
    console.log('\n=== USUÁRIOS CADASTRADOS ===\n');
    
    if (usuarios.length === 0) {
      console.log('Nenhum usuário cadastrado no banco de dados.');
    } else {
      console.log(`Total de usuários: ${usuarios.length}\n`);
      
      // Exibir informações de cada usuário
      usuarios.forEach((usuario, index) => {
        console.log(`Usuário #${index + 1}:`);
        console.log(`Username: ${usuario.username}`);
        console.log(`Nome: ${usuario.nome}`);
        console.log(`Email: ${usuario.email || 'Não informado'}`);
        console.log(`Função: ${usuario.role}`);
        console.log(`Status: ${usuario.ativo ? 'Ativo' : 'Inativo'}`);
        console.log(`Último acesso: ${usuario.ultimoAcesso ? usuario.ultimoAcesso.toLocaleString() : 'Nunca acessou'}`);
        console.log(`Criado em: ${usuario.criadoEm.toLocaleString()}`);
        console.log('--------------------------\n');
      });
    }
    
    // Desconectar do banco de dados
    await mongoose.disconnect();
    console.log('Conexão com o banco de dados encerrada.');
    
  } catch (error) {
    console.error('\nERRO ao listar usuários:', error.message);
    
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
listarUsuarios();
