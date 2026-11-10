// Shared
import type {
  CreateGoalBody,
  ThemisCheckinCadence,
  ThemisGoal,
  ThemisGoalStatus,
  ThemisOutcome,
  UpdateGoalBody,
} from '@atlas/shared'

// The goal dialog's fields as typed: numbers and dates stay text until they are sent
export interface GoalForm {
  name: string
  areaId: string
  outcome: ThemisOutcome
  unit: string
  target: string
  cadence: ThemisCheckinCadence
  targetDate: string
  status: ThemisGoalStatus
}

export const emptyForm = ( areaId: string ): GoalForm => ( {
  name: '',
  areaId,
  outcome: 'learning',
  unit: '',
  target: '',
  cadence: 'weekly',
  targetDate: '',
  status: 'active',
} )

export const formFromGoal = ( goal: ThemisGoal ): GoalForm => ( {
  name: goal.name,
  areaId: goal.area_id,
  outcome: goal.outcome,
  unit: goal.outcome === 'metric' ? goal.metric_unit ?? '' : '',
  target: goal.outcome === 'metric' ? String( goal.metric_target ) : '',
  cadence: goal.outcome === 'checkin' ? goal.checkin_cadence : 'weekly',
  targetDate: goal.target_date ?? '',
  status: goal.status,
} )

const hasNumber = ( text: string ): boolean => {
  return text.trim() !== '' && Number.isFinite( Number( text ) )
}

export const canSubmit = ( form: GoalForm ): boolean => {
  return form.name.trim() !== ''
    && form.areaId !== ''
    && ( form.outcome !== 'metric' || hasNumber( form.target ) )
}

export const createBody = ( form: GoalForm ): CreateGoalBody => {
  const base = {
    area_id: form.areaId,
    name: form.name.trim(),
    ...( form.targetDate === '' ? {} : { target_date: form.targetDate } ),
  }

  if( form.outcome === 'metric' ) {
    const unit = form.unit.trim()

    return {
      ...base,
      outcome: 'metric',
      ...( unit === '' ? {} : { metric_unit: unit } ),
      metric_target: Number( form.target ),
    }
  }

  if( form.outcome === 'checkin' ) {
    return { ...base, outcome: 'checkin', checkin_cadence: form.cadence }
  }

  return { ...base, outcome: 'learning' }
}

// Only what changed; the unit, target and cadence only for a goal of that outcome
export const updateBody = ( goal: ThemisGoal, form: GoalForm ): UpdateGoalBody => {
  const body: UpdateGoalBody = {}

  if( form.name.trim() !== goal.name ) {
    body.name = form.name.trim()
  }

  if( form.areaId !== goal.area_id ) {
    body.area_id = form.areaId
  }

  if( form.targetDate !== ( goal.target_date ?? '' ) ) {
    body.target_date = form.targetDate === '' ? null : form.targetDate
  }

  if( form.status !== goal.status ) {
    body.status = form.status
  }

  if( goal.outcome === 'metric' ) {
    const unit = form.unit.trim()

    if( unit !== ( goal.metric_unit ?? '' ) ) {
      body.metric_unit = unit === '' ? null : unit
    }

    if( hasNumber( form.target ) && Number( form.target ) !== goal.metric_target ) {
      body.metric_target = Number( form.target )
    }
  }

  if( goal.outcome === 'checkin' && form.cadence !== goal.checkin_cadence ) {
    body.checkin_cadence = form.cadence
  }

  return body
}
