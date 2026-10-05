const Cliente = require('../models/cliente');
const Venda = require('../models/venda');
const HistoricoCredito = require('../models/historicoCredito');
const dbConnection = require('../db/connection');
const mongoose = require('mongoose');
const { validarCpfCnpj } = require('../utils/formatHelpers');
const creditoLogger = require('../utils/creditoLogger');

class ClientesController {
  constructor() {
    dbConnection.ensureConnected();
  }
  
  // Buscar clientes com filtro opcional
  async getClientes(filtro = '') {
    try {
      await dbConnection.ensureConnected();
      
      let query = {};
      
      // Aplicar filtro de busca - melhorado para remover formatação
      if (filtro && filtro.trim()) {
        const termo = filtro.trim();
        const termoNumerico = termo.replace(/\D/g, '');
        
        query = {
          $or: [
            { nome: { $regex: termo, $options: 'i' } },
            { cpfCnpj: { $regex: termoNumerico, $options: 'i' } },
            { email: { $regex: termo, $options: 'i' } },
            { telefone: { $regex: termoNumerico, $options: 'i' } },
            { celular: { $regex: termoNumerico, $options: 'i' } }
          ]
        };
      }
      
      // Buscar clientes
      const clientes = await Cliente.find(query)
        .sort({ nome: 1 })
        .limit(100);
      
      return clientes.map(cliente => {
        // Formatação para exibição
        let cpfCnpjFormatado = cliente.cpfCnpj;
        if (cpfCnpjFormatado) {
          if (cpfCnpjFormatado.length <= 11) {
            cpfCnpjFormatado = cpfCnpjFormatado.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
          } else {
            cpfCnpjFormatado = cpfCnpjFormatado.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
          }
        }
        
        let telefoneFormatado = cliente.telefone;
        if (telefoneFormatado && telefoneFormatado.length >= 10) {
          telefoneFormatado = telefoneFormatado.length === 11 
            ? telefoneFormatado.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
            : telefoneFormatado.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
        }
        
        let celularFormatado = cliente.celular;
        if (celularFormatado && celularFormatado.length >= 10) {
          celularFormatado = celularFormatado.length === 11 
            ? celularFormatado.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
            : celularFormatado.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
        }
        
        return {
          _id: cliente._id.toString(),
          nome: cliente.nome,
          tipo: cliente.tipo,
          cpfCnpj: cpfCnpjFormatado,
          cpfCnpjRaw: cliente.cpfCnpj, // Para edição
          telefone: telefoneFormatado || celularFormatado,
          telefoneRaw: cliente.telefone, // Para edição
          celularRaw: cliente.celular, // Para edição
          statusCredito: cliente.statusCredito,
          limiteCredito: cliente.limiteCredito,
          saldoDevedor: cliente.saldoDevedor,
          creditoDisponivel: (cliente.limiteCredito + (cliente.creditoAdicional || 0)) - cliente.saldoDevedor,
          ativo: cliente.ativo
        };
      });
    } catch (error) {
      console.error('Erro ao buscar clientes:', error);
      throw error;
    }
  }
  
