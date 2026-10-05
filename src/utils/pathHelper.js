/**
 * Utilitário para ajudar com caminhos seguros em aplicações Electron
 * Resolve problemas comuns de permissão em diferentes plataformas
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Tentar importar o módulo electron com segurança
let electron;
try {
  electron = require('electron');
} catch (err) {
  console.warn('Electron não disponível:', err.message);
  electron = null;
}

/**
 * Determina um diretório seguro para escrita na aplicação
 * @param {string} appName - Nome da pasta a ser criada
 * @param {string} subDir - Subdiretório opcional (ex: 'logs', 'data')
 * @returns {string} Caminho do diretório seguro para escrita
 */
function getSafeDirectory(appName, subDir = '') {
  const possiblePaths = [];
  
  // Se estamos em um ambiente Electron, tente usar os diretórios padrão do app
  if (electron) {
    const app = electron.app || (electron.remote ? electron.remote.app : null);
    if (app && typeof app.getPath === 'function') {
      try {
        // userData é o local mais apropriado para dados de aplicação persistentes
        possiblePaths.push(path.join(app.getPath('userData'), subDir));
      } catch (err) {
        console.warn('Não foi possível obter caminho userData do Electron:', err.message);
      }
    }
  }
  
  // Diretório dentro do diretório atual da aplicação (alta chance de sucesso)
  possiblePaths.push(path.join(process.cwd(), 'app-data', subDir));
  
  // Diretório temporário do sistema
  possiblePaths.push(path.join(os.tmpdir(), appName, subDir));
  
  // Diretório relativo à aplicação
  possiblePaths.push(path.join(__dirname, '..', '..', 'app-data', subDir));
  
  // Diretório do usuário (pode ter problemas de permissão)
  possiblePaths.push(path.join(os.homedir(), appName, subDir));
  
  // Testar cada caminho possível
  for (let dir of possiblePaths) {
    try {
      // Limpar o caminho
      dir = dir.trim();
      if (!dir || dir === '/' || dir === '\\') continue;
      
      // Criar diretórios recursivamente
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      // Testar escrita
      const testFile = path.join(dir, '.write_test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile); // Remove arquivo de teste
      
      return dir;
    } catch (err) {
      console.warn(`Não foi possível usar diretório: ${dir}`, err.message);
    }
  }
  
  // Se tudo falhar, retorne o diretório temporário (deve ser gravável)
  console.warn(`Usando diretório temporário padrão`);
  return os.tmpdir();
}

/**
 * Verifica se um diretório permite escrita
 * @param {string} dirPath - Caminho do diretório a verificar
 * @returns {boolean} true se o diretório pode ser escrito
 */
function canWriteToDirectory(dirPath) {
  try {
    // Verificar se existe
    if (!fs.existsSync(dirPath)) {
      return false;
    }
    
    // Testar escrita
    const testFile = path.join(dirPath, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile); // Remove arquivo de teste
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  getSafeDirectory,
  canWriteToDirectory
};
