<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import AppHeader from './components/layout/AppHeader.vue'
import {getConnectionStatus,getGroups,getGroupMessages,} from './services/api'
import GroupSelector from './components/groups/GroupSelector.vue'


const isDark = ref(false)
const connectionStatus = ref('not_checked')
const statusError = ref('')
const groups = ref([])
const selectedGroupIds = ref([])
const groupsLoading = ref(false)
const groupsError = ref('')

const messagesLoading = ref(false)
const messageResults = ref([])
const messagesError = ref('')
const hasLoadedMessages = ref(false)

const statusController = new AbortController()

onMounted(async () => {
  try {
    const data = await getConnectionStatus({
      signal: statusController.signal,
    })

    // Confirm this field matches your backend response.
    const status = data.whatsapp?.status

    if (typeof status !== 'string') {
      throw new Error('Unexpected status response format.')
    }

    connectionStatus.value = status
    if (status === 'ready') {
  await loadGroups()
}
  } catch (error) {
    if (error.name === 'AbortError') return

    connectionStatus.value = 'error'
    statusError.value = error.message
  }
})

onUnmounted(() => {
  statusController.abort()
})

async function loadGroups() {
  if (connectionStatus.value !== 'ready' || groupsLoading.value) return

  groupsLoading.value = true
  groupsError.value = ''

  try {
    const loadedGroups = await getGroups({
      signal: statusController.signal,
    })

    groups.value = loadedGroups

    const availableIds = new Set(loadedGroups.map((group) => group.id))

    selectedGroupIds.value = selectedGroupIds.value.filter((id) =>
      availableIds.has(id),
    )
  } catch (error) {
    if (error.name === 'AbortError') return

    groupsError.value = error.message
  } finally {
    groupsLoading.value = false
  }
}

async function loadMessages(groupIds) {
  if (connectionStatus.value !== 'ready' || messagesLoading.value) return

  const uniqueIds = Array.isArray(groupIds)
    ? [...new Set(groupIds)]
    : []

  const availableIds = new Set(groups.value.map((group) => group.id))

  if (
    uniqueIds.length === 0 ||
    uniqueIds.length > 5 ||
    uniqueIds.some((id) => !availableIds.has(id))
  ) {
    messagesError.value = 'Please select between one and five available groups.'
    return
  }

  messagesLoading.value = true
  messagesError.value = ''
  messageResults.value = []
  hasLoadedMessages.value = false

  try {
    const results = []

    // Fetch one group at a time to avoid overlapping history loads.
    for (const groupId of uniqueIds) {
      const group = groups.value.find((item) => item.id === groupId)

      try {
        const data = await getGroupMessages(groupId, {
          signal: statusController.signal,
        })

        results.push({
          groupId,
          groupName: group?.name || 'Unnamed group',
          messages: data.messages,
          error: '',
        })
      } catch (error) {
        if (error.name === 'AbortError') return

        results.push({
          groupId,
          groupName: group?.name || 'Unnamed group',
          messages: [],
          error: error.message,
        })
      }
    }

    messageResults.value = results
    hasLoadedMessages.value = true
  } finally {
    messagesLoading.value = false
  }
}

function formatMessageTime(timestamp) {
  if (timestamp === null || timestamp === undefined || timestamp === '') {
    return 'Time unavailable'
  }

  const value =
    typeof timestamp === 'string' && /^\d+(\.\d+)?$/.test(timestamp)
      ? Number(timestamp)
      : timestamp

  const date =
    typeof value === 'number'
      ? new Date(value < 1e12 ? value * 1000 : value)
      : new Date(value)

  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : date.toLocaleString()
}




</script>

<template>
  <div class="dashboard" :class="{ dark: isDark }">
    <AppHeader
  :is-dark="isDark"
  :connection-status="connectionStatus"
  @toggle-theme="isDark = !isDark"
    />

    <main class="main">
      <p v-if="statusError" class="notice" role="alert">
  {{ statusError }}
