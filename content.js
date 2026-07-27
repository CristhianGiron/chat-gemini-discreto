(() => {
  const DATA_KEY = "chatGeminiDiscretoData";
  const SETTINGS_KEY = "chatGeminiDiscretoSettings";
  const MAX_CONTEXT_MESSAGES = 20;

  const defaultData = {
    messages: [], // { role: 'user'|'assistant'|'error', content, ts }
    panelOpen: false,
    panelPos: { top: 90, left: null }
  };
  const defaultSettings = {
    apiKey: "",
    model: "gemini-2.5-flash",
    systemPrompt: "Eres un asistente útil, claro y conciso."
  };

  let data = null;
  let settings = null;
  let host, shadow, root;
  let dragging = false, dragOffsetX = 0, dragOffsetY = 0;
  let settingsOpen = false;
  let sending = false;

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function loadAll(cb) {
    chrome.storage.local.get([DATA_KEY, SETTINGS_KEY], (res) => {
      data = res[DATA_KEY] || JSON.parse(JSON.stringify(defaultData));
      settings = Object.assign({}, defaultSettings, res[SETTINGS_KEY] || {});
      cb();
    });
  }

  function saveData() {
    chrome.storage.local.set({ [DATA_KEY]: data });
  }
  function saveSettings() {
    chrome.storage.local.set({ [SETTINGS_KEY]: settings });
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[DATA_KEY] && !sending) {
      data = changes[DATA_KEY].newValue || data;
      if (shadow) renderMessages();
    }
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "TOGGLE_CHAT_PANEL") {
      data.panelOpen = !data.panelOpen;
      saveData();
      applyPanelVisibility();
    }
  });

  function buildHost() {
    host = document.createElement("div");
    host.id = "chat-gemini-discreto-host";
    host.style.all = "initial";
    document.documentElement.appendChild(host);
    shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
      .panel {
        position: fixed;
        width: 300px;
        height: 400px;
        max-height: 400px;
        background: #ffffff;
        color: #4a4a4a;
        border-radius: 4px;
       
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      
        font-size: 13px;
        opacity: 0.05;
        transition: opacity 0.15s ease;
      }
      .panel:hover, .panel:focus-within { opacity: 1; }
      .header {
        background: #f4f6f8;
        padding: 8px 10px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: move;
        user-select: none;
        border-bottom: 1px solid #dcdfe3;
        flex-shrink: 0;
      }
      .header .title { font-weight: 600; font-size: 12.5px; color: #4a5a4f; }
      .header .actions { display: flex; gap: 4px; }
      .icon-btn {
        background: transparent;
        border: none;
        color: #8a8f94;
        cursor: pointer;
        font-size: 14px;
        line-height: 1;
        padding: 2px 5px;
        border-radius: 4px;
      }
      .icon-btn:hover { background: #e6e9ec; color: #4a4a4a; }
      .body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
      .settings-panel {
        padding: 10px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        background: #f9fafb;
        border-bottom: 1px solid #e3e6e9;
        flex-shrink: 0;
      }
      .settings-panel label { font-size: 11px; color: #6b6f73; font-weight: 600; }
      .settings-panel input, .settings-panel textarea {
        background: #ffffff;
        border: 1px solid #cdd2d6;
        color: #4a4a4a;
        border-radius: 3px;
        padding: 5px 7px;
        font-size: 12px;
        width: 100%;
        font-family: inherit;
      }
      .settings-panel textarea { resize: none; min-height: 40px; }
      .settings-row-actions { display: flex; justify-content: flex-end; gap: 6px; }
      .settings-row-actions button {
        background: #cdd2d6;
        border: none;
        color: #fff;
        border-radius: 3px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
      }
      .settings-row-actions button:hover { background: #cdd2d6; }
      .settings-hint { font-size: 10.5px; color: #9aa0a6; line-height: 1.3; }
      .messages {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 7px;
        background: #f9fafb;
      }
      .msg { max-width: 85%; padding: 6px 9px; border-radius: 8px; font-size: 12.5px; line-height: 1.4; white-space: pre-wrap; word-break: break-word; }
      .msg.user { align-self: flex-end; background: #cdd2d6; color: #ffffff; border-bottom-right-radius: 2px; }
      .msg.assistant { align-self: flex-start; background: #ffffff; color: #4a4a4a; border: 1px solid #e3e6e9; border-bottom-left-radius: 2px; }
      .msg.error { align-self: center; background: #fdecea; color: #9b2c2c; border: 1px solid #f5c6c0; font-size: 11.5px; text-align: center; }
      .msg.thinking { align-self: flex-start; background: #ffffff; color: #9aa0a6; border: 1px solid #e3e6e9; font-style: italic; }
      .empty-msg {
        color: #9aa0a6;
        font-size: 12px;
        text-align: center;
        margin-top: 20px;
        padding: 0 14px;
        line-height: 1.4;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      }
      .empty-logo-img {
        width: 108px;
        height: 108px;
        object-fit: contain;
        border-radius: 50%;
        box-shadow: 0 4px 10px rgba(46, 125, 50, 0.18);
        background: #ffffff;
        padding: 4px;
      }
      .compose { display: flex; gap: 6px; padding: 8px; border-top: 1px solid #dcdfe3; background: #f4f6f8; flex-shrink: 0; }
      .compose textarea {
        flex: 1; resize: none; background: #ffffff; border: 1px solid #cdd2d6; color: #4a4a4a;
        border-radius: 4px; padding: 6px 7px; font-size: 12.5px; min-height: 34px; max-height: 80px; font-family: inherit;
      }
      .compose button {
        background: #cdd2d6; border: none; color: #4a4a4a; border-radius: 4px; padding: 0 12px;
        font-size: 12px; font-weight: 600; cursor: pointer;
      }
      .compose button:hover { background: #cdd2d6; color:#4a4a4a; }
      .compose button:disabled { background: #a9c8ab; cursor: default; }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-thumb { background: #cdd2d6; border-radius: 3px; }
      .footer {
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 9px;
        color: #7d8792;
        text-align: center;
        padding: 6px 10px;
        flex-shrink: 0;
        letter-spacing: 0.2px;
      }
      .footer .brand {
        
        color: #4a5a4f;
        letter-spacing: 0.25px;
      }
    `;
    shadow.appendChild(style);
    root = document.createElement("div");
    shadow.appendChild(root);
  }

  function applyPanelVisibility() {
    root.style.display = data.panelOpen ? "flex" : "none";
  }

  function renderMessages() {
    const messagesEl = shadow.querySelector(".messages");
    if (!messagesEl) return;
    messagesEl.innerHTML = "";
    if (data.messages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-msg";

      const logo = document.createElement("img");
      logo.className = "empty-logo-img";
      logo.src = chrome.runtime.getURL("icons/icon128.png");
      logo.alt = "Logo";
      logo.onerror = () => {
        logo.src = chrome.runtime.getURL("icons/icon48.png");
      };

      const text = document.createElement("div");
      text.textContent = settings.apiKey
        ? "Escribe abajo para empezar a chatear."
        : "Configura tu API key de Gemini (⚙) para empezar.";

      empty.appendChild(logo);
      empty.appendChild(text);
      messagesEl.appendChild(empty);
      return;
    }
    data.messages.forEach(m => {
      const bubble = document.createElement("div");
      bubble.className = "msg " + m.role;
      bubble.textContent = m.content;
      messagesEl.appendChild(bubble);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderAll() {
    root.innerHTML = "";
    const panel = document.createElement("div");
    panel.className = "panel";
    if (data.panelPos.left != null) {
      panel.style.left = data.panelPos.left + "px";
      panel.style.top = data.panelPos.top + "px";
    } else {
      panel.style.right = "18px";
      panel.style.top = data.panelPos.top + "px";
    }

    // Header
    const header = document.createElement("div");
    header.className = "header";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "Chat-AI";
    const actions = document.createElement("div");
    actions.className = "actions";
    const gearBtn = document.createElement("button");
    gearBtn.className = "icon-btn";
    gearBtn.textContent = "⚙";
    gearBtn.title = "Configuración";
    gearBtn.addEventListener("click", () => {
      settingsOpen = !settingsOpen;
      renderAll();
    });
    const clearBtn = document.createElement("button");
    clearBtn.className = "icon-btn";
    clearBtn.textContent = "🗑";
    clearBtn.title = "Borrar conversación";
    clearBtn.addEventListener("click", () => {
      const shouldClear = window.confirm("¿Seguro que quieres borrar toda la conversación?");
      if (!shouldClear) return;
      data.messages = [];
      saveData();
      renderMessages();
    });
    const closeBtn = document.createElement("button");
    closeBtn.className = "icon-btn";
    closeBtn.textContent = "✕";
    closeBtn.title = "Cerrar";
    closeBtn.addEventListener("click", () => {
      data.panelOpen = false;
      saveData();
      applyPanelVisibility();
    });
    actions.appendChild(gearBtn);
    actions.appendChild(clearBtn);
    actions.appendChild(closeBtn);
    header.appendChild(title);
    header.appendChild(actions);
    panel.appendChild(header);

    header.addEventListener("mousedown", (e) => {
      dragging = true;
      const rect = panel.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      e.preventDefault();
    });

    const body = document.createElement("div");
    body.className = "body";

    if (settingsOpen) {
      const settingsPanel = document.createElement("div");
      settingsPanel.className = "settings-panel";

      const keyLabel = document.createElement("label");
      keyLabel.textContent = "API key de Gemini (Google AI Studio)";
      const keyInput = document.createElement("input");
      keyInput.type = "password";
      keyInput.placeholder = "AIza...";
      keyInput.value = settings.apiKey;

      const modelLabel = document.createElement("label");
      modelLabel.textContent = "Modelo";
      const modelInput = document.createElement("input");
      modelInput.type = "text";
      modelInput.value = settings.model;

      const sysLabel = document.createElement("label");
      sysLabel.textContent = "Instrucción del sistema (opcional)";
      const sysInput = document.createElement("textarea");
      sysInput.value = settings.systemPrompt;

      const hint = document.createElement("div");
      hint.className = "settings-hint";
      hint.textContent = "Tu API key se guarda solo en este navegador (chrome.storage.local) y se usa únicamente para llamar a la API de Gemini. Consíguela gratis en aistudio.google.com/apikey.";

      const rowActions = document.createElement("div");
      rowActions.className = "settings-row-actions";
      const saveBtn = document.createElement("button");
      saveBtn.textContent = "Guardar";
      saveBtn.addEventListener("click", () => {
        settings.apiKey = keyInput.value.trim();
        settings.model = modelInput.value.trim() || "gemini-2.5-flash";
        settings.systemPrompt = sysInput.value;
        saveSettings();
        settingsOpen = false;
        renderAll();
      });
      rowActions.appendChild(saveBtn);

      settingsPanel.appendChild(keyLabel);
      settingsPanel.appendChild(keyInput);
      settingsPanel.appendChild(modelLabel);
      settingsPanel.appendChild(modelInput);
      settingsPanel.appendChild(sysLabel);
      settingsPanel.appendChild(sysInput);
      settingsPanel.appendChild(hint);
      settingsPanel.appendChild(rowActions);
      body.appendChild(settingsPanel);
    }

    const messagesEl = document.createElement("div");
    messagesEl.className = "messages";
    body.appendChild(messagesEl);

    const compose = document.createElement("div");
    compose.className = "compose";
    const textarea = document.createElement("textarea");
    textarea.placeholder = "Escribe tu mensaje...";
    const sendBtn = document.createElement("button");
    sendBtn.textContent = "Enviar";
    const footer = document.createElement("div");
    footer.className = "footer";
    const footerBrand = document.createElement("span");
    footerBrand.className = "brand";
    footerBrand.textContent = "Powered by Giron AI Studio";
    footer.appendChild(footerBrand);

    function setSending(state) {
      sending = state;
      sendBtn.disabled = state;
      textarea.disabled = state;
    }

    async function send() {
      const text = textarea.value.trim();
      if (!text || sending) return;
      if (!settings.apiKey) {
        settingsOpen = true;
        renderAll();
        return;
      }
      data.messages.push({ role: "user", content: text, ts: Date.now() });
      textarea.value = "";
      saveData();
      renderMessages();

      setSending(true);
      const thinkingBubble = document.createElement("div");
      thinkingBubble.className = "msg thinking";
      thinkingBubble.textContent = "Escribiendo...";
      messagesEl.appendChild(thinkingBubble);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      const apiMessages = data.messages
        .filter(m => m.role === "user" || m.role === "assistant")
        .slice(-MAX_CONTEXT_MESSAGES)
        .map(m => ({ role: m.role, content: m.content }));

      chrome.runtime.sendMessage(
        { type: "CHAT_SEND", apiKey: settings.apiKey, model: settings.model, systemPrompt: settings.systemPrompt, messages: apiMessages },
        (result) => {
          setSending(false);
          thinkingBubble.remove();
          if (!result) {
            data.messages.push({ role: "error", content: "No hubo respuesta de la extensión.", ts: Date.now() });
          } else if (result.ok) {
            data.messages.push({ role: "assistant", content: result.text, ts: Date.now() });
          } else {
            data.messages.push({ role: "error", content: result.error, ts: Date.now() });
          }
          saveData();
          renderMessages();
        }
      );
    }

    sendBtn.addEventListener("click", send);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    compose.appendChild(textarea);
    compose.appendChild(sendBtn);
    body.appendChild(compose);
    body.appendChild(footer);
    panel.appendChild(body);
    root.appendChild(panel);
    applyPanelVisibility();
    renderMessages();
  }

  document.addEventListener("mousemove", (e) => {
    if (!dragging || !root) return;
    const panel = root.querySelector(".panel");
    if (!panel) return;
    let left = e.clientX - dragOffsetX;
    let top = e.clientY - dragOffsetY;
    const maxLeft = window.innerWidth - panel.offsetWidth - 4;
    const maxTop = window.innerHeight - panel.offsetHeight - 4;
    left = Math.max(4, Math.min(left, maxLeft));
    top = Math.max(4, Math.min(top, maxTop));
    panel.style.left = left + "px";
    panel.style.top = top + "px";
    panel.style.right = "auto";
    data.panelPos = { left, top };
  });

  document.addEventListener("mouseup", () => {
    if (dragging) {
      dragging = false;
      saveData();
    }
  });

  function init() {
    if (document.getElementById("chat-gemini-discreto-host")) return;
    buildHost();
    loadAll(() => {
      renderAll();
    });
  }

  init();
})();
