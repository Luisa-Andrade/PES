const path = require('path');
const fs = require('fs');
const os = require('os');
const config = require('../config/env');

class FilePathManager {
  constructor() {
    this.basePath = config.PDF_SAVE_PATH || path.join(os.homedir(), 'Documents', 'FarmaVida');
  }

  // Obter caminho para salvar PDFs das notas fiscais
  getPDFPath(filename = null) {
    const pdfDir = path.join(this.basePath, 'Notas-Fiscais');
    
    // Garantir que o diretório existe
    this.ensureDirectoryExists(pdfDir);
    
    if (filename) {
      return path.join(pdfDir, filename);
    }
    return pdfDir;
  }

  // Obter caminho para backups
  getBackupPath(filename = null) {
    const backupDir = path.join(this.basePath, 'Backups');
    
    // Garantir que o diretório existe
    this.ensureDirectoryExists(backupDir);
    
    if (filename) {
      return path.join(backupDir, filename);
    }
    return backupDir;
  }

  // Obter caminho para relatórios
  getReportPath(filename = null) {
    const reportDir = path.join(this.basePath, 'Relatorios');
    
    // Garantir que o diretório existe
    this.ensureDirectoryExists(reportDir);
    
    if (filename) {
      return path.join(reportDir, filename);
    }
    return reportDir;
  }

  // Garantir que um diretório existe
  ensureDirectoryExists(dirPath) {
    try {
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Diretório criado: ${dirPath}`);
      }
      return true;
    } catch (error) {
      console.error(`Erro ao criar diretório ${dirPath}:`, error);
      return false;
    }
  }

  // Gerar nome único para arquivo
  generateUniqueFileName(prefix = 'arquivo', extension = '.pdf') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${prefix}-${timestamp}${extension}`;
  }

  // Verificar se um arquivo existe
  fileExists(filePath) {
    return fs.existsSync(filePath);
  }

  // Obter informações de um arquivo
  getFileStats(filePath) {
    try {
      return fs.statSync(filePath);
    } catch (error) {
      return null;
    }
  }
}

module.exports = new FilePathManager();
