const Retirada = require('../models/retirada');

class RetiradaController {
  // Registrar uma nova retirada
  static async registrarRetirada(dados) {
    try {
      const novaRetirada = new Retirada({
        dataRetirada: dados.dataRetirada,
        horaRetirada: dados.horaRetirada,
        valor: dados.valor,
        responsavel: dados.responsavel,
        motivo: dados.motivo || 'Não especificado',
        observacoes: dados.observacoes || '',
        usuarioId: dados.usuarioId,
        dataCriacao: dados.dataCriacao || new Date()
      });

      await novaRetirada.save();
      return {
        sucesso: true,
        mensagem: 'Retirada registrada com sucesso!',
        dados: novaRetirada
      };
    } catch (error) {
      console.error('Erro ao registrar retirada:', error);
      return {
        sucesso: false,
        mensagem: `Erro ao registrar retirada: ${error.message}`
      };
    }
  }

  // Listar retiradas com filtros
  static async listarRetiradas(filtros = {}) {
    try {
      let query = { ativo: true };

      if (filtros.dataInicio && filtros.dataFim) {
        query.dataCriacao = {
          $gte: new Date(filtros.dataInicio),
          $lte: new Date(filtros.dataFim)
        };
      }

      if (filtros.responsavel) {
        query.responsavel = new RegExp(filtros.responsavel, 'i');
      }

      if (filtros.usuarioId) {
        query.usuarioId = filtros.usuarioId;
      }

      const retiradas = await Retirada.find(query)
        .populate('usuarioId', 'nome email')
        .sort({ dataCriacao: -1 });

      return {
        sucesso: true,
        dados: retiradas,
        total: retiradas.length
      };
    } catch (error) {
      console.error('Erro ao listar retiradas:', error);
      return {
        sucesso: false,
        mensagem: `Erro ao listar retiradas: ${error.message}`,
        dados: []
      };
    }
  }

  // Obter retirada por ID
  static async obterRetiradaById(id) {
    try {
      const retirada = await Retirada.findById(id)
        .populate('usuarioId', 'nome email');

      if (!retirada) {
        return {
          sucesso: false,
          mensagem: 'Retirada não encontrada'
        };
      }

      return {
        sucesso: true,
        dados: retirada
      };
    } catch (error) {
      console.error('Erro ao obter retirada:', error);
      return {
        sucesso: false,
        mensagem: `Erro ao obter retirada: ${error.message}`
      };
    }
  }

  // Atualizar retirada
  static async atualizarRetirada(id, dados) {
    try {
      const retirada = await Retirada.findByIdAndUpdate(
        id,
        {
          dataRetirada: dados.dataRetirada,
          horaRetirada: dados.horaRetirada,
          valor: dados.valor,
          responsavel: dados.responsavel,
          motivo: dados.motivo,
          observacoes: dados.observacoes,
          dataAtualizacao: new Date()
        },
        { new: true }
      );

      if (!retirada) {
        return {
          sucesso: false,
          mensagem: 'Retirada não encontrada'
        };
      }

      return {
        sucesso: true,
        mensagem: 'Retirada atualizada com sucesso!',
        dados: retirada
      };
    } catch (error) {
      console.error('Erro ao atualizar retirada:', error);
      return {
        sucesso: false,
        mensagem: `Erro ao atualizar retirada: ${error.message}`
      };
    }
  }

  // Deletar retirada (soft delete)
  static async deletarRetirada(id) {
    try {
      const retirada = await Retirada.findByIdAndUpdate(
        id,
        { ativo: false, dataAtualizacao: new Date() },
        { new: true }
      );

      if (!retirada) {
        return {
          sucesso: false,
          mensagem: 'Retirada não encontrada'
        };
      }

      return {
        sucesso: true,
        mensagem: 'Retirada removida com sucesso!',
        dados: retirada
      };
    } catch (error) {
      console.error('Erro ao deletar retirada:', error);
      return {
        sucesso: false,
        mensagem: `Erro ao deletar retirada: ${error.message}`
      };
    }
  }

  // Obter resumo de retiradas por período
  static async obterResumoRetiradas(filtros = {}) {
    try {
      let matchStage = { ativo: true };

      if (filtros.dataInicio && filtros.dataFim) {
        matchStage.dataCriacao = {
          $gte: new Date(filtros.dataInicio),
          $lte: new Date(filtros.dataFim)
        };
      }

      const resumo = await Retirada.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalRetirado: { $sum: '$valor' },
            quantidadeRetiradas: { $sum: 1 },
            valorMedio: { $avg: '$valor' },
            valorMaximo: { $max: '$valor' },
            valorMinimo: { $min: '$valor' }
          }
        }
      ]);

      return {
        sucesso: true,
        dados: resumo.length > 0 ? resumo[0] : {
          totalRetirado: 0,
          quantidadeRetiradas: 0,
          valorMedio: 0,
          valorMaximo: 0,
          valorMinimo: 0
        }
      };
    } catch (error) {
      console.error('Erro ao obter resumo de retiradas:', error);
      return {
        sucesso: false,
        mensagem: `Erro ao obter resumo: ${error.message}`
      };
    }
  }

  // Obter retiradas por responsável
  static async obterRetiradasPorResponsavel(responsavel) {
    try {
      const retiradas = await Retirada.find({
        responsavel: new RegExp(responsavel, 'i'),
        ativo: true
      })
        .populate('usuarioId', 'nome email')
        .sort({ dataCriacao: -1 });

      return {
        sucesso: true,
        dados: retiradas,
        total: retiradas.length
      };
    } catch (error) {
      console.error('Erro ao obter retiradas por responsável:', error);
      return {
        sucesso: false,
        mensagem: `Erro ao obter retiradas: ${error.message}`,
        dados: []
      };
    }
  }
}

module.exports = RetiradaController;
