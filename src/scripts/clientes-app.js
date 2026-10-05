// Script adicional para o módulo de clientes
document.addEventListener('DOMContentLoaded', function() {
  // Configurar o botão de excluir na área de detalhes
  const btnExcluirClienteAtual = document.getElementById('btnExcluirClienteAtual');
  if (btnExcluirClienteAtual) {
    btnExcluirClienteAtual.addEventListener('click', function() {
      // Obter o ID do cliente atual
      const clienteIdField = document.getElementById('clienteId');
      if (!clienteIdField || !clienteIdField.value) {
        alert('Selecione um cliente primeiro');
        return;
      }
      
      // Obter o nome do cliente
      const nomeCliente = document.getElementById('nome').value;
      
      // Confirmar exclusão
      if (!confirm(`Tem certeza que deseja excluir o cliente "${nomeCliente}"? Esta ação não pode ser desfeita.`)) {
        return;
      }
      
      // Executar a exclusão
      window.clientesAPI.deleteCliente(clienteIdField.value)
        .then(resultado => {
          if (resultado.success) {
            // Mostrar mensagem de sucesso
            const statusMessage = document.getElementById('statusMessage');
            statusMessage.textContent = resultado.message || 'Cliente excluído com sucesso!';
            statusMessage.className = 'status-message success';
            statusMessage.style.display = 'block';
            
            // Resetar formulário
            document.getElementById('clienteForm').reset();
            document.getElementById('detailsTitle').textContent = 'Detalhes do Cliente';
            
            // Recarregar lista de clientes
            setTimeout(() => {
              // Recarregar lista - usar evento personalizado
              document.dispatchEvent(new CustomEvent('atualizarListaClientes'));
              
              // Ou chamar diretamente se a função for acessível
              if (typeof carregarClientes === 'function') {
                carregarClientes();
              }
            }, 500);
          } else {
            // Mostrar erro
            alert(resultado.message || 'Erro ao excluir cliente');
          }
        })
        .catch(error => {
          console.error('Erro ao excluir cliente:', error);
          alert('Ocorreu um erro ao excluir o cliente');
        });
    });
  }
  
  // Se a função carregarClientes não for acessível globalmente, registrar um ouvinte para o evento
  document.addEventListener('atualizarListaClientes', function() {
    // Tentar obter o valor do campo de busca
    const searchInput = document.getElementById('searchInput');
    const filtro = searchInput ? searchInput.value : '';
    
    // Recarregar clientes se a API estiver disponível
    if (window.clientesAPI && typeof window.clientesAPI.getClientes === 'function') {
      window.clientesAPI.getClientes(filtro)
        .then(clientes => {
          // Verificar se a função que renderiza os clientes está disponível
          if (typeof atualizarListaClientes === 'function') {
            atualizarListaClientes(clientes);
          } else {
            // Caso contrário, recarregar a página
            window.location.reload();
          }
        })
        .catch(error => {
          console.error('Erro ao carregar clientes:', error);
        });
    }
  });
});
