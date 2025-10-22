import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();
const { ALGOLIA_APP_ID, ALGOLIA_API_KEY, ALGOLIA_INDEX_NAME } = process.env;
if (!ALGOLIA_APP_ID || !ALGOLIA_API_KEY || !ALGOLIA_INDEX_NAME) {
  console.error('Missing ALGOLIA_* variables in .env');
  process.exit(1);
}

const fetch = global.fetch || (await import('node-fetch')).default;

async function runQuery(q = 'Aboleth') {
  const endpoint = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${encodeURIComponent(ALGOLIA_INDEX_NAME)}/query`;
  const body = { params: new URLSearchParams({ query: q, hitsPerPage: '5' }).toString() };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Algolia-API-Key': ALGOLIA_API_KEY,
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return json;
}

(async () => {
  try {
    const queries = ['Aboleth', 'monster', 'wizard', '5th'];
    for (const q of queries) {
      process.stdout.write(`Query: ${q} -> `);
      const result = await runQuery(q);
      if (result && typeof result.nbHits !== 'undefined') {
        const hits = (result.hits || []).slice(0,3).map(h => ({ objectID: h.objectID, title: h.title }));
        console.log(`nbHits=${result.nbHits}; sampleHits=${JSON.stringify(hits)}`);
      } else {
        console.log('no usable response, full response:', JSON.stringify(result).slice(0,200));
      }
    }
  } catch (e) {
    console.error('Error querying Algolia:', e.message || e);
    process.exit(1);
  }
})();
