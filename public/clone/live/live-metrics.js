(() => {
  const METRIKA_ID = 110937602;
  const VISITOR_KEY = 'herostar_visitor_id';
  const ATTRIBUTION_KEY = 'starCloneAttribution';
  const sent = new Set();

  function goal(name, params = {}) {
    try {
      if (typeof window.ym === 'function') window.ym(METRIKA_ID, 'reachGoal', name, params);
    } catch {
      // Аналитика не должна влиять на продукт.
    }
  }

  function visitorId() {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  }

  function attribution() {
    const params = new URLSearchParams(location.search);
    const current = {
      utm_source: params.get('utm_source') || '',
      utm_medium: params.get('utm_medium') || '',
      utm_campaign: params.get('utm_campaign') || '',
      utm_content: params.get('utm_content') || '',
      utm_term: params.get('utm_term') || '',
      yclid: params.get('yclid') || '',
      referrer: document.referrer || '',
    };
    const hasCampaign = Object.entries(current).some(([key, value]) => key !== 'referrer' && Boolean(value));
    if (hasCampaign) localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(current));
    try {
      return hasCampaign ? current : JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || '{}');
    } catch {
      return current;
    }
  }

  function track(eventType, action, metadata = {}) {
    const body = JSON.stringify({
      eventType,
      visitorId: visitorId(),
      chartId: null,
      metadata: { product: 'clone', action, ...attribution(), ...metadata },
    });
    fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-visitor-id': visitorId() },
      body,
      keepalive: true,
    }).catch(() => {});
  }

  function once(key, callback) {
    if (sent.has(key)) return;
    sent.add(key);
    callback();
  }

  function intentSource(element) {
    if (element.closest('.live-sticky-start')) return 'sticky';
    if (element.closest('.live-hero')) return 'hero';
    return 'section';
  }

  document.querySelectorAll('[data-go-intent]').forEach((button) => {
    button.addEventListener('click', () => {
      const source = intentSource(button);
      goal('clone_intent_opened', { source });
      track('form_started', 'clone_intent_opened', { source });
    });
  });

  const heroQuestion = document.querySelector('#heroQuestion');
  heroQuestion?.addEventListener('input', () => {
    if (!heroQuestion.value.trim()) return;
    once('intent_started', () => {
      goal('clone_intent_started');
      track('form_started', 'clone_intent_started');
    });
  });

  document.querySelector('#heroQuestionForm')?.addEventListener('submit', () => {
    const length = heroQuestion?.value.trim().length || 0;
    track('form_started', 'clone_intent_captured', { questionLength: length });
  });

  const insightSlider = document.querySelector('#cloneInsightSlider');
  if (insightSlider && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, currentObserver) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      once('insight_slider_viewed', () => {
        goal('clone_insight_slider_viewed');
        track('card_opened', 'clone_insight_slider_viewed');
      });
      currentObserver.disconnect();
    }, { threshold: .35 });
    observer.observe(insightSlider);
  }

  document.addEventListener('clone:insight-change', (event) => {
    const { index = 0, source = '', topic = '' } = event.detail || {};
    goal('clone_insight_slide_changed', { index, source, topic });
  });

  document.addEventListener('clone:insight-selected', (event) => {
    const { index = 0, topic = '' } = event.detail || {};
    goal('clone_insight_selected', { index, topic });
    track('form_started', 'clone_insight_selected', { index, topic });
  });

  const birthForm = document.querySelector('#birthForm');
  birthForm?.addEventListener('input', () => {
    once('birth_started', () => track('form_started', 'clone_birth_started'));
  });
  birthForm?.addEventListener('submit', () => {
    goal('clone_birth_submitted');
    track('form_started', 'clone_birth_submitted', {
      unknownTime: Boolean(birthForm.querySelector('input[name="unknownTime"]:checked')),
      placeSelected: Boolean(document.querySelector('#placeValue')?.value),
    });
  });

  const messages = document.querySelector('#messages');
  document.querySelector('#questionForm')?.addEventListener('submit', () => {
    const length = document.querySelector('#question')?.value.trim().length || 0;
    if (!length) return;

    // Capture phase runs before clone.js clears the textarea and appends the user message.
    const questionNumber = (messages?.querySelectorAll('.message.user').length || 0) + 1;
    goal('clone_question_sent', { question_length: length, question_number: questionNumber });

    if (questionNumber === 2) {
      once('second_question_sent', () => {
        goal('clone_second_question', { question_length: length });
        track('consultant_opened', 'clone_second_question_sent', {
          questionNumber: 2,
          questionLength: length,
        });
      });
    }
  }, { capture: true });

  function detectSecondAnswer() {
    if (!messages) return;
    const children = [...messages.children];
    const users = children.filter((item) => item.matches?.('.message.user'));
    const secondUser = users[1];
    if (!secondUser) return;

    const secondUserIndex = children.indexOf(secondUser);
    const answer = children.slice(secondUserIndex + 1).find((item) => {
      if (!item.matches?.('.message.clone')) return false;
      const text = String(item.textContent || '').trim();
      return text && !/готовит ответ|размышляет|подключите telegram|вход не завершён/i.test(text);
    });
    if (!answer) return;

    once('second_answer_received', () => {
      goal('clone_second_answer');
      track('card_opened', 'clone_second_answered', { questionNumber: 2 });
    });
  }

  if (messages) {
    detectSecondAnswer();
    new MutationObserver(detectSecondAnswer).observe(messages, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest('#restoreCloneAccess, .telegram-login-slot button, .telegram-login-slot a')) {
      once('auth_opened', () => goal('clone_auth_opened'));
    }

    const premium = target.closest('#openPremiumDiscovery, #openPassportPremium, #openFullModeOffer');
    if (premium) {
      const source = premium.id || 'premium_entry';
      goal('clone_premium_interest', { source });
    }
  });

  function errorCategory(text) {
    const normalized = String(text || '').toLowerCase();
    if (!normalized) return '';
    if (normalized.includes('город')) return 'place';
    if (normalized.includes('лимит') || normalized.includes('много')) return 'rate_limit';
    if (normalized.includes('telegram')) return 'telegram';
    if (normalized.includes('оплат')) return 'payment';
    if (normalized.includes('сеть') || normalized.includes('загруз') || normalized.includes('недоступ')) return 'network';
    return 'other';
  }

  ['formError', 'dialogError'].forEach((id) => {
    const element = document.getElementById(id);
    if (!element) return;
    new MutationObserver(() => {
      const category = errorCategory(element.textContent);
      if (!category) return;
      const key = `error:${id}:${category}`;
      once(key, () => track('filter_changed', 'clone_error_shown', { surface: id, category }));
    }).observe(element, { childList: true, subtree: true, characterData: true });
  });
})();
