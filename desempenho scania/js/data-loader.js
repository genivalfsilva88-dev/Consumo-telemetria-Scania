import { CONFIG, state } from './config.js';
import { cacheManager } from './cache.js';

/**
 * Data loader with retry logic and lazy loading
 */
export class DataLoader {
  constructor() {
    this.loadingPromise = null;
    this.loadedMonths = new Set();
  }

  /**
   * Load all data with caching and retry
   */
  async loadAllData() {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      // Try cache first
      if (CONFIG.cache.enabled && cacheManager.isFresh()) {
        const cachedData = await cacheManager.load();
        if (cachedData) {
          this._restoreState(cachedData);
          return cachedData;
        }
      }

      // Load from Google Sheets
      const data = await this._loadFromSheets();
      
      // Save to cache
      if (CONFIG.cache.enabled) {
        await cacheManager.save(this._extractState());
      }

      return data;
    })();

    try {
      return await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  /**
   * Load specific month on demand
   */
  async loadMonth(month) {
    if (this.loadedMonths.has(month)) {
      return state.monthData[month] || [];
    }

    try {
      const rows = await this._loadMonthWithRetry(month);
      state.monthData[month] = normalizeMonthRows(rows);
      this.loadedMonths.add(month);
      return state.monthData[month];
    } catch (error) {
      console.error(`Failed to load month ${month}:`, error);
      state.monthData[month] = [];
      return [];
    }
  }

  /**
   * Load single sheet with retry
   */
  async _loadMonthWithRetry(month, maxAttempts = CONFIG.retry.maxAttempts) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this._loadSheetJSONP(month);
      } catch (error) {
        lastError = error;
        console.warn(`Attempt ${attempt}/${maxAttempts} failed for ${month}:`, error.message);
        
        if (attempt < maxAttempts) {
          const delay = this._calculateRetryDelay(attempt);
          await this._sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Load all months from sheets
   */
  async _loadFromSheets() {
    try {
      // Load meta data
      const metaRows = await this._loadSheetWithRetry(CONFIG.metaSheetName);
      state.metaRows = metaRows;
      state.metaMap = buildMetaMap(metaRows);

      // Load months in batches to avoid overwhelming the server
      const batchSize = 4;
      const batches = [];
      
      for (let i = 0; i < CONFIG.monthNames.length; i += batchSize) {
        batches.push(CONFIG.monthNames.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        const results = await Promise.all(
          batch.map(async month => {
            try {
              const rows = await this._loadMonthWithRetry(month);
              return [month, normalizeMonthRows(rows)];
            } catch (error) {
              console.warn(`Failed to load ${month}`, error);
              return [month, []];
            }
          })
        );

        Object.assign(state.monthData, Object.fromEntries(results));
      }

      // Mark all months as loaded
      CONFIG.monthNames.forEach(m => this.loadedMonths.add(m));

      return state.monthData;
    } catch (error) {
      console.error('Critical error loading data:', error);
      throw error;
    }
  }

  /**
   * Load sheet with retry
   */
  async _loadSheetWithRetry(sheetName, maxAttempts = CONFIG.retry.maxAttempts) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this._loadSheetJSONP(sheetName);
      } catch (error) {
        lastError = error;
        
        if (attempt < maxAttempts) {
          const delay = this._calculateRetryDelay(attempt);
          await this._sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Calculate exponential backoff delay
   */
  _calculateRetryDelay(attempt) {
    const delay = CONFIG.retry.baseDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, CONFIG.retry.maxDelayMs);
  }

  /**
   * Sleep utility
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Load sheet using JSONP
   */
  _loadSheetJSONP(sheetName) {
    return new Promise((resolve, reject) => {
      const callbackName = `gviz_callback_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
      const script = document.createElement('script');
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Tempo esgotado ao carregar ${sheetName}`));
      }, 15000);

      function cleanup() {
        clearTimeout(timeout);
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      window[callbackName] = (response) => {
        try {
          cleanup();
          if (!response || !response.table) {
            return reject(new Error(`Resposta inválida da aba ${sheetName}`));
          }

          const cols = (response.table.cols || []).map(c => (c.label || '').trim());
          const rows = (response.table.rows || []).map(r => {
            const obj = {};
            (r.c || []).forEach((cell, idx) => {
              obj[cols[idx] || `col_${idx}`] = cell ? (cell.f ?? cell.v ?? '') : '';
            });
            return obj;
          });

          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };

      const query = encodeURIComponent('select *');
      script.src = `https://docs.google.com/spreadsheets/d/${CONFIG.sheetId}/gviz/tq?sheet=${encodeURIComponent(sheetName)}&tq=${query}&tqx=responseHandler:${callbackName};out:json`;
      
      script.onerror = () => {
        cleanup();
        reject(new Error(`Falha ao carregar script da aba ${sheetName}`));
      };

      document.body.appendChild(script);
    });
  }

  /**
   * Extract state for caching
   */
  _extractState() {
    return {
      metaRows: state.metaRows,
      monthData: state.monthData,
      metaMap: Array.from(state.metaMap.entries())
    };
  }

  /**
   * Restore state from cache
   */
  _restoreState(cachedData) {
    state.metaRows = cachedData.metaRows || [];
    state.monthData = cachedData.monthData || {};
    state.metaMap = new Map(cachedData.metaMap || []);
    CONFIG.monthNames.forEach(m => this.loadedMonths.add(m));
  }
}

