// Cloudflare Pages Function: POST /api/action (dashboard buttons). Logic in ../_lib/handle.ts.
import { handleAction, type Env } from '../_lib/handle.ts';

export const onRequestPost = (context: { request: Request; env: Env }) => handleAction(context.request, context.env);
