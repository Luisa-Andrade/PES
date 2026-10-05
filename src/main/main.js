require('../utils/loadEnv')();

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { fileURLToPath } = require('url');
const dbConnection = require('../db/connection');
const authController = require('../controllers/authController');
const relatoriosController = require('../controllers/relatoriosController');
const produtosController = require('../controllers/produtosController');
const vendasController = require('../controllers/vendasController');
const clientesController = require('../controllers/clientesController');
const deliveryController = require('../controllers/deliveryController');
const preVendasController = require('../controllers/preVendasController');
const usuariosController = require('../controllers/usuariosController');
const { canAccessChannel, canAccessPage } = require('./accessControl');
const config = require('../config/env');
const filePathManager = require('../utils/filePathManager');

// Mantém uma referência global do objeto window para prevenir que seja fechada automaticamente
// quando o objeto JavaScript for coletado pelo garbage collector
let mainWindow;

function secureHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    const isPublic = ['auth:login', 'auth:logout', 'auth:getCurrentUser'].includes(channel);
    const user = isPublic ? authController.getCurrentUser() : await authController.validateSession();
    if (!canAccessChannel(user?.tipo, channel)) {
      throw new Error('Acesso negado para este perfil ou sessão expirada.');
    }
    return handler(event, ...args);
  });
}

// Cria a janela do navegador
async function createWindow() {
  // Tenta conectar ao banco de dados ao iniciar
  try {
    await dbConnection.connect();
    
    // Inicializar usuários padrão após conectar
    await dbConnection.inicializarUsuarios();
  } catch (err) {
    console.error('Erro ao conectar ao banco de dados:', err);
  }

  // Cria a janela do navegador
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      // Configurações adicionais para melhorar comportamento de foco
      enableRemoteModule: false,
      spellcheck: false,
      webSecurity: true,
      // Evitar problemas de foco
      backgroundThrottling: false
    },
    // Configurações da janela para melhor comportamento
    show: false, // Não mostrar até estar pronta
    titleBarStyle: 'default',
    autoHideMenuBar: true
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    try {
      const target = fileURLToPath(url);
      const viewsRoot = path.resolve(__dirname, '../views');
      const relative = path.relative(viewsRoot, target);
      const page = path.basename(target);
      if (relative.startsWith('..') || path.isAbsolute(relative) || relative.includes(path.sep) ||
          !canAccessPage(authController.getCurrentUser()?.tipo, page)) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  // Mostrar janela apenas quando estiver pronta
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Focus na janela para garantir que inputs funcionem
    mainWindow.focus();
    
    // Configurar handlers para problemas de foco
    mainWindow.webContents.on('dom-ready', () => {
      // Injetar script para corrigir problemas de foco
      mainWindow.webContents.executeJavaScript(`
        // Corrigir problemas de foco após DOM carregar
        setTimeout(() => {
          if (window.fixInputFocus) {
            window.fixInputFocus();
          }
        }, 500);
      `).catch(err => console.warn('Erro ao injetar script de foco:', err));
    });
    
    // Resetar foco quando janela ganha foco
    mainWindow.on('focus', () => {
      setTimeout(() => {
        mainWindow.webContents.executeJavaScript(`
          if (window.fixInputFocus) {
            window.fixInputFocus();
          }
        `).catch(() => {});
      }, 100);
    });
  });

  // Carrega a página de login
  mainWindow.loadFile(path.join(__dirname, '../views/login.html'));

  // Emitido quando a janela for fechada
  mainWindow.on('closed', () => {
    // Dereferenciar o objeto window para permitir que o garbage collector atue
    mainWindow = null;
  });
}

