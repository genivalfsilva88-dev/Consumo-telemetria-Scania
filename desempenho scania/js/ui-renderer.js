import { CONFIG, state } from './config.js';
import { cacheManager } from './cache.js';
import { DataLoader, normalizeMonthRows } from './data-loader.js';
import {
  computeMonthSummary,
  computePrimaryPressure,
  computeOpportunities,
  deltaInfo,
  generateAlerts,
  forecastTrend,
  formatNumber,
  formatInt,
  formatMoney,
  formatCurrencyInput,
  currentDieselPrice,
  currentIdleSavingsTarget,
  gradeClass,
  pillColor,
  hasMinActivity,
  idleFuelRateFactor
} from './calculations.js';
import { chartManager } from './charts.js';
import { exportManager } from './export.js';
import { buildAIContext, generateExecutiveInsight, peekCachedInsight, askAI } from './ai-insights.js';

/**
 * Main UI Renderer and Dashboard Controller
 */
export class DashboardUI {
  constructor() {
    this.dataLoader = new DataLoader();
    this.autoSyncHandle = null;
    this.syncInFlight = null;
    this.lastSyncAt = 0;
    this.boundVisibilitySync = null;
    this.boundFocusSync = null;
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
      this._setupDieselInput();
      this._setupIdleSavingsTargetInput();
      this._setupExportButtons();
      this._setupAIPanel();
      
      // Render dashboard
      this.renderDashboard();
      
      // Show cache status
      this._showCacheStatus();
      this._setupAutoSync();

      if (this.dataLoader.lastLoadSource === 'cache') {
        this.syncWithSource({ reason: 'Validando atualizações da base...' });
      }
      
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
    this.lastSyncAt = 0;
    await this.init();
  }

  /**
   * Revalidate source data in background
   */
  async syncWithSource({ reason = 'Sincronizando base...', force = false } = {}) {
    const now = Date.now();
    if (!force && now - this.lastSyncAt < CONFIG.sync.minIntervalMs) {
      return this.syncInFlight;
    }

    if (this.syncInFlight) {
      return this.syncInFlight;
    }

    const previousFingerprint = this.dataLoader.getStateFingerprint();
    this.lastSyncAt = now;
    this._updateLoadingStatus(reason);

    this.syncInFlight = (async () => {
      try {
        await this.dataLoader.refreshFromSheets();
        const nextFingerprint = this.dataLoader.getStateFingerprint();
        const hasChanges = previousFingerprint !== nextFingerprint;

        this._showCacheStatus();

        if (hasChanges) {
          this._populateMonthSelect();
          this._populateDriverSelect();
          this._populateFleetSelect();
          this.renderDashboard();
          this._updateLoadingStatus('Base sincronizada agora');
        } else {
          this._updateLastBadge(state.selectedMonth);
        }
      } catch (error) {
        console.warn('Background sync failed:', error);
        this._updateLoadingStatus('Falha ao sincronizar a base');
      } finally {
        this.syncInFlight = null;
      }
    })();

    return this.syncInFlight;
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
    this._renderExecutiveBriefing(summary);
    this._renderComparisonPanel(month, summary, prevSummary, prevMonth);
    this._renderAlertsPanel();
    this._renderActionCards(summary);
    this._renderCostPanel(summary, prevSummary);
    this._renderTrendChart();
    this._renderRankingChart(month);
    this._renderGradeDistribution(month);
    this._renderTrainingList(month);
    this._renderDriverSummary(month);
    this._renderIdleImpactChart(month);
    this._renderTable(month);
    this._renderForecast();
    this._renderOpportunities(summary);
    this._renderAIPanel(month, rows, summary);

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
    if (!badge) return;

    if (cacheManager.isFresh()) {
      badge.textContent = cacheManager.getAgeText();
      badge.style.display = 'inline-flex';
      return;
    }

    badge.style.display = 'none';
  }

