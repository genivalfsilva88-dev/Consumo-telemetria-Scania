import { CONFIG, state } from './config.js';
import { computeOpportunities, generateAlerts, summarizeDrivers } from './calculations.js';

/**
 * AI layer: talks to the Cloudflare Pages Functions (/api/insights, /api/chat)
 * which in turn call Workers AI. All numbers sent are already computed
 * client-side (computeMonthSummary/computeOpportunities) — the AI only
 * narrates/prioritizes/answers over them, it never recalculates KPIs.
 */

/**
 * Build the aggregated data context shared by insights + chat requests.
 */
export function buildAIContext(month, rows, summary) {
  const opportunities = computeOpportunities(summary);
  const alerts = generateAlerts(rows, month);

  const driverSummaries = summarizeDrivers(rows)
    .sort((a, b) => b.severity - a.severity || a.summary.scoreMedio - b.summary.scoreMedio)
    .slice(0, 10)
    .map(d => ({
      motorista: d.motorista,
      score: round(d.summary.scoreMedio),
      consumo: round(d.summary.consumoMedio, 2),
      meta: round(d.summary.metaMedia, 2),
      supportUsage: round(d.summary.supportUsageMedio),
      marchaLenta: round(d.summary.marchaLenta),
      severity: d.severity
    }));

  const topEquipment = [...rows]
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
    .map(r => ({
      equipamento: r.equipamento,
      motorista: r.motorista,
      consumo: round(r.consumo, 2),
      meta: round(r.meta, 2),
      score: round(r.score),
      grade: r.grade
    }));

  return {
    month,
    filters: { driver: state.selectedDriver, fleet: state.selectedFleet },
    summary: reduceSummary(summary),
    opportunities,
    alerts,
    topDrivers: driverSummaries,
    topEquipment
  };
}

/**
 * Generate (or reuse from cache) the AI executive narrative for the given context.
 */
export async function generateExecutiveInsight(context, { force = false } = {}) {
  const key = fingerprint(context);

  if (!force) {
    const cached = readCache(key);
    if (cached) return { text: cached, cached: true };
  }

  const res = await fetch(CONFIG.ai.insightsEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(context)
  });

  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || `Falha ao gerar análise (HTTP ${res.status})`);
  }

  writeCache(key, data.text);
  return { text: data.text, cached: false };
}

/**
 * Read a cached executive insight for this context without hitting the network.
 */
export function peekCachedInsight(context) {
  return readCache(fingerprint(context));
}

/**
 * Ask a free-form question, grounded in the current data context.
 */
export async function askAI(question, context) {
  const history = state.aiChatHistory.slice(-CONFIG.ai.maxHistory);

  const res = await fetch(CONFIG.ai.chatEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...context, history, question })
  });

  const data = await safeJson(res);
  if (!res.ok) {
    throw new Error(data?.error || `Falha ao consultar a IA (HTTP ${res.status})`);
  }

  state.aiChatHistory.push({ role: 'user', content: question });
  state.aiChatHistory.push({ role: 'assistant', content: data.answer });

  return data.answer;
}

// Helpers

function reduceSummary(summary) {
  // Envia só os campos financeiros/operacionais relevantes, não o objeto inteiro
  const {
    frota, consumoMedio, metaMedia, metaHitPct, scoreMedio, grade,
    supportUsageMedio, marchaLenta, inercia, excessoVelocidade,
    fuelCost, wasteCost, idleCost, savedCost, idleSavingsCost15,
    idleSavingsTargetPercent, criticalCount, criticalPct, dieselPrice
  } = summary;

  return {
    frota, consumoMedio: round(consumoMedio, 2), metaMedia: round(metaMedia, 2),
    metaHitPct: round(metaHitPct), scoreMedio: round(scoreMedio), grade,
    supportUsageMedio: round(supportUsageMedio), marchaLenta: round(marchaLenta),
    inercia: round(inercia), excessoVelocidade: round(excessoVelocidade),
    fuelCost: round(fuelCost), wasteCost: round(wasteCost), idleCost: round(idleCost),
    savedCost: round(savedCost), idleSavingsCost15: round(idleSavingsCost15),
    idleSavingsTargetPercent, criticalCount, criticalPct: round(criticalPct), dieselPrice
  };
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function fingerprint(context) {
  const raw = JSON.stringify({
    month: context.month,
    filters: context.filters,
    summary: context.summary,
    opportunities: context.opportunities
  });

  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) | 0;
  }
  return `ai_insight_${context.month}_${context.filters?.driver}_${context.filters?.fleet}_${hash}`;
}

function readCache(key) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeCache(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // sessionStorage indisponível/cheio — segue sem cache
  }
}
