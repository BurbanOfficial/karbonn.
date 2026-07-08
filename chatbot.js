(function () {
  'use strict';

  const API_URL = window.KARBONN_API_URL || 'https://karbonn-x-abby.onrender.com';

  // Photo de profil de Kaï — remplace cette URL par la vraie photo
  const KAI_AVATAR = 'images/chatbot/kai-favicon.png';

  const WELCOME_MESSAGE = '👋 Salut ! Moi, c\'est Kaï 😊 Décrivez-moi votre projet, même en quelques mots. Je vous dirai en quelques secondes si c\'est faisable et comment on peut vous aider. Prêt à commencer ? 🚀';

  const SUGGESTIONS = [
    '💡 J’ai une idée de projet',
    '💰 Combien ça coûte ?',
    '🚀 Mon projet est-il réalisable ?',
    '📅 En combien de temps ?',
  ];

  const TAGLINE_PHRASES = [
    'Votre projet est faisable.',
    'Posez-moi vos questions.',
    'Je suis là pour vous aider.',
  ];

  let messages = [];
  let isLoading = false;
  let suggestionsShown = true;
  let taglineIndex = 0;
  let taglineTimer = null;

  function init() {
    injectHTML();
    bindEvents();
    startTypewriter();
    appendBotMessage(WELCOME_MESSAGE, true);
  }

  function injectHTML() {
    const root = document.getElementById('karbonn-chat');
    if (!root) return;

    root.innerHTML = `
      <!-- Overlay floué -->
      <div id="kai-backdrop"></div>

      <!-- Barre d'invitation animée -->
      <div id="kai-invite" role="button" tabindex="0" aria-label="Ouvrir le chat avec Kaï">
        <img class="kai-invite-avatar" src="${KAI_AVATAR}" alt="Kaï" />
        <div class="kai-invite-text">
          <span class="kai-invite-name">Kaï · Assistant IA</span>
          <span class="kai-invite-tagline" id="kai-tagline"></span>
        </div>
        <span class="kai-invite-pulse"></span>
      </div>

      <!-- Bouton fermer -->
      <button id="kai-close-btn" aria-label="Fermer le chat">
        <i class="fa-solid fa-xmark"></i>
      </button>

      <!-- Fenêtre de chat -->
      <div id="karbonn-chat-window" role="dialog" aria-label="Chat avec Kaï">
        <div class="chat-glass-inner">
          <div class="chat-header">
            <img class="chat-header-avatar" src="${KAI_AVATAR}" alt="Kaï" />
            <div class="chat-header-info">
              <span class="chat-header-name">Kaï</span>
              <div class="chat-header-status">
                <span class="chat-status-dot"></span>
                <span class="chat-status-label">En ligne · répond instantanément</span>
              </div>
            </div>
          </div>
          <div class="chat-messages" id="chat-messages"></div>
          <div class="chat-input-area">
            <textarea
              class="chat-input"
              id="chat-input"
              placeholder="Décrivez votre projet…"
              rows="1"
              aria-label="Message"
            ></textarea>
            <button class="chat-send-btn" id="chat-send-btn" aria-label="Envoyer">
              <i class="fa-solid fa-paper-plane"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  function bindEvents() {
    const invite = document.getElementById('kai-invite');
    const closeBtn = document.getElementById('kai-close-btn');
    const win = document.getElementById('karbonn-chat-window');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');

    if (!invite || !closeBtn || !win || !input || !sendBtn) return;

    const backdrop = document.getElementById('kai-backdrop');

    function openChat() {
      win.classList.add('open');
      invite.classList.add('hidden');
      closeBtn.classList.add('visible');
      backdrop && backdrop.classList.add('visible');
      const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.paddingRight = scrollbarW + 'px';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      clearTimeout(taglineTimer);
      setTimeout(() => input.focus(), 300);
    }

    function closeChat() {
      win.classList.remove('open');
      invite.classList.remove('hidden');
      closeBtn.classList.remove('visible');
      backdrop && backdrop.classList.remove('visible');
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
      document.documentElement.style.overflow = '';
      startTypewriter();
    }

    invite.addEventListener('click', openChat);
    invite.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') openChat(); });
    closeBtn.addEventListener('click', closeChat);
    backdrop && backdrop.addEventListener('click', closeChat);

    sendBtn.addEventListener('click', handleSend);

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });
  }

  /* --- Typewriter effect sur la tagline de la barre --- */
  function startTypewriter() {
    const el = document.getElementById('kai-tagline');
    if (!el) return;
    clearTimeout(taglineTimer);
    typeText(el, TAGLINE_PHRASES[taglineIndex], 0, function () {
      taglineTimer = setTimeout(() => {
        eraseText(el, function () {
          taglineIndex = (taglineIndex + 1) % TAGLINE_PHRASES.length;
          taglineTimer = setTimeout(() => startTypewriter(), 400);
        });
      }, 2200);
    });
  }

  function typeText(el, text, i, done) {
    if (i <= text.length) {
      el.textContent = text.slice(0, i);
      taglineTimer = setTimeout(() => typeText(el, text, i + 1, done), 45);
    } else {
      done();
    }
  }

  function eraseText(el, done) {
    const text = el.textContent;
    if (text.length > 0) {
      el.textContent = text.slice(0, -1);
      taglineTimer = setTimeout(() => eraseText(el, done), 25);
    } else {
      done();
    }
  }

  /* --- Chat logic --- */
  function handleSend() {
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send-btn');
    if (!input || isLoading) return;

    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    input.style.height = 'auto';

    removeSuggestions();
    appendUserMessage(text);
    messages.push({ role: 'user', content: text });

    sendBtn.disabled = true;
    isLoading = true;
    const typingEl = showTyping();

    fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    })
      .then((res) => res.json())
      .then((data) => {
        removeTyping(typingEl);
        if (data.reply) {
          messages.push({ role: 'assistant', content: data.reply });
          appendBotMessage(data.reply);
        } else {
          appendError('Une erreur est survenue. Écrivez-nous à hello@karbonn.fr');
        }
      })
      .catch(() => {
        removeTyping(typingEl);
        appendError('Connexion impossible. Écrivez-nous à hello@karbonn.fr');
      })
      .finally(() => {
        isLoading = false;
        sendBtn.disabled = false;
        document.getElementById('chat-input')?.focus();
      });
  }

  function appendBotMessage(text, withSuggestions) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble bot';
    bubble.textContent = text;
    container.appendChild(bubble);

    if (withSuggestions && suggestionsShown) {
      const suggestEl = document.createElement('div');
      suggestEl.className = 'chat-suggestions';
      suggestEl.id = 'chat-suggestions';
      SUGGESTIONS.forEach((q) => {
        const btn = document.createElement('button');
        btn.className = 'chat-suggestion-btn';
        btn.textContent = q;
        btn.addEventListener('click', () => {
          removeSuggestions();
          const input = document.getElementById('chat-input');
          if (input) {
            input.value = q;
            handleSend();
          }
        });
        suggestEl.appendChild(btn);
      });
      container.appendChild(suggestEl);
    }

    scrollToBottom(container);
  }

  function appendUserMessage(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user';
    bubble.textContent = text;
    container.appendChild(bubble);
    scrollToBottom(container);
  }

  function appendError(text) {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    const el = document.createElement('p');
    el.className = 'chat-error';
    el.textContent = text;
    container.appendChild(el);
    scrollToBottom(container);
  }

  function showTyping() {
    const container = document.getElementById('chat-messages');
    if (!container) return null;
    const el = document.createElement('div');
    el.className = 'chat-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    container.appendChild(el);
    scrollToBottom(container);
    return el;
  }

  function removeTyping(el) {
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function removeSuggestions() {
    const el = document.getElementById('chat-suggestions');
    if (el) { el.parentNode.removeChild(el); suggestionsShown = false; }
  }

  function scrollToBottom(container) {
    requestAnimationFrame(() => { container.scrollTop = container.scrollHeight; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