  _setupAutoSync() {
    if (!this.autoSyncHandle) {
      this.autoSyncHandle = window.setInterval(() => {
        this.syncWithSource({ reason: 'Sincronizando base...' });
      }, CONFIG.sync.autoRefreshMinutes * 60 * 1000);
    }

    if (!this.boundVisibilitySync) {
      this.boundVisibilitySync = () => {
        if (!document.hidden) {
          this.syncWithSource({ reason: 'Verificando mudanças na base...' });
        }
      };
      document.addEventListener('visibilitychange', this.boundVisibilitySync);
    }

    if (!this.boundFocusSync) {
      this.boundFocusSync = () => {
        this.syncWithSource({ reason: 'Verificando mudanças na base...' });
      };
      window.addEventListener('focus', this.boundFocusSync);
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

    if (!document.getElementById('pageInsights')) {
      const pageInsights = document.createElement('section');
      pageInsights.className = 'page-section';
      pageInsights.id = 'pageInsights';
      pageInsights.innerHTML = `
        <div class="page-head">
          <div>
            <span class="page-kicker">Página 4</span>
            <h2 class="page-title">Oportunidades &amp; IA</h2>
          </div>
          <div class="page-note">Oportunidades ranqueadas por impacto financeiro e análise executiva gerada por IA</div>
        </div>

        <section class="panel soft-accent full-span" aria-label="Oportunidades de redução de custo">
          <div class="panel-head">
            <h3 class="panel-title" style="margin:0;">Oportunidades de redução de custo</h3>
            <span class="subtle">Ranqueadas por impacto em R$ no filtro atual</span>
          </div>
          <div id="opportunitiesList" style="display:flex; flex-direction:column; gap:8px;"></div>
        </section>

        <section class="panel soft-accent full-span" aria-label="Análise executiva por IA">
          <div class="panel-head">
            <h3 class="panel-title" style="margin:0;">Análise executiva (IA)</h3>
            <button class="button" id="aiGenerateBtn" type="button">Gerar análise</button>
          </div>
          <div id="aiInsightStatus" class="ai-status"></div>
          <div id="aiInsightText" class="ai-insight-text"></div>
        </section>

        <section class="panel soft-accent full-span" aria-label="Chat com IA sobre os dados">
          <div class="panel-head">
            <h3 class="panel-title" style="margin:0;">Pergunte à IA sobre os dados</h3>
            <div style="display:flex; align-items:center; gap:10px;">
              <span class="subtle" id="aiChatContext"></span>
              <button class="button ghost" id="aiChatClearBtn" type="button" title="Apagar a conversa e começar outra pergunta">Limpar conversa</button>
            </div>
          </div>
          <div id="aiChatMessages"></div>
          <form id="aiChatForm" class="ai-chat-form">
            <input type="text" id="aiChatInput" class="control" placeholder="Ex.: quais motoristas mais pesam no custo este mês?" autocomplete="off" />
            <button type="submit" class="button primary" id="aiChatSend">Enviar</button>
          </form>
        </section>`;
      footer.parentNode.insertBefore(pageInsights, footer);
    }
  }

  _setupPageNav() {
    document.querySelectorAll('.nav-pill[data-page]').forEach(btn => {
      if (btn.dataset.navBound === '1') return;
      btn.dataset.navBound = '1';
      btn.addEventListener('click', () => this.setActivePage(btn.dataset.page));
    });

    // Deep-link por hash de URL (#operational, #fleet) para links compartilháveis
    if (!this._hashNavBound) {
      this._hashNavBound = true;
      window.addEventListener('hashchange', () => {
        const page = location.hash.replace('#', '');
        if (['executive', 'operational', 'fleet', 'insights'].includes(page)) this.setActivePage(page);
      });
    }
    const initial = location.hash.replace('#', '');
    if (['operational', 'fleet', 'insights'].includes(initial)) this.setActivePage(initial);
  }

  setActivePage(page) {
    state.currentPage = page;
    if (location.hash.replace('#', '') !== page) {
      history.replaceState(null, '', `#${page}`);
    }
    const pageMap = {
      executive: 'pageExecutive',
      operational: 'pageOperational',
      fleet: 'pageFleet',
      insights: 'pageInsights'
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

  _setupDieselInput() {
    const input = document.getElementById('dieselInput');
    if (!input) return;

    input.value = formatCurrencyInput(state.dieselAverage);

    const applyValue = rawValue => {
      const normalized = Number.parseFloat(String(rawValue || '').replace(',', '.'));
      state.dieselAverage = Number.isFinite(normalized) && normalized > 0
        ? normalized
        : CONFIG.defaultDieselPrice;
      input.value = formatCurrencyInput(state.dieselAverage);
      this.renderDashboard();
    };

    input.onchange = event => applyValue(event.target.value);
    input.onblur = event => applyValue(event.target.value);
    input.onkeydown = event => {
      if (event.key === 'Enter') applyValue(event.target.value);
    };
  }

  _setupIdleSavingsTargetInput() {
    const input = document.getElementById('idleTargetInput');
    if (!input) return;

    input.value = formatNumber(state.idleSavingsTargetPercent, 0);

    const applyValue = rawValue => {
      const normalized = Number.parseFloat(String(rawValue || '').replace(',', '.'));
      state.idleSavingsTargetPercent = Number.isFinite(normalized) && normalized >= 0 && normalized <= 100
        ? normalized
        : CONFIG.goals.idleSavingsTargetPercent;
      input.value = formatNumber(state.idleSavingsTargetPercent, 0);
      this.renderDashboard();
    };

    input.onchange = event => applyValue(event.target.value);
    input.onblur = event => applyValue(event.target.value);
    input.onkeydown = event => {
      if (event.key === 'Enter') applyValue(event.target.value);
    };
  }

  _setupExportButtons() {
    const csvBtn = document.getElementById('csvBtn');
    const reportBtn = document.getElementById('reportBtn');

    if (csvBtn) csvBtn.onclick = () => {
      const rows = this.getFilteredRows(state.selectedMonth);
      exportManager.exportToCSV(state.selectedMonth, rows);
    };

    if (reportBtn) reportBtn.onclick = () => {
      const rows = this.getFilteredRows(state.selectedMonth);
      const summary = computeMonthSummary(rows);
      exportManager.exportReportText(state.selectedMonth, summary, state.alerts);
    };
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
    const kpiFrota = document.getElementById('kpiFrota');
    const kpiConsumo = document.getElementById('kpiConsumo');
    const kpiDistancia = document.getElementById('kpiDistancia');
    const kpiKmTotal = document.getElementById('kpiKmTotal');
    const kpiCo2 = document.getElementById('kpiCo2');
    const scoreNumber = document.getElementById('scoreNumber');
    const scoreLetter = document.getElementById('scoreLetter');

    if (kpiFrota) kpiFrota.textContent = formatInt(summary.frota);
    const kpiFrotaFoot = document.getElementById('kpiFrotaFoot');
    if (kpiFrotaFoot) {
      kpiFrotaFoot.textContent = summary.inactiveCount > 0
        ? `Quantidade de equipamentos no período filtrado • ${formatInt(summary.inactiveCount)} sem atividade mínima (fora das médias)`
        : 'Quantidade de equipamentos no período filtrado';
    }
    if (kpiConsumo) kpiConsumo.textContent = formatNumber(summary.consumoMedio, 2);
    if (kpiDistancia) kpiDistancia.textContent = formatInt(summary.distanciaMedia);
    if (kpiKmTotal) kpiKmTotal.textContent = formatInt(summary.totalKm);
    if (kpiCo2) kpiCo2.textContent = formatNumber(summary.co2Total, 1);
    if (scoreNumber) scoreNumber.textContent = formatNumber(summary.scoreMedio, 1);
    if (scoreLetter) {
      scoreLetter.textContent = summary.grade;
      scoreLetter.className = `score-letter ${gradeClass(summary.grade)}`;
    }
    chartManager.renderScoreGauge(summary.scoreMedio, summary.grade);

    // Meta progress
    const realValue = document.getElementById('realValue');
    const metaValue = document.getElementById('metaValue');
    const metaFill = document.getElementById('metaFill');
    const metaText = document.getElementById('metaText');

    // Compara consumo e meta sobre o mesmo universo (apenas equipamentos com meta cadastrada)
    const realCompare = summary.metaMedia > 0 ? summary.consumoMedioMeta : summary.consumoMedio;
    if (realValue) realValue.textContent = `${formatNumber(realCompare, 2)} km/l`;
    if (metaValue) metaValue.textContent = summary.metaMedia ? `${formatNumber(summary.metaMedia, 2)} km/l` : 'Sem meta';
    const metaPerf = summary.metaMedia > 0 ? (realCompare / summary.metaMedia) * 100 : 0;
    if (metaFill) {
      metaFill.style.width = `${Math.max(0, Math.min(metaPerf, 100))}%`;
    }
    if (metaText) {
      metaText.textContent = summary.metaMedia > 0
        ? `${realCompare >= summary.metaMedia ? 'Meta atingida' : 'Abaixo da meta'} (${formatNumber(metaPerf, 1)}%) • Scania Driver Support ${formatNumber(summary.supportUsageMedio, 1)}%`
        : `Sem meta cadastrada • Scania Driver Support ${formatNumber(summary.supportUsageMedio, 1)}%`;
    }

    // Indicators
    const indMarcha = document.getElementById('indMarcha');
    const indInercia = document.getElementById('indInercia');
    const indExcesso = document.getElementById('indExcesso');
    const indSupport = document.getElementById('indSupport');

    if (indMarcha) indMarcha.textContent = `${formatNumber(summary.marchaLenta, 1)}%`;
    if (indInercia) indInercia.textContent = `${formatNumber(summary.inercia, 1)}%`;
    if (indExcesso) indExcesso.textContent = `${formatNumber(summary.excessoVelocidade, 1)}%`;
    if (indSupport) indSupport.textContent = `${formatNumber(summary.supportUsageMedio, 1)}%`;

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

  _renderExecutiveBriefing(summary) {
    const pressure = computePrimaryPressure(summary);

    this._setDecisionCard('Risk', `Risco • ${pressure.tag}`, pressure.value, pressure.foot, pressure.tone);
    
    this._setDecisionCard(
      'Opportunity',
      summary.savingsValue > 0 ? 'Oportunidade • Potencial financeiro' : 'Oportunidade • Custo sob controle',
      summary.savingsValue > 0 ? `R$ ${formatMoney(summary.savingsValue)}` : 'Sem desvio relevante',
      summary.savingsValue > 0
        ? `${formatInt(summary.savingsLiters)} litros recuperáveis com diesel médio de R$ ${formatCurrencyInput(summary.dieselPrice)}/l.`
        : 'No filtro atual, a meta de consumo não indica desperdício relevante.',
      summary.savingsValue > 0 ? 'warning' : 'success'
    );

  }

  _setDecisionCard(section, tag, value, foot, tone) {
    const card = document.getElementById(`decision${section}Card`);
    const tagEl = document.getElementById(`decision${section}Tag`);
    const valueEl = document.getElementById(`decision${section}Value`);
    const footEl = document.getElementById(`decision${section}Foot`);

    if (!card || !tagEl || !valueEl || !footEl) {
      console.warn(`Decision card elements not found for section: ${section}`);
      return;
    }

    // Sanitize and truncate long values
    const safeValue = String(value || '-').substring(0, 50);
    const safeFoot = String(foot || '').substring(0, 120);
    const safeTag = String(tag || '').substring(0, 60);

    card.className = `decision-card ${tone || 'neutral'}`;
    tagEl.textContent = safeTag;
    valueEl.textContent = safeValue;
    footEl.textContent = safeFoot;
  }

  _renderComparisonPanel(month, current, previous, prevMonth) {
    const labelEl = document.getElementById('compareMonthLabel');
    if (labelEl) labelEl.textContent = prevMonth ? `${month} vs ${prevMonth}` : 'Sem mês anterior disponível';

    const target = document.getElementById('compareStats');
    if (!target) return;

    if (!prevMonth || !previous || previous.frota === 0) {
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
      const d = deltaInfo(a ?? 0, b ?? 0, better, unit, digits);
      const aVal = a != null ? formatNumber(a, digits) : '-';
      const bVal = b != null ? formatNumber(b, digits) : '-';
      return `<div class="compare-stat">
        <div><strong>${label}</strong><div class="subtle">Atual: ${aVal}${unit} • Anterior: ${bVal}${unit}</div></div>
        <div class="delta ${d.cls}">${d.text.replace(' vs mês anterior', '')}</div>
      </div>`;
    }).join('');
  }

  _renderAlertsPanel() {
    const target = document.getElementById('alertsList');
    if (!target) return;

    if (state.alerts.length === 0) {
      target.innerHTML = '<div class="alert-item success"><span class="alert-icon"></span><div><strong>Sem alertas críticos</strong><div class="alert-sub">Operação dentro dos parâmetros esperados</div></div></div>';
      return;
    }

    target.innerHTML = state.alerts.map(alert => {
      const severityClass = alert.severity === 'high' ? 'high' : alert.severity === 'medium' ? 'medium' : 'low';
      return `<div class="alert-item ${severityClass}">
        <span class="alert-icon"></span>
        <div>
          <strong>${alert.message}</strong>
          <div class="alert-sub">Ação: ${alert.action}</div>
        </div>
      </div>`;
    }).join('');
  }

  _renderActionCards(summary) {
    const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };

    setEl('metaHitPct', `${formatNumber(summary.metaHitPct, 1)}%`);
    setEl('metaHitCount', `${formatInt(summary.metaHitCount)} de ${formatInt(summary.validMetaCount || summary.frota)} equip.`);
    setEl('savingsValue', `R$ ${formatMoney(summary.savingsValue)}`);
    setEl('savingsLiters', `${formatInt(summary.savingsLiters)} litros recuperáveis`);
    setEl('savingsValueFoot', `Cálculo com diesel médio de R$ ${formatCurrencyInput(summary.dieselPrice)}/l`);
    setEl('criticalCount', formatInt(summary.criticalCount));
    setEl('criticalPct', `${formatNumber(summary.criticalPct, 1)}% da frota`);
    setEl('criticalCountFoot', summary.inactiveCount > 0
      ? `Nota baixa ou desempenho abaixo da meta • base de ${formatInt(summary.frota - summary.inactiveCount)} equip. com atividade mínima`
      : 'Nota baixa ou desempenho abaixo da meta no periodo filtrado');
    setEl('supportExecutive', `${formatNumber(summary.supportUsageMedio, 1)}%`);
    setEl('idleLiters', formatInt(summary.idleLiters));
    setEl('idleLitersFoot', `Estimativa aproximada (taxa de queima parado ≈${formatNumber(CONFIG.alerts.idleFuelRateFactor * 100, 0)}% da taxa média rodando)`);
    setEl('driversBelowMeta', formatInt(summary.driversBelowMetaCount));
    setEl('speedExecutive', `${formatNumber(summary.excessoVelocidade, 1)}%`);
    setEl('idleAboveTarget', formatInt(summary.idleAboveTargetCount));

    // Deltas
    const prevMonth = this.previousLoadedMonth(state.selectedMonth);
    const prevRows = prevMonth ? this.getFilteredRows(prevMonth) : [];
    const prevSummary = computeMonthSummary(prevRows);
    const savingsDelta = deltaInfo(summary.savingsValue, prevSummary.savingsValue, false, '', 0);
    const savingsDeltaEl = document.getElementById('deltaSavings');

    this._setDelta('deltaMetaHit', summary.metaHitPct, prevSummary.metaHitPct, true, ' p.p.', 1);
    if (savingsDeltaEl) {
      savingsDeltaEl.className = `delta ${savingsDelta.cls}`;
      savingsDeltaEl.textContent = savingsDelta.text.replace(/^([▲▼]) /, '$1 R$ ');
    }
    this._setDelta('deltaCritical', summary.criticalCount, prevSummary.criticalCount, false, '', 0);
    this._setDelta('deltaSupportExecutive', summary.supportUsageMedio, prevSummary.supportUsageMedio, true, ' p.p.', 1);
    this._setDelta('deltaIdleLiters', summary.idleLiters, prevSummary.idleLiters, false, ' l', 0);
    this._setDelta('deltaIdleAboveTarget', summary.idleAboveTargetCount, prevSummary.idleAboveTargetCount, false, '', 0);
    this._setDelta('deltaDriversBelowMeta', summary.driversBelowMetaCount, prevSummary.driversBelowMetaCount, false, '', 0);
    this._setDelta('deltaSpeedExecutive', summary.excessoVelocidade, prevSummary.excessoVelocidade, false, ' p.p.', 1);
  }

  _renderCostPanel(summary, prevSummary) {
    const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const diesel = formatCurrencyInput(summary.dieselPrice);

    setEl('costPanelSubtitle', `Valores estimados com diesel médio de R$ ${diesel}/l`);

    // Bottom line: economia realizada menos desperdício (não soma marcha lenta — ver nota no rodapé)
    const netEl = document.getElementById('costNet');
    if (netEl) {
      const isGain = summary.netSavingsCost >= 0;
      netEl.style.color = isGain ? 'var(--success)' : 'var(--danger)';
      netEl.textContent = `${isGain ? '' : '-'}R$ ${formatMoney(Math.abs(summary.netSavingsCost))}`;
    }
    setEl('costNetFoot', `Economia realizada (R$ ${formatMoney(summary.savedCost)}) − desperdício (R$ ${formatMoney(summary.wasteCost)}). Não inclui marcha lenta, que já está embutida no consumo.`);

    // Custo total de combustível do período
    setEl('costFuel', `R$ ${formatMoney(summary.fuelCost)}`);
    setEl('costFuelFoot', `${formatInt(summary.fuelLiters)} litros consumidos no período`);

    // Desperdício por baixa eficiência (economia potencial se atingissem a meta)
    setEl('costWaste', `R$ ${formatMoney(summary.wasteCost)}`);
    setEl('costWasteFoot', `${formatInt(summary.wasteLiters)} litros • ${formatNumber(summary.wastePctOfCost, 1)}% do custo de combustível`);

    // Custo do combustível queimado em marcha lenta
    setEl('costIdle', `R$ ${formatMoney(summary.idleCost)}`);
    setEl('costIdleFoot', `${formatInt(summary.idleLiters)} litros estimados (aprox., taxa de queima parado ≈${formatNumber(CONFIG.alerts.idleFuelRateFactor * 100, 0)}% da taxa média)`);

    // Economia já realizada pelos equipamentos acima da meta
    setEl('costSaved', `R$ ${formatMoney(summary.savedCost)}`);
    setEl('costSavedFoot', `${formatInt(summary.savedLiters)} litros economizados acima da meta`);

    // Economia potencial (cenário hipotético): marcha lenta caindo para a meta configurada
    setEl('costIdleSavings15', `R$ ${formatMoney(summary.idleSavingsCost15)}`);
    setEl('costIdleSavings15Foot', `${formatInt(summary.idleSavingsLiters15)} litros se a marcha lenta caísse para ${summary.idleSavingsTargetPercent}%`);
  }

  _renderTrendChart() {
    const data = CONFIG.monthNames.map(month => {
      const rows = this.getFilteredRows(month);
      const s = computeMonthSummary(rows);
      return { month, consumo: s.consumoMedio || 0, meta: s.metaMedia || 0, score: s.scoreMedio || 0, frota: s.frota || 0 };
    });

    const hasData = data.some(d => d.frota > 0);
    if (!hasData) {
      console.warn('No data available for trend chart');
    }

    chartManager.renderTrendChart(data);
  }

  _renderRankingChart(month) {
    const fleetRows = [...(state.monthData[month] || [])];
    const activeRows = fleetRows.filter(hasMinActivity);
    const eligible = activeRows.filter(r => r.meta > 0).map(r => ({ ...r, ratio: r.consumo / r.meta }));
    const inactiveCount = fleetRows.length - activeRows.length;
    const noMetaCount = activeRows.length - eligible.length;

    // Ranking por consumo relativo à meta de cada equipamento (%), não por km/l bruto —
    // equipamentos têm metas diferentes por perfil de rota/carga, então comparar consumo
    // absoluto entre eles favorece injustamente quem tem rota mais fácil.
    const bestRows = eligible.slice().sort((a, b) => b.ratio - a.ratio).slice(0, 10).reverse();
    const worstRows = eligible.slice().sort((a, b) => a.ratio - b.ratio).slice(0, 10).reverse();

    chartManager.renderRankingChart(month, bestRows, worstRows);

    const exclusionNote = [
      inactiveCount > 0 ? `${inactiveCount} sem atividade mínima` : null,
      noMetaCount > 0 ? `${noMetaCount} sem meta cadastrada` : null
    ].filter(Boolean).join(' e ');
    const suffix = exclusionNote ? ` • ${exclusionNote} não entram no ranking` : '';

    const rankingSubtitle = document.getElementById('rankingSubtitle');
    const worstRankingSubtitle = document.getElementById('worstRankingSubtitle');
    if (rankingSubtitle) rankingSubtitle.textContent = `Frota completa de ${month} • filtro por motorista não aplicado${suffix}`;
    if (worstRankingSubtitle) worstRankingSubtitle.textContent = `Frota completa de ${month} • foco para ação imediata${suffix}`;
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
      const rows = this.getFilteredRows(month);
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

      this._setDriverSummary(titleText, html);
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
          <div class="summary-box"><div class="subtle">Pontos de atenção</div><div class="subtle" style="margin-top:10px; line-height:1.7;">Marcha lenta: <strong>${formatNumber(s.marchaLenta, 1)}%</strong><br>Inércia: <strong>${formatNumber(s.inercia, 1)}%</strong><br>Excesso vel.: <strong>${formatNumber(s.excessoVelocidade, 1)}%</strong><br>Economia potencial (marcha lenta ${s.idleSavingsTargetPercent}%): <strong>R$ ${formatMoney(s.idleSavingsCost15)}</strong></div></div>
        </div>`;

      this._setDriverSummary(titleText, html);
    }
  }

  _setDriverSummary(title, html) {
    const targets = [
      ['driverSummaryTitle', 'driverSummaryBox'],
      ['driverSummaryTitleFleet', 'driverSummaryBoxFleet']
    ];

    targets.forEach(([titleId, boxId]) => {
      const titleEl = document.getElementById(titleId);
      const boxEl = document.getElementById(boxId);
      if (titleEl) titleEl.textContent = title;
      if (boxEl) boxEl.innerHTML = html;
    });
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
      target.className = 'decision-card neutral';
      target.innerHTML = `
        <span class="decision-tag">Projeção • Tendência</span>
        <div class="decision-value">Sem base</div>
        <div class="decision-foot">Dados insuficientes para estimar os próximos meses.</div>
      `;
      return;
    }

    const monthNames = CONFIG.monthNames;
    const loadedMonths = this.getMonthsWithData();
    const lastMonthIdx = loadedMonths.length > 0 ? monthNames.indexOf(loadedMonths[loadedMonths.length - 1]) : -1;

    if (lastMonthIdx < 0) {
      target.className = 'decision-card neutral';
      target.innerHTML = `
        <span class="decision-tag">Projeção • Tendência</span>
        <div class="decision-value">Sem base</div>
        <div class="decision-foot">Não há mês carregado para gerar a projeção.</div>
      `;
      return;
    }

    const forecastMonths = forecast.map((_, i) => {
      const idx = (lastMonthIdx + i + 1) % 12;
      return monthNames[idx];
    });

    const lastActual = data[data.length - 1] || 0;
    const next = forecast[0];
    const second = forecast[1];
    const isImproving = next.value >= lastActual;
    target.className = `decision-card ${isImproving ? 'success' : 'warning'}`;
    target.innerHTML = `
      <span class="decision-tag">Projeção • Tendência</span>
      <div class="decision-value">${forecastMonths[0] || 'Próx.'}: ${formatNumber(next.value, 2)} km/l</div>
      <div class="decision-foot">${second ? `${forecastMonths[1]}: ${formatNumber(second.value, 2)} km/l. ` : ''}Estimativa linear com os meses carregados.</div>
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

    const diesel = currentDieselPrice();
    const idleTarget = currentIdleSavingsTarget();
    const idleFactor = idleFuelRateFactor();

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
            <th scope="col">Economia (L)</th>
            <th scope="col">Economia (R$)</th>
            <th scope="col">Desperdício (L)</th>
            <th scope="col">Desperdício (R$)</th>
            <th scope="col">Economia líquida (R$)</th>
            <th scope="col">Scania Driver Support (%)</th>
            <th scope="col">Nota</th>
            <th scope="col">Δ Nota</th>
            <th scope="col">Faixa</th>
            <th scope="col">Distância</th>
            <th scope="col">Marcha lenta</th>
            <th scope="col">Marcha lenta real (L)</th>
            <th scope="col">Marcha lenta real (R$)</th>
            <th scope="col">Economia ML ${idleTarget}% (L)</th>
            <th scope="col">Economia ML ${idleTarget}% (R$)</th>
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
            // Economia (acima da meta) e desperdício (abaixo da meta) em litros e R$
            let savedLiters = 0;
            let wasteLiters = 0;
            if (r.meta > 0 && r.consumo > 0 && r.distancia > 0) {
              const atual = r.distancia / r.consumo;
              const alvo = r.distancia / r.meta;
              if (r.consumo >= r.meta) savedLiters = Math.max(0, alvo - atual);
              else wasteLiters = Math.max(0, atual - alvo);
            }
            const savedCell = savedLiters > 0
              ? `<span class="delta up good">${formatNumber(savedLiters, 1)}</span>`
              : '<span class="subtle">-</span>';
            const savedCostCell = savedLiters > 0
              ? `<span class="delta up good">R$ ${formatMoney(savedLiters * diesel)}</span>`
              : '<span class="subtle">-</span>';
            const wasteCell = wasteLiters > 0
              ? `<span class="delta down bad">${formatNumber(wasteLiters, 1)}</span>`
              : '<span class="subtle">-</span>';
            const wasteCostCell = wasteLiters > 0
              ? `<span class="delta down bad">R$ ${formatMoney(wasteLiters * diesel)}</span>`
              : '<span class="subtle">-</span>';
            // Economia líquida do equipamento: só um dos dois (economia OU desperdício) é
            // diferente de zero por linha, então isso é só o mesmo valor com o sinal certo
            const netCostRow = (savedLiters - wasteLiters) * diesel;
            const netCostCell = netCostRow === 0
              ? '<span class="subtle">-</span>'
              : `<span class="delta ${netCostRow > 0 ? 'up good' : 'down bad'}">${netCostRow > 0 ? '' : '-'}R$ ${formatMoney(Math.abs(netCostRow))}</span>`;
            // Marcha lenta real: quanto o equipamento efetivamente queimou parado no período,
            // não importa se está acima ou abaixo da meta (estimativa — ver idleFuelRateFactor)
            const idleRealLiters = (r.consumo > 0 && r.distancia > 0 && r.marchaLenta > 0)
              ? (r.distancia / r.consumo) * (r.marchaLenta / 100) * idleFactor
              : 0;
            const idleRealCell = idleRealLiters > 0
              ? formatNumber(idleRealLiters, 1)
              : '<span class="subtle">-</span>';
            const idleRealCostCell = idleRealLiters > 0
              ? `R$ ${formatMoney(idleRealLiters * diesel)}`
              : '<span class="subtle">-</span>';
            // Economia potencial (cenário hipotético): quanto a MAIS ele economizaria se reduzisse
            // a marcha lenta até a meta configurada. Fica "-" quando já está na meta ou abaixo dela
            // (não há economia adicional a capturar, ele já está entre os melhores nesse indicador).
            const idleSavings15Liters = (r.consumo > 0 && r.distancia > 0 && r.marchaLenta > idleTarget)
              ? (r.distancia / r.consumo) * ((r.marchaLenta - idleTarget) / 100) * idleFactor
              : 0;
            const idleSavings15Cell = idleSavings15Liters > 0
              ? `<span class="delta up good">${formatNumber(idleSavings15Liters, 1)}</span>`
              : '<span class="subtle">-</span>';
            const idleSavings15CostCell = idleSavings15Liters > 0
              ? `<span class="delta up good">R$ ${formatMoney(idleSavings15Liters * diesel)}</span>`
              : '<span class="subtle">-</span>';
            const isActive = hasMinActivity(r);
            const inactiveMark = isActive ? '' : ' <span class="subtle" title="Distância abaixo do mínimo de atividade — fora das médias, rankings e alertas críticos">⚠</span>';
            const noMetaMark = r.temMeta ? '' : ' <span class="subtle" title="Sem meta cadastrada — nota não considera o componente de consumo">†</span>';
            return `<tr${isActive ? '' : ' class="row-inactive"'}>
              <td><strong>${r.equipamento}</strong>${inactiveMark}</td>
              <td>${r.placa}</td>
              <td>${r.motorista}</td>
              <td>${r.meta ? formatNumber(r.meta, 1) : '-'}</td>
              <td><strong>${formatNumber(r.consumo, 2)}</strong></td>
              <td><span class="delta ${dCons.cls}">${dCons.text.replace(' vs mês anterior', '')}</span></td>
              <td>${savedCell}</td>
              <td>${savedCostCell}</td>
              <td>${wasteCell}</td>
              <td>${wasteCostCell}</td>
              <td>${netCostCell}</td>
              <td>${formatNumber(r.supportUsage, 1)}%</td>
              <td>${formatNumber(r.score, 1)}</td>
              <td><span class="delta ${dScore.cls}">${dScore.text.replace(' vs mês anterior', '')}</span></td>
              <td><span class="pill" style="background:${pillColor(r.grade)}">${r.grade}</span>${noMetaMark}</td>
              <td>${formatInt(r.distancia)}</td>
              <td>${formatNumber(r.marchaLenta, 1)}%</td>
              <td>${idleRealCell}</td>
              <td>${idleRealCostCell}</td>
              <td>${idleSavings15Cell}</td>
              <td>${idleSavings15CostCell}</td>
              <td>${formatNumber(r.inercia, 1)}%</td>
              <td>${formatNumber(r.excessoVelocidade, 1)}%</td>
              <td>${formatNumber(r.freadasBruscas, 2)}</td>
              <td>${formatNumber(r.co2, 1)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
      <div class="table-footnote">⚠ abaixo do mínimo de ${CONFIG.alerts.minActivityKm} km de atividade no período — fora das médias, rankings e alertas críticos. † sem meta cadastrada — nota não considera consumo. "Economia ML" é estimativa aproximada (assume taxa de queima parado ≈${formatNumber(idleFactor * 100, 0)}% da taxa média rodando).</div>`;
  }

  _setDelta(elId, current, previous, betterWhenHigher = true, unit = '', digits = 1) {
    const info = deltaInfo(current, previous, betterWhenHigher, unit, digits);
    const el = document.getElementById(elId);
    if (el) {
      el.className = `delta ${info.cls}`;
      el.textContent = info.text;
    }
  }

  _renderOpportunities(summary) {
    const target = document.getElementById('opportunitiesList');
    if (!target) return;

    const opportunities = computeOpportunities(summary);
    if (!opportunities.length) {
      target.innerHTML = '<div class="empty">Nenhuma oportunidade relevante identificada no filtro atual.</div>';
      return;
    }

    target.innerHTML = opportunities.map(o => {
      const cls = o.tone === 'danger' ? 'lvl-high' : o.tone === 'warning' ? 'lvl-med' : 'lvl-low';
      const impact = o.impactoReais > 0 ? `R$ ${formatMoney(o.impactoReais)}` : `${formatInt(o.afetados)} equip.`;
      return `<div class="list-item">
        <div>
          <strong>${o.titulo}</strong>
          <span class="list-sub">${formatInt(o.afetados)} equip. afetado(s) • ${o.acaoRecomendada}</span>
        </div>
        <span class="training-level ${cls}">${impact}</span>
      </div>`;
    }).join('');
  }

  _renderAIPanel(month, rows, summary) {
    if (!document.getElementById('pageInsights')) return;

    const context = buildAIContext(month, rows, summary);
    this._currentAIContext = context;

    const contextKey = `${month}|${state.selectedDriver}|${state.selectedFleet}`;
    if (this._aiContextKey !== contextKey) {
      this._aiContextKey = contextKey;
      state.aiChatHistory = [];
      this._renderChatMessages();
      this._loadCachedInsight(context);
    }

    const contextLabel = document.getElementById('aiChatContext');
    if (contextLabel) {
      const driver = state.selectedDriver === 'TODOS' ? 'Todos os motoristas' : state.selectedDriver;
      const fleet = state.selectedFleet === 'TODOS' ? 'Todos os equipamentos' : state.selectedFleet;
      contextLabel.textContent = `${month} • ${driver} • ${fleet}`;
    }
  }

  _loadCachedInsight(context) {
    const status = document.getElementById('aiInsightStatus');
    const textEl = document.getElementById('aiInsightText');
    const btn = document.getElementById('aiGenerateBtn');
    const cached = peekCachedInsight(context);

    if (textEl) textEl.textContent = cached || '';
    if (status) {
      status.textContent = cached ? 'Análise em cache para este filtro.' : '';
      status.className = 'ai-status';
    }
    if (btn) btn.textContent = cached ? 'Atualizar análise' : 'Gerar análise';
  }

  _setupAIPanel() {
    const btn = document.getElementById('aiGenerateBtn');
    if (btn && btn.dataset.bound !== '1') {
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => this._handleGenerateInsight());
    }

    const form = document.getElementById('aiChatForm');
    if (form && form.dataset.bound !== '1') {
      form.dataset.bound = '1';
      form.addEventListener('submit', event => {
        event.preventDefault();
        this._handleChatSubmit();
      });
    }

    const clearBtn = document.getElementById('aiChatClearBtn');
    if (clearBtn && clearBtn.dataset.bound !== '1') {
      clearBtn.dataset.bound = '1';
      clearBtn.addEventListener('click', () => this._handleClearChat());
    }

    const input = document.getElementById('aiChatInput');
    if (input && input.dataset.bound !== '1') {
      input.dataset.bound = '1';
      input.addEventListener('keydown', event => {
        if (event.key === 'Escape') input.value = '';
      });
    }
  }

  _handleClearChat() {
    state.aiChatHistory = [];
    this._renderChatMessages();
    const input = document.getElementById('aiChatInput');
    if (input) { input.value = ''; input.focus(); }
  }

  async _handleGenerateInsight() {
    const btn = document.getElementById('aiGenerateBtn');
    const status = document.getElementById('aiInsightStatus');
    const textEl = document.getElementById('aiInsightText');
    if (!btn || !this._currentAIContext) return;

    btn.disabled = true;
    btn.textContent = 'Gerando...';
    if (status) { status.textContent = 'Consultando IA...'; status.className = 'ai-status'; }

    try {
      const { text } = await generateExecutiveInsight(this._currentAIContext, { force: true });
      if (textEl) textEl.textContent = text;
      if (status) { status.textContent = 'Análise gerada agora.'; status.className = 'ai-status'; }
      btn.textContent = 'Atualizar análise';
    } catch (error) {
      if (status) { status.textContent = error.message; status.className = 'ai-status error'; }
      btn.textContent = 'Gerar análise';
    } finally {
      btn.disabled = false;
    }
  }

  async _handleChatSubmit() {
    const input = document.getElementById('aiChatInput');
    const sendBtn = document.getElementById('aiChatSend');
    if (!input || !this._currentAIContext) return;

    const question = input.value.trim();
    if (!question) return;

    this._appendChatBubble('user', question);
    input.value = '';
    input.disabled = true;
    if (sendBtn) sendBtn.disabled = true;

    const pendingEl = this._appendChatBubble('assistant', 'Pensando...', 'pending');

    try {
      const answer = await askAI(question, this._currentAIContext);
      if (pendingEl) {
        pendingEl.textContent = answer;
        pendingEl.classList.remove('pending');
      }
    } catch (error) {
      if (pendingEl) {
        pendingEl.textContent = error.message;
        pendingEl.classList.remove('pending');
        pendingEl.classList.add('error');
      }
    } finally {
      input.disabled = false;
      if (sendBtn) sendBtn.disabled = false;
      input.focus();
    }
  }

  _renderChatMessages() {
    const container = document.getElementById('aiChatMessages');
    if (container) container.innerHTML = '';
  }

  _appendChatBubble(role, text, extraClass = '') {
    const container = document.getElementById('aiChatMessages');
    if (!container) return null;

    const bubble = document.createElement('div');
    bubble.className = `ai-chat-bubble ${role} ${extraClass}`.trim();
    bubble.textContent = text;
    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
    return bubble;
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
