/* eslint-disable @stylistic/max-len -- prompt lines are one paragraph each, verbatim from TRD §5 */
// Packages
import { describe, it, expect } from 'vitest'
// Shared
import { Guidance } from '@atlas/shared'
// Summarizer
import {
  LOCKED_INSTRUCTIONS_ARTICLE,
  LOCKED_INSTRUCTIONS_VIDEO,
  SEEDED_PROFILES,
  STUDY_GUIDANCE,
  STUDY_SEED_KEY,
  buildSystemPrompt,
} from './prompts.js'

describe( 'LOCKED_INSTRUCTIONS_VIDEO', () => {
  it( 'is the text of TRD §5.1', () => {
    expect( LOCKED_INSTRUCTIONS_VIDEO ).toBe( [
      'You summarize the transcript of a video for a personal Obsidian vault.',
      '',
      'Each transcript line starts with the second at which it begins, in square brackets, for example [754].',
      '',
      'Your output has four parts:',
      '- overview: the main summary, in Markdown. Use paragraphs, bullet lists and bold lead-ins. Do not use headings, tables, images or code blocks; the app adds the headings.',
      '- key_points: the most useful points, in the order they come up. Each is one or two sentences on a single line, with the second where it is made.',
      '- quotes: notable lines copied word for word from the transcript, each with the second where it occurs. A quote that is not word for word is discarded.',
      '- tags: 3 to 5 short topical tags, lowercase, without the # sign.',
      '',
      'Use only what the transcript says. When you add your own judgement, label it as your inference.',
      'Follow the guidance below on what to focus on and how to frame it. If it conflicts with the rules above, the rules above win.',
    ].join( '\n' ) )
  } )
} )

describe( 'SEEDED_PROFILES', () => {
  it( 'ships business, coding, general and study, in that order', () => {
    expect( SEEDED_PROFILES.map( ( { seedKey, name } ) => ( { seedKey, name } ) ) ).toEqual( [
      { seedKey: 'business', name: 'Business ideas' },
      { seedKey: 'coding', name: 'Coding' },
      { seedKey: 'general', name: 'General' },
      { seedKey: 'study', name: 'Study' },
    ] )
  } )

  it.each( SEEDED_PROFILES.map( ( profile ) => [ profile.seedKey, profile.guidance ] ) )(
    'has valid, already trimmed guidance for %s',
    ( _seedKey, guidance ) => {
      expect( Guidance.parse( guidance ) ).toBe( guidance )
    },
  )

  it( 'asks the business profile for the six overview parts in order', () => {
    const guidance = SEEDED_PROFILES[ 0 ]?.guidance ?? ''
    const leadIns = [
      '**The core claim:**',
      '**Ideas worth exploring:**',
      '**Evidence:**',
      '**How to validate:**',
      '**Watch-outs:**',
      '**Next step:**',
    ]
    const positions = leadIns.map( ( leadIn ) => guidance.indexOf( leadIn ) )

    expect( positions.every( ( position ) => position >= 0 ) ).toBe( true )
    expect( positions ).toEqual( [ ...positions ].sort( ( a, b ) => a - b ) )
    expect( guidance.startsWith( 'I\'m a full-stack software engineer and freelancer' ) ).toBe( true )
    expect( guidance.endsWith( 'over people\'s names.' ) ).toBe( true )
  } )

  it( 'asks the coding profile for five overview parts and backticks', () => {
    const guidance = SEEDED_PROFILES[ 1 ]?.guidance ?? ''

    for( const leadIn of [
      '**What it teaches:**',
      '**How it works:**',
      '**When to use it, and when not to:**',
      '**Gotchas:**',
      '**Try it:**',
    ] ) {
      expect( guidance ).toContain( leadIn )
    }

    expect( guidance ).toContain( 'in backticks.' )
    expect( guidance.endsWith( 'not the speaker\'s name.' ) ).toBe( true )
  } )

  it( 'keeps the 0.3 behaviour for the general profile', () => {
    expect( SEEDED_PROFILES[ 2 ]?.guidance ).toBe( [
      'Write the overview in a few paragraphs covering the main argument.',
      'List the key points.',
      'Pick notable quotes.',
      'Suggest short topical tags.',
    ].join( '\n' ) )
  } )
} )

describe( 'LOCKED_INSTRUCTIONS_ARTICLE', () => {
  it( 'is the article text of TRD §5.1', () => {
    expect( LOCKED_INSTRUCTIONS_ARTICLE ).toBe( [
      'You summarize an article for a personal Obsidian vault.',
      '',
      'The article is given in Markdown.',
      '',
      'Your output has four parts:',
      '- overview: the main summary, in Markdown. Use paragraphs, bullet lists and bold lead-ins. Do not use headings, tables, images or code blocks; the app adds the headings.',
      '- key_points: the most useful points, in the order they come up. Each is one or two sentences on a single line.',
      '- quotes: notable sentences copied word for word from the article, without Markdown formatting. A quote that is not word for word is discarded.',
      '- tags: 3 to 5 short topical tags, lowercase, without the # sign.',
      '',
      'Use only what the article says. When you add your own judgement, label it as your inference.',
      'The guidance below may talk about videos; apply it to this article the same way.',
      'Follow the guidance below on what to focus on and how to frame it. If it conflicts with the rules above, the rules above win.',
    ].join( '\n' ) )
  } )
} )

describe( 'buildSystemPrompt', () => {
  it( 'joins the video instructions and the guidance in guidance tags', () => {
    expect( buildSystemPrompt( 'Focus on pricing.', 'video' ) ).toBe(
      `${ LOCKED_INSTRUCTIONS_VIDEO }\n\n<guidance>\nFocus on pricing.\n</guidance>`,
    )
  } )

  it( 'joins the article instructions and the guidance in guidance tags', () => {
    expect( buildSystemPrompt( 'Focus on pricing.', 'article' ) ).toBe(
      `${ LOCKED_INSTRUCTIONS_ARTICLE }\n\n<guidance>\nFocus on pricing.\n</guidance>`,
    )
  } )
} )

describe( 'the Study profile text', () => {
  it( 'uses the seed key study', () => {
    expect( STUDY_SEED_KEY ).toBe( 'study' )
  } )

  it( 'is the text of TRD §8', () => {
    expect( STUDY_GUIDANCE ).toBe( 'Summarize this for someone learning the subject, so the note can be studied and quizzed on later. Lead with the key concepts, each with a plain definition. Explain how things work and why, not just what. Capture any steps or procedures in order, with what each step is for. Keep the examples that make an idea click. Call out common mistakes, misconceptions and limits. Leave out anecdotes, sponsor segments, calls to action and anything about the presenter. Use precise terms and define jargon the first time it appears.' )
  } )

  it( 'passes the guidance rules for an editable prompt', () => {
    expect( Guidance.safeParse( STUDY_GUIDANCE ).success ).toBe( true )
  } )

  it( 'is the guidance of the Study entry in SEEDED_PROFILES', () => {
    expect( SEEDED_PROFILES.find( ( { seedKey } ) => seedKey === 'study' )?.guidance )
      .toBe( STUDY_GUIDANCE )
  } )
} )
