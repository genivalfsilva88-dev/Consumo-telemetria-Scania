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
`-- js/
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

A nota composta considera:

- consumo real vs meta
- Scania Driver Support (%)
- marcha lenta, com meta operacional de 20%
- inercia

Excesso de velocidade nao entra na nota, mas continua no painel como indicador de risco operacional e seguranca.

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
