import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { CityLayoutPublishedSnapshot } from '../domain/cityLayoutOverrides'
import type { ClassroomGameService } from '../services'

export type CityLayoutResolutionStatus = 'unresolved' | 'resolved'

export interface CityLayoutContextValue {
  publishedLayout: CityLayoutPublishedSnapshot | null
  status: CityLayoutResolutionStatus
  error: string
}

// eslint-disable-next-line react-refresh/only-export-components
export const unresolvedCityLayoutState = (): CityLayoutContextValue => ({
  publishedLayout: null,
  status: 'unresolved',
  error: '',
})

// eslint-disable-next-line react-refresh/only-export-components
export const resolvedCityLayoutState = (
  publishedLayout: CityLayoutPublishedSnapshot | null,
  error = '',
): CityLayoutContextValue => ({ publishedLayout, status: 'resolved', error })

// Components rendered outside GameProvider (isolated previews/tests) retain
// the historical complete frozen fallback. The real app provider always
// starts explicitly unresolved below.
const CityLayoutContext = createContext<CityLayoutContextValue>(resolvedCityLayoutState(null))

const initialStateFor = (service: ClassroomGameService): CityLayoutContextValue =>
  service.cityLayoutRuntime === 'staging' ? unresolvedCityLayoutState() : resolvedCityLayoutState(null)

export const CityLayoutStateProvider = ({ children, value }: { children: ReactNode; value: CityLayoutContextValue }) => (
  <CityLayoutContext.Provider value={value}>{children}</CityLayoutContext.Provider>
)

export const CityLayoutProvider = ({ children, service }: { children: ReactNode; service: ClassroomGameService }) => {
  const [subscriptionState, setSubscriptionState] = useState<{
    service: ClassroomGameService
    value: CityLayoutContextValue
  }>(() => ({ service, value: initialStateFor(service) }))
  // A replacement service is unresolved on that very render; do not wait
  // for useEffect and briefly expose the previous service's coordinates.
  const state = subscriptionState.service === service
    ? subscriptionState.value
    : initialStateFor(service)

  useEffect(() => {
    if (service.cityLayoutRuntime !== 'staging') {
      setSubscriptionState({ service, value: resolvedCityLayoutState(null) })
      return undefined
    }
    let active = true
    setSubscriptionState({ service, value: unresolvedCityLayoutState() })
    const unsubscribe = service.subscribePublishedCityLayout(
      (publishedLayout) => {
        if (active) setSubscriptionState({ service, value: resolvedCityLayoutState(publishedLayout) })
      },
      (error) => {
        if (active) setSubscriptionState({ service, value: resolvedCityLayoutState(null, error) })
      },
    )
    return () => {
      active = false
      unsubscribe()
    }
  }, [service])

  return <CityLayoutStateProvider value={state}>{children}</CityLayoutStateProvider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const usePublishedCityLayout = (): CityLayoutContextValue => useContext(CityLayoutContext)
