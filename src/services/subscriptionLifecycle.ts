export const subscribeWithIdentityGuard = <T>(
  subscribe: (listener: (data: T) => void, onError: (message: string) => void) => () => void,
  onData: (data: T) => void,
  onError: (message: string) => void,
): (() => void) => {
  let active = true
  const unsubscribe = subscribe(
    (data) => { if (active) onData(data) },
    (message) => { if (active) onError(message) },
  )
  return () => {
    active = false
    unsubscribe()
  }
}
