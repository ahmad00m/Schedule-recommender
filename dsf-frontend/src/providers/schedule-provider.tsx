'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { toast } from '@/hooks/use-toast';
import {
  loadScheduleFromSession,
  saveScheduleToSession,
} from '@/lib/schedule';
import type { ScheduleEvent } from '@/types';

const STORAGE_KEY = 'schedulAI-events';

interface ScheduleContextType {
  events: ScheduleEvent[];
  setEvents: React.Dispatch<React.SetStateAction<ScheduleEvent[]>>;
  addEvent: (event: ScheduleEvent) => void;
  updateEvent: (event: ScheduleEvent) => void;
  removeEvent: (id: string) => void;
  addEventsFromSuggestion: (suggestion: string) => void;
  addEventsFromSchedule: (scheduleData: any) => void;
  resetSchedule: () => void;
}

const ScheduleContext = createContext<ScheduleContextType | undefined>(
  undefined
);

export function ScheduleProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // On first mount, detect a real browser reload and clear session,
  // otherwise hydrate from session as usual.
  useEffect(() => {
    const nav =
      (performance.getEntriesByType('navigation')[0] as
        | PerformanceNavigationTiming
        | undefined) || undefined;

    const isReload =
      (nav && nav.type === 'reload') ||
      // Fallback for older browsers
      // @ts-ignore
      (performance.navigation && performance.navigation.type === 1);

    if (isReload) {
      sessionStorage.removeItem(STORAGE_KEY);
      setEvents([]); // ensure boxes disappear immediately
      setIsLoaded(true);
      return;
    }

    setEvents(loadScheduleFromSession());
    setIsLoaded(true);
  }, []);

  // Persist any changes to events after initial load
  useEffect(() => {
    if (isLoaded) {
      saveScheduleToSession(events);
    }
  }, [events, isLoaded]);

  const resetSchedule = useCallback(() => {
    setEvents([]);
    sessionStorage.removeItem(STORAGE_KEY);
    toast({
      title: 'Schedule Reset',
      description: 'Your schedule has been cleared for this session.',
    });
  }, []);

  const addEvent = useCallback((event: ScheduleEvent) => {
    setEvents((prev) => [...prev, event]);
    toast({
      title: 'Event Added',
      description: `"${event.title}" was added to your schedule.`,
    });
  }, []);

  const updateEvent = useCallback((updatedEvent: ScheduleEvent) => {
    setEvents((prev) => prev.map((e) => (e.id === updatedEvent.id ? updatedEvent : e)));
    toast({
      title: 'Event Updated',
      description: `"${updatedEvent.title}" was updated.`,
    });
  }, []);

  const removeEvent = useCallback((id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    toast({
      title: 'Event Removed',
      description: 'An event was removed from your schedule.',
    });
  }, []);

  // NEW FUNCTION: Handle structured schedule data from agent
  const addEventsFromSchedule = useCallback((scheduleData: any) => {
    try {
      console.log('=== DEBUGGING SCHEDULE DATA ===');
      console.log('Full scheduleData received:', JSON.stringify(scheduleData, null, 2));
      
      const newEvents: ScheduleEvent[] = [];
      
      // Handle the response format from your agent
      let schedule;
      if (scheduleData.schedule) {
        schedule = scheduleData.schedule;
        console.log('Using scheduleData.schedule:', JSON.stringify(schedule, null, 2));
      } else {
        schedule = scheduleData;
        console.log('Using scheduleData directly:', JSON.stringify(schedule, null, 2));
      }

      // Check if schedule is valid
      if (!schedule || typeof schedule !== 'object') {
        throw new Error('Schedule data is not a valid object');
      }

      // Helper to convert 24-hour integer to HH:MM format
      const formatTimeFromInt = (timeInt: number | string): string => {
        let timeNum: number;
        if (typeof timeInt === 'string') {
          timeNum = parseInt(timeInt, 10);
        } else {
          timeNum = timeInt;
        }
        
        const hours = Math.floor(timeNum / 100);
        const minutes = timeNum % 100;
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      };

      // Helper to map day names to your calendar format
      const dayNameMap: { [key: string]: string } = {
        'Monday': 'monday',
        'Tuesday': 'tuesday', 
        'Wednesday': 'wednesday',
        'Thursday': 'thursday',
        'Friday': 'friday',
        'Saturday': 'saturday',
        'Sunday': 'sunday'
      };

      console.log('Available courses:', Object.keys(schedule));

      // Process each course
      Object.entries(schedule).forEach(([courseId, courseData]: [string, any]) => {
        console.log(`\n--- Processing course ${courseId} ---`);
        console.log('Course data:', JSON.stringify(courseData, null, 2));
        
        // Handle both old and new data structures
        if (courseData.sections && Array.isArray(courseData.sections)) {
          // NEW FORMAT: Handle sections array
          console.log('Using new nested sections format');
          courseData.sections.forEach((section: any, index: number) => {
            const sectionType = section.type || 'unknown';
            const courseName = `${courseId} (${sectionType})`;
            const days = section.days || {};
            
            console.log(`Processing section ${index} (${sectionType}):`, days);
            
            // Process each day in this section
            Object.entries(days).forEach(([dayName, times]: [string, any]) => {
              console.log(`Processing day ${dayName} with times:`, times);
              
              if (Array.isArray(times) && times.length >= 2) {
                const [startInt, endInt] = times;
                const dayKey = dayNameMap[dayName];
                
                if (dayKey && startInt != null && endInt != null) {
                  try {
                    const startTime = formatTimeFromInt(startInt);
                    const endTime = formatTimeFromInt(endInt);
                    
                    const event = {
                      id: `${Date.now()}-${courseId}-${sectionType}-${dayName}-${Math.random()}`,
                      title: courseName,
                      day: dayKey,
                      startTime,
                      endTime,
                    };
                    
                    newEvents.push(event);
                    console.log('Added event:', event);
                  } catch (timeError) {
                    console.warn(`Error formatting times for ${courseId} ${sectionType} on ${dayName}:`, timeError);
                  }
                }
              }
            });
          });
        } else {
          // OLD FORMAT: Handle direct Days property
          console.log('Using old direct Days format');
          const courseName = courseData.Name || courseData.name || courseId;
          const days = courseData.Days || courseData.days || {};

          console.log('Course name:', courseName);
          console.log('Days data:', JSON.stringify(days, null, 2));

          // Ensure days is an object before processing
          if (!days || typeof days !== 'object') {
            console.warn(`No valid days data found for course ${courseId}`);
            return;
          }

          // Process each day that has times
          Object.entries(days).forEach(([dayName, times]: [string, any]) => {
            console.log(`Processing day ${dayName} with times:`, times);
            
            if (Array.isArray(times) && times.length >= 2) {
              const [startInt, endInt] = times;
              const dayKey = dayNameMap[dayName];
              
              console.log(`Start: ${startInt}, End: ${endInt}, Day key: ${dayKey}`);
              
              if (dayKey && startInt != null && endInt != null) {
                try {
                  const startTime = formatTimeFromInt(startInt);
                  const endTime = formatTimeFromInt(endInt);
                  
                  console.log(`Formatted times: ${startTime} - ${endTime}`);
                  
                  const event = {
                    id: `${Date.now()}-${courseId}-${dayName}-${Math.random()}`,
                    title: courseName,
                    day: dayKey,
                    startTime,
                    endTime,
                  };
                  
                  newEvents.push(event);
                  console.log('Added event:', event);
                } catch (timeError) {
                  console.warn(`Error formatting times for ${courseId} on ${dayName}:`, timeError);
                }
              } else {
                console.warn(`Skipping ${courseId} ${dayName}: dayKey=${dayKey}, start=${startInt}, end=${endInt}`);
              }
            } else {
              console.warn(`Invalid times array for ${courseId} ${dayName}:`, times);
            }
          });
        }
      });

      console.log('=== FINAL RESULTS ===');
      console.log('Total events generated:', newEvents.length);
      console.log('Events:', JSON.stringify(newEvents, null, 2));

      if (newEvents.length > 0) {
        setEvents((prev) => [...prev, ...newEvents]);
        toast({
          title: 'Schedule Updated',
          description: `Added ${newEvents.length} course sessions to your calendar.`,
        });
      } else {
        toast({
          title: 'No Events Found',
          description: 'No valid course times found in the schedule data. Check console for details.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('=== ERROR PARSING SCHEDULE ===');
      console.error('Error:', error);
      console.error('Original data:', scheduleData);
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Parsing Error',
        description: `Could not extract events from schedule: ${errorMessage}`,
        variant: 'destructive',
      });
    }
  }, []);

  // UPDATED FUNCTION: Handle both JSON and text suggestions
  const addEventsFromSuggestion = useCallback((suggestion: string) => {
    console.log('=== RAW SUGGESTION INPUT ===');
    console.log('Type:', typeof suggestion);
    console.log('Raw suggestion:', suggestion);
    
    // First try to parse as JSON (new format)
    try {
      const parsed = JSON.parse(suggestion);
      console.log('Successfully parsed as JSON:', parsed);
      if (parsed && typeof parsed === 'object') {
        addEventsFromSchedule(parsed);
        return;
      }
    } catch (parseError) {
      console.log('Not valid JSON, trying text parsing. Error:', parseError);
      // Not JSON, continue with text parsing
    }

    // Original text parsing logic
    const lines = suggestion.split('\n').filter((line) => line.trim() !== '');
    const newEvents: ScheduleEvent[] = [];

    // Map tokens -> day keys used in your calendar
    const dayMap: { [key: string]: string[] } = {
      M: ['monday'],
      Tu: ['tuesday'],
      T: ['tuesday'], // optional alias
      W: ['wednesday'],
      Th: ['thursday'],
      R: ['thursday'], // optional alias
      F: ['friday'],
      MWF: ['monday', 'wednesday', 'friday'],
      TTh: ['tuesday', 'thursday'],
      TuTh: ['tuesday', 'thursday'],
    };

    lines.forEach((line) => {
      // Example line: "CS 010A: MWF 9:00am - 9:50am"
      const match =
        line.match(
          /^(.*):\s*([A-Za-z]+(?:,[A-Za-z]+)*)\s+(\d{1,2}:\d{2}[ap]m)\s*-\s*(\d{1,2}:\d{2}[ap]m)$/
        ) || undefined;

      if (match) {
        const [, title, dayStr, startTimeStr, endTimeStr] = match;

        const formatTime = (time: string) => {
          const [hh, mm] = time.slice(0, -2).split(':');
          const period = time.slice(-2).toLowerCase();
          let hourNum = parseInt(hh, 10);
          if (period === 'pm' && hourNum < 12) hourNum += 12;
          if (period === 'am' && hourNum === 12) hourNum = 0;
          return `${String(hourNum).padStart(2, '0')}:${mm}`;
        };

        const token = dayStr.replace(/\s+/g, '');
        const days =
          dayMap[token] ??
          token.split(',').map((d) => d.toLowerCase()); // fallback

        days.forEach((day) => {
          newEvents.push({
            id: `${Date.now()}-${title}-${day}`,
            title: title.trim(),
            day, // must be one of your DAY_KEYS
            startTime: formatTime(startTimeStr),
            endTime: formatTime(endTimeStr),
          });
        });
      }
    });

    if (newEvents.length > 0) {
      setEvents((prev) => [...prev, ...newEvents]);
      toast({
        title: 'Schedule Updated',
        description: 'AI suggestions have been added to your calendar.',
      });
    } else {
      toast({
        title: 'Parsing Error',
        description: 'Could not automatically parse the schedule suggestion.',
        variant: 'destructive',
      });
    }
  }, [addEventsFromSchedule]);

  return (
    <ScheduleContext.Provider
      value={{
        events,
        setEvents,
        addEvent,
        updateEvent,
        removeEvent,
        addEventsFromSuggestion,
        addEventsFromSchedule,
        resetSchedule,
      }}
    >
      {children}
    </ScheduleContext.Provider>
  );
}

export function useSchedule() {
  const ctx = useContext(ScheduleContext);
  if (ctx === undefined) {
    throw new Error('useSchedule must be used within a ScheduleProvider');
  }
  return ctx;
}