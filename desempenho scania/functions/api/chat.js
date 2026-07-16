/**
 * Cloudflare Pages Function — POST /api/chat
 *
 * Chat de perguntas e respostas para a diretoria, restrito aos dados
 * agregados já calculados no front-end (resumo, oportunidades, rankings).
 * Usa o mesmo binding "AI" (Workers AI) de /api/insights.
 */

const MODEL = '@cf/meta/llama-3.2-3b-instruct';
const MAX_BODY_BYTES = 60_000;
const MAX_HISTORY = 6;
const MAX_QUESTION_LEN = 500;

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

  const { month, filters, summary, opportunities, topDrivers, topEquipment, history, question } = payload || {};

  if (!summary || typeof summary !== 'object') {
    return jsonError('Campo "summary" é obrigatório.', 400);
  }
  if (typeof question !== 'string' || !question.trim()) {
    return jsonError('Campo "question" é obrigatório.', 400);
  }
  if (question.length > MAX_QUESTION_LEN) {
    return jsonError('Pergunta muito longa.', 413);
  }

  const dataContext = {
    mes: month || 'não informado',
    filtros: filters || {},
    resumo: summary,
    oportunidades: Array.isArray(opportunities) ? opportunities.slice(0, 10) : [],
    top_motoristas: Array.isArray(topDrivers) ? topDrivers.slice(0, 10) : [],
    top_equipamentos: Array.isArray(topEquipment) ? topEquipment.slice(0, 10) : []
  };

  const safeHistory = Array.isArray(history)
    ? history
        .slice(-MAX_HISTORY)
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content.slice(0, 800) }))
    : [];

  const messages = [
    {
      role: 'system',
      content: [
        'Você é um analista de frota respondendo perguntas da diretoria de uma transportadora (Ziran Logística e Transporte).',
        'Responda APENAS com base no JSON de dados fornecido a seguir. Nunca invente números, litros, percentuais ou nomes que não estejam no contexto.',
        'Seja direto e decisivo: se os dados fornecidos já respondem a pergunta (mesmo que de forma parcial ou com uma única opção óbvia, como o único item de uma lista), dê a resposta objetivamente, sem excesso de ressalvas.',
        'Quando a pergunta pedir ação ou melhoria, responda com passos concretos e executáveis, citando nomes específicos de "top_motoristas"/"top_equipamentos" quando existirem no contexto — evite recomendações genéricas sem dizer quem/o quê.',
        'Só diga que não é possível responder se os dados realmente não contiverem a informação necessária — nesse caso, diga isso em uma frase e sugira o que precisaria ser consultado.',
        'Responda em português do Brasil, de forma direta e objetiva, adequada para leitura executiva. Evite repetir ressalvas.',
        `Dados do período em análise (JSON): ${JSON.stringify(dataContext)}`
      ].join('\n')
    },
    ...safeHistory,
    { role: 'user', content: question.trim() }
  ];

  try {
    const result = await env.AI.run(MODEL, {
      messages,
      max_tokens: 500,
      temperature: 0.3
    });

    const answer = result?.response || result?.result?.response;
    if (!answer) {
      return jsonError('A IA não retornou uma resposta válida.', 502);
    }

    return new Response(JSON.stringify({ answer }), {
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
