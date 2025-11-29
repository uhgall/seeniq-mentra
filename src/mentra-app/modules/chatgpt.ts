/**
 * =============================================================================
 * ChatGPT Integration Module
 * =============================================================================
 *
 * This module handles interactions with OpenAI's ChatGPT API to generate
 * descriptions and other text content.
 *
 * =============================================================================
 */

import * as fs from 'fs';
import * as path from 'path';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Load a prompt template from the prompts directory
 */
function loadPromptTemplate(filename: string): string {
  try {
    const promptPath = path.join(process.cwd(), 'src', 'mentra-app', 'prompts', filename);
    return fs.readFileSync(promptPath, 'utf-8').trim();
  } catch (error) {
    throw new Error(`Failed to load prompt template ${filename}: ${error}`);
  }
}

/**
 * Replace placeholders in a prompt template with actual values
 */
function fillPromptTemplate(template: string, variables: Record<string, string>): string {
  let filled = template;
  for (const [key, value] of Object.entries(variables)) {
    filled = filled.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  return filled;
}

/**
 * Get a city description from ChatGPT
 */
export async function getCityDescription(
  city: string,
  logger: any
): Promise<string | undefined> {
  if (!OPENAI_API_KEY) {
    logger.warn('OPENAI_API_KEY is not set. Skipping ChatGPT city description.');
    return undefined;
  }

  if (!city) {
    logger.warn('No city provided for ChatGPT description.');
    return undefined;
  }

  try {
    // Load the prompt template
    const promptTemplate = loadPromptTemplate('city-description.txt');
    
    // Fill in the template with the city name
    const prompt = fillPromptTemplate(promptTemplate, { city });

    logger.info(`Requesting city description from ChatGPT for: ${city}`);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        max_completion_tokens: 150,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`ChatGPT API error: ${response.status} - ${errorText}`);
      return undefined;
    }

    const data = await response.json();
    
    // Debug: log the full response structure
    logger.info(`ChatGPT API response structure: ${JSON.stringify(data, null, 2)}`);
    
    const description = data.choices?.[0]?.message?.content?.trim();

    if (!description) {
      logger.warn(`ChatGPT returned empty description. Full response: ${JSON.stringify(data)}`);
      return undefined;
    }

    logger.info(`Received city description from ChatGPT: ${description.substring(0, 50)}...`);
    return description;
  } catch (error) {
    logger.error(`Error getting city description from ChatGPT: ${error}`);
    return undefined;
  }
}