// Configurar handlers de IPC
function setupIpcHandlers() {
  console.log("Configurando handlers IPC...");

  // Obtém uma foto do IP Webcam no processo principal. Assim a página do PDV
  // não precisa acessar diretamente um endereço HTTP da rede local.
  secureHandle('scanner:getSnapshot', async (_event, cameraUrl) => {
    try {
      const url = new URL(String(cameraUrl || '').trim());
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Use um endereço HTTP ou HTTPS válido.');
      }

      const axios = require('axios');
      const readStream = async (stream, limit = 8 * 1024 * 1024) => {
        const chunks = [];
        let size = 0;
        for await (const chunk of stream) {
          size += chunk.length;
          if (size > limit) throw new Error('A imagem enviada pela câmera é grande demais. Reduza a resolução no WebCam.');
          chunks.push(chunk);
        }
        return Buffer.concat(chunks);
      };
      const readFirstJpegFromStream = async (stream) => {
        let data = Buffer.alloc(0);
        for await (const chunk of stream) {
          data = Buffer.concat([data, chunk]);
          const start = data.indexOf(Buffer.from([0xff, 0xd8]));
          const end = start >= 0 ? data.indexOf(Buffer.from([0xff, 0xd9]), start + 2) : -1;
          if (end >= 0) {
            stream.destroy();
            return data.subarray(start, end + 2);
          }
          if (data.length > 8 * 1024 * 1024) {
            throw new Error('Não foi possível obter um quadro JPEG da câmera.');
          }
        }
        throw new Error('O stream da câmera foi encerrado antes de enviar uma imagem.');
      };
      const requestOptions = {
        responseType: 'stream',
        // A câmera pode demorar a ativar na primeira solicitação. Também não
        // usamos o proxy do ambiente, pois o IP Webcam é sempre da rede local.
        timeout: 15000,
        proxy: false,
        headers: { Accept: 'image/jpeg,image/*;q=0.8,*/*;q=0.5' }
      };
      let response = await axios.get(url.toString(), requestOptions);
      let contentType = String(response.headers['content-type'] || '').split(';')[0];
      let imageData;

      // O modo Browser do WebCam pode entregar o MJPEG diretamente na URL
      // base. Nesse caso, extraímos apenas o primeiro quadro JPEG do vídeo.
      if (contentType.startsWith('multipart/')) {
        imageData = await readFirstJpegFromStream(response.data);
        contentType = 'image/jpeg';
      }

      // No modo Browser, o WebCam entrega uma página HTML contendo a imagem
      // do stream. Encontramos essa imagem para que o usuário possa colar a
      // URL exibida/compartilhada pelo próprio aplicativo.
      if (contentType === 'text/html') {
        const page = (await readStream(response.data, 1024 * 1024)).toString('utf8');
        const images = [...page.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
          .map(match => match[1]);
        const imagePath = images.find(path => /snapshot|shot|image|frame|stream|mjpeg/i.test(path)) || images[0];
        if (!imagePath) {
          throw new Error('Não encontrei uma imagem na página do WebCam. Use o link de snapshot/JPEG exibido pelo aplicativo.');
        }
        response = await axios.get(new URL(imagePath, url).toString(), requestOptions);
        contentType = String(response.headers['content-type'] || '').split(';')[0];
        imageData = contentType.startsWith('multipart/')
          ? await readFirstJpegFromStream(response.data)
          : await readStream(response.data);
      }

      if (!contentType.startsWith('image/')) {
        throw new Error('O endereço não retornou uma imagem. No WebCam, use o link de snapshot/JPEG ou o link do modo Browser.');
      }

      if (!imageData) imageData = await readStream(response.data);
      return { dataUrl: `data:${contentType};base64,${imageData.toString('base64')}` };
    } catch (error) {
      console.error('Erro ao obter imagem do IP Webcam:', error.message);
      throw new Error(error.message || 'Não foi possível acessar a câmera.');
    }
  });
  
  // ==========================================
  // NOVOS HANDLERS DE DIAGNÓSTICO DE BANCO DE DADOS
  // ==========================================
  
  // Handler para testar conexão com o MongoDB
  secureHandle('db:testConnection', async () => {
    const mongoose = require('mongoose');
    const test = async (uri, name) => {
      if (!uri) return { success: false, message: `${name} não configurado` };
      const connection = mongoose.createConnection(uri, config.MONGO_OPTIONS);
      try {
        await connection.asPromise();
        return { success: true, message: `Conectado com sucesso ao ${name}` };
      } catch (error) {
        return { success: false, message: `Falha na conexão com ${name}: ${error.message}` };
      } finally {
        await connection.close();
      }
    };

    const [local, atlas] = await Promise.all([
      test(config.DB_LOCAL_URI, 'MongoDB local'),
      test(config.DB_ATLAS_URI, 'MongoDB Atlas')
    ]);
    return { local, atlas, currentMode: dbConnection.getConnectionMode() };
  });

  // Handler para alternar o modo de conexão
  secureHandle('db:toggleConnectionMode', async () => {
    try {
      dbConnection.toggleConnectionMode();
      await dbConnection.disconnect();
      await dbConnection.connect();
      
      return {
        success: true,
        message: `Modo de conexão alterado para: ${dbConnection.getConnectionMode()}`,
        currentMode: dbConnection.getConnectionMode()
      };
    } catch (error) {
      console.error("Erro ao alternar modo de conexão:", error);
      return {
        success: false,
        message: `Erro ao alternar modo de conexão: ${error.message}`,
        currentMode: dbConnection.getConnectionMode()
      };
    }
  });
  
  // Auth handlers
  secureHandle('auth:login', async (event, { email, senha }) => {
    console.log("Handler auth:login chamado para email:", email);
    try {
      const resultado = await authController.login(email, senha);
      console.log("Resultado do login:", resultado.success ? "Sucesso" : "Falha");
      return resultado;
    } catch (error) {
      console.error("Erro no handler de login:", error);
      return { 
        success: false, 
        message: "Erro interno: " + error.message 
      };
    }
  });
  
  secureHandle('auth:logout', async () => {
    return await authController.logout();
  });
  
  secureHandle('auth:getCurrentUser', async () => {
    return authController.validateSession();
  });
  
  secureHandle('usuarios:getAll', () => usuariosController.getUsuarios());
  secureHandle('usuarios:getById', (_event, id) => usuariosController.getUsuarioById(id));
  secureHandle('usuarios:create', (_event, data) => usuariosController.createUsuario(data));
  secureHandle('usuarios:update', (_event, id, data) => usuariosController.updateUsuario(id, data));
  secureHandle('usuarios:toggleStatus', (_event, id, ativo) => usuariosController.toggleUsuarioStatus(id, ativo));
  
  // Relatórios handlers aprimorados
  secureHandle('relatorios:gerar', async (event, filtros) => {
    try {
      console.log('Handler relatorios:gerar recebido com filtros:', JSON.stringify(filtros));
      return await relatoriosController.gerarRelatorio(filtros);
    } catch (error) {
      console.error('Erro ao processar relatorios:gerar:', error);
      return {
        error: true,
        message: error.message || 'Erro ao gerar relatório',
        totalVendas: 0,
        ticketMedio: 0,
        qtdVendas: 0,
        totalItens: 0,
        produtosMaisVendidos: [],
        vendasPorDia: [],
        vendasPorMetodo: []
      };
    }
  });
  
  // Novos handlers para análises avançadas
  secureHandle('relatorios:detalhesVendas', async (event, filtros) => {
    try {
      return await relatoriosController.getDetalhesVendas(filtros);
    } catch (error) {
      console.error('Erro ao processar relatorios:detalhesVendas:', error);
      return {
        success: false,
        message: `Erro ao obter detalhes de vendas: ${error.message}`,
        vendas: []
      };
    }
  });
  
  secureHandle('relatorios:analiseVendedores', async (event, filtros) => {
    try {
      return await relatoriosController.getAnaliseVendedores(filtros);
    } catch (error) {
      console.error('Erro ao processar relatorios:analiseVendedores:', error);
      return {
        success: false,
        message: `Erro ao analisar vendedores: ${error.message}`,
        vendedores: []
      };
    }
  });
  
  secureHandle('relatorios:analiseProdutos', async (event, filtros) => {
    try {
      return await relatoriosController.getAnaliseProdutos(filtros);
    } catch (error) {
      console.error('Erro ao processar relatorios:analiseProdutos:', error);
      return {
        success: false,
        message: `Erro ao analisar produtos: ${error.message}`,
        produtos: []
      };
    }
  });
  
  secureHandle('relatorios:analisePeriodo', async (event, filtros) => {
    try {
      return await relatoriosController.getAnalisePeriodo(filtros);
    } catch (error) {
      console.error('Erro ao processar relatorios:analisePeriodo:', error);
      return {
        success: false,
        message: `Erro ao analisar período: ${error.message}`,
        periodos: []
      };
    }
  });
  
  secureHandle('relatorios:resumoFinanceiro', async (event, filtros) => {
    try {
      return await relatoriosController.getResumoFinanceiro(filtros);
    } catch (error) {
      console.error('Erro ao processar relatorios:resumoFinanceiro:', error);
      return {
        success: false,
        message: `Erro ao gerar resumo financeiro: ${error.message}`,
        resumo: null
      };
    }
  });
  
  secureHandle('relatorios:exportarPDF', async (event, dados) => {
    try {
      return await relatoriosController.exportarPDF(dados);
    } catch (error) {
      console.error('Erro ao processar relatorios:exportarPDF:', error);
      return { 
        success: false, 
        message: `Erro ao exportar para PDF: ${error.message}`
      };
    }
  });
  
  secureHandle('relatorios:exportarExcel', async (event, dados) => {
    try {
      return await relatoriosController.exportarExcel(dados);
    } catch (error) {
      console.error('Erro ao processar relatorios:exportarExcel:', error);
      return {
        success: false,
        message: `Erro ao exportar para Excel: ${error.message}`
      };
    }
  });
  
  // Produtos handlers
  secureHandle('produtos:getAll', async (event, filtros) => {
    try {
      console.log(`Handler produtos:getAll recebido com filtros:`, typeof filtros === 'object' ? JSON.stringify(filtros) : filtros);
      
      // Verificar conexão com o banco
      if (!dbConnection.isConnected()) {
        console.log('Conexão com o banco de dados não está ativa. Reconectando...');
        await dbConnection.connect();
      }
      
      const produtos = await produtosController.getProdutos(filtros);
      console.log(`Handler retornando ${produtos.length} produtos`);
      return produtos;
    } catch (error) {
      console.error('Erro detalhado em produtos:getAll:', error);
      return []; // Retornar array vazio em caso de erro
    }
  });
  
  secureHandle('produtos:getById', async (event, id) => {
    try {
      // Verificar se o ID é válido antes de prosseguir
      if (!id || id === 'undefined' || id === 'null') {
        console.warn('ID inválido recebido em produtos:getById:', id);
        throw new Error('ID de produto inválido ou não fornecido');
      }
      return await produtosController.getProdutoById(id);
    } catch (error) {
      console.error(`Erro ao processar produtos:getById para ID ${id}:`, error);
      throw new Error(`Falha ao buscar produto: ${error.message}`);
    }
  });
  
  secureHandle('produtos:add', async (event, produto) => {
    try {
      console.log('Recebida solicitação para adicionar produto:', JSON.stringify(produto));
      const resultado = await produtosController.addProduto(produto);
      
      // Garantir que o resultado seja serializável
      const resultadoSerializado = {
        success: resultado.success,
        message: resultado.message || '',
        produto: resultado.produto ? {
          _id: resultado.produto._id ? resultado.produto._id.toString() : null,
          codigo: resultado.produto.codigo,
          nome: resultado.produto.nome,
          descricao: resultado.produto.descricao,
          categoria: resultado.produto.categoria,
          preco: resultado.produto.preco,
          precoVenda: resultado.produto.precoVenda,
          estoque: resultado.produto.estoque,
          unidadeMedida: resultado.produto.unidadeMedida,
          exigeReceita: resultado.produto.exigeReceita,
          ativo: resultado.produto.ativo
        } : null
      };
      
      console.log('Resultado serializado:', JSON.stringify(resultadoSerializado));
      return resultadoSerializado;
    } catch (error) {
      console.error('Erro ao processar produtos:add:', error);
      return {
        success: false,
        message: `Falha ao adicionar produto: ${error.message}`
      };
    }
  });
  
  secureHandle('produtos:update', async (event, id, produto) => {
    try {
      // Verificar se o ID é válido antes de prosseguir
      if (!id || id === 'undefined' || id === 'null') {
        console.warn('ID inválido recebido em produtos:update:', id);
        throw new Error('ID de produto inválido ou não fornecido');
      }
      
      console.log(`Recebida solicitação para atualizar produto ID ${id}:`, produto);
      return await produtosController.updateProduto(id, produto);
    } catch (error) {
      console.error(`Erro ao processar produtos:update para ID ${id}:`, error);
      return {
        success: false,
        message: `Falha ao atualizar produto: ${error.message}`
      };
    }
  });
  
  // Adicionar o handler para delete
  secureHandle('produtos:delete', async (event, id) => {
    try {
      if (!id || id === 'undefined' || id === 'null') {
        console.warn('ID inválido recebido em produtos:delete:', id);
        throw new Error('ID de produto inválido ou não fornecido');
      }
      
      return await produtosController.deleteProduto(id);
    } catch (error) {
      console.error(`Erro ao processar produtos:delete para ID ${id}:`, error);
      return {
        success: false,
        message: `Falha ao excluir produto: ${error.message}`
      };
    }
  });
  
  // Adicionar o handler para restore (restaurar produto)
  secureHandle('produtos:restore', async (event, id) => {
    try {
      if (!id || id === 'undefined' || id === 'null') {
        console.warn('ID inválido recebido em produtos:restore:', id);
        throw new Error('ID de produto inválido ou não fornecido');
      }
      
      return await produtosController.restoreProduto(id);
    } catch (error) {
      console.error(`Erro ao processar produtos:restore para ID ${id}:`, error);
      return {
        success: false,
        message: `Falha ao restaurar produto: ${error.message}`
      };
    }
  });
  
  // Adicionar o handler para remover produto permanentemente
  secureHandle('produtos:remove', async (event, id) => {
    try {
      if (!id || id === 'undefined' || id === 'null') {
        console.warn('ID inválido recebido em produtos:remove:', id);
        throw new Error('ID de produto inválido ou não fornecido');
      }
      
      console.log(`Solicitação para remover permanentemente o produto ID: ${id}`);
      return await produtosController.removeProduto(id);
    } catch (error) {
      console.error(`Erro ao processar produtos:remove para ID ${id}:`, error);
      return {
        success: false,
        message: `Falha ao remover produto: ${error.message}`
      };
    }
  });

  // Handler para buscar categorias
  secureHandle('produtos:getCategorias', async (event) => {
    try {
      console.log('Solicitação para buscar categorias de produtos');
      return await produtosController.getCategorias();
    } catch (error) {
      console.error('Erro ao processar produtos:getCategorias:', error);
      return [];
    }
  });
  
  // Vendas handlers
  secureHandle('vendas:registrar', async (event, dadosVenda) => {
    try {
      console.log('Recebida solicitação para registrar venda');
      const usuario = authController.getCurrentUser();
      const resultado = await vendasController.registrarVenda({
        ...dadosVenda,
        vendedor: usuario.id,
        nomeVendedor: usuario.nome,
        operadorCaixa: usuario.id,
        preVendaCodigo: undefined
      });
      return resultado;
    } catch (error) {
      console.error('Erro ao processar vendas:registrar:', error);
      return {
        success: false,
        message: `Falha ao registrar venda: ${error.message}`
      };
    }
  });

  secureHandle('preVendas:abrir', (_event, codigo) =>
    preVendasController.abrir(codigo, authController.getCurrentUser()));
  secureHandle('preVendas:listar', () => preVendasController.listar());
  secureHandle('preVendas:salvar', (_event, dados) =>
    preVendasController.salvar(dados, authController.getCurrentUser()));
  secureHandle('preVendas:cancelar', (_event, codigo, versao) =>
    preVendasController.cancelar(codigo, versao, authController.getCurrentUser()));
  secureHandle('preVendas:finalizar', (_event, codigo, pagamento) =>
    preVendasController.finalizar(codigo, pagamento, authController.getCurrentUser()));
  
  secureHandle('vendas:buscar', async (event, filtros) => {
    try {
      return await vendasController.getVendas(filtros);
    } catch (error) {
      console.error('Erro ao processar vendas:buscar:', error);
      return [];
    }
  });
  
  secureHandle('vendas:detalhes', async (event, id) => {
    try {
      const venda = await vendasController.getVendaDetalhes(id);
      // Garantir que tudo é serializável (JSON roundtrip)
      return JSON.parse(JSON.stringify(venda));
    } catch (error) {
      console.error('Erro ao processar vendas:detalhes:', error);
      return null;
    }
  });
  
  secureHandle('vendas:cancelar', async (event, id) => {
    try {
      return await vendasController.cancelarVenda(id);
    } catch (error) {
      console.error('Erro ao processar vendas:cancelar:', error);
      return {
        success: false,
        message: `Falha ao cancelar venda: ${error.message}`
      };
    }
  });
  
  secureHandle('vendas:getVendedores', async (event) => {
    try {
      return await vendasController.getVendedores();
    } catch (error) {
      console.error('Erro ao processar vendas:getVendedores:', error);
      return [];
    }
  });
  
  // Vendas fiado
  secureHandle('vendas:registrarPagamentoFiado', async (event, id, dadosPagamento) => {
    try {
      return await vendasController.registrarPagamentoFiado(id, dadosPagamento);
    } catch (error) {
      console.error('Erro ao processar vendas:registrarPagamentoFiado:', error);
      return {
        success: false,
        message: `Falha ao registrar pagamento: ${error.message}`
      };
    }
  });
  
  secureHandle('vendas:getFiadoCliente', async (event, clienteId) => {
    try {
      return await vendasController.getVendasFiadoCliente(clienteId);
    } catch (error) {
      console.error('Erro ao processar vendas:getFiadoCliente:', error);
      return [];
    }
  });

  // Delivery: usa o usuário autenticado no processo principal e nunca confia
  // em identidade, preços, distância ou totais enviados pela interface.
  secureHandle('delivery:calcularEntrega', async (_event, endereco) => {
    if (!authController.getCurrentUser()) return { success: false, message: 'Sessão expirada. Entre novamente no sistema.' };
    try {
      return { success: true, ...(await deliveryController.calculateQuote(endereco)) };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  secureHandle('delivery:getCliente', async (_event, id) => {
    if (!authController.getCurrentUser()) return { success: false, message: 'Sessão expirada. Entre novamente no sistema.' };
    try {
      return { success: true, cliente: await deliveryController.getClient(id) };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  secureHandle('delivery:criar', async (_event, dados) => {
    const usuario = authController.getCurrentUser();
    if (!usuario) return { success: false, message: 'Sessão expirada. Entre novamente no sistema.' };
    return deliveryController.createOrder(dados, usuario);
  });

  secureHandle('delivery:listar', async (_event, filtros) => {
    if (!authController.getCurrentUser()) return { success: false, message: 'Sessão expirada. Entre novamente no sistema.', pedidos: [] };
    try {
      return { success: true, pedidos: await deliveryController.listOrders(filtros || {}) };
    } catch (error) {
      return { success: false, message: error.message, pedidos: [] };
    }
  });

  secureHandle('delivery:detalhes', async (_event, id) => {
    if (!authController.getCurrentUser()) return { success: false, message: 'Sessão expirada. Entre novamente no sistema.' };
    try {
      return { success: true, pedido: await deliveryController.getOrder(id) };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  secureHandle('delivery:atualizarStatus', async (_event, id, status, motoboy) => {
    const usuario = authController.getCurrentUser();
    if (!usuario) return { success: false, message: 'Sessão expirada. Entre novamente no sistema.' };
    return deliveryController.updateStatus(id, status, usuario, motoboy);
  });
  
  // Clientes handlers
  secureHandle('clientes:getAll', async (event, filtro) => {
    try {
      console.log('Handler clientes:getAll recebido com filtro:', filtro || 'nenhum');
      return await clientesController.getClientes(filtro);
    } catch (error) {
      console.error('Erro ao processar clientes:getAll:', error);
      return [];
    }
  });
  
  secureHandle('clientes:getById', async (event, id) => {
    try {
      console.log('Handler clientes:getById recebido com ID:', id);
      return await clientesController.getClienteById(id);
    } catch (error) {
      console.error('Erro ao processar clientes:getById:', error);
      return null;
    }
  });
  
  secureHandle('clientes:add', async (event, clienteData) => {
    try {
      console.log('Handler clientes:add recebido com dados:', JSON.stringify(clienteData));
      return await clientesController.addCliente(clienteData);
    } catch (error) {
      console.error('Erro ao processar clientes:add:', error);
      return {
        success: false,
        message: `Falha ao adicionar cliente: ${error.message}`
      };
    }
  });
  secureHandle('clientes:update', async (event, id, clienteData) => {
    try {
      console.log(`Handler clientes:update recebido para ID: ${id} (tipo: ${typeof id})`);
      
      // Diagnóstico adicional
      if (typeof id === 'object' && id !== null) {
        console.log("ID é um objeto:", JSON.stringify(id, null, 2));
      } else if (typeof id === 'string' && id.includes('[object Object]')) {
        console.log("ID parece ser um objeto serializado incorretamente");
      }
      
      return await clientesController.updateCliente(id, clienteData);
    } catch (error) {
      console.error('Erro ao processar clientes:update:', error);
      return {
        success: false,
        message: `Falha ao atualizar cliente: ${error.message}`
      };
    }
  });
  
  secureHandle('clientes:delete', async (event, id) => {
    try {
      console.log(`Handler clientes:delete recebido para ID: ${id}`);
      return await clientesController.deleteCliente(id);
    } catch (error) {
      console.error('Erro ao processar clientes:delete:', error);
      return {
        success: false,
        message: `Falha ao excluir cliente: ${error.message}`
      };
    }
  });
  
  secureHandle('clientes:getResumoFiado', async (event, clienteId) => {
    try {
      return await clientesController.getResumoFiado(clienteId);
    } catch (error) {
      console.error('Erro ao processar clientes:getResumoFiado:', error);
      return {
        success: false,
        message: `Falha ao obter resumo de fiado: ${error.message}`
      };
    }
  });
  
  secureHandle('clientes:zerarSaldoDevedor', async (event, clienteId) => {
    try {
      return await clientesController.zerarSaldoDevedor(clienteId);
    } catch (error) {
      console.error('Erro ao processar clientes:zerarSaldoDevedor:', error);
      return {
        success: false,
        message: `Falha ao zerar saldo devedor: ${error.message}`
      };
    }
  });
  
  secureHandle('clientes:adicionarCreditoExtra', async (event, clienteId, dadosCredito) => {
    try {
      return await clientesController.adicionarCreditoExtra(clienteId, dadosCredito);
    } catch (error) {
      console.error('Erro ao processar clientes:adicionarCreditoExtra:', error);
      return {
        success: false,
        message: `Falha ao adicionar crédito extra: ${error.message}`
      };
    }
  });
  
  secureHandle('clientes:getHistoricoCredito', async (event, clienteId, filtros) => {
    try {
      return await clientesController.getHistoricoCredito(clienteId, filtros);
    } catch (error) {
      console.error('Erro ao processar clientes:getHistoricoCredito:', error);
      return {
        success: false,
        message: `Falha ao obter histórico de crédito: ${error.message}`
      };
    }
  });
  
  secureHandle('clientes:sincronizarDadosCredito', async (event, clienteId) => {
    try {
      return await clientesController.sincronizarDadosCredito(clienteId);
    } catch (error) {
      console.error('Erro ao processar clientes:sincronizarDadosCredito:', error);
      return {
        success: false,
        message: `Falha ao sincronizar dados de crédito: ${error.message}`
      };
    }
  });

  // Retirada de dinheiro handlers
  secureHandle('registrar-retirada', async (event, dadosRetirada) => {
    try {
      console.log('Handler registrar-retirada recebido com dados:', dadosRetirada);
      
      // Aqui você pode salvar no banco de dados
      // Por enquanto, apenas retorna sucesso
      const Retirada = require('../models/retirada');
      
      const novaRetirada = new Retirada({
        dataRetirada: dadosRetirada.dataRetirada,
        horaRetirada: dadosRetirada.horaRetirada,
        valor: dadosRetirada.valor,
        responsavel: dadosRetirada.responsavel,
        motivo: dadosRetirada.motivo,
        observacoes: dadosRetirada.observacoes,
        usuarioId: dadosRetirada.usuarioId,
        dataCriacao: dadosRetirada.dataCriacao ? new Date(dadosRetirada.dataCriacao) : new Date()
      });
      
      await novaRetirada.save();
      
      return {
        sucesso: true,
        mensagem: 'Retirada registrada com sucesso!',
        dados: {
          id: novaRetirada._id.toString(),
          valor: novaRetirada.valor,
          dataRetirada: novaRetirada.dataRetirada,
          horaRetirada: novaRetirada.horaRetirada,
          responsavel: novaRetirada.responsavel
        }
      };
    } catch (error) {
      console.error('Erro ao processar registrar-retirada:', error);
      return {
        sucesso: false,
        mensagem: `Falha ao registrar retirada: ${error.message}`
      };
    }
  });

  secureHandle('listar-retiradas', async (event, filtros) => {
    try {
      console.log('Handler listar-retiradas recebido com filtros:', filtros || 'nenhum');
      const Retirada = require('../models/retirada');
      
      let query = {};
      if (filtros && filtros.dataInicio && filtros.dataFim) {
        const dataInicio = new Date(filtros.dataInicio);
        const dataFim = new Date(filtros.dataFim);
        
        // Configurar início do dia e fim do dia
        dataInicio.setHours(0, 0, 0, 0);
        dataFim.setHours(23, 59, 59, 999);
        
        query.dataCriacao = {
          $gte: dataInicio,
          $lte: dataFim
        };
      }
      
      console.log('Query para retiradas:', JSON.stringify(query));
      const retiradas = await Retirada.find(query).sort({ dataCriacao: -1 }).lean();
      console.log(`Encontradas ${retiradas.length} retiradas`);
      
      if (retiradas.length > 0) {
        console.log('Primeira retirada encontrada:', {
          id: retiradas[0]._id,
          valor: retiradas[0].valor,
          responsavel: retiradas[0].responsavel,
          motivo: retiradas[0].motivo,
          dataCriacao: retiradas[0].dataCriacao,
          dataRetirada: retiradas[0].dataRetirada,
          horaRetirada: retiradas[0].horaRetirada
        });
      }
      
      // Retornar dados limpos e serializáveis
      const retiradasLimpas = retiradas.map(retirada => ({
        _id: retirada._id.toString(),
        valor: retirada.valor,
        responsavel: retirada.responsavel,
        motivo: retirada.motivo,
        observacoes: retirada.observacoes,
        dataCriacao: retirada.dataCriacao,
        dataRetirada: retirada.dataRetirada,
        horaRetirada: retirada.horaRetirada,
        usuarioId: retirada.usuarioId
      }));
      
      return {
        sucesso: true,
        dados: retiradasLimpas
      };
    } catch (error) {
      console.error('Erro ao processar listar-retiradas:', error);
      return {
        sucesso: false,
        mensagem: `Falha ao listar retiradas: ${error.message}`,
        dados: []
      };
    }
  });

  // Handler para obter saldo do caixa com filtros de período
  secureHandle('obter-saldo-caixa-periodo', async (event, filtros) => {
    try {
      console.log('Handler obter-saldo-caixa-periodo recebido com filtros:', filtros);
      const Venda = require('../models/venda');
      const Retirada = require('../models/retirada');
      
      let queryVendas = { status: { $ne: 'cancelada' } };
      let queryRetiradas = {};
      
      // Aplicar filtros de data se fornecidos
      if (filtros && filtros.dataInicio && filtros.dataFim) {
        const dataInicio = new Date(filtros.dataInicio);
        const dataFim = new Date(filtros.dataFim);
        
        // Configurar início do dia e fim do dia
        dataInicio.setHours(0, 0, 0, 0);
        dataFim.setHours(23, 59, 59, 999);
        
        // Para vendas, usar dataVenda
        queryVendas.dataVenda = {
          $gte: dataInicio,
          $lte: dataFim
        };
        
        // Para retiradas, usar dataCriacao
        queryRetiradas.dataCriacao = {
          $gte: dataInicio,
          $lte: dataFim
        };
        
        console.log('Query para vendas do período:', JSON.stringify(queryVendas));
        console.log('Query para retiradas do período:', JSON.stringify(queryRetiradas));
      }
      
      // Buscar vendas do período
      const vendas = await Venda.find(queryVendas);
      const totalVendas = vendas.reduce((sum, venda) => sum + (venda.total || venda.valorTotal || 0), 0);
      
      // Buscar retiradas do período
      const retiradas = await Retirada.find(queryRetiradas);
      const totalRetiradas = retiradas.reduce((sum, retirada) => sum + (retirada.valor || 0), 0);
      
      const saldoPeriodo = totalVendas - totalRetiradas;
      
      console.log(`Saldo do período: Vendas=${totalVendas}, Retiradas=${totalRetiradas}, Saldo=${saldoPeriodo}`);
      
      return {
        sucesso: true,
        dados: {
          totalVendas,
          totalRetiradas,
          saldo: saldoPeriodo
        }
      };
    } catch (error) {
      console.error('Erro ao processar obter-saldo-caixa-periodo:', error);
      return {
        sucesso: false,
        mensagem: `Falha ao obter saldo do caixa: ${error.message}`,
        dados: {
          totalVendas: 0,
          totalRetiradas: 0,
          saldo: 0
        }
      };
    }
  });

  // Handler para obter total de vendas
  secureHandle('obter-total-vendas', async (event, filtros) => {
    try {
      console.log('Handler obter-total-vendas recebido');
      const Venda = require('../models/venda');
      
      // Total de vendas de hoje
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const amanha = new Date(hoje);
      amanha.setDate(amanha.getDate() + 1);
      
      console.log('DEBUG - Data hoje:', hoje);
      console.log('DEBUG - Data amanha:', amanha);
      
      // Usar apenas o filtro de status (sem ativo=true já que não existe no banco)
      const vendasHoje = await Venda.find({
        $or: [
          { dataVenda: { $gte: hoje, $lt: amanha } },
          { dataCriacao: { $gte: hoje, $lt: amanha } }
        ],
        status: { $ne: 'cancelada' }
      });
      
      console.log('DEBUG - Vendas encontradas para hoje:', vendasHoje.length);
      
      // Usar a mesma lógica do relatoriosController
      const totalHoje = vendasHoje.reduce((sum, venda) => {
        // Primeiro tenta valorTotal, depois total
        const valor = venda.valorTotal !== undefined ? venda.valorTotal : (venda.total || 0);
        console.log(`DEBUG - Venda ${venda._id}: valor=${valor}`);
        return sum + parseFloat(valor || 0);
      }, 0);
      
      // Total geral de vendas (usar os mesmos critérios do relatório)
      const todasVendas = await Venda.find({ 
        status: { $ne: 'cancelada' }
      });
      
      const totalGeral = todasVendas.reduce((sum, venda) => {
        // Primeiro tenta valorTotal, depois total
        const valor = venda.valorTotal !== undefined ? venda.valorTotal : (venda.total || 0);
        return sum + parseFloat(valor || 0);
      }, 0);
      
      console.log(`Total hoje: ${totalHoje}, Total geral: ${totalGeral}, Vendas hoje: ${vendasHoje.length}, Vendas total: ${todasVendas.length}`);
      
      return {
        sucesso: true,
        dados: {
          totalHoje: totalHoje,
          totalGeral: totalGeral,
          vendidosHoje: vendasHoje.length,
          vendidosTotal: todasVendas.length
        }
      };
    } catch (error) {
      console.error('Erro ao processar obter-total-vendas:', error);
      return {
        sucesso: false,
        mensagem: `Falha ao obter total de vendas: ${error.message}`,
        dados: {
          totalHoje: 0,
          totalGeral: 0,
          vendidosHoje: 0,
          vendidosTotal: 0
        }
      };
    }
  });
  
  // Adicionar handler para abrir arquivos após exportação
  secureHandle('system:openFile', async (_, filePath) => {
    try {
      const { shell } = require('electron');
      await shell.openPath(filePath);
      return { success: true };
    } catch (error) {
      console.error('Erro ao abrir arquivo:', error);
      return { success: false, message: error.message };
    }
  });

  // Handler para gerar PDF a partir de HTML (usado na impressão de recibos)
  secureHandle('print:generatePdf', async (event, { html, filename }) => {
    try {
      const { shell } = require('electron');
      const fs = require('fs');
      const path = require('path');

      console.log('Handler print:generatePdf: iniciando com filename:', filename);
      console.log('Handler print:generatePdf: tamanho do HTML:', html ? html.length : 0, 'bytes');

      // Criar janela oculta para renderizar o HTML
      const pdfWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          offscreen: true,
          contextIsolation: true,
          sandbox: false
        }
      });

      console.log('Handler print:generatePdf: BrowserWindow criada');

      // Carregar conteúdo HTML via data URL
      const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
      console.log('Handler print:generatePdf: data URL length:', dataUrl.length);

      try {
        await pdfWindow.loadURL(dataUrl);
        console.log('Handler print:generatePdf: HTML carregado com sucesso');
      } catch (loadErr) {
        console.error('Handler print:generatePdf: erro ao carregar HTML:', loadErr);
        pdfWindow.close();
        throw new Error(`Falha ao carregar HTML: ${loadErr.message}`);
      }

      // Esperar o DOM estar pronto com timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          console.log('Handler print:generatePdf: timeout atingido, continuando mesmo assim');
          resolve(); // Resolver mesmo com timeout
        }, 3000);

        pdfWindow.webContents.once('dom-ready', () => {
          clearTimeout(timeout);
          console.log('Handler print:generatePdf: dom-ready disparado');
          resolve();
        });
      });

      // Pequeno delay adicional para renderização
      await new Promise(r => setTimeout(r, 500));

      // Gerar PDF
      console.log('Handler print:generatePdf: iniciando geração de PDF');
      const pdfOptions = { printBackground: true, marginsType: 1 };
      const pdfData = await pdfWindow.webContents.printToPDF(pdfOptions);
      console.log('Handler print:generatePdf: PDF gerado com sucesso, tamanho:', pdfData.length, 'bytes');

      // Determinar caminho de saída usando o gerenciador de caminhos
      const outName = filename && typeof filename === 'string' ? filename : filePathManager.generateUniqueFileName('nota-fiscal', '.pdf');
      const outPath = filePathManager.getPDFPath(outName);
      console.log('Handler print:generatePdf: salvando em:', outPath);

      fs.writeFileSync(outPath, pdfData);
      console.log('Handler print:generatePdf: arquivo salvo com sucesso');

      // Abrir o PDF no visualizador padrão (opcional)
      try {
        await shell.openPath(outPath);
        console.log('Handler print:generatePdf: PDF aberto no visualizador padrão');
      } catch (err) {
        console.warn('Não foi possível abrir o PDF automaticamente:', err.message || err);
      }

      // Fechar a janela auxiliar
      try { pdfWindow.close(); } catch (e) {}

      return { success: true, path: outPath };
    } catch (error) {
      console.error('Erro no handler print:generatePdf:', error);
      return { success: false, message: error.message };
    }
  });

  // Handler para obter saldo do caixa
  secureHandle('obter-saldo-caixa', async (event, filtros) => {
    try {
      console.log('Handler obter-saldo-caixa recebido');
      const Venda = require('../models/venda');
      const Retirada = require('../models/retirada');
      
      // Total de vendas (usando mesmos critérios do obter-total-vendas)
      const todasVendas = await Venda.find({ 
        status: { $ne: 'cancelada' }
      });
      const totalVendas = todasVendas.reduce((sum, venda) => {
        const valor = venda.valorTotal !== undefined ? venda.valorTotal : (venda.total || 0);
        return sum + parseFloat(valor || 0);
      }, 0);
      
      // Total de retiradas (usar critério similar - sem ativo=true se não existir)
      const todasRetiradas = await Retirada.find({});
      const totalRetiradas = todasRetiradas.reduce((sum, retirada) => {
        return sum + parseFloat(retirada.valor || 0);
      }, 0);
      
      // Saldo = vendas - retiradas
      const saldo = totalVendas - totalRetiradas;
      
      console.log(`Handler obter-saldo-caixa: Vendas=${totalVendas}, Retiradas=${totalRetiradas}, Saldo=${saldo}`);
      
      return {
        sucesso: true,
        dados: {
          saldo: saldo,
          totalVendas: totalVendas,
          totalRetiradas: totalRetiradas
        }
      };
    } catch (error) {
      console.error('Erro ao processar obter-saldo-caixa:', error);
      return {
        sucesso: false,
        mensagem: `Falha ao obter saldo do caixa: ${error.message}`,
        dados: {
          saldo: 0,
          totalVendas: 0,
          totalRetiradas: 0
        }
      };
    }
  });
  
  console.log("Handlers IPC configurados com sucesso!");
}

// Este método será chamado quando o Electron terminar de inicializar
app.whenReady().then(async () => {
  // Verificar dependências - você pode incluir isso se necessário
  try {
    // Verificar PDFKit
    require('pdfkit');
    console.log('✓ PDFKit instalado corretamente');
    
    // Verificar ExcelJS
    require('exceljs');
    console.log('✓ ExcelJS instalado corretamente');
  } catch (err) {
    console.error('⚠️ Erro ao verificar dependências:', err);
    console.error('Por favor execute: npm install pdfkit exceljs --save');
  }
  
  setupIpcHandlers();
  createWindow();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Sair quando todas as janelas estiverem fechadas, exceto no macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Encerrar a conexão com o banco de dados quando o app for fechado
app.on('will-quit', async () => {
  console.log('Encerrando aplicação...');
  
  // Log de estatísticas finais
  const stats = dbConnection.getPerformanceStats();
  const cacheStats = require('../utils/cache').getStats();
  
  console.log('Estatísticas de Performance:');
  console.log(`- Database: ${stats.queryCount} queries, ${stats.slowQueries} lentas`);
  console.log(`- Cache: ${cacheStats.hitRate} hit rate, ${cacheStats.size} itens`);
  
  await dbConnection.disconnect();
});
