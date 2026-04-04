import { NextFunction, Request, Response, Router } from "express";
import Joi from "joi";
import { prisma } from "../lib/prisma";

const router = Router();

const feedbackSchema = Joi.object({
  feedback: Joi.string().valid("positive", "neutral", "negative").required(),
});

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const weekStart = req.query.weekStart
      ? new Date(String(req.query.weekStart))
      : undefined;

    const recommendations = await prisma.recommendation.findMany({
      where: {
        ...(weekStart
          ? {
              weeklyTrend: {
                weekStart,
              },
            }
          : {}),
      },
      orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
    });

    res.json({ recommendations, total: recommendations.length });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/:recommendationId/feedback",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recommendationId = String(req.params.recommendationId);
      const { error, value } = feedbackSchema.validate(req.body, {
        abortEarly: false,
      });

      if (error) {
        return res
          .status(400)
          .json({
            message: "Invalid feedback payload",
            details: error.details,
          });
      }

      const recommendation = await prisma.recommendation.update({
        where: { id: recommendationId },
        data: {
          feedback: value.feedback,
          feedbackAt: new Date(),
        },
      });

      return res.json({ message: "Feedback stored", recommendation });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
