'use client';

import { Bot, Loader2, Send, User } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useSchedule } from '@/providers/schedule-provider';
import { cn } from '@/lib/utils';

function floatTimeToString(time: number): string {
  const hours = Math.floor(time / 100);
  const minutes = time % 100;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

const MAX_TEXTAREA_PX = 160;

type ARTProps = {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>;
  placeholder?: string;
};

export const AutoResizeTextarea = React.forwardRef<HTMLTextAreaElement, ARTProps>(
  ({ value, onChange, disabled, onKeyDown, placeholder }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement>(null);

    // expose the real DOM node to parent via ref
    React.useImperativeHandle(ref, () => innerRef.current as HTMLTextAreaElement);

    React.useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = '0px';
      const next = Math.min(el.scrollHeight, MAX_TEXTAREA_PX);
      el.style.height = `${next}px`;
      el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_PX ? 'auto' : 'hidden';
    }, [value]);

    return (
      <textarea
        ref={innerRef}
        rows={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        className={cn(
          'w-full resize-none rounded-xl border px-3 py-2 text-sm leading-6',
          'bg-background focus:outline-none focus:ring-2 focus:ring-primary',
          'min-h-[40px] max-h-[160px]'
        )}
        aria-label="Chat message input"
      />
    );
  }
);
AutoResizeTextarea.displayName = 'AutoResizeTextarea';


