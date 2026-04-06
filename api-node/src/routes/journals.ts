import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { allowedMimeTypes } from "../lib/audioFileValidation";
import { callbackSchema } from "./journalsValidators";
import { processJournalAnalysisCallback } from "../lib/journalAnalysisService";
import {
  createJournalFromAudioUpload,
  getJournalById,
  getJournalStatus,
  listJournals,
  softDeleteJournal,
} from "../lib/journalService";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
});

router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listJournals();
    res.json(data);
  } catch (error) {
    next(error);
  }
});

router.post(
  "/",
  upload.single("audio"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "Audio file is required" });
      }

      if (!allowedMimeTypes.has(file.mimetype)) {
        return res.status(400).json({
          message: "Unsupported audio format",
          supportedFormats: Array.from(allowedMimeTypes),
        });
      }
      const result = await createJournalFromAudioUpload(
        file,
        req.body.durationSeconds,
        req.body.recordedAt,
      );

      return res.status(201).json(result.payload);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/:journalId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const journalId = String(req.params.journalId);
      const journal = await getJournalById(journalId);

      if (!journal) {
        return res.status(404).json({ message: "Journal not found" });
      }

      return res.json(journal);
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  "/:journalId/status",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const journalId = String(req.params.journalId);
      const journal = await getJournalStatus(journalId);

      if (!journal) {
        return res.status(404).json({ message: "Journal not found" });
      }

      return res.json(journal);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  "/:journalId/analysis-callback",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const journalId = String(req.params.journalId);
      const { error, value } = callbackSchema.validate(req.body, {
        abortEarly: false,
      });

      if (error) {
        return res.status(400).json({
          message: "Invalid callback payload",
          details: error.details,
        });
      }

      const result = await processJournalAnalysisCallback(journalId, value);

      if (result.type === "not_found") {
        return res.status(404).json({ message: "Journal not found" });
      }

      if (result.type === "duplicate") {
        return res.json({
          message: "Duplicate callback ignored",
          status: result.status,
        });
      }

      if (result.type === "conflict") {
        return res.status(409).json({
          message: "Journal already finalized with a different status",
          status: result.status,
        });
      }

      return res.json({ message: "Analysis callback accepted" });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  "/:journalId",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const journalId = String(req.params.journalId);
      const result = await softDeleteJournal(journalId);

      if (result === "not_found") {
        return res.status(404).json({ message: "Journal not found" });
      }

      return res.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);

export default router;
