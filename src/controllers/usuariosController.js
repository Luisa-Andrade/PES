const dbConnection = require('../db/connection');
const { ROLES, normalizeRole } = require('../main/accessControl');

class UsuariosController {
  constructor() {
    // Obter o modelo User da conexão
    this.User = dbConnection.User;
  }
  
  // Buscar todos os usuários
  async getUsuarios() {
    try {
      await dbConnection.ensureConnected();
      
      // Buscar usuários sem retornar a senha
      const usuarios = await this.User.find({}, { senha: 0 }).sort({ nome: 1 });
      
      // Formatar para o frontend
      return usuarios.map(usuario => ({
        id: usuario._id.toString(),
        nome: usuario.nome,
        email: usuario.email,
        tipo: normalizeRole(usuario.tipo),
        ativo: usuario.ativo,
        dataCriacao: usuario.dataCriacao,
        ultimoAcesso: usuario.ultimoAcesso
      }));
    } catch (error) {
      console.error('Erro ao buscar usuários:', error);
      throw error;
    }
  }
  
  // Buscar usuário por ID
  async getUsuarioById(id) {
    try {
      await dbConnection.ensureConnected();
      
      const usuario = await this.User.findById(id, { senha: 0 });
      
      if (!usuario) {
        throw new Error('Usuário não encontrado');
      }
      
      return {
        id: usuario._id.toString(),
        nome: usuario.nome,
        email: usuario.email,
        tipo: normalizeRole(usuario.tipo),
        ativo: usuario.ativo,
        dataCriacao: usuario.dataCriacao,
        ultimoAcesso: usuario.ultimoAcesso
      };
    } catch (error) {
      console.error(`Erro ao buscar usuário ID ${id}:`, error);
      throw error;
    }
  }
  
  // Criar novo usuário
  async createUsuario(userData) {
    try {
      await dbConnection.ensureConnected();
      
      // Verificar se o email já existe
      const emailExists = await this.User.findOne({ email: userData.email });
      if (emailExists) {
        return { success: false, message: 'Este e-mail já está em uso' };
      }
      
      // Verificar se a senha foi fornecida
      if (!userData.senha) {
        return { success: false, message: 'A senha é obrigatória' };
      }
      if (!ROLES.includes(userData.tipo)) {
        return { success: false, message: 'Perfil de acesso inválido' };
      }
      
      // Criar o usuário
      const novoUsuario = new this.User({
        nome: userData.nome,
        email: userData.email,
        senha: userData.senha,
        tipo: userData.tipo,
        ativo: true
      });
      
      await novoUsuario.save();
      
      return { 
        success: true,
        usuario: {
          id: novoUsuario._id.toString(),
          nome: novoUsuario.nome,
          email: novoUsuario.email,
          tipo: novoUsuario.tipo
        }
      };
    } catch (error) {
      console.error('Erro ao criar usuário:', error);
      return { success: false, message: `Erro ao criar usuário: ${error.message}` };
    }
  }
  
  // Atualizar usuário existente
  async updateUsuario(id, userData) {
    try {
      await dbConnection.ensureConnected();
      if (!ROLES.includes(userData.tipo)) {
        return { success: false, message: 'Perfil de acesso inválido' };
      }
      
      // Verificar se o email já está em uso por outro usuário
      const emailExists = await this.User.findOne({ 
        email: userData.email,
        _id: { $ne: id }
      });
      
      if (emailExists) {
        return { success: false, message: 'Este e-mail já está em uso por outro usuário' };
      }
      
      const usuario = await this.User.findById(id);
      if (!usuario) {
        return { success: false, message: 'Usuário não encontrado' };
      }
      usuario.nome = userData.nome;
      usuario.email = userData.email;
      usuario.tipo = userData.tipo;
      if (userData.senha) usuario.senha = userData.senha;
      await usuario.save();
      
      return { 
        success: true,
        usuario: {
          id: usuario._id.toString(),
          nome: usuario.nome,
          email: usuario.email,
          tipo: usuario.tipo,
          ativo: usuario.ativo
        }
      };
    } catch (error) {
      console.error(`Erro ao atualizar usuário ID ${id}:`, error);
      return { success: false, message: `Erro ao atualizar usuário: ${error.message}` };
    }
  }
  
  // Ativar/desativar usuário
  async toggleUsuarioStatus(id, ativo) {
    try {
      await dbConnection.ensureConnected();
      
      const usuario = await this.User.findByIdAndUpdate(
        id,
        { ativo },
        { new: true }
      );
      
      if (!usuario) {
        return { success: false, message: 'Usuário não encontrado' };
      }
      
      return { 
        success: true,
        message: `Usuário ${ativo ? 'ativado' : 'desativado'} com sucesso`
      };
    } catch (error) {
      console.error(`Erro ao alterar status do usuário ID ${id}:`, error);
      return { success: false, message: `Erro ao alterar status: ${error.message}` };
    }
  }
}

module.exports = new UsuariosController();
