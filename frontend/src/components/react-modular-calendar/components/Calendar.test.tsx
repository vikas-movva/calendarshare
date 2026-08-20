/**
 * Component tests for the top-level <Calendar>.
 *
 * Barebones skeleton: renders the component against a real DOM (happy-dom) and
 * asserts on rendered structure, activation callbacks, and the custom-render
 * extension point. It deliberately does not re-test the pure engine — that
 * coverage lives in src/core/*.test.ts.
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateTime } from 'luxon';
import { Calendar } from './Calendar';
import type { CalendarEvent, CalendarZone } from '../types';

const ZONE: CalendarZone = 'America/Toronto';

function at(iso: string): Date {
  return DateTime.fromISO(iso, { zone: ZONE }).toJSDate();
}

function timed(id: string, startIso: string, endIso: string): CalendarEvent {
  return {
    id,
    calendarId: 'cal',
    title: id,
    isAllDay: false,
    start: at(startIso),
    end: at(endIso),
  };
}

function allDay(id: string, startIso: string, endIso: string): CalendarEvent {
  return {
    id,
    calendarId: 'cal',
    title: id,
    isAllDay: true,
    start: at(startIso),
    end: DateTime.fromISO(endIso, { zone: ZONE }).plus({ days: 1 }).toJSDate(),
  };
}

describe('<Calendar> — rendering', () => {
  it('renders a grid with one column per active day', () => {
    const { container } = render(
      <Calendar
        events={[]}
        startDate={at('2024-08-18T00:00:00')}
        endDate={at('2024-08-20T00:00:00')}
        timezone={ZONE}
      />,
    );
    const grid = container.querySelector('[role="grid"]');
    expect(grid).toBeTruthy();
    const cols = container.querySelectorAll('.mc-calendar__head-cell');
    expect(cols).toHaveLength(7);
  });

  it('renders timed event chips', () => {
    const ev = timed('a', '2024-08-18T09:00:00', '2024-08-18T10:00:00');
    render(
      <Calendar
        events={[ev]}
        startDate={at('2024-08-18T00:00:00')}
        endDate={at('2024-08-18T00:00:00')}
        timezone={ZONE}
      />,
    );
    const chip = screen.getByRole('button', { name: 'a' });
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain('09:00');
  });

  it('renders all-day chips in the all-day strip', () => {
    const ev = allDay('ad', '2024-08-18', '2024-08-20');
    render(
      <Calendar
        events={[ev]}
        startDate={at('2024-08-18T00:00:00')}
        endDate={at('2024-08-20T00:00:00')}
        timezone={ZONE}
      />,
    );
    expect(screen.getByRole('button', { name: 'ad' })).toBeTruthy();
  });
});

describe('<Calendar> — activation', () => {
  it('fires onEventClick on click', () => {
    const ev = timed('a', '2024-08-18T09:00:00', '2024-08-18T10:00:00');
    const onClick = vi.fn();
    render(
      <Calendar
        events={[ev]}
        startDate={at('2024-08-18T00:00:00')}
        endDate={at('2024-08-18T00:00:00')}
        timezone={ZONE}
        onEventClick={onClick}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'a' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(ev);
  });

  it('fires onEventClick on Enter', () => {
    const ev = timed('a', '2024-08-18T09:00:00', '2024-08-18T10:00:00');
    const onClick = vi.fn();
    render(
      <Calendar
        events={[ev]}
        startDate={at('2024-08-18T00:00:00')}
        endDate={at('2024-08-18T00:00:00')}
        timezone={ZONE}
        onEventClick={onClick}
      />,
    );
    const chip = screen.getByRole('button', { name: 'a' });
    chip.focus();
    fireEvent.keyDown(chip, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe('<Calendar> — extension points', () => {
  it('uses a custom day header renderer', () => {
    render(
      <Calendar
        events={[]}
        startDate={at('2024-08-18T00:00:00')}
        endDate={at('2024-08-18T00:00:00')}
        timezone={ZONE}
        renderDayHeader={() => 'CUSTOM'}
      />,
    );
    expect(screen.getByText('CUSTOM')).toBeTruthy();
  });

  it('uses a custom event renderer for timed events', () => {
    const ev = timed('a', '2024-08-18T09:00:00', '2024-08-18T10:00:00');
    render(
      <Calendar
        events={[ev]}
        startDate={at('2024-08-18T00:00:00')}
        endDate={at('2024-08-18T00:00:00')}
        timezone={ZONE}
        renderEvent={({ event }) => <span>CUSTOM:{event.title}</span>}
      />,
    );
    expect(screen.getByText('CUSTOM:a')).toBeTruthy();
  });

  it('uses a custom event renderer for all-day events', () => {
    const ev = allDay('ad', '2024-08-18', '2024-08-20');
    render(
      <Calendar
        events={[ev]}
        startDate={at('2024-08-18T00:00:00')}
        endDate={at('2024-08-20T00:00:00')}
        timezone={ZONE}
        renderEvent={({ event, layout }) => (
          <span>ALLDAY:{event.title}:{layout.kind}</span>
        )}
      />,
    );
    expect(screen.getByText('ALLDAY:ad:all-day')).toBeTruthy();
  });

  it('hides an event when the custom renderer returns null', () => {
    const ev = timed('a', '2024-08-18T09:00:00', '2024-08-18T10:00:00');
    render(
      <Calendar
        events={[ev]}
        startDate={at('2024-08-18T00:00:00')}
        endDate={at('2024-08-18T00:00:00')}
        timezone={ZONE}
        renderEvent={() => null}
      />,
    );
    expect(screen.queryByRole('button', { name: 'a' })).toBeNull();
  });
});

describe('<Calendar> — slotMinutes', () => {
  it('hides the time grid when slotMinutes is 0', () => {
    const { container } = render(
      <Calendar
        events={[]}
        startDate={at('2024-08-18T00:00:00')}
        endDate={at('2024-08-18T00:00:00')}
        timezone={ZONE}
        slotMinutes={0}
      />,
    );
    expect(container.querySelectorAll('.mc-grid__slot')).toHaveLength(0);
  });
});