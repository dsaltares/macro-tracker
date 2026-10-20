import {
  APICallError,
  generateText,
  jsonSchema,
  type LanguageModel,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
} from 'ai';
import { z } from 'zod';
import {
  type LabelReading,
  labelReadingSchema,
} from '../domain/foods/label-reading.ts';
import { labelInstructions, labelRequest } from './prompts/label.ts';

export type LabelReadingFailure =
  | 'unreadable'
  | 'rejected'
  | 'rate-limited'
  | 'unavailable';

export type LabelReadingResult =
  | { read: true; reading: LabelReading }
  | { read: false; failure: LabelReadingFailure; message: string };

export type ReadLabel = (image: Uint8Array) => Promise<LabelReadingResult>;

export type LabelReader = { readLabel: ReadLabel };

const keywordsStrictOutputsRefuse = ['minLength', 'maxLength'];

const modelFacingSchema = z.toJSONSchema(labelReadingSchema, {
  override: ({ jsonSchema: node }) => {
    for (const keyword of keywordsStrictOutputsRefuse) {
      delete node[keyword];
    }
  },
});

const labelReadingOutput = Output.object({
  name: 'label_reading',
  schema: jsonSchema<LabelReading>(modelFacingSchema as never, {
    validate: (value) => {
      const parsed = labelReadingSchema.safeParse(value);
      return parsed.success
        ? { success: true, value: parsed.data }
        : { success: false, error: parsed.error };
    },
  }),
});

const tooManyRequests = 429;
const firstServerError = 500;

const failureOf = (error: unknown): LabelReadingFailure => {
  if (
    NoObjectGeneratedError.isInstance(error) ||
    NoOutputGeneratedError.isInstance(error)
  ) {
    return 'unreadable';
  }
  if (!APICallError.isInstance(error)) {
    return 'unavailable';
  }
  if (error.statusCode === tooManyRequests) {
    return 'rate-limited';
  }
  return error.statusCode === undefined || error.statusCode >= firstServerError
    ? 'unavailable'
    : 'rejected';
};

const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export const createLabelReader = ({
  model,
}: {
  model: LanguageModel;
}): LabelReader => ({
  readLabel: async (image) => {
    try {
      const { output } = await generateText({
        model,
        output: labelReadingOutput,
        instructions: labelInstructions,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: labelRequest },
              { type: 'file', data: image, mediaType: 'image' },
            ],
          },
        ],
      });
      return { read: true, reading: output };
    } catch (error) {
      return {
        read: false,
        failure: failureOf(error),
        message: messageOf(error),
      };
    }
  },
});
