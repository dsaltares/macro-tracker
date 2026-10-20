'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ProfileForm } from '@/components/profile/profile-form';
import type { Profile } from '@/lib/domain/profile';

export function ProfileSettingsForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <ProfileForm
        profile={profile}
        submit="Save profile"
        working="Saving…"
        onSaved={() => {
          setSaved(true);
          router.refresh();
        }}
      />
      <p role="status" className="min-h-4 text-muted-foreground text-xs">
        {saved ? 'Profile saved.' : null}
      </p>
    </div>
  );
}
