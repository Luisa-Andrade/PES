const { contextBridge, ipcRenderer } = require('electron');

// Log para depuração
console.log("Preload: Configurando APIs para comunicação IPC");

// Função para serializar objetos MongoDB antes de enviar pelo IPC
function serializeForIpc(obj) {
  if (!obj) return obj;
  
  // Caso seja um array
  if (Array.isArray(obj)) {
    return obj.map(item => serializeForIpc(item));
  }
  
  // Caso seja um objeto
  if (typeof obj === 'object') {
    // Caso seja um ObjectId do MongoDB (tem método toString)
    if (obj._bsontype === 'ObjectID' || obj._bsontype === 'ObjectId') {
      return obj.toString();
    }
    
    // Verificar se é ObjectId por outros meios
    if (obj.toString && obj.toString !== Object.prototype.toString) {
      const str = obj.toString();
      // Se parece ser um ObjectId (24 caracteres hex)
      if (/^[0-9a-f]{24}$/i.test(str)) {
        return str;
      }
    }
    
    // Caso seja um objeto com id ou _id que é um ObjectId
    if ((obj.id && typeof obj.id === 'object' && obj.id._bsontype) || 
        (obj._id && typeof obj._id === 'object' && obj._id._bsontype)) {
      const id = obj.id || obj._id;
      return id.toString();
    }
    
    // Caso seja um objeto com o buffer do ObjectID
    if (obj.buffer && typeof obj.buffer === 'object') {
      // Tentar converter buffer para string hex
      try {
        // Se for um Uint8Array ou Buffer
        if (obj.buffer instanceof ArrayBuffer || ArrayBuffer.isView(obj.buffer)) {
          return Array.from(new Uint8Array(obj.buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
        }
        
        // Para outros tipos de buffer
        const bufferValues = Object.values(obj.buffer);
        return Array.from(bufferValues)
          .map(b => b.toString(16).padStart(2, '0'))
          .join('');
      } catch (e) {
        console.error('Erro ao serializar buffer:', e);
        return obj.toString();
      }
    }
      // Para outros objetos, processar propriedade a propriedade
    const result = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        // Tratar especialmente propriedades de ID
        if ((key === '_id' || key === 'id') && obj[key]) {
          // Se a propriedade é um ObjectID/ObjectId ou tem formato de ObjectId
          if (obj[key]._bsontype === 'ObjectID' || obj[key]._bsontype === 'ObjectId') {
            result[key] = obj[key].toString();
          } else {
            result[key] = serializeForIpc(obj[key]);
          }
        } else {
          result[key] = serializeForIpc(obj[key]);
        }
      }
    }
    return result;
  }
  
  // Caso seja um número, converte para string (útil para IDs)
  if (typeof obj === 'number') {
    return String(obj);
  }
  
  // Valores primitivos são mantidos como estão
  return obj;
}

// Expor APIs seguras para o processo de renderização
contextBridge.exposeInMainWorld('authAPI', {
  // Autenticação
  login: (email, senha) => {
    console.log("Preload: Chamando login para", email);
    return ipcRenderer.invoke('auth:login', { email, senha });
  },
  logout: () => ipcRenderer.invoke('auth:logout'),
  getCurrentUser: () => ipcRenderer.invoke('auth:getCurrentUser')
});

contextBridge.exposeInMainWorld('usuariosAPI', {
  getUsuarios: () => ipcRenderer.invoke('usuarios:getAll'),
  getUsuarioById: id => ipcRenderer.invoke('usuarios:getById', id),
  createUsuario: data => ipcRenderer.invoke('usuarios:create', data),
  updateUsuario: (id, data) => ipcRenderer.invoke('usuarios:update', id, data),
  toggleUsuarioStatus: (id, ativo) => ipcRenderer.invoke('usuarios:toggleStatus', id, ativo)
});

contextBridge.exposeInMainWorld('preVendasAPI', {
  abrir: codigo => ipcRenderer.invoke('preVendas:abrir', codigo),
  listar: () => ipcRenderer.invoke('preVendas:listar'),
  salvar: dados => ipcRenderer.invoke('preVendas:salvar', dados),
  cancelar: (codigo, versao) => ipcRenderer.invoke('preVendas:cancelar', codigo, versao),
  finalizar: (codigo, pagamento) => ipcRenderer.invoke('preVendas:finalizar', codigo, pagamento)
});