export function Chatbot() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  const { setEvents } = useSchedule();
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const BACKEND_URL = 'http://127.0.0.1:8003';
  const USER_ID = 'current_user';

  useEffect(() => {
    scrollAreaRef.current?.scrollTo({
      top: scrollAreaRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages]);

const handleSuggestionToCalendar = (suggestion: any) => {
  try {
    console.log('Raw suggestion received:', suggestion);
    
    // Handle different possible response structures
    let schedule;
    
    if (typeof suggestion === 'string') {
      schedule = JSON.parse(suggestion);
    } else if (suggestion && typeof suggestion === 'object') {
      // Check if it's the agent response format
      if (suggestion.schedule) {
        schedule = suggestion.schedule; 
      } else if (suggestion.detailed_schedule) {
        schedule = suggestion.detailed_schedule;
      } else {
        schedule = suggestion;
      }
    } else {
      throw new Error('Invalid suggestion format');
    }

    console.log('Parsed schedule:', schedule);

    if (!schedule || typeof schedule !== 'object') {
      throw new Error('Invalid schedule format');
    }

    const parsedEvents = Object.entries(schedule).flatMap(([courseId, courseData]: [string, any]) => {
      console.log(`Processing course: ${courseId}`, courseData);
      
      let daysData: { [key: string]: any } = {};
      
      if (courseData.Days) {
        daysData = courseData.Days;
        console.log(`Using legacy Days format for ${courseId}:`, daysData);
      } else if (courseData.sections && Array.isArray(courseData.sections)) {
        console.log(`Using detailed sections format for ${courseId}:`, courseData.sections);
        courseData.sections.forEach((section: any) => {
          if (section.days && typeof section.days === 'object') {
            Object.entries(section.days).forEach(([day, times]) => {
              if (times && Array.isArray(times) && times.length >= 2) {
                daysData[day] = times;
              }
            });
          }
        });
      } else {
        console.warn(`No valid schedule data found for course ${courseId}. CourseData:`, courseData);
        return [];
      }

      // Ensure daysData is not null/undefined and is an object
      if (!daysData || typeof daysData !== 'object') {
        console.warn(`daysData is invalid for course ${courseId}:`, daysData);
        return [];
      }

      return Object.entries(daysData).flatMap(([day, timeArray]: [string, any]) => {
        if (!timeArray || !Array.isArray(timeArray) || timeArray.length < 2) {
          console.warn(`Invalid time array for ${courseId} on ${day}:`, timeArray);
          return [];
        }

        const [startTime, endTime] = timeArray;
        
        const startTimeNum = typeof startTime === 'number' ? startTime : parseInt(String(startTime));
        const endTimeNum = typeof endTime === 'number' ? endTime : parseInt(String(endTime));
        
        if (isNaN(startTimeNum) || isNaN(endTimeNum)) {
          console.warn(`Invalid time values for ${courseId} on ${day}:`, startTime, endTime);
          return [];
        }

        return [{
          id: `${courseId}-${day}-${Date.now()}-${Math.random()}`, // More unique ID
          title: courseData.Name || courseId, // Use Name if available, fallback to courseId
          day: day.toLowerCase(), // e.g., "monday"
          startTime: floatTimeToString(startTimeNum),
          endTime: floatTimeToString(endTimeNum),
          courseId: courseId,
          crn: courseData.CRN || '',
          scheduleType: courseData.Schedule_Type || ''
        }];
      });
    });

    console.log('Parsed events:', parsedEvents);
    
    if (parsedEvents.length === 0) {
      console.warn('No events were parsed from the schedule');
      alert('No valid schedule events found. Please check the schedule format.');
      return;
    }

    setEvents(parsedEvents);
    console.log(`✅ Successfully parsed ${parsedEvents.length} events from schedule`);
    
  } catch (err) {
    console.error('❌ Failed to parse schedule:', err);
    console.error('Original suggestion:', suggestion);
    alert(`Parsing Error: ${err instanceof Error ? err.message : 'Could not extract events from schedule.'}`);
  }
};

const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  if (!input.trim() || isLoading) return;

  const userMessage: Message = {
    id: Date.now().toString(),
    role: 'user',
    content: input,
  };
  
  setMessages(prev => [...prev, userMessage]);
  setInput('');
  setIsLoading(true);

  try {
    const response = await fetch(`${BACKEND_URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: input,
        session_id: sessionId,
        context: { user_id: USER_ID },
      }),
    });

    const text = await response.text();
    console.log('Raw response text:', text);
    
    let data: any = null;
    try {
      data = JSON.parse(text);
      console.log('Parsed response data:', data);
    } catch (err) {
      console.error('❌ Failed to parse JSON:', err);
      console.log('Response text that failed to parse:', text);
    }

    // Set session ID if received
    if (data?.session_id && !sessionId) {
      setSessionId(data.session_id);
    }

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: data?.message || '⚠️ No response received from the agent.',
    };
    setMessages(prev => [...prev, assistantMessage]);

    // Check for schedule data in multiple possible locations
    console.log('Checking for schedule data in response...');
    
    // Method 1: Check state.final_schedule (legacy location)
    const finalSchedule = data?.state?.final_schedule;
    if (finalSchedule) {
      console.log('Found final_schedule in state:', finalSchedule);
      handleSuggestionToCalendar(finalSchedule);
    }
    // Method 2: Check if the finalize_schedule tool response is in the data
    else if (data?.schedule) {
      console.log('Found schedule in data:', data.schedule);
      handleSuggestionToCalendar(data.schedule);
    }
    // Method 3: Check for detailed_schedule
    else if (data?.detailed_schedule) {
      console.log('Found detailed_schedule in data:', data.detailed_schedule);
      handleSuggestionToCalendar(data.detailed_schedule);
    }
    // Method 4: Look for tool results in the response
    else if (data?.tool_results) {
      console.log('Checking tool results for schedule data...');
      const scheduleResult = data.tool_results.find((result: any) => 
        result.schedule || result.detailed_schedule
      );
      if (scheduleResult) {
        console.log('Found schedule in tool results:', scheduleResult);
        handleSuggestionToCalendar(scheduleResult);
      }
    }
    // Method 5: Try to parse schedule from message if it contains JSON
    else if (data?.message && (
      data.message.includes('Final schedule') || 
      data.message.includes('schedule') ||
      data.message.includes('{')
    )) {
      console.log('Attempting to extract schedule from message...');
      try {
        // Look for JSON objects in the message
        const jsonMatches = data.message.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g);
        if (jsonMatches) {
          for (const match of jsonMatches) {
            try {
              const scheduleData = JSON.parse(match);
              console.log('Found JSON in message:', scheduleData);
              handleSuggestionToCalendar(scheduleData);
              break; // Use the first valid JSON found
            } catch (err) {
              console.log('JSON parse failed for match:', match);
              continue;
            }
          }
        }
      } catch (err) {
        console.warn('Could not extract schedule from message:', err);
      }
    }
    else {
      console.log('No schedule data found in response');
      // Log the entire data structure for debugging
      console.log('Full response structure:', JSON.stringify(data, null, 2));
    }

  } catch (error) {
    console.error('❌ Request error:', error);
    setMessages(prev => [
      ...prev,
      {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '❌ Failed to contact agent. Please try again.',
      },
    ]);
  } finally {
    setIsLoading(false);
    // Add a small delay to ensure the DOM has updated before focusing
    setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
  }
};

  return (
    <Card className="flex h-full flex-col rounded-none border-0 border-l">
      <CardHeader className="flex justify-center items-center pb-3">
        <div className="text-center mx-auto border-b-4 border-school-gold pb-1 w-fit">
          <CardTitle className="text-2xl font-bold">
            Schedule Planner
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col px-2 pb-3 overflow-hidden h-[calc(100vh-10rem)]">
        <div className="flex-grow overflow-y-auto pr-2" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map(message => {
              const isUser = message.role === 'user';
              return (
                <div
                  key={message.id}
                  className={cn(
                    'flex items-start gap-3',
                    isUser ? 'justify-end' : 'justify-start'
                  )}
                >
                  {!isUser && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback className="bg-primary text-white">
                        <Bot className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <div
                    className={cn(
                      'max-w-xs md:max-w-md rounded-lg px-4 py-2 text-sm whitespace-pre-wrap border',
                      isUser
                        ? 'bg-school-gold text-white font-semibold'
                        : 'bg-primary text-white font-semibold'
                    )}
                  >
                    <ReactMarkdown>{message.content}</ReactMarkdown>
                  </div>
                  {isUser && (
                    <Avatar className="h-8 w-8">
                      <AvatarFallback>
                        <User className="h-5 w-5" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              );
            })}
            {isLoading && (
              <div className="flex items-start gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-white text-primary">
                    <Bot className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="max-w-xs rounded-lg bg-muted p-3 text-sm md:max-w-md">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <form onSubmit={handleSubmit} className="flex w-full items-end gap-2">
          <AutoResizeTextarea
            ref={inputRef}  
            value={input}
            onChange={setInput}
            disabled={isLoading}
            placeholder="Start chatting here ..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!isLoading && input.trim()) {
                  // Submit without waiting for the button
                  const fakeEvent = { preventDefault: () => {} } as unknown as React.FormEvent<HTMLFormElement>;
                  handleSubmit(fakeEvent);
                }
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            className="bg-primary text-white hover:bg-primary/90 self-center"
            disabled={isLoading || !input.trim()}
            aria-label="Send message"
            title="Send"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </CardFooter>

    </Card>
  );
}
