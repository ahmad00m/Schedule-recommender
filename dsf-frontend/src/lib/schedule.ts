'use client';

import { addDays, format, getDay, parse } from 'date-fns';
import { toast } from '@/hooks/use-toast';
import type { ScheduleEvent } from '@/types';

const STORAGE_KEY = 'schedulAI-events';

export const saveScheduleToLocal = (events: ScheduleEvent[]) => {
  try {
    const data = JSON.stringify(events);
    localStorage.setItem(STORAGE_KEY, data);
  } catch (error) {
    console.error('Failed to save schedule to local storage:', error);
    toast({
      title: 'Error',
      description: 'Could not save your schedule.',
      variant: 'destructive',
    });
  }
};

export const loadScheduleFromLocal = (): ScheduleEvent[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to load schedule from local storage:", error);
    return [];
  }
};


// Use sessionStorage for both load and save
export const loadScheduleFromSession = (): ScheduleEvent[] => {
  try {
    const data = sessionStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error("Failed to load schedule from session storage:", error);
    return [];
  }
};

export const saveScheduleToSession = (events: ScheduleEvent[]) => {
  try {
    const data = JSON.stringify(events);
    sessionStorage.setItem(STORAGE_KEY, data);
  } catch (error) {
    console.error("Failed to save schedule to session storage:", error);
    toast({
      title: "Error",
      description: "Could not save your schedule to session.",
      variant: "destructive",
    });
  }
};

export const exportScheduleToIcs = (events: ScheduleEvent[], weekStart: Date) => {
  const toUtcDate = (dayOfWeek: number, time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    const date = addDays(weekStart, dayOfWeek - getDay(weekStart));
    date.setUTCHours(hours, minutes, 0, 0);
    return format(date, "yyyyMMdd'T'HHmmss'Z'");
  };

  const dayNameToIndex: { [key: string]: number } = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };

  let icsString = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SchedulAI//EN',
  ].join('\r\n');

  events.forEach(event => {
    const dayIndex = dayNameToIndex[event.day.toLowerCase()];
    if (dayIndex === undefined) return;
    
    const dtstart = toUtcDate(dayIndex, event.startTime);
    const dtend = toUtcDate(dayIndex, event.endTime);
    const dtstamp = format(new Date(), "yyyyMMdd'T'HHmmss'Z'");

    const eventString = [
      '',
      'BEGIN:VEVENT',
      `UID:${event.id}@schedul.ai`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${dtstart}`,
      `DTEND:${dtend}`,
      `SUMMARY:${event.title}`,
      'END:VEVENT',
    ].join('\r\n');
    icsString += eventString;
  });

  icsString += '\r\nEND:VCALENDAR';

  const blob = new Blob([icsString], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'schedule.ics';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast({
    title: 'Success!',
    description: 'Your schedule has been exported.',
  });
};
