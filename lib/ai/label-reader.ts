import { generateText, type LanguageModel } from 'ai';
import {
  type LabelReading,
  labelReadingSchema,
} from '../domain/foods/label-reading.ts';
import {
  failedLlmCall,
  ignoreLlmCalls,
  llmCallOfStep,
  modelInfoOf,
  type RecordLlmCall,
} from './llm-calls.ts';
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

export type ReadLabelOptions = {
  // Told the call to the model, with its tokens, cost and answer.
  recordCall?: RecordLlmCall;
};

export type ReadLabel = (
  image: Uint8Array,
  options?: ReadLabelOptions,
) => Promise<LabelReadingResult>;

export type LabelReader = { readLabel: ReadLabel };

const labelReadingOutput = strictOutput('label_reading', labelReadingSchema);

export const createLabelReader = ({
  model,
}: {
  model: LanguageModel;
}): LabelReader => ({
  readLabel: async (image, { recordCall = ignoreLlmCalls } = {}) => {
    const run = {
      runId: crypto.randomUUID(),
      purpose: 'label-reading' as const,
    };
    let steps = 0;
    try {
      const { output } = await generateText({
        model,
        output: labelReadingOutput,
        instructions: labelInstructions,
        onStepEnd: (step) => {
          steps += 1;
          return recordCall(llmCallOfStep(run, step));
        },
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
      await recordCall(
        failedLlmCall(
          { ...run, step: steps, ...modelInfoOf(model) },
          messageOf(error),
        ),
      );
      return {
        read: false,
        failure: failureOf(error),
        message: messageOf(error),
      };
    }
  },
});
