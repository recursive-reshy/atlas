type Price = { input: number, output: number }

// US dollars per million tokens, from https://platform.claude.com/docs/en/about-claude/pricing
// for the models the Models API lists as active and usable for summaries.
// claude-haiku-5-5 is left out on purpose: its price depends on the prompt length (over 100,000
// tokens costs more), which this table cannot express, so it shows tokens only.
export const PRICES_CHECKED_ON = '2026-10-17'

export const MODEL_PRICES: Record< string, Price > = {
  'claude-fable-5-1': { input: 10, output: 50 },
  'claude-fable-5': { input: 10, output: 50 },
  'claude-opus-5-5': { input: 4, output: 20 },
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-7': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-opus-4-5-20251101': { input: 5, output: 25 },
  'claude-sonnet-5-5': { input: 2, output: 10 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
}

const TOKENS_PER_PRICE_UNIT = 1_000_000

export const estimateCostUsd = (
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
): number | null => {
  const price = MODEL_PRICES[ model ]

  if( price === undefined || inputTokens === null || outputTokens === null ) {
    return null
  }

  return ( inputTokens * price.input + outputTokens * price.output ) / TOKENS_PER_PRICE_UNIT
}

// US dollars per minute of audio, from OpenAI's pricing page
export const TRANSCRIPTION_PRICES_PER_MINUTE: Record< string, number > = {
  'gpt-transcribe': 0.0045,
}

const SECONDS_PER_MINUTE = 60

export const estimateTranscriptionCostUsd = ( model: string, seconds: number ): number | null => {
  const price = TRANSCRIPTION_PRICES_PER_MINUTE[ model ]

  if( price === undefined ) {
    return null
  }

  // To the millionth of a dollar, so 3,600 s is 0.27 and not 0.26999999999999996
  return Math.round( ( seconds / SECONDS_PER_MINUTE ) * price * 1_000_000 ) / 1_000_000
}
