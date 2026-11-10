// Moves `id` to `index` among `ids`, a position past the end meaning the end
export const reordered = ( ids: string[], id: string, index: number ): string[] => {
  const rest = ids.filter( ( other ) => other !== id )

  rest.splice( Math.min( index, rest.length ), 0, id )

  return rest
}
