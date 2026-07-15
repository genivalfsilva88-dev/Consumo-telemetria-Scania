import { CONFIG, state } from './config.js';
import { formatNumber, formatInt, formatMoney, formatCurrencyInput, currentDieselPrice, currentIdleSavingsTarget, generateAlerts, forecastTrend } from './calculations.js';

/**
 * Export utilities for CSV and PNG
 */
export class ExportManager {
  /**
   * Export filtered data to CSV
   */
  exportToCSV(month, rows) {
    if (!rows || rows.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    const diesel = currentDieselPrice();
    const idleTarget = currentIdleSavingsTarget();

    const headers = [
      'Equipamento',
      'Placa',
      'Motorista',
      'Meta (km/l)',
      'Consumo (km/l)',
      'Distância (km)',
      'Nota',
      'Faixa',
      'Scania Driver Support (%)',
      'Marcha lenta (%)',
      'Inércia (%)',
      'Excesso velocidade (%)',
      'Freadas bruscas (n/100km)',
      'CO₂ (ton)',
      'Litros consumidos',
      'Custo combustível (R$)',
      'Litros desperdiçados',
      'Desperdício (R$)',
      'Litros marcha lenta',
      'Custo marcha lenta (R$)',
      `Economia ML ${idleTarget}% (litros)`,
      `Economia ML ${idleTarget}% (R$)`,
      'Mês'
    ];

    const csvRows = [headers.join(';')];

    rows.forEach(row => {
      const c = this._rowCosts(row, diesel);
      const values = [
        row.equipamento,
        row.placa,
        row.motorista,
        row.meta ? formatNumber(row.meta, 2) : '-',
        formatNumber(row.consumo, 2),
        formatInt(row.distancia),
        formatNumber(row.score, 1),
        row.grade,
        formatNumber(row.supportUsage, 1),
        formatNumber(row.marchaLenta, 1),
        formatNumber(row.inercia, 1),
        formatNumber(row.excessoVelocidade, 1),
        formatNumber(row.freadasBruscas, 2),
        formatNumber(row.co2, 1),
        formatNumber(c.fuelLiters, 1),
        formatNumber(c.fuelCost, 2),
        formatNumber(c.wasteLiters, 1),
        formatNumber(c.wasteCost, 2),
        formatNumber(c.idleLiters, 1),
        formatNumber(c.idleCost, 2),
        formatNumber(c.idleSavings15Liters, 1),
        formatNumber(c.idleSavings15Cost, 2),
        row.mes || month
      ];
      csvRows.push(values.join(';'));
    });

    const csvContent = '\uFEFF' + csvRows.join('\n'); // BOM for Excel
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `ziran_dashboard_${month.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    
    URL.revokeObjectURL(url);
  }

  /**
   * Custos estimados de um equipamento (litros e R$)
   */
  _rowCosts(row, diesel) {
    const fuelLiters = row.consumo > 0 && row.distancia > 0 ? row.distancia / row.consumo : 0;
    const idleLiters = fuelLiters > 0 && row.marchaLenta > 0 ? fuelLiters * (row.marchaLenta / 100) : 0;
    const idleTarget15 = currentIdleSavingsTarget();
    const idleSavings15Liters = row.consumo > 0 && row.distancia > 0 && row.marchaLenta > idleTarget15
      ? (row.distancia / row.consumo) * ((row.marchaLenta - idleTarget15) / 100)
      : 0;
    let wasteLiters = 0;
    if (row.meta > 0 && row.distancia > 0 && row.consumo > 0 && row.consumo < row.meta) {
      wasteLiters = Math.max(0, (row.distancia / row.consumo) - (row.distancia / row.meta));
    }
    return {
      fuelLiters,
      fuelCost: fuelLiters * diesel,
      idleLiters,
      idleCost: idleLiters * diesel,
      idleSavings15Liters,
      idleSavings15Cost: idleSavings15Liters * diesel,
      wasteLiters,
      wasteCost: wasteLiters * diesel
    };
  }

  /**
   * Export chart as PNG
   */
  async exportChartAsPNG(chartElementId, filename) {
    const chartElement = document.querySelector(`#${chartElementId}`);
    if (!chartElement) {
      alert('Gráfico não encontrado');
      return;
    }

    try {
      const svgElement = chartElement.querySelector('svg');
      if (!svgElement) {
        alert('Gráfico ainda não está renderizado');
        return;
      }

      const svgData = new XMLSerializer().serializeToString(svgElement);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      const img = new Image();

      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);

      img.onload = () => {
        canvas.width = img.width * 2; // 2x for better quality
        canvas.height = img.height * 2;
        context.drawImage(img, 0, 0);
        
        canvas.toBlob(blob => {
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = filename || `ziran_chart_${Date.now()}.png`;
          link.click();
          URL.revokeObjectURL(url);
        }, 'image/png');
      };

      img.src = url;
    } catch (error) {
      console.error('Erro ao exportar gráfico:', error);
      alert('Erro ao exportar gráfico');
    }
  }

