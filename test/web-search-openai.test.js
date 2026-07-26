import test from 'node:test';
import assert from 'node:assert/strict';
import {
  performWebSearch,
  resolveWebSearchConfig,
} from '../src/web-search.js';

test('web search использует отдельный обязательный tool-call без данных карты', async () => {
  let captured = null;
  const client = {
    responses: {
      async create(payload) {
        captured = payload;
        return {
          output: [
            {
              type: 'web_search_call',
              status: 'completed',
              action: {
                type: 'search',
                sources: [{ type: 'url', url: 'https://example.com/current' }],
              },
            },
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: 'Подтверждённый вариант [1]',
                  annotations: [
                    {
                      type: 'url_citation',
                      start_index: 23,
                      end_index: 26,
                      title: 'Актуальный источник',
                      url: 'https://example.com/current',
                    },
                  ],
                },
              ],
            },
          ],
        };
      },
    },
  };

  const result = await performWebSearch({
    searchRequest: {
      query: 'Найди актуальную выставку в Казани',
      category: 'general',
    },
    policy: {
      category: 'general',
      allowedDomains: ['example.com'],
    },
    maxSources: 3,
    config: {
      ...resolveWebSearchConfig({ OPENAI_API_KEY: 'test' }),
      enabled: true,
      cacheTtlMs: 0,
    },
    client,
  });

  assert.equal(captured.tool_choice, 'required');
  assert.equal(captured.max_tool_calls, 1);
  assert.equal(captured.tools[0].type, 'web_search');
  assert.equal(captured.tools[0].external_web_access, true);
  assert.deepEqual(captured.tools[0].filters.allowed_domains, ['example.com']);
  assert.deepEqual(captured.include, ['web_search_call.action.sources']);
  assert.equal(captured.input[0].role, 'system');
  assert.equal(captured.input[1].role, 'user');
  assert.doesNotMatch(JSON.stringify(captured.input), /натальн|дата рождения|telegram|chart|portrait|history/i);
  assert.equal(result.sources.length, 1);
  assert.equal(result.citations.length, 1);
  assert.equal(result.sources[0].url, 'https://example.com/current');
});

test('web search feature flag закрыт по умолчанию', () => {
  assert.equal(resolveWebSearchConfig({ OPENAI_API_KEY: 'test' }).enabled, false);
  assert.equal(
    resolveWebSearchConfig({ OPENAI_API_KEY: 'test', WEB_SEARCH_ENABLED: 'true' }).enabled,
    true,
  );
  assert.equal(
    resolveWebSearchConfig({ OPENAI_API_KEY: 'test', WEB_SEARCH_ENABLED: 'maybe' }).enabled,
    false,
  );
  assert.equal(
    resolveWebSearchConfig({
      OPENAI_API_KEY: 'test',
      WEB_SEARCH_ENABLED: 'true',
      WEB_SEARCH_FREE_DAILY_LIMIT: '0',
    }).freeDailyLimit,
    1,
  );
});

test('цитата принимается только из реально посещённых tool sources', async () => {
  const client = {
    responses: {
      async create() {
        return {
          output: [
            {
              type: 'web_search_call',
              action: {
                sources: [{ type: 'url', url: 'https://trusted.example/real' }],
              },
            },
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: 'Подмена [1]',
                  annotations: [{
                    type: 'url_citation',
                    start_index: 8,
                    end_index: 11,
                    title: 'Подмена',
                    url: 'https://attacker.example/fake',
                  }],
                },
              ],
            },
          ],
        };
      },
    },
  };

  await assert.rejects(
    performWebSearch({
      searchRequest: { query: 'Найди проверяемый ответ', category: 'general' },
      maxSources: 3,
      config: {
        ...resolveWebSearchConfig({ OPENAI_API_KEY: 'test' }),
        enabled: true,
      },
      client,
    }),
    (error) => error.code === 'WEB_SEARCH_EMPTY',
  );
});

test('IP literals не принимаются как публичные источники', async () => {
  const client = {
    responses: {
      async create() {
        return {
          output: [
            {
              type: 'web_search_call',
              action: { sources: [{ type: 'url', url: 'https://[ff02::1]/data' }] },
            },
            {
              type: 'message',
              content: [{
                type: 'output_text',
                text: 'Источник [1]',
                annotations: [{
                  type: 'url_citation',
                  start_index: 9,
                  end_index: 12,
                  title: 'IPv6',
                  url: 'https://[ff02::1]/data',
                }],
              }],
            },
          ],
        };
      },
    },
  };

  await assert.rejects(
    performWebSearch({
      searchRequest: { query: 'Найди источник', category: 'general' },
      maxSources: 3,
      config: {
        ...resolveWebSearchConfig({ OPENAI_API_KEY: 'test' }),
        enabled: true,
      },
      client,
    }),
    (error) => error.code === 'WEB_SEARCH_EMPTY',
  );
});

