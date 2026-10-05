document.addEventListener('DOMContentLoaded', () => {
  // Elementos do DOM
  const usuarioForm = document.getElementById('usuarioForm');
  const usuarioId = document.getElementById('usuarioId');
  const nome = document.getElementById('nome');
  const email = document.getElementById('email');
  const senha = document.getElementById('senha');
  const tipo = document.getElementById('tipo');
  const formTitle = document.getElementById('formTitle');
  const btnSalvar = document.getElementById('btnSalvar');
  const btnCancelar = document.getElementById('btnCancelar');
  const btnLimpar = document.getElementById('btnLimpar');
  const btnNovoUsuario = document.getElementById('btnNovoUsuario');
  const btnVoltar = document.getElementById('btn-voltar');
  const usuariosTableBody = document.getElementById('usuariosTableBody');
  const statusMessage = document.getElementById('statusMessage');
  
  // Estado da aplicação
  let modoEdicao = false;
  let usuarioAtual = null;
  
  // Exibir mensagem de status
  const showMessage = (message, isError = false) => {
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${isError ? 'error' : 'success'}`;
    statusMessage.style.display = 'block';
    
    // Ocultar mensagem após 3 segundos
    setTimeout(() => {
      statusMessage.style.display = 'none';
    }, 3000);
  };
  
  // Limpar o formulário
  const limparFormulario = () => {
    usuarioForm.reset();
    usuarioId.value = '';
    modoEdicao = false;
    formTitle.textContent = 'Novo Usuário';
    btnSalvar.textContent = 'Salvar';
    senha.required = true; // Senha é obrigatória para novos usuários
    
    // Dar foco ao campo nome
    nome.focus();
  };
  
  // Função para focar no formulário de novo usuário
  const focarNovoUsuario = () => {
    // Limpar o formulário primeiro
    limparFormulario();
    
    // Rolar até o formulário, se necessário
    const formContainer = usuarioForm.closest('.card');
    formContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    
    // Destacar visualmente o formulário
    formContainer.style.boxShadow = '0 0 10px #4CAF50';
    setTimeout(() => {
      formContainer.style.boxShadow = '';
    }, 2000);
    
    // Focar no campo nome
    nome.focus();
  };
  
  // Carregar dados de um usuário para edição
  const carregarUsuario = (usuario) => {
    usuarioId.value = usuario.id;
    nome.value = usuario.nome;
    email.value = usuario.email;
    senha.value = ''; // Não carrega a senha por segurança
    senha.required = false; // Senha não é obrigatória na edição
    tipo.value = usuario.tipo;
    
    modoEdicao = true;
    usuarioAtual = usuario;
    formTitle.textContent = 'Editar Usuário';
    btnSalvar.textContent = 'Atualizar';
    
    // Rolar para o formulário
    usuarioForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  
  // Buscar e exibir usuários
  const buscarUsuarios = async () => {
    try {
      const usuarios = await window.usuariosAPI.getUsuarios();
      exibirUsuarios(usuarios);
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      showMessage('Erro ao carregar usuários. Tente novamente.', true);
    }
  };
  
  // Exibir usuários na tabela
  const exibirUsuarios = (usuarios) => {
    usuariosTableBody.innerHTML = '';
    
    if (!usuarios || usuarios.length === 0) {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td colspan="5" style="text-align: center;">Nenhum usuário encontrado</td>
      `;
      usuariosTableBody.appendChild(row);
      return;
    }
    
    usuarios.forEach(usuario => {
      const row = document.createElement('tr');
      if (!usuario.ativo) row.className = 'usuario-inativo';
      
      row.innerHTML = `
        <td>${usuario.nome}</td>
        <td>${usuario.email}</td>
        <td>${({ vendedor_loja: 'Vendedor LOJA', vendedor_balcao: 'Vendedor BALCÃO', caixa: 'CAIXA', gerencia: 'GERÊNCIA' })[usuario.tipo] || usuario.tipo}</td>
        <td>${usuario.ativo ? 'Ativo' : 'Inativo'}</td>
        <td class="acoes">
          <button class="btn-edit btn-secundario" data-id="${usuario.id}">Editar</button>
          ${usuario.ativo 
            ? `<button class="btn-disable btn-perigo" data-id="${usuario.id}">Desativar</button>`
            : `<button class="btn-enable" data-id="${usuario.id}">Ativar</button>`
          }
        </td>
      `;
      
      usuariosTableBody.appendChild(row);
    });
    
    // Adicionar eventos aos botões
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', async function() {
        const id = this.getAttribute('data-id');
        try {
          const usuario = await window.usuariosAPI.getUsuarioById(id);
          carregarUsuario(usuario);
        } catch (error) {
          console.error('Erro ao buscar usuário:', error);
          showMessage('Erro ao carregar dados do usuário', true);
        }
      });
    });
    
    document.querySelectorAll('.btn-disable').forEach(btn => {
      btn.addEventListener('click', async function() {
        if (confirm('Deseja realmente desativar este usuário?')) {
          const id = this.getAttribute('data-id');
          try {
            const result = await window.usuariosAPI.toggleUsuarioStatus(id, false);
            if (result.success) {
              showMessage('Usuário desativado com sucesso');
              buscarUsuarios();
            } else {
              showMessage(result.message, true);
            }
          } catch (error) {
            console.error('Erro ao desativar usuário:', error);
            showMessage('Erro ao desativar usuário', true);
          }
        }
      });
    });
    
    document.querySelectorAll('.btn-enable').forEach(btn => {
      btn.addEventListener('click', async function() {
        const id = this.getAttribute('data-id');
        try {
          const result = await window.usuariosAPI.toggleUsuarioStatus(id, true);
          if (result.success) {
            showMessage('Usuário ativado com sucesso');
            buscarUsuarios();
          } else {
            showMessage(result.message, true);
          }
        } catch (error) {
          console.error('Erro ao ativar usuário:', error);
          showMessage('Erro ao ativar usuário', true);
        }
      });
    });
  };
  
  // Evento de envio do formulário
  usuarioForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const usuarioData = {
      nome: nome.value,
      email: email.value,
      tipo: tipo.value
    };
    
    // Adiciona senha apenas se foi fornecida
    if (senha.value) {
      usuarioData.senha = senha.value;
    }
    
    try {
      let result;
      
      if (modoEdicao) {
        result = await window.usuariosAPI.updateUsuario(usuarioId.value, usuarioData);
      } else {
        result = await window.usuariosAPI.createUsuario(usuarioData);
      }
      
      if (result.success) {
        showMessage(modoEdicao ? 'Usuário atualizado com sucesso' : 'Usuário criado com sucesso');
        limparFormulario();
        buscarUsuarios();
      } else {
        showMessage(result.message, true);
      }
    } catch (error) {
      console.error('Erro ao salvar usuário:', error);
      showMessage('Erro ao salvar usuário', true);
    }
  });
  
  // Botão de novo usuário
  btnNovoUsuario.addEventListener('click', focarNovoUsuario);
  
  // Botão limpar formulário
  btnLimpar.addEventListener('click', limparFormulario);
  
  // Botão cancelar (mesma função que limpar)
  btnCancelar.addEventListener('click', limparFormulario);
  
  // Botão voltar (para a tela anterior)
  btnVoltar.addEventListener('click', () => {
    window.history.back();
  });
  
  // Botão voltar ao menu principal
  const btnVoltarMenu = document.getElementById('btn-voltar-menu');
  if (btnVoltarMenu) {
    btnVoltarMenu.addEventListener('click', () => {
      window.location.href = 'main.html';
    });
  }
  
  // Inicializar a página
  buscarUsuarios();
});
