// Ingested text goes into a prompt inside a tag the locked instructions call data, never
// instructions. A closing tag inside the text is neutralised so the text cannot end the block.
const wrap = ( tag: string, text: string ): string => {
  return `<${ tag }>\n${ text.replaceAll( `</${ tag }>`, `</${ tag }_>` ) }\n</${ tag }>`
}

export const wrapSourceContent = ( text: string ): string => wrap( 'source_content', text )

export const wrapLearnerAnswer = ( text: string ): string => wrap( 'learner_answer', text )
