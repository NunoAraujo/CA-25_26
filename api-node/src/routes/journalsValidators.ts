import Joi from "joi";

const emotionSchema = Joi.object({
  joy: Joi.number(),
  sadness: Joi.number(),
  anger: Joi.number(),
  fear: Joi.number(),
  disgust: Joi.number(),
  surprise: Joi.number(),
  neutral: Joi.number(),
  anxiety: Joi.number(),
  calm: Joi.number(),
  energy: Joi.number(),
});

export const callbackSchema = Joi.object({
  status: Joi.string().valid("complete", "failed").required(),
  transcription: Joi.string().allow(null, ""),
  transcriptionModelKey: Joi.string().max(64).allow(null).optional(),
  transcriptionModelId: Joi.string().max(255).allow(null).optional(),
  emotionVector: emotionSchema.optional(),
  semanticScores: emotionSchema.optional(),
  prosodyScores: emotionSchema.optional(),
  prosodyFeatures: Joi.object().optional(),
  semanticWeight: Joi.number().min(0).max(1).optional(),
  prosodyWeight: Joi.number().min(0).max(1).optional(),
  modelVersion: Joi.string().max(128).optional(),
  errorMessage: Joi.string().optional(),
});
