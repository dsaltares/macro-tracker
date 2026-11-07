'use client';

import { IconCheck, IconLoader2 } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import type { MealEstimateProgress } from '@/lib/domain/diary/meal-estimate';

type Step = { id: number; label: string };

export type Activity = {
  steps: Step[];
  current: string | null;
  thoughts: string;
};

export const noActivity: Activity = { steps: [], current: null, thoughts: '' };

// The last few hundred characters of the reasoning summary are enough to show what it is on.
const thoughtsShown = 400;

const thinking = 'Thinking about the meal';

const labelOf = (progress: MealEstimateProgress) => {
  switch (progress.kind) {
    case 'thinking':
      return thinking;
    case 'searching':
      return `Searching for “${progress.query}”`;
    case 'reading':
      return `Reading ${progress.name}`;
    case 'answering':
      return 'Writing the estimate';
    case 'checking':
      return `Double-checking ${progress.names.join(', ')}`;
  }
};

let stepIds = 0;

export const withProgress = (
  activity: Activity,
  progress: MealEstimateProgress,
): Activity => {
  const label = labelOf(progress);
  const thoughts =
    progress.kind === 'thinking'
      ? (activity.thoughts + progress.text).slice(-thoughtsShown * 2)
      : activity.thoughts;
  if (label === activity.current) {
    return { ...activity, thoughts };
  }
  return {
    // Thinking comes between every step, so only what it did is kept as done.
    steps:
      activity.current === null || activity.current === thinking
        ? activity.steps
        : [...activity.steps, { id: ++stepIds, label: activity.current }],
    current: label,
    thoughts,
  };
};

export function useEstimateActivity() {
  const [activity, setActivity] = useState<Activity>(noActivity);
  const onEstimating = useCallback(
    (progress: MealEstimateProgress) =>
      setActivity((last) => withProgress(last, progress)),
    [],
  );
  const reset = useCallback(() => setActivity(noActivity), []);
  return { activity, onEstimating, reset };
}

function useElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - started) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, []);
  return seconds;
}

const lastParagraph = (thoughts: string) => {
  const paragraphs = thoughts.trim().split(/\n{2,}/);
  const last = paragraphs[paragraphs.length - 1] ?? '';
  return last.length > thoughtsShown
    ? `…${last.slice(-thoughtsShown).trimStart()}`
    : last;
};

export function EstimateActivity({
  activity,
  idle,
}: {
  activity: Activity;
  idle: string;
}) {
  const seconds = useElapsedSeconds();
  const thought = lastParagraph(activity.thoughts);
  return (
    <div className="flex flex-col gap-2 rounded-md border p-3 text-sm">
      <p role="status" className="flex items-center gap-2 font-medium">
        <IconLoader2 aria-hidden className="size-4 shrink-0 animate-spin" />
        <span className="min-w-0 flex-1">{activity.current ?? idle}…</span>
        <span className="text-muted-foreground tabular-nums">{seconds} s</span>
      </p>
      {thought === '' ? null : (
        <p className="line-clamp-4 text-muted-foreground italic">{thought}</p>
      )}
      {activity.steps.length === 0 ? null : (
        <ol aria-label="Done so far" className="flex flex-col gap-1">
          {activity.steps.map((step) => (
            <li
              key={step.id}
              className="flex items-center gap-2 text-muted-foreground"
            >
              <IconCheck aria-hidden className="size-4 shrink-0" />
              <span className="min-w-0 truncate">{step.label}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