</p>
      <section class="intro">
        <div>
          <p class="eyebrow">YOUR CONVERSATION WORKSPACE</p>
          <h2>Focus on what matters.</h2>
          <p class="description">
            Review group conversations and find important updates in one place.
          </p>
        </div>

        <span class="preview-badge">UI preview</span>
      </section>

      <div class="workspace">
        <GroupSelector
          v-model="selectedGroupIds"
          :groups="groups"
          :ready="connectionStatus === 'ready'"
          :loading="groupsLoading"
          :messages-loading="messagesLoading"
          :error="groupsError"
          @retry="loadGroups"
          @load-messages="loadMessages"
        />
<section class="panel content-panel" :aria-busy="messagesLoading">
  <div class="panel-heading content-heading">
    <div>
      <h3>Recent messages</h3>
      <p>Recent text messages — up to 10 per group.</p>
    </div>
  </div>

  <p v-if="messagesError" class="notice" role="alert">
    {{ messagesError }}
  </p>

  <div
    v-if="messagesLoading"
    class="empty-state messages-empty"
    role="status"
  >
    <div class="empty-icon" aria-hidden="true">≡</div>
    <h4>Loading messages…</h4>
    <p>Checking the selected groups. History loading may take some time.</p>
  </div>

  <div
    v-else-if="!hasLoadedMessages"
    class="empty-state messages-empty"
  >
    <div class="empty-icon" aria-hidden="true">≡</div>
    <h4>Select your conversations</h4>
    <p>Choose groups and press Load messages.</p>
  </div>

  <div v-else class="message-results">
        <section
          v-for="result in messageResults"
          :key="result.groupId"
          class="group-result"
        >
          <div class="result-heading">
            <h4>{{ result.groupName }}</h4>

            <span v-if="!result.error" class="count">
              {{ result.messages.length }} messages
            </span>
          </div>

          <p v-if="result.error" class="notice" role="alert">
            {{ result.error }} Press Load messages to try again.
          </p>

          <p v-else-if="result.messages.length === 0" class="result-note">
            No text messages were returned within the available history
            and search limits.
          </p>

          <template v-else>
            <article
              v-for="(message, index) in result.messages"
              :key="message.id || index"
              class="message-card"
            >
              <p class="message-time">
                {{ formatMessageTime(message.timestamp) }}
              </p>

              <p class="message-body">{{ message.body }}</p>
            </article>
          </template>
        </section>
      </div>

      <div class="notice">
        Recent messages are not necessarily unread messages.
        Results may be limited by available history and backend scan limits.
      </div>
    </section>

        <section class="panel analysis-panel">
          <div class="panel-heading">
            <div>
              <h3>AI insights</h3>
              <p>A clearer view of your conversations.</p>
            </div>
          </div>

          <div class="insight-item">
            <span class="insight-icon" aria-hidden="true">!</span>
            <div>
              <h4>Important updates</h4>
              <p>Key announcements and useful information.</p>
            </div>
          </div>

          <div class="insight-item">
            <span class="insight-icon" aria-hidden="true">≡</span>
            <div>
              <h4>Conversation summary</h4>
              <p>A short overview of the discussion.</p>
            </div>
          </div>

          <div class="insight-item">
            <span class="insight-icon" aria-hidden="true">✓</span>
            <div>
              <h4>Tasks and deadlines</h4>
              <p>Actions and dates you may need to remember.</p>
            </div>
          </div>

          <div class="analysis-action">
            <button class="primary-button" type="button" disabled>
              Analyze messages
            </button>

            <p class="helper-text">
              Local AI integration is not configured yet.
            </p>
          </div>
        </section>
      </div>

      <footer class="footer">
        UI preview only. No WhatsApp or AI requests are made by this page.
      </footer>
    </main>
  </div>
</template>

<style scoped>
.dashboard {
  --background: #f4f7f8;
  --surface: #ffffff;
  --surface-soft: #f7f9fa;
  --text: #172b35;
  --muted: #657780;
  --border: #e2e9ed;
  --accent: #0f766e;
  --accent-soft: #e6f4f1;

  min-height: 100vh;
  background: var(--background);
  color: var(--text);
  font-family: 'Segoe UI', Arial, sans-serif;
  line-height: 1.5;
  color-scheme: light;
}

.dashboard.dark {
  --background: #10191e;
  --surface: #18242b;
  --surface-soft: #1e2d35;
  --text: #edf4f6;
  --muted: #a4b6bf;
  --border: #30434d;
  --accent: #66d5c2;
  --accent-soft: #203e3a;

  color-scheme: dark;
}

