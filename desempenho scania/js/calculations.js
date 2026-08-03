import { CONFIG, state } from './config.js';
import { gradeFromScore, parseNumber } from './data-loader.js';

/**
 * Calculation utilities for KPIs and metrics
 */

export function avg(arr, key) {
  return arr.length ? arr.reduce((s, i) => s + (Number(i[key]) || 0), 0) / arr.length : 0;
}

export function sum(arr, key) {
  return arr.reduce((s, i) => s + (Number(i[key]) || 0), 0);
}

export function uniqueCount(arr, key) {
  return new Set(arr.map(item => item[key]).filter(Boolean)).size;
}

export function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : 0));
}

export function formatNumber(value, digits = 1) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

export function formatInt(value) {
  return Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

export function formatCurrencyInput(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function currentDieselPrice() {
  return clamp(Number(state.dieselAverage || CONFIG.defaultDieselPrice || 0), 0, 999);
}

export function currentIdleSavingsTarget() {
  const value = state.idleSavingsTargetPercent ?? CONFIG.goals.idleSavingsTargetPercent;
  return clamp(Number(value || 0), 0, 100);
}

/**
 * Um equipamento só entra em médias, rankings, alertas críticos e oportunidades
 * se rodou uma distância mínima no período — evita que um veículo parado (0 km,
 * falha de telemetria) seja lido como "pior desempenho".
 */
export function hasMinActivity(row) {
  return Number(row?.distancia || 0) >= (CONFIG.alerts.minActivityKm || 0);
}

export function idleFuelRateFactor() {
  const value = CONFIG.alerts.idleFuelRateFactor;
  return clamp(Number.isFinite(value) ? value : 1, 0, 1);
}

export function gradeClass(letter) {
  return `grade-${String(letter || 'e').toLowerCase()}`;
}

export function pillColor(letter) {
  return ({
    A: '#16a34a',
    B: '#65a30d',
    C: '#ca8a04',
    D: '#ea580c',
    E: '#dc2626'
  })[letter] || '#64748b';
}

/**
 * Compute summary for a set of rows
 */
export function computeMonthSummary(rows) {
  const dieselPrice = currentDieselPrice();
  const idleSavingsTargetPercent = currentIdleSavingsTarget();

  if (!rows || rows.length === 0) {
    return {
      frota: 0,
      consumoMedio: 0,
      consumoMedioMeta: 0,
      distanciaMedia: 0,
      totalKm: 0,
      co2Total: 0,
      scoreMedio: 0,
      supportUsageMedio: 0,
      metaMedia: 0,
      metaHitPct: 0,
      metaHitCount: 0,
      validMetaCount: 0,
      metaBelowCount: 0,
      savingsLiters: 0,
      savingsValue: 0,
      dieselPrice,
      fuelLiters: 0,
      fuelCost: 0,
      wasteLiters: 0,
      wasteCost: 0,
      idleCost: 0,
      savedLiters: 0,
      savedCost: 0,
      netSavingsLiters: 0,
      netSavingsCost: 0,
      wastePctOfCost: 0,
      criticalCount: 0,
      criticalPct: 0,
      grade: 'E',
      idleLiters: 0,
      idleSavingsLiters15: 0,
      idleSavingsCost15: 0,
      idleSavingsTargetPercent,
      idleAboveTargetCount: 0,
      supportLowCount: 0,
      speedAlertCount: 0,
      driversBelowMetaCount: 0,
      marchaLenta: 0,
      inercia: 0,
      excessoVelocidade: 0,
      freadasBruscas: 0,
      inactiveCount: 0,
      noMetaCount: 0
    };
  }

  // Só equipamentos com atividade mínima no período entram em médias, rankings,
  // alertas críticos e oportunidades (ver hasMinActivity). O total de frota
  // continua contando todo mundo, para não esconder equipamento sem dado.
  const judgedRows = rows.filter(hasMinActivity);
  const inactiveCount = rows.length - judgedRows.length;
  const idleFactor = idleFuelRateFactor();

  const validMetaRows = judgedRows.filter(r => r.meta > 0);
  const metaHitRows = validMetaRows.filter(r => r.consumo >= r.meta);
  const belowMetaRows = validMetaRows.filter(r => r.consumo < r.meta);
  const idleAboveTargetRows = judgedRows.filter(r => r.marchaLenta > 20);
  const supportLowRows = judgedRows.filter(r => r.supportUsage < 60);
  const speedAlertRows = judgedRows.filter(r => r.excessoVelocidade > 3);

  // Litros totais consumidos no período (distância / eficiência)
  const fuelLiters = judgedRows.reduce((acc, r) => {
    if (!(r.consumo > 0) || !(r.distancia > 0)) return acc;
    return acc + (r.distancia / r.consumo);
  }, 0);

  // Litros queimados em marcha lenta (estimativa: % do tempo parado aplicado sobre o
  // total de litros do período, corrigido pelo idleFuelRateFactor porque a taxa de
  // queima parado é bem menor que a taxa média rodando — ver CONFIG.alerts.idleFuelRateFactor)
  const idleLiters = judgedRows.reduce((acc, r) => {
    if (!(r.consumo > 0) || !(r.distancia > 0) || !(r.marchaLenta > 0)) return acc;
    return acc + ((r.distancia / r.consumo) * (r.marchaLenta / 100) * idleFactor);
  }, 0);

  // Litros que deixariam de ser queimados em marcha lenta se caísse para a meta hipotética (ajustável pelo usuário, state.idleSavingsTargetPercent)
  const idleSavingsLiters15 = judgedRows.reduce((acc, r) => {
    if (!(r.consumo > 0) || !(r.distancia > 0) || !(r.marchaLenta > idleSavingsTargetPercent)) return acc;
    return acc + ((r.distancia / r.consumo) * ((r.marchaLenta - idleSavingsTargetPercent) / 100) * idleFactor);
  }, 0);

  // Litros desperdiçados por eficiência abaixo da meta (economia potencial se atingissem a meta)
  const wasteLiters = belowMetaRows.reduce((acc, r) => {
    if (!(r.distancia > 0)) return acc;
    const atual = r.distancia / r.consumo;
    const alvo = r.distancia / r.meta;
    return acc + Math.max(0, atual - alvo);
  }, 0);

  // Litros economizados por quem roda acima da meta (economia já realizada)
  const savedLiters = metaHitRows.reduce((acc, r) => {
    if (!(r.distancia > 0)) return acc;
    const atual = r.distancia / r.consumo;
    const alvo = r.distancia / r.meta;
    return acc + Math.max(0, alvo - atual);
  }, 0);

  const criticalRows = judgedRows.filter(r =>
    r.score < CONFIG.alerts.criticalScoreThreshold ||
    (r.meta > 0 && r.consumo < r.meta * CONFIG.alerts.criticalConsumoRatio)
  );

  return {
    frota: rows.length,
    consumoMedio: avg(judgedRows, 'consumo'),
    consumoMedioMeta: avg(validMetaRows, 'consumo'),
    distanciaMedia: avg(judgedRows, 'distancia'),
    totalKm: sum(rows, 'distancia'),
    co2Total: sum(rows, 'co2'),
    scoreMedio: avg(judgedRows, 'score'),
    supportUsageMedio: avg(judgedRows, 'supportUsage'),
    metaMedia: avg(validMetaRows, 'meta'),
    metaHitPct: validMetaRows.length ? (metaHitRows.length / validMetaRows.length) * 100 : 0,
    metaHitCount: metaHitRows.length,
    validMetaCount: validMetaRows.length,
    metaBelowCount: belowMetaRows.length,
    savingsLiters: wasteLiters,
    savingsValue: wasteLiters * dieselPrice,
    dieselPrice,
    // Bloco financeiro (R$) para gestão de custos
    fuelLiters,
    fuelCost: fuelLiters * dieselPrice,
    wasteLiters,
    wasteCost: wasteLiters * dieselPrice,
    idleCost: idleLiters * dieselPrice,
    idleSavingsLiters15,
    idleSavingsCost15: idleSavingsLiters15 * dieselPrice,
    idleSavingsTargetPercent,
    savedLiters,
    savedCost: savedLiters * dieselPrice,
    // Bottom line real do período: economia realizada (quem bateu a meta) menos desperdício
    // (quem ficou abaixo). Não soma idleCost separado — o consumo (km/l) já embute o efeito
    // da marcha lenta, então waste/saved já refletem isso; somar idleCost de novo duplicaria.
    netSavingsLiters: savedLiters - wasteLiters,
    netSavingsCost: (savedLiters - wasteLiters) * dieselPrice,
    wastePctOfCost: fuelLiters > 0 ? (wasteLiters / fuelLiters) * 100 : 0,
    criticalCount: criticalRows.length,
    criticalPct: judgedRows.length ? (criticalRows.length / judgedRows.length) * 100 : 0,
    grade: gradeFromScore(avg(judgedRows, 'score')),
    idleLiters,
    idleAboveTargetCount: idleAboveTargetRows.length,
    supportLowCount: supportLowRows.length,
    speedAlertCount: speedAlertRows.length,
    driversBelowMetaCount: uniqueCount(belowMetaRows, 'motorista'),
    marchaLenta: avg(judgedRows, 'marchaLenta'),
    inercia: avg(judgedRows, 'inercia'),
    excessoVelocidade: avg(judgedRows, 'excessoVelocidade'),
    freadasBruscas: avg(judgedRows, 'freadasBruscas'),
    inactiveCount,
    noMetaCount: judgedRows.length - validMetaRows.length
  };
}

/**
 * Summarize drivers by performance
 */
export function summarizeDrivers(rows) {
  const map = new Map();
  rows.forEach(row => {
    if (!map.has(row.motorista)) map.set(row.motorista, []);
    map.get(row.motorista).push(row);
  });

  return Array.from(map.entries()).map(([motorista, items]) => {
    const summary = computeMonthSummary(items);
    const severity =
      (summary.scoreMedio < 60 ? 2 : 0) +
      (summary.metaMedia > 0 && summary.consumoMedio < summary.metaMedia ? 1 : 0) +
      (summary.supportUsageMedio < 60 ? 1 : 0) +
      (summary.marchaLenta > 20 ? 1 : 0);
    return { motorista, items, summary, severity };
  });
}

/**
 * Compute status summary for decision card
 */
export function computeStatusSummary(summary) {
  if (summary.criticalPct >= 35 || summary.metaHitPct < 55 || summary.scoreMedio < 60) {
    return {
      tone: 'danger',
      tag: 'Prioridade alta',
      value: 'Ação imediata',
      foot: `${formatInt(summary.criticalCount)} equipamentos críticos e ${formatNumber(summary.metaHitPct, 1)}% da frota na meta.`
    };
  }
  if (summary.criticalPct >= 20 || summary.metaHitPct < 70 || summary.scoreMedio < 70) {
    return {
      tone: 'warning',
      tag: 'Atenção',
      value: 'Em alerta',
      foot: `Nota ${formatNumber(summary.scoreMedio, 1)} e ${formatNumber(summary.metaHitPct, 1)}% de aderência à meta.`
    };
  }
  return {
    tone: 'success',
    tag: 'Operação saudável',
    value: 'Controlada',
    foot: `Nota ${formatNumber(summary.scoreMedio, 1)} com ${formatInt(summary.metaHitCount)} equipamentos no alvo.`
  };
}

/**
 * Compute primary pressure point
 */
export function computePrimaryPressure(summary) {
  const options = [
    { count: summary.metaBelowCount, tone: 'danger', tag: 'Consumo', value: `${formatInt(summary.metaBelowCount)} equip.`, foot: 'Abaixo da meta de consumo no período.' },
    { count: summary.idleAboveTargetCount, tone: 'danger', tag: 'Marcha lenta', value: `${formatInt(summary.idleAboveTargetCount)} equip.`, foot: 'Acima de 20% e pressionando litros desperdiçados.' },
    { count: summary.supportLowCount, tone: 'warning', tag: 'Scania Driver Support (%)', value: `${formatInt(summary.supportLowCount)} equip.`, foot: 'Uso abaixo de 60% do suporte ao motorista.' },
    { count: summary.speedAlertCount, tone: 'warning', tag: 'Excesso de velocidade', value: `${formatInt(summary.speedAlertCount)} equip.`, foot: 'Indicador elevado e com risco operacional.' }
  ].sort((a, b) => b.count - a.count);

  return options[0] && options[0].count > 0
    ? options[0]
    : { tone: 'success', tag: 'Sem pressão dominante', value: 'Controlado', foot: 'Nenhum vetor de perda se destacou no filtro atual.' };
}

/**
 * Pick priority driver
 */
export function pickPriorityDriver(rows) {
  const drivers = summarizeDrivers(rows)
    .sort((a, b) => b.severity - a.severity || a.summary.scoreMedio - b.summary.scoreMedio || a.summary.consumoMedio - b.summary.consumoMedio);
  return drivers[0] || null;
}

/**
 * Calculate delta info for comparison
 */
export function deltaInfo(current, previous, betterWhenHigher = true, unit = '', digits = 1) {
  if (previous == null || !Number.isFinite(previous) || previous === 0 && current === 0) {
    return { text: '— vs mês anterior', cls: 'flat' };
  }
  
  const diff = current - previous;
  if (Math.abs(diff) < 0.0001) return { text: 'Estável vs mês anterior', cls: 'flat' };
  
  const up = diff > 0;
  const good = betterWhenHigher ? up : !up;
  const arrow = up ? '▲' : '▼';
  
  return {
    text: `${arrow} ${formatNumber(Math.abs(diff), digits)}${unit} vs mês anterior`,
    cls: `${up ? 'up' : 'down'} ${good ? 'good' : 'bad'}`
  };
}

/**
 * Linear forecasting for next months
 */
export function forecastTrend(data, monthsAhead = 2) {
  if (data.length < 2) return [];

  // Regressão linear por mínimos quadrados sobre todos os pontos (x = 0..n-1)
  const n = data.length;
  const xs = data.map((_, i) => i);
  const meanX = xs.reduce((s, x) => s + x, 0) / n;
  const meanY = data.reduce((s, y) => s + y, 0) / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (data[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;

  const forecasts = [];
  for (let i = 1; i <= monthsAhead; i++) {
    const x = (n - 1) + i;
    forecasts.push({
      value: Math.max(0, intercept + slope * x),
      month: i
    });
  }

  return forecasts;
}

/**
 * Rank all cost/improvement opportunities by financial impact (R$).
 * Deterministic — no AI involved. Feeds both the "Oportunidades" panel
 * and the payload sent to the AI narrative/chat endpoints.
 */
export function computeOpportunities(summary) {
  const opportunities = [];

  if (summary.wasteCost > 0) {
    opportunities.push({
      categoria: 'consumo',
      titulo: 'Consumo abaixo da meta',
      impactoReais: summary.wasteCost,
      impactoLitros: summary.wasteLiters,
      afetados: summary.driversBelowMetaCount,
      acaoRecomendada: 'Revisar treinamento e condução dos motoristas com consumo abaixo da meta cadastrada.',
      tone: 'danger'
    });
  }

  if (summary.idleCost > 0 && summary.idleAboveTargetCount > 0) {
    opportunities.push({
      categoria: 'marcha_lenta',
      titulo: 'Marcha lenta acima do alvo',
      impactoReais: summary.idleSavingsCost15 > 0 ? summary.idleSavingsCost15 : summary.idleCost,
      impactoLitros: summary.idleSavingsLiters15 > 0 ? summary.idleSavingsLiters15 : summary.idleLiters,
      afetados: summary.idleAboveTargetCount,
      acaoRecomendada: `Reduzir marcha lenta para até ${summary.idleSavingsTargetPercent}% nos equipamentos acima do alvo (estimativa aproximada de litros).`,
      tone: 'warning'
    });
  }

  if (summary.supportLowCount > 0) {
    opportunities.push({
      categoria: 'suporte',
      titulo: 'Baixo uso do Scania Driver Support',
      impactoReais: 0,
      impactoLitros: 0,
      afetados: summary.supportLowCount,
      acaoRecomendada: 'Incentivar uso do suporte ao motorista — correlacionado com melhor consumo.',
      tone: 'warning'
    });
  }

  if (summary.speedAlertCount > 0) {
    opportunities.push({
      categoria: 'velocidade',
      titulo: 'Excesso de velocidade',
      impactoReais: 0,
      impactoLitros: 0,
      afetados: summary.speedAlertCount,
      acaoRecomendada: 'Risco operacional e de segurança — priorizar ação mesmo sem custo direto em litros.',
      tone: 'warning'
    });
  }

  if (summary.criticalCount > 0) {
    opportunities.push({
      categoria: 'critico',
      titulo: 'Equipamentos com nota crítica',
      impactoReais: 0,
      impactoLitros: 0,
      afetados: summary.criticalCount,
      acaoRecomendada: 'Priorizar ação imediata (vistoria, treinamento ou manutenção) nos equipamentos críticos.',
      tone: 'danger'
    });
  }

  return opportunities.sort((a, b) => b.impactoReais - a.impactoReais || b.afetados - a.afetados);
}

/**
 * Generate alerts based on thresholds
 */
export function generateAlerts(rows, month) {
  const alerts = [];
  const summary = computeMonthSummary(rows);

  // Check consumption vs meta
  if (summary.metaHitPct < CONFIG.alerts.consumptionMetaPercent) {
    alerts.push({
      type: 'consumption',
      severity: 'high',
      message: `Apenas ${formatNumber(summary.metaHitPct, 1)}% da frota atingiu a meta de consumo`,
      action: 'Revisar treinamento de motoristas críticos'
    });
  }

  // Check idle percentage
  if (summary.marchaLenta > CONFIG.alerts.idlePercentThreshold) {
    alerts.push({
      type: 'idle',
      severity: 'medium',
      message: `Marcha lenta média em ${formatNumber(summary.marchaLenta, 1)}%`,
      action: 'Investigar equipamentos com marcha lenta elevada'
    });
  }

  // Check critical score count
  if (summary.criticalCount > 0) {
    alerts.push({
      type: 'critical',
      severity: 'high',
      message: `${formatInt(summary.criticalCount)} equipamento(s) com nota crítica`,
      action: 'Priorizar ação imediata para equipamentos críticos'
    });
  }

  // Check support usage
  if (summary.supportUsageMedio < CONFIG.alerts.supportUsageLowThreshold) {
    alerts.push({
      type: 'support',
      severity: 'medium',
      message: `Uso do Scania Driver Support em ${formatNumber(summary.supportUsageMedio, 1)}%`,
      action: 'Incentivar uso do suporte ao motorista'
    });
  }

  return alerts;
}
