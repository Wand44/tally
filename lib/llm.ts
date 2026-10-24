import OpenAI from 'openai';
import { z } from 'zod';
import { offlineResponse, type OfflineContext, type OfflineTask } from './offline-provider';

/**
 * The ONLY place that calls Nebius Token Factory (PRD section 7).
 *
 * - OpenAI compatible API with a custom base URL, both read from the
 *   environment. Model ids come from MODEL_FAST / MODEL_SMART, never guessed.
 * - Every response is validated with a zod schema. Invalid JSON is retried
 *   once, then it fails with a readable error.
 * - Token usage is logged per call.
 * - Without credentials it falls back to the deterministic offline provider so
 *   the product still works (demo mode, offline dev, tests).
 */

export type ModelTier = 'fast' | 'smart';
export type LlmProvider = 'nebius' | 'offline';

export interface LlmUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LlmResult<T> {
  data: T;
  provider: LlmProvider;
  model: string;
  usage: LlmUsage | null;
  attempts: number;
  latencyMs: number;
}

let client: OpenAI | undefined;

function getClient(): OpenAI | null {
  const apiKey = process.env.NEBIUS_API_KEY;
  const baseURL = process.env.NEBIUS_BASE_URL;
  if (!apiKey || !baseURL) return null;
  client ??= new OpenAI({ apiKey, baseURL });
  return client;
}

/** True when Nebius is fully configured and will actually be called. */
export function isLlmConfigured(): boolean {
  return Boolean(
    process.env.NEBIUS_API_KEY &&
      process.env.NEBIUS_BASE_URL &&
      process.env.MODEL_FAST &&
      process.env.MODEL_SMART,
  );
}

function modelFor(tier: ModelTier): string {
  const model = tier === 'fast' ? process.env.MODEL_FAST : process.env.MODEL_SMART;
  if (!model) {
    throw new Error(
      `Missing ${tier === 'fast' ? 'MODEL_FAST' : 'MODEL_SMART'}: set the Nebius model id for the ${tier} tier.`,
    );
  }
  return model;
}

/** Models answer with prose around the JSON, so take the outermost object. */
function extractJson(content: string): unknown {
  const cleaned = content.replace(/```json/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('response contained no JSON object');
  return JSON.parse(cleaned.slice(start, end + 1));
}

export async function completeJson<T>(options: {
  task: OfflineTask;
  tier: ModelTier;
  schema: z.ZodType<T>;
  system: string;
  user: string;
  offline: OfflineContext;
}): Promise<LlmResult<T>> {
  const openai = getClient();

  if (!openai) {
    const started = Date.now();
    const data = options.schema.parse(JSON.parse(offlineResponse(options.task, options.offline)));
    return {
      data,
      provider: 'offline',
      model: 'offline-rules',
      usage: null,
      attempts: 1,
      latencyMs: Date.now() - started,
    };
  }

  const model = modelFor(options.tier);
  let lastError: unknown;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = Date.now();
    try {
      const completion = await openai.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.user },
        ],
      });
      const content = completion.choices[0]?.message?.content ?? '';
      const data = options.schema.parse(extractJson(content));
      const usage = completion.usage;
      console.log(
        `[llm] task=${options.task} tier=${options.tier} model=${model} attempt=${attempt} ms=${Date.now() - started} tokens=${usage?.total_tokens ?? 0}`,
      );
      return {
        data,
        provider: 'nebius',
        model,
        usage: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : null,
        attempts: attempt,
        latencyMs: Date.now() - started,
      };
    } catch (error) {
      lastError = error;
      console.warn(`[llm] task=${options.task} attempt=${attempt} failed: ${(error as Error).message}`);
    }
  }

  throw new Error(
    `LLM output failed validation after 2 attempts (${options.task}): ${(lastError as Error)?.message}`,
  );
}
