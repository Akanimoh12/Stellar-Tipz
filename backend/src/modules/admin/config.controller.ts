import type { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../../common/errors/AppError.js';
import {
  prepareSetFeeSchema,
  prepareSetMinTipAmountSchema,
  prepareSetMinWithdrawalAmountSchema,
  preparePauseSchema,
  submitSetFeeSchema,
  submitSetMinTipAmountSchema,
  submitSetMinWithdrawalAmountSchema,
  submitPauseSchema,
} from './config.schema.js';
import * as configService from './config.service.js';
import { resolveAdminActor } from './admin.middleware.js';

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Resolve the acting user's ID and Stellar address from the request.
 * The admin identity is populated by requireAuth + requireRole('admin').
 */
function resolveAdmin(req: Request): { actorId: string; adminAddress: string } {
  const actorId = resolveAdminActor(req);

  // The auth-module `requireAuth` populates `req.auth`; the shared one
  // populates `req.user`. Either may carry the Stellar address.
  const stellarAddress = req.auth?.stellarAddress ?? req.user?.stellarAddress;
  if (!stellarAddress) {
    throw new BadRequestError('Admin Stellar address not found in token');
  }

  return { actorId, adminAddress: stellarAddress };
}

// ── Prepare endpoints ─────────────────────────────────────────────────────────

/**
 * POST /admin/config/fee/prepare
 * Build an unsigned propose_fee_change transaction.
 */
export async function prepareSetFeeController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = prepareSetFeeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid request body', parsed.error.flatten());
    }
    const { adminAddress } = resolveAdmin(req);
    const result = await configService.prepareSetFee(adminAddress, parsed.data.feeBps);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/config/min-tip-amount/prepare
 * Build an unsigned set_min_tip_amount transaction.
 */
export async function prepareSetMinTipAmountController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = prepareSetMinTipAmountSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid request body', parsed.error.flatten());
    }
    const { adminAddress } = resolveAdmin(req);
    const result = await configService.prepareSetMinTipAmount(adminAddress, parsed.data.amount);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/config/min-withdrawal-amount/prepare
 * Build an unsigned set_min_withdrawal_amount transaction.
 */
export async function prepareSetMinWithdrawalAmountController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = prepareSetMinWithdrawalAmountSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid request body', parsed.error.flatten());
    }
    const { adminAddress } = resolveAdmin(req);
    const result = await configService.prepareSetMinWithdrawalAmount(
      adminAddress,
      parsed.data.amount,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/config/pause/prepare
 * Build an unsigned pause_contract or unpause_contract transaction.
 */
export async function prepareSetPausedController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = preparePauseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid request body', parsed.error.flatten());
    }
    const { adminAddress } = resolveAdmin(req);
    const result = await configService.prepareSetPaused(adminAddress, parsed.data.paused);
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ── Submit endpoints ──────────────────────────────────────────────────────────

/**
 * POST /admin/config/fee/submit
 * Broadcast a signed propose_fee_change transaction.
 */
export async function submitSetFeeController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = submitSetFeeSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid request body', parsed.error.flatten());
    }
    const { actorId, adminAddress } = resolveAdmin(req);
    const result = await configService.submitSetFee(
      actorId,
      adminAddress,
      parsed.data.feeBps,
      parsed.data.signedTxXdr,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/config/min-tip-amount/submit
 * Broadcast a signed set_min_tip_amount transaction.
 */
export async function submitSetMinTipAmountController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = submitSetMinTipAmountSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid request body', parsed.error.flatten());
    }
    const { actorId } = resolveAdmin(req);
    const result = await configService.submitSetMinTipAmount(
      actorId,
      parsed.data.amount,
      parsed.data.signedTxXdr,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/config/min-withdrawal-amount/submit
 * Broadcast a signed set_min_withdrawal_amount transaction.
 */
export async function submitSetMinWithdrawalAmountController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = submitSetMinWithdrawalAmountSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid request body', parsed.error.flatten());
    }
    const { actorId } = resolveAdmin(req);
    const result = await configService.submitSetMinWithdrawalAmount(
      actorId,
      parsed.data.amount,
      parsed.data.signedTxXdr,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /admin/config/pause/submit
 * Broadcast a signed pause_contract / unpause_contract transaction.
 */
export async function submitSetPausedController(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = submitPauseSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new BadRequestError('Invalid request body', parsed.error.flatten());
    }
    const { actorId } = resolveAdmin(req);
    const result = await configService.submitSetPaused(
      actorId,
      parsed.data.paused,
      parsed.data.signedTxXdr,
    );
    res.status(200).json({ data: result });
  } catch (err) {
    next(err);
  }
}

// ── Pending fee change (timelock surface — #016) ───────────────────────────────

/**
 * GET /admin/config/pending-fee-change
 * Surface a timelocked fee proposal so operators know the effective ledger.
 */
export async function getPendingFeeChangeController(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const pending = await configService.getPendingFeeChange();
    res.status(200).json({ data: pending ?? null });
  } catch (err) {
    next(err);
  }
}
