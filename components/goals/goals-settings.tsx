'use client';

import { useState } from 'react';
import { GoalSettingsForm } from '@/components/goals/goal-settings-form';
import type { Profile } from '@/lib/domain/profile';

export function GoalsSettings({ profile }: { profile: Profile }) {
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <GoalSettingsForm
        profile={profile}
        submit="Save goals"
        working="Saving…"
        onSaved={() => setSaved(true)}
      />
      <p role="status" className="min-h-4 text-muted-foreground text-xs">
        {saved ? 'Goals saved.' : null}
      </p>
    </div>
  );
}