  /**
   * Export full report as text
   */
  exportReportText(month, summary, alerts) {
    const report = `
RELATÓRIO DE DESEMPENHO - ZIRAN LOGISTICA E TRANSPORTE
=====================================================

Período: ${month}
Data de geração: ${new Date().toLocaleDateString('pt-BR')}

RESUMO EXECUTIVO
----------------
• Frota analisada: ${formatInt(summary.frota)} equipamentos
• Consumo médio: ${formatNumber(summary.consumoMedio, 2)} km/l
• Distância total: ${formatInt(summary.totalKm)} km
• CO₂ total: ${formatNumber(summary.co2Total, 1)} toneladas
• Nota média: ${formatNumber(summary.scoreMedio, 1)} (${summary.grade})

META DE CONSUMO
---------------
• Meta atingida: ${formatNumber(summary.metaHitPct, 1)}% da frota
• Equipamentos na meta: ${formatInt(summary.metaHitCount)} de ${formatInt(summary.validMetaCount)}
• Potencial de economia: ${formatInt(summary.savingsLiters)} litros (R$ ${formatMoney(summary.savingsValue)})

GESTÃO DE CUSTOS (diesel médio R$ ${formatCurrencyInput(summary.dieselPrice)}/l)
---------------
• Custo total de combustível: R$ ${formatMoney(summary.fuelCost)} (${formatInt(summary.fuelLiters)} litros)
• Desperdício abaixo da meta: R$ ${formatMoney(summary.wasteCost)} (${formatInt(summary.wasteLiters)} litros • ${formatNumber(summary.wastePctOfCost, 1)}% do custo)
• Custo em marcha lenta: R$ ${formatMoney(summary.idleCost)} (${formatInt(summary.idleLiters)} litros)
• Economia realizada acima da meta: R$ ${formatMoney(summary.savedCost)} (${formatInt(summary.savedLiters)} litros)
• Economia potencial se marcha lenta caísse para ${summary.idleSavingsTargetPercent}%: R$ ${formatMoney(summary.idleSavingsCost15)} (${formatInt(summary.idleSavingsLiters15)} litros)

INDICADORES DE COMPORTAMENTO
----------------------------
• Marcha lenta média: ${formatNumber(summary.marchaLenta, 1)}%
• Inércia média: ${formatNumber(summary.inercia, 1)}%
• Excesso de velocidade: ${formatNumber(summary.excessoVelocidade, 1)}%
• Scania Driver Support: ${formatNumber(summary.supportUsageMedio, 1)}%

ALERTAS
-------
${alerts.length > 0 ? alerts.map(a => `• [${a.severity.toUpperCase()}] ${a.message}\n  Ação: ${a.action}`).join('\n') : 'Nenhum alerta crítico'}

RECOMENDAÇÕES
-------------
${this._generateRecommendations(summary, alerts)}

=====================================================
Relatório gerado automaticamente pelo Painel de Desempenho Ziran
    `.trim();

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ziran_relatorio_${month.replace(/\s/g, '_')}_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  _generateRecommendations(summary, alerts) {
    const recommendations = [];

    if (summary.metaHitPct < 70) {
      recommendations.push('1. Priorizar treinamento de motoristas abaixo da meta de consumo');
    }

    if (summary.marchaLenta > 25) {
      recommendations.push('2. Investigar e reduzir marcha lenta nos equipamentos críticos');
    }

    if (summary.supportUsageMedio < 60) {
      recommendations.push('3. Incentivar uso do Scania Driver Support para melhorar desempenho');
    }

    if (summary.criticalCount > 0) {
      recommendations.push(`4. Ação imediata para ${formatInt(summary.criticalCount)} equipamento(s) crítico(s)`);
    }

    if (summary.savingsLiters > 100) {
      recommendations.push(`5. Potencial de economia de ${formatInt(summary.savingsLiters)} litros deve ser priorizado`);
    }

    if (recommendations.length === 0) {
      recommendations.push('Manter acompanhamento atual e continuar monitorando indicadores');
    }

    return recommendations.join('\n');
  }
}

export const exportManager = new ExportManager();
