import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OnboardingForm } from '@/components/profile/onboarding-form';
import { saveFailed } from '@/components/profile/profile-form';
import { findProfile } from '@/lib/db/profiles';
import { birthDateOutOfRange } from '@/lib/domain/profile';
import { serveApi } from '@/test/api';
import { atSearchParams, router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));

const api = serveApi({ signedInAs: 'user-1' });

type Answers = {
  sex?: string;
  birthDate?: string;
  height?: string;
  activity?: RegExp;
};

const fill = async (
  user: ReturnType<typeof renderUi>['user'],
  {
    sex = 'Female',
    birthDate = '1990-06-15',
    height = '168',
    activity = /^Moderate/,
  }: Answers = {},
) => {
  await user.click(screen.getByRole('radio', { name: sex }));
  await user.type(screen.getByLabelText('Date of birth'), birthDate);
  await user.type(screen.getByLabelText('Height (cm)'), height);
  await user.click(screen.getByRole('radio', { name: activity }));
};

const render = () =>
  renderUi(<OnboardingForm />, {
    wrap: api.wrap,
  });

const continueButton = () => screen.getByRole('button', { name: 'Continue' });

beforeEach(() => {
  atSearchParams('');
});

describe('OnboardingForm', () => {
  it('saves the profile and goes on to the goals step', async () => {
    atSearchParams('?next=%2Fdiary');
    const { user } = render();

    await fill(user, { height: '172.5', activity: /^Very active/ });
    await user.click(continueButton());

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        '/onboarding/goals?next=%2Fdiary',
      ),
    );
    expect(await findProfile(api.database(), 'user-1')).toEqual({
      sex: 'female',
      birthDate: '1990-06-15',
      heightCm: 172.5,
      activityLevel: 'very_active',
    });
  });

  it('goes on to the goals step without somewhere to go next', async () => {
    const { user } = render();

    await fill(user);
    await user.click(continueButton());

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith('/onboarding/goals'),
    );
  });

  it('asks for every answer it is missing', async () => {
    const { user } = render();

    await user.click(continueButton());

    expect(await screen.findByText('Choose your sex.')).toBeInTheDocument();
    expect(screen.getByText('Enter your date of birth.')).toBeInTheDocument();
    expect(screen.getByText('Enter your height in cm.')).toBeInTheDocument();
    expect(screen.getByText('Choose your activity level.')).toBeInTheDocument();
    expect(screen.getByLabelText('Height (cm)')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(await findProfile(api.database(), 'user-1')).toBeNull();
  });

  it('refuses someone too young to have an account', async () => {
    const { user } = render();

    await fill(user, { birthDate: '2020-01-01' });
    await user.click(continueButton());

    expect(await screen.findByText(birthDateOutOfRange)).toBeInTheDocument();
    expect(await findProfile(api.database(), 'user-1')).toBeNull();
  });

  it('refuses a height out of range', async () => {
    const { user } = render();

    await fill(user, { height: '17' });
    await user.click(continueButton());

    expect(
      await screen.findByText('Enter a height of at least 100 cm.'),
    ).toBeInTheDocument();
  });

  it('says so when the profile could not be saved, and stays', async () => {
    api.fails('profile.upsert');
    const { user } = render();

    await fill(user);
    await user.click(continueButton());

    expect(await screen.findByText(saveFailed)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });
});