// Utility functions

export function buildMetaMap(metaRows) {
  const map = new Map();
  metaRows.forEach(row => {
    const frota = String(row['Frota'] || '').trim();
    if (!frota) return;
    map.set(frota, {
      motorista: String(row['Motorista'] || '').trim(),
      placa: String(row['Placa'] || '').trim(),
      meta: parseNumber(row['Meta'])
    });
  });
  return map;
}

export function normalizeMonthRows(rows) {
  return rows.map(row => {
    const equipamento = String(row['Equipamento'] || '').trim();
    if (!equipamento) return null;

    const metaInfo = state.metaMap.get(equipamento) || {};
    
    const supportUsage = firstNumber(row, [
      'Scania Driver Support (%)',
      'Utilização do Scania Driver Support (%)',
      'Utilizacao do Scania Driver Support (%)',
      'Uso do Scania Driver Support (%)',
      'Uso do suporte do motorista (%)',
      'Utilização do suporte do motorista (%)',
      'Utilizacao do suporte do motorista (%)'
    ]);

    const consumo = parseNumber(row['Consumo de combustível (km/l)']);
    const inercia = firstNumber(row, [
      'Veículo engrenado sem injeção de combustível (%)',
      'Veiculo engrenado sem injecao de combustivel (%)'
    ]);
    const marchaLenta = parseNumber(row['Marcha lenta (%)']);
    const excessoVelocidade = parseNumber(row['Excesso de velocidade (%)']);
    
    const score = computeDriverNote({
      consumo,
      meta: metaInfo.meta || 0,
      supportUsage,
      marchaLenta,
      inercia
    });

    return {
      equipamento,
      hodometro: parseNumber(row['Hodômetro (km)']),
      distancia: parseNumber(row['Distância (km)']),
      score,
      supportUsage,
      inercia,
      marchaLenta,
      excessoVelocidade,
      freadasBruscas: parseNumber(row['Freadas bruscas (n°/100 km)']) ||
                      parseNumber(row['Freadas bruscas (n/100 km)']) || 0,
      consumo,
      arla32: parseNumber(row['ARLA 32 (l/km)']),
      co2: parseNumber(row['Dióxido de carbono (toneladas)']),
      mes: String(row['Mês'] || '').trim(),
      motorista: metaInfo.motorista || 'Sem cadastro',
      placa: metaInfo.placa || '-',
      meta: metaInfo.meta || 0,
      grade: gradeFromScore(score)
    };
  }).filter(Boolean);
}

export function parseNumber(value) {
  if (value == null || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const str = String(value).trim();
  if (!str) return 0;
  const normalized = str.includes(',') ? str.replace(/\./g, '').replace(',', '.') : str;
  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function firstNumber(row, keys) {
  for (const key of keys) {
    if (row[key] != null && row[key] !== '') return parseNumber(row[key]);
  }
  return 0;
}

export function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'E';
}

export function computeDriverNote({ consumo, meta, supportUsage, marchaLenta, inercia }) {
  const components = [
    computeConsumptionScore(consumo, meta),
    clamp(supportUsage),
    computeIdleScore(marchaLenta),
    computeInertiaScore(inercia)
  ].filter(v => v != null);
  
  return components.length ? avg(components.map(v => ({ value: v })), 'value') : 0;
}

function computeConsumptionScore(consumo, meta) {
  if (!(meta > 0)) return null;
  return clamp((consumo / meta) * 100);
}

function computeIdleScore(marchaLenta) {
  if (!(marchaLenta >= 0)) return null;
  if (marchaLenta <= 20) return 100;
  return clamp((20 / marchaLenta) * 100);
}

function computeInertiaScore(inercia) {
  if (!(inercia >= 0)) return null;
  return clamp(inercia);
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

function avg(arr, key) {
  return arr.length ? arr.reduce((s, i) => s + (Number(i[key]) || 0), 0) / arr.length : 0;
}