test('ответ отклоняется, если provider превысил лимит подтверждённых sources', async () => {
  const text = 'Первый [1], второй [2]';
  const urls = ['https://one.example/a', 'https://two.example/b'];
  const client = {
    responses: {
      async create() {
        return {
          output: [
            {
              type: 'web_search_call',
              action: { sources: urls.map((url) => ({ type: 'url', url })) },
            },
            {
              type: 'message',
              content: [{
                type: 'output_text',
                text,
                annotations: [
                  {
                    type: 'url_citation',
                    start_index: text.indexOf('[1]'),
                    end_index: text.indexOf('[1]') + 3,
                    title: 'Первый',
                    url: urls[0],
                  },
                  {
                    type: 'url_citation',
                    start_index: text.indexOf('[2]'),
                    end_index: text.indexOf('[2]') + 3,
                    title: 'Второй',
                    url: urls[1],
                  },
                ],
              }],
            },
          ],
        };
      },
    },
  };

  await assert.rejects(
    performWebSearch({
      searchRequest: { query: 'Найди два источника', category: 'general' },
      maxSources: 1,
      config: {
        ...resolveWebSearchConfig({ OPENAI_API_KEY: 'test' }),
        enabled: true,
      },
      client,
    }),
    (error) => error.code === 'WEB_SEARCH_EMPTY',
  );
});

test('IDN allowlist нормализуется, а некорректная не становится unrestricted', async () => {
  let captured = null;
  const client = {
    responses: {
      async create(payload) {
        captured = payload;
        const url = 'https://xn--e1afmkfd.xn--p1ai/page';
        return {
          output: [
            { type: 'web_search_call', action: { sources: [{ type: 'url', url }] } },
            {
              type: 'message',
              content: [{
                type: 'output_text',
                text: 'Источник [1]',
                annotations: [{
                  type: 'url_citation',
                  start_index: 9,
                  end_index: 12,
                  title: 'Пример',
                  url,
                }],
              }],
            },
          ],
        };
      },
    },
  };

  await performWebSearch({
    searchRequest: { query: 'Найди на пример.рф', category: 'general' },
    policy: { category: 'general', allowedDomains: ['пример.рф'] },
    maxSources: 3,
    config: {
      ...resolveWebSearchConfig({ OPENAI_API_KEY: 'test' }),
      enabled: true,
    },
    client,
  });
  assert.deepEqual(
    captured.tools[0].filters.allowed_domains,
    ['xn--e1afmkfd.xn--p1ai'],
  );

  await assert.rejects(
    performWebSearch({
      searchRequest: { query: 'Найди источник', category: 'general' },
      policy: { category: 'general', allowedDomains: ['not a domain'] },
      maxSources: 3,
      config: {
        ...resolveWebSearchConfig({ OPENAI_API_KEY: 'test' }),
        enabled: true,
      },
      client,
    }),
    (error) => error.code === 'WEB_SEARCH_INVALID_DOMAINS',
  );
});

test('web search отбрасывает небезопасные и неподтверждённые ссылки', async () => {
  const client = {
    responses: {
      async create() {
        return {
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: 'Непроверенный ответ',
                  annotations: [
                    {
                      type: 'url_citation',
                      start_index: 0,
                      end_index: 12,
                      title: 'Опасная ссылка',
                      url: 'javascript:alert(1)',
                    },
                  ],
                },
              ],
            },
          ],
        };
      },
    },
  };

  await assert.rejects(
    performWebSearch({
      searchRequest: { query: 'Найди тестовый результат', category: 'general' },
      maxSources: 3,
      config: {
        ...resolveWebSearchConfig({ OPENAI_API_KEY: 'test' }),
        enabled: true,
        cacheTtlMs: 0,
      },
      client,
    }),
    (error) => error.code === 'WEB_SEARCH_EMPTY',
  );
});

test('web search строго применяет allowlist и отклоняет URL с credentials', async () => {
  const client = {
    responses: {
      async create() {
        return {
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: 'Неподходящий источник [1]',
                  annotations: [
                    {
                      type: 'url_citation',
                      start_index: 23,
                      end_index: 26,
                      title: 'Другой домен',
                      url: 'https://user:password@other.example/result',
                    },
                  ],
                },
              ],
            },
          ],
        };
      },
    },
  };

  await assert.rejects(
    performWebSearch({
      searchRequest: { query: 'Найди на example.com', category: 'general' },
      policy: { category: 'general', allowedDomains: ['example.com'] },
      maxSources: 3,
      config: {
        ...resolveWebSearchConfig({ OPENAI_API_KEY: 'test' }),
        enabled: true,
        cacheTtlMs: 0,
      },
      client,
    }),
    (error) => error.code === 'WEB_SEARCH_EMPTY',
  );
});
