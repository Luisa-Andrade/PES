/**
 * Script de Diagnóstico de Performance
 * Analisa e reporta métricas de performance do sistema
 */

const dbConnection = require('../db/connection');
const cache = require('../utils/cache');

class PerformanceDiagnostic {
  
  static async run() {
    console.log('\n=== DIAGNÓSTICO DE PERFORMANCE ===\n');
    
    try {
      // Conectar ao banco
      await dbConnection.ensureConnected();
      
      // Testar performance do banco
      await this.testDatabasePerformance();
      
      // Testar cache
      await this.testCachePerformance();
      
      // Analisar índices
      await this.analyzeIndexes();
      
      // Estatísticas gerais
      this.showGeneralStats();
      
    } catch (error) {
      console.error('Erro no diagnóstico:', error);
    } finally {
      process.exit(0);
    }
  }
  
  static async testDatabasePerformance() {
    console.log('📊 TESTE DE PERFORMANCE DO BANCO\n');
    
    const Produto = require('../models/produto');
    const Cliente = require('../models/cliente');
    const Venda = require('../models/venda');
    
    const tests = [
      {
        name: 'Busca simples de produtos',
        test: () => Produto.find({}).limit(10).lean()
      },
      {
        name: 'Busca com filtro de produtos',
        test: () => Produto.find({ ativo: true }).limit(10).lean()
      },
      {
        name: 'Busca textual de produtos',
        test: () => Produto.find({ nome: { $regex: 'a', $options: 'i' } }).limit(10).lean()
      },
      {
        name: 'Contagem de clientes',
        test: () => Cliente.countDocuments({})
      },
      {
        name: 'Vendas recentes',
        test: () => Venda.find({}).sort({ dataVenda: -1 }).limit(5).lean()
      }
    ];
    
    for (const { name, test } of tests) {
      const startTime = Date.now();
      try {
        const result = await test();
        const duration = Date.now() - startTime;
        const status = duration < 100 ? '✅' : duration < 500 ? '⚠️' : '❌';
        
        console.log(`${status} ${name}: ${duration}ms`);
        
        if (Array.isArray(result)) {
          console.log(`   → ${result.length} resultados`);
        }
      } catch (error) {
        console.log(`❌ ${name}: ERRO - ${error.message}`);
      }
    }
    console.log();
  }
  
  static async testCachePerformance() {
    console.log('💾 TESTE DE PERFORMANCE DO CACHE\n');
    
    // Limpar cache para teste
    cache.clear();
    
    const testKey = 'test_performance';
    const testData = { id: 1, name: 'Test Data', data: new Array(1000).fill('x') };
    
    // Teste de escrita
    const writeStart = Date.now();
    cache.set(testKey, testData, 60);
    const writeTime = Date.now() - writeStart;
    
    // Teste de leitura (hit)
    const readStart = Date.now();
    const cachedData = cache.get(testKey);
    const readTime = Date.now() - readStart;
    
    // Teste de leitura (miss)
    const missStart = Date.now();
    const missData = cache.get('nonexistent_key');
    const missTime = Date.now() - missStart;
    
    console.log(`✅ Escrita no cache: ${writeTime}ms`);
    console.log(`✅ Leitura (hit): ${readTime}ms`);
    console.log(`✅ Leitura (miss): ${missTime}ms`);
    console.log(`📊 Dados recuperados: ${cachedData ? 'OK' : 'ERRO'}`);
    
    const stats = cache.getStats();
    console.log(`📈 Estatísticas: ${JSON.stringify(stats, null, 2)}`);
    console.log();
  }
  
  static async analyzeIndexes() {
    console.log('📋 ANÁLISE DE ÍNDICES\n');
    
    const collections = ['users', 'produtos', 'clientes', 'vendas'];
    
    for (const collectionName of collections) {
      try {
        const db = dbConnection.connection.connection.db;
        const indexes = await db.collection(collectionName).indexes();
        
        console.log(`📂 ${collectionName.toUpperCase()}:`);
        indexes.forEach(index => {
          const keys = Object.keys(index.key).join(', ');
          const unique = index.unique ? ' (ÚNICO)' : '';
          const text = index.textIndexVersion ? ' (TEXTO)' : '';
          console.log(`   → ${keys}${unique}${text}`);
        });
        console.log();
      } catch (error) {
        console.log(`❌ Erro ao analisar ${collectionName}: ${error.message}\n`);
      }
    }
  }
  
  static showGeneralStats() {
    console.log('📊 ESTATÍSTICAS GERAIS\n');
    
    // Stats do banco
    const dbStats = dbConnection.getPerformanceStats();
    console.log('🗄️ Banco de Dados:');
    console.log(`   → Modo: ${dbStats.mode}`);
    console.log(`   → Conectado: ${dbStats.connected ? 'SIM' : 'NÃO'}`);
    console.log(`   → Queries: ${dbStats.queryCount}`);
    console.log(`   → Queries/s: ${dbStats.queriesPerSecond}`);
    console.log(`   → Queries lentas: ${dbStats.slowQueries}`);
    console.log(`   → Erros: ${dbStats.errors}`);
    console.log(`   → Uptime: ${dbStats.uptime}s`);
    
    console.log();
    
    // Stats do cache
    const cacheStats = cache.getStats();
    console.log('💾 Cache:');
    console.log(`   → Tamanho: ${cacheStats.size} itens`);
    console.log(`   → Hit rate: ${cacheStats.hitRate}`);
    console.log(`   → Hits: ${cacheStats.hits}`);
    console.log(`   → Misses: ${cacheStats.misses}`);
    console.log(`   → Sets: ${cacheStats.sets}`);
    
    console.log();
    
    // Stats do sistema
    const memory = process.memoryUsage();
    console.log('🖥️ Sistema:');
    console.log(`   → Heap usado: ${Math.round(memory.heapUsed / 1024 / 1024)}MB`);
    console.log(`   → Heap total: ${Math.round(memory.heapTotal / 1024 / 1024)}MB`);
    console.log(`   → RSS: ${Math.round(memory.rss / 1024 / 1024)}MB`);
    console.log(`   → Node.js: ${process.version}`);
    
    console.log('\n=== FIM DO DIAGNÓSTICO ===\n');
  }
}

// Executar diagnóstico se chamado diretamente
if (require.main === module) {
  PerformanceDiagnostic.run();
}

module.exports = PerformanceDiagnostic;