const DATE_LENGTH = 10

export const formatDate = ( iso: string | null ): string => {
  return iso === null ? '' : iso.slice( 0, DATE_LENGTH )
}
