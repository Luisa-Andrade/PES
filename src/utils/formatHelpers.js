// Funções auxiliares para formatação e validação de dados de clientes

/**
 * Formata e valida CPF/CNPJ
 */
function formatCpfCnpj(value) {
  // Remove todos os caracteres não numéricos
  const numbers = value.replace(/\D/g, '');
  
  // Formato CPF: 000.000.000-00
  if (numbers.length <= 11) {
    return numbers.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
      .substring(0, 14);
  }
  // Formato CNPJ: 00.000.000/0001-00
  else {
    return numbers.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
      .substring(0, 18);
  }
}

/**
 * Formata telefone
 */
function formatPhone(value) {
  const numbers = value.replace(/\D/g, '');
  
  // Telefone com DDD: (00) 0000-0000
  if (numbers.length <= 10) {
    return numbers.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3')
      .substring(0, 14);
  }
  // Celular com DDD: (00) 00000-0000
  else {
    return numbers.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')
      .substring(0, 15);
  }
}

/**
 * Formata CEP
 */
function formatCep(value) {
  const numbers = value.replace(/\D/g, '');
  return numbers.replace(/(\d{5})(\d{3})/, '$1-$2').substring(0, 9);
}

/**
 * Valida CPF
 */
function validarCPF(cpf) {
  cpf = cpf.replace(/\D/g, '');
  
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  
  let soma = 0;
  let resto;
  
  for (let i = 1; i <= 9; i++) {
    soma += parseInt(cpf.substring(i-1, i)) * (11 - i);
  }
  
  resto = (soma * 10) % 11;
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

/**
 * Valida CNPJ
 */
function validarCNPJ(cnpj) {
  cnpj = cnpj.replace(/\D/g, '');
  
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

/**
 * Valida CPF ou CNPJ conforme o tamanho do número
 */
function validarCpfCnpj(documento) {
  const numeros = documento.replace(/\D/g, '');
  
  if (numeros.length === 11) {
    return validarCPF(numeros);
  } else if (numeros.length === 14) {
    return validarCNPJ(numeros);
  }
  
  return false;
}

/**
 * Consulta CEP na API viacep.com.br
 */
async function consultarCep(cep) {
  try {
    const cepNumerico = cep.replace(/\D/g, '');
    if (cepNumerico.length !== 8) return null;
    
    const response = await fetch(`https://viacep.com.br/ws/${cepNumerico}/json/`);
    if (!response.ok) throw new Error('Erro na consulta do CEP');
    
    const data = await response.json();
    if (data.erro) return null;
    
    return {
      logradouro: data.logradouro,
      bairro: data.bairro,
      cidade: data.localidade,
      estado: data.uf
    };
  } catch (error) {
    console.error('Erro ao consultar CEP:', error);
    return null;
  }
}

module.exports = {
  formatCpfCnpj,
  formatPhone,
  formatCep,
  validarCpfCnpj,
  consultarCep
};
