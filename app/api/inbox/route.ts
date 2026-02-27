export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
import { getRecentThreads, getUnreadCount, type EmailSummary } from '@/lib/gmail';

export async function GET() {
  try {
    const [personal, school, unreadPersonal, unreadSchool] = await Promise.all([
      getRecentThreads('personal', 8),
      getRecentThreads('school', 8),
      getUnreadCount('personal'),
      getUnreadCount('school'),
    ]);

    // Merge and sort by date
    const all = [...personal, ...school].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    // Deduplicate threads across accounts
    const threadMap = new Map<string, EmailSummary & { accounts: string[] }>();
    for (const thread of all) {
      const existing = threadMap.get(thread.threadId);
      if (!existing) {
        threadMap.set(thread.threadId, { ...thread, accounts: [thread.account] });
      } else {
        if (!existing.accounts.includes(thread.account)) {
          existing.accounts.push(thread.account);
        }
        // Merge labels from both accounts
        for (const lbl of thread.labels) {
          if (!existing.labels.includes(lbl)) existing.labels.push(lbl);
        }
        // Use higher thread count
        if (thread.threadCount > existing.threadCount) {
          existing.threadCount = thread.threadCount;
        }
      }
    }

    const emails = [...threadMap.values()].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    return Response.json({
      emails,
      unread: { personal: unreadPersonal, school: unreadSchool },
    });
  } catch (e) {
    return Response.json({ error: String(e), emails: [], unread: { personal: 0, school: 0 } }, { status: 500 });
  }
}
