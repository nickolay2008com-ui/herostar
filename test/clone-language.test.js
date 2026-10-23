import assert from 'node:assert/strict';
import test from 'node:test';
import { consultationSystemPrompt } from '../src/ai.js';
import { generateCloneAi } from '../src/clone-ai-provider.js';
import { selectConsultationFactors } from '../src/consultation-factors.js';
import { explicitWebSearchIntent, classifySearchPolicy } from '../src/web-search-intent.js';

test('Clone instructions explicitly keep the selected language across both AI providers', async () => {
  for (const [language, expected, heading] of [
    ['en', /английском языке/, 'What to check first:'],
    ['it', /итальянском языке/, 'Cosa verificare per primo:'],
  ]) {
    const instructions = consultationSystemPrompt('deep', 'clone', false, false, language);
    assert.match(instructions, expected);
    let freeInstructions = '';
    const result = await generateCloneAi({
      instructions,
      language,
      freeLlm: async ({ instructions: value }) => {
        freeInstructions = value;
        return { text: 'answer', provider: 'test', model: 'test' };
      },
      gemini: async () => { throw new Error('Gemini should not be called'); },
    });
    assert.equal(result.text, 'answer');
    assert.match(freeInstructions, expected);
    assert.ok(freeInstructions.includes(heading));
    assert.doesNotMatch(freeInstructions, /начни ровно словами «Что проверить первым:»/);
  }
});

test('Italian web-search intent keeps negation and high-stakes boundaries', () => {
  assert.equal(explicitWebSearchIntent('Cerca sul web gli orari del museo oggi'), true);
  assert.equal(explicitWebSearchIntent('Non cercare online gli orari del museo'), false);
  const medical = 'Cerca sul web una medicina per i sintomi';
  assert.equal(explicitWebSearchIntent(medical), true);
  assert.equal(classifySearchPolicy(medical).allowed, false);
});

test('English and Italian questions select the same relevant chart area', () => {
  const chart = {
    birth: { unknownTime: false },
    houses: { cusps: [{ house: 7, sign: 'Рыбы', degreeLabel: '12°', area: 'отношения' }] },
    planets: [
      { key: 'venus', name: 'Венера', sign: 'Стрелец' },
      { key: 'moon', name: 'Луна', sign: 'Телец' },
    ],
  };
  for (const question of ['How do I choose a partner for a relationship?', 'Come scegliere un partner per una relazione?']) {
    const result = selectConsultationFactors({ chart, question });
    assert.equal(result.factors[0]?.id, 'house:7');
  }
});
