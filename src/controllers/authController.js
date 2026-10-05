const dbConnection = require('../db/connection');
const bcrypt = require('bcryptjs');
const { normalizeRole } = require('../main/accessControl');

class AuthController {
  constructor() {
    this.User = dbConnection.User;
    this.currentUser = null;
  }

  async login(email, senha) {
    try {
      console.log("Iniciando processo de login para:", email);
      
      // Garantir que estamos conectados ao banco
      await dbConnection.ensureConnected();
      
      // Buscar usuário pelo email
      console.log("Buscando usuário com email:", email);
      const user = await this.User.findOne({ email });
      
      if (!user) {
        console.log("Usuário não encontrado com email:", email);
        return { 
          success: false, 
          message: 'E-mail não encontrado' 
        };
      }
      
      console.log("Usuário encontrado:", user.nome);
      
      // Verificar se a conta está ativa
      if (!user.ativo) {
        console.log("Conta desativada para o usuário:", email);
        return {
          success: false,
          message: 'Conta desativada. Entre em contato com o administrador.'
        };
      }
      
      // Verificar a senha
      console.log("Verificando senha...");
      const isMatch = await user.compararSenha(senha);
      
      if (!isMatch) {
        console.log("Senha incorreta para o usuário:", email);
        return { 
          success: false, 
          message: 'Senha incorreta'
        };
      }
      
      console.log("Login bem-sucedido para:", email);
      
      // Atualizar último acesso
      user.ultimoAcesso = new Date();
      await user.save();
      
      // Armazenar usuário na sessão (sem a senha)
      this.currentUser = {
        id: user._id.toString(), // Converter para string
        nome: user.nome,
        email: user.email,
        tipo: normalizeRole(user.tipo)
      };
      
      return {
        success: true,
        user: this.currentUser
      };
    } catch (error) {
      console.error('Erro detalhado durante o login:', error);
      return {
        success: false,
        message: 'Erro interno do servidor: ' + error.message
      };
    }
  }
  
  async logout() {
    this.currentUser = null;
    return { success: true };
  }
  
  getCurrentUser() {
    return this.currentUser;
  }

  async validateSession() {
    if (!this.currentUser) return null;
    await dbConnection.ensureConnected();
    const user = await this.User.findById(this.currentUser.id).select('nome email tipo ativo');
    if (!user?.ativo) {
      this.currentUser = null;
      return null;
    }
    this.currentUser = {
      id: user._id.toString(),
      nome: user.nome,
      email: user.email,
      tipo: normalizeRole(user.tipo)
    };
    return this.currentUser;
  }
  
  // Adicionar método para registrar usuário
  async registerUser(userData) {
    try {
      // Garantir que estamos conectados ao banco
      await dbConnection.ensureConnected();
      
      // Verificar se o email já existe
      const emailExists = await this.User.findOne({ email: userData.email });
      if (emailExists) {
        return { 
          success: false, 
          message: 'Este e-mail já está sendo utilizado' 
        };
      }
      
      // Criar o usuário
      const novoUsuario = new this.User({
        nome: userData.nome,
        email: userData.email,
        senha: userData.senha, // será criptografada pelo middleware do modelo
        tipo: userData.tipo || 'vendedor_balcao',
        ativo: true
      });
      
      await novoUsuario.save();
      
      return {
        success: true,
        message: 'Usuário cadastrado com sucesso',
        user: {
          id: novoUsuario._id,
          nome: novoUsuario.nome,
          email: novoUsuario.email,
          tipo: novoUsuario.tipo
        }
      };
    } catch (error) {
      console.error('Erro ao registrar usuário:', error);
      return {
        success: false,
        message: 'Erro ao registrar usuário: ' + error.message
      };
    }
  }
}

module.exports = new AuthController();
