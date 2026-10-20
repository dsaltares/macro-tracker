import { generateText, type LanguageModel } from 'ai';
import {
  type LabelReading,
  labelReadingSchema,
} from '../domain/foods/label-reading.ts';
import { labelInstructions, labelRequest } from './prompts/label.ts';
import {
  type AiFailure,
  failureOf,
  messageOf,
  strictOutput,
} from './structured-output.ts';

export type LabelReadingFailure = AiFailure;

export type LabelReadingResult =
  | { read: true; reading: LabelReading }
  | { read: false; failure: LabelReadingFailure; message: string };

export type ReadLabel = (image: Uint8Array) => Promise<LabelReadingResult>;

export type LabelReader = { readLabel: ReadLabel };

const labelReadingOutput = strictOutput('label_reading', labelReadingSchema);

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
