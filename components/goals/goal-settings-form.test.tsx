import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  invalidAmount,
  saveFailed,
} from '@/components/goals/goal-settings-form';
import { GoalsSettings } from '@/components/goals/goals-settings';
import { OnboardingGoalsForm } from '@/components/goals/onboarding-goals-form';
import { logMeasurement } from '@/lib/db/body-measurements';
import { findGoalSettings, saveGoalSettings } from '@/lib/db/goals';
import { localDateOf } from '@/lib/domain/dates';
import { energyGoal } from '@/lib/domain/goals/energy';
import { defaultGoalSettings } from '@/lib/domain/goals/settings';
import { formatAmount } from '@/lib/domain/nutrition/format';
import type { Profile } from '@/lib/domain/profile';
import { serveApi } from '@/test/api';
import { atSearchParams, router } from '@/test/next-navigation';
import { renderUi } from '@/test/ui';

vi.mock('next/navigation', () => import('@/test/next-navigation'));

const api = serveApi({ signedInAs: 'user-1' });

const today = localDateOf(new Date());

const profile: Profile = {
  sex: 'female',
  birthDate: '1990-06-15',
  heightCm: 168,
  activityLevel: 'moderate',
};

const weightKg = 70;

const logWeight = (value = weightKg) =>
  logMeasurement(
    api.database(),
    'user-1',
    { date: today, metric: 'weight_kg', value },
    { now: () => '2026-10-20T08:00:00.000Z', nextId: () => 'weight-1' },
  );

const savedSettings = () => findGoalSettings(api.database(), 'user-1');

const kcal = (amount: number) => formatAmount(amount, 'kcal');

const energyAt = (weeklyRateKg: number) =>
  energyGoal(profile, weightKg, today, weeklyRateKg);

const render = () =>
  renderUi(<GoalsSettings profile={profile} />, { wrap: api.wrap });

const energyPanel = () =>
  screen.findByRole('region', { name: 'Energy and macros' });

const amount = (panel: HTMLElement, label: string) =>
  within(panel).getByText(label, { selector: 'dt' }).nextElementSibling
    ?.textContent;

const saveButton = () => screen.getByRole('button', { name: 'Save goals' });

beforeEach(() => {
  atSearchParams('');
});

