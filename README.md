# Consumo Telemetria Scania - Dashboard Ziran

Painel estatico para analise de consumo, desempenho de condução e acompanhamento operacional da frota Scania.

## Publicacao

- Aplicacao oficial: `desempenho scania/`
- Branch de producao: `main`
- Cloudflare Pages: `consumo-telemetria-scania`
- Root directory no Pages: `desempenho scania`
- Build command: vazio
- Build output directory: `.`

O Cloudflare Pages esta conectado ao GitHub. Todo `git push` em `main` dispara um novo deploy automaticamente.

## Fluxo de atualizacao

```powershell
git add .
git commit -m "descricao da alteracao"
git push
```

## Estrutura

```text
desempenho scania/
|-- index.html
|-- Logo Ziran.jpg
|-- functions/
|   `-- api/
|       |-- insights.js
|       `-- chat.js
`-- js/
    |-- ai-insights.js
    |-- cache.js
    |-- calculations.js
    |-- charts.js
    |-- config.js
    |-- data-loader.js
    |-- export.js
    `-- ui-renderer.js
```

## Principais analises

- Dashboard executivo com KPIs de frota, consumo medio, distancia media, total km rodado, CO2, nota media e leitura de risco.
- Cards de decisao para status da frota, principal pressao operacional, oportunidade financeira e motorista prioritario.
- Analise operacional com marcha lenta, inercia, excesso de velocidade e Scania Driver Support (%).
- Ranking de melhores e piores consumos por equipamento.
- Distribuicao A-E da frota.
- Detalhamento da frota com tabela, resumo do motorista filtrado e impacto estimado da marcha lenta.
- Exportacoes CSV, PDF por impressao e relatorio texto.

## Nota do motorista

A nota composta e uma media ponderada (pesos em `config.js > scoring.weights`):

- consumo real vs meta (50%)
- Scania Driver Support (%) (20%)
- marcha lenta, meta operacional de 20% (20%)
- inercia, normalizada contra a meta de 12% (10%)

Quando algum componente nao se aplica (ex.: equipamento sem meta), os pesos sao renormalizados entre os componentes disponiveis. Excesso de velocidade nao entra na nota, mas continua no painel como indicador de risco operacional e seguranca.

Equipamento sem meta cadastrada tem sua nota calculada só com suporte/marcha lenta/inércia — o painel marca isso com `†` na tabela e no ranking, pois essa nota não reflete consumo real.

## Qualidade de dado e metodologia (leia antes de decidir)

- **Atividade mínima**: equipamento com menos de `CONFIG.alerts.minActivityKm` (30 km) rodados no mês fica de fora de médias, rankings, alertas críticos e oportunidades — evita que um caminhão parado (sensor com falha, fora de operação) apareça como "pior desempenho". Fica marcado com `⚠` na tabela e contado no rodapé do card "Frota analisada".
- **Ranking por % da meta, não por km/l bruto**: como cada equipamento tem sua própria meta (rota/carga variam), o ranking de melhores/piores compara `consumo ÷ meta`, não o valor absoluto — assim um equipamento de rota difícil não aparece como "pior" só por ter meta mais dura.
- **Custo de marcha lenta é uma estimativa aproximada**: a planilha só informa marcha lenta como % do *tempo* de motor ligado, não litros por hora parado. O painel assume que a taxa de queima parado é `CONFIG.alerts.idleFuelRateFactor` (35%) da taxa média de consumo rodando — ajuste esse fator se houver dado real de consumo/hora parado do fabricante. Os valores de marcha lenta em R$/litros no painel e na IA são sempre rotulados como estimativa.
- **Economia líquida do período** (`summary.netSavingsCost` = economia realizada − desperdício) é o número de fechamento: quanto a operação ganhou ou perdeu, em R$, comparado ao cenário em que toda a frota rodasse exatamente na meta. Ele **não soma o custo de marcha lenta** — o consumo (km/l) reportado já embute o efeito da marcha lenta (mais tempo parado ⇒ pior km/l ⇒ mais desperdício), então somar os dois de novo duplicaria a perda. O custo de marcha lenta no painel é só um diagnóstico de *por que* a frota está desperdiçando, não uma perda adicional.

