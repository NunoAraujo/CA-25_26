import express, { Express, Request, Response } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import dotenv from 'dotenv'
import pino from 'pino'

dotenv.config()

const app: Express = express()
const logger = pino()

const PORT = process.env.PORT || 3000

// Middleware
app.use(helmet())
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check endpoint
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      database: 'pending',
      redis: 'pending',
      pythonAnalysis: 'pending',
    },
  })
})

// Basic route
app.get('/api', (req: Request, res: Response) => {
  res.json({
    message: 'Audio Journaling API',
    version: '0.1.0',
    endpoints: {
      health: '/api/health',
      journals: '/api/journals',
      trends: '/api/trends',
      recommendations: '/api/recommendations',
    },
  })
})

// Error handling middleware
app.use((err: any, req: Request, res: Response) => {
  logger.error(err)
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  })
})

// Start server
app.listen(PORT, () => {
  logger.info(`API server running on http://0.0.0.0:${PORT}`)
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`)
})

export default app
