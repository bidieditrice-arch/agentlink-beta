// Endpoint: /api/match-intro
// Riceve i dati di un match accettato e genera il primo messaggio di intro tra i due agenti.
// Usa OpenAI GPT-4o-mini per scrivere un messaggio professionale in italiano.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    from_company_name,
    to_company_name,
    mission_text,
    match_what,
    match_area,
    match_when,
  } = req.body || {};

  if (!from_company_name || !to_company_name || !match_what) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback: messaggio statico se manca OpenAI
    const fallback = `Buongiorno, sono l'agente di ${to_company_name}. Ho ricevuto la richiesta di ${from_company_name} per "${match_what}"${match_area ? ' in ' + match_area : ''}${match_when ? ' (' + match_when + ')' : ''}. Confermo la disponibilità e attendo dettagli operativi.`;
    return res.status(200).json({
      message: fallback,
      source: 'fallback-no-key',
    });
  }

  const systemPrompt = `Sei un'AI che scrive il primo messaggio di una conversazione professionale B2B in italiano.

Stai scrivendo per conto dell'azienda destinataria ("${to_company_name}") che ha ricevuto una richiesta di match da ${from_company_name}.

Scrivi UN SOLO messaggio breve (3-4 righe massimo) che:
- Saluti professionalmente
- Conferma di aver capito la richiesta
- Conferma la disponibilità (o chiede chiarimenti se ci sono lacune)
- Propone un prossimo passo concreto (es. condividere preventivo, fissare chiamata, mandare dettagli)

Tono: professionale, diretto, italiano da imprenditore B2B. NIENTE forme troppo cerimoniose tipo "Egregio". Tono familiare ma professionale.`;

  const userPrompt = `Dati del match:
- Buyer (cerca): ${from_company_name}
- Seller (sei tu): ${to_company_name}
- Cosa cerca buyer: ${match_what}
- Area: ${match_area || 'non specificata'}
- Quando: ${match_when || 'non specificato'}
- Testo originale missione del buyer: "${mission_text || ''}"

Scrivi il messaggio di intro che parte dal seller verso il buyer.`;

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
        temperature: 0.4,
        max_tokens: 250,
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('OpenAI error:', errText);
      const fallback = `Buongiorno, sono l'agente di ${to_company_name}. Ho ricevuto la richiesta di ${from_company_name} per "${match_what}"${match_area ? ' in ' + match_area : ''}. Confermo la disponibilità e attendo dettagli operativi.`;
      return res.status(200).json({
        message: fallback,
        source: 'fallback-openai-error',
      });
    }

    const data = await r.json();
    const message = data?.choices?.[0]?.message?.content?.trim() || '';

    return res.status(200).json({
      message: message,
      source: 'openai',
    });
  } catch (err) {
    console.error('match-intro error:', err);
    const fallback = `Buongiorno, sono l'agente di ${to_company_name}. Ho ricevuto la richiesta di ${from_company_name} per "${match_what}". Confermo la disponibilità e attendo dettagli.`;
    return res.status(200).json({
      message: fallback,
      source: 'fallback-error',
    });
  }
}
