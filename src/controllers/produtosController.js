const Produto = require('../models/produto');
const dbConnection = require('../db/connection');

// Registros antigos de uma loja de materiais podem permanecer no banco.
// Eles são ocultados do catálogo farmacêutico, sem apagar dados históricos.
const isProdutoMaterialConstrucao = (produto) => {
  const texto = `${produto.categoria || ''} ${produto.nome || ''}`.toLowerCase();
  return /materiais?\s+de\s+constru|constru[cç][aã]o|cimento|tijolo|areia\s+lavada|barra\s+de\s+ferro|telha|argamassa|brita|vergalh[aã]o|madeira|massa\s+corrida|\btintas?\b|rejuntes?|\bcal\b|argila|conex[oõ]es|tubos?|condu[ií]tes?|ferramentas?|peneiras?|tomadas?|pregos?|arames?|gesso|hidr[aá]ulica|el[eé]trica|pintura/.test(texto);
};

const CATEGORIAS_FARMACIA = new Set([
  'medicamentos', 'genericos', 'higiene pessoal', 'perfumaria',
  'dermocosmeticos', 'vitaminas e suplementos', 'primeiros socorros',
  'infantil', 'conveniencia'
]);

const normalizarCategoria = (categoria) => String(categoria || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

const isProdutoDaFarmacia = (produto) =>
  CATEGORIAS_FARMACIA.has(normalizarCategoria(produto.categoria)) &&
  !isProdutoMaterialConstrucao(produto);
const mongoose = require('mongoose');

class ProdutosController {
  constructor() {
    // Garantir conexão com o banco
    dbConnection.ensureConnected();
  }
  
  // Buscar produtos com filtros
  async getProdutos(filtros = {}) {
    try {
      await dbConnection.ensureConnected();
      
      console.log("Buscando produtos do banco de dados...");
      
      let query = {};
      
      // Construir query baseada nos filtros
      if (typeof filtros === 'string' && filtros.trim() !== '') {
        // Se filtros for uma string, usamos para busca por texto
        const termo = filtros.trim();
        query.$or = [
          { nome: { $regex: termo, $options: 'i' } },
          { codigo: { $regex: termo, $options: 'i' } },
          { codigoBarras: { $regex: termo, $options: 'i' } },
          { descricao: { $regex: termo, $options: 'i' } }
        ];
      } else if (typeof filtros === 'object') {
        // Se filtros for um objeto, aplicamos filtros específicos
        
        // Filtro por termo de busca (nome, código, descrição)
        if (filtros.termo && filtros.termo.trim() !== '') {
          const termo = filtros.termo.trim();
          query.$or = [
          { nome: { $regex: termo, $options: 'i' } },
          { codigo: { $regex: termo, $options: 'i' } },
          { codigoBarras: { $regex: termo, $options: 'i' } },
          { descricao: { $regex: termo, $options: 'i' } }
          ];
        }
        
        // Filtro por categoria
        if (filtros.categoria && filtros.categoria !== '') {
          query.categoria = filtros.categoria;
        }
        
        // Filtro por estoque
        if (filtros.estoque) {
          switch (filtros.estoque) {
            case 'baixo':
              query.$expr = { $lte: ['$estoque', '$estoqueMinimo'] };
              query.estoque = { $gt: 0 }; // Excluir produtos com estoque zero
              break;
            case 'zero':
              query.estoque = 0;
              break;
            case 'normal':
              query.$expr = { $gt: ['$estoque', '$estoqueMinimo'] };
              break;
          }
        }
      }
      
      console.log("Query para busca de produtos:", JSON.stringify(query));
      console.log("Filtros recebidos:", JSON.stringify(filtros));
      
      // Buscar TODOS os produtos sem limite
      const produtos = await Produto.find(query).sort({ nome: 1 });
      const produtosFarmacia = produtos.filter(isProdutoDaFarmacia);
      
      console.log(`Encontrados ${produtosFarmacia.length} produtos da farmácia no banco de dados`);
      
      // Transformar os produtos para um formato serializável
      return produtosFarmacia.map(produto => ({
        _id: produto._id.toString(),
        codigo: produto.codigo || '',
        codigoBarras: produto.codigoBarras || '',
        nome: produto.nome || '',
        descricao: produto.descricao || '',
        categoria: produto.categoria || 'Outros',
        unidadeMedida: produto.unidadeMedida || 'un',
        preco: produto.preco || 0,
        precoVenda: produto.precoVenda || produto.preco || 0,
        estoque: produto.estoque || 0,
        estoqueMinimo: produto.estoqueMinimo || 10,
        exigeReceita: Boolean(produto.exigeReceita),
        ativo: produto.ativo !== false
      }));
    } catch (error) {
      console.error('Erro detalhado ao buscar produtos:', error);
      return [];
    }
  }
  
  // Buscar produto por ID
  async getProdutoById(id) {
    try {
      await dbConnection.ensureConnected();
      
      // Verificar se o ID é válido
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('ID do produto inválido');
      }
      
      const produto = await Produto.findById(id);
      
      if (!produto) {
        throw new Error('Produto não encontrado');
      }
      
      return {
        _id: produto._id.toString(),
        codigo: produto.codigo || '',
        codigoBarras: produto.codigoBarras || '',
        nome: produto.nome || '',
        descricao: produto.descricao || '',
        categoria: produto.categoria || 'Outros',
        unidadeMedida: produto.unidadeMedida || 'un',
        preco: produto.preco || 0,
        precoVenda: produto.precoVenda || produto.preco || 0,
        estoque: produto.estoque || 0,
        estoqueMinimo: produto.estoqueMinimo || 10,
        exigeReceita: Boolean(produto.exigeReceita),
        ativo: produto.ativo !== false
      };
    } catch (error) {
      console.error(`Erro ao buscar produto ID ${id}:`, error);
      throw error;
    }
  }
  
  // Adicionar produto
  async addProduto(produtoData) {
    try {
      await dbConnection.ensureConnected();
      
      // Verificar se o código já existe (apenas se um código foi fornecido)
      if (produtoData.codigo && produtoData.codigo.trim()) {
        const codigoExiste = await Produto.findOne({ codigo: produtoData.codigo });
        if (codigoExiste) {
          return {
            success: false,
            message: `Já existe um produto com o código ${produtoData.codigo}`
          };
        }
      }
      
      // Garantir valores numéricos corretos
      const produto = new Produto({
        codigo: produtoData.codigo || undefined, // undefined para não salvar campo vazio
        codigoBarras: produtoData.codigoBarras || undefined,
        nome: produtoData.nome,
        descricao: produtoData.descricao || '',
        categoria: produtoData.categoria || 'Outros',
        unidadeMedida: produtoData.unidadeMedida || 'un',
        preco: parseFloat(produtoData.preco) || 0,
        precoVenda: parseFloat(produtoData.precoVenda) || parseFloat(produtoData.preco) || 0,
        estoque: parseInt(produtoData.estoque) || 0,
        estoqueMinimo: parseInt(produtoData.estoqueMinimo) || 10,
        exigeReceita: produtoData.exigeReceita === true,
        ativo: true
      });
      
      await produto.save();
      
      console.log(`Produto ${produto.nome} adicionado com sucesso`);
      
      return {
        success: true,
        produto: {
          _id: produto._id.toString(),
          codigo: produto.codigo,
          nome: produto.nome
        }
      };
    } catch (error) {
      console.error('Erro ao adicionar produto:', error);
      return {
        success: false,
        message: `Erro ao adicionar produto: ${error.message}`
      };
    }
  }
  
  // Atualizar produto
  async updateProduto(id, produtoData) {
    try {
      await dbConnection.ensureConnected();
      
      // Verificar se o ID é válido
      if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return {
          success: false,
          message: 'ID do produto inválido'
        };
      }
      
      // Verificar se o código já existe em outro produto (apenas se código foi fornecido)
      if (produtoData.codigo && produtoData.codigo.trim()) {
        const codigoExiste = await Produto.findOne({
          codigo: produtoData.codigo,
          _id: { $ne: id }
        });
        
        if (codigoExiste) {
          return {
            success: false,
            message: `Já existe outro produto com o código ${produtoData.codigo}`
          };
        }
      }
      
      // Preparar dados para atualização
      const dadosAtualizacao = {
        codigo: produtoData.codigo || undefined, // undefined para não atualizar se vazio
        codigoBarras: produtoData.codigoBarras || undefined,
        nome: produtoData.nome,
        descricao: produtoData.descricao || '',
        categoria: produtoData.categoria || 'Outros',
        unidadeMedida: produtoData.unidadeMedida || 'un',
        preco: parseFloat(produtoData.preco) || 0,
        precoVenda: parseFloat(produtoData.precoVenda) || parseFloat(produtoData.preco) || 0,
        estoque: parseInt(produtoData.estoque) || 0,
        estoqueMinimo: parseInt(produtoData.estoqueMinimo) || 10,
        exigeReceita: produtoData.exigeReceita === true,
        atualizadoEm: new Date()
      };
      
      // Atualizar o produto
      const produto = await Produto.findByIdAndUpdate(
        id,
        dadosAtualizacao,
        { new: true, runValidators: true }
      );
      
      if (!produto) {
        return {
          success: false,
          message: 'Produto não encontrado'
        };
      }
      
      console.log(`Produto ${produto.codigo} atualizado com sucesso`);
      
      return {
        success: true,
        produto: {
          _id: produto._id.toString(),
          codigo: produto.codigo,
          nome: produto.nome
        }
      };
    } catch (error) {
      console.error(`Erro ao atualizar produto ID ${id}:`, error);
      return {
        success: false,
        message: `Erro ao atualizar produto: ${error.message}`
      };
    }
  }
  
  // Excluir produto (marcar como inativo)
  async deleteProduto(id) {
    try {
      await dbConnection.ensureConnected();
      
      // Verificar se o ID é válido
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return { 
          success: false, 
          message: 'ID de produto inválido' 
        };
      }
      
      // Marcar como inativo em vez de deletar permanentemente
      const produto = await Produto.findByIdAndUpdate(
        id,
        { ativo: false },
        { new: true }
      );
      
      if (!produto) {
        return { 
          success: false, 
          message: 'Produto não encontrado' 
        };
      }
      
      return { 
        success: true, 
        message: 'Produto excluído com sucesso' 
      };
    } catch (error) {
      console.error(`Erro ao excluir produto ID ${id}:`, error);
      return { 
        success: false, 
        message: `Erro ao excluir produto: ${error.message}` 
      };
    }
  }
  
  // Restaurar produto (marcar como ativo)
  async restoreProduto(id) {
    try {
      await dbConnection.ensureConnected();
      
      // Verificar se o ID é válido
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return { 
          success: false, 
          message: 'ID de produto inválido' 
        };
      }
      
      // Marcar como ativo novamente
      const produto = await Produto.findByIdAndUpdate(
        id,
        { ativo: true },
        { new: true }
      );
      
      if (!produto) {
        return { 
          success: false, 
          message: 'Produto não encontrado' 
        };
      }
      
      return { 
        success: true, 
        message: 'Produto restaurado com sucesso' 
      };
    } catch (error) {
      console.error(`Erro ao restaurar produto ID ${id}:`, error);
      return { 
        success: false, 
        message: `Erro ao restaurar produto: ${error.message}` 
      };
    }
  }

  // Excluir produto permanentemente do banco de dados
  async removeProduto(id) {
    try {
      await dbConnection.ensureConnected();
      
      // Verificar se o ID é válido
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return { 
          success: false, 
          message: 'ID de produto inválido' 
        };
      }
      
      // Remover o produto permanentemente do banco
      const resultado = await Produto.findByIdAndDelete(id);
      
      if (!resultado) {
        return { 
          success: false, 
          message: 'Produto não encontrado' 
        };
      }
      
      console.log(`Produto ID: ${id} removido permanentemente do banco`);
      
      return { 
        success: true, 
        message: 'Produto removido permanentemente com sucesso' 
      };
    } catch (error) {
      console.error(`Erro ao remover produto ID ${id}:`, error);
      return { 
        success: false, 
        message: `Erro ao remover produto: ${error.message}` 
      };
    }
  }

  // Buscar todas as categorias únicas de produtos
  async getCategorias() {
    try {
      await dbConnection.ensureConnected();
      
      const categorias = await Produto.distinct('categoria');
      
      // Retornar categorias ordenadas
      return categorias.sort();
    } catch (error) {
      console.error('Erro ao buscar categorias:', error);
      return [];
    }
  }
}

module.exports = new ProdutosController();
