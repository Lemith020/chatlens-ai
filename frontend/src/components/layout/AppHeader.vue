<script setup>
import logo from '../../assets/logo.jpg'
import ConnectionStatus from '../connection/ConnectionStatus.vue'

defineProps({
  isDark: {
    type: Boolean,
    default: false,
  },
  connectionStatus: {
    type: String,
    default: 'not_checked',
  },
})

defineEmits(['toggle-theme'])
</script>

<template>
  <header class="header">
    <div class="brand">
      <img class="brand-logo" :src="logo" alt="" />

      <div>
        <h1>ChatLens AI</h1>
        <p>Less noise. More clarity.</p>
      </div>
    </div>

    <div class="header-actions">
        <ConnectionStatus :status="connectionStatus" />
      <span class="local-badge">Local processing</span>

      <button
        class="theme-button"
        type="button"
        :aria-pressed="isDark"
        @click="$emit('toggle-theme')"
      >
        {{ isDark ? '☀ Light mode' : '☾ Dark mode' }}
      </button>
    </div>
  </header>
</template>

<style scoped>
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 22px 40px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.brand,
.header-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-logo {
  display: block;
  width: 46px;
  height: 46px;
  object-fit: contain;
  border-radius: 12px;
  flex-shrink: 0;
}

.brand h1 {
  margin: 0;
  color: var(--text);
  font-size: 21px;
  letter-spacing: -0.6px;
}

.brand p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
}

.local-badge {
  display: inline-flex;
  align-items: center;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.theme-button {
  padding: 9px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}

.theme-button:hover {
  background: var(--surface-soft);
}

.theme-button:focus-visible {
  outline: 3px solid var(--accent);
  outline-offset: 4px;
}

@media (max-width: 720px) {
  .header {
    flex-wrap: wrap;
    padding: 18px;
  }

  .header-actions {
    flex-wrap: wrap;
    width: 100%;
    justify-content: space-between;
  }
}
</style>