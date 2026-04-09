import { CONFIG, state } from './config.js';
import { cacheManager } from './cache.js';
import { DataLoader, normalizeMonthRows } from './data-loader.js';
import {
  computeMonthSummary,
  buildInsights,
  summarizeDrivers,
  computeStatusSummary,
  computePrimaryPressure,
  pickPriorityDriver,
  deltaInfo,
  generateAlerts,
  forecastTrend,
  formatNumber,
  formatInt,
  formatMoney,
  gradeClass,
  pillColor
} from './calculations.js';
import { chartManager } from './charts.js';
import { exportManager } from './export.js';

/**
 * Main UI Renderer and Dashboard Controller
 */
export class DashboardUI {
  constructor() {
    this.dataLoader = new DataLoader();
  }

  /**
   * Initialize dashboard
   */
  async init() {
    try {
      this._updateLoadingStatus('Carregando base...');
      
      // Load all data (with cache)
      await this.dataLoader.loadAllData();
      
      // Setup UI
      this._setupPageLayout();
      this._setupPageNav();
      this._populateMonthSelect();
      this._populateDriverSelect();
      this._populateFleetSelect();
      this._setupAdvancedFilters();
      this._setupExportButtons();
      
      // Render dashboard
      this.renderDashboard();
      
      // Show cache status
      this._showCacheStatus();
      
    } catch (error) {
      console.error(error);
      document.getElementById('tableWrap').innerHTML = `<div class="empty">Erro ao carregar os dados: ${error.message}</div>`;
      this._updateLoadingStatus('Falha ao carregar a base');
    }
  }

  /**
   * Refresh data
   */
  async refresh() {
    await cacheManager.clear();
    this.dataLoader = new DataLoader();
    await this.init();
  }

  /**
   * Render entire dashboard
   */
  renderDashboard() {
    const month = state.selectedMonth;
    const rows = this.getFilteredRows(month);
    const prevMonth = this.previousLoadedMonth(month);
    const prevRows = prevMonth ? this.getFilteredRows(prevMonth) : [];
    
    const summary = computeMonthSummary(rows);
    const prevSummary = computeMonthSummary(prevRows);
    
    // Generate alerts
    state.alerts = generateAlerts(rows, month);
    
    // Render all sections
    this._renderKPIs(summary, prevSummary);
    this._renderExecutiveBriefing(summary, rows);
    this._renderComparisonPanel(month, summary, prevSummary, prevMonth);
    this._renderInsightsPanel(summary, prevSummary, prevMonth);
    this._renderAlertsPanel();
    this._renderActionCards(summary);
    this._renderTrendChart();
    this._renderRankingChart(month);
    this._renderGradeDistribution(month);
    this._renderTrainingList(month);
    this._renderDriverSummary(month);
    this._renderIdleImpactChart(month);
    this._renderTable(month);
    this._renderForecast();
    
    this.setActivePage(state.currentPage);
    this._updateLastBadge(month);
  }

  /**
   * Get filtered rows based on all filters
   */
  getFilteredRows(month = state.selectedMonth) {
    let rows = state.monthData[month] || [];
    
    // Driver filter
    if (state.selectedDriver !== 'TODOS') {
      rows = rows.filter(r => r.motorista === state.selectedDriver);
    }
    
    // Fleet filter
    if (state.selectedFleet !== 'TODOS') {
      rows = rows.filter(r => r.equipamento === state.selectedFleet);
    }
    
    // Advanced filters
    const filters = state.customFilters;
    if (filters.minConsumption !== null) {
      rows = rows.filter(r => r.consumo >= filters.minConsumption);
    }
    if (filters.maxConsumption !== null) {
      rows = rows.filter(r => r.consumo <= filters.maxConsumption);
    }
    if (filters.minScore !== null) {
      rows = rows.filter(r => r.score >= filters.minScore);
    }
    if (filters.maxScore !== null) {
      rows = rows.filter(r => r.score <= filters.maxScore);
    }
    if (filters.fleetNumber) {
      rows = rows.filter(r => r.equipamento.includes(filters.fleetNumber));
    }
    
    return rows;
  }

  /**
   * Get previous loaded month
   */
  previousLoadedMonth(month) {
    const loaded = this.getMonthsWithData();
    const idx = loaded.indexOf(month);
    return idx > 0 ? loaded[idx - 1] : null;
  }

  /**
   * Get months with data
   */
  getMonthsWithData() {
    return CONFIG.monthNames.filter(m => (state.monthData[m] || []).length > 0);
  }

  // Private methods

  _updateLoadingStatus(text) {
    const badge = document.getElementById('lastUpdateBadge');
    if (badge) badge.textContent = text;
  }

