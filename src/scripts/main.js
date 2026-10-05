document.addEventListener('DOMContentLoaded', async () => {
  const userNameElement = document.getElementById('userName');
  const logoutBtn = document.getElementById('logoutBtn');
  const lastUpdateElement = document.getElementById('last-update');
  
  // Botões de navegação
  const btnVendas = document.getElementById('btn-vendas');
  const btnConsultaPreco = document.getElementById('btn-consulta-preco');
  const btnDelivery = document.getElementById('btn-delivery');
  const btnOrcamentos = document.getElementById('btn-orcamentos');
  const btnProdutos = document.getElementById('btn-produtos');
  const btnEstoqueBaixo = document.getElementById('btn-estoque-baixo');
  const btnClientes = document.getElementById('btn-clientes');
  const btnEntregas = document.getElementById('btn-entregas');
  const btnRelatorios = document.getElementById('btn-relatorios');
  const btnRetirada = document.getElementById('btn-retirada');
  const btnUsuarios = document.getElementById('btn-usuarios');
  
  let currentUser = null;
  
  // Atualizar a data/hora no footer
  const updateDateTime = () => {
    const now = new Date();
    const formattedDate = now.toLocaleDateString('pt-BR');
    const formattedTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    lastUpdateElement.innerHTML = `Última atualização: <span>${formattedDate} às ${formattedTime}</span>`;
  };

  // Chamar uma vez e atualizar a cada minuto
  updateDateTime();
  setInterval(updateDateTime, 60000);
  
  // Obter dados do usuário atual
  try {
    currentUser = await window.authAPI.getCurrentUser();
    if (currentUser) {
      userNameElement.textContent = currentUser.nome;
    } else {
      // Se não houver usuário logado, redirecionar para login
      window.location.href = 'login.html';
    }
  } catch (error) {
    console.error('Erro ao obter dados do usuário:', error);
    window.location.href = 'login.html';
  }
  
  // Verificar permissões do usuário e esconder opções que ele não tem acesso
  const checkPermissions = () => {
    const role = currentUser?.tipo;
    const gerente = role === 'gerencia';
    const caixa = role === 'caixa';
    [btnDelivery].forEach(button => { if (button) button.style.display = gerente || caixa ? '' : 'none'; });
    [btnProdutos, btnEstoqueBaixo, btnRelatorios, btnRetirada, btnUsuarios]
      .forEach(button => { if (button) button.style.display = gerente ? '' : 'none'; });
  };
  
  checkPermissions();

  document.querySelectorAll('.menu-card').forEach(card => {
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        card.click();
      }
    });
  });
  
  // Configurar o botão de logout
  logoutBtn.addEventListener('click', async () => {
    try {
      await window.authAPI.logout();
      window.location.href = 'login.html';
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  });
  
  // Configurar navegação para as telas do sistema
  if (btnVendas) {
    btnVendas.addEventListener('click', () => {
      window.location.href = 'vendas.html';
    });
  }

  if (btnConsultaPreco) {
    btnConsultaPreco.addEventListener('click', () => {
      window.location.href = 'consulta-preco.html';
    });
  }

  if (btnUsuarios) {
    btnUsuarios.addEventListener('click', () => { window.location.href = 'usuarios.html'; });
  }

  if (btnDelivery) {
    btnDelivery.addEventListener('click', () => {
      window.location.href = 'delivery.html';
    });
  }
  
  if (btnProdutos) {
    btnProdutos.addEventListener('click', () => {
      window.location.href = 'produtos.html';
    });
  }
  
  if (btnEstoqueBaixo) {
    btnEstoqueBaixo.addEventListener('click', () => {
      window.location.href = 'estoque-baixo.html';
    });
  }
  
  if (btnClientes) {
    btnClientes.addEventListener('click', () => {
      window.location.href = 'clientes.html';
    });
  }
  
  if (btnRelatorios) {
    btnRelatorios.addEventListener('click', () => {
      // Verificar se o usuário tem permissão
      if (currentUser && currentUser.tipo === 'gerencia') {
        window.location.href = 'relatorios.html';
      } else { 
        alert('Você não tem permissão para acessar os relatórios. Entre em contato com o administrador.');
      }
    });
  }

  if (btnRetirada) {
    btnRetirada.addEventListener('click', () => {
      window.location.href = 'retirada.html';
    });
  }
});
