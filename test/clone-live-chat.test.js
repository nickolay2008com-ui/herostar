import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

function declarationsFor(source, selector) {
  const start = source.indexOf(selector);
  assert.notEqual(start, -1, `Не найден CSS-селектор: ${selector}`);
  const openingBrace = source.indexOf('{', start);
  const closingBrace = source.indexOf('}', openingBrace);
  return source.slice(openingBrace + 1, closingBrace);
}

test('live-офферы монтируются в историю как одна inline service-card', async () => {
  const [html, clone, styles] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone.js'),
    read('public/clone/live/live-detail.css'),
  ]);

  assert.match(html, /class="alignment-offer inline-service-card hidden" id="fullModeOffer" data-offer-code="clone_day"/);
  assert.match(html, /class="alignment-offer inline-service-card hidden" id="alignmentOffer" data-offer-code="clone_alignment"/);
  assert.match(clone, /function mountInlineOffer\(offer, visible\)[\s\S]*?if \(visible\) messages\.append\(offer\)/);
  assert.match(clone, /mountInlineOffer\(\$\('#fullModeOffer'\), showFullMode/);
  assert.match(clone, /mountInlineOffer\(\$\('#alignmentOffer'\), showAlignment/);
  assert.doesNotMatch(clone, /cloneNode\(|insertAdjacentHTML\(/);

  const mobileOffer = declarationsFor(
    styles,
    '.live-product #dialogView .messages > .alignment-offer:not(.hidden)',
  );
  assert.match(mobileOffer, /position:\s*static/);
  assert.doesNotMatch(mobileOffer, /position:\s*absolute/);
  assert.match(mobileOffer, /max-height:\s*none/);
});

test('полный режим использует утверждённый текст и не блокирует бесплатный диалог', async () => {
  const [html, clone] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone.js'),
  ]);

  assert.match(html, />ПОЛНАЯ ГЛУБИНА КАРТЫ</);
  assert.match(html, />Увидеть картину целиком</);
  assert.match(html, /Полный режим связывает 3–6 значимых факторов/);
  assert.match(html, /id="openFullModeOffer"[^>]*>Что откроется в полном режиме</);
  assert.equal((html.match(/>Продолжить бесплатно</g) || []).length, 2);
  assert.match(html, />Диалог останется без лимита</);

  assert.match(clone, /starCloneOfferDismissed:/);
  assert.match(clone, /function dismissVisibleInlineOffers/);
  assert.match(clone, /dismissVisibleInlineOffers/);
  assert.match(clone, /&& !showAlignment/);
  assert.match(clone, /sessionStorage\.setItem\(offerDismissalKey\(offerCode\), '1'\)/);
  assert.match(clone, /\$\$\(\'\[data-dismiss-offer\]\'\)/);
  assert.match(clone, /openFullModeOffer'\)\?\.addEventListener\('click', \(\) => openPaywall\('clone_day'\)\)/);
});

test('полный режим спокойно обнаруживается в шапке через объясняющий экран', async () => {
  const [html, clone, styles] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone.js'),
    read('public/clone/live/live-visual-polish.css'),
  ]);

  assert.match(html, /class="premium-entry hidden" id="openPremiumDiscovery"/);
  assert.match(html, /id="premiumDiscovery"[^>]*role="dialog"/);
  assert.match(html, />Бесплатный Клон показывает главный ход/);
  assert.match(html, /id="continueToFullMode"[^>]*>Посмотреть полный режим</);
  assert.match(html, /id="returnToDialog"[^>]*>Вернуться в диалог</);
  assert.match(html, /id="passportPremiumEntry"/);
  assert.match(html, /id="openPassportPremium"[^>]*>Посмотреть полный разбор</);
  assert.match(clone, /const showPremiumEntry = Boolean\(state\.chartId && state\.user && !access\?\.cloneAccessActive\)/);
  assert.match(clone, /openPremiumDiscovery'\)\?\.addEventListener\('click', \(\) => openPremiumDiscovery\('header_entry'\)\)/);
  assert.match(clone, /openPassportPremium'\)\?\.addEventListener\('click', \(\) => openPremiumDiscovery\('passport_entry'\)\)/);
  assert.match(clone, /const discoveryTrigger = activeDialogTrigger;[\s\S]*?closePremiumDiscovery\(\{ restoreFocus: false \}\);[\s\S]*?openPaywall\('clone_day', discoveryTrigger\)/);

  const entry = declarationsFor(styles, '.live-product .premium-entry');
  assert.match(entry, /position:\s*static/);
  assert.match(entry, /min-height:\s*44px/);
});

test('стартовый блок сворачивается, а подсказки не обрезаются', async () => {
  const [html, clone, styles] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone.js'),
    read('public/clone/live/live-visual-polish.css'),
  ]);

  assert.match(html, /id="conversationIntro"/);
  assert.match(html, /id="conversationSuggestions"/);
  assert.match(html, />Отношения</);
  assert.match(html, />Работа и деньги</);
  assert.match(html, />Что со мной происходит</);
  assert.match(clone, /function syncConversationStarted\(\)/);
  assert.match(clone, /classList\.toggle\('conversation-started', started\)/);
  assert.match(clone, /button\.dataset\.prompt \|\| button\.textContent/);

  assert.match(styles, /\.live-product #dialogView \.chips\s*\{[^}]*flex-wrap:\s*wrap[^}]*overflow:\s*visible/s);
});

test('live-чат сохраняет позицию чтения и предлагает переход к новому ответу', async () => {
  const [html, living, styles, clone] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone-living.js'),
    read('public/clone/live/live-detail.css'),
    read('public/clone.js'),
  ]);

  assert.match(html, /id="jumpToLatest"[^>]*>К новому ответу/);
  assert.match(living, /const NEAR_BOTTOM_THRESHOLD = 96/);
  assert.match(living, /const shouldFollowLatest = pinnedToBottom/);
  assert.match(living, /if \(shouldFollowLatest\)[\s\S]*?scrollToLatest\(\)[\s\S]*?else[\s\S]*?showJumpToLatest\(\)/);
  assert.match(living, /jumpToLatest\?\.addEventListener\('click', \(\) => scrollToLatest\(\)\)/);
  assert.doesNotMatch(clone, /\$\('#messages'\)\.scrollTop = \$\('#messages'\)\.scrollHeight/);

  const jumpButton = declarationsFor(styles, '.live-product #dialogView .jump-to-latest');
  assert.match(jumpButton, /min-height:\s*44px/);
});

test('composer не отправляет пустой вопрос и сообщает состояние запроса', async () => {
  const [html, clone] = await Promise.all([
    read('public/clone/live/index.html'),
    read('public/clone.js'),
  ]);

  assert.match(html, /id="questionForm"[^>]*aria-busy="false"/);
  assert.match(html, /type="submit"[^>]*aria-label="Отправить вопрос"[^>]*disabled/);
  assert.match(clone, /const hasQuestion = Boolean\(textarea\?\.value\.trim\(\)\)/);
  assert.match(clone, /button\.disabled = state\.asking \|\| !hasQuestion/);
  assert.match(clone, /form\?\.setAttribute\('aria-busy', String\(state\.asking\)\)/);
  assert.match(clone, /state\.asking \? 'Клон формирует ответ' : 'Отправить вопрос'/);
  assert.match(clone, /\$\('#question'\)\.addEventListener\('input', syncComposerSubmitState\)/);
  assert.match(clone, /if \(state\.asking\) return/);
});
