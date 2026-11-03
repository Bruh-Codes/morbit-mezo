import { authorized, checkAll } from 'modules/alerts/bot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Sends any due liquidation alerts and runs the keeper. Called every 5 minutes by GitHub Actions. */
export async function GET(request: Request) {
  if (!authorized(request)) return new Response('unauthorized', { status: 401 });
  return Response.json(await checkAll());
}