  _showCacheStatus() {
    const badge = document.getElementById('cacheStatus');
    if (badge && cacheManager.isFresh()) {
      badge.textContent = cacheManager.getAgeText();
      badge.style.display = 'inline-flex';
    }
  }

  _setupPageLayout() {
    const footer = document.querySelector('.footer-note');
    if (!footer) return;

    const operationalPage = document.getElementById('pageOperational');
    if (operationalPage) {
      const trendCharts = operationalPage.querySelectorAll('#chartTrend');
      if (trendCharts.length > 1) {
        const extraTrendBlock = trendCharts[1].closest('.stack-grid');
        if (extraTrendBlock) extraTrendBlock.style.display = 'none';
      }
    }

    let pageFleet = document.getElementById('pageFleet');
    if (!pageFleet) {
      pageFleet = document.createElement('section');
      pageFleet.className = 'page-section';
      pageFleet.id = 'pageFleet';
      pageFleet.innerHTML = `
        <div class="page-head">
          <div>
            <span class="page-kicker">Página 3</span>
            <h2 class="page-title">Detalhamento da frota</h2>
          </div>
          <div class="page-note">Página operacional para análise, auditoria e acompanhamento por equipamento</div>
        </div>
        <div class="fleet-detail-grid" id="fleetDetailGrid">
          <div class="fleet-top-grid">
            <section class="panel soft-accent">
              <div class="panel-head">
                <h3 class="panel-title" style="margin:0;">Maiores consumos em marcha lenta</h3>
                <span class="subtle" id="idleImpactSubtitle">Maiores impactos por equipamento no filtro atual</span>
              </div>
              <div id="chartIdleImpact"></div>
            </section>
            <section class="panel soft-accent">
              <div class="panel-head">
                <h3 class="panel-title" style="margin:0;">Resumo do motorista filtrado</h3>
                <span class="subtle" id="driverSummaryTitleFleet">Todos os motoristas</span>
              </div>
              <div id="driverSummaryBoxFleet">
                <div class="empty">Selecione um motorista para análise individual.</div>
              </div>
            </section>
          </div>
        </div>`;
      footer.parentNode.insertBefore(pageFleet, footer);
    }

    const tablePanel = document.getElementById('tableWrap')?.closest('.panel');
    const fleetGrid = document.getElementById('fleetDetailGrid');
    if (tablePanel && fleetGrid && tablePanel.parentElement !== fleetGrid) {
      tablePanel.classList.add('fleet-table-panel');
      fleetGrid.appendChild(tablePanel);
    }
  }

  _setupPageNav() {
    document.querySelectorAll('.nav-pill[data-page]').forEach(btn => {
      if (btn.dataset.navBound === '1') return;
      btn.dataset.navBound = '1';
      btn.addEventListener('click', () => this.setActivePage(btn.dataset.page));
    });
  }

