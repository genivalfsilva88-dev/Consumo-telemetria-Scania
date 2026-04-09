# Consumo telemetria Scania

Versão oficial do painel publicada no Cloudflare Pages:

- app: `desempenho scania/`
- branch de produção: `main`
- projeto Cloudflare Pages: `consumo-telemetria-scania`
- root directory no Pages: `desempenho scania`

## Fluxo de atualização

1. Alterar os arquivos em `desempenho scania/`
2. Executar `git add .`
3. Executar `git commit -m "descricao da alteracao"`
4. Executar `git push`

Com o push em `main`, o Cloudflare Pages publica automaticamente.

## Estrutura

- `desempenho scania/index.html`: interface do painel
- `desempenho scania/script.js`: carga da planilha, KPIs e renderização
- `desempenho scania/Logo Ziran.jpg`: logo usada pela interface
