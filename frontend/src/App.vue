<script setup>
import { ref } from 'vue'
import AppHeader from './components/layout/AppHeader.vue'

const isDark = ref(false)
</script>

<template>
  <div class="dashboard" :class="{ dark: isDark }">
    <AppHeader
      :is-dark="isDark"
      @toggle-theme="isDark = !isDark"
    />

    <main class="main">
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
        <aside class="panel groups-panel">
          <div class="panel-heading">
            <div>
              <h3>Your groups</h3>
              <p>Select the conversations to review.</p>
            </div>

            <span class="count">0 / 5</span>
          </div>

          <label class="search-label" for="group-search">
            Search groups
          </label>

          <input
            id="group-search"
            class="search-input"
            type="search"
            placeholder="Search groups..."
            disabled
          />

          <div class="empty-state group-empty">
            <div class="empty-icon" aria-hidden="true">◎</div>
            <h4>No groups loaded</h4>
            <p>
              Your WhatsApp groups will appear here after we connect the API.
            </p>
          </div>

          <button class="primary-button" type="button" disabled>
            Load messages
          </button>

          <p class="helper-text">Select up to five groups.</p>
        </aside>

        <section class="panel content-panel">
          <div class="panel-heading content-heading">
            <div>
              <h3>Recent messages</h3>
              <p>Recent text messages — up to 10 per group.</p>
            </div>

            <span class="status-badge">API not connected</span>
          </div>

          <div class="empty-state messages-empty">
            <div class="empty-icon" aria-hidden="true">≡</div>
            <h4>Your workspace is ready</h4>
            <p>
              Select a group and load its messages to start reviewing
              the conversation.
            </p>
          </div>

          <div class="notice">
            Recent messages are not necessarily unread messages.
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
</style>