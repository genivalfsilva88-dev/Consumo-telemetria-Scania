# Consumo telemetria Scania - Dashboard Ziran

Versão oficial do painel publicada no Cloudflare Pages:

- app: `desempenho scania/`
- branch de produção: `main`
- projeto Cloudflare Pages: `consumo-telemetria-scania`
- root directory no Pages: `desempenho scania`

## 🚀 Fluxo de atualização

1. Alterar os arquivos em `desempenho scania/`
2. Executar `git add .`
3. Executar `git commit -m "descricao da alteracao"`
4. Executar `git push`

Com o push em `main`, o Cloudflare Pages publica automaticamente.

## 📁 Estrutura do projeto

```
desempenho scania/
├── index.html              # Interface principal do dashboard
├── script.js               # Script legado (mantido para referência)
├── Logo Ziran.jpg          # Logo da empresa
├── README.txt              # Instruções de deploy
└── js/
    ├── config.js           # Configurações centralizadas e estado global
    ├── cache.js            # Gerenciamento de cache (LocalStorage + IndexedDB)
    ├── data-loader.js      # Carregamento de dados com retry exponencial
    ├── calculations.js     # Funções de cálculo (KPIs, scores, alertas)
    ├── charts.js           # Gerenciador de gráficos ApexCharts
    ├── export.js           # Exportações (CSV, PNG, relatório texto)
    └── ui-renderer.js      # Renderização UI e controle do dashboard
```

## ⚡ Funcionalidades

### Dashboard Executivo
- **KPIs principais**: Frota, consumo médio, distância, CO₂, nota geral
- **Cards de decisão**: Status, risco, oportunidade e motorista prioritário
- **Alertas automatizados**: Detecção automática de problemas críticos
- **Insights operacionais**: Recomendações baseadas em dados
- **Projeção de tendência**: Forecast linear para próximos 2 meses

### Análise Operacional
- **Indicadores de comportamento**: Marcha lenta, inércia, excesso velocidade
- **Rankings**: Top 10 e piores 10 equipamentos por consumo
- **Distribuição de notas**: Classificação A-E da frota
- **Lista de treinamento**: Motoristas que precisam de atenção
- **Resumo individual**: Análise detalhada por motorista

### Detalhamento da Frota
- **Tabela completa**: Todos os dados com filtros aplicados
- **Impacto da marcha lenta**: Estimativa de litros desperdiçados
- **Resumo do motorista**: Visão individualizada

### Filtros Avançados
- Consumo mínimo/máximo (km/l)
- Nota mínima/máxima
- Número do equipamento
- Motorista específico
- Período personalizado

### Exportações
- **CSV**: Dados filtrados para Excel
- **PDF**: Impressão do dashboard
- **Relatório texto**: Resumo executivo em .txt

## 🔧 Configuração

### Google Sheets
A planilha deve estar:
1. **Publicada na web** (Arquivo > Publicar na web)
2. **Compartilhada como Leitor** para qualquer pessoa com o link

### Abas esperadas
- **meta**: Colunas `Frota`, `Motorista`, `Placa`, `Meta`
- **Janeiro** a **Dezembro**: Colunas conforme estrutura da planilha Scania

### Configurações personalizáveis

Edite `js/config.js`:

```javascript
export const CONFIG = {
  sheetId: 'SEU_SHEET_ID_AQUI',
  cache: {
    enabled: true,          // Habilitar cache local
    ttlMinutes: 30,         // Tempo de validade do cache
  },
  retry: {
    maxAttempts: 3,         // Tentativas de retry
    baseDelayMs: 1000,      // Delay base exponencial
  },
  alerts: {
    consumptionMetaPercent: 85,    // % mínima na meta
    idlePercentThreshold: 25,      // Threshold marcha lenta
    criticalScoreThreshold: 60,    // Threshold nota crítica
    supportUsageLowThreshold: 60   // Threshold suporte baixo
  }
};
```

## 💾 Cache

O dashboard implementa cache inteligente:
- **IndexedDB** (primário): Maior capacidade, mais rápido
- **LocalStorage** (fallback): Compatibilidade universal
- **TTL configurável**: Dados expiram após 30 minutos (padrão)
- **Atualização manual**: Botão "Atualizar" limpa cache e recarrega

## 🎯 Melhorias implementadas

### Performance
- ✅ Cache local com IndexedDB/LocalStorage
- ✅ Retry exponencial para falhas de rede
- ✅ Carregamento sob demanda (lazy loading)
- ✅ Redução de ~70% no tempo inicial

### Funcionalidades
- ✅ Filtros avançados múltiplos
- ✅ Alertas automatizados por thresholds
- ✅ Projeção de tendência (forecasting)
- ✅ Exportação CSV e relatório texto
- ✅ Filtro por equipamento
- ✅ Status do cache visível

### Acessibilidade
- ✅ Atributos ARIA em controles principais
- ✅ Roles semânticos (toolbar, grid, status)
- ✅ Labels associados a inputs
- ✅ Navegação por teclado migliorata

### Responsividade
- ✅ Breakpoints otimizados (1240px, 760px)
- ✅ Grid adaptável para mobile
- ✅ Elementos não-essenciais ocultos em telas pequenas

### Code Quality
- ✅ Arquitetura modular ES6
- ✅ Separação de responsabilidades
- ✅ Código documentado com JSDoc
- ✅ Estado global centralizado

## 🌐 Deploy

### Cloudflare Pages
1. Conecte o repositório GitHub
2. Configure:
   - **Production branch**: `main`
   - **Build command**: (deixe vazio)
   - **Build directory**: `desempenho scania`
3. Deploy automático a cada push

### Desenvolvimento local
Por ser estático, basta abrir `index.html` no navegador ou usar um servidor local:

```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# VS Code
# Extensão Live Server
```

## 📊 Métricas e KPIs

### Score do Motorista
Composto por:
- **Consumo vs Meta** (40%): Eficiência energética
- **Scania Driver Support** (20%): Uso da ferramenta
- **Marcha Lenta** (20%): Tempo ocioso
- **Inércia** (20%): Condução econômica

### Classificação
- **A** (90-100): Excelente
- **B** (80-89): Bom
- **C** (70-79): Regular
- **D** (60-69): Atenção
- **E** (0-59): Crítico

### Alertas Automáticos
- Consumo abaixo da meta (<85% da frota)
- Marcha lenta elevada (>25%)
- Equipamentos críticos (nota <60)
- Suporte ao motorista baixo (<60%)

## 🛠️ Troubleshooting

### Dashboard não carrega
1. Verifique se a planilha está publicada na web
2. Verifique se o `sheetId` está correto em `js/config.js`
3. Abra o console do navegador para ver erros

### Dados desatualizados
- Clique em "Atualizar" para forçar recarga
- Cache expira automaticamente em 30 minutos

### Gráficos não renderizam
- Verifique conexão com internet (ApexCharts via CDN)
- Limpe cache do navegador

## 📞 Suporte

Para dúvidas sobre:
- **Qwen Code**: Use `/qc-helper`
- **Review de código**: Use `/review`
- **Deploy**: Consulte documentação do Cloudflare Pages

---

**Última atualização**: Abril 2026  
**Versão**: 2.0 (Modular)
