// api/mail/imap.js — własna skrzynka (IMAP/SMTP) dla dostawców innych niż Gmail i Outlook.
//
// Przeglądarka nie otworzy gniazda IMAP, więc ten endpoint (runtime Node) robi to za nią.
// Moduł Mail mówi w dialekcie Microsoft Graph (jak w gmailApi.js), dlatego op "graph" przyjmuje
// wywołanie "jak do Graph" i zwraca odpowiedź w kształcie Graph — UI nie wie, że pod spodem jest IMAP.
//
// POST /api/mail/imap   { op: "connect" | "status" | "disconnect" | "graph", ... }
// Hasło trafia do bazy tylko zaszyfrowane (AES-GCM) i nigdy nie wraca do przeglądarki.
import dns from 'node:dns/promises';
import net from 'node:net';
import { ImapFlow } from 'imapflow';
import nodemailer from 'nodemailer';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { simpleParser } from 'mailparser';
import { cors, decrypt, encrypt, serviceConfig, supabase, userFromRequest } from '../oauth/_common.js';

const ALLOWED_PORTS = [25, 143, 465, 587, 993, 2525];
const FOLDERS = {
  inbox: { path: 'INBOX', use: null },
  sentItems: { path: 'Sent', use: '\\Sent' },
  deletedItems: { path: 'Trash', use: '\\Trash' },
  junkEmail: { path: 'Junk', use: '\\Junk' },
};
const FOLDER_CAP = { inbox: 50, sentItems: 30, deletedItems: 15, junkEmail: 15 };
const PREVIEW_BYTES = 8192;
const THUMB_LIMIT = 3 * 1024 * 1024;
const CAT_PREFIX = 'mdl_';

class HttpError extends Error {
  constructor(message, status) { super(message); this.status = status || 500; }
}

function send(res, data, status) {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors() };
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
  res.statusCode = status || 200;
  res.end(status === 204 ? '' : JSON.stringify(data == null ? {} : data));
}

