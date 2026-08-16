import { P } from '@upstash/redis/error-8y4qG0W2';
import Joi from 'joi';

export default {
  create: Joi.object().keys({
    name: Joi.string().required().min(1).max(200),
    amount: Joi.number().required().positive(),
    dueDate: Joi.date().optional().allow(null),
    invoiceId: Joi.string().optional().uuid().allow(null),
  }),

  update: Joi.object().keys({
    name: Joi.string().optional().min(1).max(200),
    amount: Joi.number().optional().positive(),
    dueDate: Joi.date().optional().allow(null),
    invoiceId: Joi.string().optional().uuid().allow(null),
  }),

  milestoneId: Joi.object().keys({
    id: Joi.string().required().uuid(),
  }),

  projectId: Joi.object().keys({
    projectId: Joi.string().required().uuid(),
  }),
};
