/**
 * Helper para paginação eficiente e padronizada
 * Reduz carga no banco e melhora performance da interface
 */

class PaginationHelper {
  /**
   * Pagina uma consulta MongoDB
   * @param {Object} model - Modelo Mongoose
   * @param {Object} query - Query de busca
   * @param {Object} options - Opções de paginação
   */
  static async paginate(model, query = {}, options = {}) {
    const {
      page = 1,
      limit = 20,
      sort = { _id: -1 },
      select = '',
      populate = null
    } = options;
    
    // Validar parâmetros
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit))); // Máximo 100 itens
    const skip = (pageNum - 1) * limitNum;
    
    try {
      // Executar consulta e contagem em paralelo para melhor performance
      const [data, total] = await Promise.all([
        this.buildQuery(model, query, select, sort, skip, limitNum, populate),
        model.countDocuments(query)
      ]);
      
      const totalPages = Math.ceil(total / limitNum);
      
      return {
        data,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
          nextPage: pageNum < totalPages ? pageNum + 1 : null,
          prevPage: pageNum > 1 ? pageNum - 1 : null
        }
      };
    } catch (error) {
      console.error('Erro na paginação:', error);
      throw error;
    }
  }
  
  /**
   * Constrói a query com otimizações
   */
  static buildQuery(model, query, select, sort, skip, limit, populate) {
    let mongooseQuery = model.find(query);
    
    if (select) {
      mongooseQuery = mongooseQuery.select(select);
    }
    
    if (populate) {
      if (Array.isArray(populate)) {
        populate.forEach(pop => {
          mongooseQuery = mongooseQuery.populate(pop);
        });
      } else {
        mongooseQuery = mongooseQuery.populate(populate);
      }
    }
    
    return mongooseQuery
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(); // Usa lean() para melhor performance quando não precisa de métodos do documento
  }
  
  /**
   * Busca com filtros de texto otimizada
   */
  static async searchPaginated(model, searchTerm, searchFields = [], options = {}) {
    let query = {};
    
    if (searchTerm && searchTerm.trim() && searchFields.length > 0) {
      // Busca textual otimizada
      if (searchFields.length === 1) {
        query[searchFields[0]] = { $regex: searchTerm, $options: 'i' };
      } else {
        query.$or = searchFields.map(field => ({
          [field]: { $regex: searchTerm, $options: 'i' }
        }));
      }
    }
    
    return this.paginate(model, query, options);
  }
  
  /**
   * Busca com filtros de data otimizada
   */
  static async dateRangePaginated(model, dateField, startDate, endDate, options = {}) {
    let query = {};
    
    if (startDate || endDate) {
      query[dateField] = {};
      
      if (startDate) {
        query[dateField].$gte = new Date(startDate);
      }
      
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999); // Incluir todo o dia
        query[dateField].$lte = end;
      }
    }
    
    return this.paginate(model, query, options);
  }
  
  /**
   * Agregação paginada para consultas complexas
   */
  static async aggregatePaginated(model, pipeline = [], options = {}) {
    const {
      page = 1,
      limit = 20
    } = options;
    
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;
    
    // Pipeline com paginação
    const paginatedPipeline = [
      ...pipeline,
      {
        $facet: {
          data: [
            { $skip: skip },
            { $limit: limitNum }
          ],
          count: [
            { $count: "total" }
          ]
        }
      }
    ];
    
    const [result] = await model.aggregate(paginatedPipeline);
    const data = result.data || [];
    const total = result.count[0]?.total || 0;
    const totalPages = Math.ceil(total / limitNum);
    
    return {
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
        nextPage: pageNum < totalPages ? pageNum + 1 : null,
        prevPage: pageNum > 1 ? pageNum - 1 : null
      }
    };
  }
}

module.exports = PaginationHelper;