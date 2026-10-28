<script setup>
import { computed } from 'vue'

const props = defineProps({
  status: {
    type: String,
    default: 'not_checked',
  },
})

const statuses = {
  not_checked: {
    label: 'Not checked',
    description: 'WhatsApp connection has not been checked yet.',
    tone: 'neutral',
  },
  starting: {
    label: 'Starting',
    description: 'WhatsApp is starting.',
    tone: 'pending',
  },
  connecting: {
    label: 'Connecting',
    description: 'Connecting to WhatsApp.',
    tone: 'pending',
  },
  authenticated: {
    label: 'Syncing',
    description: 'Login is approved. Waiting for WhatsApp to become ready.',
    tone: 'pending',
  },
  ready: {
    label: 'Ready',
    description: 'WhatsApp is ready.',
    tone: 'success',
  },
  disconnected: {
    label: 'Disconnected',
    description: 'WhatsApp is disconnected.',
    tone: 'neutral',
  },
  auth_failed: {
    label: 'Login failed',
    description: 'WhatsApp authentication failed.',
    tone: 'error',
  },
  error: {
    label: 'Error',
    description: 'A WhatsApp connection error occurred.',
    tone: 'error',
  },
}

const currentStatus = computed(() => {
  return statuses[props.status] ?? {
    label: 'Unknown',
    description: 'The connection status is not recognized.',
    tone: 'neutral',
  }
})
</script>

<template>
  <span
    class="connection-status"
    :class="`connection-status--${currentStatus.tone}`"
    :title="currentStatus.description"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    <span class="status-dot" aria-hidden="true"></span>
    <span>WhatsApp: {{ currentStatus.label }}</span>
  </span>
</template>

<style scoped>
.connection-status {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 11px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-soft);
  color: var(--text);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
}

.status-dot {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 50%;
  background: var(--muted);
}

.connection-status--success .status-dot {
  background: var(--accent);
}

.connection-status--pending .status-dot {
  background: #d99a16;
}

.connection-status--error .status-dot {
  background: #ef6464;
}
</style>