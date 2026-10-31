import { computed, ref, watch } from 'vue'

export function useAnalysis(messageResults, selection, messagesLoading, request) {
  const analysisLoading = ref(false)
  const analysisResults = ref([])
  const analysisError = ref('')
  let version = 0
  let controller
  function invalidate() {
    version++
    controller?.abort()
    analysisResults.value = []
    analysisError.value = ''
  }
  const stop = watch([messageResults, selection, messagesLoading], invalidate, { deep: true, flush: 'sync' })
  const canAnalyze = computed(() => !messagesLoading.value && !analysisLoading.value
    && messageResults.value.some((g) => !g.error && g.messages.length > 0))
  async function analyzeDisplayed() {
    if (!canAnalyze.value) return
    const token = ++version
    const snapshot = JSON.parse(JSON.stringify(messageResults.value.filter((g) => !g.error)
      .map(({ groupId, messages, history }) => ({ groupId, messages, history }))))
    controller = new AbortController()
    analysisLoading.value = true
    analysisResults.value = []
    analysisError.value = ''
    try {
      const results = await request(snapshot, { signal: controller.signal })
      if (token === version) analysisResults.value = results
    } catch (error) {
      if (token === version && error.name !== 'AbortError') analysisError.value = error.message
    } finally { analysisLoading.value = false }
  }
  function dispose() { invalidate(); stop() }
  return { analysisLoading, analysisResults, analysisError, canAnalyze, analyzeDisplayed, dispose }
}
