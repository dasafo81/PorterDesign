export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: { message: 'Brak GROQ_API_KEY w zmiennych srodowiskowych Vercel' } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();

    // Konwertuj format Anthropic -> format OpenAI/Groq
    const groqBody = {
      model: body.model || 'llama-3.3-70b-versatile',
      max_tokens: body.max_tokens || 8000,
      messages: [
        ...(body.system ? [{ role: 'system', content: body.system }] : []),
        ...(body.messages || []),
      ],
    };

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(groqBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({ error: { message: data.error?.message || 'Blad Groq API' } }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    // Konwertuj odpowiedz Groq -> format Anthropic (czego spodziewa sie index.html)
    const anthropicResponse = {
      content: [
        {
          type: 'text',
          text: data.choices?.[0]?.message?.content || '',
        },
      ],
    };

    return new Response(JSON.stringify(anthropicResponse), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: { message: err.message } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