// Expor APIs melhoradas para relatórios
contextBridge.exposeInMainWorld('relatoriosAPI', {
  // Gerar relatório básico
  gerarRelatorio: (filtros) => {
    console.log("Preload: Chamando gerarRelatorio com filtros:", JSON.stringify(filtros || {}));
    return ipcRenderer.invoke('relatorios:gerar', filtros);
  },
  
  // Exportar relatório
  exportarPDF: (dados) => {
    console.log("Preload: Chamando exportarPDF");
    return ipcRenderer.invoke('relatorios:exportarPDF', dados);
  },
  
  exportarExcel: (dados) => {
    console.log("Preload: Chamando exportarExcel");
    return ipcRenderer.invoke('relatorios:exportarExcel', dados);
  },
  
  // Novos métodos de análise avançada
  getDetalhesVendas: (filtros) => {
    console.log("Preload: Chamando getDetalhesVendas");
    return ipcRenderer.invoke('relatorios:detalhesVendas', filtros);
  },
  
  getAnaliseVendedores: (filtros) => {
    console.log("Preload: Chamando getAnaliseVendedores");
    return ipcRenderer.invoke('relatorios:analiseVendedores', filtros);
  },
  
  getAnaliseProdutos: (filtros) => {
    console.log("Preload: Chamando getAnaliseProdutos");
    return ipcRenderer.invoke('relatorios:analiseProdutos', filtros);
  },
  
  getAnalisePeriodo: (filtros) => {
    console.log("Preload: Chamando getAnalisePeriodo");
    return ipcRenderer.invoke('relatorios:analisePeriodo', filtros);
  },
  
  getResumoFinanceiro: (filtros) => {
    console.log("Preload: Chamando getResumoFinanceiro");
    return ipcRenderer.invoke('relatorios:resumoFinanceiro', filtros);
  },

  listarRetiradas: (filtros) => {
    console.log("Preload: Chamando listarRetiradas com filtros:", filtros);
    return ipcRenderer.invoke('listar-retiradas', filtros);
  }
});

// Expor APIs para produtos
contextBridge.exposeInMainWorld('produtosAPI', {
  getProdutos: (filtros) => {
    console.log("Preload: Iniciando getProdutos com filtros:", filtros);
    return ipcRenderer.invoke('produtos:getAll', filtros)
      .then(result => {
        console.log(`Preload: getProdutos retornou ${result?.length || 0} produtos`);
        return result;
      })
      .catch(err => {
        console.error("Preload: Erro em getProdutos:", err);
        return []; // Retornar array vazio em caso de erro
      });
  },
  getProdutoById: (id) => {
    console.log("Preload: Chamando getProdutoById:", id);
    return ipcRenderer.invoke('produtos:getById', id);
  },
  addProduto: (produto) => {
    console.log("Preload: Chamando addProduto:", produto);
    return ipcRenderer.invoke('produtos:add', produto);
  },
  updateProduto: (id, produto) => {
    console.log("Preload: Chamando updateProduto:", id, produto);
    return ipcRenderer.invoke('produtos:update', id, produto);
  },
  deleteProduto: (id) => ipcRenderer.invoke('produtos:delete', id),
  restoreProduto: (id) => ipcRenderer.invoke('produtos:restore', id),
  removeProduto: (id) => ipcRenderer.invoke('produtos:remove', id), // Adicionar nova API
  getCategorias: () => {
    console.log("Preload: Chamando getCategorias");
    return ipcRenderer.invoke('produtos:getCategorias');
  }
});

