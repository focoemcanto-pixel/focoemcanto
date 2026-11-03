// The Aulas SERVICE read, run next to the Hub database (placement aws:us-west-2) instead of the São Paulo edge.
// Same Pages handler, same KV, Hyperdrive, Access and Hub checks; no public URL: only the service router reaches it,
// and only with SERVICE GETs (the human admin path never comes here).
import {onRequestGet} from '../../functions/api/assistant/aulas.js';
export default {
  async fetch(request, env) {
    if (request.method !== 'GET') return new Response('Not found', {status: 404});
    return onRequestGet({request, env});
  }
};
