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

  // Metas hipoteticas para simulacoes de economia (nao afetam nota/alertas)
  goals: {
    idleSavingsTargetPercent: 15
  },

  // Alert thresholds
  alerts: {
    consumptionMetaPercent: 85,
    idlePercentThreshold: 25,
    criticalScoreThreshold: 60,
    criticalConsumoRatio: 0.9,   // crítico se consumo < 90% da meta (margem para evitar excesso de "críticos")
    supportUsageLowThreshold: 60,
    speedAlertThreshold: 3,

    // Distância mínima (km) no período para um equipamento entrar nas médias, rankings,
    // alertas críticos e oportunidades. Evita que um caminhão parado (0 km, sensor com
    // falha) apareça como "pior desempenho" só porque consumo/distância ficaram zerados.
    minActivityKm: 30,

    // Fator de correção do consumo em marcha lenta: marcha lenta é medida em % do TEMPO
    // de motor ligado, mas a taxa de queima parado (L/h) é bem menor que a taxa média de
    // operação (L/h rodando). Aplicar o % de tempo direto sobre o total de litros do
    // período superestima o litro gasto em marcha lenta. Este fator (0-1) aproxima a
    // relação entre a taxa de consumo parado e a taxa média — ajuste se houver dado
    // real de consumo/hora parado do fabricante.
    idleFuelRateFactor: 0.35
  },

  // Export settings
  export: {
    currencyBRL: true,
    decimalSeparator: ',',
    thousandSeparator: '.'
  },

  // AI insights (Cloudflare Pages Functions + Workers AI)
  ai: {
    insightsEndpoint: '/api/insights',
    chatEndpoint: '/api/chat',
    maxHistory: 6
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
  idleSavingsTargetPercent: CONFIG.goals.idleSavingsTargetPercent,
  currentPage: 'executive',
  metaMap: new Map(),
  alerts: [],
  cache: {
    data: null,
    timestamp: null
  },
  aiChatHistory: [],
  aiInsightCache: null
};