// Expor APIs para vendas
contextBridge.exposeInMainWorld('vendasAPI', {
  registrarVenda: (dadosVenda) => {
    console.log("Preload: Chamando registrarVenda");
    // Serializar dados antes de enviar pelo IPC
    const serializedData = serializeForIpc(dadosVenda);
    console.log("Dados serializados:", JSON.stringify(serializedData));
    return ipcRenderer.invoke('vendas:registrar', serializedData);
  },
  buscarVendas: (filtros) => ipcRenderer.invoke('vendas:buscar', serializeForIpc(filtros)),
  getVendaDetalhes: (id) => ipcRenderer.invoke('vendas:detalhes', id),
  cancelarVenda: (id) => ipcRenderer.invoke('vendas:cancelar', id),
  getVendedores: async () => {
    const vendedores = await ipcRenderer.invoke('vendas:getVendedores');
    return serializeForIpc(vendedores);
  },
  registrarPagamentoFiado: (id, dadosPagamento) => {
    return ipcRenderer.invoke('vendas:registrarPagamentoFiado', id, dadosPagamento);
  },
  
  getVendasFiadoCliente: (clienteId) => {
    return ipcRenderer.invoke('vendas:getFiadoCliente', clienteId);
  }
});

// Expor APIs para clientes
contextBridge.exposeInMainWorld('clientesAPI', {
  getClientes: (filtro) => {
    console.log("Preload: Chamando getClientes");
    return ipcRenderer.invoke('clientes:getAll', filtro);
  },
  
  getClienteById: (id) => {
    console.log("Preload: Chamando getClienteById com ID:", id);
    return ipcRenderer.invoke('clientes:getById', id);
  },
  
  addCliente: (clienteData) => {
    console.log("Preload: Chamando addCliente");
    return ipcRenderer.invoke('clientes:add', clienteData);
  },  updateCliente: (id, clienteData) => {
    console.log("Preload: Chamando updateCliente para ID:", id);
    
    // Garantir que o ID seja uma string simples, não um objeto
    let clienteId = id;
    
    // Tratar todos os casos possíveis para evitar [object Object]
    if (id === null || id === undefined) {
      console.error("ID inválido recebido: null/undefined");
      throw new Error("ID de cliente inválido (null/undefined)");
    }
    
    // Caso especial: string literal "[object Object]" - rejeitar diretamente
    if (typeof id === 'string' && id === '[object Object]') {
      console.error("ID inválido recebido: string literal [object Object]");
      throw new Error("ID de cliente inválido (string literal [object Object])");
    }
    
    // Se for um objeto, tentar extrair o ID corretamente
    if (typeof id === 'object') {
      // Caso MongoDB ObjectId
      if (id._id) {
        clienteId = typeof id._id === 'object' && id._id.toString ? 
          id._id.toString() : String(id._id);
      } 
      // Caso tenha um método toString personalizado
      else if (id.toString && typeof id.toString === 'function' && 
               id.toString !== Object.prototype.toString) {
        clienteId = id.toString();
      }
      // Caso último recurso
      else {
        console.error("Não foi possível extrair um ID válido do objeto:", id);
        throw new Error("Formato de ID inválido");
      }
    } else {
      // Converter para string qualquer outro tipo
      clienteId = String(id);
    }
    
    console.log("ID normalizado para:", clienteId);
    
    // Verificação final para garantir que não temos [object Object]
    if (clienteId === '[object Object]') {
      console.error("ID ainda é [object Object] após normalização");
      throw new Error("Não foi possível normalizar o ID do cliente");
    }
    
    return ipcRenderer.invoke('clientes:update', clienteId, clienteData);
  },
  
  deleteCliente: (id) => {
    console.log("Preload: Chamando deleteCliente para ID:", id);
    return ipcRenderer.invoke('clientes:delete', id);
  },
  
  getResumoFiado: (clienteId) => {
    console.log("Preload: Chamando getResumoFiado para ID:", clienteId);
    return ipcRenderer.invoke('clientes:getResumoFiado', clienteId);
  },
  
  zerarSaldoDevedor: (clienteId) => {
    console.log("Preload: Chamando zerarSaldoDevedor para ID:", clienteId);
    return ipcRenderer.invoke('clientes:zerarSaldoDevedor', clienteId);
  },
  
  getHistoricoCredito: (clienteId, filtros) => {
    console.log("Preload: Chamando getHistoricoCredito para ID:", clienteId);
    return ipcRenderer.invoke('clientes:getHistoricoCredito', clienteId, filtros);
  },
  
  sincronizarDadosCredito: (clienteId) => {
    console.log("Preload: Chamando sincronizarDadosCredito para ID:", clienteId);
    return ipcRenderer.invoke('clientes:sincronizarDadosCredito', clienteId);
  },
  
  adicionarPagamento: (clienteId, dadosPagamento) => {
    console.log("Preload: Chamando adicionarPagamento para ID:", clienteId, "valor:", dadosPagamento?.valor);
    return ipcRenderer.invoke('clientes:adicionarPagamento', clienteId, dadosPagamento);
  },

  adicionarCreditoExtra: (clienteId, dadosCredito) => {
    console.log("Preload: Chamando adicionarCreditoExtra para ID:", clienteId, "valor:", dadosCredito?.valor);
    return ipcRenderer.invoke('clientes:adicionarCreditoExtra', clienteId, dadosCredito);
  }
});

