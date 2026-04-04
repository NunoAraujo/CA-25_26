import { NextFunction, Request, Response, Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get(
  "/weekly",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from = req.query.from
        ? new Date(String(req.query.from))
        : undefined;
      const to = req.query.to ? new Date(String(req.query.to)) : undefined;

      const trends = await prisma.weeklyTrend.findMany({
        where: {
          ...(from || to
            ? {
                weekStart: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
        orderBy: { weekStart: "asc" },
      });

      res.json({ trends, total: trends.length });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
