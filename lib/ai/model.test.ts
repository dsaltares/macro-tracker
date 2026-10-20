import { describe, expect, it } from 'vitest';
import { defaultModels, resolveLanguageModel } from './model.ts';

describe('resolveLanguageModel', () => {
  it('resolves no model without an API key', () => {
    expect(resolveLanguageModel({ provider: 'openai', apiKey: '' })).toBeNull();
  });

  it('resolves the named model of the provider', () => {
    const model = resolveLanguageModel({
      provider: 'openai',
      model: 'gpt-5.4',
      apiKey: 'sk-test',
    });

    expect(model).toMatchObject({ modelId: 'gpt-5.4' });
    expect(model).toHaveProperty('provider', expect.stringMatching(/^openai/));
  });

  it('falls back to the provider’s default model', () => {
    expect(
      resolveLanguageModel({
        provider: 'openai',
        model: '',
        apiKey: 'sk-test',
      }),
    ).toMatchObject({ modelId: defaultModels.openai });
  });

  it('refuses a provider it does not know', () => {
    expect(() =>
      resolveLanguageModel({ provider: 'acme', apiKey: 'sk-test' }),
    ).toThrow('AI_PROVIDER is acme; it must be one of openai');
  });
});
