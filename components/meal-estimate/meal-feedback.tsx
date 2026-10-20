'use client';

import { useState } from 'react';
import { FormError, TextField } from '@/components/auth/fields';
import { UploadProgress } from '@/components/label-scan/label-capture';
import {
  type EstimateError,
  requestMealEstimate,
} from '@/components/meal-estimate/estimate';
import {
  estimateErrorMessages,
  type MealPhoto,
} from '@/components/meal-estimate/meal-photo-step';
import { Button } from '@/components/ui/button';
import {
  type MealDraft,
  maxFeedbackRounds,
  maxMealDescriptionLength,
} from '@/lib/domain/diary/meal-estimate';

export const feedbackHint = 'the rice is brown, double the chicken, no sauce';

export const feedbackRoundsSpent = `All ${maxFeedbackRounds} rounds of changes are used. Edit the rows instead.`;

export const roundsLeftHint = (left: number) =>
  `${left} of ${maxFeedbackRounds} rounds left, for example: ${feedbackHint}`;

type FeedbackState =
  | { step: 'writing' }
  | { step: 'uploading'; sent: number }
  | { step: 'revising' }
  | { step: 'failed'; error: EstimateError };

export function MealFeedback({
  photos,
  description,
  draft,
  roundsLeft,
  onRevised,
}: {
  photos: readonly MealPhoto[];
  description: string;
  draft: MealDraft;
  roundsLeft: number;
  onRevised: (sent: MealDraft, revised: MealDraft) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [state, setState] = useState<FeedbackState>({ step: 'writing' });
  const busy = state.step === 'uploading' || state.step === 'revising';
  const spent = roundsLeft <= 0;

  const send = async () => {
    const sent = draft;
    setState({ step: 'uploading', sent: 0 });
    const result = await requestMealEstimate(
      {
        photos: photos.map(({ blob }) => blob),
        description,
        previous: { draft: sent, feedback: feedback.trim() },
      },
      (progress) =>
        setState(
          progress < 1
            ? { step: 'uploading', sent: progress }
            : { step: 'revising' },
        ),
    );
    if (result.estimated) {
      onRevised(sent, result.draft);
    } else {
      setState({ step: 'failed', error: result.error });
    }
  };

  return (
    <section aria-label="Feedback" className="flex flex-col gap-2">
      <TextField
        label="Ask for changes"
        hint={spent ? undefined : roundsLeftHint(roundsLeft)}
        warning={spent ? feedbackRoundsSpent : undefined}
        placeholder={feedbackHint}
        autoComplete="off"
        maxLength={maxMealDescriptionLength}
        disabled={busy || spent}
        value={feedback}
        onChange={(event) => setFeedback(event.target.value)}
      />
      {state.step === 'failed' ? (
        <FormError>{estimateErrorMessages[state.error]}</FormError>
      ) : null}
      {state.step === 'uploading' ? (
        <UploadProgress sent={state.sent} label="Sending the photos" />
      ) : null}
      {state.step === 'revising' ? (
        <p role="status" className="text-center text-muted-foreground text-sm">
          Revising the meal…
        </p>
      ) : null}
      {busy ? null : (
        <Button
          variant="outline"
          className="h-11 self-start"
          disabled={spent || feedback.trim() === ''}
          onClick={() => void send()}
        >
          Send
        </Button>
      )}
    </section>
  );
}
