export async function getConnectionStatus({ signal } = {}) {
  const response = await fetch('/api/status', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`Status request failed (${response.status}).`)
  }

  return response.json()
}
