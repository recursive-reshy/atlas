export const deleteBlockedReason = (
  profileId: string,
  defaultId: string | undefined,
  profileCount: number,
): string | null => {
  if( profileId === defaultId ) {
    return 'The default profile can\'t be deleted. Make another profile the default first.'
  }

  return profileCount <= 1 ? 'The last remaining profile can\'t be deleted.' : null
}
