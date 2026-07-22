const OFFER_DELAY_MS = 5 * 60 * 1000;
const STORAGE_PREFIX = 'herostar_practice_offer_shown:';

let timer = null;
let scheduledChartId = null;

function currentChartId() {
  return localStorage.getItem('herostar_chart_id') || '';
}

function mapIsOpen() {
  const map = document.querySelector('#map');
  return Boolean(map && !map.classList.contains('hidden'));
}

function alreadyShown(chartId) {
  return localStorage.getItem(`${STORAGE_PREFIX}${chartId}`) === '1';
}

function markShown(chartId) {
  localStorage.setItem(`${STORAGE_PREFIX}${chartId}`, '1');
}

async function isAuthenticated() {
  try {
    const response = await fetch('/api/config', { headers: { Accept: 'application/json' } });
    if (!response.ok) return false;
    const config = await response.json();
    return Boolean(config.user);
  } catch {
    return false;
  }
}

function closeOffer(offer) {
  offer.remove();
  document.body.style.overflow = '';
}

function prepareAuthModal() {
  const modal = document.querySelector('#authModal');
  const title = modal?.querySelector('h2');
  const description = modal?.querySelector('.modal p');
  if (title) title.textContent = 'Начать применять карту';
  if (description) description.textContent = 'Подключите Telegram без пароля. HeroStar сохранит карту и будет присылать короткие практики только по уже открытым планетам.';
}

function showOffer(chartId) {
  if (document.querySelector('#practiceRegistrationOffer')) return;
  markShown(chartId);

  const offer = document.createElement('div');
  offer.id = 'practiceRegistrationOffer';
  offer.className = 'modal-backdrop practice-offer-backdrop';
  offer.innerHTML = `
    <div class="modal glass-panel practice-offer" role="dialog" aria-modal="true" aria-labelledby="practiceOfferTitle">
      <button class="modal-close" type="button" data-practice-close aria-label="Закрыть">×</button>
      <div class="practice-offer-mark">✦</div>
      <div class="panel-kicker">Следующий шаг после карты</div>
      <h2 id="practiceOfferTitle">Не просто узнать о себе — начать применять</h2>
      <p>Подключите Telegram, и HeroStar будет мягко возвращать вас к уже открытым планетам: короткое объяснение и одно небольшое действие, которое можно проверить в жизни.</p>
      <div class="practice-offer-example">
        <span>Например</span>
        <b>Ваша Луна — эмоциональная опора</b>
        <p>Сегодня заметьте один момент, после которого вам действительно становится спокойнее. Не исправляйте себя — просто найдите работающий способ.</p>
      </div>
      <button class="primary-button practice-offer-primary" type="button" data-practice-start>Начать применять через Telegram <b>→</b></button>
      <button class="text-button practice-offer-later" type="button" data-practice-close>Не сейчас</button>
      <p class="microcopy">Не чаще одного сообщения в день. Отключение — одной кнопкой под сообщением.</p>
    </div>`;

  const style = document.createElement('style');
  style.textContent = `
    .practice-offer-backdrop{z-index:1300;padding:20px}
    .practice-offer{width:min(560px,100%);text-align:left;padding:34px;position:relative}
    .practice-offer-mark{width:54px;height:54px;border-radius:18px;display:grid;place-items:center;margin-bottom:18px;font-size:25px;background:rgba(169,137,255,.15);border:1px solid rgba(196,176,255,.32);box-shadow:0 12px 34px rgba(0,0,0,.2)}
    .practice-offer h2{margin:8px 0 12px;font-size:clamp(27px,5vw,40px);line-height:1.08}
    .practice-offer>p{color:var(--muted,#aeb1c2);line-height:1.65}
    .practice-offer-example{margin:22px 0;padding:18px;border-radius:18px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.09)}
    .practice-offer-example span{display:block;margin-bottom:8px;color:#87e8dc;font-size:12px;text-transform:uppercase;letter-spacing:.12em}
    .practice-offer-example b{display:block;margin-bottom:8px}
    .practice-offer-example p{margin:0;color:var(--muted,#aeb1c2);line-height:1.55}
    .practice-offer-primary{width:100%;justify-content:center}
    .practice-offer-later{display:block;margin:13px auto 0}
    .practice-offer .microcopy{text-align:center;margin-bottom:0}
    @media (max-width:600px){.practice-offer{padding:27px 20px}.practice-offer-example{padding:15px}}
  `;
  offer.append(style);
  document.body.append(offer);
  document.body.style.overflow = 'hidden';

  offer.querySelectorAll('[data-practice-close]').forEach((button) => {
    button.addEventListener('click', () => closeOffer(offer));
  });
  offer.addEventListener('click', (event) => {
    if (event.target === offer) closeOffer(offer);
  });
  offer.querySelector('[data-practice-start]')?.addEventListener('click', () => {
    closeOffer(offer);
    prepareAuthModal();
    document.querySelector('#loginButton')?.click();
  });
  const escapeHandler = (event) => {
    if (event.key !== 'Escape') return;
    closeOffer(offer);
    document.removeEventListener('keydown', escapeHandler);
  };
  document.addEventListener('keydown', escapeHandler);
}

async function triggerOffer(chartId) {
  timer = null;
  if (!chartId || currentChartId() !== chartId || !mapIsOpen() || alreadyShown(chartId)) return;
  if (await isAuthenticated()) return;
  showOffer(chartId);
}

function scheduleOffer() {
  const chartId = currentChartId();
  if (!chartId || !mapIsOpen() || alreadyShown(chartId)) return;
  if (timer && scheduledChartId === chartId) return;
  if (timer) clearTimeout(timer);
  scheduledChartId = chartId;
  timer = setTimeout(() => triggerOffer(chartId), OFFER_DELAY_MS);
}

const map = document.querySelector('#map');
if (map) {
  const observer = new MutationObserver(scheduleOffer);
  observer.observe(map, { attributes: true, attributeFilter: ['class'] });
}

window.addEventListener('storage', scheduleOffer);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) scheduleOffer();
});
scheduleOffer();