.dashboard,
.dashboard :deep(*) {
  box-sizing: border-box;
}

h2,
h3,
h4,
p {
  margin: 0;
}

button,
input {
  font: inherit;
}

button:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 4px;
}

.main {
  max-width: 1600px;
  margin: 0 auto;
  padding: 36px 40px;
}

.intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 28px;
}

.eyebrow {
  margin-bottom: 8px;
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1.6px;
}

.intro h2 {
  font-size: clamp(26px, 3vw, 36px);
  letter-spacing: -1.2px;
}

.description {
  margin-top: 8px;
  color: var(--muted);
  font-size: 14px;
}

.preview-badge,
.status-badge,
.count {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

.preview-badge,
.status-badge {
  background: var(--surface-soft);
  color: var(--muted);
  border: 1px solid var(--border);
}

.preview-badge {
  white-space: nowrap;
}

.count {
  flex-shrink: 0;
  background: var(--accent-soft);
  color: var(--accent);
}

.workspace {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 300px;
  gap: 20px;
  align-items: stretch;
}

.panel {
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}

.panel-heading h3 {
  font-size: 17px;
}

.panel-heading p {
  margin-top: 5px;
  color: var(--muted);
  font-size: 12px;
}

.search-label {
  display: block;
  margin-bottom: 7px;
  color: var(--muted);
  font-size: 12px;
}

.search-input {
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-soft);
  color: var(--muted);
}

.search-input::placeholder {
  color: var(--muted);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.group-empty {
  min-height: 260px;
  padding: 24px 4px;
}

.empty-icon {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin-bottom: 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-soft);
  color: var(--accent);
  font-size: 30px;
}

.empty-state h4 {
  margin-bottom: 8px;
  font-size: 16px;
}

.empty-state p {
  max-width: 310px;
  color: var(--muted);
  font-size: 13px;
}

.primary-button {
  width: 100%;
  padding: 12px 16px;
  border: 0;
  border-radius: 10px;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 600;
}

.primary-button:disabled {
  cursor: not-allowed;
}

.helper-text {
  margin-top: 10px;
  color: var(--muted);
  font-size: 11px;
  text-align: center;
}

.content-panel {
  display: flex;
  flex-direction: column;
}

.content-heading {
  flex-wrap: wrap;
}

.messages-empty {
  flex: 1;
  min-height: 320px;
  padding: 30px 12px;
}

.notice {
  margin-top: 24px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-soft);
  color: var(--muted);
  font-size: 12px;
}

.analysis-panel {
  display: flex;
  flex-direction: column;
}

.insight-item {
  display: flex;
  gap: 12px;
  padding: 20px 0;
  border-bottom: 1px solid var(--border);
}

.insight-icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: var(--accent-soft);
  color: var(--accent);
  font-weight: 700;
}

.insight-item h4 {
  font-size: 13px;
}

.insight-item p {
  margin-top: 5px;
  color: var(--muted);
  font-size: 12px;
}

.analysis-action {
  margin-top: auto;
  padding-top: 28px;
}

.footer {
  margin-top: 24px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 1150px) {
  .workspace {
    grid-template-columns: 260px minmax(0, 1fr);
  }

  .analysis-panel {
    grid-column: 1 / -1;
  }
}

@media (max-width: 720px) {
  .main {
    padding: 26px 16px;
  }

  .intro {
    align-items: flex-start;
  }

  .workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .analysis-panel {
    grid-column: auto;
  }

  .panel {
    padding: 20px;
  }

  .group-empty {
    min-height: 180px;
  }
}

.message-results {
  display: flex;
  flex-direction: column;
  gap: 28px;
  max-height: 650px;
  overflow-y: auto;
}

.group-result {
  min-width: 0;
}

.result-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.result-heading h4 {
  overflow-wrap: anywhere;
  font-size: 14px;
}

.result-note {
  color: var(--muted);
  font-size: 13px;
}

.message-card {
  margin-bottom: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-soft);
}

.message-time {
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 11px;
}

.message-body {
  color: var(--text);
  font-size: 13px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>