  setActivePage(page) {
    state.currentPage = page;
    const pageMap = {
      executive: 'pageExecutive',
      operational: 'pageOperational',
      fleet: 'pageFleet'
    };
    Object.entries(pageMap).forEach(([key, id]) => {
      const section = document.getElementById(id);
      if (section) section.classList.toggle('active', key === page);
    });
    document.querySelectorAll('.nav-pill[data-page]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === page);
    });
  }

  _populateMonthSelect() {
    const select = document.getElementById('monthSelect');
    const withData = this.getMonthsWithData();
    
    select.innerHTML = CONFIG.monthNames.map(month =>
      `<option value="${month}" ${!withData.includes(month) ? 'disabled' : ''}>${month}${withData.includes(month) ? '' : ' • sem dados'}</option>`
    ).join('');
    
    const preferred = withData.length ? withData[withData.length - 1] : 'Janeiro';
    state.selectedMonth = withData.includes(state.selectedMonth) ? state.selectedMonth : preferred;
    select.value = state.selectedMonth;
    
    select.onchange = e => {
      state.selectedMonth = e.target.value;
      this.renderDashboard();
    };
    
    this._renderAvailableMonths();
  }

  _populateDriverSelect() {
    const drivers = new Set(['TODOS']);
    this.getMonthsWithData().forEach(month =>
      (state.monthData[month] || []).forEach(r => drivers.add(r.motorista))
    );
    
    const select = document.getElementById('driverSelect');
    const all = Array.from(drivers).filter(Boolean);
    select.innerHTML = all.map(name =>
      `<option value="${name}">${name === 'TODOS' ? 'Todos os motoristas' : name}</option>`
    ).join('');
    
    if (!all.includes(state.selectedDriver)) state.selectedDriver = 'TODOS';
    select.value = state.selectedDriver;
    
    select.onchange = e => {
      state.selectedDriver = e.target.value;
      this.renderDashboard();
    };
  }

  _populateFleetSelect() {
    const fleets = new Set(['TODOS']);
    this.getMonthsWithData().forEach(month =>
      (state.monthData[month] || []).forEach(r => fleets.add(r.equipamento))
    );
    
    const select = document.getElementById('fleetSelect');
    if (!select) return;
    
    const all = Array.from(fleets).filter(Boolean).sort();
    select.innerHTML = all.map(name =>
      `<option value="${name}">${name === 'TODOS' ? 'Todos os equipamentos' : name}</option>`
    ).join('');
    
    if (!all.includes(state.selectedFleet)) state.selectedFleet = 'TODOS';
    select.value = state.selectedFleet;
    
    select.onchange = e => {
      state.selectedFleet = e.target.value;
      this.renderDashboard();
    };
  }

  _setupAdvancedFilters() {
    const applyBtn = document.getElementById('applyFiltersBtn');
    const clearBtn = document.getElementById('clearFiltersBtn');
    
    if (applyBtn) {
      applyBtn.addEventListener('click', () => {
        const minCons = document.getElementById('filterMinConsumption')?.value;
        const maxCons = document.getElementById('filterMaxConsumption')?.value;
        const minScore = document.getElementById('filterMinScore')?.value;
        const maxScore = document.getElementById('filterMaxScore')?.value;
        const fleetNum = document.getElementById('filterFleetNumber')?.value;
        
        state.customFilters = {
          minConsumption: minCons ? parseFloat(minCons) : null,
          maxConsumption: maxCons ? parseFloat(maxCons) : null,
          minScore: minScore ? parseFloat(minScore) : null,
          maxScore: maxScore ? parseFloat(maxScore) : null,
          fleetNumber: fleetNum || null
        };
        
        this.renderDashboard();
      });
    }
    
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        state.customFilters = {
          minConsumption: null,
          maxConsumption: null,
          minScore: null,
          maxScore: null,
          fleetNumber: null
        };
        
        document.getElementById('filterMinConsumption').value = '';
        document.getElementById('filterMaxConsumption').value = '';
        document.getElementById('filterMinScore').value = '';
        document.getElementById('filterMaxScore').value = '';
        document.getElementById('filterFleetNumber').value = '';
        
        this.renderDashboard();
      });
    }
  }

  _setupExportButtons() {
    document.getElementById('csvBtn')?.addEventListener('click', () => {
      const rows = this.getFilteredRows(state.selectedMonth);
      exportManager.exportToCSV(state.selectedMonth, rows);
    });

    document.getElementById('reportBtn')?.addEventListener('click', () => {
      const rows = this.getFilteredRows(state.selectedMonth);
      const summary = computeMonthSummary(rows);
      exportManager.exportReportText(state.selectedMonth, summary, state.alerts);
    });
  }

  _renderAvailableMonths() {
    const target = document.getElementById('availableMonths');
    const months = this.getMonthsWithData();
    target.innerHTML = months.map(month =>
      `<button class="month-chip ${month === state.selectedMonth ? 'active' : ''}" data-month="${month}">${month}</button>`
    ).join('');
    
    target.querySelectorAll('[data-month]').forEach(btn =>
      btn.addEventListener('click', () => {
        state.selectedMonth = btn.dataset.month;
        document.getElementById('monthSelect').value = state.selectedMonth;
        this.renderDashboard();
      })
    );
  }

  _renderKPIs(summary, prevSummary) {
    document.getElementById('kpiFrota').textContent = formatInt(summary.frota);
    document.getElementById('kpiConsumo').textContent = formatNumber(summary.consumoMedio, 2);
    document.getElementById('kpiDistancia').textContent = formatInt(summary.distanciaMedia);
    document.getElementById('kpiKmTotal').textContent = formatInt(summary.totalKm);
    document.getElementById('kpiCo2').textContent = formatNumber(summary.co2Total, 1);
    document.getElementById('scoreNumber').textContent = formatNumber(summary.scoreMedio, 1);
    document.getElementById('scoreLetter').textContent = summary.grade;
    document.getElementById('scoreLetter').className = `score-letter ${gradeClass(summary.grade)}`;
    
    // Meta progress
    document.getElementById('realValue').textContent = `${formatNumber(summary.consumoMedio, 2)} km/l`;
    document.getElementById('metaValue').textContent = summary.metaMedia ? `${formatNumber(summary.metaMedia, 2)} km/l` : 'Sem meta';
    const perf = summary.metaMedia > 0 ? (summary.consumoMedio / summary.metaMedia) * 100 : 0;
    document.getElementById('metaFill').style.width = `${Math.max(0, Math.min(perf, 100))}%`;
    document.getElementById('metaText').textContent = summary.metaMedia > 0
      ? `${perf >= 100 ? 'Meta atingida' : 'Abaixo da meta'} (${formatNumber(perf, 1)}%) • Scania Driver Support (%) ${formatNumber(summary.supportUsageMedio, 1)}%`
      : `Sem meta cadastrada para comparação • Scania Driver Support (%) ${formatNumber(summary.supportUsageMedio, 1)}%`;
    
    // Indicators
    document.getElementById('indMarcha').textContent = `${formatNumber(summary.marchaLenta, 1)}%`;
    document.getElementById('indInercia').textContent = `${formatNumber(summary.inercia, 1)}%`;
    document.getElementById('indExcesso').textContent = `${formatNumber(summary.excessoVelocidade, 1)}%`;
    document.getElementById('indSupport').textContent = `${formatNumber(summary.supportUsageMedio, 1)}%`;
    
    // Deltas
    this._setDelta('deltaFrota', summary.frota, prevSummary.frota, true, '', 0);
    this._setDelta('deltaConsumo', summary.consumoMedio, prevSummary.consumoMedio, true, ' km/l', 2);
    this._setDelta('deltaDistancia', summary.distanciaMedia, prevSummary.distanciaMedia, true, ' km', 0);
    this._setDelta('deltaKmTotal', summary.totalKm, prevSummary.totalKm, true, ' km', 0);
    this._setDelta('deltaCo2', summary.co2Total, prevSummary.co2Total, false, ' t', 1);
    this._setDelta('deltaScore', summary.scoreMedio, prevSummary.scoreMedio, true, ' pts', 1);
    this._setDelta('deltaMarcha', summary.marchaLenta, prevSummary.marchaLenta, false, ' p.p.', 1);
    this._setDelta('deltaInercia', summary.inercia, prevSummary.inercia, true, ' p.p.', 1);
    this._setDelta('deltaExcesso', summary.excessoVelocidade, prevSummary.excessoVelocidade, false, ' p.p.', 1);
    this._setDelta('deltaSupport', summary.supportUsageMedio, prevSummary.supportUsageMedio, true, ' p.p.', 1);
  }

  _renderExecutiveBriefing(summary, rows) {
    const status = computeStatusSummary(summary);
    const pressure = computePrimaryPressure(summary);
    const priorityDriver = pickPriorityDriver(rows);

    this._setDecisionCard('Status', `Status • ${status.tag}`, status.value, status.foot, status.tone);
    this._setDecisionCard('Risk', `Risco • ${pressure.tag}`, pressure.value, pressure.foot, pressure.tone);
    
    this._setDecisionCard(
      'Opportunity',
      summary.savingsValue > 0 ? 'Oportunidade • Potencial financeiro' : 'Oportunidade • Custo sob controle',
      summary.savingsValue > 0 ? `R$ ${formatMoney(summary.savingsValue)}` : 'Sem desvio relevante',
      summary.savingsValue > 0
        ? `${formatInt(summary.savingsLiters)} litros recuperáveis no mês filtrado.`
        : 'No filtro atual, a meta de consumo não indica desperdício relevante.',
      summary.savingsValue > 0 ? 'warning' : 'success'
    );

    if (priorityDriver) {
      this._setDecisionCard(
        'Driver',
        priorityDriver.severity >= 3 ? 'Motorista • Ação prioritária' : 'Motorista • Maior atenção',
        priorityDriver.motorista,
        `Nota ${formatNumber(priorityDriver.summary.scoreMedio, 1)} • Consumo ${formatNumber(priorityDriver.summary.consumoMedio, 2)} km/l${priorityDriver.summary.metaMedia ? ` • Meta ${formatNumber(priorityDriver.summary.metaMedia, 2)}` : ''}`,
        priorityDriver.severity >= 3 ? 'danger' : 'warning'
      );
    } else {
      this._setDecisionCard('Driver', 'Motorista • Sem recorte', 'Sem dados', 'Não há dados suficientes para priorizar um condutor.', 'neutral');
    }
  }

  _setDecisionCard(section, tag, value, foot, tone) {
    const card = document.getElementById(`decision${section}Card`);
    const tagEl = document.getElementById(`decision${section}Tag`);
    const valueEl = document.getElementById(`decision${section}Value`);
    const footEl = document.getElementById(`decision${section}Foot`);
    
    if (card) card.className = `decision-card ${tone || 'neutral'}`;
    if (tagEl) tagEl.textContent = tag;
    if (valueEl) valueEl.textContent = value;
    if (footEl) footEl.textContent = foot;
  }

  _renderComparisonPanel(month, current, previous, prevMonth) {
    const labelEl = document.getElementById('compareMonthLabel');
    if (labelEl) labelEl.textContent = prevMonth ? `${month} x ${prevMonth}` : 'Sem mês anterior disponível';
    
    const target = document.getElementById('compareStats');
    if (!prevMonth || previous.frota === 0) {
      target.innerHTML = '<div class="empty">Sem base comparativa para o mês selecionado.</div>';
      return;
    }

    const stats = [
      ['Consumo médio', current.consumoMedio, previous.consumoMedio, true, ' km/l', 2],
      ['Nota média', current.scoreMedio, previous.scoreMedio, true, ' pts', 1],
      ['Scania Driver Support (%)', current.supportUsageMedio, previous.supportUsageMedio, true, ' %', 1],
      ['Marcha lenta', current.marchaLenta, previous.marchaLenta, false, ' p.p.', 1],
      ['Excesso de velocidade', current.excessoVelocidade, previous.excessoVelocidade, false, ' p.p.', 1],
      ['Km total rodado', current.totalKm, previous.totalKm, true, ' km', 0],
      ['CO₂ total', current.co2Total, previous.co2Total, false, ' t', 1],
    ];

    target.innerHTML = stats.map(([label, a, b, better, unit, digits]) => {
      const d = deltaInfo(a, b, better, unit, digits);
      return `<div class="compare-stat">
        <div><strong>${label}</strong><div class="subtle">Atual: ${formatNumber(a, digits)}${unit} • Anterior: ${formatNumber(b, digits)}${unit}</div></div>
        <div class="delta ${d.cls}">${d.text}</div>
      </div>`;
    }).join('');
  }

  _renderInsightsPanel(current, previous, prevMonth) {
    const target = document.getElementById('insightsList');
    const insights = buildInsights(current, previous, prevMonth);
    target.innerHTML = insights.map(item =>
      `<div class="insight-item"><div class="insight-icon">${item.icon}</div><div>${item.text}</div></div>`
    ).join('');
  }

  _renderAlertsPanel() {
    const target = document.getElementById('alertsList');
    if (!target) return;

    if (state.alerts.length === 0) {
      target.innerHTML = '<div class="alert-item success"><span class="alert-icon">✓</span><div><strong>Sem alertas críticos</strong><div class="alert-sub">Operação dentro dos parâmetros esperados</div></div></div>';
      return;
    }

    target.innerHTML = state.alerts.map(alert => {
      const severityClass = alert.severity === 'high' ? 'high' : alert.severity === 'medium' ? 'medium' : 'low';
      const icon = alert.severity === 'high' ? '⚠️' : alert.severity === 'medium' ? '⚡' : 'ℹ️';
      return `<div class="alert-item ${severityClass}">
        <span class="alert-icon">${icon}</span>
        <div>
          <strong>${alert.message}</strong>
          <div class="alert-sub">Ação: ${alert.action}</div>
        </div>
      </div>`;
    }).join('');
  }

  _renderActionCards(summary) {
    document.getElementById('metaHitPct').textContent = `${formatNumber(summary.metaHitPct, 1)}%`;
    document.getElementById('metaHitCount').textContent = `${formatInt(summary.metaHitCount)} de ${formatInt(summary.validMetaCount || summary.frota)} equip.`;
    document.getElementById('savingsLiters').textContent = formatInt(summary.savingsLiters);
    document.getElementById('savingsValueFoot').textContent = `Estimativa financeira: R$ ${formatMoney(summary.savingsValue)}`;
    document.getElementById('criticalCount').textContent = formatInt(summary.criticalCount);
    document.getElementById('criticalPct').textContent = `${formatNumber(summary.criticalPct, 1)}% da frota`;
    document.getElementById('supportExecutive').textContent = `${formatNumber(summary.supportUsageMedio, 1)}%`;
    document.getElementById('idleLiters').textContent = formatInt(summary.idleLiters);
    document.getElementById('driversBelowMeta').textContent = formatInt(summary.driversBelowMetaCount);
    document.getElementById('speedExecutive').textContent = `${formatNumber(summary.excessoVelocidade, 1)}%`;
    document.getElementById('treesEquivalent').textContent = formatInt(summary.treesEquivalent);
    
    // Deltas
    const prevMonth = this.previousLoadedMonth(state.selectedMonth);
    const prevRows = prevMonth ? this.getFilteredRows(prevMonth) : [];
    const prevSummary = computeMonthSummary(prevRows);
    
    this._setDelta('deltaMetaHit', summary.metaHitPct, prevSummary.metaHitPct, true, ' p.p.', 1);
    this._setDelta('deltaSavings', summary.savingsLiters, prevSummary.savingsLiters, false, ' l', 0);
    this._setDelta('deltaCritical', summary.criticalCount, prevSummary.criticalCount, false, '', 0);
    this._setDelta('deltaSupportExecutive', summary.supportUsageMedio, prevSummary.supportUsageMedio, true, ' p.p.', 1);
    this._setDelta('deltaIdleLiters', summary.idleLiters, prevSummary.idleLiters, false, ' l', 0);
    this._setDelta('deltaTrees', summary.treesEquivalent, prevSummary.treesEquivalent, false, '', 0);
    this._setDelta('deltaDriversBelowMeta', summary.driversBelowMetaCount, prevSummary.driversBelowMetaCount, false, '', 0);
    this._setDelta('deltaSpeedExecutive', summary.excessoVelocidade, prevSummary.excessoVelocidade, false, ' p.p.', 1);
  }

  _renderTrendChart() {
    const data = CONFIG.monthNames.map(month => {
      const rows = this.getFilteredRows(month);
      const s = computeMonthSummary(rows);
      return { month, consumo: s.consumoMedio, meta: s.metaMedia, score: s.scoreMedio, frota: s.frota };
    });
    
    chartManager.renderTrendChart(data);
  }

  _renderRankingChart(month) {
    const fleetRows = [...(state.monthData[month] || [])];
    const bestRows = fleetRows.slice().sort((a, b) => b.consumo - a.consumo).slice(0, 10).reverse();
    const worstRows = fleetRows.slice().sort((a, b) => a.consumo - b.consumo).slice(0, 10).reverse();
    
    chartManager.renderRankingChart(month, bestRows, worstRows);
    
    const rankingSubtitle = document.getElementById('rankingSubtitle');
    const worstRankingSubtitle = document.getElementById('worstRankingSubtitle');
    if (rankingSubtitle) rankingSubtitle.textContent = `Frota completa de ${month} • filtro por motorista não aplicado`;
    if (worstRankingSubtitle) worstRankingSubtitle.textContent = `Frota completa de ${month} • foco para ação imediata`;
  }

  _renderGradeDistribution(month) {
    const rows = state.monthData[month] || [];
    chartManager.renderGradeDistribution(month, rows);
    
    const subtitle = document.getElementById('gradeDistSubtitle');
    if (subtitle) subtitle.textContent = `Frota completa de ${month}`;
  }

  _renderTrainingList(month) {
    const rows = state.monthData[month] || [];
    const byDriver = new Map();
    rows.forEach(r => {
      if (!byDriver.has(r.motorista)) byDriver.set(r.motorista, []);
      byDriver.get(r.motorista).push(r);
    });

    const list = Array.from(byDriver.entries()).map(([motorista, items]) => {
      const s = computeMonthSummary(items);
      const severity = (s.scoreMedio < 60 ? 2 : 0) + (s.metaMedia > 0 && s.consumoMedio < s.metaMedia ? 1 : 0) + (s.supportUsageMedio < 60 ? 1 : 0) + (s.marchaLenta > 20 ? 1 : 0);
      return {
        motorista,
        equipamentos: items.map(i => i.equipamento).join(', '),
        score: s.scoreMedio,
        supportUsage: s.supportUsageMedio,
        consumo: s.consumoMedio,
        meta: s.metaMedia,
        severity,
        label: severity >= 3 ? 'treinamento alto' : severity >= 2 ? 'atenção média' : 'monitorar',
        cls: severity >= 3 ? 'lvl-high' : severity >= 2 ? 'lvl-med' : 'lvl-low'
      };
    }).sort((a, b) => b.severity - a.severity || a.score - b.score).slice(0, 6);

    const target = document.getElementById('trainingList');
    if (!list.length) {
      target.innerHTML = '<div class="empty">Sem dados suficientes para recomendar treinamento.</div>';
      return;
    }

    target.innerHTML = list.map(item => `
      <div class="list-item">
        <div>
          <strong>${item.motorista}</strong>
          <span class="list-sub">Frotas: ${item.equipamentos} • Nota ${formatNumber(item.score, 1)} • Scania Driver Support (%) ${formatNumber(item.supportUsage, 1)}% • Consumo ${formatNumber(item.consumo, 2)} km/l${item.meta ? ` • Meta ${formatNumber(item.meta, 2)}` : ''}</span>
        </div>
        <span class="training-level ${item.cls}">${item.label}</span>
      </div>`).join('');
  }

  _renderDriverSummary(month) {
    const titleText = state.selectedDriver === 'TODOS' ? 'Visão executiva de condutores' : state.selectedDriver;
    
    if (state.selectedDriver === 'TODOS') {
      const rows = state.monthData[month] || [];
      const byDriver = new Map();
      rows.forEach(r => {
        if (!byDriver.has(r.motorista)) byDriver.set(r.motorista, []);
        byDriver.get(r.motorista).push(r);
      });

      const driverSummaries = Array.from(byDriver.entries()).map(([motorista, items]) => {
        const s = computeMonthSummary(items);
        const health = s.scoreMedio;
        return { motorista, score: s.scoreMedio, supportUsage: s.supportUsageMedio, consumo: s.consumoMedio, meta: s.metaMedia, health };
      }).sort((a, b) => b.health - a.health);

      const best = driverSummaries.slice(0, 5);
      const worst = driverSummaries.slice(-5).reverse();

      const html = driverSummaries.length ? `
        <div class="summary-panel">
          <div class="summary-box tall">
            <div class="subtle">Top motoristas do mês</div>
            <div class="list">${best.map(r => `<div class="list-item"><div><strong>${r.motorista}</strong><span class="list-sub">Nota ${formatNumber(r.score, 1)} • Scania Driver Support (%) ${formatNumber(r.supportUsage, 1)}% • Consumo ${formatNumber(r.consumo, 2)} km/l${r.meta ? ` • Meta ${formatNumber(r.meta, 2)}` : ''}</span></div><span class="training-level lvl-low">destaque</span></div>`).join('')}</div>
          </div>
          <div class="summary-box tall">
            <div class="subtle">Condutores para ação imediata</div>
            <div class="list">${worst.map(r => `<div class="list-item"><div><strong>${r.motorista}</strong><span class="list-sub">Nota ${formatNumber(r.score, 1)} • Scania Driver Support (%) ${formatNumber(r.supportUsage, 1)}% • Consumo ${formatNumber(r.consumo, 2)} km/l${r.meta ? ` • Meta ${formatNumber(r.meta, 2)}` : ''}</span></div><span class="training-level lvl-high">prioridade</span></div>`).join('')}</div>
          </div>
        </div>` : '<div class="empty">Sem dados de motoristas para este período.</div>';

      ['driverSummaryTitle', 'driverSummaryBox'].forEach(id => {
        const el = document.getElementById(id);
        if (el && id === 'driverSummaryTitle') el.textContent = titleText;
        if (el && id === 'driverSummaryBox') el.innerHTML = html;
      });
    } else {
      const rows = this.getFilteredRows(month);
      const s = computeMonthSummary(rows);
      const prevMonth = this.previousLoadedMonth(month);
      const prevRows = prevMonth ? this.getFilteredRows(prevMonth) : [];
      const prevSummary = computeMonthSummary(prevRows);
      const scoreDelta = deltaInfo(s.scoreMedio, prevSummary.scoreMedio, true, ' pts', 1);

      const html = `
        <div class="summary-panel">
          <div class="summary-box"><div class="subtle">Equipamentos</div><div class="score-number">${formatInt(rows.length)}</div><div class="subtle">Frotas analisadas no mês</div></div>
          <div class="summary-box"><div class="subtle">Nota média</div><div class="score-number">${formatNumber(s.scoreMedio, 1)}</div><div class="delta ${scoreDelta.cls}">${scoreDelta.text}</div></div>
          <div class="summary-box"><div class="subtle">Consumo</div><div class="score-number">${formatNumber(s.consumoMedio, 2)}</div><div class="subtle">km/l ${s.metaMedia ? `• meta ${formatNumber(s.metaMedia, 2)}` : ''}<br>Scania Driver Support (%): <strong>${formatNumber(s.supportUsageMedio, 1)}%</strong></div></div>
          <div class="summary-box"><div class="subtle">Pontos de atenção</div><div class="subtle" style="margin-top:10px; line-height:1.7;">Marcha lenta: <strong>${formatNumber(s.marchaLenta, 1)}%</strong><br>Inércia: <strong>${formatNumber(s.inercia, 1)}%</strong><br>Excesso vel.: <strong>${formatNumber(s.excessoVelocidade, 1)}%</strong></div></div>
        </div>`;

      ['driverSummaryTitle', 'driverSummaryBox'].forEach(id => {
        const el = document.getElementById(id);
        if (el && id === 'driverSummaryTitle') el.textContent = titleText;
        if (el && id === 'driverSummaryBox') el.innerHTML = html;
      });
    }
  }

  _renderIdleImpactChart(month) {
    const rows = this.getFilteredRows(month);
    chartManager.renderIdleImpactChart(rows);
    
    const subtitle = document.getElementById('idleImpactSubtitle');
    if (subtitle) {
      subtitle.textContent = state.selectedDriver === 'TODOS'
        ? `Maiores impactos por equipamento em ${month}`
        : `Impacto estimado de marcha lenta para ${state.selectedDriver}`;
    }
  }

  _renderForecast() {
    const target = document.getElementById('forecastPanel');
    if (!target) return;

    const data = CONFIG.monthNames.map(month => {
      const rows = this.getFilteredRows(month);
      const s = computeMonthSummary(rows);
      return s.consumoMedio;
    }).filter(v => v > 0);

    const forecast = forecastTrend(data, 2);
    
    if (forecast.length === 0) {
      target.innerHTML = '<div class="empty">Dados insuficientes para projeção</div>';
      return;
    }

    const monthNames = CONFIG.monthNames;
    const lastMonthIdx = this.getMonthsWithData().length - 1;
    const forecastMonths = forecast.map((_, i) => {
      const idx = (lastMonthIdx + i + 1) % 12;
      return monthNames[idx];
    });

    target.innerHTML = `
      <div class="panel-head">
        <h3 class="panel-title" style="margin:0;">Projeção de tendência</h3>
        <span class="subtle">Próximos 2 meses (estimativa)</span>
      </div>
      <div class="executive-strip">
        ${forecast.map((f, i) => `
          <div class="exec-pill">
            <div class="exec-label">${forecastMonths[i]}</div>
            <div class="exec-value">${formatNumber(f.value, 2)} km/l</div>
            <div class="exec-foot">Consumo projetado</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  _renderTable(month) {
    const rows = [...this.getFilteredRows(month)].sort((a, b) => b.consumo - a.consumo);
    const subtitle = document.getElementById('tableSubtitle');
    if (subtitle) {
      subtitle.textContent = state.selectedDriver === 'TODOS'
        ? `Todos os motoristas • ${rows.length} linha(s)`
        : `${state.selectedDriver} • ${rows.length} linha(s)`;
    }
    
    const prevMonth = this.previousLoadedMonth(month);
    const prevRows = prevMonth ? this.getFilteredRows(prevMonth) : [];
    const prevMap = new Map(prevRows.map(r => [r.equipamento + '|' + r.motorista, r]));
    
    const target = document.getElementById('tableWrap');
    if (!rows.length) {
      target.innerHTML = '<div class="empty">Nenhum dado encontrado para este filtro.</div>';
      return;
    }

    target.innerHTML = `
      <table role="grid" aria-label="Tabela de desempenho da frota">
        <thead>
          <tr>
            <th scope="col">Equipamento</th>
            <th scope="col">Placa</th>
            <th scope="col">Motorista</th>
            <th scope="col">Meta</th>
            <th scope="col">Consumo</th>
            <th scope="col">Δ Consumo</th>
            <th scope="col">Scania Driver Support (%)</th>
            <th scope="col">Nota</th>
            <th scope="col">Δ Nota</th>
            <th scope="col">Faixa</th>
            <th scope="col">Distância</th>
            <th scope="col">Marcha lenta</th>
            <th scope="col">Inércia</th>
            <th scope="col">Excesso vel.</th>
            <th scope="col">Freadas</th>
            <th scope="col">CO₂</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => {
            const prev = prevMap.get(r.equipamento + '|' + r.motorista);
            const dCons = deltaInfo(r.consumo, prev?.consumo, true, '', 2);
            const dScore = deltaInfo(r.score, prev?.score, true, '', 1);
            return `<tr>
              <td><strong>${r.equipamento}</strong></td>
              <td>${r.placa}</td>
              <td>${r.motorista}</td>
              <td>${r.meta ? formatNumber(r.meta, 1) : '-'}</td>
              <td><strong>${formatNumber(r.consumo, 2)}</strong></td>
              <td><span class="delta ${dCons.cls}">${dCons.text.replace(' vs mês anterior', '')}</span></td>
              <td>${formatNumber(r.supportUsage, 1)}%</td>
              <td>${formatNumber(r.score, 1)}</td>
              <td><span class="delta ${dScore.cls}">${dScore.text.replace(' vs mês anterior', '')}</span></td>
              <td><span class="pill" style="background:${pillColor(r.grade)}">${r.grade}</span></td>
              <td>${formatInt(r.distancia)}</td>
              <td>${formatNumber(r.marchaLenta, 1)}%</td>
              <td>${formatNumber(r.inercia, 1)}%</td>
              <td>${formatNumber(r.excessoVelocidade, 1)}%</td>
              <td>${formatNumber(r.freadasBruscas, 2)}</td>
              <td>${formatNumber(r.co2, 1)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  }

  _setDelta(elId, current, previous, betterWhenHigher = true, unit = '', digits = 1) {
    const info = deltaInfo(current, previous, betterWhenHigher, unit, digits);
    const el = document.getElementById(elId);
    if (el) {
      el.className = `delta ${info.cls}`;
      el.textContent = info.text;
    }
  }

  _updateLastBadge(month) {
    const loadedCount = this.getMonthsWithData().length;
    const badge = document.getElementById('lastUpdateBadge');
    if (badge) {
      badge.textContent = `Período: ${month} • ${loadedCount} mês(es) com dados • Filtro: ${state.selectedDriver === 'TODOS' ? 'Todos' : state.selectedDriver}`;
    }
  }
}

// Singleton instance
export const dashboardUI = new DashboardUI();
