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
  const validMetaRows = rows.filter(r => r.meta > 0);
  const metaHitRows = validMetaRows.filter(r => r.consumo >= r.meta);
  const belowMetaRows = validMetaRows.filter(r => r.consumo < r.meta);
  const idleAboveTargetRows = rows.filter(r => r.marchaLenta > 20);
  const supportLowRows = rows.filter(r => r.supportUsage < 60);
  const speedAlertRows = rows.filter(r => r.excessoVelocidade > 3);
  
  const idleLiters = rows.reduce((acc, r) => {
    if (!(r.consumo > 0) || !(r.distancia > 0) || !(r.marchaLenta > 0)) return acc;
    return acc + ((r.distancia / r.consumo) * (r.marchaLenta / 100));
  }, 0);
  
  const savingsLiters = validMetaRows.reduce((acc, r) => {
    if (!r.consumo || !r.meta || r.consumo >= r.meta) return acc;
    const atual = r.distancia > 0 ? r.distancia / r.consumo : 0;
    const alvo = r.distancia > 0 ? r.distancia / r.meta : 0;
    return acc + Math.max(0, atual - alvo);
  }, 0);
  
  const criticalRows = rows.filter(r =>
    r.score < CONFIG.alerts.criticalScoreThreshold ||
    (r.meta > 0 && r.consumo < r.meta)
  );

  return {
    frota: rows.length,
    consumoMedio: avg(rows, 'consumo'),
    distanciaMedia: avg(rows, 'distancia'),
    totalKm: sum(rows, 'distancia'),
    co2Total: sum(rows, 'co2'),
    scoreMedio: avg(rows, 'score'),
    supportUsageMedio: avg(rows, 'supportUsage'),
    metaMedia: avg(validMetaRows, 'meta'),
    metaHitPct: validMetaRows.length ? (metaHitRows.length / validMetaRows.length) * 100 : 0,
    metaHitCount: metaHitRows.length,
    validMetaCount: validMetaRows.length,
    metaBelowCount: belowMetaRows.length,
    savingsLiters,
    savingsValue: savingsLiters * 6,
    criticalCount: criticalRows.length,
    criticalPct: rows.length ? (criticalRows.length / rows.length) * 100 : 0,
    grade: gradeFromScore(avg(rows, 'score')),
    idleLiters,
    treesEquivalent: sum(rows, 'co2') * 6,
    idleAboveTargetCount: idleAboveTargetRows.length,
    supportLowCount: supportLowRows.length,
    speedAlertCount: speedAlertRows.length,
    driversBelowMetaCount: uniqueCount(belowMetaRows, 'motorista'),
    marchaLenta: avg(rows, 'marchaLenta'),
    inercia: avg(rows, 'inercia'),
    excessoVelocidade: avg(rows, 'excessoVelocidade'),
    freadasBruscas: avg(rows, 'freadasBruscas')
  };
}

/**
 * Build insights for dashboard
 */
export function buildInsights(current, previous, prevMonth) {
  const items = [];
  
  if (!current.frota) {
    return [{ icon: 'ℹ️', text: 'Sem dados no filtro atual para gerar insights operacionais.' }];
  }

  items.push({
    icon: current.metaHitPct >= 70 ? '🎯' : '📉',
    text: current.metaHitPct >= 70
      ? `${formatNumber(current.metaHitPct, 1)}% da frota filtrada atingiu a meta de consumo.`
      : `Apenas ${formatNumber(current.metaHitPct, 1)}% da frota filtrada atingiu a meta. Priorize acompanhamento.`
  });

  if (current.criticalCount > 0) {
    items.push({
      icon: '🚨',
      text: `${formatInt(current.criticalCount)} equipamento(s) estão em condição crítica por nota baixa ou consumo abaixo da meta.`
    });
  }

  items.push({
    icon: current.savingsLiters > 0 ? '💰' : '✅',
    text: current.savingsLiters > 0
      ? `Potencial estimado de economia de ${formatInt(current.savingsLiters)} litros no período (≈ R$ ${formatMoney(current.savingsValue)}).`
      : 'No filtro atual, a frota está alinhada com a meta de consumo e sem potencial relevante de economia.'
  });

  if (prevMonth && previous.frota > 0) {
    const scoreDiff = current.scoreMedio - previous.scoreMedio;
    const consumoDiff = current.consumoMedio - previous.consumoMedio;
    items.push({
      icon: scoreDiff >= 0 ? '📈' : '📊',
      text: `Vs ${prevMonth}, a nota ${scoreDiff >= 0 ? 'subiu' : 'caiu'} ${formatNumber(Math.abs(scoreDiff), 1)} pts e o consumo ${consumoDiff >= 0 ? 'melhorou' : 'reduziu'} ${formatNumber(Math.abs(consumoDiff), 2)} km/l.`
    });
  }

  return items.slice(0, 4);
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
  
  const forecasts = [];
  const lastValue = data[data.length - 1];
  const firstValue = data[0];
  const slope = (lastValue - firstValue) / (data.length - 1);
  
  for (let i = 1; i <= monthsAhead; i++) {
    const forecasted = lastValue + (slope * i);
    forecasts.push({
      value: Math.max(0, forecasted),
      month: i
    });
  }
  
  return forecasts;
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
