import express, { Express, Request, Response } from "express";
import helmet from "helmet";
import cors from "cors";
import dotenv from "dotenv";
import pino from "pino";
import axios from "axios";
import journalsRouter from "./routes/journals";
import trendsRouter from "./routes/trends";
import recommendationsRouter from "./routes/recommendations";
import { prisma } from "./lib/prisma";
import { redis } from "./lib/redis";

dotenv.config();

const app: Express = express();
const logger = pino();

const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/journals", journalsRouter);
app.use("/api/trends", trendsRouter);
app.use("/api/recommendations", recommendationsRouter);

// Health check endpoint
app.get("/api/health", async (_req: Request, res: Response) => {
  const analysisUrl = `${process.env.ANALYSIS_API_URL ?? "http://analysis:8000"}/health`;

  const services = {
    database: "down",
    redis: "down",
    pythonAnalysis: "down",
  } as const;

  let databaseStatus: "ok" | "down" = "down";
  let redisStatus: "ok" | "down" = "down";
  let analysisStatus: "ok" | "down" = "down";

  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseStatus = "ok";
  } catch (error) {
    logger.error({ err: error }, "Database health check failed");
  }

  try {
    await redis.ping();
    redisStatus = "ok";
  } catch (error) {
    logger.error({ err: error }, "Redis health check failed");
  }

  try {
    const response = await axios.get(analysisUrl, { timeout: 3000 });
    if (response.status === 200) {
      analysisStatus = "ok";
    }
  } catch (error) {
    logger.error({ err: error }, "Analysis service health check failed");
  }

  const allHealthy =
    databaseStatus === "ok" && redisStatus === "ok" && analysisStatus === "ok";

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
    services: {
      ...services,
      database: databaseStatus,
      redis: redisStatus,
      pythonAnalysis: analysisStatus,
    },
  });
});

// Basic route
app.get("/api", (req: Request, res: Response) => {
  res.json({
    message: "Audio Journaling API",
    version: "0.1.0",
    endpoints: {
      health: "/api/health",
      journals: "/api/journals",
      trends: "/api/trends",
      recommendations: "/api/recommendations",
    },
  });
});

// Error handling middleware
app.use((err: any, _req: Request, res: Response, _next: unknown) => {
  logger.error(err);
  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`API server running on http://0.0.0.0:${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
});

export default app;
