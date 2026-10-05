document.addEventListener('DOMContentLoaded', () => {
  // Mostrar a versão do app
  const versionElement = document.getElementById('app-version');
  if (versionElement) {
    versionElement.textContent = window.pdvAPI.getAppInfo().versao;
  }

  // Elementos do formulário de login
  const loginForm = document.getElementById('loginForm');
  const emailInput = document.getElementById('email');
  const senhaInput = document.getElementById('senha');
  const errorMessage = document.getElementById('errorMessage');
  
  // Função para mostrar mensagem de erro
  const showError = (element, message) => {
    console.log("Erro exibido:", message);
    element.textContent = message;
    element.style.display = 'block';
  };
  
  // Submeter formulário de login
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = emailInput.value;
    const senha = senhaInput.value;
    
    // Resetar mensagem de erro
    errorMessage.style.display = 'none';
    
    console.log("Tentando login com:", { email });
    
    try {
      // Verificar se a API está disponível
      if (!window.authAPI || !window.authAPI.login) {
        showError(errorMessage, "API de autenticação não disponível");
        console.error("API não disponível:", window.authAPI);
        return;
      }
      
      // Chamar a API exposta pelo preload.js
      const result = await window.authAPI.login(email, senha);
      
      console.log("Resultado do login:", result);
      
      if (result && result.success) {
        // Login bem-sucedido, redirecionar para a tela principal
        window.location.href = 'main.html';
      } else {
        // Exibir mensagem de erro
        showError(errorMessage, result?.message || 'Credenciais inválidas');
      }
    } catch (error) {
      console.error('Erro detalhado durante login:', error);
      showError(errorMessage, `Erro de login: ${error.message || error}`);
    }
  });
  
  // DEBUG: Mostrar valores padrão para facilitar
  console.log("Valores padrão de login: admin@pdv.com / 20211206");
  emailInput.value = "admin@pdv.com";
});
