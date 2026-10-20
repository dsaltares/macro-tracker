'use client';

import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { type MouseEvent, useId } from 'react';
import { Button } from '@/components/ui/button';
import { addDays, daysBetween, isDate } from '@/lib/domain/dates';

const relativeDays: Record<number, string> = {
  [-1]: 'Yesterday',
  0: 'Today',
  1: 'Tomorrow',
};

const calendarDay = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

const calendarDayInAnotherYear = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

export const dayLabel = (date: string, today: string) => {
  const relative = relativeDays[daysBetween(today, date)];
  if (relative !== undefined) {
    return relative;
  }
  const midnight = new Date(`${date}T00:00:00Z`);
  return date.slice(0, 4) === today.slice(0, 4)
    ? calendarDay.format(midnight)
    : calendarDayInAnotherYear.format(midnight);
};

const openPicker = (event: MouseEvent<HTMLInputElement>) => {
  try {
    event.currentTarget.showPicker();
  } catch {}
};

export function DayNavigation({
  date,
  today,
  onDateChange,
}: {
  date: string;
  today: string;
  onDateChange: (date: string) => void;
}) {
  const id = useId();

  return (
    <div className="-mr-2 flex items-center">
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        onClick={() => onDateChange(addDays(date, -1))}
      >
        <IconChevronLeft className="size-5" />
        <span className="sr-only">Previous day</span>
      </Button>
      <div className="relative">
        <label
          htmlFor={id}
          className="flex h-11 min-w-24 items-center justify-center rounded-md px-2 font-medium text-sm hover:bg-muted"
        >
          <span className="sr-only">Date, </span>
          {dayLabel(date, today)}
        </label>
        <input
          id={id}
          type="date"
          required
          value={date}
          onClick={openPicker}
          onChange={(event) => {
            if (isDate(event.target.value)) {
              onDateChange(event.target.value);
            }
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="size-11"
        onClick={() => onDateChange(addDays(date, 1))}
      >
        <IconChevronRight className="size-5" />
        <span className="sr-only">Next day</span>
      </Button>
    </div>
  );
}
