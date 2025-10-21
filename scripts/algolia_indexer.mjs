
import { glob } from 'glob';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const algoliasearch = require('algoliasearch');
console.log('Inspecting algoliasearch module:', algoliasearch);

import dotenv from 'dotenv';

// Cargar variables de entorno desde .env
dotenv.config();

// --- Configuración de Algolia ---
const { ALGOLIA_APP_ID, ALGOLIA_API_KEY, ALGOLIA_INDEX_NAME } = process.env;

// Directorio de la documentación
const DOCS_PATH = 'docs';

/**
 * Analiza un archivo Markdown, extrae el front matter y el contenido,
 * y lo divide en secciones basadas en los encabezados.
 * @param {string} filePath - Ruta al archivo markdown.
 * @returns {Promise<Array<Object>>} - Una promesa que resuelve a un array de registros para Algolia.
 */
async function parseMarkdownFile(filePath) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const { data: metadata, content } = matter(fileContent);

    // Usa el título del front matter o el primer encabezado
    let mainTitle = metadata.title;
    if (!mainTitle) {
      const match = content.match(/^#\s+(.*)/m);
      mainTitle = match ? match[1] : path.basename(filePath);
    }

    // Divide el contenido encontrando encabezados y creando secciones
    const headingRegex = /^\s*(#{1,6})\s+(.*)$/gm;
    const records = [];
    const relativePath = path.relative(process.cwd(), filePath);

    let lastIndex = 0;
    let match;
    const headings = [];
    while ((match = headingRegex.exec(content)) !== null) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        index: match.index,
        headerEnd: headingRegex.lastIndex,
      });
    }

    // Intro content before first heading
    if (headings.length === 0) {
      if (content.trim()) {
        records.push({
          objectID: relativePath,
          title: mainTitle,
          heading: null,
          content: content.trim(),
          path: relativePath,
        });
      }
    } else {
      const first = headings[0];
      const intro = content.slice(0, first.index).trim();
      if (intro) {
        records.push({
          objectID: `${relativePath}-intro`,
          title: mainTitle,
          heading: 'Introduction',
          content: intro,
          path: relativePath,
        });
      }

      for (let i = 0; i < headings.length; i++) {
        const current = headings[i];
        const start = current.headerEnd;
        const end = i + 1 < headings.length ? headings[i + 1].index : content.length;
        const sectionContent = content.slice(start, end).trim();

        const cleanHeading = current.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '-');
        const objectID = `${relativePath}-${cleanHeading}`;

        records.push({
          objectID,
          title: mainTitle,
          heading: current.text,
          content: sectionContent,
          path: relativePath,
        });
      }
    }

    // Si no hay secciones, indexa el documento completo
    if (records.length === 0 && content.trim()) {
        records.push({
            objectID: relativePath,
            title: mainTitle,
            content: content.trim(),
            path: relativePath
        });
    }

    return records;
  } catch (error) {
    console.error(`Error parsing file ${filePath}:`, error);
    return [];
  }
}

/**
 * Función principal para encontrar, procesar y enviar archivos a Algolia.
 */
