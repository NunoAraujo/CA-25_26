import Joi from "joi";

export const callbackSchema = Joi.object({
  status: Joi.string().valid("complete", "failed").required(),
  transcription: Joi.string().allow(null, ""),
  emotionVector: Joi.object({
    joy: Joi.number(),
    sadness: Joi.number(),
    anger: Joi.number(),
    anxiety: Joi.number(),
    calm: Joi.number(),
    energy: Joi.number(),
  }).optional(),
  semanticScores: Joi.object({
    joy: Joi.number(),
    sadness: Joi.number(),
    anger: Joi.number(),
    anxiety: Joi.number(),
    calm: Joi.number(),
    energy: Joi.number(),
  }).optional(),
  prosodyScores: Joi.object({
    joy: Joi.number(),
    sadness: Joi.number(),
    anger: Joi.number(),
    anxiety: Joi.number(),
    calm: Joi.number(),
    energy: Joi.number(),
  }).optional(),
  prosodyFeatures: Joi.object().optional(),
  semanticWeight: Joi.number().min(0).max(1).optional(),
  prosodyWeight: Joi.number().min(0).max(1).optional(),
  modelVersion: Joi.string().max(64).optional(),
  errorMessage: Joi.string().optional(),
});
