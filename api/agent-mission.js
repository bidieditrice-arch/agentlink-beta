function cleanCompany(company) {
  return {
    id: company?.id || '',
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

function cleanAsset(asset) {
  return {
    company_id: asset?.company_id || '',
    asset_type: asset?.asset_type || '',
    name: asset?.name || '',
    description: asset?.description || '',
    category: asset?.category || '',
    quantity: asset?.quantity || '',
    unit: asset?.unit || '',
    area: asset?.area || '',
    availability: asset?.availability || '',
    certifications: asset?.certifications || '',
    visibility: asset?.visibility || '',
    agent_rules: asset?.agent_rules || '',
    source_filename: asset?.source_filename || ''
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
    const { mission, companies, assets, sourceMode } = req.body || {};
    if (!mission || !String(mission).trim()) {
      return res.status(400).json({ error: 'Scrivi una missione per l agente.' });
    }

    if (!Array.isArray(companies) || !companies.length) {
      return res.status(400).json({ error: 'Nessuna azienda disponibile per la missione.' });
    }

    const cleanCompanies = companies.slice(0, 80).map(cleanCompany);
    const cleanAssets = Array.isArray(assets) ? assets.slice(0, 160).map(cleanAsset) : [];
    const sourceLabel = {
      internal: 'Solo database AgentLink',
      'web-simulated': 'Database AgentLink + fonti web simulate nella demo',
      'company-site': 'Database AgentLink + sito aziendale o cataloghi autorizzati',
      'uploaded-files': 'Database AgentLink + file caricati dall utente'
    }[sourceMode] || 'Solo database AgentLink';

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
          'Ricevi anche asset operativi aziendali: servizi, stock, cataloghi, certificazioni, file o capacita.',
          'Devi valutare solo i dati forniti: non inventare aziende, certificazioni, stock, prezzi o contatti.',
          'Quando esistono asset collegati a una azienda, usali come prova piu forte del semplice testo profilo.',
          'Lavora come un primo filtro: scarta aziende non pertinenti, seleziona opportunita e prepara un report per supervisione umana.',
          'Comportati come un agente operativo: prova prima a lavorare sui dati disponibili, anche se la richiesta e scritta in modo naturale o imperfetto.',
          'Fai domande di chiarimento solo se la missione e impossibile da interpretare o se non contiene nessun obiettivo utile.',
          'Se mancano requisiti non bloccanti, produci comunque risultati con confidenza Media o Bassa e indica i dati da verificare.',
          'Ogni risultato deve avere score, confidenza e motivo della confidenza.',
          'Se la fonte e simulata o non collegata realmente, dichiaralo in modo trasparente.',
          'Rispondi solo con JSON valido, senza markdown.'
        ].join(' '),
        input: `Missione dell utente:
${String(mission).trim()}

Modalita fonti selezionata:
${sourceLabel}

Aziende registrate:
${JSON.stringify(cleanCompanies, null, 2)}

Asset operativi registrati:
${JSON.stringify(cleanAssets, null, 2)}

Restituisci JSON con questa struttura:
{
  "needs_clarification": true oppure false,
  "clarifying_questions": ["massimo 4 domande se servono chiarimenti"],
  "summary": "massimo 2 frasi sul risultato della missione",
  "sources_used": ["fonti consultate o simulate"],
  "confidence_score": numero da 0 a 100,
  "confidence_note": "spiega quanto sono affidabili i risultati e cosa manca per validarli",
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
      "confidence": "Alta, Media o Bassa",
      "confidence_reason": "perche questa valutazione e affidabile o da verificare",
      "reason": "perche e compatibile con la missione",
      "strengths": ["massimo 3 punti forti"],
      "risks": ["massimo 3 rischi o dati da verificare"],
      "next_action": "azione concreta per un umano"
    }
  ]
}

Regole:
- Non bloccare missioni normali solo perche mancano alcuni dettagli: cerca comunque tra le aziende e assegna confidenza corretta.
- Imposta needs_clarification a true solo se la missione e generica al punto da non capire cosa cercare, per esempio "mi aiuti?" o "trova qualcosa di utile".
- Considera trasporto, spedizione, consegna, merce e materiale come settore/servizio valido per missioni logistiche.
- Se la missione indica una tratta, per esempio "da Milano a Roma", considerala area geografica sufficiente per iniziare la ricerca.
- Quando needs_clarification e true, fai domande utili e non forzare top_matches: puoi lasciarlo vuoto.
- top_matches deve contenere massimo 3 aziende.
- Se non ci sono opportunita forti, lascia top_matches vuoto e spiega nel summary.
- analyzed_count deve essere uguale al numero di aziende ricevute.
- discarded_count + compatible_count deve essere uguale ad analyzed_count.
- Se un match usa stock, cataloghi, certificazioni o file, cita questi asset in strengths o confidence_reason.
- Se la modalita include fonti esterne simulate, inserisci "Fonti web simulate nella demo" in sources_used e spiega che la validazione reale richiede API o fonti autorizzate.
- Non dare mai confidenza Alta se mancano certificazioni, disponibilita o area geografica coerente.`
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
