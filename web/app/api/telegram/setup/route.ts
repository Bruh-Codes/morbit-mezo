import { authorized, tg, webhookSecret } from 'modules/alerts/bot';
import { storeConfigured } from 'modules/alerts/store';

export const dynamic = 'force-dynamic';

/**
 * One-time setup: open /api/telegram/setup/?key=<CRON_SECRET> on the production site and the
 * bot starts receiving messages through /api/telegram/.
 */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response('Add ?key=<CRON_SECRET> to the URL.', { status: 401 });
  if (!storeConfigured) return new Response('Connect an Upstash Redis database to this Vercel project first.', { status: 500 });
  const url = `${new URL(request.url).origin}/api/telegram/`;
  await tg('setWebhook', { url, secret_token: webhookSecret(), allowed_updates: ['message'], drop_pending_updates: true });
  await tg('setMyCommands', {
    commands: [
      { command: 'watch', description: 'Watch a wallet' },
      { command: 'status', description: 'Current ratios' },
      { command: 'threshold', description: 'Warn below this ratio' },
      { command: 'unwatch', description: 'Stop watching a wallet' },
    ],
  });
  const me = await tg<{ username: string }>('getMe', {});
  return Response.json({ ok: true, bot: `@${me.username}`, webhook: url });
}
