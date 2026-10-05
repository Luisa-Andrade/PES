/**
 * Utilitário para corrigir problemas de foco em inputs no Electron
 * Este problema é comum e ocorre quando elementos perdem foco após abrir DevTools
 * ou devido a problemas de timing/z-index no Electron
 */

class ElectronInputFocusFixer {
  constructor() {
    this.devToolsOpen = false;
    this.initialized = false;
    this.focusQueue = [];
    this.init();
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Aguardar DOM estar pronto
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    this.setupInputFixers();
    this.setupDevToolsDetection();
    this.setupWindowFocusHandler();
    
    // Reset inicial após um delay
    setTimeout(() => this.resetAllInputs(), 1000);
  }

  /**
   * Função para forçar foco em input com retry
   */
  forceFocusOnInput(element, retries = 3) {
    if (!element || retries <= 0) return false;
    
    try {
      element.focus();
      
      // Verificar se o foco foi aplicado
      setTimeout(() => {
        if (document.activeElement !== element) {
          this.forceFocusOnInput(element, retries - 1);
        }
      }, 50);
      
      return true;
    } catch (error) {
      console.warn('Erro ao forçar foco:', error);
      return false;
    }
  }

  /**
   * Resetar propriedades de foco de todos os inputs
   */
  resetAllInputs() {
    const inputs = document.querySelectorAll('input[type="text"], input[type="number"], input[type="email"], input[type="password"], input[type="search"], textarea, select');
    
    inputs.forEach(input => {
      if (!input.disabled && !input.readOnly) {
        input.style.pointerEvents = 'auto';
        input.tabIndex = input.tabIndex || 0;
        
        // Remover handlers antigos se existirem
        input.removeEventListener('mousedown', this.inputMouseDownHandler);
        input.removeEventListener('click', this.inputClickHandler);
        input.removeEventListener('focus', this.inputFocusHandler);
        
        // Adicionar novos handlers
        input.addEventListener('mousedown', this.inputMouseDownHandler.bind(this));
        input.addEventListener('click', this.inputClickHandler.bind(this));
        input.addEventListener('focus', this.inputFocusHandler.bind(this));
      }
    });
  }

  /**
   * Handler para mousedown em inputs
   */
  inputMouseDownHandler(e) {
    e.stopPropagation();
    setTimeout(() => this.forceFocusOnInput(e.target), 10);
  }

  /**
   * Handler para click em inputs
   */
  inputClickHandler(e) {
    setTimeout(() => this.forceFocusOnInput(e.target), 10);
  }

  /**
   * Handler para focus em inputs
   */
  inputFocusHandler(e) {
    e.target.style.pointerEvents = 'auto';
  }

  /**
   * Configurar fixers para inputs existentes
   */
  setupInputFixers() {
    this.resetAllInputs();
    
    // Observer para novos inputs adicionados dinamicamente
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const inputs = node.querySelectorAll ? 
                node.querySelectorAll('input[type="text"], input[type="number"], input[type="email"], input[type="password"], input[type="search"], textarea, select') : 
                [];
              
              if (inputs.length > 0) {
                setTimeout(() => this.resetAllInputs(), 100);
              }
            }
          });
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Detecção de abertura/fechamento do DevTools
   */
  setupDevToolsDetection() {
    setInterval(() => {
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      
      const devToolsCurrentlyOpen = (widthThreshold || heightThreshold);
      
      if (devToolsCurrentlyOpen !== this.devToolsOpen) {
        this.devToolsOpen = devToolsCurrentlyOpen;
        
        // Reset inputs quando DevTools muda de estado
        setTimeout(() => {
          this.resetAllInputs();
        }, 200);
      }
    }, 500);
  }

  /**
   * Handler para quando a janela ganha foco
   */
  setupWindowFocusHandler() {
    window.addEventListener('focus', () => {
      setTimeout(() => this.resetAllInputs(), 100);
    });
    
    // Também resetar quando há mudanças de visibilidade
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        setTimeout(() => this.resetAllInputs(), 200);
      }
    });
  }

  /**
   * Método público para forçar reset manual
   */
  forceReset() {
    this.resetAllInputs();
  }

  /**
   * Método para aplicar fix em um input específico
   */
  fixSpecificInput(selector) {
    const input = document.querySelector(selector);
    if (input) {
      this.forceFocusOnInput(input);
      return true;
    }
    return false;
  }
}

// Instância global
if (typeof window !== 'undefined') {
  window.electronInputFixer = new ElectronInputFocusFixer();
  
  // Função global para usar em qualquer lugar
  window.fixInputFocus = (selector = null) => {
    if (selector) {
      return window.electronInputFixer.fixSpecificInput(selector);
    } else {
      window.electronInputFixer.forceReset();
      return true;
    }
  };
}

// Export para uso em módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ElectronInputFocusFixer;
}