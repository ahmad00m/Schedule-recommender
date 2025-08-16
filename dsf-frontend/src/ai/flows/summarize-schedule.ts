// Summarizes a user's schedule for a given day or week.

'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SummarizeScheduleInputSchema = z.object({
  schedule: z.string().describe('A schedule in JSON format.'),
  timeframe: z.string().describe('The timeframe to summarize (e.g., "today", "this week", "August 15th").'),
});
export type SummarizeScheduleInput = z.infer<typeof SummarizeScheduleInputSchema>;

const SummarizeScheduleOutputSchema = z.object({
  summary: z.string().describe('A concise summary of the schedule for the given timeframe.'),
});
export type SummarizeScheduleOutput = z.infer<typeof SummarizeScheduleOutputSchema>;

export async function summarizeSchedule(input: SummarizeScheduleInput): Promise<SummarizeScheduleOutput> {
  return summarizeScheduleFlow(input);
}

const summarizeSchedulePrompt = ai.definePrompt({
  name: 'summarizeSchedulePrompt',
  input: {
    schema: SummarizeScheduleInputSchema,
  },
  output: {
    schema: SummarizeScheduleOutputSchema,
  },
  prompt: `You are a personal assistant helping a user understand their schedule.

  Summarize the following schedule for the given timeframe. Be concise and focus on important commitments.

  Timeframe: {{{timeframe}}}
  Schedule: {{{schedule}}}
  `,
});

const summarizeScheduleFlow = ai.defineFlow(
  {
    name: 'summarizeScheduleFlow',
    inputSchema: SummarizeScheduleInputSchema,
    outputSchema: SummarizeScheduleOutputSchema,
  },
  async input => {
    const {output} = await summarizeSchedulePrompt(input);
    return output!;
  }
);
