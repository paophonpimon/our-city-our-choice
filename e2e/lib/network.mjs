// Named network profiles applied via Chrome DevTools Protocol so each browser
// context can simulate a different real-world connection quality.
const PROFILES = {
  normal: null,
  'high-latency': { offline: false, latency: 700, downloadThroughput: 900_000, uploadThroughput: 300_000 },
  slow: { offline: false, latency: 1600, downloadThroughput: 150_000, uploadThroughput: 60_000 },
}

export const PROFILE_NAMES = Object.keys(PROFILES)

export async function applyNetworkProfile(page, profileName) {
  const profile = PROFILES[profileName]
  if (!profile) return null
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', profile)
  return cdp
}
