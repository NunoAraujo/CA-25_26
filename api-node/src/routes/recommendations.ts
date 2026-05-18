import { NextFunction, Request, Response, Router } from "express";
import {
  generateDailyRecommendations,
  listRecommendations,
  listAllRecommendations,
  storeRecommendationCompletion,
  storeRecommendationFeedback,
} from "../lib/recommendationService";
import { LlmRecommendationError } from "../lib/llmRecommendationService";
import {
  completionSchema,
  feedbackSchema,
  generateSchema,
} from "./recommendationsValidators";

const router = Router();

router.post(
  "/generate-daily",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { error, value } = generateSchema.validate(req.body ?? {}, {
        abortEarly: false,
      });

      if (error) {
        return res.status(400).json({
          message: "Invalid generation payload",
          details: error.details,
        });
      }

      const dayStart = value.dayStart
        ? new Date(String(value.dayStart))
        : undefined;
      const result = await generateDailyRecommendations(dayStart);

      return res.status(result.status).json(result.payload);
    } catch (error) {
      if (error instanceof LlmRecommendationError) {
        return res.status(error.statusCode).json({
          message: error.message,
          code: error.code,
        });
      }
      return next(error);
    }
  },
);

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const showAll = req.query.all === "true";
    const dayStartRaw = req.query.dayStart;
    const dayStart =
      typeof dayStartRaw === "string" ? new Date(dayStartRaw) : undefined;

    const data = showAll
      ? await listAllRecommendations()
      : await listRecommendations(dayStart);

    return res.json(data);
  } catch (error) {
    return next(error);
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
        return res.status(400).json({
          message: "Invalid feedback payload",
          details: error.details,
        });
      }

      const recommendation = await storeRecommendationFeedback(
        recommendationId,
        value.feedback,
      );

      return res.json({ message: "Feedback stored", recommendation });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/:recommendationId/complete",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const recommendationId = String(req.params.recommendationId);
      const { error, value } = completionSchema.validate(req.body ?? {}, {
        abortEarly: false,
      });

      if (error) {
        return res.status(400).json({
          message: "Invalid completion payload",
          details: error.details,
        });
      }

      const completionDate = value.completedAt
        ? new Date(String(value.completedAt))
        : undefined;
      const recommendation = await storeRecommendationCompletion(
        recommendationId,
        completionDate,
      );

      return res.json({ message: "Completion stored", recommendation });
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
