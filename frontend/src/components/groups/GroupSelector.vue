<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  groups: {
    type: Array,
    default: () => [],
  },
  modelValue: {
    type: Array,
    default: () => [],
  },
  loading: {
    type: Boolean,
    default: false,
  },
  messagesLoading: {
    type: Boolean,
    default: false,
  },
  ready: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: '',
  },
})

const emit = defineEmits([
  'update:modelValue',
  'load-messages',
  'retry',
])

const search = ref('')
const maxGroups = 5

const selectedIds = computed(() => {
  const availableIds = new Set(props.groups.map((group) => group.id))

  return [...new Set(props.modelValue)].filter((id) =>
    availableIds.has(id),
  )
})

const filteredGroups = computed(() => {
  const query = search.value.trim().toLowerCase()

  return props.groups.filter((group) =>
    String(group.name ?? '').toLowerCase().includes(query),
  )
})

const busy = computed(() => props.loading || props.messagesLoading)

const canLoad = computed(() => {
  return (
    props.ready &&
    !busy.value &&
    !props.error &&
    selectedIds.value.length > 0 &&
    selectedIds.value.length <= maxGroups
  )
})

function isSelected(id) {
  return selectedIds.value.includes(id)
}

function isDisabled(id) {
  return (
    !props.ready ||
    busy.value ||
    Boolean(props.error) ||
    (!isSelected(id) && selectedIds.value.length >= maxGroups)
  )
}

function toggleGroup(id) {
  if (isDisabled(id)) return

  const nextSelection = isSelected(id)
    ? selectedIds.value.filter((selectedId) => selectedId !== id)
    : [...selectedIds.value, id]

  emit('update:modelValue', nextSelection)
}

function loadMessages() {
  if (!canLoad.value) return

  emit('load-messages', [...selectedIds.value])
}

function unreadCount(value) {
  const count = Number(value)

  return Number.isFinite(count) && count > 0
    ? Math.floor(count)
    : 0
}
</script>

<template>
  <aside class="group-selector" aria-labelledby="groups-heading">
    <div class="panel-heading">
      <div>
        <h3 id="groups-heading">Your groups</h3>
        <p>Select the conversations to review.</p>
      </div>

      <span class="selected-count" aria-live="polite">
        {{ selectedIds.length }} / {{ maxGroups }}
      </span>
    </div>

    <label class="search-label" for="group-search">
      Search groups
    </label>

    <input
      id="group-search"
      v-model="search"
      class="search-input"
      type="search"
      placeholder="Search groups..."
      :disabled="!ready || busy || Boolean(error)"
    />

    <div class="group-content" :aria-busy="loading">
      <div v-if="error" class="feedback" role="alert">
        <h4>Could not load groups</h4>
        <p>{{ error }}</p>

        <button
          class="retry-button"
          type="button"
          :disabled="busy"
          @click="emit('retry')"
        >
          Try again
        </button>
      </div>

      <div v-else-if="loading" class="feedback" role="status">
        <h4>Loading groups…</h4>
        <p>Please wait while your groups are retrieved.</p>
      </div>

      <div v-else-if="!ready" class="feedback">
        <h4>Waiting for WhatsApp</h4>
        <p>Groups will be available when the connection is ready.</p>
      </div>

      <div v-else-if="groups.length === 0" class="feedback">
        <h4>No groups loaded</h4>
        <p>No groups are currently available.</p>

        <button
          class="retry-button"
          type="button"
          @click="emit('retry')"
        >
          Refresh groups
        </button>
      </div>

      <div v-else-if="filteredGroups.length === 0" class="feedback">
        <h4>No matching groups</h4>
        <p>Try another group name.</p>
      </div>

      <ul v-else class="group-list">
        <li v-for="group in filteredGroups" :key="group.id">
          <label
            class="group-item"
            :class="{ selected: isSelected(group.id) }"
          >
            <input
              type="checkbox"
              :checked="isSelected(group.id)"
              :disabled="isDisabled(group.id)"
              @change="toggleGroup(group.id)"
            />

            <span class="group-name">
              {{ group.name || 'Unnamed group' }}
            </span>

            <span
              v-if="unreadCount(group.unreadCount)"
              class="unread-badge"
              :aria-label="`${unreadCount(group.unreadCount)} unread messages`"
            >
              {{ unreadCount(group.unreadCount) }}
            </span>
          </label>
        </li>
      </ul>
    </div>

    <p
      v-if="selectedIds.length >= maxGroups"
      class="selection-notice"
      role="status"
    >
      Five groups selected. Uncheck one to select another.
    </p>

    <button
      class="load-button"
      type="button"
      :disabled="!canLoad"
      @click="loadMessages"
    >
      {{ messagesLoading ? 'Loading messages…' : 'Load messages' }}
    </button>

    <p class="helper-text">
      Select up to five groups. Unread counts do not filter the results.
    </p>
  </aside>
</template>

<style scoped>
.group-selector {
  min-width: 0;
  padding: 24px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface);
  color: var(--text);
}

.panel-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 24px;
}

h3,
h4,
p {
  margin: 0;
}

.panel-heading h3 {
  font-size: 17px;
}

.panel-heading p {
  margin-top: 5px;
  color: var(--muted);
  font-size: 12px;
}

.selected-count {
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.search-label {
  display: block;
  margin-bottom: 7px;
  color: var(--muted);
  font-size: 12px;
}

.search-input {
  box-sizing: border-box;
  width: 100%;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-soft);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}

.search-input::placeholder {
  color: var(--muted);
}

.group-content {
  min-height: 260px;
  margin: 16px 0;
}

.group-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  list-style: none;
}

.group-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  cursor: pointer;
}

.group-item.selected {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.group-item input {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--accent);
}

.group-item:has(input:disabled) {
  cursor: not-allowed;
}

.group-item:has(input:disabled):not(.selected) {
  opacity: 0.6;
}

.group-name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}

.unread-badge {
  flex-shrink: 0;
  min-width: 22px;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  text-align: center;
}

.feedback {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: 12px;
  text-align: center;
}

.feedback h4 {
  font-size: 15px;
}

.feedback p {
  margin-top: 8px;
  color: var(--muted);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.retry-button {
  margin-top: 16px;
  padding: 8px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-soft);
  color: var(--text);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.selection-notice {
  margin-bottom: 12px;
  color: var(--muted);
  font-size: 12px;
}

.load-button {
  width: 100%;
  padding: 12px 16px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: var(--surface);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.load-button:disabled {
  background: var(--accent-soft);
  color: var(--muted);
  cursor: not-allowed;
}

.helper-text {
  margin-top: 10px;
  color: var(--muted);
  font-size: 11px;
  text-align: center;
}

button:focus-visible,
input:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 3px;
}

@media (max-width: 720px) {
  .group-selector {
    padding: 20px;
  }
}
</style>