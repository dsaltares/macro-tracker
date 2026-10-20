import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProfileSettingsForm } from '@/components/profile/profile-settings-form';
import { findProfile, saveProfile } from '@/lib/db/profiles';
import type { Profile } from '@/lib/domain/profile';
import { serveApi } from '@/test/api';
import { router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));

const api = serveApi({ signedInAs: 'user-1' });

const profile: Profile = {
  sex: 'male',
  birthDate: '1985-02-03',
  heightCm: 181,
  activityLevel: 'light',
};

const render = async () => {
  await saveProfile(
    api.database(),
    'user-1',
    profile,
    '2026-10-20T08:00:00.000Z',
  );
  return renderUi(<ProfileSettingsForm profile={profile} />, {
    wrap: api.wrap,
  });
};

describe('ProfileSettingsForm', () => {
  it('shows the saved profile', async () => {
    await render();

    expect(screen.getByRole('radio', { name: 'Male' })).toBeChecked();
    expect(screen.getByLabelText('Date of birth')).toHaveValue('1985-02-03');
    expect(screen.getByLabelText('Height (cm)')).toHaveValue(181);
    expect(screen.getByRole('radio', { name: /^Light/ })).toBeChecked();
  });

  it('saves a change and says so', async () => {
    const { user } = await render();

    await user.clear(screen.getByLabelText('Height (cm)'));
    await user.type(screen.getByLabelText('Height (cm)'), '180');
    await user.click(screen.getByRole('radio', { name: /^Active/ }));
    await user.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(router.refresh).toHaveBeenCalled();
    expect(await findProfile(api.database(), 'user-1')).toEqual({
      ...profile,
      heightCm: 180,
      activityLevel: 'active',
    });
  });
});
