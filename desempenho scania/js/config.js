// Configuracao centralizada do dashboard
export const CONFIG = {
  companyName: 'Ziran Logistica e transporte',
  subtitle: 'Painel de Desempenho',
  sheetId: '1rJD9B5YP98mrzYI2MTv2ouPZjPnh9bc2C3eHeywg2ug',
  logoSrc: 'Logo Ziran.jpg',
  defaultDieselPrice: 6.3,
  monthNames: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ],
  metaSheetName: 'meta',

  // Driver note scoring (weighted, escalas normalizadas para 0-100)
  scoring: {
    weights: { consumo: 0.5, support: 0.2, marchaLenta: 0.2, inercia: 0.1 },
    idleTargetPercent: 20,      // até este % de marcha lenta a nota da componente é 100
    inertiaTargetPercent: 12,   // % de inércia (engrenado sem injeção) considerado ideal = 100
    consumoMaxScore: 100        // teto da componente de consumo vs meta
  },

  // Cache configuration
  cache: {
    enabled: true,
    ttlMinutes: 30,
    key: 'ziran_dashboard_cache_v2'
  },

  // Background sync
  sync: {
    autoRefreshMinutes: 5,
    minIntervalMs: 15000
  },

  // Retry configuration
  retry: {
    maxAttempts: 3,
    baseDelayMs: 1000,
    maxDelayMs: 5000
  },

  // Alert thresholds
  alerts: {
    consumptionMetaPercent: 85,
    idlePercentThreshold: 25,
    criticalScoreThreshold: 60,
    criticalConsumoRatio: 0.9,   // crítico se consumo < 90% da meta (margem para evitar excesso de "críticos")
    supportUsageLowThreshold: 60,
    speedAlertThreshold: 3
  },

  // Export settings
  export: {
    currencyBRL: true,
    decimalSeparator: ',',
    thousandSeparator: '.'
  }
};

// Application state
export const state = {
  metaRows: [],
  monthData: {},
  charts: {},
  selectedMonth: null,
  selectedDriver: 'TODOS',
  selectedFleet: 'TODOS',
  dieselAverage: CONFIG.defaultDieselPrice,
  currentPage: 'executive',
  metaMap: new Map(),
  alerts: [],
  cache: {
    data: null,
    timestamp: null
  }
};
