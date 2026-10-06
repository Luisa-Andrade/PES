document.addEventListener('DOMContentLoaded', async () => {
  const $ = id => document.getElementById(id);
  const form = $('retiradaForm');
  const erro = $('errorMessage');
  const sucesso = $('successMessage');
  const registrar = $('btnRegistrar');
  const campoValor = $('valor');
  const valorAjuda = $('valorAjuda');
  const formatar = valor => Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  let usuario;
  let saldoDisponivel = null;
  let enviando = false;

  function validarCampoValor() {
    const limite = saldoDisponivel === null ? null : Math.max(0, Math.round(saldoDisponivel * 100) / 100);
    const textoLimite = limite === null ? 'Saldo indisponível. Aguarde a atualização.' : `Máximo disponível: ${formatar(limite)}.`;
    let mensagem = '';
    if (campoValor.validity.badInput) {
      mensagem = 'Informe um valor numérico válido.';
    } else if (campoValor.value !== '') {
      const valor = Number(campoValor.value);
      if (!Number.isFinite(valor) || valor <= 0 || Math.abs(valor * 100 - Math.round(valor * 100)) > 0.000001) {
        mensagem = 'Informe um valor positivo com até duas casas decimais.';
      } else if (limite !== null && Math.round(valor * 100) > Math.round(limite * 100)) {
        mensagem = `O valor ultrapassa o saldo do caixa. ${textoLimite}`;
      }
    }
    valorAjuda.textContent = mensagem || textoLimite;
    valorAjuda.classList.toggle('erro', Boolean(mensagem));
    campoValor.setCustomValidity(mensagem);
    registrar.disabled = enviando || limite === null || limite <= 0 || Boolean(mensagem);
    return !mensagem && limite !== null && limite > 0;
  }

  function atualizarDataHora() {
    const agora = new Date();
    $('dataRetirada').value = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`;
    $('horaRetirada').value = `${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}`;
  }
  function exibirErro(...mensagens) {
    erro.replaceChildren();
    const titulo = document.createElement('strong');
    titulo.textContent = 'Não foi possível registrar a retirada';
    erro.appendChild(titulo);
    mensagens.filter(Boolean).forEach(texto => {
      const p = document.createElement('p');
      p.textContent = texto;
      erro.appendChild(p);
    });
    erro.style.display = 'block';
    sucesso.style.display = 'none';
  }
  async function carregarSaldo() {
    try {
      if (!window.electronAPI?.invoke) throw new Error('Serviço do caixa indisponível.');
      const resultado = await window.electronAPI.invoke('obter-saldo-caixa', {});
      if (!resultado?.sucesso || !resultado.dados) throw new Error(resultado?.mensagem || 'Falha ao consultar o caixa.');
      const saldo = Number(resultado.dados.saldo);
      if (!Number.isFinite(saldo)) throw new Error('Saldo inválido recebido do caixa.');
      saldoDisponivel = saldo;
      campoValor.max = (Math.max(0, Math.round(saldo * 100)) / 100).toFixed(2);
      $('saldoDisponivel').textContent = formatar(saldo);
      $('detailSaldo').textContent = `${formatar(resultado.dados.totalVendas)} em entradas de dinheiro − ${formatar(resultado.dados.totalRetiradas)} em retiradas`;
      validarCampoValor();
      return saldo;
    } catch (error) {
      saldoDisponivel = null;
      campoValor.removeAttribute('max');
      $('saldoDisponivel').textContent = 'Indisponível';
      $('detailSaldo').textContent = 'Não foi possível consultar o caixa.';
      validarCampoValor();
      throw error;
    }
  }

  try {
    usuario = await window.authAPI.getCurrentUser();
    if (!usuario?.id) throw new Error('Sessão não encontrada.');
    $('userName').textContent = usuario.nome;
    $('responsavel').value = usuario.nome;
  } catch (error) {
    window.location.href = 'login.html';
    return;
  }
  $('backBtn').addEventListener('click', () => { window.location.href = 'main.html'; });
  campoValor.addEventListener('input', validarCampoValor);
  atualizarDataHora();
  try { await carregarSaldo(); }
  catch (error) { exibirErro(error.message); }
  setInterval(() => { if (!enviando) carregarSaldo().catch(() => {}); }, 30000);

  form.addEventListener('reset', () => {
    setTimeout(() => {
      $('responsavel').value = usuario.nome;
      atualizarDataHora();
      validarCampoValor();
    }, 0);
  });
  $('btnLimparRetirada').addEventListener('click', () => {
    erro.style.display = 'none';
    sucesso.style.display = 'none';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (enviando) return;
    if (!validarCampoValor()) return;
    const valor = Number(campoValor.value);
    if (!Number.isFinite(valor) || valor <= 0 || Math.abs(valor * 100 - Math.round(valor * 100)) > 0.000001) {
      exibirErro('Informe um valor positivo com até duas casas decimais.');
      return;
    }
    enviando = true;
    registrar.disabled = true;
    try {
      const saldo = await carregarSaldo();
      if (Math.round(valor * 100) > Math.round(saldo * 100)) {
        exibirErro(`Saldo insuficiente. Disponível: ${formatar(saldo)}.`);
        return;
      }
      atualizarDataHora();
      const resultado = await window.electronAPI.invoke('registrar-retirada', {
        valor,
        responsavel: usuario.nome,
        motivo: $('motivo').value.trim() || 'Não especificado',
        observacoes: $('observacoes').value.trim(),
        usuarioId: usuario.id
      });
      if (!resultado?.sucesso) throw new Error(resultado?.mensagem || 'Falha ao registrar retirada.');
      form.reset();
      sucesso.style.display = 'block';
      erro.style.display = 'none';
      try { await carregarSaldo(); }
      catch (error) { exibirErro('Retirada salva, mas o saldo não pôde ser atualizado.'); }
    } catch (error) {
      exibirErro(error.message || 'Falha ao processar retirada.');
    } finally {
      enviando = false;
      validarCampoValor();
    }
  });
});
