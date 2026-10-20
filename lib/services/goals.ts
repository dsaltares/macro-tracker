import {
  findGoalOn as findGoalOnFor,
  findGoalSettings as findGoalSettingsFor,
  saveGoalSettings as saveGoalSettingsFor,
} from '../db/goals.ts';
import type { GoalSettings } from '../domain/goals/settings.ts';
import type { ServiceContext } from './context.ts';

export const findGoalSettings = ({ db, caller }: ServiceContext) =>
  findGoalSettingsFor(db, caller.userId);

export const saveGoalSettings = (
  { db, caller, now }: ServiceContext,
  settings: GoalSettings,
) => saveGoalSettingsFor(db, caller.userId, settings, now());

export const findGoalOn = ({ db, caller }: ServiceContext, date: string) =>
  findGoalOnFor(db, caller.userId, date);
