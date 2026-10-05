const mongoose = require('mongoose');
const dbConnection = require('../db/connection');
const Produto = require('../models/produto');

// Lista de produtos separados por vírgula
// ADICIONE OS NOMES DOS PRODUTOS AQUI:
const nomesProdutos = `
Dipirona 500mg, Paracetamol 750mg, Soro Fisiológico, Álcool 70%, Protetor Solar, Shampoo, Curativo Adesivo
`;

async function cadastrarProdutosEmLote() {
  try {
    console.log('Conectando ao banco de dados...');
    await dbConnection.ensureConnected();
    
    // Processar a lista de nomes
    const produtos = nomesProdutos
      .split(',')
      .map(nome => nome.trim())
      .filter(nome => nome.length > 0);
    
    console.log(`\nTotal de produtos a cadastrar: ${produtos.length}\n`);
    
    let cadastrados = 0;
    let erros = 0;
    
    for (const nomeProduto of produtos) {
      try {
        // Verificar se já existe produto com esse nome (comparação direta, case-insensitive)
        const produtoExiste = await Produto.findOne({ 
          nome: { $regex: new RegExp(`^${nomeProduto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
        });
        
        if (produtoExiste) {
          console.log(`⚠️  Produto já existe: ${nomeProduto}`);
          continue;
        }
        
        // Criar novo produto apenas com o nome
        const novoProduto = new Produto({
          nome: nomeProduto,
          categoria: 'Outros',
          unidadeMedida: 'un',
          preco: 0,
          precoVenda: 0,
          estoque: 0,
          estoqueMinimo: 10,
          ativo: true
        });
        
        await novoProduto.save();
        cadastrados++;
        console.log(`✅ Cadastrado: ${nomeProduto}`);
        
      } catch (error) {
        erros++;
        console.error(`❌ Erro ao cadastrar "${nomeProduto}":`, error.message);
      }
    }
    
    console.log('\n=== RESUMO ===');
    console.log(`Total processado: ${produtos.length}`);
    console.log(`Cadastrados com sucesso: ${cadastrados}`);
    console.log(`Erros: ${erros}`);
    console.log(`Já existentes: ${produtos.length - cadastrados - erros}`);
    
  } catch (error) {
    console.error('Erro geral:', error);
  } finally {
    // Fechar conexão com o banco
    await mongoose.connection.close();
    console.log('\nConexão com banco de dados fechada.');
    process.exit(0);
  }
}

// Executar o script
console.log('=== CADASTRO EM LOTE DE PRODUTOS ===\n');
cadastrarProdutosEmLote();
