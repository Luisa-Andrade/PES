document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const form = $('usuarioForm');
  const modal = $('usuarioModal');
  const status = $('statusMessage');
  const modalStatus = $('modalStatus');
  const tbody = $('usuariosTableBody');
  const fields = { id: $('usuarioId'), nome: $('nome'), email: $('email'), senha: $('senha'), tipo: $('tipo') };
  const salvar = $('btnSalvar');
  let editando = false;
  let mensagemTimer;

  function mensagem(texto, erro = false) {
    clearTimeout(mensagemTimer);
    const destino = modal.hidden ? status : modalStatus;
    destino.textContent = texto;
    destino.className = `status-message ${erro ? 'error' : 'success'}${destino === modalStatus ? ' modal-status' : ''}`;
    destino.style.display = 'block';
    mensagemTimer = setTimeout(() => { destino.style.display = 'none'; }, 5000);
  }
  function abrirModal(usuario = null) {
    form.reset();
    editando = !!usuario;
    fields.id.value = usuario?.id || '';
    fields.nome.value = usuario?.nome || '';
    fields.email.value = usuario?.email || '';
    fields.senha.value = '';
    fields.senha.required = !editando;
    fields.tipo.value = usuario?.tipo || 'vendedor_loja';
    $('formTitle').textContent = editando ? 'Editar usuário' : 'Novo usuário';
    $('senhaAjuda').textContent = editando ? 'Deixe em branco para manter a senha atual.' : 'Mínimo de 6 caracteres.';
    salvar.textContent = editando ? 'Salvar alterações' : 'Salvar usuário';
    modalStatus.style.display = 'none';
    modal.hidden = false;
    document.body.classList.add('modal-aberto');
    fields.nome.focus();
  }
  function fecharModal() {
    modal.hidden = true;
    document.body.classList.remove('modal-aberto');
    form.reset();
    $('btnNovoUsuario').focus();
  }
  function celula(row, texto) {
    const td = row.insertCell();
    td.textContent = String(texto ?? '');
    return td;
  }
  const papeis = { vendedor_loja: 'Vendedor LOJA', vendedor_balcao: 'Vendedor BALCÃO', caixa: 'CAIXA', gerencia: 'GERÊNCIA' };
  function renderizar(usuarios) {
    tbody.replaceChildren();
    if (!Array.isArray(usuarios) || !usuarios.length) {
      const tr = tbody.insertRow();
      const td = celula(tr, 'Nenhum usuário encontrado.');
      td.colSpan = 5;
      return;
    }
    usuarios.forEach(usuario => {
      const tr = tbody.insertRow();
      if (!usuario.ativo) tr.classList.add('usuario-inativo');
      celula(tr, usuario.nome);
      celula(tr, usuario.email);
      celula(tr, papeis[usuario.tipo] || usuario.tipo);
      const badge = document.createElement('span');
      badge.className = `status-badge${usuario.ativo ? '' : ' inativo'}`;
      badge.textContent = usuario.ativo ? 'Ativo' : 'Inativo';
      celula(tr, '').appendChild(badge);
      const acoes = celula(tr, '');
      acoes.className = 'acoes';
      const editar = document.createElement('button');
      editar.type = 'button';
      editar.className = 'btn-edit';
      editar.textContent = 'Editar';
      editar.addEventListener('click', async () => {
        try { abrirModal(await window.usuariosAPI.getUsuarioById(usuario.id)); }
        catch (error) { mensagem(error.message || 'Erro ao carregar usuário.', true); }
      });
      const alternar = document.createElement('button');
      alternar.type = 'button';
      alternar.className = usuario.ativo ? 'btn-disable' : 'btn-enable';
      alternar.textContent = usuario.ativo ? 'Desativar' : 'Ativar';
      alternar.addEventListener('click', async () => {
        if (usuario.ativo && !window.confirm(`Desativar ${usuario.nome}?`)) return;
        alternar.disabled = true;
        try {
          const resultado = await window.usuariosAPI.toggleUsuarioStatus(usuario.id, !usuario.ativo);
          if (!resultado?.success) throw new Error(resultado?.message || 'Falha ao atualizar status.');
          mensagem(resultado.message);
          await carregar();
        } catch (error) { mensagem(error.message || 'Erro ao atualizar status.', true); alternar.disabled = false; }
      });
      acoes.append(editar, alternar);
    });
  }
  async function carregar() {
    try {
      const usuarios = await window.usuariosAPI.getUsuarios();
      if (!Array.isArray(usuarios)) throw new Error('Resposta inválida ao carregar usuários.');
      renderizar(usuarios);
    } catch (error) {
      console.error(error);
      mensagem(error.message || 'Erro ao carregar usuários.', true);
    }
  }
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const dados = { nome: fields.nome.value.trim(), email: fields.email.value.trim().toLowerCase(), tipo: fields.tipo.value };
    if (fields.senha.value) dados.senha = fields.senha.value;
    if (!dados.nome || !dados.email) { mensagem('Preencha nome e e-mail.', true); return; }
    if (!editando && !dados.senha) { mensagem('Informe uma senha.', true); return; }
    salvar.disabled = true;
    try {
      const resultado = editando
        ? await window.usuariosAPI.updateUsuario(fields.id.value, dados)
        : await window.usuariosAPI.createUsuario(dados);
      if (!resultado?.success) throw new Error(resultado?.message || 'Falha ao salvar usuário.');
      fecharModal();
      mensagem(editando ? 'Usuário atualizado com sucesso.' : 'Usuário criado com sucesso.');
      await carregar();
    } catch (error) { mensagem(error.message || 'Erro ao salvar usuário.', true); }
    finally { salvar.disabled = false; }
  });
  $('btnNovoUsuario').addEventListener('click', () => abrirModal());
  $('btnCancelar').addEventListener('click', fecharModal);
  modal.querySelector('.user-modal-backdrop').addEventListener('click', fecharModal);
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) fecharModal(); });
  $('btn-voltar-menu').addEventListener('click', () => { window.location.href = 'main.html'; });
  $('btn-voltar').addEventListener('click', () => { window.history.back(); });
  carregar();
});
