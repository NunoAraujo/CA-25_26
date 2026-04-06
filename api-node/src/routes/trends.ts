import { NextFunction, Request, Response, Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.get(
  "/daily",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const from =
        typeof req.query.from === "string"
          ? new Date(req.query.from)
          : undefined;
      const to =
        typeof req.query.to === "string" ? new Date(req.query.to) : undefined;

      const trends = await prisma.dailyTrend.findMany({
        where: {
          ...(from || to
            ? {
                dayStart: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
        orderBy: { dayStart: "asc" },
      });

      res.json({ trends, total: trends.length });
    } catch (error) {
      next(error);
    }
  },
);

export default router;