  // Buscar cliente por ID
  async getClienteById(id) {
    try {
      await dbConnection.ensureConnected();
      
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('ID de cliente inválido');
      }
      
      const cliente = await Cliente.findById(id);
      
      if (!cliente) {
        throw new Error('Cliente não encontrado');
      }
      
      // Formatar dados para exibição amigável
      const clienteFormatado = cliente.toObject();
      
      // Garantir que o _id seja sempre uma string
      clienteFormatado._id = clienteFormatado._id.toString();
      
      if (clienteFormatado.cpfCnpj) {
        if (clienteFormatado.cpfCnpj.length <= 11) {
          clienteFormatado.cpfCnpjFormatado = clienteFormatado.cpfCnpj.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        } else {
          clienteFormatado.cpfCnpjFormatado = clienteFormatado.cpfCnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        }
      }
      
      if (clienteFormatado.telefone && clienteFormatado.telefone.length >= 10) {
        clienteFormatado.telefoneFormatado = clienteFormatado.telefone.length === 11 
          ? clienteFormatado.telefone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
          : clienteFormatado.telefone.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
      }
      
      if (clienteFormatado.celular && clienteFormatado.celular.length >= 10) {
        clienteFormatado.celularFormatado = clienteFormatado.celular.length === 11 
          ? clienteFormatado.celular.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
          : clienteFormatado.celular.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
      }
      
      return clienteFormatado;
    } catch (error) {
      console.error(`Erro ao buscar cliente ID ${id}:`, error);
      throw error;
    }
  }
  
  // Adicionar novo cliente
  async addCliente(clienteData) {
    try {
      await dbConnection.ensureConnected();
      
      // Remover formatação do CPF/CNPJ
      if (clienteData.cpfCnpj) {
        clienteData.cpfCnpj = clienteData.cpfCnpj.replace(/\D/g, '');
        
        // Validar CPF/CNPJ
        if (clienteData.cpfCnpj && !validarCpfCnpj(clienteData.cpfCnpj)) {
          return { 
            success: false, 
            message: 'CPF/CNPJ inválido' 
          };
        }
      }
      
      // Verificar se CPF/CNPJ já existe
      const existente = await Cliente.findOne({ cpfCnpj: clienteData.cpfCnpj });
      if (existente) {
        return { 
          success: false, 
          message: 'CPF/CNPJ já cadastrado' 
        };
      }
      
      // Limpar formatação de telefones
      if (clienteData.telefone) clienteData.telefone = clienteData.telefone.replace(/\D/g, '');
      if (clienteData.celular) clienteData.celular = clienteData.celular.replace(/\D/g, '');
      
      // Normalizar e-mail
      if (clienteData.email) clienteData.email = clienteData.email.toLowerCase().trim();
        // Criar novo cliente
      const cliente = new Cliente({
        nome: clienteData.nome,
        tipo: clienteData.tipo,
        cpfCnpj: clienteData.cpfCnpj,
        email: clienteData.email,
        telefone: clienteData.telefone,
        celular: clienteData.celular,
        enderecos: Array.isArray(clienteData.enderecos) ? clienteData.enderecos : [],
        observacoes: clienteData.observacoes,
        limiteCredito: clienteData.limiteCredito || 0,
        statusCredito: clienteData.statusCredito || 'analise',
        dataNascimento: clienteData.dataNascimento,
        ativo: true
      });
      
      await cliente.save();
      
      return { 
        success: true, 
        cliente: {
          _id: cliente._id,
          nome: cliente.nome
        },
        message: 'Cliente cadastrado com sucesso!'
      };
    } catch (error) {
      console.error('Erro ao adicionar cliente:', error);
      return { 
        success: false, 
        message: `Erro ao cadastrar cliente: ${error.message}` 
      };
    }
  }
  // Obter resumo de fiado do cliente
  async getResumoFiado(clienteId) {
    try {
      await dbConnection.ensureConnected();
      
      console.log("Recebido ID de cliente para fiado:", clienteId, "tipo:", typeof clienteId);
      creditoLogger.info(`Consulta de crédito iniciada para cliente ID: ${clienteId}`);
      
      // Tratar objeto complexo que pode conter o ObjectId
      if (typeof clienteId === 'object') {
        // Se for um ObjectId do MongoDB
        if (clienteId._bsontype === 'ObjectID' || clienteId._bsontype === 'ObjectId') {
          clienteId = clienteId.toString();
        }
        // Se for um objeto com uma propriedade buffer (representação binária do ObjectId)
        else if (clienteId.buffer && typeof clienteId.buffer === 'object') {
          // Converter o buffer para string hexadecimal
          try {
            if (clienteId.buffer instanceof ArrayBuffer || ArrayBuffer.isView(clienteId.buffer)) {
              clienteId = Array.from(new Uint8Array(clienteId.buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            } else {
              // Para outros tipos de buffer
              clienteId = Array.from(Object.values(clienteId.buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            }
          } catch (e) {
            console.error('Erro ao converter buffer para string hexadecimal:', e);
            clienteId = clienteId.toString();
          }
        }
        // Se for um objeto mas não tem formato reconhecível
        else if (clienteId.toString && clienteId.toString !== Object.prototype.toString) {
          clienteId = clienteId.toString();
        }
      }
      
      // Validar se o ID é válido para MongoDB
      if (!clienteId || (typeof clienteId === 'string' && !mongoose.Types.ObjectId.isValid(clienteId))) {
        console.error("ID de cliente inválido:", clienteId);
        creditoLogger.error(`ID de cliente inválido: ${clienteId}`);
        return { 
          success: false, 
          message: 'ID de cliente inválido' 
        };
      }
      
      // Converter para String caso seja número
      if (typeof clienteId === 'number') {
        clienteId = clienteId.toString();
        console.log("ID de cliente convertido para string:", clienteId);
      }
      
      // Tentar buscar o cliente com precaução
      const cliente = await Cliente.findOne({
        $or: [
          { _id: clienteId },
          { id: clienteId }
        ]
      });
      
      if (!cliente) {
        console.error("Cliente não encontrado com ID:", clienteId);
        return { 
          success: false, 
          message: 'Cliente não encontrado' 
        };
      }
      
      // Garantir que os valores numéricos existam para evitar erros de cálculo
      if (cliente.limiteCredito === undefined || cliente.limiteCredito === null) {
        cliente.limiteCredito = 0;
        console.log(`Cliente ${clienteId} sem limiteCredito definido, usando 0`);
      }
      
      if (cliente.saldoDevedor === undefined || cliente.saldoDevedor === null) {
        cliente.saldoDevedor = 0;
        console.log(`Cliente ${clienteId} sem saldoDevedor definido, usando 0`);
      }
        // Buscar vendas fiado pendentes
      console.log(`Buscando vendas fiado pendentes para cliente ${clienteId}`);
      let vendasPendentes = [];
      try {
        vendasPendentes = await Venda.find({
          cliente: clienteId,
          'pagamento.metodo': 'fiado',
          'pagamento.fiado.status': { $in: ['pendente', 'parcial', 'atrasado'] }
        }).sort({ dataVenda: -1 });
      } catch (err) {
        console.error(`Erro ao buscar vendas fiado: ${err.message}`);
        if (err.message && err.message.includes('Cast to ObjectId failed')) {
          // Se o erro for de conversão de ObjectId, tente novamente convertendo para ObjectId
          try {
            const objectId = mongoose.Types.ObjectId.createFromHexString(clienteId);
            vendasPendentes = await Venda.find({
              cliente: objectId,
              'pagamento.metodo': 'fiado',
              'pagamento.fiado.status': { $in: ['pendente', 'parcial', 'atrasado'] }
            }).sort({ dataVenda: -1 });
          } catch (innerError) {
            console.error(`Erro na segunda tentativa de buscar vendas: ${innerError.message}`);
            // Em caso de falha, continue com array vazio
          }
        }
        // Em caso de outros erros, continue com array vazio
      }
      
      console.log(`Encontradas ${vendasPendentes.length} vendas fiado pendentes`);
      
      // Log detalhado das vendas encontradas no resumo
      if (vendasPendentes.length > 0) {
        console.log(`Detalhes das vendas pendentes:`);
        vendasPendentes.forEach((venda, index) => {
          console.log(`  Venda ${index + 1}: Código ${venda.codigo}, Status: ${venda.pagamento?.fiado?.status}, Total: R$ ${venda.total}, Data: ${venda.dataVenda}`);
        });
      }
      
      // Calcular vendas vencidas
      const hoje = new Date();
      const vendasVencidas = vendasPendentes.filter(v => 
        v.pagamento?.fiado?.dataVencimento && v.pagamento.fiado.dataVencimento < hoje
      );
      
      console.log(`Das quais ${vendasVencidas.length} estão vencidas`);
      
      // Calcular valor vencido com segurança
      const valorVencido = vendasVencidas.reduce((total, v) => {
        const valorTotal = parseFloat(v.total || 0);
        const valorPago = parseFloat(v.pagamento?.fiado?.valorPago || 0);
        return total + (valorTotal - valorPago);
      }, 0);
      
      // Preparar o objeto de resposta com valores seguros
      const resumoCredito = {
        limiteCredito: parseFloat(cliente.limiteCredito || 0),
        creditoAdicional: parseFloat(cliente.creditoAdicional || 0),
        saldoDevedor: parseFloat(cliente.saldoDevedor || 0),
        creditoDisponivel: parseFloat(((cliente.limiteCredito || 0) + (cliente.creditoAdicional || 0)) - (cliente.saldoDevedor || 0)),
        statusCredito: cliente.statusCredito || 'analise',
        vendasPendentes: vendasPendentes.length,
        vendasVencidas: vendasVencidas.length,
        valorVencido: valorVencido,
        ultimaAtualizacao: new Date()
      };
        console.log("Resumo de fiado gerado com sucesso:", resumoCredito);
      creditoLogger.info(`Resumo de crédito gerado com sucesso para cliente ID: ${clienteId}`, {
        limiteCredito: resumoCredito.limiteCredito,
        saldoDevedor: resumoCredito.saldoDevedor,
        vendasPendentes: resumoCredito.vendasPendentes,
        vendasVencidas: resumoCredito.vendasVencidas
      });
      
      return {
        success: true,
        resumo: resumoCredito
      };
    } catch (error) {
      console.error(`Erro ao obter resumo fiado do cliente ${clienteId}:`, error);
      creditoLogger.error(`Erro ao obter resumo fiado do cliente ${clienteId}`, {
        erro: error.message,
        stack: error.stack
      });
      return { 
        success: false, 
        message: `Erro ao obter dados de fiado: ${error.message}` 
      };
    }
  }
  
  // Atualizar cliente existente
  async updateCliente(id, clienteData) {
    try {
      await dbConnection.ensureConnected();
      
      // Registrar informações detalhadas para diagnóstico
      creditoLogger.debug('Iniciando atualização de cliente', { 
        idTipo: typeof id, 
        idValor: id, 
        clienteData: { ...clienteData, senha: clienteData.senha ? '***' : undefined } 
      });
      
      // Verificação inicial para rejeitar IDs completamente inválidos
      if (!id) {
        creditoLogger.error('ID de cliente não fornecido');
        return {
          success: false,
          message: 'ID de cliente não fornecido'
        };
      }
      
      // Normalizar o ID
      let clienteId = id;
      
      console.log("Tipo de ID recebido:", typeof id, "Valor:", id);
      
      // Se for objeto, tentar extrair a string de ID
      if (typeof id === 'object' && id !== null) {
        if (id._id) {
          clienteId = typeof id._id === 'object' ? id._id.toString() : String(id._id);
          console.log("ID extraído do objeto._id:", clienteId);
        } else if (id.toString && typeof id.toString === 'function' && id.toString !== Object.prototype.toString) {
          clienteId = id.toString();
          console.log("ID convertido para string:", clienteId);
        } else {
          console.error("Não foi possível extrair um ID válido do objeto:", id);
          creditoLogger.error('ID de cliente inválido (objeto sem _id)', { id });
          return {
            success: false,
            message: 'ID de cliente inválido ou mal formatado'
          };
        }
      }
      
      // Se a string parece "[object Object]", rejeitar
      if (typeof clienteId === 'string' && (clienteId.includes('[object Object]') || clienteId === "[object Object]")) {
        console.error("ID inválido detectado:", clienteId);
        creditoLogger.error('ID de cliente inválido (string [object Object])', { idOriginal: id, idConvertido: clienteId });
        return {
          success: false,
          message: 'ID de cliente inválido (formato de objeto)'
        };
      }
      
      // Verificar se o cliente existe
      const clienteExistente = await Cliente.findById(clienteId);
      if (!clienteExistente) {
        console.error("Cliente não encontrado com ID:", clienteId);
        return {
          success: false,
          message: 'Cliente não encontrado'
        };
      }
        // Verificar se o CPF/CNPJ está sendo alterado
      if (clienteData.cpfCnpj && clienteData.cpfCnpj !== clienteExistente.cpfCnpj) {
        // Verificar se o novo CPF/CNPJ já existe em outro cliente
        const cpfCnpjEmUso = await Cliente.findOne({
          _id: { $ne: clienteId },  // excluir o cliente atual da busca
          cpfCnpj: clienteData.cpfCnpj
        });
        
        if (cpfCnpjEmUso) {
          return {
            success: false,
            message: 'CPF/CNPJ já cadastrado para outro cliente'
          };
        }
      }
      
      // Limpar formatação de telefones
      if (clienteData.telefone) clienteData.telefone = clienteData.telefone.replace(/\D/g, '');
      if (clienteData.celular) clienteData.celular = clienteData.celular.replace(/\D/g, '');
      
      // Normalizar e-mail
      if (clienteData.email) clienteData.email = clienteData.email.toLowerCase().trim();
      
      // Atualizar com os campos fornecidos
      const dadosAtualizados = {
        nome: clienteData.nome,
        tipo: clienteData.tipo,
        cpfCnpj: clienteData.cpfCnpj,
        email: clienteData.email,
        telefone: clienteData.telefone,
        celular: clienteData.celular,
        observacoes: clienteData.observacoes,
        dataNascimento: clienteData.dataNascimento,
        limiteCredito: clienteData.limiteCredito,
        statusCredito: clienteData.statusCredito
      };

      console.log('=== DEBUG CONTROLLER UPDATE (SEGUNDA FUNÇÃO) ===');
      console.log('ClienteData recebido:', clienteData);
      console.log('Limite credito no clienteData:', clienteData.limiteCredito, 'tipo:', typeof clienteData.limiteCredito);
      console.log('Status credito no clienteData:', clienteData.statusCredito, 'tipo:', typeof clienteData.statusCredito);
      console.log('DadosAtualizados antes da limpeza:', dadosAtualizados);
      
      // Manter apenas campos com valores definidos
      Object.keys(dadosAtualizados).forEach(key => {
        if (dadosAtualizados[key] === undefined) {
          delete dadosAtualizados[key];
        }
      });

      console.log('DadosAtualizados após limpeza:', dadosAtualizados);
      
      console.log('Verificando condição de endereços...');
      console.log('clienteData.enderecos:', clienteData.enderecos);
      console.log('é array?', Array.isArray(clienteData.enderecos));  
      console.log('comprimento:', clienteData.enderecos ? clienteData.enderecos.length : 'undefined');
      
      // Se houverem endereços, tratar separadamente para não substituir todos
      if (clienteData.enderecos && Array.isArray(clienteData.enderecos) && clienteData.enderecos.length > 0) {
        console.log('ENTRANDO no ramo de endereços...');
        clienteExistente.enderecos = clienteData.enderecos;
        await clienteExistente.save();
      } else {
        // NOVA ABORDAGEM: Atualizar o objeto existente e salvar
        console.log('ENTRANDO no ramo de atualização direta...');
        console.log('Atualizando objeto existente diretamente...');
        
        // Aplicar todas as mudanças ao objeto existente
        Object.keys(dadosAtualizados).forEach(key => {
          console.log(`Atualizando ${key}: ${clienteExistente[key]} -> ${dadosAtualizados[key]}`);
          clienteExistente[key] = dadosAtualizados[key];
        });
        
        console.log('Salvando objeto atualizado...');
        const clienteSalvo = await clienteExistente.save();
        
        console.log('Cliente salvo:', {
          id: clienteSalvo._id,
          nome: clienteSalvo.nome,
          limiteCredito: clienteSalvo.limiteCredito,
          statusCredito: clienteSalvo.statusCredito
        });
      }
      
      // Buscar o cliente atualizado para verificar se salvou
      const clienteVerificacao = await Cliente.findById(clienteId);
      console.log('Cliente após verificação no banco:', {
        id: clienteVerificacao._id,
        nome: clienteVerificacao.nome,
        limiteCredito: clienteVerificacao.limiteCredito,
        statusCredito: clienteVerificacao.statusCredito
      });
      
      console.log(`Cliente ${clienteId} atualizado com sucesso`);
      return {
        success: true,
        message: 'Cliente atualizado com sucesso'
      };
    } catch (error) {
      console.error('Erro ao atualizar cliente:', error);
      return {
        success: false,
        message: `Erro ao atualizar cliente: ${error.message}`
      };
    }
  }
  
  // Adicionar crédito extra ao cliente
  async adicionarCreditoExtra(clienteId, dadosCredito) {
    try {
      await dbConnection.ensureConnected();
      
      const { valor, observacao = 'Ajuste de crédito' } = dadosCredito;
      
      const valorNum = parseFloat(valor);
      if (!valorNum || valorNum <= 0) {
        return {
          success: false,
          message: 'Valor deve ser um número positivo'
        };
      }
      
      const cliente = await Cliente.findById(clienteId);
      if (!cliente) {
        return {
          success: false,
          message: 'Cliente não encontrado'
        };
      }
      
      await cliente.adicionarCreditoExtra(valorNum, observacao);
      
      return {
        success: true,
        message: `Crédito de R$ ${valorNum.toFixed(2)} adicionado com sucesso`,
        creditoAdicional: cliente.creditoAdicional
      };
    } catch (error) {
      console.error('Erro ao adicionar crédito extra:', error);
      return {
        success: false,
        message: `Erro ao adicionar crédito: ${error.message}`
      };
    }
  }
  
  // Excluir cliente
  async deleteCliente(id) {
    try {
      await dbConnection.ensureConnected();
      
      // Verificar se o cliente existe
      const clienteExistente = await Cliente.findById(id);
      if (!clienteExistente) {
        return {
          success: false,
          message: 'Cliente não encontrado'
        };
      }
      
      // Excluir o cliente diretamente do banco de dados
      await Cliente.findByIdAndDelete(id);
      
      return {
        success: true,
        message: 'Cliente excluído com sucesso'
      };
    } catch (error) {
      console.error('Erro ao excluir cliente:', error);
      return {
        success: false,
        message: `Erro ao excluir cliente: ${error.message}`
      };
    }
  }
  
  // Zerar saldo devedor do cliente (quando paga o fiado)
  async zerarSaldoDevedor(clienteId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      await dbConnection.ensureConnected();
      
      console.log(`[CREDITO] Zerando saldo devedor para cliente ID:`, clienteId, "tipo:", typeof clienteId);
      
      // Tratar objeto complexo que pode conter o ObjectId (mesmo tratamento do getResumoFiado)
      if (typeof clienteId === 'object') {
        // Se for um ObjectId do MongoDB
        if (clienteId._bsontype === 'ObjectID' || clienteId._bsontype === 'ObjectId') {
          clienteId = clienteId.toString();
        }
        // Se for um objeto com uma propriedade buffer (representação binária do ObjectId)
        else if (clienteId.buffer && typeof clienteId.buffer === 'object') {
          // Converter o buffer para string hexadecimal
          try {
            if (clienteId.buffer instanceof ArrayBuffer || ArrayBuffer.isView(clienteId.buffer)) {
              clienteId = Array.from(new Uint8Array(clienteId.buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            } else {
              // Para outros tipos de buffer
              clienteId = Array.from(Object.values(clienteId.buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            }
            console.log(`[CREDITO] ID convertido de buffer para hex:`, clienteId);
          } catch (e) {
            console.error('Erro ao converter buffer para string hexadecimal:', e);
            clienteId = clienteId.toString();
          }
        }
        // Se for um objeto mas não tem formato reconhecível
        else if (clienteId.toString && clienteId.toString !== Object.prototype.toString) {
          clienteId = clienteId.toString();
        }
      }
      
      // Validar ID
      if (!clienteId || !mongoose.Types.ObjectId.isValid(clienteId)) {
        console.error(`[CREDITO] ID de cliente inválido:`, clienteId);
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          message: 'ID de cliente inválido'
        };
      }
      
      // Buscar cliente
      const cliente = await Cliente.findById(clienteId).session(session);
      if (!cliente) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          message: 'Cliente não encontrado'
        };
      }
      
      const saldoAnterior = parseFloat(cliente.saldoDevedor) || 0;
      
      if (saldoAnterior === 0) {
        await session.abortTransaction();
        session.endSession();
        return {
          success: false,
          message: 'Cliente não possui saldo devedor'
        };
      }
      
      // Buscar todas as vendas fiado pendentes do cliente
      const vendasPendentes = await Venda.find({
        cliente: clienteId,
        'pagamento.metodo': 'fiado',
        'pagamento.fiado.status': { $in: ['pendente', 'parcial', 'atrasado'] }
      }).session(session);
      
      console.log(`[CREDITO] Encontradas ${vendasPendentes.length} vendas fiado pendentes`);
      
      // Log detalhado das vendas encontradas
      vendasPendentes.forEach((venda, index) => {
        console.log(`[CREDITO] Venda ${index + 1}: Código ${venda.codigo}, Status: ${venda.pagamento?.fiado?.status}, Total: R$ ${venda.total}`);
      });
      
      // Atualizar status de todas as vendas para "pago"
      for (const venda of vendasPendentes) {
        console.log(`[CREDITO] Atualizando venda ${venda.codigo} de "${venda.pagamento.fiado.status}" para "pago"`);
        
        venda.pagamento.fiado.status = 'pago';
        venda.pagamento.fiado.valorPago = venda.total;
        venda.pagamento.fiado.dataPagamento = new Date();
        
        // Adicionar ao histórico de pagamentos da venda
        if (!venda.pagamento.fiado.historicoPagamentos) {
          venda.pagamento.fiado.historicoPagamentos = [];
        }
        
        venda.pagamento.fiado.historicoPagamentos.push({
          valor: venda.total,
          data: new Date(),
          observacao: 'Pagamento total do fiado'
        });
        
        await venda.save({ session });
        
        console.log(`[CREDITO] Venda ${venda.codigo} salva como paga com sucesso`);
        
        console.log(`[CREDITO] Venda ${venda.codigo} marcada como paga`);
      }
      
      // Zerar o saldo devedor
      cliente.saldoDevedor = 0;
      await cliente.save({ session });
      
      console.log(`[CREDITO] Salvando histórico para cliente ID:`, clienteId, 'tipo:', typeof clienteId);
      
      // Registrar no histórico de crédito
      const historico = new HistoricoCredito({
        cliente: clienteId,
        nomeCliente: cliente.nome,
        tipo: 'pagamento',
        descricao: `Pagamento total de ${vendasPendentes.length} venda(s) fiado`,
        valor: saldoAnterior,
        saldoAnterior: saldoAnterior,
        saldoNovo: 0,
        observacoes: `${vendasPendentes.length} venda(s) quitada(s): ${vendasPendentes.map(v => v.codigo).join(', ')}`
      });
      
      console.log(`[CREDITO] Histórico criado:`, JSON.stringify(historico.toObject()));
      await historico.save({ session });
      console.log(`[CREDITO] Histórico salvo com sucesso, ID:`, historico._id);
      
      // Confirmar transação
      await session.commitTransaction();
      session.endSession();
      
      console.log(`[CREDITO] Saldo devedor zerado com sucesso para cliente ${cliente.nome}`);
      console.log(`[CREDITO] Saldo anterior: R$ ${saldoAnterior.toFixed(2)} -> Novo saldo: R$ 0,00`);
      console.log(`[CREDITO] ${vendasPendentes.length} venda(s) marcada(s) como paga(s)`);
      
      return {
        success: true,
        message: `Saldo devedor de R$ ${saldoAnterior.toFixed(2)} foi zerado com sucesso. ${vendasPendentes.length} venda(s) quitada(s).`,
        saldoAnterior: saldoAnterior,
        vendasQuitadas: vendasPendentes.length
      };
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('[CREDITO] Erro ao zerar saldo devedor:', error);
      return {
        success: false,
        message: `Erro ao zerar saldo devedor: ${error.message}`
      };
    }
  }
  
  // Buscar histórico completo de crédito do cliente
  async getHistoricoCredito(clienteId, filtros = {}) {
    try {
      await dbConnection.ensureConnected();
      
      console.log(`[CREDITO] Buscando histórico para cliente ID:`, clienteId);
      
      // Tratar objeto complexo que pode conter o ObjectId
      if (typeof clienteId === 'object') {
        if (clienteId._bsontype === 'ObjectID' || clienteId._bsontype === 'ObjectId') {
          clienteId = clienteId.toString();
        } else if (clienteId.buffer && typeof clienteId.buffer === 'object') {
          try {
            if (clienteId.buffer instanceof ArrayBuffer || ArrayBuffer.isView(clienteId.buffer)) {
              clienteId = Array.from(new Uint8Array(clienteId.buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            } else {
              clienteId = Array.from(Object.values(clienteId.buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            }
          } catch (e) {
            console.error('Erro ao converter buffer:', e);
            clienteId = clienteId.toString();
          }
        } else if (clienteId.toString && clienteId.toString !== Object.prototype.toString) {
          clienteId = clienteId.toString();
        }
      }
      
      // Validar ID
      if (!clienteId || !mongoose.Types.ObjectId.isValid(clienteId)) {
        return {
          success: false,
          message: 'ID de cliente inválido'
        };
      }
      
      // Buscar cliente para informações básicas
      const cliente = await Cliente.findById(clienteId);
      if (!cliente) {
        return {
          success: false,
          message: 'Cliente não encontrado'
        };
      }
      
      // Construir query de busca
      const query = { cliente: clienteId };
      
      if (filtros.tipo) {
        query.tipo = filtros.tipo;
      }
      
      if (filtros.dataInicio || filtros.dataFim) {
        query.dataRegistro = {};
        if (filtros.dataInicio) {
          query.dataRegistro.$gte = new Date(filtros.dataInicio);
        }
        if (filtros.dataFim) {
          query.dataRegistro.$lte = new Date(filtros.dataFim);
        }
      }
      
      // Buscar histórico
      const historico = await HistoricoCredito.find(query)
        .sort({ dataRegistro: -1 })
        .limit(filtros.limite || 100)
        .lean();
      
      // Calcular totais
      const totais = {
        totalCompras: 0,
        totalPagamentos: 0,
        quantidadeCompras: 0,
        quantidadePagamentos: 0
      };
      
      historico.forEach(registro => {
        if (registro.tipo === 'compra_fiado') {
          totais.totalCompras += registro.valor || 0;
          totais.quantidadeCompras++;
        } else if (registro.tipo === 'pagamento') {
          totais.totalPagamentos += registro.valor || 0;
          totais.quantidadePagamentos++;
        }
      });
      
      console.log(`[CREDITO] Histórico encontrado: ${historico.length} registros`);
      
      return {
        success: true,
        historico: historico,
        totais: totais,
        cliente: {
          nome: cliente.nome,
          limiteCredito: cliente.limiteCredito,
          saldoDevedor: cliente.saldoDevedor,
          statusCredito: cliente.statusCredito
        }
      };
    } catch (error) {
      console.error('[CREDITO] Erro ao buscar histórico:', error);
      return {
        success: false,
        message: `Erro ao buscar histórico: ${error.message}`
      };
    }
  }
  
  // Método para corrigir inconsistências de dados entre saldo devedor e vendas pendentes
  async sincronizarDadosCredito(clienteId) {
    try {
      await dbConnection.ensureConnected();
      
      console.log(`[CREDITO] Sincronizando dados de crédito para cliente ID: ${clienteId}`);
      
      // Tratar ID se necessário
      if (typeof clienteId === 'object') {
        if (clienteId._bsontype === 'ObjectID' || clienteId._bsontype === 'ObjectId') {
          clienteId = clienteId.toString();
        } else if (clienteId.buffer && typeof clienteId.buffer === 'object') {
          try {
            if (clienteId.buffer instanceof ArrayBuffer || ArrayBuffer.isView(clienteId.buffer)) {
              clienteId = Array.from(new Uint8Array(clienteId.buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            } else {
              clienteId = Array.from(Object.values(clienteId.buffer))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');
            }
          } catch (e) {
            console.error('Erro ao converter buffer:', e);
            clienteId = clienteId.toString();
          }
        } else if (clienteId.toString && clienteId.toString !== Object.prototype.toString) {
          clienteId = clienteId.toString();
        }
      }
      
      // Validar ID
      if (!clienteId || !mongoose.Types.ObjectId.isValid(clienteId)) {
        return {
          success: false,
          message: 'ID de cliente inválido'
        };
      }
      
      // Buscar cliente
      const cliente = await Cliente.findById(clienteId);
      if (!cliente) {
        return {
          success: false,
          message: 'Cliente não encontrado'
        };
      }
      
      console.log(`[CREDITO] Cliente encontrado: ${cliente.nome}, Saldo atual: R$ ${cliente.saldoDevedor}`);
      
      // Se o saldo devedor for 0, marcar todas as vendas pendentes como pagas
      if (parseFloat(cliente.saldoDevedor) === 0) {
        const vendasPendentes = await Venda.find({
          cliente: clienteId,
          'pagamento.metodo': 'fiado',
          'pagamento.fiado.status': { $in: ['pendente', 'parcial', 'atrasado'] }
        });
        
        console.log(`[CREDITO] Encontradas ${vendasPendentes.length} vendas pendentes para sincronizar`);
        
        if (vendasPendentes.length > 0) {
          // Usar transação para garantir consistência
          const session = await mongoose.startSession();
          session.startTransaction();
          
          try {
            for (const venda of vendasPendentes) {
              console.log(`[CREDITO] Marcando venda ${venda.codigo} como paga`);
              venda.pagamento.fiado.status = 'pago';
              venda.pagamento.fiado.valorPago = venda.total;
              venda.pagamento.fiado.dataPagamento = new Date();
              
              // Adicionar ao histórico de pagamentos da venda
              if (!venda.pagamento.fiado.historicoPagamentos) {
                venda.pagamento.fiado.historicoPagamentos = [];
              }
              
              venda.pagamento.fiado.historicoPagamentos.push({
                valor: venda.total,
                data: new Date(),
                observacao: 'Pagamento total do fiado (sincronização de dados)'
              });
              
              await venda.save({ session });
            }
            
            // Registrar no histórico de crédito se ainda não foi registrado
            const historicoPagamento = await HistoricoCredito.findOne({
              cliente: clienteId,
              tipo: 'pagamento',
              saldoNovo: 0
            }).sort({ dataRegistro: -1 });
            
            if (!historicoPagamento) {
              const valorTotalVendas = vendasPendentes.reduce((total, v) => total + parseFloat(v.total || 0), 0);
              
              const historico = new HistoricoCredito({
                cliente: clienteId,
                nomeCliente: cliente.nome,
                tipo: 'pagamento',
                descricao: `Pagamento total de ${vendasPendentes.length} venda(s) fiado (sincronização)`,
                valor: valorTotalVendas,
                saldoAnterior: valorTotalVendas,
                saldoNovo: 0,
                observacoes: `${vendasPendentes.length} venda(s) quitada(s): ${vendasPendentes.map(v => v.codigo).join(', ')}`
              });
              
              await historico.save({ session });
              console.log(`[CREDITO] Histórico de pagamento criado para sincronização`);
            }
            
            await session.commitTransaction();
            session.endSession();
            
            console.log(`[CREDITO] Sincronização concluída: ${vendasPendentes.length} vendas marcadas como pagas`);
            
            return {
              success: true,
              message: `Dados sincronizados com sucesso. ${vendasPendentes.length} vendas foram marcadas como pagas.`,
              vendasAtualizadas: vendasPendentes.length
            };
          } catch (error) {
            await session.abortTransaction();
            session.endSession();
            console.error('[CREDITO] Erro na sincronização:', error);
            return {
              success: false,
              message: `Erro na sincronização: ${error.message}`
            };
          }
        } else {
          console.log(`[CREDITO] Nenhuma venda pendente encontrada para sincronizar`);
          return {
            success: true,
            message: 'Dados já estão sincronizados',
            vendasAtualizadas: 0
          };
        }
      } else {
        console.log(`[CREDITO] Cliente tem saldo devedor (R$ ${cliente.saldoDevedor}), nenhuma sincronização necessária`);
        return {
          success: true,
          message: 'Cliente possui saldo devedor, dados estão corretos',
          vendasAtualizadas: 0
        };
      }
    } catch (error) {
      console.error('[CREDITO] Erro na sincronização de dados:', error);
      return {
        success: false,
        message: `Erro na sincronização: ${error.message}`
      };
    }
  }
}

module.exports = new ClientesController();
