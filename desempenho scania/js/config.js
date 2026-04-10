// Configuracao centralizada do dashboard
export const CONFIG = {
  companyName: 'Ziran Logistica e transporte',
  subtitle: 'Painel de Desempenho',
  sheetId: '1rJD9B5YP98mrzYI2MTv2ouPZjPnh9bc2C3eHeywg2ug',
  logoSrc: 'Logo Ziran.jpg',
  monthNames: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ],
  metaSheetName: 'meta',

  // Cache configuration
  cache: {
    enabled: true,
    ttlMinutes: 30,
    key: 'ziran_dashboard_cache_v2'
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
  currentPage: 'executive',
  metaMap: new Map(),
  alerts: [],
  cache: {
    data: null,
    timestamp: null
  }
};
