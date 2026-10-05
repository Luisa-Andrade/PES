/**
 * Sistema de Cache em Memória para melhorar performance
 * Reduz consultas repetidas ao banco de dados
 */

class MemoryCache {
  constructor() {
    this.cache = new Map();
    this.ttl = new Map(); // Time to live
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0
    };
    
    // Limpeza automática de itens expirados a cada 5 minutos
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }
  
  /**
   * Armazena um valor no cache com TTL
   */
  set(key, value, ttlSeconds = 300) { // 5 minutos por padrão
    this.cache.set(key, value);
    this.ttl.set(key, Date.now() + (ttlSeconds * 1000));
    this.stats.sets++;
    
    console.log(`[CACHE] Set: ${key} (TTL: ${ttlSeconds}s)`);
  }
  
  /**
   * Recupera um valor do cache
   */
  get(key) {
    const expiry = this.ttl.get(key);
    
    // Verificar se expirou
    if (expiry && expiry < Date.now()) {
      this.delete(key);
      this.stats.misses++;
      return null;
    }
    
    const value = this.cache.get(key);
    if (value !== undefined) {
      this.stats.hits++;
      console.log(`[CACHE] Hit: ${key}`);
      return value;
    }
    
    this.stats.misses++;
    console.log(`[CACHE] Miss: ${key}`);
    return null;
  }
  
  /**
   * Remove um item do cache
   */
  delete(key) {
    this.cache.delete(key);
    this.ttl.delete(key);
    console.log(`[CACHE] Delete: ${key}`);
  }
  
  /**
   * Limpa itens expirados
   */
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, expiry] of this.ttl.entries()) {
      if (expiry < now) {
        this.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`[CACHE] Cleaned ${cleaned} expired items`);
    }
  }
  
  /**
   * Limpa todo o cache
   */
  clear() {
    this.cache.clear();
    this.ttl.clear();
    console.log('[CACHE] Cache cleared');
  }
  
  /**
   * Retorna estatísticas do cache
   */
  getStats() {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? ((this.stats.hits / total) * 100).toFixed(2) : 0;
    
    return {
      ...this.stats,
      total,
      hitRate: `${hitRate}%`,
      size: this.cache.size
    };
  }
  
  /**
   * Helper para cache de funções com chave automática
   */
  async cached(key, asyncFunction, ttlSeconds = 300) {
    let result = this.get(key);
    
    if (result === null) {
      result = await asyncFunction();
      this.set(key, result, ttlSeconds);
    }
    
    return result;
  }
}

// Instância global do cache
const cache = new MemoryCache();

module.exports = cache;