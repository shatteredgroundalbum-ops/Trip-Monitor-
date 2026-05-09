/**
 * Local message/conversation store for the Messages screen.
 *
 * Storage strategy (per spec):
 *   • Conversations + message bodies live in localStorage (small).
 *   • Attachments NEVER live here — they live in the Trip Monitor
 *     folder via the document-store. Messages keep a list of
 *     `attachmentRefs: [docId]` pointing back at document-store rows.
 *
 * This keeps the app sandbox tiny while attachments stay on-device
 * inside the user-controlled Trip Monitor folder.
 */

const KEY = "tm_message_store_v1";
const SCHEMA_VERSION = 1;

/** @typedef {"dispatch" | "driver" | "support" | "fleet"} ContactRole */

const SEED = Object.freeze({
  version: SCHEMA_VERSION,
  contacts: [
    { id: "c-dispatch-mike",   name: "Mike R.",        role: "dispatch", company: "Dispatch · Northbound Logistics", online: true },
    { id: "c-support",         name: "Trip Monitor",   role: "support",  company: "Trip Monitor Support",            online: false },
    { id: "c-driver-carla",    name: "Carla T.",       role: "driver",   company: "Driver · Carla T.",               online: true },
    { id: "c-fleet-northbound",name: "Fleet Channel",  role: "fleet",    company: "Northbound Fleet · #all",         online: true },
  ],
  conversations: [
    {
      id: "conv-66758-dispatch",
      contactId: "c-dispatch-mike",
      pinned: true,
      archived: false,
      priority: true,
      tripId: "66758",
      lastReadAt: 0,
      createdAt: Date.now() - 1000 * 60 * 60 * 26,
      updatedAt: Date.now() - 1000 * 60 * 60 * 6,
      messages: [
        { id: "m1", at: Date.now() - 1000 * 60 * 60 * 26, from: "them", text: "Hey — pickup time for order #66758 just moved to 08:30. Can you confirm?", status: "read", attachmentRefs: [] },
        { id: "m2", at: Date.now() - 1000 * 60 * 60 * 25, from: "me",   text: "Got it. Heading there now.", status: "read", attachmentRefs: [] },
        { id: "m3", at: Date.now() - 1000 * 60 * 60 * 6,  from: "them", text: "Thanks. Lumper at gate 12, see updated BOL.", status: "delivered", attachmentRefs: [] },
      ],
    },
    {
      id: "conv-support",
      contactId: "c-support",
      pinned: false, archived: false, priority: false,
      lastReadAt: Date.now() - 86400_000,
      createdAt: Date.now() - 1000 * 60 * 60 * 30,
      updatedAt: Date.now() - 1000 * 60 * 60 * 22,
      messages: [
        { id: "m1", at: Date.now() - 1000 * 60 * 60 * 30, from: "me",   text: "Quick question: can the export folder be on SD card?", status: "read", attachmentRefs: [] },
        { id: "m2", at: Date.now() - 1000 * 60 * 60 * 22, from: "them", text: "Yes — Settings → Storage → Choose folder. Pick the SD card path.", status: "read", attachmentRefs: [] },
      ],
    },
    {
      id: "conv-fleet",
      contactId: "c-fleet-northbound",
      pinned: false, archived: false, priority: false,
      lastReadAt: 0,
      createdAt: Date.now() - 1000 * 60 * 60 * 60,
      updatedAt: Date.now() - 1000 * 60 * 60 * 50,
      messages: [
        { id: "m1", at: Date.now() - 1000 * 60 * 60 * 50, from: "them", text: "Reminder: PTO requests for next month due Friday.", status: "read", attachmentRefs: [] },
      ],
    },
    {
      id: "conv-driver-carla",
      contactId: "c-driver-carla",
      pinned: false, archived: false, priority: false,
      lastReadAt: 0,
      createdAt: Date.now() - 1000 * 60 * 60 * 50,
      updatedAt: Date.now() - 1000 * 60 * 60 * 48,
      messages: [
        { id: "m1", at: Date.now() - 1000 * 60 * 60 * 48, from: "them", text: "I'll grab the lumper run, no worries.", status: "read", attachmentRefs: [] },
      ],
    },
  ],
});

function safeParse(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export function loadMessageStore() {
  const data = safeParse(localStorage.getItem(KEY));
  if (!data || data.version !== SCHEMA_VERSION) {
    saveMessageStore(SEED);
    return JSON.parse(JSON.stringify(SEED));
  }
  // Defensive: ensure required fields are present.
  if (!Array.isArray(data.contacts)) data.contacts = [];
  if (!Array.isArray(data.conversations)) data.conversations = [];
  return data;
}

export function saveMessageStore(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* ignore quota */ }
}

