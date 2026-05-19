function cleanCompany(company) {
  return {
    name: company?.name || '',
    sector: company?.sector || '',
    area: company?.area || '',
    mode: company?.mode || '',
    offers: company?.offers || '',
    needs: company?.needs || '',
    certifications: company?.certifications || '',
    availability: company?.availability || '',
    rules: company?.rules || '',
    match_threshold: company?.match_threshold || 80,
    beta_consent: Boolean(company?.beta_consent)
  };
}

function extractText(response) {
  if (response.output_text) return response.output_text;

  const chunks = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (content.type === 'output_text' && content.text) chunks.push(content.text);
      if (content.type === 'text' && content.text) chunks.push(content.text);
    }
  }
  return chunks.join('\n');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Metodo non consentito.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY non configurata su Vercel.' });
  }

  try {
    const { buyer, seller, manualResult } = req.body || {};
    if (!buyer || !seller) {
      return res.status(400).json({ error: 'Seleziona buyer e seller prima dell analisi AI.' });
    }

    const prompt = {
      buyer: cleanCompany(buyer),
      seller: cleanCompany(seller),
      manual_score: manualResult?.score || null,
      manual_strengths: manualResult?.strengths || [],
      manual_risks: manualResult?.risks || [],
      manual_missing: manualResult?.missing || []
    };

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        instructions: [
          'Sei AgentLink Match Analyst, un agente AI B2B.',
          'Valuta in italiano il match tra due aziende usando solo i dati forniti.',
          'Non inventare certificazioni, prezzi, disponibilita o contatti non presenti.',
          'Rispondi solo con JSON valido, senza markdown.'
        ].join(' '),
        input: `Analizza questo match B2B e restituisci JSON con questi campi:
{
  "score_ai": numero da 0 a 100,
  "sintesi": "massimo 2 frasi",
  "punti_forti": ["massimo 4 elementi"],
  "rischi": ["massimo 4 elementi"],
  "domande_da_fare": ["massimo 4 domande"],
  "prossima_azione": "una singola azione concreta",
  "handoff_umano": true oppure false
}

Dati:
${JSON.stringify(prompt, null, 2)}`
      })
    });

    const data = await openaiResponse.json();
    if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({
        error: data.error?.message || 'Errore nella chiamata OpenAI.'
      });
    }

    const text = extractText(data).trim();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    const jsonText = jsonStart >= 0 && jsonEnd >= 0 ? text.slice(jsonStart, jsonEnd + 1) : text;
    const analysis = JSON.parse(jsonText);

    return res.status(200).json(analysis);
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Errore durante l analisi AI del match.'
    });
  }
};