// ── Bezpieczeństwo połączeń wychodzących ─────────────────────────────────────
// Host podaje użytkownik, więc serwer nie może dać się użyć do skanowania sieci wewnętrznej.
function isPrivateIp(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
    const m = v.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return m ? isPrivateIp(m[1]) : false;
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

async function resolveHost(host) {
  if (!host || /[^a-zA-Z0-9.\-]/.test(host)) throw new HttpError('Nieprawidłowy adres serwera: ' + host, 400);
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new HttpError('Nie znaleziono serwera: ' + host, 400);
  if (addrs.some(a => isPrivateIp(a.address))) throw new HttpError('Adres serwera jest niedozwolony: ' + host, 400);
  return addrs[0].address;
}

function cleanPort(v, fallback) {
  const n = parseInt(v, 10) || fallback;
  if (!ALLOWED_PORTS.includes(n)) throw new HttpError('Niedozwolony port: ' + n, 400);
  return n;
}

// ── Konto ────────────────────────────────────────────────────────────────────
async function loadAccount(user) {
  const r = await supabase(`mail_accounts?user_id=eq.${encodeURIComponent(user.id)}&select=*`);
  if (!r.ok) throw new HttpError('Nie udało się odczytać konta pocztowego (migracja 0059?)', 502);
  const rows = await r.json();
  if (!rows.length) throw new HttpError('MAIL_NOT_CONNECTED', 401);
  const acc = rows[0];
  acc.password = await decrypt(acc.password_ciphertext);
  return acc;
}

async function openImap(cfg) {
  const ip = await resolveHost(cfg.imap_host);
  const client = new ImapFlow({
    host: ip, port: cfg.imap_port, secure: !!cfg.imap_secure,
    tls: { servername: cfg.imap_host },
    auth: { user: cfg.username, pass: cfg.password },
    logger: false, disableAutoIdle: true,
    socketTimeout: 20000, greetingTimeout: 10000, connectionTimeout: 10000,
  });
  client.on('error', () => {});
  await client.connect();
  return client;
}

async function smtpTransport(cfg) {
  const ip = await resolveHost(cfg.smtp_host);
  return nodemailer.createTransport({
    host: ip, port: cfg.smtp_port, secure: !!cfg.smtp_secure,
    tls: { servername: cfg.smtp_host },
    auth: { user: cfg.username, pass: cfg.password },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
  });
}

function authMessage(e) {
  return e && (e.authenticationFailed || /auth|login|credentials|password/i.test(e.responseText || e.message || ''))
    ? 'Serwer odrzucił login lub hasło. Jeśli konto ma weryfikację dwuetapową, utwórz „hasło aplikacji”.'
    : null;
}

async function withImap(user, fn) {
  const acc = await loadAccount(user);
  let client;
  try {
    client = await openImap(acc);
    return await fn(client, acc);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(authMessage(e) || e.responseText || e.message || 'Błąd serwera poczty', 502);
  } finally {
    if (client) { try { await client.logout(); } catch (_) { /* połączenie już zamknięte */ } }
  }
}

// ── Foldery i identyfikatory ─────────────────────────────────────────────────
const b64u = s => Buffer.from(s, 'utf8').toString('base64url');
const fromB64u = s => Buffer.from(s, 'base64url').toString('utf8');
const makeId = (path, uid) => uid + '~' + b64u(path);
function parseId(id) {
  const i = String(id).indexOf('~');
  const uid = parseInt(id, 10);
  if (i < 0 || !uid) throw new HttpError('Nieprawidłowy identyfikator wiadomości', 400);
  return { uid, path: fromB64u(id.slice(i + 1)) };
}

async function folderPaths(client) {
  const list = await client.list();
  const out = {};
  for (const [key, def] of Object.entries(FOLDERS)) {
    if (key === 'inbox') { out[key] = 'INBOX'; continue; }
    const byUse = list.find(m => m.specialUse === def.use);
    const byName = list.find(m => m.name.toLowerCase() === def.path.toLowerCase() || m.path.toLowerCase() === def.path.toLowerCase());
    out[key] = (byUse || byName || {}).path || null;
  }
  // Częste polskie nazwy, gdy serwer nie ustawia SPECIAL-USE.
  const alt = { sentItems: /wys[łl]ane|sent/i, deletedItems: /kosz|usuni[eę]te|trash|deleted/i, junkEmail: /spam|junk|wiadomo[śs]ci-?śmieci/i };
  for (const key of Object.keys(alt)) {
    if (!out[key]) { const m = list.find(x => alt[key].test(x.name)); if (m) out[key] = m.path; }
  }
  return out;
}

// ── Mapowanie na kształt Graph ───────────────────────────────────────────────
const addr = a => a && a.address ? { emailAddress: { name: a.name || a.address, address: a.address } } : null;
const addrList = l => (l || []).map(addr).filter(Boolean);

function hasAttachment(node) {
  if (!node) return false;
  if ((node.disposition || '').toLowerCase() === 'attachment') return true;
  return (node.childNodes || []).some(hasAttachment);
}

function threadRoot(headers, envelope) {
  const text = headers ? headers.toString('utf8') : '';
  const refs = (text.match(/^references:[^\r\n]*(?:\r?\n[ \t][^\r\n]*)*/im) || [''])[0].match(/<[^>]+>/g);
  const reply = (text.match(/^in-reply-to:\s*(<[^>]+>)/im) || [])[1];
  return (refs && refs[0]) || reply || envelope.messageId || envelope.subject || '';
}

const catName = flag => { try { return fromB64u(flag.slice(CAT_PREFIX.length)); } catch (e) { return null; } };
const catFlag = name => CAT_PREFIX + b64u(name);

function stripHtml(html) {
  return String(html || '').replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

async function previewOf(source) {
  if (!source) return '';
  try {
    const p = await simpleParser(source);
    return (p.text || stripHtml(p.html || '')).replace(/\s+/g, ' ').trim().slice(0, 255);
  } catch (e) { return ''; }
}

async function toGraph(path, m) {
  const env = m.envelope || {};
  const date = new Date(m.internalDate || env.date || Date.now()).toISOString();
  const flags = m.flags || new Set();
  return {
    id: makeId(path, m.uid),
    conversationId: 'c_' + b64u(threadRoot(m.headers, env)).slice(0, 60),
    subject: env.subject || '',
    bodyPreview: await previewOf(m.source),
    receivedDateTime: date,
    sentDateTime: date,
    from: addr((env.from || [])[0]),
    toRecipients: addrList(env.to),
    ccRecipients: addrList(env.cc),
    hasAttachments: hasAttachment(m.bodyStructure),
    categories: [...flags].filter(f => f.startsWith(CAT_PREFIX)).map(catName).filter(Boolean),
    isRead: flags.has('\\Seen'),
    importance: flags.has('\\Flagged') ? 'high' : 'normal',
  };
}

// ── Trasy ────────────────────────────────────────────────────────────────────
async function listFolder(user, folderKey, sp, selfUrl) {
  if (!FOLDERS[folderKey]) throw new HttpError('Nieznany folder: ' + folderKey, 404);
  const top = Math.min(parseInt(sp.get('$top') || '50', 10) || 50, FOLDER_CAP[folderKey]);
  const before = parseInt(sp.get('$imapBefore') || '0', 10);
  const q = (sp.get('$search') || '').replace(/^"|"$/g, '').replace(/^(from|to|subject):/i, '').trim();
  return withImap(user, async client => {
    const path = (await folderPaths(client))[folderKey];
    if (!path) return { value: [] }; // konto bez takiego folderu (np. brak spamu)
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try {
      const query = q ? { or: [{ subject: q }, { from: q }, { to: q }, { body: q }] } : { all: true };
      let uids = (await client.search(query, { uid: true })) || [];
      uids.sort((a, b) => b - a);
      if (before) uids = uids.filter(u => u < before);
      const page = uids.slice(0, top);
      const value = [];
      if (page.length) {
        for await (const m of client.fetch(page.join(','), {
          uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true,
          headers: ['references', 'in-reply-to'], source: { start: 0, maxLength: PREVIEW_BYTES },
        }, { uid: true })) value.push(await toGraph(path, m));
        value.sort((a, b) => (a.receivedDateTime < b.receivedDateTime ? 1 : -1));
      }
      const out = { value };
      if (uids.length > top) {
        const u = new URL(selfUrl);
        u.searchParams.set('$imapBefore', String(page[page.length - 1]));
        out['@odata.nextLink'] = u.toString();
      }
      return out;
    } finally { lock.release(); }
  });
}

async function fetchParsed(client, id) {
  const { uid, path } = parseId(id);
  const lock = await client.getMailboxLock(path, { readOnly: true });
  try {
    const m = await client.fetchOne(String(uid), { source: true }, { uid: true });
    if (!m || !m.source) throw new HttpError('Nie znaleziono wiadomości', 404);
    return await simpleParser(m.source);
  } finally { lock.release(); }
}

async function getBody(user, id) {
  return withImap(user, async client => {
    const p = await fetchParsed(client, id);
    if (p.html) return { id, body: { contentType: 'html', content: p.html } };
    return { id, body: { contentType: 'text', content: p.text || '' } };
  });
}

function describeAttachment(a, index, html) {
  const cid = (a.contentId || '').replace(/^<|>$/g, '');
  const isInline = a.contentDisposition === 'inline' || (!!cid && (a.contentType || '').startsWith('image/') && String(html || '').includes('cid:' + cid));
  return {
    id: String(index),
    name: a.filename || ('zalacznik.' + ((a.contentType || '').split('/')[1] || 'bin')),
    size: a.size || (a.content ? a.content.length : 0),
    contentType: a.contentType || 'application/octet-stream',
    contentId: cid || null,
    isInline,
  };
}

async function listAttachments(user, id) {
  return withImap(user, async client => {
    const p = await fetchParsed(client, id);
    const value = (p.attachments || []).map((a, i) => {
      const meta = describeAttachment(a, i, p.html);
      if (meta.contentType.startsWith('image/') && meta.size > 0 && meta.size < THUMB_LIMIT) meta.contentBytes = a.content.toString('base64');
      return meta;
    });
    return { value };
  });
}

async function getAttachment(user, id, index) {
  return withImap(user, async client => {
    const p = await fetchParsed(client, id);
    const a = (p.attachments || [])[parseInt(index, 10)];
    if (!a) throw new HttpError('Nie znaleziono załącznika', 404);
    return { ...describeAttachment(a, index, p.html), contentBytes: a.content.toString('base64') };
  });
}

async function moveMessage(user, id, dest) {
  return withImap(user, async client => {
    const { uid, path } = parseId(id);
    const paths = await folderPaths(client);
    const target = paths[dest];
    if (!target) throw new HttpError('Konto nie ma folderu docelowego (' + dest + ')', 400);
    if (target === path) return { id };
    const lock = await client.getMailboxLock(path);
    try {
      const r = await client.messageMove(String(uid), target, { uid: true });
      const newUid = r && r.uidMap && r.uidMap.get(uid);
      return { id: newUid ? makeId(target, newUid) : id };
    } finally { lock.release(); }
  });
}

async function patchMessage(user, id, patch) {
  return withImap(user, async client => {
    const { uid, path } = parseId(id);
    const lock = await client.getMailboxLock(path);
    try {
      const set = (flags, on) => flags.length
        ? (on ? client.messageFlagsAdd : client.messageFlagsRemove).call(client, String(uid), flags, { uid: true }) : null;
      if (patch.isRead != null) await set(['\\Seen'], !!patch.isRead);
      if (patch.importance) await set(['\\Flagged'], patch.importance === 'high');
      if (patch.categories) {
        const cur = await client.fetchOne(String(uid), { flags: true }, { uid: true });
        const have = [...(cur && cur.flags || [])].filter(f => f.startsWith(CAT_PREFIX));
        const want = patch.categories.map(catFlag);
        await set(want.filter(f => !have.includes(f)), true);
        await set(have.filter(f => !want.includes(f)), false);
      }
      return { id };
    } finally { lock.release(); }
  });
}

async function deleteMessage(user, id) {
  return withImap(user, async client => {
    const { uid, path } = parseId(id);
    const lock = await client.getMailboxLock(path);
    try { await client.messageDelete(String(uid), { uid: true }); } finally { lock.release(); }
    return null;
  });
}

const toAddr = l => (l || []).map(r => r.emailAddress && r.emailAddress.address
  ? { name: r.emailAddress.name && r.emailAddress.name !== r.emailAddress.address ? r.emailAddress.name : '', address: r.emailAddress.address }
  : null).filter(Boolean);

async function sendMail(user, payload) {
  const msg = (payload && payload.message) || {};
  const to = toAddr(msg.toRecipients), cc = toAddr(msg.ccRecipients), bcc = toAddr(msg.bccRecipients);
  if (!to.length) throw new HttpError('Brak odbiorcy', 400);
  const acc = await loadAccount(user);
  const isHtml = String((msg.body && msg.body.contentType) || '').toLowerCase() === 'html';
  const content = (msg.body && msg.body.content) || '';
  const mail = {
    from: acc.email, to, cc, bcc, subject: msg.subject || '',
    ...(isHtml ? { html: content, text: stripHtml(content) } : { text: content }),
    attachments: (msg.attachments || []).map(a => ({
      filename: a.name || 'plik', content: Buffer.from(a.contentBytes || '', 'base64'),
      contentType: a.contentType || undefined,
      ...(a.isInline && a.contentId ? { cid: a.contentId, contentDisposition: 'inline' } : {}),
    })),
  };
  const raw = await new MailComposer(mail).compile().build();
  try {
    const transport = await smtpTransport(acc);
    await transport.sendMail({
      envelope: { from: acc.email, to: [...to, ...cc, ...bcc].map(a => a.address) },
      raw,
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(authMessage(e) || e.response || e.message || 'Nie udało się wysłać wiadomości', 502);
  }
  // SMTP nie zapisuje kopii — dokładamy ją do folderu Wysłane (best-effort, wiadomość już poszła).
  try {
    await withImap(user, async client => {
      const sent = (await folderPaths(client)).sentItems;
      if (sent) await client.append(sent, raw, ['\\Seen']);
    });
  } catch (_) { /* brak folderu Wysłane nie może unieważnić wysyłki */ }
  return null;
}

// ── Router wywołań w stylu Graph ─────────────────────────────────────────────
async function graph(user, body) {
  const method = String(body.method || 'GET').toUpperCase();
  const u = new URL(body.url);
  const path = u.pathname.replace(/^\/v1\.0/, '');
  const payload = body.body ? JSON.parse(body.body) : {};
  let m;
  if ((m = path.match(/^\/me\/mailFolders\/([^/]+)\/messages$/)) && method === 'GET') return [await listFolder(user, m[1], u.searchParams, body.url)];
  if ((m = path.match(/^\/me\/messages\/([^/]+)\/attachments\/([^/]+)$/)) && method === 'GET') return [await getAttachment(user, decodeURIComponent(m[1]), decodeURIComponent(m[2]))];
  if ((m = path.match(/^\/me\/messages\/([^/]+)\/attachments$/)) && method === 'GET') return [await listAttachments(user, decodeURIComponent(m[1]))];
  if ((m = path.match(/^\/me\/messages\/([^/]+)\/move$/)) && method === 'POST') return [await moveMessage(user, decodeURIComponent(m[1]), payload.destinationId)];
  if ((m = path.match(/^\/me\/messages\/([^/]+)$/))) {
    const id = decodeURIComponent(m[1]);
    if (method === 'GET') return [await getBody(user, id)];
    if (method === 'PATCH') return [await patchMessage(user, id, payload)];
    if (method === 'DELETE') return [await deleteMessage(user, id), 204];
  }
  if (path === '/me/sendMail' && method === 'POST') return [await sendMail(user, payload), 202];
  if (path === '/me/outlook/masterCategories' && method === 'POST') return [{}, 201]; // flagi to słowa kluczowe IMAP — nie wymagają rejestracji
  if (path === '/me/events' && method === 'POST') throw new HttpError('Kalendarz nie jest dostępny dla własnej skrzynki IMAP — połącz Kalendarz Google lub Outlook.', 501);
  throw new HttpError('Nieobsługiwane wywołanie: ' + method + ' ' + path, 501);
}

// ── Konto: łączenie, status, odłączanie ──────────────────────────────────────
async function connect(user, body) {
  const email = String(body.email || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError('Podaj poprawny adres e-mail', 400);
  const cfg = {
    user_id: user.id, email,
    username: String(body.username || email).trim(),
    imap_host: String(body.imap_host || '').trim().toLowerCase(),
    imap_port: cleanPort(body.imap_port, 993),
    imap_secure: body.imap_secure !== false,
    smtp_host: String(body.smtp_host || '').trim().toLowerCase(),
    smtp_port: cleanPort(body.smtp_port, 465),
    smtp_secure: body.smtp_secure !== false,
    password: String(body.password || ''),
  };
  if (!cfg.imap_host || !cfg.smtp_host || !cfg.password) throw new HttpError('Uzupełnij serwery i hasło', 400);
  // Sprawdzamy oba serwery przed zapisem, żeby błąd był widoczny od razu przy łączeniu.
  let client;
  try { client = await openImap(cfg); } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError('IMAP: ' + (authMessage(e) || e.responseText || e.message), 400);
  } finally { if (client) { try { await client.logout(); } catch (_) { /* zamknięte */ } } }
  try { await (await smtpTransport(cfg)).verify(); } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError('SMTP: ' + (authMessage(e) || e.response || e.message), 400);
  }
  const row = {
    user_id: user.id, email: cfg.email, username: cfg.username,
    imap_host: cfg.imap_host, imap_port: cfg.imap_port, imap_secure: cfg.imap_secure,
    smtp_host: cfg.smtp_host, smtp_port: cfg.smtp_port, smtp_secure: cfg.smtp_secure,
    password_ciphertext: await encrypt(cfg.password), updated_at: new Date().toISOString(),
  };
  const r = await supabase('mail_accounts?on_conflict=user_id', {
    method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(row),
  });
  if (!r.ok) throw new HttpError('Nie udało się zapisać konta (migracja 0059 zastosowana?)', 502);
  return { ok: true, email: cfg.email };
}

async function status(user) {
  const r = await supabase(`mail_accounts?user_id=eq.${encodeURIComponent(user.id)}&select=email,imap_host`);
  if (!r.ok) throw new HttpError('Nie udało się odczytać konta pocztowego', 502);
  const rows = await r.json();
  return rows.length ? { connected: true, email: rows[0].email, host: rows[0].imap_host } : { connected: false };
}

async function disconnect(user) {
  const r = await supabase(`mail_accounts?user_id=eq.${encodeURIComponent(user.id)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
  if (!r.ok) throw new HttpError('Nie udało się odłączyć konta', 502);
  return { ok: true };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, null, 204);
  if (req.method !== 'POST') return send(res, { error: 'POST only' }, 405);
  try {
    serviceConfig();
    const user = await userFromRequest({ headers: { get: n => req.headers[n.toLowerCase()] || '' } });
    if (!user) return send(res, { error: 'Unauthorized' }, 401);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (body.op === 'connect') return send(res, await connect(user, body));
    if (body.op === 'status') return send(res, await status(user));
    if (body.op === 'disconnect') return send(res, await disconnect(user));
    if (body.op === 'graph') {
      const [data, code] = await graph(user, body);
      return send(res, data, code);
    }
    return send(res, { error: 'Unknown op' }, 400);
  } catch (e) {
    return send(res, { error: { message: e.message || 'Błąd poczty', code: 'Imap' + (e.status || 500) } }, e.status || 500);
  }
}
