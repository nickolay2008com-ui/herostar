const METRIKA_ID = 110937602;
const STORAGE_KEY = 'starCloneLive';
const ATTRIBUTION_KEY = 'starCloneAttribution';

const state = {
  situation: '', category: null, chartId: null, token: null, chart: null,
  cloneName: 'Ваш Звёздный клон', selectedPlace: null, demo: null,
  config: null, user: null, authPoll: null, authStartedAt: 0,
  asking: false, contextSynced: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function showStage(id) {
  ['#situationStage', '#understandingStage', '#birthStage', '#buildingStage', '#resultStage']
    .forEach((selector) => $(selector)?.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toast(text) {
  const node = $('#toast');
  if (!node) return;
  node.textContent = text;
  node.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => node.classList.remove('show'), 3400);
}

function goal(name, params = {}) {
  try { if (typeof window.ym === 'function') window.ym(METRIKA_ID, 'reachGoal', name, params); } catch {}
}

function visitorId() {
  let id = localStorage.getItem('herostar_visitor_id');
  if (!id) {
    id = globalThis.crypto?.randomUUID?.() || `visitor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem('herostar_visitor_id', id);
  }
  return id;
}

function attribution() {
  const params = new URLSearchParams(location.search);
  const current = {
    utm_source: params.get('utm_source') || '', utm_medium: params.get('utm_medium') || '',
    utm_campaign: params.get('utm_campaign') || '', utm_content: params.get('utm_content') || '',
    utm_term: params.get('utm_term') || '', yclid: params.get('yclid') || '',
    referrer: document.referrer || '',
  };
  const hasCampaign = Object.entries(current).some(([key, value]) => key !== 'referrer' && Boolean(value));
  if (hasCampaign) localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(current));
  try { return hasCampaign ? current : JSON.parse(localStorage.getItem(ATTRIBUTION_KEY) || '{}'); }
  catch { return current; }
}

async function json(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (state.token) headers['x-chart-token'] = state.token;
  headers['x-visitor-id'] = visitorId();
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Не удалось выполнить действие');
    error.code = data.code; error.status = response.status;
    throw error;
  }
  return data;
}

async function track(eventType, action, metadata = {}) {
  try {
    await json('/api/events', { method: 'POST', body: JSON.stringify({
      eventType, visitorId: visitorId(), chartId: state.chartId || null,
      metadata: { product: 'clone_live', action, ...attribution(), ...metadata },
    }) });
  } catch {}
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    situation: state.situation, category: state.category, chartId: state.chartId,
    token: state.token, cloneName: state.cloneName, demo: state.demo,
    contextSynced: state.contextSynced, savedAt: new Date().toISOString(),
  }));
}

function stored() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } }

const CATEGORY_RULES = [
  { id: 'shared', house: 8, title: 'общие ресурсы, зависимость и риск', words: ['долг','кредит','инвест','доля','общие деньги','наслед','риск','зависим'] },
  { id: 'money', house: 2, title: 'личные ресурсы, деньги и устойчивость', words: ['деньг','доход','зарплат','цен','оплат','заработ','ресурс','бюджет'] },
  { id: 'relationship', house: 7, title: 'отношения, партнёрство и договорённости', words: ['отношен','партнёр','муж','жен','любов','развод','вместе','договор'] },
  { id: 'career', house: 10, title: 'карьера, статус и общественный результат', words: ['карьер','должност','статус','призван','руковод','повышен','репутац'] },
  { id: 'work', house: 6, title: 'работа, навыки и повседневная эффективность', words: ['работ','режим','команд','сотрудник','задач','навык','устал'] },
  { id: 'home', house: 4, title: 'дом, переезд и внутренняя опора', words: ['переезд','дом','квартир','семь','родител','город','стран','жиль'] },
  { id: 'project', house: 5, title: 'собственный проект, творчество и авторская инициатива', words: ['проект','иде','твор','запуск','продукт','бизнес','автор'] },
  { id: 'communication', house: 3, title: 'разговор, обучение, документы и обмен информацией', words: ['поговор','сказать','ответить','написать','документ','обуч','переговор','сообщен'] },
  { id: 'future', house: 11, title: 'сообщества, большие планы и будущее', words: ['сообще','аудитор','будущ','масштаб','комьюнити','друз','сеть'] },
];

const HOUSE_AREAS = {
  1:'личность и способ входить в ситуацию',2:'личные ресурсы, деньги и самоценность',
  3:'разговор, информация, обучение и документы',4:'дом, корни и внутренняя опора',
  5:'творчество, удовольствие и собственные проекты',6:'работа, навыки и повседневная эффективность',
  7:'партнёрство, отношения и договорённости',8:'общие ресурсы, риск и глубокая зависимость',
  9:'обучение, мировоззрение и дальний горизонт',10:'карьера, статус и общественный результат',
  11:'сообщества, большие проекты и будущее',12:'уединение, завершение и скрытые процессы',
};

const RULERS = {
  'Овен':'mars','Телец':'venus','Близнецы':'mercury','Рак':'moon','Лев':'sun','Дева':'mercury',
  'Весы':'venus','Скорпион':'pluto','Стрелец':'jupiter','Козерог':'saturn','Водолей':'uranus','Рыбы':'neptune',
};

const SIGN_STYLE = {
  'Овен':['проверить возможность быстрым самостоятельным действием','инициативу и прямой тест'],
  'Телец':['сначала проверить устойчивость, цену и реальную пользу','надёжность и сохранение ценного'],
  'Близнецы':['собрать недостающую информацию и сравнить несколько версий','информацию и возможность манёвра'],
  'Рак':['проверить доверие, безопасность и последствия для близких связей','защищённость и человеческую надёжность'],
  'Лев':['оценить, позволяет ли решение проявить авторство и сохранить достоинство','авторство и заметный личный вклад'],
  'Дева':['разложить ситуацию на детали, риски и рабочие процессы','точность и практическую управляемость'],
  'Весы':['прояснить обмен, роли и справедливые условия взаимодействия','баланс интересов и ясную договорённость'],
  'Скорпион':['понять скрытые ставки, контроль и цену зависимости','глубину проверки и контроль критического риска'],
  'Стрелец':['увидеть перспективу, смысл и возможность расширения','рост и дальний горизонт'],
  'Козерог':['оценить долгосрочные последствия, ответственность и выполнимость','структуру и выдержку'],
  'Водолей':['найти независимый, нестандартный и более свободный формат','свободу конструкции и новое решение'],
  'Рыбы':['сначала почувствовать общий смысл, атмосферу и тонкие последствия','интуитивную целостность и гибкость'],
};

const CONTRAST_SIGN = {
  'Овен':'Весы','Телец':'Близнецы','Близнецы':'Телец','Рак':'Овен','Лев':'Дева','Дева':'Лев',
  'Весы':'Рак','Скорпион':'Стрелец','Стрелец':'Скорпион','Козерог':'Водолей','Водолей':'Козерог','Рыбы':'Дева',
};

function classifySituation(text) {
  const lower = text.toLowerCase(); let best = null;
  for (const rule of CATEGORY_RULES) {
    const score = rule.words.reduce((sum, word) => sum + (lower.includes(word) ? 1 : 0), 0);
    if (!best || score > best.score) best = { ...rule, score };
  }
  return best?.score ? best : { id:'choice', house:1, title:'личный способ входить в ситуацию и выбирать направление', score:0 };
}

function understandingFor(category, situation) {
  const verbs = {
    money:'понять, какой формат сохранит устойчивость и не закроет возможность движения',
    shared:'оценить общую выгоду, зависимость и реальную цену риска',
    relationship:'выбрать способ взаимодействия, который прояснит отношения и условия контакта',
    career:'понять, какое решение лучше поддерживает реализацию и долгосрочный результат',
    work:'найти рабочий способ действовать без лишних потерь сил и качества',
    home:'оценить решение с точки зрения опоры, среды и дальнейшей устойчивости',
    project:'понять, как развивать инициативу, не потеряв авторство и ресурсы',
    communication:'выбрать формулировку и порядок разговора, которые приведут к ясности',
    future:'связать текущий ход с более крупным планом и окружением',
    choice:'увидеть, с чего эта модель начала бы решение и какой шаг проверила бы первым',
  };
  return {
    title:`Задача относится к сфере «${category.title}»`,
    text:`Звёздный клон будет разбирать ситуацию как попытку ${verbs[category.id] || verbs.choice}. После расчёта станет видно, через какой способ эта сфера включается именно у вашей модели.`,
    original:situation,
  };
}

const planet = (chart, key) => (chart?.planets || []).find((item) => item.key === key) || null;
function cusp(chart, house) {
  return (chart?.houses?.cusps || []).find((item) => Number(item.house) === Number(house)) || null;
}
function strongestSupport(chart, keys = []) {
  return (chart?.aspects || []).filter((aspect) => aspect.tone === 'support')
    .filter((aspect) => !keys.length || keys.includes(aspect.from) || keys.includes(aspect.to))
    .sort((a,b) => Number(b.exactness || 0) - Number(a.exactness || 0))[0] || null;
}
function actionPlanetKey(category) {
  if (category.id === 'relationship' || category.id === 'money' || category.id === 'shared') return 'venus';
  if (category.id === 'communication') return 'mercury';
  if (category.id === 'career') return 'sun';
  return 'mars';
}
function firstMove(category) {
  const moves = {
    money:'определить минимально приемлемые финансовые условия, предел риска и критерий продолжения',
    shared:'письменно уточнить доли, контроль ресурсов, обязательства и сценарий выхода',
    relationship:'сформулировать один честный вопрос, который проясняет ожидания и границы обеих сторон',
    career:'сопоставить решение с желаемым результатом на год и проверить его через один видимый этап',
    work:'выбрать короткий рабочий цикл, определить критерий качества и посмотреть на фактическую нагрузку',
    home:'собрать три факта об опоре: деньги, среда и возможность изменить решение',
    project:'запустить небольшой самостоятельный прототип без полного объёма обязательств',
    communication:'подготовить формулировку из факта, желаемого результата и конкретного предложения',
    future:'проверить, приближает ли решение к нужному окружению и масштабу через один реальный контакт',
    choice:'выбрать один небольшой обратимый шаг, который даст новую проверяемую информацию',
  };
  return moves[category.id] || moves.choice;
}

function buildDemo(chart, category) {
  const activeCusp = cusp(chart, category.house) || cusp(chart, 1);
  const sign = activeCusp?.sign || chart?.angles?.ascendant?.sign || 'Дева';
  const [entry, value] = SIGN_STYLE[sign] || SIGN_STYLE.Дева;
  const rulerKey = RULERS[sign] || actionPlanetKey(category);
  const ruler = planet(chart, rulerKey);
  const actionPlanet = planet(chart, actionPlanetKey(category)) || planet(chart, 'mars');
  const support = strongestSupport(chart, [rulerKey, actionPlanet?.key].filter(Boolean)) || strongestSupport(chart);
  const rulerArea = HOUSE_AREAS[Number(ruler?.house || 0)] || ruler?.houseArea || 'связанную жизненную сферу';
  const degree = activeCusp?.degreeLabel ? `, ${activeCusp.degreeLabel}` : '';
  const decision = `Клон не стал бы пытаться решить всё одним окончательным ответом. Сначала он постарался бы ${entry}, а затем выбрал бы небольшой ход, который можно проверить без необратимых последствий.`;
  const why = [
    `Сфера «${HOUSE_AREAS[category.house] || category.title}» начинается у клона в знаке ${sign}${degree}. Поэтому вход в эту тему строится через ${value}.`,
    ruler ? `Управитель сферы, ${ruler.name}, находится ${ruler.house ? `в ${ruler.house} доме` : 'в карте'}${ruler.sign ? ` в знаке ${ruler.sign}` : ''}. Это переносит решение в область «${rulerArea}»: ход должен быть жизнеспособен и там.` : '',
    actionPlanet && actionPlanet.key !== rulerKey ? `${actionPlanet.name} в ${actionPlanet.sign}${actionPlanet.house ? `, ${actionPlanet.house} дом` : ''} уточняет способ действия: модели важно получить ясную обратную связь от реального шага.` : '',
  ].filter(Boolean).join(' ');
  const otherSign = CONTRAST_SIGN[sign] || 'Овен';
  const [otherEntry] = SIGN_STYLE[otherSign] || SIGN_STYLE.Овен;
  const contrast = `Если бы эта сфера начиналась в знаке ${otherSign}, модель прежде всего пыталась бы ${otherEntry}. У вашего клона она начинается в ${sign}, поэтому его собственный подход строится через ${value}.`;
  let advantage;
  if (support) {
    const from = support.fromName || planet(chart, support.from)?.name || support.from;
    const to = support.toName || planet(chart, support.to)?.name || support.to;
    advantage = `${from} и ${to} связаны гармоничным аспектом «${support.type}»${Number.isFinite(Number(support.orb)) ? ` с орбисом ${Number(support.orb).toFixed(1)}°` : ''}. Клону легче соединить функции этих планет в одном ходе, а не выбирать одну ценой другой.`;
  } else if (actionPlanet) {
    advantage = `${actionPlanet.name} находится в стихии «${actionPlanet.element}». Это даёт естественную опору через ${value}, если перевести её в конкретное действие.`;
  } else {
    advantage = 'Преимущество клона состоит в возможности проверить решение небольшим обратимым шагом и получить фактическую обратную связь.';
  }
  const move = `Первым делом клон предложил бы ${firstMove(category)}. Признак пользы: после этого станет меньше неопределённости и появится факт для следующего решения.`;
  return { house:category.house, sign, cusp:activeCusp, ruler, support, decision, why, contrast, advantage, firstMove:move,
    compactSummary:`Ход: ${decision} Причина: ${why} Преимущество: ${advantage} Первый шаг: ${move}` };
}

function renderDemo() {
  if (!state.demo) return;
  $('#cloneName').textContent = state.cloneName;
  $('#resultSituation').textContent = state.situation;
  $('#cloneDecision').textContent = state.demo.decision;
  $('#cloneWhy').textContent = state.demo.why;
  $('#cloneContrast').textContent = state.demo.contrast;
  $('#cloneAdvantage').textContent = state.demo.advantage;
  $('#cloneFirstMove').textContent = state.demo.firstMove;
  showStage('#resultStage'); persist();
  goal('clone_live_first_answer');
  track('card_opened','clone_live_demo_answered',{house:state.demo.house,sign:state.demo.sign});
}

function selectedPlaceValue(item) { return `${item.label || item.name}\u001f${item.latitude}\u001f${item.longitude}`; }

async function createChart(form) {
  const data = new FormData(form); const place = $('#placeValue').value;
  if (!place || !state.selectedPlace) throw new Error('Выберите место рождения из подсказки.');
  const name = String(data.get('name') || '').trim();
  const result = await json('/api/charts',{method:'POST',body:JSON.stringify({
    name,date:data.get('date'),time:data.get('time'),place,visitorId:visitorId(),product:'clone',experience:'live',
  })});
  state.chartId=result.id; state.token=result.accessToken; state.chart=result.chart;
  state.cloneName=name || result.chart?.person?.name || 'Ваш Звёздный клон';
  state.demo=buildDemo(state.chart,state.category); persist(); return result;
}

function addMessage(role,text) {
  const article=document.createElement('article'); article.className=`message ${role}`;
  article.innerHTML=`<b>${role==='clone'?'Звёздный клон':'Вы'}</b><p>${escapeHtml(text)}</p>`;
  $('#messages').append(article); $('#messages').scrollTop=$('#messages').scrollHeight; return article;
}
function setAsking(busy) {
  state.asking=busy; const button=$('#dialogueForm button[type="submit"]'); const input=$('#dialogueQuestion');
  if(button){button.disabled=busy;button.textContent=busy?'Клон продолжает мысль…':'Продолжить';}
  if(input)input.disabled=busy;
}
async function claimChart(){if(state.chartId&&state.user)await json(`/api/charts/${encodeURIComponent(state.chartId)}/claim`,{method:'POST',body:'{}'});}
function stopAuthPoll(){if(state.authPoll)clearInterval(state.authPoll);state.authPoll=null;state.authStartedAt=0;}

function revealDialogue() {
  $('#telegramSection').classList.add('hidden'); $('#dialogueSection').classList.remove('hidden');
  if (!$('#messages').children.length) addMessage('clone','Карта, исходная ситуация и первый разбор сохранены. Продолжайте с новым обстоятельством или уточнением.');
  $('#dialogueQuestion').focus(); persist();
}

async function finishExistingLogin() {
  if (!state.user) return false;
  try { await claimChart(); revealDialogue(); renderOfferButtons(); goal('clone_live_telegram_saved'); return true; }
  catch(error){toast(error.message);return false;}
}

function startAuthPoll() {
  stopAuthPoll(); state.authStartedAt=Date.now();
  state.authPoll=setInterval(async()=>{
    if(Date.now()-state.authStartedAt>180000){stopAuthPoll();toast('Вход не завершён. Кнопка Telegram остаётся доступной.');return;}
    try{
      const config=await json('/api/config');state.config=config;if(!config.user)return;
      state.user=config.user;await claimChart();stopAuthPoll();
      track('filter_changed','clone_live_login_succeeded');goal('clone_live_telegram_saved');revealDialogue();renderOfferButtons();
    }catch{}
  },1200);
}

async function mountTelegram() {
  if (state.user) { await finishExistingLogin(); return; }
  const box=$('#telegramBox');box.innerHTML='<div class="telegram-login-slot"><span>Загружаем безопасный вход Telegram…</span></div>';
  const slot=box.querySelector('.telegram-login-slot');
  if(!state.config?.telegramConfigured){slot.textContent='Вход временно недоступен. Проверьте подключение Telegram-бота.';return;}
  track('auth_opened','clone_live_auth_opened');
  const script=document.createElement('script');script.async=true;script.src='https://telegram.org/js/telegram-widget.js?22';
  script.dataset.telegramLogin=state.config.telegramBotUsername;script.dataset.size='large';script.dataset.radius='12';
  script.dataset.userpic='true';script.dataset.requestAccess='write';
  const callback=new URL('/auth/telegram/callback',location.origin);callback.searchParams.set('state',`clone:${state.chartId||''}`);
  script.dataset.authUrl=callback.toString();slot.innerHTML='<span>После входа экран продолжит работу автоматически.</span>';slot.prepend(script);startAuthPoll();
}

function preparedQuestion(question) {
  if(state.contextSynced)return { text: question, carriesContext: false };
  return {
    text:`Это продолжение уже полученного разбора Живой карты решений.\n\nИсходная ситуация: ${state.situation}\n\nПервый вывод: ${state.demo?.compactSummary||''}\n\nНовая реплика человека: ${question}\n\nНе начинай разбор заново. Продолжи диалог, учитывая исходную ситуацию и найденную логику.`,
    carriesContext: true,
  };
}

async function ask(question) {
  if(state.asking)return;setAsking(true);$('#dialogueError').textContent='';
  addMessage('user',question);const pending=addMessage('clone','Сопоставляю новое обстоятельство с картой и предыдущим выводом…');
  const prepared=preparedQuestion(question);
  try{
    const result=await json('/api/consult',{method:'POST',body:JSON.stringify({chartId:state.chartId,question:prepared.text,product:'clone',experience:'live'})});
    pending.querySelector('p').textContent=result.answer;
    if(prepared.carriesContext){state.contextSynced=true;persist();}
    track('consultant_opened','clone_live_dialogue_answered',{answerLength:String(result.answer||'').length});
  }catch(error){pending.remove();if(error.code==='CLONE_FREE_LIMIT')openPaywall();else $('#dialogueError').textContent=error.message;}
  finally{setAsking(false);}
}

function formatPrice(value){return `${new Intl.NumberFormat('ru-RU').format(Number(value||0))} ₽`;}
function renderOfferButtons(){
  const day=state.config?.cloneOffers?.day,alignment=state.config?.cloneOffers?.alignment;
  if(day)$('#dayOffer').textContent=`${day.title} · ${formatPrice(day.amount)}`;
  if(alignment)$('#alignmentOffer').textContent=`${alignment.title} · ${formatPrice(alignment.payableAmount||alignment.amount)}`;
  if(state.user?.cloneAccessActive)$('#accessBadge').textContent=state.user.clonePlan==='alignment'?'Доступ на 30 дней активен':'Глубокий доступ активен';
}
function openPaywall(){renderOfferButtons();$('#paywall').classList.remove('hidden');track('paywall_opened','clone_live_paywall_opened');goal('clone_live_paywall');}
function closePaywall(){$('#paywall').classList.add('hidden');}
function receiptContact(){
  const raw=String($('#receiptContact').value||'').trim();const email=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw);const digits=raw.replace(/\D/g,'');
  if(!email&&(digits.length<10||digits.length>15)){toast('Укажите действующий телефон или email для электронного чека.');$('#receiptContact').focus();return '';}
  return email?raw.toLowerCase():`+${digits}`;
}
async function startPayment(offerCode){
  if(!state.user){closePaywall();await mountTelegram();toast('Сначала сохраните клона через Telegram.');return;}
  if(!state.config?.paymentsConfigured){toast('Оплата временно недоступна. Связаться можно в Telegram @ainicki.');return;}
  const contact=receiptContact();if(!contact)return;const button=offerCode==='clone_alignment'?$('#alignmentOffer'):$('#dayOffer'];button.disabled=true;
  try{
    const result=await json('/api/payments/create',{method:'POST',body:JSON.stringify({chartId:state.chartId,receiptContact:contact,product:'clone_live',offerCode})});
    if(!result.confirmationUrl)throw new Error('ЮKassa не вернула ссылку оплаты.');
    location.href=result.confirmationUrl;
  }catch(error){toast(error.message);button.disabled=false;}
}

async function restore() {
  const saved=stored();if(!saved?.chartId||!saved?.token||!saved?.situation||!saved?.demo)return false;
  Object.assign(state,{situation:saved.situation,category:saved.category||classifySituation(saved.situation),chartId:saved.chartId,token:saved.token,cloneName:saved.cloneName||'Ваш Звёздный клон',demo:saved.demo,contextSynced:Boolean(saved.contextSynced)});
  try{
    const [chartData,config]=await Promise.all([json(`/api/charts/${encodeURIComponent(state.chartId)}`),json('/api/config')]);
    state.chart=chartData.chart;state.config=config;state.user=config.user;renderDemo();
    if(state.user){await claimChart().catch(()=>{});revealDialogue();renderOfferButtons();}
    return true;
  }catch{return false;}
}

function resetFlow(){
  localStorage.removeItem(STORAGE_KEY);stopAuthPoll();Object.assign(state,{situation:'',category:null,chartId:null,token:null,chart:null,cloneName:'Ваш Звёздный клон',selectedPlace:null,demo:null,contextSynced:false,asking:false});
  $('#situationForm').reset();$('#birthForm').reset();$('#placeValue').value='';$('#messages').innerHTML='';
  $('#telegramSection').classList.remove('hidden');$('#dialogueSection').classList.add('hidden');showStage('#situationStage');
}

function bindSituation(){
  $$('.suggestions button').forEach(button=>button.addEventListener('click',()=>{$('#situation').value=button.textContent;$('#situation').focus();}));
  $('#situationForm').addEventListener('submit',event=>{
    event.preventDefault();const situation=String($('#situation').value||'').trim();
    if(situation.length<20){toast('Опишите ситуацию немного подробнее.');return;}
    state.situation=situation;state.category=classifySituation(situation);const understood=understandingFor(state.category,situation);
    $('#understandingTitle').textContent=understood.title;$('#understandingText').textContent=understood.text;$('#originalSituation').textContent=`«${understood.original}»`;
    showStage('#understandingStage');track('form_started','clone_live_situation_understood',{category:state.category.id,house:state.category.house});goal('clone_live_situation');
  });
  $('#continueToBirth').addEventListener('click',()=>showStage('#birthStage'));$('#editSituation').addEventListener('click',()=>showStage('#situationStage'));
}

function bindPlaceSearch(){
  let timer;$('#placeQuery').addEventListener('input',()=>{
    state.selectedPlace=null;$('#placeValue').value='';clearTimeout(timer);const query=$('#placeQuery').value.trim();
    if(query.length<2){$('#placeResults').innerHTML='';return;}
    timer=setTimeout(async()=>{try{
      const data=await json(`/api/places?q=${encodeURIComponent(query)}`);
      $('#placeResults').innerHTML=(data.items||[]).slice(0,7).map((item,index)=>`<button type="button" data-index="${index}">${escapeHtml(item.label||item.name)}</button>`).join('');
      $$('#placeResults button').forEach(button=>button.addEventListener('click',()=>{const item=data.items[Number(button.dataset.index)];state.selectedPlace=item;$('#placeQuery').value=item.label||item.name;$('#placeValue').value=selectedPlaceValue(item);$('#placeResults').innerHTML='';}));
    }catch{$('#placeResults').innerHTML='';}},280);
  });
}

function bindBirth(){
  $('#birthForm').addEventListener('submit',async event=>{
    event.preventDefault();$('#birthError').textContent='';showStage('#buildingStage');
    const titles=['Определяем жизненную сферу ситуации','Читаем знак и градус куспида','Находим управителя дома','Ищем преимущество в гармоничных аспектах','Собираем первый проверяемый ход'];let index=0;
    const interval=setInterval(()=>{index=Math.min(index+1,titles.length-1);$('#buildingTitle').textContent=titles[index];$$('.building-steps span').forEach((node,i)=>node.classList.toggle('active',i<=Math.min(index,3)));},720);
    try{await createChart(event.currentTarget);clearInterval(interval);renderDemo();goal('clone_live_created');track('card_opened','clone_live_created',{category:state.category.id,house:state.category.house});}
    catch(error){clearInterval(interval);showStage('#birthStage');$('#birthError').textContent=error.message;}
  });
}

function bindResult(){
  $('#contrastToggle').addEventListener('click',()=>$('#cloneContrast').classList.toggle('hidden'));$('#restartFlow').addEventListener('click',resetFlow);$('#openTelegram').addEventListener('click',mountTelegram);
  $('#dialogueForm').addEventListener('submit',event=>{event.preventDefault();const question=String($('#dialogueQuestion').value||'').trim();if(question.length<3)return;$('#dialogueQuestion').value='';ask(question);});
  $('#closePaywall').addEventListener('click',closePaywall);$('#paywall').addEventListener('click',event=>{if(event.target===$('#paywall'))closePaywall();});
  $('#dayOffer').addEventListener('click',()=>startPayment('clone_day'));$('#alignmentOffer').addEventListener('click',()=>startPayment('clone_alignment'));
}

async function init(){
  attribution();bindSituation();bindPlaceSearch();bindBirth();bindResult();track('page_view','clone_live_view');
  try{state.config=await json('/api/config');state.user=state.config.user;renderOfferButtons();}catch{state.config=null;}
  const restored=await restore();if(!restored)showStage('#situationStage');
  if(new URLSearchParams(location.search).get('payment')==='return')toast('Возврат из ЮKassa выполнен. Доступ появится после подтверждения платежа.');
}

init();
