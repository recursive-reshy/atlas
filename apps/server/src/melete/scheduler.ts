// Packages
import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  generatorParameters,
} from 'ts-fsrs'
import type { Card, FSRS, Grade } from 'ts-fsrs'
// Shared
import type { MeleteFsrsState, MeleteRating } from '@atlas/shared'
// Config
import { config } from '../config.js'
// Repositories
import type { CardRow } from '../repositories/meleteQuestions.repository.js'

export const createScheduler = ( { fuzz }: { fuzz: boolean } ): FSRS => {
  return fsrs( generatorParameters( {
    request_retention: config.melete.requestRetention,
    enable_fuzz: fuzz,
    enable_short_term: true,
  } ) )
}

let shared: FSRS | undefined

// Built on first use, so importing this module doesn't read the config
export const appScheduler = (): FSRS => {
  shared ??= createScheduler( { fuzz: true } )

  return shared
}

const RATINGS: Record< MeleteRating, Grade > = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
}

const STATE_NAMES: Record< State, MeleteFsrsState > = {
  [ State.New ]: 'new',
  [ State.Learning ]: 'learning',
  [ State.Review ]: 'review',
  [ State.Relearning ]: 'relearning',
}

const STATES: Record< MeleteFsrsState, State > = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
}

export const toFsrsRating = ( rating: MeleteRating ): Grade => RATINGS[ rating ]

export const newCard = ( now: Date ): Card => createEmptyCard( now )

export const nextCard = (
  card: Card,
  rating: MeleteRating,
  now: Date,
  scheduler: FSRS = appScheduler(),
): Card => scheduler.next( card, now, toFsrsRating( rating ) ).card

export const toRow = ( card: Card ): CardRow => ( {
  due: card.due.toISOString(),
  stability: card.stability,
  difficulty: card.difficulty,
  scheduled_days: card.scheduled_days,
  learning_steps: card.learning_steps,
  reps: card.reps,
  lapses: card.lapses,
  fsrs_state: STATE_NAMES[ card.state ],
  last_review: card.last_review === undefined ? null : card.last_review.toISOString(),
} )

// `elapsed_days` is deprecated in ts-fsrs 5 and not stored; the library recomputes it from
// `last_review` on every `next`, so 0 is safe. A question never scheduled is due at `now`.
export const fromRow = ( row: CardRow, now: Date = new Date() ): Card => ( {
  due: row.due === null ? now : new Date( row.due ),
  stability: row.stability,
  difficulty: row.difficulty,
  elapsed_days: 0,
  scheduled_days: row.scheduled_days,
  learning_steps: row.learning_steps,
  reps: row.reps,
  lapses: row.lapses,
  state: STATES[ row.fsrs_state ],
  ...( row.last_review === null ? {} : { last_review: new Date( row.last_review ) } ),
} )
