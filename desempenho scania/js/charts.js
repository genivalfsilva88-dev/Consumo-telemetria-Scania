import { CONFIG, state } from './config.js';
import { formatNumber, formatInt, formatMoney, pillColor, gradeClass } from './calculations.js';

/**
 * Chart manager for ApexCharts
 */
export class ChartManager {
  constructor() {
    this.charts = {};
  }

  _withBaseOptions(options) {
    const base = {
      chart: {
        fontFamily: 'Manrope, "Segoe UI", sans-serif',
        foreColor: '#5b7190',
        animations: { easing: 'easeinout', speed: 260 }
      },
      legend: {
        position: 'top',
        horizontalAlign: 'left',
        fontSize: '11px',
        fontWeight: 600,
        labels: { colors: '#5b7190' },
        itemMargin: { horizontal: 10, vertical: 4 }
      },
      dataLabels: {
        style: { fontSize: '10px', fontWeight: 600 },
        background: { enabled: false }
      },
      grid: {
        borderColor: 'rgba(148, 163, 184, .18)',
        strokeDashArray: 4,
        padding: { left: 4, right: 8 }
      },
      tooltip: {
        theme: 'light',
        style: { fontSize: '12px' }
      },
      xaxis: {
        labels: { style: { fontSize: '11px', colors: '#5b7190' } },
        axisBorder: { show: false },
        axisTicks: { show: false }
      },
      yaxis: {
        labels: { style: { fontSize: '11px', colors: '#5b7190' } }
      },
      states: {
        hover: { filter: { type: 'lighten', value: 0.03 } },
        active: { filter: { type: 'none' } }
      }
    };

    const baseYaxis = base.yaxis;
    const mergedYaxis = Array.isArray(options.yaxis)
      ? options.yaxis.map(axis => ({
          ...baseYaxis,
          ...axis,
          labels: {
            ...baseYaxis.labels,
            ...axis.labels,
            style: {
              ...baseYaxis.labels.style,
              ...(axis.labels?.style || {})
            }
          }
        }))
      : {
          ...baseYaxis,
          ...(options.yaxis || {}),
          labels: {
            ...baseYaxis.labels,
            ...(options.yaxis?.labels || {}),
            style: {
              ...baseYaxis.labels.style,
              ...(options.yaxis?.labels?.style || {})
            }
          }
        };

    return {
      ...base,
      ...options,
      chart: {
        ...base.chart,
        ...(options.chart || {})
      },
      legend: {
        ...base.legend,
        ...(options.legend || {}),
        labels: {
          ...base.legend.labels,
          ...(options.legend?.labels || {})
        },
        itemMargin: {
          ...base.legend.itemMargin,
          ...(options.legend?.itemMargin || {})
        }
      },
      dataLabels: {
        ...base.dataLabels,
        ...(options.dataLabels || {}),
        style: {
          ...base.dataLabels.style,
          ...(options.dataLabels?.style || {})
        },
        background: {
          ...base.dataLabels.background,
          ...(options.dataLabels?.background || {})
        }
      },
      grid: {
        ...base.grid,
        ...(options.grid || {}),
        padding: {
          ...base.grid.padding,
          ...(options.grid?.padding || {})
        }
      },
      tooltip: {
        ...base.tooltip,
        ...(options.tooltip || {}),
        style: {
          ...base.tooltip.style,
          ...(options.tooltip?.style || {})
        }
      },
      xaxis: {
        ...base.xaxis,
        ...(options.xaxis || {}),
        labels: {
          ...base.xaxis.labels,
          ...(options.xaxis?.labels || {}),
          style: {
            ...base.xaxis.labels.style,
            ...(options.xaxis?.labels?.style || {})
          }
        },
        axisBorder: {
          ...base.xaxis.axisBorder,
          ...(options.xaxis?.axisBorder || {})
        },
        axisTicks: {
          ...base.xaxis.axisTicks,
          ...(options.xaxis?.axisTicks || {})
        }
      },
      yaxis: mergedYaxis
    };
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
   * Render score gauge (radial)
   */
  renderScoreGauge(score, grade) {
    const value = Math.max(0, Math.min(100, Number(score) || 0));
    const colorByGrade = { A: '#16a34a', B: '#65a30d', C: '#ca8a04', D: '#ea580c', E: '#dc2626' };
    const color = colorByGrade[grade] || '#2563eb';

    const options = {
      chart: { type: 'radialBar', height: 172, sparkline: { enabled: true } },
      series: [value],
      colors: [color],
      plotOptions: {
        radialBar: {
          startAngle: -135,
          endAngle: 135,
          hollow: { size: '60%' },
          track: { background: '#e9edf5', strokeWidth: '100%' },
          dataLabels: {
            name: { show: true, offsetY: 20, fontSize: '12px', color: '#5b7190', fontWeight: 700 },
            value: {
              show: true,
              offsetY: -8,
              fontSize: '30px',
              fontWeight: 800,
              color: '#0f172a',
              formatter: () => formatNumber(value, 1)
            }
          }
        }
      },
      fill: { type: 'gradient', gradient: { shade: 'light', shadeIntensity: 0.35, gradientToColors: [color], stops: [0, 100] } },
      labels: [`Nota ${grade || '-'}`],
      stroke: { lineCap: 'round' },
      legend: { show: false },
      tooltip: { enabled: false }
    };

    this._renderChart('scoreGauge', '#scoreGauge', options);
  }

  /**
   * Render trend chart
   */
  renderTrendChart(data) {
    if (!data || data.length === 0) {
      console.warn('No data for trend chart');
      return;
    }

    const filteredData = data.filter(item => item && item.frota > 0);

    if (filteredData.length === 0) {
      console.warn('No valid data points for trend chart');
      const element = document.querySelector('#chartTrend');
      if (element) {
        element.innerHTML = '<div class="empty">Sem dados para exibir o grafico de tendencia</div>';
      }
      return;
    }

    const options = {
      chart: {
        type: 'line',
        height: 296,
        toolbar: { show: false },
        zoom: { enabled: false }
      },
      series: [
        {
          name: 'Consumo medio',
          data: filteredData.map(x => Number((x.consumo || 0).toFixed(2)))
        },
        {
          name: 'Meta media',
          data: filteredData.map(x => Number(((x.meta || 0)).toFixed(2)))
        },
        {
          name: 'Nota media',
          data: filteredData.map(x => Number((x.score || 0).toFixed(1)))
        }
      ],
      stroke: { curve: 'smooth', width: [3, 2, 2.5], dashArray: [0, 6, 0] },
      colors: ['#2563eb', '#16a34a', '#d71920'],
      xaxis: { categories: filteredData.map(x => (x.month || '').slice(0, 3)) },
      yaxis: [
        { seriesName: 'Consumo medio', title: { text: 'km/l', style: { fontSize: '11px', fontWeight: 600 } } },
        { seriesName: 'Meta media', show: false },
        { seriesName: 'Nota media', opposite: true, min: 0, max: 100, title: { text: 'Nota', style: { fontSize: '11px', fontWeight: 600 } } }
      ],
      dataLabels: { enabled: false },
      legend: { position: 'top' },
      tooltip: { shared: true }
    };

    this._renderChart('trend', '#chartTrend', options);
  }

  /**
   * Render ranking chart
   */
  renderRankingChart(month, bestRows, worstRows) {
    const commonOpts = {
      chart: { type: 'bar', height: 244, toolbar: { show: false } },
      colors: ['#38bdf8'],
      plotOptions: { bar: { horizontal: true, borderRadius: 7, barHeight: '64%' } },
      dataLabels: { enabled: false },
      legend: { show: false }
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
          return `<div style="padding:10px 12px;min-width:210px"><strong>Equip. #${row.equipamento}</strong><br><span style="color:#475569">${row.motorista || '-'} - ${row.placa || '-'}</span><br><span style="color:#0f172a">Consumo: <strong>${formatNumber(row.consumo, 2)} km/l</strong></span></div>`;
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
          return `<div style="padding:10px 12px;min-width:210px"><strong>Equip. #${row.equipamento}</strong><br><span style="color:#475569">${row.motorista || '-'} - ${row.placa || '-'}</span><br><span style="color:#0f172a">Consumo: <strong>${formatNumber(row.consumo, 2)} km/l</strong></span></div>`;
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
      chart: { type: 'bar', height: 226, toolbar: { show: false } },
      series: [{ name: 'Equipamentos', data: counts }],
      xaxis: { categories: ['A', 'B', 'C', 'D', 'E'] },
      colors: ['#22c55e', '#84cc16', '#eab308', '#f97316', '#ef4444'],
      plotOptions: { bar: { borderRadius: 8, distributed: true, columnWidth: '48%' } },
      dataLabels: { enabled: true, offsetY: -4 },
      legend: { show: false },
      yaxis: { title: { text: 'Quantidade', style: { fontSize: '11px', fontWeight: 600 } } }
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
      chart: { type: 'bar', height: 276, toolbar: { show: false } },
      series: [{ name: 'Litros estimados', data: sortedRows.map(r => Number(r.idleImpact.toFixed(1))) }],
      plotOptions: { bar: { horizontal: true, borderRadius: 7, barHeight: '60%' } },
      colors: ['#8b5cf6'],
      dataLabels: { enabled: false },
      xaxis: { categories: sortedRows.map(r => r.equipamento), title: { text: 'Litros estimados', style: { fontSize: '11px', fontWeight: 600 } } },
      legend: { show: false },
      tooltip: {
        y: {
          formatter: (_, ctx) => {
            const item = sortedRows[ctx.dataPointIndex];
            return `${formatNumber(item.idleImpact, 1)} L - ${item.motorista} - placa ${item.placa} - ${formatNumber(item.marchaLenta, 1)}%`;
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

    this.charts[key] = new ApexCharts(element, this._withBaseOptions(options));
    this.charts[key].render();
  }
}

export const chartManager = new ChartManager();
