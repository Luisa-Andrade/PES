const mongoose = require('mongoose');
const config = require('../config/env');

// URIs de conexão
const MONGO_ATLAS_URI = config.DB_ATLAS_URI;
const MONGO_LOCAL_URI = config.DB_LOCAL_URI;

class DatabaseConnection {
  constructor() {
    this.connected = false;
    this.connection = null;
    this.disconnecting = false;
    this.reconnecting = false;
    this.useAtlas = false; // O banco local é o padrão deste aplicativo.
    this.performanceStats = {
      connectionTime: 0,
      queryCount: 0,
      slowQueries: 0,
      errors: 0
    };
    
    this.connectionString = MONGO_LOCAL_URI;
    
    // Configurar eventos para reconexão automática e monitoramento
    this.setupConnectionEvents();
  }

  setConnectionString(connectionString) {
    if (connectionString) {
      this.connectionString = connectionString;
      console.log('String de conexão configurada.');
    }
  }

  setupConnectionEvents() {
    // Eventos de conexão básicos
    mongoose.connection.on('connected', () => {
      console.log('✓ MongoDB conectado com sucesso');
      this.connected = true;
      this.performanceStats.connectionTime = Date.now();
    });
    
    mongoose.connection.on('error', (err) => {
      console.error('✗ Erro na conexão MongoDB:', err.message);
      this.performanceStats.errors++;
    });
    
    mongoose.connection.on('disconnected', () => {
      const shouldReconnect = this.connected && !this.disconnecting;
      this.connected = false;
      if (shouldReconnect) {
        console.log('⚠ MongoDB desconectado. Tentando reconectar...');
        void this.handleReconnection();
      }
    });
  }
  
  async handleReconnection() {
    if (this.reconnecting) return;
    this.reconnecting = true;
    let attempts = 0;
    const maxAttempts = 5;
    try {
      while (attempts < maxAttempts && !this.connected && !this.disconnecting) {
        attempts++;
        console.log(`Tentativa de reconexão ${attempts}/${maxAttempts}`);
        try {
          await this.connect();
        } catch (error) {
          console.error(`Falha na reconexão: ${error.message}`);
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 5000 * attempts));
          }
        }
      }
      if (!this.connected && !this.disconnecting) {
        console.error('Falha ao reconectar após múltiplas tentativas');
      }
    } finally {
      this.reconnecting = false;
    }
  }

  // Método para conectar ao banco de dados
  async connect() {
    if (this.connected) return this.connection;
    
    try {
      console.log('Conectando ao MongoDB...');
      
      this.connectionString = this.useAtlas ? MONGO_ATLAS_URI : MONGO_LOCAL_URI;
      if (!this.connectionString) {
        throw new Error('Configure DB_ATLAS_URI para usar o MongoDB Atlas.');
      }
      this.connection = await mongoose.connect(this.connectionString, config.MONGO_OPTIONS);
      console.log(`Conectado ao ${this.getConnectionMode()} com sucesso!`);
      this.connected = true;
      return this.connection;
    } catch (error) {
      console.error(`Falha ao conectar ao MongoDB: ${error.message}`);
      this.connected = false;
      throw error;
    }
  }
  
  // Trocar entre conexão local e Atlas
  toggleConnectionMode() {
    if (!this.useAtlas && !MONGO_ATLAS_URI) {
      throw new Error('Configure DB_ATLAS_URI antes de alternar para o MongoDB Atlas.');
    }
    this.useAtlas = !this.useAtlas;
    const mode = this.useAtlas ? 'Atlas' : 'Local';
    console.log(`Modo de conexão alterado para: MongoDB ${mode}`);
  }
  
  // Método para desconectar do banco de dados
  async disconnect() {
    if (!this.connected) return;
    
    this.disconnecting = true;
    try {
      await mongoose.disconnect();
      this.connected = false;
      console.log('Desconectado do MongoDB');
    } catch (error) {
      console.error('Erro ao desconectar do MongoDB:', error);
    } finally {
      this.disconnecting = false;
    }
  }
  
  // Método para garantir que a conexão está estabelecida
  async ensureConnected() {
    if (!this.connected) {
      return this.connect();
    }
    return this.connection;
  }
  
  // Verificar status da conexão
  isConnected() {
    return this.connected;
  }
  
  // Obter o modo de conexão atual
  getConnectionMode() {
    return this.useAtlas ? 'MongoDB Atlas' : 'MongoDB Local';
  }
  
  // Obter estatísticas de performance
  getPerformanceStats() {
    const uptime = this.connected ? Date.now() - this.performanceStats.connectionTime : 0;
    
    return {
      ...this.performanceStats,
      uptime: Math.floor(uptime / 1000), // em segundos
      connected: this.connected,
      mode: this.getConnectionMode(),
      queriesPerSecond: uptime > 0 ? (this.performanceStats.queryCount / (uptime / 1000)).toFixed(2) : 0
    };
  }
  
  // Reset das estatísticas
  resetPerformanceStats() {
    this.performanceStats = {
      connectionTime: Date.now(),
      queryCount: 0,
      slowQueries: 0,
      errors: 0
    };
  }
}

// Exportar a instância da conexão
const dbConnection = new DatabaseConnection();

// Importar o modelo User
const User = require('../models/user');

// Função para inicializar usuários padrão
dbConnection.inicializarUsuarios = async function() {
  try {
    await this.ensureConnected();
    
    // Verificar se já existem usuários no banco
    const count = await User.countDocuments();
    
    // Se não existirem usuários, criar os usuários padrão
    if (count === 0) {
      console.log('Nenhum usuário encontrado. Criando usuários padrão...');
      
      // Criar usuário administrador
      const admin = new User({
        nome: 'FarmaVida Admin',
        email: 'admin@pdv.com',
        senha: config.DEFAULT_ADMIN_PASSWORD,
        tipo: 'admin'
      });
      
      // Criar usuário comum (vendedor)
      const vendedor = new User({
        nome: 'FarmaVida Vendedor',
        email: 'vendedor@pdv.com',
        senha: config.DEFAULT_USER_PASSWORD,
        tipo: 'usuario'
      });
      
      // Salvar os usuários no banco
      await admin.save();
      await vendedor.save();
      
      console.log('Usuários padrão criados com sucesso!');
    } else {
      console.log('Usuários já existem no banco de dados.');
    }
  } catch (error) {
    console.error('Erro ao inicializar usuários padrão:', error);
  }
};

// Adicionar o modelo User à instância de conexão
dbConnection.User = User;

module.exports = dbConnection;
