/**
 * Cloudflare Pages Function — POST /api/insights
 *
 * Recebe os KPIs, oportunidades e alertas já calculados no front-end
 * (dados agregados, nunca a base bruta linha a linha) e usa o Workers AI
 * para escrever um resumo executivo em português, priorizado por R$.
 *
 * Requer o binding "AI" (Workers AI) configurado no projeto Cloudflare Pages
 * em Settings > Functions > AI bindings.
 */

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const MAX_BODY_BYTES = 40_000;

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.AI) {
    return jsonError('IA não configurada neste ambiente (binding AI ausente).', 500);
  }

  let payload;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return jsonError('Payload muito grande.', 413);
    }
    payload = JSON.parse(raw);
  } catch {
    return jsonError('JSON inválido.', 400);
  }

  const { month, filters, summary, opportunities, alerts, topDrivers, topEquipment } = payload || {};
  if (!summary || typeof summary !== 'object') {
    return jsonError('Campo "summary" é obrigatório.', 400);
  }

  const dataContext = {
    mes: month || 'não informado',
    filtros: filters || {},
    resumo: summary,
    oportunidades: Array.isArray(opportunities) ? opportunities.slice(0, 10) : [],
    alertas: Array.isArray(alerts) ? alerts.slice(0, 10) : [],
    motoristas_que_mais_precisam_de_atencao: Array.isArray(topDrivers) ? topDrivers.slice(0, 10) : [],
    equipamentos_que_mais_precisam_de_atencao: Array.isArray(topEquipment) ? topEquipment.slice(0, 10) : []
  };

  const messages = [
    {
      role: 'system',
      content: [
        'Você é um analista de frota sênior escrevendo para a diretoria de uma transportadora (Ziran Logística e Transporte). Seu trabalho é transformar os números do JSON em um plano de ação real, não um resumo genérico.',
        'Use APENAS os números, nomes de motoristas e de equipamentos fornecidos no JSON abaixo. Nunca invente valores, litros, percentuais ou nomes que não estejam no contexto.',
        'Sempre que possível, cite nomes específicos de "motoristas_que_mais_precisam_de_atencao" e "equipamentos_que_mais_precisam_de_atencao" nas recomendações, em vez de falar em termos genéricos como "os motoristas com baixo desempenho".',
        'Cada recomendação deve ser uma ação concreta e executável esta semana (quem/o quê fazer), não um lembrete abstrato como "revisar treinamento" sem dizer com quem.',
        'Escreva em português do Brasil, direto ao ponto, tom executivo (sem jargão técnico desnecessário).',
        'Formato da resposta:',
        '1) Um parágrafo curto (3-4 frases) resumindo a situação do período com os números principais.',
        '2) Uma lista de 3 a 5 ações concretas (bullets "- "), ordenadas da maior para a menor oportunidade em R$, cada uma citando nomes/equipamentos do contexto quando existirem e o resultado esperado.',
        'Se não houver oportunidades relevantes no contexto, diga isso claramente e elogie o resultado — não invente problemas.'
      ].join('\n')
    },
    {
      role: 'user',
      content: `Dados do período (JSON):\n${JSON.stringify(dataContext)}`
    }
  ];

  try {
    const result = await env.AI.run(MODEL, {
      messages,
      max_tokens: 900,
      temperature: 0.3
    });

    const text = result?.response || result?.result?.response;
    if (!text) {
      return jsonError('A IA não retornou uma resposta válida.', 502);
    }

    return new Response(JSON.stringify({ text }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return jsonError(`Falha ao consultar a IA: ${err.message || 'erro desconhecido'}`, 502);
  }
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
