import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import {
  CLONE_FREE_PROFILE_ID,
  CLONE_PREMIUM_PROFILE_ID,
  consultationProfiles,
} from '../src/consultation-profiles.js';

const html = readFileSync(new URL('../public/clone/live/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/clone-live.css', import.meta.url), 'utf8');
const safetyCss = readFileSync(new URL('../public/clone-live-safety.css', import.meta.url), 'utf8');
const jsPath = new URL('../public/clone-live.js', import.meta.url);
const js = readFileSync(jsPath, 'utf8');
const quotaPath = new URL('../src/clone-quota.js', import.meta.url);
const quota = readFileSync(quotaPath, 'utf8');
const paymentsPath = new URL('../src/payments.js', import.meta.url);
const payments = readFileSync(paymentsPath, 'utf8');
const commercePath = new URL('../src/commerce.js', import.meta.url);
const commerce = readFileSync(commercePath, 'utf8');

test('clone live frontend and server helpers have valid JavaScript', () => {
  for (const path of [jsPath, quotaPath, paymentsPath, commercePath]) {
    execFileSync(process.execPath, ['--check', path.pathname], { stdio: 'pipe' });
  }
});

test('clone live route follows situation-first flow and shows value before Telegram', () => {
  for (const id of [
    'situationStage', 'understandingStage', 'birthStage', 'buildingStage',
    'resultStage', 'telegramSection', 'dialogueSection',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Что вы хотите[\s\S]*сейчас решить/);
  assert.match(html, /Первый полный ответ/);
  assert.match(html, /Преимущество вашего клона/);
  assert.match(html, /Почему это индивидуально/);
  assert.match(html, /Telegram сохранит карту, ситуацию и этот разбор/);
  assert.ok(html.indexOf('Первый полный ответ') < html.indexOf('Сохранить клона через Telegram'));
});

test('birth data has explicit consent and the canonical Metrika counter', () => {
  assert.match(html, /name="personalDataConsent"[^>]*required/);
  assert.match(html, /110937602/);
  assert.match(html, /clone-live-safety\.css/);
  assert.match(safetyCss, /\.consent-check/);
  assert.match(js, /personalDataConsent:true/);
});

test('clone live keeps anonymous value before Telegram and then continues through existing APIs', () => {
  const chartCreation = js.indexOf("json('/api/charts'");
  const localDemo = js.indexOf('buildDemo(state.chart, state.category)');
  const telegramMount = js.indexOf('async function mountTelegram()');
  const consultation = js.indexOf("json('/api/consult'");
  assert.ok(chartCreation > -1);
  assert.ok(localDemo > chartCreation);
  assert.ok(telegramMount > localDemo);
  assert.ok(consultation > telegramMount);
  assert.match(js, /callback\.searchParams\.set\('state', `clone:\$\{state\.chartId \|\| ''\}`\)/);
  assert.match(js, /await claimChart\(\)/);
  assert.match(js, /if \(state\.user\) \{[\s\S]*await finishExistingLogin\(\)/);
  assert.match(js, /if \(prepared\.carriesContext\) \{[\s\S]*state\.contextSynced = true;[\s\S]*persist\(\)/);
  assert.match(js, /\/api\/charts\/\$\{encodeURIComponent\(state\.chartId\)\}\/messages/);
});

test('clone live reads Placidus cusps from the real chart structure', () => {
  assert.match(js, /chart\?\.houses\?\.cusps/);
  assert.doesNotMatch(js, /\(chart\?\.houses \|\| \[\]\)\.find/);
  assert.match(js, /activeCusp\?\.degreeLabel/);
  assert.match(js, /const RULERS/);
  assert.match(js, /strongestSupport/);
  assert.match(js, /CONTRAST_SIGN/);
  assert.match(html, /Это не гарантия удачи/);
});

test('clone live uses a quiet 24-hour trial with at least three completed answers', () => {
  assert.match(quota, /LIVE_TRIAL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(quota, /LIVE_MIN_ANSWERS = 3/);
  assert.match(quota, /timeOpen \|\| minimumOpen/);
  assert.match(quota, /metadata->>'product'.*= 'clone_live'/s);
  assert.match(quota, /experience = 'live'/);
  assert.doesNotMatch(html, /осталось \d|из 3 вопросов|таймер/i);
});

test('payments return each clone experience to its canonical route and are verified', () => {
  assert.match(js, /product:'clone_live'/);
  assert.match(js, /PAYMENT_KEY = 'starCloneLivePayment'/);
  assert.match(js, /\/api\/payments\/status\?\$\{query\}/);
  assert.match(js, /if \(status\.paid\)/);
  assert.match(payments, /function cloneReturnPath\(requestedProduct\)/);
  assert.match(payments, /requestedProduct === 'clone_live' \? '\/clone\/live\/' : '\/clone\/'/);
  assert.match(payments, /payment_ref=/);
  assert.match(payments, /experience = requestedProduct === 'clone_live' \? 'live' : 'standard'/);
});

test('approved tariffs are 7 days for 490 and 30 days for 990 without autorenew', () => {
  assert.match(commerce, /title: '7 дней со Звёздным клоном'/);
  assert.match(commerce, /490/);
  assert.match(commerce, /durationHours: 7 \* 24/);
  assert.match(commerce, /title: '30 дней \+ полная карта HeroStar'/);
  assert.match(commerce, /990/);
  assert.match(commerce, /INTERVAL '7 days'/);
  assert.doesNotMatch(commerce, /autoRenew/);
});

test('clone profiles express the new astrological mechanism and memory model', () => {
  assert.equal(CLONE_FREE_PROFILE_ID, 'clone-free-v2');
  assert.equal(CLONE_PREMIUM_PROFILE_ID, 'clone-premium-v2');
  const free = consultationProfiles[CLONE_FREE_PROFILE_ID];
  const premium = consultationProfiles[CLONE_PREMIUM_PROFILE_ID];
  assert.match(free.questionInstruction, /точный градус куспида/);
  assert.match(free.questionInstruction, /Преимущество вашего клона/);
  assert.match(free.questionInstruction, /индивидуальный контраст/);
  assert.match(premium.systemPromptAddon, /подтверждённые человеком наблюдения/);
  assert.match(premium.systemPromptAddon, /фактор карты, гипотеза клона и подтверждённое опытом/);
  assert.match(premium.systemPromptAddon, /Северный узел/);
});

test('clone live layout has responsive contracts', () => {
  assert.match(css, /@media\(max-width:900px\)/);
  assert.match(css, /@media\(max-width:620px\)/);
  assert.match(css, /\.result-shell/);
  assert.match(css, /\.telegram-after-value/);
});
