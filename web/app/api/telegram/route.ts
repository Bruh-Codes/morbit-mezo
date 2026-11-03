import { handleUpdate, webhookSecret } from 'modules/alerts/bot';

export const dynamic = 'force-dynamic';

/** Telegram webhook. Telegram sends the secret set in /api/telegram/setup/ with every update. */
export async function POST(request: Request) {
  const secret = webhookSecret();
  if (!secret || request.headers.get('x-telegram-bot-api-secret-token') !== secret) {
    return new Response('unauthorized', { status: 401 });
  }
  try {
    await handleUpdate(await request.json());
  } catch (error) {
    // Answer 200 anyway so Telegram does not retry the same update forever.
    console.error(error);
  }
  return Response.json({ ok: true });
}
