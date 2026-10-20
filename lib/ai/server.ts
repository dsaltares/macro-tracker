import { createLabelReader, type LabelReader } from './label-reader.ts';
import { resolveLanguageModel } from './model.ts';

let instance: LabelReader | null | undefined;

export const getLabelReader = (): LabelReader | null => {
  if (instance === undefined) {
    const model = resolveLanguageModel();
    instance = model === null ? null : createLabelReader({ model });
  }
  return instance;
};
