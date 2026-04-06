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
  prosodyFeatures: Joi.object().optional(),
  errorMessage: Joi.string().optional(),
});
