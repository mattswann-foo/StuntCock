// Tests for the requireUserId auth middleware

'use strict';

const { requireUserId } = require('../authMiddleware');

function makeRes() {
  const res = {
    _status: 200,
    _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; },
  };
  return res;
}

describe('requireUserId middleware', () => {
  test('calls next() and sets req.userId when a valid Bearer token is provided', () => {
    const req = { headers: { authorization: 'Bearer my-user-token-123' } };
    const res = makeRes();
    const next = jest.fn();

    requireUserId(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBe('my-user-token-123');
  });

  test('returns 401 when Authorization header is missing', () => {
    const req = { headers: {} };
    const res = makeRes();
    const next = jest.fn();

    requireUserId(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
    expect(res._body).toMatchObject({ error: expect.any(String) });
  });

  test('returns 401 when Authorization header has no Bearer prefix', () => {
    const req = { headers: { authorization: 'Basic abc123' } };
    const res = makeRes();
    const next = jest.fn();

    requireUserId(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test('returns 401 when Bearer token is an empty string', () => {
    const req = { headers: { authorization: 'Bearer ' } };
    const res = makeRes();
    const next = jest.fn();

    requireUserId(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res._status).toBe(401);
  });

  test('trims whitespace from the token', () => {
    const req = { headers: { authorization: 'Bearer   trimmed-token  ' } };
    const res = makeRes();
    const next = jest.fn();

    requireUserId(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBe('trimmed-token');
  });

  test('is case-insensitive for the Bearer prefix', () => {
    const req = { headers: { authorization: 'bearer lowercase-token' } };
    const res = makeRes();
    const next = jest.fn();

    requireUserId(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBe('lowercase-token');
  });
});