## Gestao de custos

O painel estima valores em R$ a partir do diesel medio informado na barra de controles (`Diesel medio (R$/L)`):

- Custo total de combustivel do periodo
- Desperdicio por consumo abaixo da meta (economia potencial)
- Custo do combustivel em marcha lenta
- Economia ja realizada pelos equipamentos acima da meta

Esses valores tambem saem no CSV (colunas por equipamento) e no relatorio texto.

## Oportunidades & IA

A aba "Oportunidades & IA" ranqueia por impacto em R$ todas as oportunidades de redução de custo já calculadas no painel (consumo abaixo da meta, marcha lenta acima do alvo, baixo uso do Scania Driver Support, excesso de velocidade e equipamentos críticos) — essa lista é 100% determinística e não depende de IA.

Além disso, a aba oferece:

- **Análise executiva (IA)**: um resumo em português gerado sob demanda (botão "Gerar análise"), que só interpreta/prioriza os números já calculados — nunca inventa valores.
- **Chat com IA**: perguntas livres da diretoria sobre o período e filtro em análise, respondidas com base nos mesmos dados agregados.

### Como funciona

- `functions/api/insights.js` e `functions/api/chat.js` são **Cloudflare Pages Functions** (detectadas automaticamente pela pasta `functions/`, sem passo de build) que chamam o **Workers AI** da Cloudflare via o binding `AI`.
- Nenhuma chave de API fica no código: o binding usa a própria conta Cloudflare que já hospeda o site, dentro da cota diária gratuita do Workers AI.
- Só dados agregados (KPIs, oportunidades, rankings top-10) são enviados à IA — nunca a planilha bruta.
- A análise executiva é cacheada no navegador (`sessionStorage`) por mês/filtro para não gerar chamadas repetidas à toa.

### Configuração obrigatória (uma vez, no dashboard da Cloudflare)

1. No dashboard da Cloudflare, abrir **Workers & Pages** (menu lateral) → clicar no projeto `consumo-telemetria-scania` → aba **Settings**.
2. Selecionar o ambiente (**Production**, e depois repetir para **Preview**) → seção **Bindings** → **Add** → escolher **Workers AI**.
3. Em **Variable name**, digitar exatamente `AI` (é esse nome que o código em `functions/api/*.js` espera via `context.env.AI`).
4. Salvar e fazer um novo deploy (`git push`) para o binding entrar em vigor.
5. Sem esse binding, `/api/insights` e `/api/chat` respondem com erro explicando que a IA não está configurada — o restante do painel continua funcionando normalmente.

> A Cloudflare já reorganizou essa tela mais de uma vez — se os nomes exatos ("Settings", "Bindings", "Add") não baterem com o que você vê, procure por uma seção que liste tipos de vínculo/recurso (KV, R2, D1, Workers AI...) dentro das configurações do projeto; é ali que a opção "Workers AI" deve aparecer.

### Teste local

```powershell
npx wrangler@latest pages dev "desempenho scania" --ai=AI
```

`npx serve "desempenho scania"` continua útil para validar o restante do painel, mas não executa as Functions (sem IA nesse modo).

## Dados

O painel le dados de uma planilha Google Sheets publicada via JSONP. O `sheetId`, os meses e os limites de alerta ficam em `desempenho scania/js/config.js`.

Abas esperadas:

- `meta`: colunas `Frota`, `Motorista`, `Placa`, `Meta`
- `Janeiro` a `Dezembro`: colunas da base Scania usadas pelo dashboard

## Validacao local

Como o projeto usa ES modules, prefira abrir por um servidor local ou pela URL publicada no Cloudflare. Evite abrir o `index.html` direto via `file://`.

Exemplo:

```powershell
npx serve "desempenho scania"
```
