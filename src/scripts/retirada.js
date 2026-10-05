document.addEventListener('DOMContentLoaded', async () => {
  const userNameElement = document.getElementById('userName');
  const backBtn = document.getElementById('backBtn');
  const retiradaForm = document.getElementById('retiradaForm');
  const successMessage = document.getElementById('successMessage');
  const errorMessage = document.getElementById('errorMessage');
  const lastUpdateElement = document.getElementById('last-update');

  let currentUser = null;

  // Função para formatar valores em reais
  const formatarReal = (valor) => {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  // Função para carregar saldo do caixa (apenas cálculo, sem exibir)
  const carregarSaldoCaixa = async () => {
    try {
      const resultado = await window.electronAPI.invoke('obter-saldo-caixa', {});
      
      if (resultado && resultado.sucesso) {
        const saldo = resultado.dados.saldo || 0;
        return saldo;
      }
    } catch (error) {
      console.error('Erro ao carregar saldo do caixa:', error);
    }
    return 0;
  };

  // Função para carregar e exibir saldo disponível
  const carregarSaldoDisponivel = async () => {
    try {
      console.log('Iniciando carregamento de saldo disponível...');
      
      // Verificar se a API está disponível
      if (!window.electronAPI) {
        console.error('window.electronAPI não está disponível');
        return;
      }
      
      if (!window.electronAPI.invoke) {
        console.error('window.electronAPI.invoke não está disponível');
        return;
      }
      
      const resultado = await window.electronAPI.invoke('obter-saldo-caixa', {});
      console.log('Resposta do saldo do caixa:', resultado);
      
      if (resultado && resultado.sucesso) {
        const saldo = resultado.dados.saldo || 0;
        const totalVendas = resultado.dados.totalVendas || 0;
        const totalRetiradas = resultado.dados.totalRetiradas || 0;

        console.log(`Saldo disponível: R$${saldo}, Vendas: R$${totalVendas}, Retiradas: R$${totalRetiradas}`);

        // Atualizar elementos
        document.getElementById('saldoDisponivel').textContent = formatarReal(saldo);
        document.getElementById('detailSaldo').textContent = `R$ ${formatarReal(totalVendas)} em vendas - R$ ${formatarReal(totalRetiradas)} retiradas`;
      } else {
        console.error('Resultado sem sucesso:', resultado);
        if (resultado && resultado.mensagem) {
          console.error('Mensagem de erro:', resultado.mensagem);
        }
        // Mostrar valores padrão em caso de erro
        document.getElementById('saldoDisponivel').textContent = 'R$ 0,00';
      }
    } catch (error) {
      console.error('Erro ao carregar saldo disponível:', error);
      // Mostrar valores padrão em caso de erro
      document.getElementById('saldoDisponivel').textContent = 'R$ 0,00';
    }
  };

  // Função para carregar total de vendas (mantida para compatibilidade)
  const carregarTotalVendas = async () => {
    try {
      console.log('Iniciando carregamento de total de vendas...');
      
      // Verificar se a API está disponível
      if (!window.electronAPI) {
        console.error('window.electronAPI não está disponível');
        return;
      }
      
      if (!window.electronAPI.invoke) {
        console.error('window.electronAPI.invoke não está disponível');
        return;
      }
      
      const resultado = await window.electronAPI.invoke('obter-total-vendas', {});
      console.log('Resultado recebido:', resultado);
      
      if (resultado && resultado.sucesso) {
        const totalHoje = resultado.dados.totalHoje || 0;
        const totalGeral = resultado.dados.totalGeral || 0;
        const vendidosHoje = resultado.dados.vendidosHoje || 0;
        const vendidosTotal = resultado.dados.vendidosTotal || 0;

        console.log(`Dados recebidos - Hoje: R$${totalHoje}, Geral: R$${totalGeral}, Vendas hoje: ${vendidosHoje}, Total vendas: ${vendidosTotal}`);

        // Atualizar elementos (apenas total geral)
        document.getElementById('totalVendasGeral').textContent = formatarReal(totalGeral);
        document.getElementById('detailVendasGeral').textContent = `${vendidosTotal} venda${vendidosTotal !== 1 ? 's' : ''} no total`;
      } else {
        console.error('Resultado sem sucesso:', resultado);
        if (resultado && resultado.mensagem) {
          console.error('Mensagem de erro:', resultado.mensagem);
        }
        // Mostrar valores padrão em caso de erro
        document.getElementById('totalVendasGeral').textContent = 'R$ 0,00';
      }
    } catch (error) {
      console.error('Erro ao carregar total de vendas:', error);
      // Mostrar valores padrão em caso de erro
      document.getElementById('totalVendasGeral').textContent = 'R$ 0,00';
    }
  };

  // Atualizar a data/hora no footer
  const updateDateTime = () => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR');
    const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    lastUpdateElement.innerHTML = `Última atualização: <span>${formattedDate} às ${formattedTime}</span>`;
  };

  updateDateTime();
  setInterval(updateDateTime, 60000);

  // Obter dados do usuário atual
  try {
    currentUser = await window.authAPI.getCurrentUser();
    console.log('Dados do usuário atual na retirada:', currentUser);
    if (currentUser) {
      userNameElement.textContent = currentUser.nome;
      // Preencher o campo responsável com o nome do usuário
      document.getElementById('responsavel').value = currentUser.nome;
    } else {
      console.error('Nenhum usuário encontrado, redirecionando para login');
      window.location.href = 'login.html';
    }
  } catch (error) {
    console.error('Erro ao obter dados do usuário:', error);
    window.location.href = 'login.html';
  }

  // Carregar total de vendas ao iniciar
  carregarSaldoDisponivel();
  // Atualizar a cada 30 segundos
  setInterval(() => {
    carregarSaldoDisponivel();
  }, 30000);

  // Voltar diretamente ao menu principal
  backBtn.addEventListener('click', () => {
    window.location.href = 'main.html';
  });

  // Definir data e hora atuais por padrão (FIXOS, não mudam)
  const today = new Date().toISOString().split('T')[0];
  document.getElementById('dataRetirada').value = today;
  
  const agora = new Date();
  const horas = String(agora.getHours()).padStart(2, '0');
  const minutos = String(agora.getMinutes()).padStart(2, '0');
  const horaAtual = `${horas}:${minutos}`;
  document.getElementById('horaRetirada').value = horaAtual;

  // Configurar o envio do formulário
  retiradaForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    try {
      // Obter saldo atual antes de processar
      const saldoAtual = await carregarSaldoCaixa();
      const valorRetirada = parseFloat(document.getElementById('valor').value);

      // Validações
      if (!valorRetirada || valorRetirada <= 0) {
        exibirErro('O valor da retirada deve ser maior que zero.');
        return;
      }

      if (valorRetirada > saldoAtual) {
        exibirErro(
          `Saldo insuficiente no caixa.`,
          `Saldo disponível: ${formatarReal(saldoAtual)}`,
          `Valor solicitado: ${formatarReal(valorRetirada)}`,
          `Diferença: ${formatarReal(valorRetirada - saldoAtual)}`
        );
        return;
      }

      // Verificar se temos o usuário atual
      if (!currentUser || !currentUser.id) {
        exibirErro('Erro de autenticação', 'Usuário não encontrado. Faça login novamente.');
        return;
      }

      // Coletar dados do formulário
      const dadosRetirada = {
        dataRetirada: document.getElementById('dataRetirada').value,
        horaRetirada: document.getElementById('horaRetirada').value,
        valor: valorRetirada,
        responsavel: document.getElementById('responsavel').value,
        motivo: document.getElementById('motivo').value || 'Não especificado',
        observacoes: document.getElementById('observacoes').value || '',
        usuarioId: currentUser.id,
        dataCriacao: new Date().toISOString() // Converter para string ISO
      };

      console.log('Dados da retirada que serão enviados:', dadosRetirada);
      console.log('Usuario atual:', currentUser);

      // Chamar a API para registrar a retirada
      const resultado = await window.electronAPI.invoke('registrar-retirada', dadosRetirada);
      
      if (resultado.sucesso) {
        // Mostrar mensagem de sucesso
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
        
        // Limpar apenas o campo de valor e observações
        document.getElementById('valor').value = '';
        document.getElementById('motivo').value = '';
        document.getElementById('observacoes').value = '';

        // Recarregar saldo disponível
        carregarSaldoDisponivel();

        // Ocultar mensagem após 3 segundos
        setTimeout(() => {
          successMessage.style.display = 'none';
        }, 3000);
      } else {
        throw new Error(resultado.mensagem || 'Erro ao registrar retirada');
      }
    } catch (error) {
      console.error('Erro ao registrar retirada:', error);
      exibirErro(
        'Erro ao registrar a retirada',
        error.message || 'Falha ao processar a retirada. Tente novamente.',
        'Se o erro persistir, verifique sua conexão com o servidor.'
      );
    }
  });

  // Função auxiliar para exibir erros
  function exibirErro(...mensagens) {
    const conteudoErro = mensagens
      .filter(msg => msg) // Remove mensagens vazias
      .join('<br><br>');
    
    errorMessage.innerHTML = `
      <strong>❌ Erro na Operação</strong>
      <div class="error-details">${conteudoErro}</div>
    `;
    errorMessage.style.display = 'block';
    successMessage.style.display = 'none';
  }
});