async function main() {
  if (!ALGOLIA_APP_ID || !ALGOLIA_API_KEY || !ALGOLIA_INDEX_NAME) {
    console.error('Error: Asegúrate de que las variables de entorno ALGOLIA_APP_ID, ALGOLIA_API_KEY, y ALGOLIA_INDEX_NAME estén configuradas.');
    process.exit(1);
  }

  // Create Algolia client with compatibility for multiple algoliasearch package versions
  let client;
  try {
    // Try common shapes in order, with fallbacks for ESM/CJS interop variants
    const tried = [];

    // 1) default callable export
    try {
      if (typeof algoliasearch === 'function') {
        client = algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
        tried.push('algoliasearch()');
      }
    } catch (e) {
      // ignore
    }

    // 2) default on .default (interop)
    if (!client && algoliasearch && algoliasearch.default) {
      try {
        if (typeof algoliasearch.default === 'function') {
          client = algoliasearch.default(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
          tried.push('algoliasearch.default()');
        }
      } catch (e) {
        // ignore
      }
    }

    // 3) searchClient factory (v5+)
    if (!client && algoliasearch && (algoliasearch.searchClient || algoliasearch.algoliasearch)) {
      const factory = algoliasearch.searchClient || algoliasearch.algoliasearch;
      try {
        client = factory(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
        tried.push(factory === algoliasearch.searchClient ? 'algoliasearch.searchClient()' : 'algoliasearch.algoliasearch()');
      } catch (e) {
        // ignore
      }
    }

    // 4) try calling require('algoliasearch').algoliasearch if present
    if (!client && algoliasearch && typeof algoliasearch.algoliasearch === 'function') {
      try {
        client = algoliasearch.algoliasearch(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
        tried.push('algoliasearch.algoliasearch()');
      } catch (e) {
        // ignore
      }
    }

    // 5) as last resort, try the property values (some versions export getters)
    if (!client) {
      try {
        const alt = algoliasearch && (algoliasearch.searchClient || algoliasearch.algoliasearch || algoliasearch.default || algoliasearch.algoliasearchClient);
        if (typeof alt === 'function') {
          client = alt(ALGOLIA_APP_ID, ALGOLIA_API_KEY);
          tried.push('altFactory()');
        }
      } catch (e) {
        // ignore
      }
    }

    if (!client) {
      console.error('Unsupported algoliasearch module format, tried:', tried, 'module keys:', Object.keys(algoliasearch || {}));
      process.exit(1);
    } else {
      console.log('Algolia client created via: ', tried[tried.length - 1]);

      // Debug: inspect client shape to find index methods
      try {
        console.log('Client typeof:', typeof client);
        console.log('Client keys:', Object.keys(client).slice(0, 50));
        const clientProto = Object.getPrototypeOf(client);
        if (clientProto) {
          console.log('Client prototype keys:', Object.getOwnPropertyNames(clientProto).slice(0, 50));
        }
      } catch (e) {
        console.warn('Could not inspect client object:', e);
      }
    }
  } catch (err) {
    console.error('Failed to create Algolia client:', err);
    process.exit(1);
  }

  // Determine API style: index object (client.initIndex -> v4) or client-level methods (v5+)
  let apiStyle = null; // 'index' or 'client'
  let index = null;
  if (client && typeof client.initIndex === 'function') {
    index = client.initIndex(ALGOLIA_INDEX_NAME);
    apiStyle = 'index';
    console.log('Using index-style API (initIndex -> index object).');
  } else if (client && (typeof client.saveObjects === 'function' || typeof client.replaceAllObjects === 'function' || typeof client.clearObjects === 'function')) {
    apiStyle = 'client';
    console.log('Using client-style API (saveObjects/replaceAllObjects on client).');
  } else {
    console.error('Algolia client does not expose a known index API (initIndex or saveObjects/replaceAllObjects)');
    process.exit(1);
  }

  console.log(`Buscando archivos en ${DOCS_PATH}...`);
  const files = await glob(`${DOCS_PATH}/**/*.{md,mdx}`);
  
  let allRecords = [];
  for (const file of files) {
    console.log(`Procesando: ${file}`);
    const records = await parseMarkdownFile(file);
    allRecords.push(...records);
  }

  if (allRecords.length === 0) {
    console.log('No se encontraron registros para indexar.');
    return;
  }

  console.log(`Se encontraron ${allRecords.length} registros para enviar a Algolia.`);

  // Split oversized records to respect Algolia per-record size limits (~10 KB).
  function byteSize(obj) {
    try {
      return Buffer.byteLength(JSON.stringify(obj), 'utf8');
    } catch (e) {
      return Infinity;
    }
  }

  function splitRecord(record, maxBytes = 6000) {
    const size = byteSize(record);
    if (size <= maxBytes) return [record];

    const content = record.content || '';
    const chunks = [];

    // First try splitting by sentences
    const sentences = content.split(/(?<=[.?!])\s+/);
    let current = '';
    const pushCurrent = () => {
      if (current && current.trim()) {
        chunks.push(current.trim());
      }
      current = '';
    };

    for (const s of sentences) {
      const attempt = current ? current + ' ' + s : s;
      const testRec = { ...record, content: attempt };
      if (byteSize(testRec) > maxBytes) {
        // If current is empty, sentence itself is too big: split sentence by words
        if (!current) {
          const words = s.split(/(\s+)/);
          let sub = '';
          for (const w of words) {
            const att2 = sub + w;
            const testRec2 = { ...record, content: att2 };
            if (byteSize(testRec2) > maxBytes) {
              if (!sub) {
                // single token too big; hard cut the token
                let token = w;
                while (token && byteSize({ ...record, content: token }) > maxBytes) {
                  // cut token in half until it fits a chunk
                  const cut = Math.max(200, Math.floor(token.length / 2));
                  const part = token.slice(0, cut);
                  chunks.push(part);
                  token = token.slice(cut);
                }
                sub = token || '';
              } else {
                chunks.push(sub);
                sub = w;
              }
            } else {
              sub = att2;
            }
          }
          if (sub) chunks.push(sub);
        } else {
          // push current and start new with sentence (which may still be big, handled next loop)
          pushCurrent();
          // handle sentence again by setting current = '' and re-evaluating
          const testRec3 = { ...record, content: s };
          if (byteSize(testRec3) > maxBytes) {
            // fallback to splitting sentence by words (repeat logic)
            const words2 = s.split(/(\s+)/);
            let sub2 = '';
            for (const w2 of words2) {
              const att3 = sub2 + w2;
              if (byteSize({ ...record, content: att3 }) > maxBytes) {
                if (!sub2) {
                  // hard cut token
                  let token2 = w2;
                  while (token2 && byteSize({ ...record, content: token2 }) > maxBytes) {
                    const cut2 = Math.max(200, Math.floor(token2.length / 2));
                    const part2 = token2.slice(0, cut2);
                    chunks.push(part2);
                    token2 = token2.slice(cut2);
                  }
                  sub2 = token2 || '';
                } else {
                  chunks.push(sub2);
                  sub2 = w2;
                }
              } else {
                sub2 = att3;
              }
            }
            if (sub2) chunks.push(sub2);
          } else {
            current = s;
          }
        }
      } else {
        current = attempt;
      }
    }
    if (current) pushCurrent();

    // final fallback: if we didn't produce any chunks (rare), hard slice the content
    if (chunks.length === 0) {
      let pos = 0;
      while (pos < content.length) {
        const slice = content.slice(pos, pos + 4000);
        chunks.push(slice);
        pos += 4000;
      }
    }

    // Build records with suffixes
    const parts = chunks.map((c, i) => ({
      ...record,
      objectID: `${record.objectID}-part${i + 1}`,
      content: c.trim(),
    }));
    return parts;
  }

  // Expand allRecords by splitting large records.
  // Use a conservative initial split size and then a final hard-slice pass
  // to guarantee no record exceeds Algolia's per-record limit.
  const preparedRecords = [];
  const MAX_RECORD_BYTES = 10000; // Algolia hard limit per object
  const INITIAL_SPLIT_BYTES = 4000; // safer initial chunk size

  function maxSliceEnd(startIdx, content, record, maxBytes) {
    // binary search for the largest end index such that the slice fits in maxBytes
    let low = startIdx + 1;
    let high = content.length;
    let best = startIdx;
    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const slice = content.slice(startIdx, mid);
      const testRec = { ...record, content: slice };
      if (byteSize(testRec) <= maxBytes) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return best;
  }

  for (const r of allRecords) {
    const parts = splitRecord(r, INITIAL_SPLIT_BYTES);
    for (const p of parts) {
      if (byteSize(p) <= MAX_RECORD_BYTES) {
        preparedRecords.push(p);
        continue;
      }

      // Final fallback: hard-slice content into byte-safe pieces using binary search
      console.warn(`Record ${p.objectID} still exceeds Algolia max size (${byteSize(p)} bytes). Applying hard-slice fallback.`);
      const content = p.content || '';
      let pos = 0;
      let partIdx = 1;
      while (pos < content.length) {
        const end = maxSliceEnd(pos, content, p, MAX_RECORD_BYTES);
        if (end <= pos) {
          // If we can't make forward progress (shouldn't happen), make a forced small slice to avoid infinite loop
          const forcedEnd = Math.min(content.length, pos + Math.floor(MAX_RECORD_BYTES / 2));
          const slice = content.slice(pos, forcedEnd);
          preparedRecords.push({
            ...p,
            objectID: `${p.objectID}-hardpart${partIdx}`,
            content: slice.trim(),
          });
          pos = forcedEnd;
          partIdx++;
          continue;
        }

        const slice = content.slice(pos, end);
        preparedRecords.push({
          ...p,
          objectID: `${p.objectID}-hardpart${partIdx}`,
          content: slice.trim(),
        });
        pos = end;
        partIdx++;
      }
    }
  }

  console.log(`Prepared ${preparedRecords.length} records after splitting oversized items (original ${allRecords.length}).`);

  // Allow dry-run via environment variable to avoid accidental uploads
  const DRY_RUN = !!process.env.ALGOLIA_DRY_RUN;
  if (DRY_RUN) {
    console.log('DRY RUN enabled (ALGOLIA_DRY_RUN=1). First 5 records:');
    console.log(JSON.stringify(preparedRecords.slice(0, 5), null, 2));
    return;
  }

  try {
    console.log(`Limpiando el índice '${ALGOLIA_INDEX_NAME}'...`);
    if (apiStyle === 'index') {
      if (typeof index.clearObjects === 'function') {
        await index.clearObjects();
      } else if (typeof index.clear === 'function') {
        await index.clear();
      } else if (typeof index.replaceAllObjects === 'function') {
        await index.replaceAllObjects([]);
      } else {
        console.warn('No se encontró método para limpiar el índice en el objeto index; procediendo.');
      }
    } else if (apiStyle === 'client') {
      // Try clearObjects with positional arg, then object form
      let cleared = false;
      if (typeof client.clearObjects === 'function') {
        try {
          await client.clearObjects(ALGOLIA_INDEX_NAME);
          cleared = true;
        } catch (e1) {
          try {
            await client.clearObjects({ indexName: ALGOLIA_INDEX_NAME });
            cleared = true;
          } catch (e2) {
            // continue
          }
        }
      }
      if (!cleared && typeof client.replaceAllObjects === 'function') {
        try {
          await client.replaceAllObjects(ALGOLIA_INDEX_NAME, []);
          cleared = true;
        } catch (e1) {
          try {
            await client.replaceAllObjects({ indexName: ALGOLIA_INDEX_NAME, objects: [] });
            cleared = true;
          } catch (e2) {
            // continue
          }
        }
      }
      if (!cleared && typeof client.deleteIndex === 'function') {
        try {
          await client.deleteIndex(ALGOLIA_INDEX_NAME);
          cleared = true;
        } catch (e) {
          // ignore
        }
      }
      if (!cleared) {
        console.warn('No se pudo limpiar el índice con las APIs detectadas; procediendo a intentos de sobreescritura.');
      }
    }

    console.log('Enviando registros a Algolia...');
    let saved = false;
    const saveErrors = [];

    if (apiStyle === 'index') {
      try {
        if (typeof index.saveObjects === 'function') {
          await index.saveObjects(preparedRecords);
          saved = true;
        } else if (typeof index.replaceAllObjects === 'function') {
          await index.replaceAllObjects(preparedRecords);
          saved = true;
        } else if (typeof index.save === 'function') {
          await index.save(preparedRecords);
          saved = true;
        }
      } catch (e) {
        saveErrors.push(e);
      }
    }

    if (!saved && apiStyle === 'client') {
      // Try several client signatures and collect errors
      const tryClientCall = async (fn, ...args) => {
        try {
          await fn(...args);
          return true;
        } catch (e) {
          saveErrors.push(e);
          return false;
        }
      };

      if (typeof client.saveObjects === 'function') {
        saved = await tryClientCall(client.saveObjects.bind(client), ALGOLIA_INDEX_NAME, preparedRecords);
        if (!saved) {
          saved = await tryClientCall(client.saveObjects.bind(client), { indexName: ALGOLIA_INDEX_NAME, objects: preparedRecords });
        }
      }
      if (!saved && typeof client.replaceAllObjects === 'function') {
        saved = await tryClientCall(client.replaceAllObjects.bind(client), ALGOLIA_INDEX_NAME, preparedRecords);
        if (!saved) {
          saved = await tryClientCall(client.replaceAllObjects.bind(client), { indexName: ALGOLIA_INDEX_NAME, objects: preparedRecords });
        }
      }
      if (!saved && typeof client.save === 'function') {
        saved = await tryClientCall(client.save.bind(client), ALGOLIA_INDEX_NAME, preparedRecords);
        if (!saved) {
          saved = await tryClientCall(client.save.bind(client), { indexName: ALGOLIA_INDEX_NAME, objects: preparedRecords });
        }
      }
    }

    // Fallback: use REST API directly (fetch) if client APIs failed
    if (!saved) {
      console.warn('Client APIs failed, attempting REST bulk upload as fallback. Errors:', saveErrors.map(e => (e && e.message) || String(e)).slice(0,5));
      try {
        // Node 18+ has global fetch
        const endpoint = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${encodeURIComponent(ALGOLIA_INDEX_NAME)}/batch`;
  const body = { requests: preparedRecords.map(r => ({ action: 'addObject', body: r })) };
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Algolia-API-Key': ALGOLIA_API_KEY,
            'X-Algolia-Application-Id': ALGOLIA_APP_ID,
          },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(`REST upload failed: ${res.status} ${res.statusText} - ${txt}`);
        }
        console.log('REST fallback upload completed successfully');
        saved = true;
      } catch (e) {
        console.error('REST fallback also failed:', e);
      }
    }

    if (!saved) {
      throw new Error('Unable to save records to Algolia via client or REST fallback');
    }

    console.log('¡Indexación completada con éxito!');
  } catch (error) {
    console.error('Error durante la indexación en Algolia:', error);
    process.exit(1);
  }
}

main();
