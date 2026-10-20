'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { type Choice, ChoiceField } from '@/components/profile/choice-field';

type Theme = 'light' | 'dark' | 'system';

const themeChoices: readonly Choice<Theme>[] = [
  { value: 'system', label: 'System', description: 'Follow this device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function ThemeSetting() {
  const { theme, setTheme } = useTheme();
  const [chosen, setChosen] = useState<Theme | undefined>(undefined);

  useEffect(() => setChosen(theme as Theme | undefined), [theme]);

  return (
    <ChoiceField
      label="Theme"
      choices={themeChoices}
      value={chosen}
      onValueChange={setTheme}
    />
  );
}
