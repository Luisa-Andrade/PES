/**
 * Utilitário para log especializado em operações de crédito
 * Facilita o diagnóstico de problemas específicos de crédito
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const pathHelper = require('./pathHelper');

class CreditoLogger {
  constructor() {
    // Inicializar variáveis
    this.canWriteToFile = false;
    this.logDir = '';
    this.logFile = '';
    
    try {
      // Criar pasta de logs se não existir - com tratamento de erro
      this.initLogDirectory();
      
      // Definir o caminho do arquivo de log
      this.logFile = path.join(this.logDir, `credito-${this.getFormattedDate()}.log`);
      
      // Verificar se conseguimos escrever no arquivo
      this.checkFileAccess();
      
      this.init();
    } catch (err) {
      console.error('Erro ao inicializar logger de crédito:', err);
      // Continua funcionando apenas com logs no console
      this.canWriteToFile = false;
    }
  }
  
  // Verificar se conseguimos escrever no arquivo de log
  checkFileAccess() {
    try {
      // Tentar escrever um teste no arquivo
      fs.appendFileSync(this.logFile, '');
      this.canWriteToFile = true;
    } catch (err) {
      console.warn(`Não foi possível escrever no arquivo de log: ${this.logFile}`, err.message);
      this.canWriteToFile = false;
    }
  }  // Inicializar o diretório de logs com tratativas de permissão usando o pathHelper
  initLogDirectory() {
    try {
      // Obter um diretório seguro para escrita usando nosso utilitário
      this.logDir = pathHelper.getSafeDirectory('FarmaVidaPDV', 'logs');
      console.log(`Diretório de logs criado com sucesso: ${this.logDir}`);
    } catch (err) {
      // Se falhar, usar diretório temporário
      this.logDir = path.join(os.tmpdir(), 'FarmaVidaPDV-temp-logs');
      console.warn(`Usando diretório temporário para logs: ${this.logDir}`, err.message);
      
      // Tentar criar o diretório temporário
      try {
        if (!fs.existsSync(this.logDir)) {
          fs.mkdirSync(this.logDir, { recursive: true });
        }
      } catch (e) {
        // Se nem isso funcionar, usar o diretório atual
        this.logDir = process.cwd();
        console.error(`Usando diretório atual para logs: ${this.logDir}`);
      }
    }
  }

  // Inicializar o log
  init() {
    try {
      this.log('INFO', '-------------------------------------');
      this.log('INFO', 'Iniciado registro de logs de crédito');
      this.log('INFO', `Data e Hora: ${new Date().toLocaleString('pt-BR')}`);
      this.log('INFO', `Sistema: ${os.type()} ${os.release()}`);
      this.log('INFO', `Diretório de logs: ${this.logDir}`);
      this.log('INFO', '-------------------------------------');
    } catch (err) {
      console.error('Erro ao inicializar log de crédito:', err);
    }
  }
  
  // Obter data formatada para nome de arquivo
  getFormattedDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Formato de timestamp para o log
  getTimestamp() {
    return new Date().toISOString();
  }
  // Método principal de log
  log(level, message, data = null) {
    try {
      const timestamp = this.getTimestamp();
      let logMessage = `[${timestamp}] [${level}] ${message}`;
      
      if (data) {
        if (typeof data === 'object') {
          try {
            // Evitar circular references
            logMessage += '\n' + JSON.stringify(data, this.circularReplacer(), 2);
          } catch (e) {
            logMessage += `\n[Erro ao serializar objeto: ${e.message}]`;
          }
        } else {
          logMessage += `\n${data}`;
        }
      }
      
      logMessage += '\n';
      
      // Adicionar ao arquivo de log apenas se tivermos permissão para escrever
      if (this.canWriteToFile && this.logFile) {
        try {
          fs.appendFileSync(this.logFile, logMessage);
        } catch (fileErr) {
          // Desativar escrita em arquivo após erro
          console.warn(`Erro ao escrever log. Desativando logs em arquivo: ${fileErr.message}`);
          this.canWriteToFile = false;
        }
      }
      
      // Sempre mostrar no console para garantir que o log seja registrado em algum lugar
      console.log(`[CREDITO] ${level}: ${message}`);
      
      return true;
    } catch (err) {
      // Erro crítico - apenas registra no console e continua
      console.error('Erro ao processar log de crédito:', err);
      return false;
    }
  }
  
  // Lidar com referências circulares na serialização
  circularReplacer() {
    const seen = new WeakSet();
    return (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular Reference]";
        }
        seen.add(value);
      }
      return value;
    };
  }
  
  // Logs específicos
  info(message, data = null) {
    return this.log('INFO', message, data);
  }
  
  error(message, data = null) {
    return this.log('ERROR', message, data);
  }
  
  warn(message, data = null) {
    return this.log('WARN', message, data);
  }
  
  debug(message, data = null) {
    return this.log('DEBUG', message, data);
  }
  
  // Log específico para transações
  transaction(clienteId, tipo, valor, detalhes = null) {
    return this.log('TRANSACTION', 
      `Cliente: ${clienteId}, Tipo: ${tipo}, Valor: R$ ${valor.toFixed(2)}`, 
      detalhes);
  }
}

// Exportar uma instância única
module.exports = new CreditoLogger();
