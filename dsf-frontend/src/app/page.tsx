'use client';

import SplitLayout from '@/components/split-layout'; // <- add this
import { CalendarView } from '@/components/calendar-view';
import { Chatbot } from '@/components/chatbot';
import { ScheduleProvider } from '@/providers/schedule-provider';

export default function Home() {
  return (
    <ScheduleProvider>
      <main className="h-screen w-full overflow-hidden">
        <SplitLayout
          left={
            <div className="h-full min-h-0 overflow-auto">
              <CalendarView />
            </div>
          }
          right={
            <aside className="h-full min-h-0 flex flex-col border-l border-border bg-muted/20 overflow-auto">
              <Chatbot />
            </aside>
          }
          initialPercent={60}     // start with 60% for calendar
          minLeftPercent={30}     // don't let calendar get too small
          minRightPercent={24}    // don't let chatbot get too small
        />
      </main>
    </ScheduleProvider>
  );
}
