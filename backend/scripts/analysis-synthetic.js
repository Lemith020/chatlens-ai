// Public synthetic fixtures only. Never substitute real chats in this diagnostic.
function syntheticGroups() {
  return [
    { groupId: '101@g.us', messages: [
      { id: 'synthetic-en-1', body: '  Student survey is open.\nPlease complete the survey by Friday at 5 PM.  ' },
    ] },
    { groupId: '202@g.us', messages: [
      { id: 'synthetic-si-1', body: 'හෙට රසායනාගාරයට ඔබගේ ලැප්ටොප් පරිගණකය රැගෙන එන්න.' },
    ] },
    { groupId: '303@g.us', messages: [
      { id: 'synthetic-sl-1', body: 'Assignment eka heta submit karanna. Survey link eka ada share karanawa.' },
    ] },
  ].map((g, index) => ({
    ...g,
    messages: g.messages.map((m) => ({ ...m, groupId: g.groupId, timestamp: 100, type: 'chat', fromMe: false })),
    history: { reason: index === 0 ? 'requested_count' : index === 1 ? 'history_unavailable' : 'scan_limit', scanned: g.messages.length, loads: 1 },
  }));
}
module.exports = { syntheticGroups };

// Standalone, opt-in live service check. No WhatsApp imports or API startup.
if (require.main === module) {
  (async () => {
    const service = require('../src/features/analysis/analysis.service')();
    const metrics = [];
    for (const group of syntheticGroups()) {
      try {
        const output = await service.analyze(group.messages);
        metrics.push({ messageCount: group.messages.length, bodyLengths: group.messages.map((m) => m.body.length),
          summaryType: typeof output.summary, summaryLength: output.summary.length,
          importantUpdateCount: output.importantUpdates.length, taskCount: output.tasks.length, failureCount: 0 });
      } catch (error) {
        process.exitCode = 1;
        metrics.push({ messageCount: group.messages.length, bodyLengths: group.messages.map((m) => m.body.length), failureCount: 1, errorType: typeof error });
      }
    }
    // Only counts, lengths, and field types; never prompts, IDs, bodies, or responses.
    process.stdout.write(JSON.stringify(metrics) + '\n');
  })().catch(() => { process.exitCode = 1; process.stdout.write('{"failureCount":1}\n'); });
}