describe('GoalSettingsForm', () => {
  it('shows the BMR, TDEE and kcal target from the profile and latest weight', async () => {
    await logWeight();
    render();

    const panel = await energyPanel();
    const energy = energyAt(0);
    expect(amount(panel, 'BMR')).toBe(kcal(energy.bmr));
    expect(amount(panel, 'TDEE')).toBe(kcal(energy.tdee));
    expect(amount(panel, 'Target')).toBe(kcal(energy.kcal));
    expect(amount(panel, 'Protein')).toBe('112 g');
    expect(screen.getByText('Keep your weight')).toBeInTheDocument();
  });

  it('moves the target as the weekly rate slider moves, and saves the rate', async () => {
    await logWeight();
    const { user } = render();

    const panel = await energyPanel();
    const slider = screen.getByLabelText('Weekly rate', { selector: 'input' });
    act(() => slider.focus());
    for (let step = 0; step < 10; step++) {
      await user.keyboard('{ArrowLeft}');
    }

    expect(screen.getByText('Lose 0.5 kg a week')).toBeInTheDocument();
    expect(amount(panel, 'Target')).toBe(kcal(energyAt(-0.5).kcal));

    await user.click(saveButton());

    expect(await screen.findByText('Goals saved.')).toBeInTheDocument();
    expect((await savedSettings()).weeklyRateKg).toBeCloseTo(-0.5);
  });

  it('works the macros out from protein per kg and the fat share', async () => {
    await logWeight();
    const { user } = render();

    const panel = await energyPanel();
    await user.clear(screen.getByLabelText('Protein (g per kg)'));
    await user.type(screen.getByLabelText('Protein (g per kg)'), '2');
    await user.clear(screen.getByLabelText('Fat (% of energy)'));
    await user.type(screen.getByLabelText('Fat (% of energy)'), '25');

    expect(amount(panel, 'Protein')).toBe('140 g');
    expect(amount(panel, 'Fat')).toBe(
      `${Math.round(((0.25 * energyAt(0).kcal) / 9) * 10) / 10} g`,
    );

    await user.click(saveButton());

    await expect.poll(savedSettings).toMatchObject({
      proteinGPerKg: 2,
      fatEnergyShare: 0.25,
    });
  });

  it('warns inline when protein and fat leave nothing for carbohydrate, and still saves', async () => {
    await logWeight();
    const { user } = render();

    const panel = await energyPanel();
    await user.clear(screen.getByLabelText('Fat (% of energy)'));
    await user.type(screen.getByLabelText('Fat (% of energy)'), '95');

    expect(
      within(panel).getByText(
        'Protein and fat take up all of the energy, so carbohydrate is 0 g.',
      ),
    ).toBeInTheDocument();
    expect(amount(panel, 'Carbs')).toBe('0 g');

    await user.click(saveButton());

    await expect.poll(savedSettings).toMatchObject({ fatEnergyShare: 0.95 });
  });

  it('asks for a weight before it can work out a derived target', async () => {
    const { user } = render();

    const panel = await energyPanel();
    expect(within(panel).queryByText('Target')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Your energy target is worked out from your weight/),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText('Weight (kg)'), '70');
    await user.click(screen.getByRole('button', { name: 'Log weight' }));

    await waitFor(() =>
      expect(amount(panel, 'Target')).toBe(kcal(energyAt(0).kcal)),
    );
    expect(screen.queryByLabelText('Weight (kg)')).not.toBeInTheDocument();
  });

  it('switches to manual targets, starting from the derived ones', async () => {
    await logWeight();
    const { user } = render();

    await energyPanel();
    await user.click(screen.getByRole('switch', { name: 'Set manually' }));

    expect(screen.getByLabelText('Energy (kcal)')).toHaveValue(
      Math.round(energyAt(0).kcal),
    );
    expect(screen.getByLabelText('Protein (g)')).toHaveValue(112);
    expect(
      screen.queryByLabelText('Weekly rate', { selector: 'input' }),
    ).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText('Energy (kcal)'));
    await user.type(screen.getByLabelText('Energy (kcal)'), '1800');
    await user.click(saveButton());

    await expect.poll(savedSettings).toMatchObject({
      mode: 'manual',
      overrides: { energy_kcal: 1800, protein: 112 },
    });
  });

  it('asks for an energy target in manual mode', async () => {
    await saveGoalSettings(
      api.database(),
      'user-1',
      {
        ...defaultGoalSettings,
        mode: 'manual',
        overrides: { energy_kcal: 2000 },
      },
      '2026-10-20T08:00:00.000Z',
    );
    const { user } = render();

    await user.clear(await screen.findByLabelText('Energy (kcal)'));
    await user.click(saveButton());

    expect(
      await screen.findByText('Enter an energy target.'),
    ).toBeInTheDocument();
    expect((await savedSettings()).overrides).toEqual({ energy_kcal: 2000 });
  });

  it('lists each micronutrient with its default, as a target or an upper limit', async () => {
    await logWeight();
    render();

    const micronutrients = await screen.findByRole('region', {
      name: 'Micronutrients',
    });
    expect(
      within(micronutrients).getByText('Target · default 95 mg'),
    ).toBeInTheDocument();
    expect(
      within(micronutrients).getByText('Upper limit · default 2,000 mg'),
    ).toBeInTheDocument();
    expect(within(micronutrients).getByLabelText('Vitamin C (mg)')).toHaveValue(
      null,
    );
    expect(
      screen.queryByRole('button', { name: 'Reset Vitamin C' }),
    ).not.toBeInTheDocument();
  });

  it('keeps an override, shows a way to reset it, and resets it', async () => {
    await logWeight();
    const first = render();

    await first.user.type(
      await screen.findByLabelText('Vitamin C (mg)'),
      '200',
    );
    expect(
      screen.getByRole('button', { name: 'Reset Vitamin C' }),
    ).toBeInTheDocument();
    await first.user.click(saveButton());

    await expect
      .poll(async () => (await savedSettings()).overrides)
      .toEqual({ vitamin_c: 200 });
    first.unmount();

    const { user } = render();
    expect(await screen.findByLabelText('Vitamin C (mg)')).toHaveValue(200);

    await user.click(screen.getByRole('button', { name: 'Reset Vitamin C' }));
    expect(screen.getByLabelText('Vitamin C (mg)')).toHaveValue(null);
    await user.click(saveButton());

    await expect
      .poll(async () => (await savedSettings()).overrides)
      .toEqual({});
  });

  it('refuses a negative override', async () => {
    await logWeight();
    const { user } = render();

    await user.type(await screen.findByLabelText('Iron (mg)'), '-3');
    await user.click(saveButton());

    expect(await screen.findByText(invalidAmount)).toBeInTheDocument();
    expect((await savedSettings()).overrides).toEqual({});
  });

  it('says so when the goals could not be saved', async () => {
    await logWeight();
    api.fails('goals.set');
    const { user } = render();

    await energyPanel();
    await user.click(saveButton());

    expect(await screen.findByText(saveFailed)).toBeInTheDocument();
    expect(screen.queryByText('Goals saved.')).not.toBeInTheDocument();
  });
});

describe('OnboardingGoalsForm', () => {
  it('saves the preselected defaults and goes on to where it was headed', async () => {
    atSearchParams('?next=%2Fdiary');
    const { user } = renderUi(<OnboardingGoalsForm profile={profile} />, {
      wrap: api.wrap,
    });

    await energyPanel();
    expect(screen.getByLabelText('Protein (g per kg)')).toHaveValue(1.6);
    expect(screen.getByLabelText('Fat (% of energy)')).toHaveValue(30);
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/diary'));
    expect(
      await api.database().selectFrom('goals').select('mode').execute(),
    ).toEqual([{ mode: 'derived' }]);
  });
});
