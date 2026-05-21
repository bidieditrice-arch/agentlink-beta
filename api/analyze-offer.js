// Endpoint: /api/analyze-offer
// Riceve testo di un'offerta e decide se è una capacità ricorrente o un'offerta singola.
// Usa OpenAI GPT-4o-mini per i casi ambigui non risolti dal parser locale.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { text, localParsed } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Missing text' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Se non c'è la chiave OpenAI, fallback al parser locale
    return res.status(200).json({
      is_recurrent: localParsed?.recurrenceConfidence === 'medium',
      what: localParsed?.what || text,
      when: localParsed?.when || '',
      area: localParsed?.area || '',
      weekday: localParsed?.weekday !== undefined ? localParsed.weekday : null,
      recurrence_label: '',
      source: 'fallback-no-key',
    });
  }

  const systemPrompt = `Sei un'AI che analizza frasi in italiano di imprenditori B2B che descrivono una loro offerta.
Devi decidere se l'offerta è:
- RICORRENTE (capacità fissa che si ripete settimanalmente o regolarmente — es. "ogni venerdì ho 2 squadre pulizie")
- SINGOLA (occasionale, una sola volta — es. "domani ho 3 furgoni liberi", "sabato prossimo ho una squadra")

Rispondi SOLO con JSON valido in questo formato esatto:
{
  "is_recurrent": true|false,
  "what": "cosa offre (max 60 caratteri)",
  "when": "fascia oraria se specificata, altrimenti stringa vuota",
  "area": "zona se specificata, altrimenti stringa vuota",
  "weekday": 0-6 (lun=1, mar=2, ..., dom=0) oppure null,
  "recurrence_label": "etichetta leggibile tipo 'Ogni venerdì' o 'Tutti i giorni feriali' o stringa vuota"
}`;

  const userPrompt = `Analizza questa frase:
"${text}"

${localParsed ? `Il parser locale ha estratto questi dati preliminari (puoi correggerli):
${JSON.stringify(localParsed, null, 2)}` : ''}

Rispondi con il JSON.`;

  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        max_tokens: 250,
        response_format: { type: 'json_object' },
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('OpenAI error:', errText);
      return res.status(200).json({
        is_recurrent: localParsed?.recurrenceConfidence === 'medium',
        what: localParsed?.what || text,
        when: localParsed?.when || '',
        area: localParsed?.area || '',
        weekday: localParsed?.weekday !== undefined ? localParsed.weekday : null,
        recurrence_label: '',
        source: 'fallback-openai-error',
      });
    }

    const data = await r.json();
    const content = data?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      parsed = {};
    }

    return res.status(200).json({
      is_recurrent: Boolean(parsed.is_recurrent),
      what: parsed.what || localParsed?.what || text.slice(0, 60),
      when: parsed.when || '',
      area: parsed.area || '',
      weekday: typeof parsed.weekday === 'number' ? parsed.weekday : null,
      recurrence_label: parsed.recurrence_label || '',
      source: 'openai',
    });
  } catch (err) {
    console.error('analyze-offer error:', err);
    return res.status(200).json({
      is_recurrent: localParsed?.recurrenceConfidence === 'medium',
      what: localParsed?.what || text,
      when: localParsed?.when || '',
      area: localParsed?.area || '',
      weekday: localParsed?.weekday !== undefined ? localParsed.weekday : null,
      recurrence_label: '',
      source: 'fallback-error',
    });
  }
}
