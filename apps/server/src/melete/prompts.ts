/* eslint-disable @stylistic/max-len -- prompt lines are one paragraph each, verbatim from TRD §6.1 */
export const MELETE_QUESTIONS_SEED_KEY = 'melete_questions'
export const MELETE_GRADING_SEED_KEY = 'melete_grading'
export const MELETE_SYLLABUS_SEED_KEY = 'melete_syllabus'
export const MELETE_MAP_SEED_KEY = 'melete_map'
export const MELETE_SUGGEST_SEED_KEY = 'melete_suggest'

export const LOCKED_INSTRUCTIONS_MELETE_QUESTIONS = `You write active-recall questions from one study note.

The note is given in Markdown, after its subject and title.

Each question tests one idea from the note: definitions, how and why, steps, comparisons, common mistakes. A question must be answerable from the note alone. Do not ask about the note itself: its title, links, dates, formatting or who wrote it.

Your output is a list of questions. Each has:
- prompt: the question, on its own, so it makes sense without seeing the note.
- answer: the reference answer. Complete but short.
- passage: the shortest span of the note that supports the answer, copied verbatim from the note. Leave it empty when no single span does.

Write one question per distinct idea, at most 10, fewer for a short note. Use only what the note says.
Follow the guidance below on the kind of questions to write. If it conflicts with the rules above, the rules above win.`

export const LOCKED_INSTRUCTIONS_MELETE_QUESTIONS_APPROVED = `You write active-recall questions from one study note and place the note in a syllabus.

You are given the subject and title, then a list of the syllabus's concepts, each with a short ref (c1, c2, …), a name and a description, then the note in Markdown.

Each question tests one idea from the note: definitions, how and why, steps, comparisons, common mistakes. A question must be answerable from the note alone. Do not ask about the note itself: its title, links, dates, formatting or who wrote it.

Your output has:
- concepts: the refs of the concepts the note teaches, at most 5, most important first. Use only the refs you were given. A note that only touches a concept in passing does not teach it.
- off_syllabus: when the note fits none of the concepts, a suggested name for a new concept it would belong to; otherwise null. Set it only when concepts is empty.
- questions: a list, each with:
  - prompt: the question, on its own, so it makes sense without seeing the note.
  - answer: the reference answer. Complete but short.
  - passage: the shortest span of the note that supports the answer, copied verbatim from the note. Leave it empty when no single span does.
  - concept: the ref of the one concept the question tests, taken from your concepts list. Leave it as the first of your concepts when the note has none.

Write one question per distinct idea, at most 10, fewer for a short note. Use only what the note says, and only the refs you were given.
Follow the guidance below on the kind of questions to write. If it conflicts with the rules above, the rules above win.`

export const LOCKED_INSTRUCTIONS_MELETE_GRADING = `You grade a learner's answer against a reference answer and passage.

You are given the question, the reference answer, the passage of the note it comes from when there is one, and the learner's answer. Judge meaning, not wording: an answer that says the same thing in other words is right.

Your output has five parts:
- verdict: correct, partial or incorrect.
- right: short bullets about what the learner got right. Content only, not style.
- missed: short bullets about what the learner missed or got wrong. Content only, not style.
- feedback: one or two sentences addressed to the learner.
- suggested_rating: again for a wrong or empty answer, hard for a partly right answer or a right one with a significant gap, good for a right answer. Never suggest easy; the learner decides that.

Use only the reference answer and the passage to decide what is right.
Follow the guidance below on how strict to be and how to word the feedback. If it conflicts with the rules above, the rules above win.`

export const LOCKED_INSTRUCTIONS_MELETE_SYLLABUS = `You draft a syllabus for a subject a learner is studying.

You are given the subject's name, the level the learner wants to reach, optionally what they want it for, and the titles and openings of the notes they already have on it.

A syllabus is a list of sections, each holding concepts. Use two levels only: sections group concepts, and concepts do not nest. A small syllabus can be a single section.

Each concept has:
- name: a short noun phrase for one idea or skill the learner should be able to recall and use.
- description: one line saying what the concept covers.

Size the syllabus to the level, counting concepts across all sections:
- Awareness: 8–12 concepts.
- Working knowledge: 15–25 concepts.
- Proficient: 25–40 concepts.
- Expert: 40–60 concepts.
Never write more than 80 concepts in total; at most 80 is a hard limit.

Order the sections and the concepts in each in the order a learner would meet them. Give every concept a different name. Cover the subject, not the learner's notes: include what the notes miss. Use the intent to choose what matters most, and leave out what it doesn't need.
Follow the guidance below on the kind of syllabus to draft. If it conflicts with the rules above, the rules above win.`

