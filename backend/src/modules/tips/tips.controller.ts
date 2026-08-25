import type { Request, Response, NextFunction } from 'express';
import {
  prepareTipSchema,
  tipIdParamSchema,
  usernameParamSchema,
  tipsListQuerySchema,
  getTipsQuerySchema,
  recordTipSchema,
  confirmTipParamSchema,
  receiptParamSchema,
} from './tips.schema.js';
import * as tipsService from './tips.service.js';
import { emitTipCreated, emitBalanceUpdated, emitLeaderboardUpdated } from '../../realtime/index.js';
import { prisma } from '../../db/prisma.js';
import { getWithdrawableBalance } from '../withdrawals/withdrawals.service.js';
import { getUserRank } from '../leaderboard/leaderboard.service.js';
import { logger } from '../../common/utils/logger.js';
import { ForbiddenError, NotFoundError } from '../../common/errors/AppError.js';

/** GET /tips — filterable, cursor-paginated list of tips. */
export async function getTips(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit, cursor, address, direction, aggregate } = getTipsQuerySchema.parse(req.query);
    if (aggregate === 'creator') {
      const result = await tipsService.aggregateTipsByCreator();
      res.status(200).json({ data: result });
    } else {
      const result = await tipsService.getPaginatedTips({ limit, cursor, address, direction });
      res.status(200).json({ data: result.data, nextCursor: result.nextCursor });
    }
  } catch (err) {
    next(err);
  }
}

export async function prepare(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { from, to, amount, message } = prepareTipSchema.parse(req.body);
    const prepared = await tipsService.prepareTip(from, to, amount, message);
    res.status(200).json({ data: prepared });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = tipIdParamSchema.parse(req.params);
    const tip = await tipsService.getTipById(id);
    res.status(200).json({ data: tip });
  } catch (err) {
    next(err);
  }
}

export async function getReceived(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { username } = usernameParamSchema.parse(req.params);
    const { limit, cursor } = tipsListQuerySchema.parse(req.query);
    const result = await tipsService.getTipsReceivedByUsername(username, limit, cursor);
    res.status(200).json({ data: result.data, nextCursor: result.nextCursor });
  } catch (err) {
    next(err);
  }
}

export async function getSent(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { limit, cursor } = tipsListQuerySchema.parse(req.query);
    const result = await tipsService.getTipsSentByAddress(req.user!.stellarAddress, limit, cursor);
    res.status(200).json({ data: result.data, nextCursor: result.nextCursor });
  } catch (err) {
    next(err);
  }
}

/** POST /tips — record an on-chain tip, idempotent by txHash. */
export async function record(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = recordTipSchema.parse(req.body);
    const tip = await tipsService.recordTip(input);
    emitTipCreated(tip);
    res.status(200).json({ data: tip });
  } catch (err) {
    next(err);
  }
}

/** GET /tips/:txHash/receipt — structured receipt for sender or recipient. */
export async function getReceipt(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { txHash } = receiptParamSchema.parse(req.params);
    const tip = await tipsService.getTipByTxHash(txHash);

    // Anonymous tips: 404 to everyone except sender/recipient.
    if (tip.isAnonymous) {
      const caller = req.user?.stellarAddress;
      if (!caller || (caller !== tip.fromAddress && caller !== tip.toAddress)) {
        throw new NotFoundError('Tip not found');
      }
    }

    // Non-anonymous tips: only sender or recipient may fetch the receipt.
    const caller = req.user?.stellarAddress;
    if (!caller || (caller !== tip.fromAddress && caller !== tip.toAddress)) {
      throw new ForbiddenError('Only the sender or recipient may view this receipt');
    }

    res.status(200).json({ data: tipsService.serializeTipReceipt(tip) });
  } catch (err) {
    next(err);
  }
}

/** PATCH /tips/:txHash/confirm — transition tip to CONFIRMED, idempotent. */
export async function confirm(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { txHash } = confirmTipParamSchema.parse(req.params);
    const tip = await tipsService.confirmTip(txHash);

    // Confirming a tip changes the recipient's withdrawable balance and their
    // leaderboard rank; notify sockets. Best-effort — a failure here must not
    // turn an already successful confirmation into an error response.
    try {
      const recipient = await prisma.user.findUnique({ where: { stellarAddress: tip.toAddress } });
      if (recipient) {
        const balance = await getWithdrawableBalance(recipient.id);
        emitBalanceUpdated({ userId: recipient.id, ...balance });

        try {
          const rank = await getUserRank(recipient.id, 'all');
          emitLeaderboardUpdated({
            window: rank.window,
            entry: {
              rank: rank.rank,
              userId: recipient.id,
              stellarAddress: tip.toAddress,
              totalTips: rank.totalTips,
            },
          });
        } catch (err) {
          logger.error({ err, txHash }, 'Failed to emit leaderboard.updated after tip confirmation');
        }
      }
    } catch (err) {
      logger.error({ err, txHash }, 'Failed to emit balance.updated after tip confirmation');
    }

    res.status(200).json({ data: tip });
  } catch (err) {
    next(err);
  }
}
