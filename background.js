chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_CHAT_PANEL" }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "CHAT_SEND") {
    handleChatSend(msg.apiKey, msg.model, msg.systemPrompt, msg.messages)
      .then((result) => sendResponse(result))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true; // respuesta asíncrona
  }
});

async function handleChatSend(apiKey, model, systemPrompt, messages) {
  if (!apiKey) {
    return { ok: false, error: "Falta configurar tu API key de Gemini (icono ⚙)." };
  }
  const modelId = model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:generateContent`;

  // Gemini usa roles "user" y "model" (no "assistant"), y el system prompt va aparte.
  const contents = messages
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }]
    }));

  const body = { contents };
  if (systemPrompt) {
    body.system_instruction = { parts: [{ text: systemPrompt }] };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errJson = await response.json();
        detail = errJson.error && errJson.error.message ? errJson.error.message : JSON.stringify(errJson);
      } catch (e) {
        detail = await response.text();
      }
      return { ok: false, error: `Error ${response.status}: ${detail}` };
    }

    const data = await response.json();

    if (data.promptFeedback && data.promptFeedback.blockReason) {
      return { ok: false, error: `Gemini bloqueó la respuesta (${data.promptFeedback.blockReason}).` };
    }

    const candidate = data.candidates && data.candidates[0];
    const text = candidate && candidate.content && candidate.content.parts
      ? candidate.content.parts.map(p => p.text || "").join("")
      : "(sin respuesta)";
    return { ok: true, text };
  } catch (err) {
    return { ok: false, error: "No se pudo conectar con la API: " + (err.message || err) };
  }
}
