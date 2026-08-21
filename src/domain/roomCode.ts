// Excludes I/O/0/1 so a spoken or handwritten code is never ambiguous.
// Kept dependency-free (no Firebase import) so it's safe to import from
// anywhere, including Node-side rules/emulator tests.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const ROOM_CODE_LENGTH = 4

export const randomRoomId = (): string =>
  Array.from({ length: ROOM_CODE_LENGTH }, () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]).join('')
