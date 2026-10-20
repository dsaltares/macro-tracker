'use client';

import { useSyncExternalStore } from 'react';
import { localDateOf } from '@/lib/domain/dates';

const subscribeToNothing = () => () => {};

export const useToday = () =>
  useSyncExternalStore(
    subscribeToNothing,
    () => localDateOf(new Date()),
    () => null,
  );
