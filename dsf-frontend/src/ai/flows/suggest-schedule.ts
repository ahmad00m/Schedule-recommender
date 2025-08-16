// src/ai/flows/suggest-schedule.ts
'use server';
/**
 * @fileOverview A schedule suggestion AI agent.
 *
 * - suggestSchedule - A function that handles the schedule suggestion process.
 * - SuggestScheduleInput - The input type for the suggestSchedule function.
 * - SuggestScheduleOutput - The return type for the suggestSchedule function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const SuggestScheduleInputSchema = z.object({
  preferences: z
    .string()
    .describe(
      'A description of the users scheduling preferences, including course names, preferred times, and days of the week.'
    ),
});
export type SuggestScheduleInput = z.infer<typeof SuggestScheduleInputSchema>;

const SuggestScheduleOutputSchema = z.object({
  schedule: z.string().describe('The suggested schedule in a readable format.'),
});
export type SuggestScheduleOutput = z.infer<typeof SuggestScheduleOutputSchema>;

export async function suggestSchedule(input: SuggestScheduleInput): Promise<SuggestScheduleOutput> {
  return suggestScheduleFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestSchedulePrompt',
  input: {schema: SuggestScheduleInputSchema},
  output: {schema: SuggestScheduleOutputSchema},
  prompt: `You are a helpful AI assistant that suggests schedules based on user preferences.

  Given the following user preferences, please generate a schedule in a readable format:

  Preferences: {{{preferences}}}
  `,
});

const suggestScheduleFlow = ai.defineFlow(
  {
    name: 'suggestScheduleFlow',
    inputSchema: SuggestScheduleInputSchema,
    outputSchema: SuggestScheduleOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
