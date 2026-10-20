import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  sendEmailNotification: vi.fn(),
}));

vi.mock('./email.service.js', () => ({
  sendEmailNotification: mocks.sendEmailNotification,
}));

import { BadRequestError } from '../../common/errors/AppError.js';
import { send } from './email.controller.js';

function makeResponse() {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  } as unknown as Response;
  vi.mocked(response.status).mockReturnValue(response);
  return response;
}

const validBody = {
  to: 'creator@example.com',
  subject: 'A tip arrived',
  text: 'You received a tip.',
};

beforeEach(() => {
  mocks.sendEmailNotification.mockReset();
  mocks.sendEmailNotification.mockResolvedValue({
    status: 'queued',
    provider: 'audit-log',
    auditId: 'audit-1',
    deliveryId: 'delivery-1',
  });
});

describe('email controller', () => {
  it('passes authenticated input to the service and returns 202', async () => {
    const response = makeResponse();
    const next = vi.fn();
    const request = {
      body: validBody,
      auth: { userId: 'user-1' },
    } as Request;

    await send(request, response, next as unknown as NextFunction);

    expect(mocks.sendEmailNotification).toHaveBeenCalledWith({
      userId: 'user-1',
      ...validBody,
    });
    expect(response.status).toHaveBeenCalledWith(202);
    expect(response.json).toHaveBeenCalledWith({
      data: expect.objectContaining({ deliveryId: 'delivery-1' }),
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards malformed payloads as BadRequestError', async () => {
    const response = makeResponse();
    const next = vi.fn();
    const request = {
      body: { ...validBody, subject: '' },
      auth: { userId: 'user-1' },
    } as Request;

    await send(request, response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0]).toBeInstanceOf(BadRequestError);
    expect(mocks.sendEmailNotification).not.toHaveBeenCalled();
  });

  it('forwards service failures to error middleware', async () => {
    const response = makeResponse();
    const next = vi.fn();
    const failure = new Error('provider unavailable');
    mocks.sendEmailNotification.mockRejectedValue(failure);
    const request = {
      body: validBody,
      auth: { userId: 'user-1' },
    } as Request;

    await send(request, response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledWith(failure);
  });
});
