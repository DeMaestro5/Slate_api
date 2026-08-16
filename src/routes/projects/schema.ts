import Joi from 'joi';
import { ProjectStatus } from '@prisma/client';

export default {
  create: Joi.object().keys({
    clientId: Joi.string().required().uuid(),
    proposalId: Joi.string().optional().uuid(),
    contractId: Joi.string().optional().uuid(),
    name: Joi.string().required().min(1).max(255),
    description: Joi.string().optional().allow(''),
    startDate: Joi.date().required(),
    endDate: Joi.date().optional().allow(null).greater(Joi.ref('startDate')),
    totalBudget: Joi.number().required().positive(),
    currency: Joi.string().length(3).uppercase().optional(),
    paymentPlan: Joi.array()
      .items(
        Joi.object({
          milestone: Joi.string().required(),
          amount: Joi.number().required().positive(),
          dueDate: Joi.date().optional(),
          status: Joi.string().optional().valid('pending', 'invoiced', 'paid'),
        }),
      )
      .optional()
      .allow(null),
  }),

  update: Joi.object().keys({
    clientId: Joi.string().optional().uuid(),
    name: Joi.string().optional().min(1).max(255),
    description: Joi.string().optional().allow(''),
    status: Joi.string()
      .valid(...Object.values(ProjectStatus))
      .optional(),
    startDate: Joi.date().optional(),
    endDate: Joi.date().optional().allow(null),
    totalBudget: Joi.number().optional().positive(),
    currency: Joi.string().length(3).uppercase().optional(),
    paymentPlan: Joi.array()
      .items(
        Joi.object({
          milestone: Joi.string().required(),
          amount: Joi.number().required().positive(),
          dueDate: Joi.date().optional(),
          status: Joi.string().optional().valid('pending', 'invoiced', 'paid'),
        }),
      )
      .optional()
      .allow(null),
  }),

  projectId: Joi.object().keys({
    id: Joi.string().required().uuid(),
  }),

  pagination: Joi.object().keys({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
    status: Joi.string()
      .valid(...Object.values(ProjectStatus))
      .optional(),
    search: Joi.string().optional().allow('').max(255),
  }),

  paymentPlan: Joi.object().keys({
    paymentPlan: Joi.array()
      .items(
        Joi.object({
          milestone: Joi.string().required(),
          amount: Joi.number().required().positive(),
          dueDate: Joi.date().optional(),
          status: Joi.string().optional().valid('pending', 'invoiced', 'paid'),
        }),
      )
      .required()
      .min(1),
  }),
};
