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

type DatedPrice = Price & { from: string }

// US dollars per million tokens for the Gemini Developer API, paid tier, standard (not batch),
// checked against Google's price list on 2026-11-06. Output includes thinking tokens. Google's
// list shows these rates through 2026-12-31 and double from 2027-01-01, so each model has the
// rate that applies from a date; the newest entry whose date has come is used.
export const GEMINI_PRICES: Record< string, DatedPrice[] > = {
  'gemini-3.8-flash': [
    { from: '1970-01-01', input: 0.75, output: 3.75 },
    { from: '2027-01-01', input: 1.5, output: 7.5 },
  ],
}

export const estimateGeminiCostUsd = (
  model: string,
  inputTokens: number | null,
  outputTokens: number | null,
  at: Date = new Date(),
): number | null => {
  const day = at.toISOString().slice( 0, 10 )
  const price = GEMINI_PRICES[ model ]?.findLast( ( { from } ) => from <= day )

  if( price === undefined || inputTokens === null || outputTokens === null ) {
    return null
  }

  // To the millionth of a dollar: a token costs price / 1,000,000 dollars
  return Math.round( inputTokens * price.input + outputTokens * price.output ) / 1_000_000
}
