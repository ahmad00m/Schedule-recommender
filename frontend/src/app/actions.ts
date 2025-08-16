'use server';

import { suggestSchedule } from '@/ai/flows/suggest-schedule';

export async function getScheduleSuggestion(preferences: string): Promise<{
  schedule?: string;
  error?: string;
}> {
  try {
    // Reformat prompt for better results from the model
    const formattedPreferences = `
      Create a weekly schedule based on these preferences: "${preferences}".
      Format each event on a new line like this:
      Course Name: Day(s) HH:MMam/pm - HH:MMam/pm
      
      Valid Day abbreviations are: M, Tu, W, Th, F, MWF, TTh.
      Example: Art History: TTh 1:00pm - 2:30pm
    `;

    const result = await suggestSchedule({ preferences: formattedPreferences });
    if (result.schedule) {
      return { schedule: result.schedule };
    }
    return { error: 'Failed to get a valid suggestion from the model.' };
  } catch (error) {
    console.error('Error getting schedule suggestion:', error);
    return { error: 'An unexpected error occurred while generating the schedule.' };
  }
}
