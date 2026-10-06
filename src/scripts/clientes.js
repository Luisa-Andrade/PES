document.addEventListener('DOMContentLoaded', () => {
  // Referências dos elementos DOM
  const clientesList = document.getElementById('clientesList');
  const clienteForm = document.getElementById('clienteForm');
  const enderecoForm = document.getElementById('enderecoForm');
  const searchInput = document.getElementById('searchInput');
  const btnSearch = document.getElementById('btnSearch');
  const btnNovoCliente = document.getElementById('btnNovoCliente');
  const btnVoltar = document.getElementById('btnVoltar');
  const btnSalvar = document.getElementById('btnSalvar');
  const btnCancelar = document.getElementById('btnCancelar');
  const clienteFormCard = document.getElementById('clienteFormCard');
  const clientEditor = document.getElementById('clientEditor');
  const editorMessage = document.getElementById('editorMessage');
  const closeClientEditor = document.getElementById('closeClientEditor');
  const clientDetailActions = document.getElementById('clientDetailActions');
  const clientesCount = document.getElementById('clientesCount');
  const detailsTabs = document.getElementById('detailsTabs');
  const tabs = detailsTabs.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');
  const statusMessage = document.getElementById('statusMessage');
  
  // Campos do formulário principal
  const clienteId = document.getElementById('clienteId');
  const nome = document.getElementById('nome');
  const tipo = document.getElementById('tipo');
  const cpfCnpj = document.getElementById('cpfCnpj');
  const dataNascimento = document.getElementById('dataNascimento');
  const telefone = document.getElementById('telefone');
  const celular = document.getElementById('celular');
  const email = document.getElementById('email');
  const limiteCredito = document.getElementById('limiteCredito');
  const statusCredito = document.getElementById('statusCredito');
  const observacoes = document.getElementById('observacoes');
  
  // Elementos de validação
  const cpfCnpjIcon = document.getElementById('cpfCnpjIcon');
  const cpfCnpjSpinner = document.getElementById('cpfCnpjSpinner');
  const cpfCnpjError = document.getElementById('cpfCnpjError');
  const labelCpfCnpj = document.getElementById('labelCpfCnpj');
  const cpfCnpjHelp = document.getElementById('cpfCnpjHelp');
  const emailIcon = document.getElementById('emailIcon');
  const emailError = document.getElementById('emailError');
  
  // Campos do formulário de endereço
  const enderecosList = document.getElementById('enderecosList');
  const cep = document.getElementById('cep');
  const cepSpinner = document.getElementById('cepSpinner');
  const logradouro = document.getElementById('logradouro');
  const numero = document.getElementById('numero');
  const complemento = document.getElementById('complemento');
  const bairro = document.getElementById('bairro');
  const cidade = document.getElementById('cidade');
  const estado = document.getElementById('estado');
  const endPrincipal = document.getElementById('endPrincipal');
  const btnCancelarEndereco = document.getElementById('btnCancelarEndereco');
  
  // Estado da aplicação
  let clienteAtual = null;
  let modoEdicao = false;
  let enderecos = [];
  let clientsRequest = 0;
  let editorRequest = 0;
  let creditRequest = 0;
  let cepRequest = 0;
  let cepDebounce;
  let lastEditorTrigger = null;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  // Mostrar mensagem de status
  function showMessage(message, isError = false, isProcessing = false) {
    const target = clientEditor.hidden ? statusMessage : editorMessage;
    target.textContent = message;
    target.className = `status-message ${isError ? 'error' : (isProcessing ? 'processing' : 'success')}`;
    target.style.display = 'block';
    
    // Esconder após 5 segundos (exceto se for mensagem de processamento)
    if (!isProcessing) {
      setTimeout(() => {
        if (target.textContent === message) target.style.display = 'none';
      }, 5000);
    }
    if (target === editorMessage) clienteFormCard.querySelector('.card-body').scrollTop = 0;
  }
  
  // Abrir o cadastro sobre a lista, mantendo a posição da página.
  function mostrarFormulario() {
    if (clientEditor.hidden) lastEditorTrigger = document.activeElement;
    clientEditor.hidden = false;
    document.body.classList.add('client-editor-open');
    document.documentElement.classList.add('client-editor-open');
    clienteFormCard.querySelector('.card-body').scrollTop = 0;
    closeClientEditor.focus();
  }
  
  function ocultarFormulario() {
    if (clientEditor.hidden) return;
    editorRequest++;
    creditRequest++;
    clearTimeout(cepDebounce);
    cepRequest++;
    cepSpinner.style.display = 'none';
    clientEditor.hidden = true;
    document.body.classList.remove('client-editor-open');
    document.documentElement.classList.remove('client-editor-open');
    editorMessage.style.display = 'none';
    document.querySelectorAll('.client-item.active').forEach(item => item.classList.remove('active'));
    if (lastEditorTrigger?.isConnected) lastEditorTrigger.focus({ preventScroll: true });
    else btnNovoCliente.focus({ preventScroll: true });
    lastEditorTrigger = null;
  }

  function scrollDentroDoEditor(element) {
    const body = clienteFormCard.querySelector('.card-body');
    const top = element.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 16;
    body.scrollTo({ top, behavior: 'smooth' });
  }
  
  // Função para alternar tipo de pessoa (física/jurídica)
  window.alternarTipoPessoa = () => {
    const tipoPessoa = tipo.value;
    const pessoaFisica = tipoPessoa === 'pessoa_fisica';
    cpfCnpj.maxLength = pessoaFisica ? 14 : 18;
    cpfCnpj.inputMode = 'numeric';
    
    if (pessoaFisica) {
      labelCpfCnpj.textContent = 'CPF';
      cpfCnpj.placeholder = '000.000.000-00';
      cpfCnpjHelp.textContent = 'Formato: 000.000.000-00';
      labelDataNascimento.textContent = 'Data de Nascimento';
    } else {
      labelCpfCnpj.textContent = 'CNPJ';
      cpfCnpj.placeholder = '00.000.000/0000-00';
      cpfCnpjHelp.textContent = 'Formato: 00.000.000/0000-00';
      labelDataNascimento.textContent = 'Data de Fundação';
    }
    
    // Limpar o campo e validações quando altera o tipo
    cpfCnpj.value = '';
    cpfCnpjIcon.style.display = 'none';
    cpfCnpj.classList.remove('is-valid', 'is-invalid');
    cpfCnpjError.style.display = 'none';
  };

  // Buscar clientes
  async function carregarClientes(filtro = '') {
    const request = ++clientsRequest;
    try {
      clientesList.innerHTML = '<tr><td colspan="6" class="no-data">Carregando clientes...</td></tr>';
      clientesCount.textContent = 'Carregando clientes...';
      
      console.log('Carregando clientes com filtro:', filtro);
      
      if (!window.clientesAPI) {
        throw new Error('API de clientes não está disponível');
      }
      
      const clientes = await window.clientesAPI.getClientes(filtro);
      if (request !== clientsRequest) return;
      clientesCount.textContent = `Exibindo ${clientes?.length || 0} ${clientes?.length === 1 ? 'cliente' : 'clientes'}`;
      
      if (!clientes || clientes.length === 0) {
        clientesList.innerHTML = `<tr><td colspan="6" class="no-data">${filtro ? 'Nenhum cliente corresponde à busca.' : 'Nenhum cliente cadastrado.'}</td></tr>`;
        return;
      }
      
      clientesList.innerHTML = '';
      
      clientes.forEach(cliente => {
        const clienteItem = document.createElement('tr');
        clienteItem.className = 'client-item';
        clienteItem.dataset.id = cliente._id;
        
        const tipoLabel = cliente.tipo === 'pessoa_fisica' ? '<span class="client-type pf">Pessoa física</span>' : '<span class="client-type pj">Pessoa jurídica</span>';
        const statusEl = cliente.ativo === false ? '<span class="client-status inactive">Inativo</span>' : '<span class="client-status active">Ativo</span>';
        clienteItem.innerHTML = `
          <td class="client-content" data-label="Cliente"><button type="button" class="client-open">${escapeHtml(cliente.nome || 'Cliente sem nome')}</button></td>
          <td data-label="CPF/CNPJ">${escapeHtml(cliente.cpfCnpjFormatado || cliente.cpfCnpj || '—')}</td>
          <td data-label="Contato">${escapeHtml(cliente.celularFormatado || cliente.celular || cliente.telefoneFormatado || cliente.telefone || '—')}</td>
          <td data-label="Tipo">${tipoLabel}</td>
          <td data-label="Situação">${statusEl}</td>
          <td data-label="Ações"><div class="client-actions"><button type="button" class="btn-icon btn-edit" aria-label="Editar ${escapeHtml(cliente.nome)}">Editar</button><button type="button" class="btn-icon btn-delete" aria-label="Excluir ${escapeHtml(cliente.nome)}">Excluir</button></div></td>
        `;
        
        // Adicionar evento para clicar no cliente (área do conteúdo)
        const contentArea = clienteItem.querySelector('.client-content');
        contentArea.addEventListener('click', () => {
          document.querySelectorAll('.client-item').forEach(item => {
            item.classList.remove('active');
          });
          clienteItem.classList.add('active');
          carregarDetalhesCliente(cliente._id);
        });
        
        // Adicionar eventos para os botões de ação
        const btnEdit = clienteItem.querySelector('.btn-edit');
        const btnDelete = clienteItem.querySelector('.btn-delete');
        
        btnEdit.addEventListener('click', async (event) => {
          event.stopPropagation(); // Evitar propagar o clique para o item
          document.querySelectorAll('.client-item').forEach(item => {
            item.classList.remove('active');
          });
          clienteItem.classList.add('active');
          await carregarDetalhesCliente(cliente._id);
        });
        
        btnDelete.addEventListener('click', (event) => {
          event.stopPropagation(); // Evitar propagar o clique para o item
          excluirCliente(cliente._id, cliente.nome);
        });
        
        clientesList.appendChild(clienteItem);
      });
    } catch (error) {
      if (request !== clientsRequest) return;
      console.error('Erro ao carregar clientes:', error);
      clientesList.innerHTML = '<tr><td colspan="6" class="no-data">Erro ao carregar clientes.</td></tr>';
      clientesCount.textContent = 'Não foi possível carregar a lista';
      showMessage('Erro ao carregar lista de clientes', true);
    }
  }
  // Carregar detalhes do cliente
  async function carregarDetalhesCliente(id) {
    const request = ++editorRequest;
    try {
      // Mostrar mensagem de carregamento
      document.getElementById('detailsTitle').textContent = 'Carregando...';
      mostrarFormulario();
      
      if (!window.clientesAPI) {
        throw new Error('API de clientes não está disponível');
      }
      
      const cliente = await window.clientesAPI.getClienteById(id);
      if (request !== editorRequest || clientEditor.hidden) return;
      clienteAtual = cliente;
      modoEdicao = true;
      clientDetailActions.hidden = false;
      
      // Atualizar título com nome do cliente
      document.getElementById('detailsTitle').textContent = `Cliente: ${cliente.nome}`;
      
      // Preencher formulário
      clienteId.value = cliente._id;
      nome.value = cliente.nome || '';
      tipo.value = cliente.tipo || 'pessoa_fisica';
      
      // Atualizar label e formatação conforme tipo
      alternarTipoPessoa();
      
      // Usar CPF/CNPJ formatado para exibição
      cpfCnpj.value = cliente.cpfCnpjFormatado || cliente.cpfCnpj || '';
      
      if (cliente.dataNascimento) {
        const dataNasc = new Date(cliente.dataNascimento);
        dataNascimento.valueAsDate = dataNasc;
      } else {
        dataNascimento.value = '';
      }
      
      telefone.value = cliente.telefoneFormatado || cliente.telefone || '';
      celular.value = cliente.celularFormatado || cliente.celular || '';
      email.value = cliente.email || '';
      limiteCredito.value = formatarValorParaExibicao(cliente.limiteCredito || 0);
      statusCredito.value = cliente.statusCredito || 'analise';
      observacoes.value = cliente.observacoes || '';
      
      // Carregar endereços
      carregarEnderecos(cliente.enderecos || []);
      
      // Carregar informações de crédito
      carregarInformacoesCredito(cliente._id);
      
      // Mostrar campos de detalhes
      document.querySelectorAll('.client-item').forEach(item => {
        const isActive = item.dataset.id === id;
        item.classList.toggle('active', isActive);
      });
      
      // Validar campos preenchidos
      validarCpfCnpj();
      validarEmail();
      nome.focus();
    } catch (error) {
      if (request !== editorRequest) return;
      console.error('Erro ao carregar detalhes do cliente:', error);
      ocultarFormulario();
      showMessage('Erro ao carregar detalhes do cliente', true);
    }
  }
  
  // Carregar informações de crédito do cliente
  async function carregarInformacoesCredito(clienteId) {
    if (!clienteId) return;
    const request = ++creditRequest;
    
    try {
      // Resetar as abas de crédito
      document.getElementById('creditoDetalheContent').style.display = 'none';
      document.getElementById('creditoErro').style.display = 'none';
      document.getElementById('creditoSpinner').style.display = 'inline-block';
      document.querySelector('.credito-status-loading').style.display = 'block';
      
      if (!window.clientesAPI || !window.clientesAPI.getResumoFiado) {
        console.error('API de crédito não está disponível - o método getResumoFiado não foi encontrado');
        throw new Error('API de crédito não está disponível');
      }
      
      // Garantir que o ID seja uma string simples
      let idParaConsulta = clienteId;
      if (typeof clienteId === 'object' && clienteId !== null) {
        // Se for um objeto, tenta converter para string
        if (clienteId.toString && typeof clienteId.toString === 'function' && 
            clienteId.toString !== Object.prototype.toString) {
          idParaConsulta = clienteId.toString();
        }
      }
      
      console.log('Carregando informações de crédito para ID:', idParaConsulta);
      const resultado = await window.clientesAPI.getResumoFiado(idParaConsulta);
      if (request !== creditRequest || clientEditor.hidden || String(clienteAtual?._id) !== String(idParaConsulta)) return;
      console.log('Resultado do getResumoFiado:', resultado);
      
      if (resultado && resultado.success && resultado.resumo) {
        // Ocultar loading e mostrar detalhes
        document.querySelector('.credito-status-loading').style.display = 'none';
        document.getElementById('creditoDetalheContent').style.display = 'block';
        
        const resumo = resultado.resumo;
        
        // Status do crédito
        const statusElement = document.getElementById('statusCreditoValue');
        statusElement.textContent = formatarStatusCredito(resumo.statusCredito);
        statusElement.className = `status-${resumo.statusCredito || 'analise'}`;
        
        // Valores de crédito
        document.getElementById('limiteCreditoValue').textContent = formatarValorParaExibicao(resumo.limiteCredito || 0);
        document.getElementById('saldoDevedorValue').textContent = formatarValorParaExibicao(resumo.saldoDevedor || 0);
        document.getElementById('creditoAdicionalValue').textContent = formatarValorParaExibicao(resumo.creditoAdicional || 0);
        document.getElementById('creditoDisponivelValue').textContent = formatarValorParaExibicao(resumo.creditoDisponivel || 0);
        
        // Calcular porcentagem utilizada do limite
        const creditoTotal = Number(resumo.limiteCredito || 0) + Number(resumo.creditoAdicional || 0);
        const percentualUtilizado = creditoTotal > 0
          ? Math.min(100, Math.max(0, Math.round(Number(resumo.saldoDevedor || 0) / creditoTotal * 100)))
          : Number(resumo.saldoDevedor || 0) > 0 ? 100 : 0;
        
        document.getElementById('creditoBarraPreenchido').style.width = `${percentualUtilizado}%`;
        
        // Colorir barra conforme uso
        const barraEl = document.getElementById('creditoBarraPreenchido');
        if (percentualUtilizado < 50) {
          barraEl.style.backgroundColor = '#43a047'; // Verde
        } else if (percentualUtilizado < 80) {
          barraEl.style.backgroundColor = '#ff9800'; // Laranja
        } else {
          barraEl.style.backgroundColor = '#e53935'; // Vermelho
        }
        
        // Informações de fiado
        document.getElementById('vendasPendentesValue').textContent = resumo.vendasPendentes || 0;
        document.getElementById('vendasVencidasValue').textContent = resumo.vendasVencidas || 0;
        document.getElementById('btnPagouCredito').disabled = Number(resumo.saldoDevedor || 0) <= 0;
        
        // Valor vencido - destacar se for maior que zero
        const valorVencidoEl = document.getElementById('valorVencidoValue');
        valorVencidoEl.textContent = formatarValorParaExibicao(resumo.valorVencido || 0);
        
        if (resumo.valorVencido > 0) {
          valorVencidoEl.classList.add('valor-vencido');
        } else {
          valorVencidoEl.classList.remove('valor-vencido');
        }
        
        // Adicionar tooltip com data de atualização se disponível
        if (resumo.ultimaAtualizacao) {
          const dataAtualizacao = new Date(resumo.ultimaAtualizacao);
          const dataFormatada = dataAtualizacao.toLocaleString('pt-BR');
          
          const creditoInfo = document.getElementById('creditoInfo');
          creditoInfo.setAttribute('title', `Informações atualizadas em: ${dataFormatada}`);
        }
        
      } else {
        throw new Error(resultado?.message || 'Erro desconhecido');
      }
    } catch (error) {
      if (request !== creditRequest) return;
      console.error('Erro ao carregar informações de crédito:', error);
      document.querySelector('.credito-status-loading').style.display = 'none';
      document.getElementById('creditoErro').style.display = 'block';
    }
  }
  
  // Formatar status de crédito para exibição
  function formatarStatusCredito(status) {
    if (!status) return 'Não Definido';
    
    switch (status) {
      case 'ativo': return 'ATIVO';
      case 'bloqueado': return 'BLOQUEADO';
      case 'analise': return 'EM ANÁLISE';
      default: return status.toUpperCase();
    }  }
  
  // Função para zerar saldo devedor (quando cliente paga)
  async function zerarSaldoDevedor() {
    if (!clienteAtual || !clienteAtual._id) {
      showMessage('Nenhum cliente selecionado', true);
      return;
    }
    
    try {
      const saldoAtual = document.getElementById('saldoDevedorValue').textContent;
      
      // Confirmar ação
      if (!confirm(`Confirma que o cliente ${clienteAtual.nome} pagou o saldo devedor de R$ ${saldoAtual}?`)) {
        return;
      }
      
      // Exibir mensagem de processamento
      showMessage('Processando pagamento...', false, true);
      
      const resultado = await window.clientesAPI.zerarSaldoDevedor(clienteAtual._id);
      
      if (resultado.success) {
        showMessage(resultado.message || 'Saldo devedor zerado com sucesso!');
        
        // Recarregar informações de crédito
        await carregarInformacoesCredito(clienteAtual._id);
      } else {
        showMessage(resultado.message || 'Erro ao zerar saldo devedor', true);
      }
    } catch (error) {
      console.error('Erro ao zerar saldo devedor:', error);
      showMessage('Ocorreu um erro ao processar o pagamento', true);
    }
  }
  
  // Função para adicionar crédito extra ao cliente (devolução, ajuste, etc.)
  async function adicionarCreditoExtra() {
    if (!clienteAtual || !clienteAtual._id) {
      showMessage('Nenhum cliente selecionado', true);
      return;
    }
    
    // Verificar se a API está disponível
    if (!window.clientesAPI || !window.clientesAPI.adicionarCreditoExtra) {
      showMessage('Erro: Funcionalidade não disponível. Recarregue a página.', true);
      return;
    }
    
    // Abrir modal
    const modal = document.getElementById('modalCreditoExtra');
    const modalClienteNome = document.getElementById('modalClienteNome');
    const modalValorCredito = document.getElementById('modalValorCredito');
    const modalObservacao = document.getElementById('modalObservacao');
    const btnConfirmar = document.getElementById('btnConfirmarCredito');
    const btnCancelar = document.getElementById('btnCancelarCredito');
    const btnFechar = document.getElementById('btnFecharModalCredito');
    const erroCredito = document.getElementById('creditoExtraErro');
    
    // Configurar modal
    modalClienteNome.textContent = clienteAtual.nome;
    modalValorCredito.value = '';
    modalObservacao.value = '';
    erroCredito.style.display = 'none';
    btnConfirmar.disabled = false;
    btnCancelar.disabled = false;
    btnFechar.disabled = false;
    modal.style.display = 'flex';
    
    // Focar no campo de valor
    setTimeout(() => modalValorCredito.focus(), 100);
    
    // Aplicar formatação ao campo de valor
    modalValorCredito.oninput = function() {
      window.formatarValor(this);
      erroCredito.style.display = 'none';
    };

    const mostrarErroCredito = message => {
      erroCredito.textContent = message;
      erroCredito.style.display = 'block';
    };
    
    // Função para fechar modal
    const fecharModal = () => {
      modal.style.display = 'none';
      btnConfirmar.onclick = null;
      btnCancelar.onclick = null;
      btnFechar.onclick = null;
      btnCancelar.disabled = false;
      btnFechar.disabled = false;
      btnAdicionarCredito?.focus({ preventScroll: true });
    };
    
    // Eventos de fechar
    btnCancelar.onclick = fecharModal;
    btnFechar.onclick = fecharModal;
    
    // Evento de confirmar
    btnConfirmar.onclick = async () => {
      try {
        const valorInput = modalValorCredito.value;
        const observacao = modalObservacao.value;
        
        if (!valorInput || valorInput.trim() === '' || valorInput === '0,00') {
          mostrarErroCredito('Digite um valor de crédito válido.');
          return;
        }
        
        // Converter valor para número
        const valorNumerico = converterValorParaNumero(valorInput);
        
        if (isNaN(valorNumerico) || valorNumerico <= 0) {
          mostrarErroCredito('O valor do crédito deve ser maior que zero.');
          return;
        }
        btnConfirmar.disabled = true;
        btnCancelar.disabled = true;
        btnFechar.disabled = true;
        
        const resultado = await window.clientesAPI.adicionarCreditoExtra(clienteAtual._id, {
          valor: valorNumerico,
          observacao: observacao || 'Crédito extra adicionado'
        });
        
        if (resultado && resultado.success === true) {
          fecharModal();
          showMessage(`Crédito extra de R$ ${formatarValorParaExibicao(valorNumerico)} adicionado com sucesso!`);
          
          // Recarregar informações de crédito
          await carregarInformacoesCredito(clienteAtual._id);
        } else {
          mostrarErroCredito(resultado?.message || 'Erro ao adicionar crédito extra.');
        }
      } catch (error) {
        console.error('Erro ao adicionar crédito extra:', error);
        mostrarErroCredito('Não foi possível adicionar o crédito extra.');
      } finally {
        btnConfirmar.disabled = false;
        btnCancelar.disabled = false;
        btnFechar.disabled = false;
      }
    };
  }
  
  // Função para sincronizar dados de crédito (corrige inconsistências)
  async function sincronizarDadosCredito() {
    if (!clienteAtual || !clienteAtual._id) {
      showMessage('Nenhum cliente selecionado', true);
      return;
    }
    
    try {
      // Confirmar ação
      if (!confirm(`Confirma a sincronização dos dados de crédito do cliente ${clienteAtual.nome}?\n\nIsso irá corrigir possíveis inconsistências entre o saldo devedor e as vendas pendentes.`)) {
        return;
      }
      
      // Exibir mensagem de processamento
      showMessage('Sincronizando dados de crédito...', false, true);
      
      const resultado = await window.clientesAPI.sincronizarDadosCredito(clienteAtual._id);
      
      if (resultado.success) {
        showMessage(resultado.message || 'Dados sincronizados com sucesso!');
        
        // Recarregar informações de crédito
        await carregarInformacoesCredito(clienteAtual._id);
      } else {
        showMessage(resultado.message || 'Erro ao sincronizar dados', true);
      }
    } catch (error) {
      console.error('Erro ao sincronizar dados de crédito:', error);
      showMessage('Ocorreu um erro ao sincronizar os dados', true);
    }
  }
  
  // Função para excluir cliente
  async function excluirCliente(id, nome) {
    if (!id) {
      showMessage('ID de cliente inválido', true);
      return;
    }
    
    try {
      // Confirmar exclusão
      if (!confirm(`Tem certeza que deseja excluir o cliente "${nome}"? Esta ação não pode ser desfeita.`)) {
        return;
      }
      
      // Exibir mensagem de processamento
      showMessage('Excluindo cliente, aguarde...', false, true);
      
      const resultado = await window.clientesAPI.deleteCliente(id);
      
      if (resultado.success) {
        // Resetar cliente atual se for o que foi excluído
        if (clienteAtual && clienteAtual._id === id) {
          limparFormulario();
          ocultarFormulario();
        }
        
        // Recarregar lista de clientes
        await carregarClientes(searchInput.value);
        showMessage(resultado.message || 'Cliente excluído com sucesso!');
      } else {
        showMessage(resultado.message || 'Erro ao excluir cliente', true);
      }
    } catch (error) {
      console.error('Erro ao excluir cliente:', error);
      showMessage('Ocorreu um erro ao excluir o cliente', true);
    }
  }
  
  // Carregar endereços
  function carregarEnderecos(listaEnderecos) {
    enderecosList.innerHTML = '';
    enderecos = listaEnderecos || [];
    
    if (!enderecos.length) {
      enderecosList.innerHTML = '<div class="no-data">Nenhum endereço cadastrado</div>';
      return;
    }
    
    enderecos.forEach((endereco, index) => {
      const enderecoItem = document.createElement('div');
      enderecoItem.className = 'endereco-item';
      
      const isPrincipal = endereco.principal ? 
        '<span class="principal-tag">Principal</span>' : '';
      
      // Formatação de CEP se existir
      let cepFormatado = '';
      if (endereco.cep) {
        const cepLimpo = endereco.cep.replace(/\D/g, '');
        cepFormatado = `CEP: ${cepLimpo.replace(/(\d{5})(\d{3})/, '$1-$2')}`;
      }
      
      enderecoItem.innerHTML = `
        <div class="endereco-header">
          ${endereco.logradouro}, ${endereco.numero} ${endereco.complemento ? '- ' + endereco.complemento : ''} ${isPrincipal}
        </div>
        <div class="endereco-details">
          <div>${endereco.bairro} - ${endereco.cidade}/${endereco.estado}</div>
          <div>${cepFormatado}</div>
        </div>
        <div class="endereco-actions">
          <button type="button" class="btn-icon btn-edit" data-index="${index}" title="Editar">
            <i class="fas fa-edit"></i>
          </button>
          <button type="button" class="btn-icon btn-delete" data-index="${index}" title="Excluir">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      `;
      
      // Adicionar eventos de edição e exclusão de endereço
      const btnEdit = enderecoItem.querySelector('.btn-edit');
      const btnDelete = enderecoItem.querySelector('.btn-delete');
      
      btnEdit.addEventListener('click', () => {
        editarEndereco(index);
      });
      
      btnDelete.addEventListener('click', () => {
        if (confirm('Tem certeza que deseja excluir este endereço?')) {
          removerEndereco(index);
        }
      });
      
      enderecosList.appendChild(enderecoItem);
    });
  }

  // Editar endereço existente
  function editarEndereco(index) {
    if (!enderecos[index]) return;
    
    const endereco = enderecos[index];
    
    // Preencher formulário
    logradouro.value = endereco.logradouro;
    numero.value = endereco.numero;
    complemento.value = endereco.complemento || '';
    bairro.value = endereco.bairro;
    cidade.value = endereco.cidade;
    estado.value = endereco.estado;
    endPrincipal.value = endereco.principal ? 'true' : 'false';
    
    if (endereco.cep) {
      cep.value = endereco.cep.replace(/(\d{5})(\d{3})/, '$1-$2');
    } else {
      cep.value = '';
    }
    
    // Mudar botão para modo edição
    btnSalvarEndereco.textContent = 'Atualizar';
    btnSalvarEndereco.dataset.mode = 'edit';
    btnSalvarEndereco.dataset.index = index;
    
    scrollDentroDoEditor(enderecoForm);
  }

  // Remover endereço
  function removerEndereco(index) {
    if (!enderecos[index]) return;
    enderecos.splice(index, 1);
    carregarEnderecos(enderecos);
  }
  // Limpar formulário
  function limparFormulario() {
    clienteForm.reset();
    enderecoForm.reset();
    clienteId.value = '';
    clienteAtual = null;
    modoEdicao = false;
    enderecos = [];
    
    // Resetar formulário de endereço
    btnSalvarEndereco.textContent = 'Adicionar';
    btnSalvarEndereco.dataset.mode = 'add';
    delete btnSalvarEndereco.dataset.index;
    
    // Limpar quaisquer mensagens de erro nos campos
    document.querySelectorAll('.form-error').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    document.getElementById('detailsTitle').textContent = 'Novo Cliente';
    clientDetailActions.hidden = true;
    document.querySelectorAll('.client-item').forEach(item => item.classList.remove('active'));
    
    // Limpar validações
    cpfCnpjIcon.style.display = 'none';
    cpfCnpj.classList.remove('is-valid', 'is-invalid');
    cpfCnpjError.style.display = 'none';
    emailIcon.style.display = 'none';
    email.classList.remove('is-valid', 'is-invalid');
    emailError.style.display = 'none';
    
    // Resetar para o tipo pessoa física
    tipo.value = 'pessoa_fisica';
    alternarTipoPessoa();
    
    // Recarregar a lista vazia
    enderecosList.innerHTML = '<div class="no-data">Nenhum endereço cadastrado</div>';
    
    // Voltar para a primeira aba
    tabs.forEach(tab => tab.classList.remove('active'));
    tabContents.forEach(content => content.classList.remove('active'));
    tabs[0].classList.add('active');
    document.getElementById('tabInfo').classList.add('active');
    
    // Focar no primeiro campo
  }

  // Salvar cliente
  async function salvarCliente(event) {
    event.preventDefault();
    
    try {
      // Validar campos obrigatórios
      if (!nome.value.trim()) {
        nome.classList.add('is-invalid');
        document.getElementById('nomeError').style.display = 'block';
        nome.focus();
        return;
      }
      
      // Validar CPF/CNPJ
      if (!validarCpfCnpj()) {
        cpfCnpj.focus();
        return;
      }
      
      // Validar e-mail se preenchido
      if (email.value && !validarEmail()) {
        email.focus();
        return;
      }
        // Preparar dados
      const clienteData = {
        nome: nome.value.trim(),
        tipo: tipo.value,
        cpfCnpj: cpfCnpj.value,
        dataNascimento: dataNascimento.value || null,
        telefone: telefone.value,
        celular: celular.value,
        email: email.value.trim(),
        observacoes: observacoes.value.trim(),
        limiteCredito: converterValorParaNumero(limiteCredito.value),
        statusCredito: statusCredito.value,
        enderecos: enderecos,  // Incluir a lista de endereços
        ativo: true
      };

      btnSalvar.disabled = true;
      let resultado;
      if (modoEdicao && clienteId.value) {
        // Garantir que o ID seja uma string válida e não um objeto
        const idParaEnviar = String(clienteId.value).trim();
        
        // Verificar se o ID é válido antes de enviar
        if (!idParaEnviar || idParaEnviar === '[object Object]') {
          console.error("ID inválido no formulário:", idParaEnviar);
          showMessage("ID de cliente inválido. Por favor, recarregue a página.", true);
          return;
        }
        
        try {
          // Atualizar cliente existente
          resultado = await window.clientesAPI.updateCliente(idParaEnviar, clienteData);
        } catch (idError) {
          console.error("Erro ao processar ID:", idError);
          showMessage(`Erro ao processar ID do cliente: ${idError.message}`, true);
          return;
        }
      } else {
        // Adicionar novo cliente
        resultado = await window.clientesAPI.addCliente(clienteData);
      }
      
      if (resultado.success) {
        // Recarregar lista de clientes
        searchInput.value = '';
        await carregarClientes();
        limparFormulario();
        ocultarFormulario();
        showMessage(resultado.message || 'Cliente salvo com sucesso!');
      } else {
        showMessage(resultado.message || 'Erro ao salvar cliente', true);
      }
    } catch (error) {
      console.error('Erro ao salvar cliente:', error);
      showMessage('Erro ao salvar cliente: ' + error.message, true);
    } finally {
      btnSalvar.disabled = false;
    }
  }

  // Salvar endereço
  function salvarEndereco(event) {
    event.preventDefault();
    
    // Preparar objeto de endereço
    const endereco = {
      logradouro: logradouro.value.trim(),
      numero: numero.value.trim(),
      complemento: complemento.value.trim(),
      bairro: bairro.value.trim(),
      cidade: cidade.value.trim(),
      estado: estado.value,
      cep: cep.value.replace(/\D/g, ''),
      principal: endPrincipal.value === 'true'
    };
    
    // Se for principal, desmarcar outros endereços
    if (endereco.principal) {
      enderecos.forEach(end => end.principal = false);
    }
    
    // Se for modo edição, atualizar endereço existente
    if (btnSalvarEndereco.dataset.mode === 'edit') {
      const index = parseInt(btnSalvarEndereco.dataset.index);
      if (!isNaN(index) && enderecos[index]) {
        enderecos[index] = endereco;
      }
    } else {
      // Adicionar novo endereço
      enderecos.push(endereco);
    }
    
    // Recarregar lista de endereços
    carregarEnderecos(enderecos);
    
    // Limpar formulário
    enderecoForm.reset();
    btnSalvarEndereco.textContent = 'Adicionar';
    btnSalvarEndereco.dataset.mode = 'add';
    delete btnSalvarEndereco.dataset.index;
    
    showMessage('Endereço adicionado com sucesso! Clique em "Salvar" para finalizar.');
  }
  
  // Buscar CEP
  async function buscarCep() {
    const cepValue = cep.value.replace(/\D/g, '');
    const request = ++cepRequest;
    
    if (cepValue.length !== 8) {
      showMessage('CEP inválido. Informe um CEP com 8 dígitos.', true);
      return;
    }
    
    try {
      // Mostrar loading
      cepSpinner.style.display = 'block';
      
      const response = await fetch(`https://viacep.com.br/ws/${cepValue}/json/`);
      if (!response.ok) throw new Error('Erro ao buscar CEP');
      
      const data = await response.json();
      if (request !== cepRequest || cep.value.replace(/\D/g, '') !== cepValue) return;
      
      if (data.erro) {
        showMessage('CEP não encontrado', true);
        return;
      }
      
      // Preencher campos
      logradouro.value = data.logradouro || '';
      bairro.value = data.bairro || '';
      cidade.value = data.localidade || '';
      estado.value = data.uf || '';
      
      // Focar no número que geralmente não vem preenchido
      numero.focus();
      
    } catch (error) {
      if (request !== cepRequest) return;
      console.error('Erro ao buscar CEP:', error);
      showMessage('Erro ao consultar CEP', true);
    } finally {
      if (request === cepRequest) cepSpinner.style.display = 'none';
    }
  }

  // Funções de validação e formatação
  
  // Validar CPF/CNPJ
  function validarCpfCnpj() {
    const valor = cpfCnpj.value.replace(/\D/g, '');
    
    if (!valor) {
      // CPF/CNPJ é opcional agora, então campo vazio é válido
      cpfCnpj.classList.remove('is-invalid', 'is-valid');
      cpfCnpjError.style.display = 'none';
      cpfCnpjIcon.style.display = 'none';
      return true;
    }
    
    const pessoaFisica = tipo.value === 'pessoa_fisica';
    const tamanho = pessoaFisica ? 11 : 14;
    const valido = valor.length === tamanho && (pessoaFisica ? validaCPF(valor) : validaCNPJ(valor));
    cpfCnpjError.textContent = valor.length !== tamanho
      ? `${pessoaFisica ? 'CPF' : 'CNPJ'} deve ter ${tamanho} dígitos.`
      : `${pessoaFisica ? 'CPF' : 'CNPJ'} inválido.`;
    
    if (valido) {
      cpfCnpj.classList.remove('is-invalid');
      cpfCnpj.classList.add('is-valid');
      cpfCnpjError.style.display = 'none';
      cpfCnpjIcon.style.display = 'block';
      cpfCnpjIcon.className = 'input-icon fas fa-check-circle valid';
    } else {
      cpfCnpj.classList.remove('is-valid');
      cpfCnpj.classList.add('is-invalid');
      cpfCnpjError.style.display = 'block';
      cpfCnpjIcon.style.display = 'block';
      cpfCnpjIcon.className = 'input-icon fas fa-times-circle invalid';
    }
    
    return valido;
  }
  
  // Validar e-mail
  function validarEmail() {
    if (!email.value) return true;  // Email não é obrigatório
    
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const valido = re.test(email.value);
    
    if (valido) {
      email.classList.remove('is-invalid');
      email.classList.add('is-valid');
      emailError.style.display = 'none';
      emailIcon.style.display = 'block';
      emailIcon.className = 'input-icon fas fa-check-circle valid';
    } else {
      email.classList.remove('is-valid');
      email.classList.add('is-invalid');
      emailError.style.display = 'block';
      emailIcon.style.display = 'block';
      emailIcon.className = 'input-icon fas fa-times-circle invalid';
    }
    
    return valido;
  }
  
  // Validações CPF e CNPJ
  function validaCPF(cpf) {
    if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
    
    let soma = 0;
    for (let i = 1; i <= 9; i++) {
      soma += parseInt(cpf.substring(i-1, i)) * (11 - i);
    }
    
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.substring(9, 10))) return false;
    
    soma = 0;
    for (let i = 1; i <= 10; i++) {
      soma += parseInt(cpf.substring(i-1, i)) * (12 - i);
    }
    
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpf.substring(10, 11))) return false;
    
    return true;
  }
  
  function validaCNPJ(cnpj) {
    if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
    
    let tamanho = cnpj.length - 2;
    let numeros = cnpj.substring(0, tamanho);
    const digitos = cnpj.substring(tamanho);
    let soma = 0;
    let pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
      soma += numeros.charAt(tamanho - i) * pos--;
      if (pos < 2) pos = 9;
    }
    
    let resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado !== parseInt(digitos.charAt(0))) return false;
    
    tamanho = tamanho + 1;
    numeros = cnpj.substring(0, tamanho);
    soma = 0;
    pos = tamanho - 7;
    
    for (let i = tamanho; i >= 1; i--) {
      soma += numeros.charAt(tamanho - i) * pos--;
      if (pos < 2) pos = 9;
    }
    
    resultado = soma % 11 < 2 ? 0 : 11 - soma % 11;
    if (resultado !== parseInt(digitos.charAt(1))) return false;
    
    return true;
  }
  
  // Formatação de campos
  
  // Formatação de CPF/CNPJ no evento de input
  cpfCnpj.addEventListener('input', function() {
    const pessoaFisica = tipo.value === 'pessoa_fisica';
    const valor = this.value.replace(/\D/g, '').slice(0, pessoaFisica ? 11 : 14);
    if (pessoaFisica) {
      this.value = valor.length > 9 ? `${valor.slice(0, 3)}.${valor.slice(3, 6)}.${valor.slice(6, 9)}-${valor.slice(9)}`
        : valor.length > 6 ? `${valor.slice(0, 3)}.${valor.slice(3, 6)}.${valor.slice(6)}`
        : valor.length > 3 ? `${valor.slice(0, 3)}.${valor.slice(3)}` : valor;
    } else {
      this.value = valor.length > 12 ? `${valor.slice(0, 2)}.${valor.slice(2, 5)}.${valor.slice(5, 8)}/${valor.slice(8, 12)}-${valor.slice(12)}`
        : valor.length > 8 ? `${valor.slice(0, 2)}.${valor.slice(2, 5)}.${valor.slice(5, 8)}/${valor.slice(8)}`
        : valor.length > 5 ? `${valor.slice(0, 2)}.${valor.slice(2, 5)}.${valor.slice(5)}`
        : valor.length > 2 ? `${valor.slice(0, 2)}.${valor.slice(2)}` : valor;
    }
    if (cpfCnpj.classList.contains('is-invalid') || cpfCnpj.classList.contains('is-valid')) validarCpfCnpj();
  });
  
  // Formatação de telefone
  function formatarTelefone(input) {
    const valor = input.value.replace(/\D/g, '');
    
    if (valor.length <= 10) {  // Telefone fixo
      input.value = valor.replace(/(\d{2})(\d{4})(\d{0,4})/, function(match, p1, p2, p3) {
        if (p3) return `(${p1}) ${p2}-${p3}`;
        if (p2) return `(${p1}) ${p2}`;
        if (p1) return `(${p1}`;
        return '';
      });
    } else {  // Celular
      input.value = valor.replace(/(\d{2})(\d{5})(\d{0,4})/, function(match, p1, p2, p3) {
        if (p3) return `(${p1}) ${p2}-${p3}`;
        if (p2) return `(${p1}) ${p2}`;
        if (p1) return `(${p1}`;
        return '';
      });
    }
  }
  
  telefone.addEventListener('input', function() {
    formatarTelefone(this);
  });
  
  celular.addEventListener('input', function() {
    formatarTelefone(this);
  });
  
  // Formatação de CEP
  cep.addEventListener('input', function() {
    clearTimeout(cepDebounce);
    cepRequest++;
    cepSpinner.style.display = 'none';
    const valor = this.value.replace(/\D/g, '').slice(0, 8);
    this.value = valor.replace(/^(\d{5})(\d{0,3})/, function(match, p1, p2) {
      if (p2) return `${p1}-${p2}`;
      return p1;
    });
    if (valor.length === 8) cepDebounce = setTimeout(() => buscarCep(), 350);
  });
  
  // Formatação de valor monetário
  window.formatarValor = function(input) {
    let valor = input.value.replace(/\D/g, '');
    if (!valor) {
      input.value = '';
      return;
    }
    
    valor = (parseInt(valor) / 100).toFixed(2);
    valor = valor.replace('.', ',');
    valor = valor.replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
    
    input.value = valor;
  };
  
  function formatarValorParaExibicao(valor) {
    if (typeof valor !== 'number') valor = 0;
    
    return valor.toFixed(2).replace('.', ',').replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1.');
  }
  
  function converterValorParaNumero(valorString) {
    return parseFloat(valorString.replace(/\./g, '').replace(',', '.')) || 0;
  }

  // Função para formatar valor monetário durante a digitação
  function formatarValor(input) {
    let value = input.value.replace(/\D/g, ''); // Remove caracteres não numéricos
    value = (value / 100).toFixed(2) + '';
    value = value.replace(".", ",");
    value = value.replace(/(\d)(\d{3})(\d{3}),/g, "$1.$2.$3,");
    value = value.replace(/(\d)(\d{3}),/g, "$1.$2,");
    input.value = value;
  }

  // Tornar a função global para o HTML poder acessá-la
  window.formatarValor = formatarValor;
    // Eventos
  
  // Inicialização
  carregarClientes();
  
  // Buscar cliente
  btnSearch.addEventListener('click', () => {
    carregarClientes(searchInput.value);
  });
  
  // Busca ao pressionar Enter
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      carregarClientes(searchInput.value);
    }
  });
  
  // Busca em tempo real enquanto digita (com debounce)
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      carregarClientes(searchInput.value);
    }, 500); // Aguarda 500ms após o usuário parar de digitar
  });
  
  // Novo cliente
  btnNovoCliente.addEventListener('click', () => {
    limparFormulario();
    mostrarFormulario();
    nome.focus();
  });
  closeClientEditor.addEventListener('click', ocultarFormulario);
  let pressedBackdrop = false;
  clientEditor.addEventListener('pointerdown', event => {
    pressedBackdrop = event.target === clientEditor;
  });
  clientEditor.addEventListener('pointerup', event => {
    if (pressedBackdrop && event.target === clientEditor) ocultarFormulario();
    pressedBackdrop = false;
  });
  clientEditor.addEventListener('pointercancel', () => { pressedBackdrop = false; });
  document.addEventListener('keydown', event => {
    if (clientEditor.hidden) return;
    const otherModalOpen = [...document.querySelectorAll('.modal')]
      .some(modal => getComputedStyle(modal).display !== 'none');
    if (otherModalOpen) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (getComputedStyle(document.getElementById('modalCreditoExtra')).display !== 'none') {
          document.getElementById('btnFecharModalCredito').click();
        } else {
          document.getElementById('btnFecharHistorico').click();
        }
      }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      ocultarFormulario();
    } else if (event.key === 'Tab') {
      const focusable = [...clientEditor.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')]
        .filter(element => !element.disabled && element.getClientRects().length && element.tabIndex >= 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
  document.getElementById('btnExcluirClienteAtual').addEventListener('click', () => {
    if (!clienteAtual?._id) return showMessage('Selecione um cliente para excluir.', true);
    excluirCliente(clienteAtual._id, clienteAtual.nome);
  });
  document.getElementById('saveFromAddressBtn').addEventListener('click', () => tabs[0].click());
  
  // Voltar
  btnVoltar.addEventListener('click', () => {
    window.location.href = 'main.html';
  });
  
  // Salvar cliente
  clienteForm.addEventListener('submit', salvarCliente);
  
  // Cancelar cadastro
  btnCancelar.addEventListener('click', () => {
    limparFormulario();
    ocultarFormulario();
  });
  
  // Eventos da aba de endereços
  enderecoForm.addEventListener('submit', salvarEndereco);
  btnCancelarEndereco.addEventListener('click', () => {
    enderecoForm.reset();
    btnSalvarEndereco.textContent = 'Adicionar';
    btnSalvarEndereco.dataset.mode = 'add';
    delete btnSalvarEndereco.dataset.index;
  });
  
  // Botão "Pagou" para zerar saldo devedor
  const btnPagouCredito = document.getElementById('btnPagouCredito');
  if (btnPagouCredito) {
    btnPagouCredito.addEventListener('click', zerarSaldoDevedor);
  }

  // Botão para adicionar crédito extra ao cliente
  const btnAdicionarCredito = document.getElementById('btnAdicionarCredito');
  if (btnAdicionarCredito) {
    btnAdicionarCredito.addEventListener('click', adicionarCreditoExtra);
  }
  
  // Botão para sincronizar dados de crédito
  const btnSincronizarDados = document.getElementById('btnSincronizarDados');
  if (btnSincronizarDados) {
    btnSincronizarDados.addEventListener('click', sincronizarDadosCredito);
  }
  
  // Recarregar informações de crédito
  const btnRecarregarCredito = document.getElementById('btnRecarregarCredito');
  if (btnRecarregarCredito) {
    btnRecarregarCredito.addEventListener('click', () => {
      if (clienteAtual && clienteAtual._id) {
        carregarInformacoesCredito(clienteAtual._id);
      } else {
        showMessage('Selecione um cliente primeiro', true);
      }
    });
  }
  
  // Botão para ver histórico completo de fiado
  const btnVerDetalhesHistorico = document.getElementById('btnVerDetalhesHistorico');
  if (btnVerDetalhesHistorico) {
    btnVerDetalhesHistorico.addEventListener('click', () => {
      if (clienteAtual && clienteAtual._id) {
        abrirModalHistorico(clienteAtual._id);
      } else {
        showMessage('Selecione um cliente primeiro', true);
      }
    });
  }
  
  // Fechar modal de histórico
  const btnFecharHistorico = document.getElementById('btnFecharHistorico');
  const btnFecharHistoricoFooter = document.getElementById('btnFecharHistoricoFooter');
  const historicoModal = document.getElementById('historicoModal');
  
  if (btnFecharHistorico) {
    btnFecharHistorico.addEventListener('click', () => {
      historicoModal.style.display = 'none';
    });
  }
  
  if (btnFecharHistoricoFooter) {
    btnFecharHistoricoFooter.addEventListener('click', () => {
      historicoModal.style.display = 'none';
    });
  }
  
  // Função para abrir modal de histórico
  async function abrirModalHistorico(clienteId) {
    const modal = document.getElementById('historicoModal');
    const spinner = document.getElementById('historicoSpinner');
    const lista = document.getElementById('historicoLista');
    const vazio = document.getElementById('historicoVazio');
    
    // Mostrar modal e loading
    modal.style.display = 'flex';
    spinner.style.display = 'block';
    lista.innerHTML = '';
    vazio.style.display = 'none';
    
    try {
      const resultado = await window.clientesAPI.getHistoricoCredito(clienteId);
      
      spinner.style.display = 'none';
      
      if (resultado.success) {
        // Preencher informações do cliente
        document.getElementById('historicoClienteNome').textContent = resultado.cliente.nome;
        document.getElementById('historicoLimiteCredito').textContent = formatarValorParaExibicao(resultado.cliente.limiteCredito);
        document.getElementById('historicoSaldoDevedor').textContent = formatarValorParaExibicao(resultado.cliente.saldoDevedor);
        document.getElementById('historicoStatusCredito').textContent = formatarStatusCredito(resultado.cliente.statusCredito);
        
        // Preencher totais
        document.getElementById('totalCompras').textContent = formatarValorParaExibicao(resultado.totais.totalCompras);
        document.getElementById('totalPagamentos').textContent = formatarValorParaExibicao(resultado.totais.totalPagamentos);
        document.getElementById('quantidadeCompras').textContent = resultado.totais.quantidadeCompras;
        document.getElementById('quantidadePagamentos').textContent = resultado.totais.quantidadePagamentos;
        
        // Exibir histórico
        if (resultado.historico && resultado.historico.length > 0) {
          resultado.historico.forEach(registro => {
            const div = criarElementoHistorico(registro);
            lista.appendChild(div);
          });
        } else {
          vazio.style.display = 'block';
        }
      } else {
        showMessage(resultado.message || 'Erro ao carregar histórico', true);
        modal.style.display = 'none';
      }
    } catch (error) {
      console.error('Erro ao carregar histórico:', error);
      showMessage('Erro ao carregar histórico', true);
      spinner.style.display = 'none';
      modal.style.display = 'none';
    }
  }
  
  // Função para criar elemento visual do histórico
  function criarElementoHistorico(registro) {
    const div = document.createElement('div');
    div.className = 'historico-registro';
    
    // Adicionar classe específica por tipo
    if (registro.tipo === 'compra_fiado') {
      div.classList.add('tipo-compra');
    } else if (registro.tipo === 'pagamento') {
      div.classList.add('tipo-pagamento');
    }
    
    const tipoTexto = {
      'compra_fiado': 'Compra Fiado',
      'pagamento': 'Pagamento',
      'ajuste_credito': 'Ajuste',
      'limite_alterado': 'Limite Alterado',
      'status_alterado': 'Status Alterado'
    };
    
    const dataFormatada = new Date(registro.dataRegistro).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    
    div.innerHTML = `
      <div class="historico-header">
        <span class="historico-tipo ${registro.tipo}">${tipoTexto[registro.tipo] || registro.tipo}</span>
        <span class="historico-data">${dataFormatada}</span>
      </div>
      <div class="historico-descricao">${escapeHtml(registro.descricao)}</div>
      <div class="historico-valores">
        <div class="historico-valor-item">
          <strong>Valor:</strong>
          <span class="${registro.tipo === 'compra_fiado' ? 'valor-negativo' : 'valor-positivo'}">
            R$ ${formatarValorParaExibicao(registro.valor)}
          </span>
        </div>
        <div class="historico-valor-item">
          <strong>Saldo Anterior:</strong>
          <span>R$ ${formatarValorParaExibicao(registro.saldoAnterior)}</span>
        </div>
        <div class="historico-valor-item">
          <strong>Saldo Novo:</strong>
          <span>R$ ${formatarValorParaExibicao(registro.saldoNovo)}</span>
        </div>
      </div>
      ${registro.observacoes ? `<div style="margin-top: 12px; padding: 10px; background: #f8f9fa; border-radius: 6px; font-size: 13px; color: #555;"><strong style="color: #333;">💬 Observações:</strong> ${escapeHtml(registro.observacoes)}</div>` : ''}
      ${registro.nomeUsuario ? `<div style="margin-top: 8px; font-size: 12px; color: #999; display: flex; align-items: center; gap: 5px;"><i class="fas fa-user"></i> ${escapeHtml(registro.nomeUsuario)}</div>` : ''}
    `;
    
    return div;
  }
  
  // Eventos de validação
  cpfCnpj.addEventListener('blur', validarCpfCnpj);
  email.addEventListener('blur', validarEmail);
  
  // Limpar erros nos campos ao digitar
  nome.addEventListener('input', () => {
    nome.classList.remove('is-invalid');
    document.getElementById('nomeError').style.display = 'none';
  });
  
  logradouro.addEventListener('input', () => {
    logradouro.classList.remove('is-invalid');
    document.getElementById('logradouroError').style.display = 'none';
  });
  
  numero.addEventListener('input', () => {
    numero.classList.remove('is-invalid');
    document.getElementById('numeroError').style.display = 'none';
  });
  
  bairro.addEventListener('input', () => {
    bairro.classList.remove('is-invalid');
    document.getElementById('bairroError').style.display = 'none';
  });
  
  cidade.addEventListener('input', () => {
    cidade.classList.remove('is-invalid');
    document.getElementById('cidadeError').style.display = 'none';
  });
  
  estado.addEventListener('change', () => {
    estado.classList.remove('is-invalid');
    document.getElementById('estadoError').style.display = 'none';
  });
  
  // Navegação entre abas
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
      document.getElementById('tab' + tabId.charAt(0).toUpperCase() + tabId.slice(1)).classList.add('active');
      
      // Se a aba de crédito for selecionada e tiver um cliente selecionado, carregar dados de crédito
      if (tabId === 'credito' && clienteAtual && clienteAtual._id) {
        carregarInformacoesCredito(clienteAtual._id);
      }
        // Se a aba de endereços for selecionada e tiver um cliente selecionado, garantir que a lista esteja atualizada
      if (tabId === 'endereco' && clienteAtual) {
        carregarEnderecos(enderecos);
        
        // Garantir que o formulário de endereço esteja visível e resetado
        document.getElementById('enderecoForm').style.display = 'block';
        
      }
    });
  });
});