export function listConversations() { return loadMessageStore().conversations; }
export function listContacts()      { return loadMessageStore().contacts; }
export function getContact(id)      { return loadMessageStore().contacts.find((c) => c.id === id) || null; }

export function getConversation(id) {
  const store = loadMessageStore();
  return store.conversations.find((c) => c.id === id) || null;
}

export function unreadCount(conversation) {
  if (!conversation || !Array.isArray(conversation.messages)) return 0;
  return conversation.messages.filter((m) => m.from === "them" && (m.at > (conversation.lastReadAt || 0))).length;
}

export function markRead(id) {
  const store = loadMessageStore();
  const c = store.conversations.find((cv) => cv.id === id);
  if (!c) return;
  c.lastReadAt = Date.now();
  saveMessageStore(store);
}

export function sendMessage(conversationId, text, attachmentRefs = []) {
  const store = loadMessageStore();
  const c = store.conversations.find((cv) => cv.id === conversationId);
  if (!c) return null;
  const msg = {
    id: `m-${cryptoRandom()}`,
    at: Date.now(),
    from: "me",
    text: String(text || "").trim(),
    status: "sent",
    attachmentRefs: Array.isArray(attachmentRefs) ? attachmentRefs : [],
  };
  c.messages.push(msg);
  c.updatedAt = msg.at;
  c.lastReadAt = msg.at;
  saveMessageStore(store);
  return msg;
}

export function startConversation({ contactId, tripId = null, message = "", attachmentRefs = [] }) {
  if (!contactId) return null;
  const store = loadMessageStore();
  // If a non-archived conversation already exists, reuse it.
  const existing = store.conversations.find((c) => c.contactId === contactId && !c.archived);
  const id = existing?.id || `conv-${cryptoRandom()}`;
  const now = Date.now();
  if (!existing) {
    store.conversations.unshift({
      id, contactId, tripId,
      pinned: false, archived: false, priority: false,
      lastReadAt: now, createdAt: now, updatedAt: now,
      messages: [],
    });
  }
  saveMessageStore(store);
  if (message.trim() || attachmentRefs.length) {
    sendMessage(id, message, attachmentRefs);
  }
  return id;
}

export function pinConversation(id, pinned) { _patch(id, { pinned }); }
export function archiveConversation(id, archived) { _patch(id, { archived }); }
export function setPriority(id, priority) { _patch(id, { priority }); }

function _patch(id, patch) {
  const store = loadMessageStore();
  const c = store.conversations.find((cv) => cv.id === id);
  if (!c) return;
  Object.assign(c, patch);
  saveMessageStore(store);
}

export function deleteConversation(id) {
  const store = loadMessageStore();
  store.conversations = store.conversations.filter((c) => c.id !== id);
  saveMessageStore(store);
}

/** Filter helper for the conversation list. */
export function filterConversations(conversations, contacts, {
  q = "", role = "all", onlyUnread = false, onlyAttachments = false,
  pinned = "any", archived = false, priority = "any",
} = {}) {
  const byId = Object.fromEntries(contacts.map((c) => [c.id, c]));
  return conversations.filter((c) => {
    const contact = byId[c.contactId];
    if (!archived && c.archived) return false;
    if (archived === "only" && !c.archived) return false;
    if (pinned === "yes" && !c.pinned) return false;
    if (pinned === "no" && c.pinned) return false;
    if (priority === "yes" && !c.priority) return false;
    if (priority === "no" && c.priority) return false;
    if (role !== "all" && contact?.role !== role) return false;
    if (onlyUnread && unreadCount(c) === 0) return false;
    if (onlyAttachments && !c.messages.some((m) => (m.attachmentRefs || []).length > 0)) return false;
    if (q) {
      const hay = [
        contact?.name || "", contact?.company || "", contact?.role || "",
        c.tripId ? `#${c.tripId}` : "",
        ...c.messages.map((m) => m.text || ""),
      ].join(" ").toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  }).sort((a, b) => (b.pinned - a.pinned) || (b.updatedAt - a.updatedAt));
}

export function totalUnread(conversations) {
  return conversations.filter((c) => !c.archived).reduce((sum, c) => sum + unreadCount(c), 0);
}

function cryptoRandom() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    const buf = new Uint32Array(2);
    crypto.getRandomValues(buf);
    return `${buf[0].toString(36)}${buf[1].toString(36)}`;
  }
  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
