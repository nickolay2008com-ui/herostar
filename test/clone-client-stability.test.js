import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function classList(initial = []) {
  const values = new Set(initial);
  return {
    contains: (value) => values.has(value),
    toggle(value, enabled) {
      if (enabled) values.add(value);
      else values.delete(value);
    },
    add: (value) => values.add(value),
    remove: (value) => values.delete(value),
  };
}

test('виджет выбора не ломает переход, когда sessionStorage запрещён', async () => {
  const source = await read('public/clone-choice-widget.js');
  const startListeners = {};
  const observerCallbacks = [];
  let createClicks = 0;
  let inputEvents = 0;

  const tabs = ['tour', 'wallpaper', 'destination', 'purchase', 'action'].map((kind) => ({
    dataset: { choiceKind: kind },
    classList: classList(kind === 'tour' ? ['is-active'] : []),
    setAttribute() {},
    addEventListener() {},
    focus() {},
    click() {},
    tabIndex: 0,
  }));
  const startButton = {
    addEventListener(type, listener) {
      startListeners[type] = listener;
    },
  };
  const dialog = { classList: classList(['hidden']) };
  const question = {
    value: '',
    dispatchEvent() { inputEvents += 1; },
    focus() {},
  };
  const widget = {
    querySelectorAll: () => tabs,
    querySelector(selector) {
      if (selector === '[data-choice-start]') return startButton;
      if (selector === '[data-choice-question]' || selector === '[data-choice-insight]') return { textContent: '' };
      return null;
    },
  };

  const context = {
    document: {
      querySelector(selector) {
        if (selector === '[data-choice-widget]') return widget;
        if (selector === '[data-go-create]') return { click: () => { createClicks += 1; } };
        return null;
      },
      getElementById(id) {
        if (id === 'dialogView') return dialog;
        if (id === 'question') return question;
        return null;
      },
    },
    sessionStorage: {
      getItem() { throw new Error('Storage blocked'); },
      setItem() { throw new Error('Storage blocked'); },
      removeItem() { throw new Error('Storage blocked'); },
    },
    MutationObserver: class {
      constructor(callback) { observerCallbacks.push(callback); }
      observe() {}
    },
    Event: class {},
    window: {},
    setTimeout(callback) { callback(); },
    Date,
    console,
  };

  vm.runInNewContext(source, context);
  assert.equal(typeof startListeners.click, 'function');

  startListeners.click();
  assert.equal(createClicks, 1, 'основная форма должна открыться независимо от sessionStorage');

  dialog.classList.remove('hidden');
  observerCallbacks[0]();
  assert.match(question.value, /Помоги выбрать тур/);
  assert.equal(inputEvents, 1, 'предзаполненное значение должно сообщить интерфейсу об изменении');
});

test('ошибка оплаты остаётся понятной пользователю, а детали — в консоли', async () => {
  const source = await read('public/clone-scroll-fix.js');
  assert.doesNotThrow(() => new Function(source));
  assert.match(source, /Оплата временно недоступна\. Попробуйте позже/);
  assert.match(source, /console\.warn\('HeroStar payment configuration is incomplete:'/);
  assert.doesNotMatch(source, /Для оплаты не хватает:/);
});