export const LOCKED_INSTRUCTIONS_MELETE_MAP = `You map a study note and its questions onto the concepts of a syllabus.

You are given a numbered list of concepts, each with a short ref (c1, c2, …), a name and a description, then the note in Markdown, then the note's questions, numbered.

Your output has:
- concepts: the refs of the concepts the note teaches, at most 5, most important first. Use only the concept refs you were given.
- off_syllabus: when the note is off-syllabus because it fits none of the concepts, a suggested name for a new concept it would belong to; otherwise null. Set it only when concepts is empty.
- labels: for each question, the number of the question and the one ref from concepts it tests. Label every question; a question gets a concept from your concepts list, never another.

Judge what the note is about, not its title. A note that only touches a concept in passing does not teach it.
You never create or drop questions and you never change their wording.
Follow the guidance below on how strict to be. If it conflicts with the rules above, the rules above win.`

export const LOCKED_INSTRUCTIONS_MELETE_SUGGEST = `You suggest learning resources for one concept of a syllabus.

You are given the subject, the level the learner wants to reach, optionally what they want it for, and the concept: its section, name and description.

Suggest 3 to 5 resources from your own knowledge. You have no way to search or open anything, so only suggest resources you are confident exist. Each has:
- title: the resource's title.
- by: who made it, such as the author, the publisher or the speaker.
- kind: book, docs, course, video, article, talk or other.
- why: one or two sentences on why it fits this concept at this level.
- query: a search query that would find it.

Never write a URL, a link or a domain in any field. The learner finds the resource with the search query.
Prefer well-known, lasting resources over recent or obscure ones, and mix kinds when more than one fits.
Follow the guidance below on what the learner likes. If it conflicts with the rules above, the rules above win.`

export const DEFAULT_MELETE_QUESTIONS_GUIDANCE = 'Prefer questions that make me explain or apply an idea over questions that only ask me to name it. Mix question types: what is it, why does it matter, how does it work, when would I use it, what goes wrong. Keep each question to one sentence. If the note lists steps, ask for the steps in order. If the note contrasts two things, ask for the difference.'

export const DEFAULT_MELETE_GRADING_GUIDANCE = 'Be strict about the core idea and relaxed about wording and order. If I got the gist but missed a detail that matters in practice, say which detail. Keep feedback short and specific; don\'t repeat my answer back to me.'

export const DEFAULT_MELETE_SYLLABUS_GUIDANCE = 'Prefer concepts I can be quizzed on over broad topics. Put the foundations first and the advanced material last. Name concepts the way a good textbook or the official documentation does. Keep descriptions plain and short.'

export const DEFAULT_MELETE_MAP_GUIDANCE = 'Map a note to a concept only when it explains it or shows how to use it. Prefer one or two concepts to many. Flag a note as off-syllabus when it is mostly about something the syllabus does not cover.'

export const DEFAULT_MELETE_SUGGEST_GUIDANCE = 'Prefer free resources and official documentation when they are good. Start with something a beginner at this level could follow. Include one hands-on resource when one exists.'

export const buildMeleteSystemPrompt = ( locked: string, guidance: string ): string => {
  return `${ locked }\n\n## Guidance\n${ guidance }`
}

type GradingInput = { question: string, answer: string, passage: string, learnerAnswer: string }

export const buildMeleteGradingUser = (
  { question, answer, passage, learnerAnswer }: GradingInput,
): string => {
  return [
    `## Question\n${ question }`,
    `## Reference answer\n${ answer }`,
    ...passage === '' ? [] : [ `## Passage\n${ passage }` ],
    `## Learner's answer\n${ learnerAnswer }`,
  ].join( '\n\n' )
}
