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
const jsPath = new URL('../public/clone-live.js', import.meta.url);
const js = readFileSync(jsPath, 'utf8');

test('clone live frontend has a valid JavaScript bundle', () => {
  execFileSync(process.execPath, ['--check', jsPath.pathname], { stdio: 'pipe' });
});

test('clone live route follows situation-first flow', () => {
  for (const id of [
    'situationStage',
    'understandingStage',
    'birthStage',
    'buildingStage',
    'resultStage',
    'telegramSection',
    'dialogueSection',
  ]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /Что вы хотите[\s\S]*сейчас решить/);
  assert.match(html, /Первый полный ответ/);
  assert.match(html, /Преимущество вашего клона/);
  assert.match(html, /Почему это индивидуально/);
  assert.match(html, /Telegram сохранит карту, ситуацию и этот разбор/);
});

test('clone live keeps anonymous value before Telegram and then continues through existing APIs', () => {
  const chartCreation = js.indexOf("json('/api/charts'");
  const localDemo = js.indexOf('buildDemo(state.chart, state.category)');
  const telegramMount = js.indexOf('function mountTelegram()');
  const consultation = js.indexOf("json('/api/consult'");
  assert.ok(chartCreation > -1);
  assert.ok(localDemo > chartCreation);
  assert.ok(telegramMount > localDemo);
  assert.ok(consultation > telegramMount);
  assert.match(js, /callback\.searchParams\.set\('state', `clone:\$\{state\.chartId \|\| ''\}`\)/);
  assert.match(js, /await claimChart\(\)/);
  assert.match(js, /contextSynced/);
});

test('clone live uses exact houses, cusps, rulers, support aspects and contrast', () => {
  assert.match(js, /const RULERS/);
  assert.match(js, /function cusp\(chart, house\)/);
  assert.match(js, /activeCusp\?\.degreeLabel/);
  assert.match(js, /strongestSupport/);
  assert.match(js, /CONTRAST_SIGN/);
  assert.match(js, /Это не гарантия удачи/);
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
