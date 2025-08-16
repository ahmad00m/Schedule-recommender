export type ScheduleEvent = {
  id: string;
  title: string;
  day: string; // e.g., 'monday', 'tuesday'
  startTime: string; // HH:mm format, e.g., '09:00'
  endTime: string; // HH:mm format, e.g., '10:30'
};
