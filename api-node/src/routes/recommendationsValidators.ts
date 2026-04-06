import Joi from "joi";

export const feedbackSchema = Joi.object({
  feedback: Joi.string().valid("positive", "neutral", "negative").required(),
});

export const completionSchema = Joi.object({
  completedAt: Joi.date().iso().optional(),
});

export const generateSchema = Joi.object({
  weekStart: Joi.date().iso().optional(),
});
