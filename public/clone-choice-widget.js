(() => {
  const widget = document.querySelector('[data-choice-widget]');
  if (!widget) return;

  const STORAGE_KEY = 'starClonePendingChoice';
  const tabs = [...widget.querySelectorAll('[data-choice-kind]')];
  const questionText = widget.querySelector('[data-choice-question]');
  const insightText = widget.querySelector('[data-choice-insight]');
  const startButton = widget.querySelector('[data-choice-start]');
  const dialog = document.getElementById('dialogView');
  const questionInput = document.getElementById('question');

  const choices = {
    tour: {
      question: 'Спокойный отель у моря или насыщенный тур с экскурсиями?',
      insight: 'Клон покажет, где вы действительно восстановитесь, а где выберете красивую, но чужую картинку отдыха.',
      prompt: 'Помоги выбрать тур: спокойный отель у моря или насыщенный тур с экскурсиями. Сначала уточни мои реальные критерии, затем сравни варианты через мою карту и предложи первый проверяемый шаг.',
    },
    wallpaper: {
      question: 'Светлые спокойные обои или тёмные — с характером?',
      insight: 'Клон отделит ваш настоящий вкус от минутного впечатления и покажет, какая атмосфера будет поддерживать вас каждый день.',
      prompt: 'Помоги выбрать обои: светлые спокойные или тёмные с характером. Разбери, какая атмосфера подходит мне по карте, где я могу увлечься картинкой и что проверить на образцах перед покупкой.',
    },
    destination: {
      question: 'Поехать в знакомое комфортное место или открыть новую страну?',
      insight: 'Клон сравнит потребность в опоре и потребность в новом опыте — именно для вашего текущего состояния.',
      prompt: 'Помоги решить, куда поехать: в знакомое комфортное место или в новую страну. Сопоставь варианты с моим характером по карте, текущей потребностью и рисками, затем предложи лучший способ проверить выбор.',
    },
    purchase: {
      question: 'Купить надёжный вариант сейчас или подождать модель сильнее?',
      insight: 'Клон поможет увидеть главный критерий покупки, риск импульса и компромисс, о котором вы можете пожалеть.',
      prompt: 'Помоги решить, что купить: надёжный вариант сейчас или подождать более сильную модель. Уточни факты и ограничения, затем покажи мой настоящий критерий выбора, возможную ловушку и лучший ход.',
    },
    action: {
      question: 'Сделать смелый шаг сейчас или сохранить стабильность?',
      insight: 'Клон разложит внутренний конфликт, покажет цену каждого пути и предложит обратимый первый ход вместо гадания.',
      prompt: 'Помоги решить, как поступить: сделать смелый шаг сейчас или сохранить стабильность. Разбери конфликт через мою карту, цену каждого варианта и предложи ближайший обратимый шаг.',
    },
  };

  let activeKind = 'tour';
  let memoryPendingQuestion = null;

  const updateWidget = (kind) => {
    const choice = choices[kind] || choices.tour;
    activeKind = choices[kind] ? kind : 'tour';
    if (questionText) questionText.textContent = choice.question;
    if (insightText) insightText.textContent = choice.insight;

    tabs.forEach((tab) => {
      const active = tab.dataset.choiceKind === activeKind;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
  };

  const removePendingQuestion = () => {
    memoryPendingQuestion = null;
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // В приватном режиме хранилище может быть недоступно — переход всё равно работает.
    }
  };

  const savePendingQuestion = () => {
    const choice = choices[activeKind] || choices.tour;
    const pending = {
      kind: activeKind,
      prompt: choice.prompt,
      createdAt: Date.now(),
    };
    memoryPendingQuestion = pending;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
    } catch {
      // Оставляем вопрос в памяти текущей страницы и не блокируем создание клона.
    }
  };

  const readPendingQuestion = () => {
    if (memoryPendingQuestion?.prompt) return memoryPendingQuestion;
    try {
      const pending = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
      if (!pending?.prompt) return null;
      if (Date.now() - Number(pending.createdAt || 0) > 30 * 60 * 1000) {
        removePendingQuestion();
        return null;
      }
      memoryPendingQuestion = pending;
      return pending;
    } catch {
      removePendingQuestion();
      return null;
    }
  };

  const focusQuestion = () => {
    if (!questionInput) return;
    try {
      questionInput.focus({ preventScroll: true });
    } catch {
      questionInput.focus();
    }
  };

  const prefillQuestionWhenReady = () => {
    const pending = readPendingQuestion();
    if (!pending || !dialog || dialog.classList.contains('hidden') || !questionInput) return false;
    if (!questionInput.value.trim()) {
      questionInput.value = pending.prompt;
      questionInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
    removePendingQuestion();
    setTimeout(focusQuestion, 80);
    return true;
  };

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => updateWidget(tab.dataset.choiceKind));
    tab.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      let nextIndex = index;
      if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
      if (event.key === 'Home') nextIndex = 0;
      if (event.key === 'End') nextIndex = tabs.length - 1;
      tabs[nextIndex]?.focus();
      tabs[nextIndex]?.click();
    });
  });

  startButton?.addEventListener('click', () => {
    savePendingQuestion();
    try {
      if (typeof window.ym === 'function') {
        window.ym(110937602, 'reachGoal', 'clone_choice_widget_start', { kind: activeKind });
      }
    } catch {
      // Метрика не должна мешать переходу.
    }
    document.querySelector('[data-go-create]')?.click();
  });

  if (dialog) {
    new MutationObserver(prefillQuestionWhenReady).observe(dialog, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  updateWidget(activeKind);
  prefillQuestionWhenReady();
})();
