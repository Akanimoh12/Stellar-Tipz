import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { BadRequestError } from "../../common/errors/AppError.js";
import { searchCreators } from "./search.service.js";
import { searchQuerySchema } from "./search.schema.js";

/**
 * GET /search
 * Searches for creators with relevance ranking and typo tolerance.
 *
 * Query params:
 *   query: string (required) - search term
 *   page:  number (default: 1)
 *   limit: number (default: 20, max: 100)
 *
 * Issue #1266
 */
export async function searchController(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const query = searchQuerySchema.parse(req.query);
    const result = await searchCreators(query.query, query.page, query.limit);
    res.json({ data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new BadRequestError("Invalid search parameters", error.issues));
    } else {
      next(error);
    }
  }
}
