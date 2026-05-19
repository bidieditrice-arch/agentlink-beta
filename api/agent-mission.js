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
    const { mission, companies } = req.body || {};
    if (!mission || !String(mission).trim()) {
      return res.status(400).json({ error: 'Scrivi una missione per l agente.' });
    }

    if (!Array.isArray(companies) || !companies.length) {
      return res.status(400).json({ error: 'Nessuna azienda disponibile per la missione.' });
    }

    const cleanCompanies = companies.slice(0, 80).map(cleanCompany);

    const openaiResponse = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        instructions: [
          'Sei AgentLink Mission Agent, un agente AI operativo per il B2B.',
          'Ricevi una missione aziendale e una lista di aziende registrate.',
          'Devi valutare solo i dati forniti: non inventare aziende, certificazioni, stock, prezzi o contatti.',
          'Lavora come un primo filtro: scarta aziende non pertinenti, seleziona opportunita e prepara un report per supervisione umana.',
          'Rispondi solo con JSON valido, senza markdown.'
        ].join(' '),
        input: `Missione dell utente:
${String(mission).trim()}

Aziende registrate:
${JSON.stringify(cleanCompanies, null, 2)}

Restituisci JSON con questa struttura:
{
  "summary": "massimo 2 frasi sul risultato della missione",
  "analyzed_count": numero aziende ricevute,
  "discarded_count": numero aziende scartate,
  "compatible_count": numero aziende compatibili,
  "qualified_count": numero opportunita top,
  "agent_log": [
    "massimo 5 frasi brevi che mostrano il lavoro dell agente"
  ],
  "top_matches": [
    {
      "company_name": "nome esatto azienda dai dati",
      "score": numero da 0 a 100,
      "reason": "perche e compatibile con la missione",
      "strengths": ["massimo 3 punti forti"],
      "risks": ["massimo 3 rischi o dati da verificare"],
      "next_action": "azione concreta per un umano"
    }
  ]
}

Regole:
- top_matches deve contenere massimo 3 aziende.
- Se non ci sono opportunita forti, lascia top_matches vuoto e spiega nel summary.
- analyzed_count deve essere uguale al numero di aziende ricevute.
- discarded_count + compatible_count deve essere uguale ad analyzed_count.`
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
    const report = JSON.parse(jsonText);

    return res.status(200).json(report);
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Errore durante la missione agente.'
    });
  }
};