// Expor API para abrir arquivos e handlers gerais
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (filePath) => ipcRenderer.invoke('system:openFile', filePath),
  
  // Método genérico invoke para handlers IPC
  invoke: (channel, data) => {
    console.log(`Preload: Chamando invoke para canal '${channel}'`, data);
    return ipcRenderer.invoke(channel, data);
  },
  
  // Handlers específicos para retiradas
  registrarRetirada: (dados) => {
    console.log("Preload: Registrando retirada", dados);
    return ipcRenderer.invoke('registrar-retirada', dados);
  },
  
  listarRetiradas: (filtros) => {
    console.log("Preload: Listando retiradas", filtros);
    return ipcRenderer.invoke('listar-retiradas', filtros);
  },
  
  obterTotalVendas: (filtros) => {
    console.log("Preload: Obtendo total de vendas", filtros);
    return ipcRenderer.invoke('obter-total-vendas', filtros);
  },
  
  obterSaldoCaixa: (filtros) => {
    console.log("Preload: Obtendo saldo do caixa", filtros);
    return ipcRenderer.invoke('obter-saldo-caixa', filtros);
  }
});

// Expor API para geração de PDF via processo main
contextBridge.exposeInMainWorld('printAPI', {
  generatePDF: (htmlContent, filename) => {
    console.log('Preload: solicitando geração de PDF', filename || 'recibo.pdf');
    return ipcRenderer.invoke('print:generatePdf', { html: htmlContent, filename });
  }
});

// Expor API para diagnóstico de banco de dados
contextBridge.exposeInMainWorld('dbAPI', {
  // Testar conexão
  testConnection: () => {
    console.log("Preload: Chamando testConnection");
    return ipcRenderer.invoke('db:testConnection');
  },
  
  // Alternar modo de conexão (local/atlas)
  toggleConnectionMode: () => {
    console.log("Preload: Chamando toggleConnectionMode");
    return ipcRenderer.invoke('db:toggleConnectionMode');
  }
});

contextBridge.exposeInMainWorld('deliveryAPI', {
  calcularEntrega: endereco => ipcRenderer.invoke('delivery:calcularEntrega', serializeForIpc(endereco)),
  getCliente: id => ipcRenderer.invoke('delivery:getCliente', id),
  criarPedido: dados => ipcRenderer.invoke('delivery:criar', serializeForIpc(dados)),
  listarPedidos: filtros => ipcRenderer.invoke('delivery:listar', serializeForIpc(filtros || {})),
  getPedido: id => ipcRenderer.invoke('delivery:detalhes', id),
  atualizarStatus: (id, status, motoboy) => ipcRenderer.invoke('delivery:atualizarStatus', id, status, motoboy)
});

// API restrita para o scanner com câmera IP.
contextBridge.exposeInMainWorld('scannerAPI', {
  getSnapshot: (cameraUrl) => ipcRenderer.invoke('scanner:getSnapshot', cameraUrl)
});

// Verificar se a API foi exposta corretamente
console.log("Preload: APIs configuradas:", 
  contextBridge.exposeInMainWorld ? "OK" : "Falha");

// Informar que o preload foi carregado
console.log("Preload: Script carregado com sucesso!");
