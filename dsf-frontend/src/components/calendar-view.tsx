'use client';

import React, { useEffect, useRef, useState } from 'react';
import { parse, startOfWeek } from 'date-fns';
import { MoreVertical, Edit, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

import { useSchedule } from '@/providers/schedule-provider';
import type { ScheduleEvent } from '@/types';
import { exportScheduleToIcs } from '@/lib/schedule';

const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
const DAY_KEYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'] as const;
const DAY_LABELS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const STORAGE_KEY = 'schedulAI-events';

export function CalendarView({ hourHeight = 64 }: { hourHeight?: number }) {
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nineAMRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
  // Clear schedule when view mounts
  localStorage.removeItem(STORAGE_KEY);

  const container = scrollRef.current;
  const target = nineAMRef.current;
  if (!container || !target) return;

  const STICKY_HEADER_PX = 48; // matches h-12
  const top = target.offsetTop - STICKY_HEADER_PX;
  container.scrollTo({ top: Math.max(top, 0), behavior: 'auto' });
  }, []);


  const [isFormOpen, setFormOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(null);
  const { events, removeEvent } = useSchedule();

  const handleEditEvent = (event: ScheduleEvent) => {
    setSelectedEvent(event);
    setFormOpen(true);
  };

  const EventComponent = ({ event }: { event: ScheduleEvent }) => {
    const start = parse(event.startTime, 'HH:mm', new Date());
    const end = parse(event.endTime, 'HH:mm', new Date());

    const top = (start.getHours() * 60 + start.getMinutes()) / (24 * 60) * 100;
    const height = ((end.getTime() - start.getTime()) / (1000 * 60)) / (24 * 60) * 100;

    return (
      <div
        className="absolute w-full p-1 group"
        style={{ top: `${top}%`, height: `${height}%` }}
      >
        <div className="relative flex h-full flex-col rounded-lg bg-primary p-2 text-white shadow-lg backdrop-blur-sm transition-all duration-200 ease-in-out group-hover:bg-school-gold/80">
          <div className="flex items-start justify-between">
            <p className="text-sm font-semibold">{event.title}</p>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-school-gold/100">
                  <MoreVertical className="h-4 w-4 text-white" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => handleEditEvent(event)}>
                  <Edit className="mr-2 h-4 w-4" /> Edit
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => removeEvent(event.id)} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <p className="text-xs">
            {event.startTime} - {event.endTime}
          </p>
        </div>
      </div>
    );
  };
  return (
    <div
      className="flex h-full flex-col p-4 sm:p-6 lg:p-8"
      style={{ ['--hour-h' as any]: `${hourHeight}px` }}
    >
      {/* ...header & dialog... */}

      <div className="flex-grow overflow-hidden">
        <Card className="h-full">
          <CardContent className="h-full p-0">
            <div ref={scrollRef} className="h-full overflow-auto scrollbar-hide">
              <div className="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr_1fr_1fr] h-full">
                {/* Time column */}
                <div className="sticky left-0 z-20 bg-card">
                  <div className="sticky top-0 z-30 h-12 border-b bg-card" />
                  {hours.map((hour) => (
                    <div
                      key={hour}
                      ref={hour === '07:00' ? nineAMRef : undefined}
                      className="relative flex items-start justify-center border-b pt-1"
                      style={{ height: 'var(--hour-h)' }}   // ← changed
                    >
                      <span className="text-sm font-semibold text-black">{hour}</span>
                    </div>
                  ))}
                </div>

                {/* Day columns */}
                {DAY_KEYS.map((key, i) => {
                  const label = DAY_LABELS[i];
                  const dayEvents = events.filter((e) => e.day === key);

                  return (
                    <div key={key} className={i === 0 ? 'border-l' : ''}>
                      <div className="sticky top-0 z-10 flex h-12 items-center justify-center border-b bg-card">
                        <span className="font-medium">{label}</span>
                      </div>

                      {/* Column height = 24 * hour height */}
                      <div className="relative" style={{ height: 'calc(24 * var(--hour-h))' }}>
                        {hours.map((hour) => (
                          <div
                            key={`${key}-${hour}`}
                            className="border-b"
                            style={{ height: 'var(--hour-h)' }}     // ← changed
                          />
                        ))}

                        {dayEvents.map((event) => (
                          <EventComponent key={event.id} event={event} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}