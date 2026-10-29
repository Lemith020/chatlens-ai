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

export async function getGroups({ signal } = {}) {
  const response = await fetch('/api/groups', {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`Groups request failed (${response.status}).`)
  }

  const data = await response.json()

  if (!Array.isArray(data.groups)) {
    throw new Error('Unexpected groups response format.')
  }

  return data.groups
}

export async function getGroupMessages(groupId, { signal } = {}) {
  const encodedId = encodeURIComponent(groupId)

  const response = await fetch(`/api/groups/${encodedId}/messages`, {
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
    signal,
  })

  if (!response.ok) {
    throw new Error(`Messages request failed (${response.status}).`)
  }

  const data = await response.json()

  if (!Array.isArray(data.messages)) {
    throw new Error('Unexpected messages response format.')
  }

  return {
    messages: data.messages,
    history: data.history,
  }
}