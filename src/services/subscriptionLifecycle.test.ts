import { describe, expect, it, vi } from 'vitest'
import { subscribeWithIdentityGuard } from './subscriptionLifecycle'

describe('subscription identity lifecycle', () => {
  it('ignores delayed callbacks after the previous identity is detached', () => {
    let oldListener: ((value: string) => void) | null = null
    let newListener: ((value: string) => void) | null = null
    const values: string[] = []
    const oldUnsubscribe = vi.fn()
    const newUnsubscribe = vi.fn()

    const detachOld = subscribeWithIdentityGuard<string>(
      (listener) => { oldListener = listener; return oldUnsubscribe },
      (value) => values.push(value),
      () => undefined,
    )
    detachOld()
    subscribeWithIdentityGuard<string>(
      (listener) => { newListener = listener; return newUnsubscribe },
      (value) => values.push(value),
      () => undefined,
    )

    ;(oldListener as ((value: string) => void) | null)?.('room-a-late')
    ;(newListener as ((value: string) => void) | null)?.('room-b-current')

    expect(oldUnsubscribe).toHaveBeenCalledOnce()
    expect(values).toEqual(['room-b-current'])
  })
})
