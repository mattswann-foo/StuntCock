// Test setup — mocks Firebase Admin SDK so no real GCP credentials are needed.

// In-memory store for Firestore mock
const store = {};

function getDoc(path) {
  return store[path];
}

function setDoc(path, data) {
  store[path] = { ...store[path], ...data };
}

// Build a mock document reference
function mockDocRef(path) {
  return {
    get: jest.fn(async () => ({
      exists: path in store,
      id: path.split('/').pop(),
      data: () => store[path] || null,
    })),
    set: jest.fn(async (data, opts) => {
      store[path] = opts && opts.merge ? { ...store[path], ...data } : { ...data };
    }),
    update: jest.fn(async (data) => {
      store[path] = { ...store[path], ...data };
    }),
    delete: jest.fn(async () => {
      delete store[path];
    }),
    id: path.split('/').pop(),
  };
}

// Build a mock collection reference that supports add / where / orderBy / limit / get
function mockColRef(basePath) {
  const queryDocs = [];
  const ref = {
    add: jest.fn(async (data) => {
      const id = `auto_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const fullPath = `${basePath}/${id}`;
      store[fullPath] = { ...data };
      return { id };
    }),
    doc: jest.fn((id) => mockDocRef(`${basePath}/${id}`)),
    get: jest.fn(async () => ({
      size: queryDocs.length,
      docs: queryDocs,
      forEach: (fn) => queryDocs.forEach(fn),
    })),
    where: jest.fn(() => ref),
    orderBy: jest.fn(() => ref),
    limit: jest.fn(() => ref),
  };
  ref._queryDocs = queryDocs;
  return ref;
}

// Mock the firebase-admin module
const mockAdmin = {
  apps: [],
  credential: {
    applicationDefault: jest.fn(() => ({})),
  },
  initializeApp: jest.fn(),
  auth: jest.fn(() => ({
    verifyIdToken: jest.fn(async (token) => {
      if (token === 'valid-token-uid-A') return { uid: 'uid-A' };
      if (token === 'valid-token-uid-B') return { uid: 'uid-B' };
      throw new Error('Invalid token');
    }),
  })),
  firestore: jest.fn(() => ({
    collection: jest.fn((name) => mockColRef(name)),
    batch: jest.fn(() => {
      const ops = [];
      return {
        set: jest.fn((ref, data, opts) => { ops.push({ type: 'set', ref, data, opts }); }),
        update: jest.fn((ref, data) => { ops.push({ type: 'update', ref, data }); }),
        delete: jest.fn((ref) => { ops.push({ type: 'delete', ref }); }),
        commit: jest.fn(async () => {
          for (const op of ops) {
            if (op.type === 'set') await op.ref.set(op.data, op.opts);
            else if (op.type === 'update') await op.ref.update(op.data);
            else if (op.type === 'delete') await op.ref.delete();
          }
        }),
      };
    }),
  })),
};

jest.mock('firebase-admin', () => mockAdmin);

// Reset store between tests
beforeEach(() => {
  Object.keys(store).forEach(k => delete store[k]);
});

module.exports = { mockAdmin, store };
