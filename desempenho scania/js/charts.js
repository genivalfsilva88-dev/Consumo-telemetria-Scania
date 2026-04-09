import { CONFIG, state } from './config.js';
import { formatNumber, formatInt, formatMoney, pillColor, gradeClass } from './calculations.js';

/**
 * Chart manager for ApexCharts
 */
export class ChartManager {
  constructor() {
    this.charts = {};
  }

  /**
   * Destroy all charts
   */
  destroyAll() {
    Object.values(this.charts).forEach(chart => {
      if (chart) chart.destroy();
    });
    this.charts = {};
  }

  /**
   * Render trend chart
   */
  renderTrendChart(data) {
    const filteredData = data.filter(item => item.frota > 0);
    
    const options = {
      chart: {
        type: 'line',
        height: 320,
        toolbar: { show: false },
        zoom: { enabled: false }
      },
      series: [
        { name: 'Consumo médio', data: filteredData.map(x => Number(x.consumo.toFixed(2))) },
        { name: 'Meta média', data: filteredData.map(x => Number((x.meta || 0).toFixed(2))) },
        { name: 'Nota média', data: filteredData.map(x => Number(x.score.toFixed(1))) }
      ],
      stroke: { curve: 'smooth', width: [4, 2, 3], dashArray: [0, 6, 0] },
      colors: ['#2563eb', '#16a34a', '#d71920'],
      xaxis: { categories: filteredData.map(x => x.month.slice(0, 3)) },
      yaxis: [
        { title: { text: 'km/l' } },
        { opposite: true, title: { text: 'Nota' } }
      ],
      dataLabels: { enabled: false },
      legend: { position: 'top' },
      grid: { borderColor: '#e5e7eb' },
      tooltip: { shared: true }
    };

    this._renderChart('trend', '#chartTrend', options);
  }

  /**
   * Render ranking chart
   */
  renderRankingChart(month, bestRows, worstRows) {
    const commonOpts = {
      chart: { type: 'bar', height: 260, toolbar: { show: false } },
      colors: ['#38bdf8'],
      plotOptions: { bar: { horizontal: true, borderRadius: 8, barHeight: '72%' } },
      dataLabels: { enabled: false },
      grid: { borderColor: '#e5e7eb' }
    };

    this._renderChart('ranking', '#chartRanking', {
      ...commonOpts,
      series: [{ name: 'Consumo', data: bestRows.map(r => Number(r.consumo.toFixed(2))) }],
      xaxis: { categories: bestRows.map(r => `#${r.equipamento}`) },
      tooltip: {
        y: { formatter: v => `${formatNumber(v, 2)} km/l` },
        custom: ({ dataPointIndex }) => {
          const row = bestRows[dataPointIndex];
          if (!row) return '';
          return `<div style="padding:10px 12px;min-width:210px"><strong>Equip. #${row.equipamento}</strong><br><span style="color:#475569">${row.motorista || '-'} • ${row.placa || '-'}</span><br><span style="color:#0f172a">Consumo: <strong>${formatNumber(row.consumo, 2)} km/l</strong></span></div>`;
        }
      }
    });

    this._renderChart('worstRanking', '#chartWorstRanking', {
      ...commonOpts,
      colors: ['#fb7185'],
      series: [{ name: 'Consumo', data: worstRows.map(r => Number(r.consumo.toFixed(2))) }],
      xaxis: { categories: worstRows.map(r => `#${r.equipamento}`) },
      tooltip: {
        y: { formatter: v => `${formatNumber(v, 2)} km/l` },
        custom: ({ dataPointIndex }) => {
          const row = worstRows[dataPointIndex];
          if (!row) return '';
          return `<div style="padding:10px 12px;min-width:210px"><strong>Equip. #${row.equipamento}</strong><br><span style="color:#475569">${row.motorista || '-'} • ${row.placa || '-'}</span><br><span style="color:#0f172a">Consumo: <strong>${formatNumber(row.consumo, 2)} km/l</strong></span></div>`;
        }
      }
    });
  }

  /**
   * Render grade distribution
   */
  renderGradeDistribution(month, rows) {
    const counts = ['A', 'B', 'C', 'D', 'E'].map(g => rows.filter(r => r.grade === g).length);
    
    this._renderChart('gradeDist', '#chartGradeDist', {
      chart: { type: 'bar', height: 250, toolbar: { show: false } },
      series: [{ name: 'Equipamentos', data: counts }],
      xaxis: { categories: ['A', 'B', 'C', 'D', 'E'] },
      colors: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
      plotOptions: { bar: { borderRadius: 10, distributed: true, columnWidth: '52%' } },
      dataLabels: { enabled: true },
      legend: { show: false },
      grid: { borderColor: '#e5e7eb' },
      yaxis: { title: { text: 'Quantidade' } }
    });
  }

  /**
   * Render idle impact chart
   */
  renderIdleImpactChart(rows) {
    const sortedRows = rows
      .map(r => ({
        ...r,
        idleImpact: r.consumo > 0 && r.distancia > 0 ? (r.distancia / r.consumo) * (r.marchaLenta / 100) : 0
      }))
      .filter(r => r.idleImpact > 0)
      .sort((a, b) => b.idleImpact - a.idleImpact)
      .slice(0, 10)
      .reverse();

    if (sortedRows.length === 0) {
      const target = document.querySelector('#chartIdleImpact');
      if (target) target.innerHTML = '<div class="empty">Sem dados suficientes para estimar impacto de marcha lenta.</div>';
      return;
    }

    this._renderChart('idleImpact', '#chartIdleImpact', {
      chart: { type: 'bar', height: 300, toolbar: { show: false } },
      series: [{ name: 'Litros estimados', data: sortedRows.map(r => Number(r.idleImpact.toFixed(1))) }],
      plotOptions: { bar: { horizontal: true, borderRadius: 8, barHeight: '66%' } },
      colors: ['#8b5cf6'],
      dataLabels: { enabled: true },
      xaxis: { categories: sortedRows.map(r => r.equipamento), title: { text: 'Litros estimados' } },
      grid: { borderColor: '#e5e7eb' },
      tooltip: {
        y: {
          formatter: (_, ctx) => {
            const item = sortedRows[ctx.dataPointIndex];
            return `${formatNumber(item.idleImpact, 1)} L • ${item.motorista} • placa ${item.placa} • ${formatNumber(item.marchaLenta, 1)}%`;
          }
        }
      }
    });
  }

  /**
   * Helper to render or update chart
   */
  _renderChart(key, selector, options) {
    const element = document.querySelector(selector);
    if (!element) return;

    if (this.charts[key]) {
      this.charts[key].destroy();
    }

    this.charts[key] = new ApexCharts(element, options);
    this.charts[key].render();
  }
}

export const chartManager = new ChartManager();
