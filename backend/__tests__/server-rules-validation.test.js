// Tests for POST /api/rules and PUT /api/rules/:id validation in server.js

const request = require('supertest');

// --- Mock heavy dependencies before requiring server ---

jest.mock('../db', () => ({
  getSetting: jest.fn(() => 'false'),
  getAllSettings: jest.fn(() => ({})),
  getRules: jest.fn(() => []),
  getRule: jest.fn(() => null),
  createRule: jest.fn((data) => ({ id: 1, ...data })),
  updateRule: jest.fn((id, data) => ({ id, name: 'Existing', trigger_type: 'any', response_type: 'static', ...data })),
  deleteRule: jest.fn(),
  reorderRules: jest.fn(),
  setSetting: jest.fn(),
  logMessage: jest.fn(),
  getRecentMessages: jest.fn(() => []),
  getAnalytics: jest.fn(() => []),
  getTodayStats: jest.fn(() => ({ total: 0, replied: 0 })),
  getActiveRuleCount: jest.fn(() => 0),
}));

jest.mock('../ruleEngine', () => ({
  matchMessage: jest.fn(() => null),
  isSelfMessage: jest.fn(() => false),
}));

jest.mock('../llmClient', () => ({
  generateLLMReply: jest.fn(),
  resetClient: jest.fn(),
}));

jest.mock('../signalClient', () => ({
  onMessage: jest.fn(),
  startDaemon: jest.fn(),
  stopDaemon: jest.fn(),
  getStatus: jest.fn(() => ({ running: false, restartCount: 0, port: 8080 })),
  sendMessage: jest.fn(),
  register: jest.fn(),
  verifyCode: jest.fn(),
}));

jest.mock('../whatsappClient', () => ({
  initialize: jest.fn(),
  onMessage: jest.fn(),
  getStatus: jest.fn(() => ({ ready: false })),
  sendMessage: jest.fn(),
}));

jest.mock('../gifClient', () => ({
  fetchGifPath: jest.fn(),
}));

// Now require server after mocks are in place
const app = require('../server');

const db = require('../db');

describe('POST /api/rules — validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.createRule.mockImplementation((data) => ({ id: 1, ...data }));
  });

  test('returns 400 with structured error for invalid trigger_type', async () => {
    const res = await request(app)
      .post('/api/rules')
      .send({
        name: 'Test',
        trigger_type: 'always',
        response_type: 'static',
        response_text: 'Hi',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContain(
      'trigger_type must be one of: any, exact, contains, starts_with, regex'
    );
  });

  test('returns 400 with structured error for invalid response_type', async () => {
    const res = await request(app)
      .post('/api/rules')
      .send({
        name: 'Test',
        trigger_type: 'any',
        response_type: 'dynamic',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContain(
      'response_type must be one of: static, llm, template'
    );
  });

  test('returns 400 for invalid schedule_start format', async () => {
    const res = await request(app)
      .post('/api/rules')
      .send({
        name: 'Test',
        trigger_type: 'any',
        response_type: 'static',
        schedule_start: '9:00',
      });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('schedule_start must be HH:MM format');
  });

  test('returns 400 for invalid cooldown_minutes', async () => {
    const res = await request(app)
      .post('/api/rules')
      .send({
        name: 'Test',
        trigger_type: 'any',
        response_type: 'static',
        cooldown_minutes: -1,
      });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain('cooldown_minutes must be a non-negative integer');
  });

  test('returns 200 with created rule for a fully valid request', async () => {
    db.createRule.mockReturnValue({
      id: 42,
      name: 'Good Rule',
      trigger_type: 'any',
      response_type: 'static',
      response_text: 'Hello',
    });

    const res = await request(app)
      .post('/api/rules')
      .send({
        name: 'Good Rule',
        trigger_type: 'any',
        response_type: 'static',
        response_text: 'Hello',
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 42, name: 'Good Rule' });
    expect(db.createRule).toHaveBeenCalledTimes(1);
  });

  test('does not call db.createRule on invalid input', async () => {
    await request(app)
      .post('/api/rules')
      .send({ trigger_type: 'bad' });
    expect(db.createRule).not.toHaveBeenCalled();
  });
});

describe('PUT /api/rules/:id — validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.updateRule.mockImplementation((id, data) => ({
      id,
      name: 'Existing',
      trigger_type: 'any',
      response_type: 'static',
      ...data,
    }));
  });

  test('returns 400 for invalid schedule_start "9:00"', async () => {
    const res = await request(app)
      .put('/api/rules/1')
      .send({ schedule_start: '9:00' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
    expect(res.body.details).toContain('schedule_start must be HH:MM format');
  });

  test('returns 400 for invalid trigger_type', async () => {
    const res = await request(app)
      .put('/api/rules/1')
      .send({ trigger_type: 'wrong' });
    expect(res.status).toBe(400);
    expect(res.body.details).toContain(
      'trigger_type must be one of: any, exact, contains, starts_with, regex'
    );
  });

  test('passes validation for partial update with only name', async () => {
    const res = await request(app)
      .put('/api/rules/1')
      .send({ name: 'Updated name' });
    expect(res.status).toBe(200);
    expect(db.updateRule).toHaveBeenCalledWith(1, { name: 'Updated name' });
  });

  test('returns 404 when rule not found', async () => {
    db.updateRule.mockReturnValue(null);
    const res = await request(app)
      .put('/api/rules/999')
      .send({ name: 'Updated name' });
    expect(res.status).toBe(404);
  });

  test('does not call db.updateRule on invalid input', async () => {
    await request(app)
      .put('/api/rules/1')
      .send({ response_type: 'bad' });
    expect(db.updateRule).not.toHaveBeenCalled();
  });
});
