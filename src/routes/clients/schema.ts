import Joi from 'joi';
import { PaymentTerms } from '@prisma/client';

export default {
  create: Joi.object().keys({
    companyName: Joi.string().required().min(1).max(255),
    contactName: Joi.string().optional().allow('').max(255),
    email: Joi.string().email().optional().allow(''),
    phone: Joi.string().optional().allow('').max(50),
    billingAddress: Joi.object().optional().allow(null),
    paymentTerms: Joi.string()
      .valid(...Object.values(PaymentTerms))
      .optional(),
    currency: Joi.string().length(3).uppercase().optional(),
    notes: Joi.string().optional().allow(''),
  }),

  update: Joi.object().keys({
    companyName: Joi.string().optional().min(1).max(255),
    contactName: Joi.string().optional().allow('').max(255),
    email: Joi.string().email().optional().allow(''),
    phone: Joi.string().optional().allow('').max(50),
    billingAddress: Joi.object().optional().allow(null),
    paymentTerms: Joi.string()
      .valid(...Object.values(PaymentTerms))
      .optional(),
    currency: Joi.string().length(3).uppercase().optional(),
    notes: Joi.string().optional().allow(''),
  }),

  clientId: Joi.object().keys({
    id: Joi.string().required().uuid(),
  }),

  pagination: Joi.object().keys({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
    search: Joi.string().optional().allow('').max(255),
  }),

  createProjectForClient: Joi.object().keys({
    name: Joi.string().required().min(1).max(255),
    description: Joi.string().optional().allow('').max(1000),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().min(Joi.ref('startDate')).optional(),
    totalBudget: Joi.number().positive().required(),
    currency: Joi.string().length(3).uppercase().optional().default('USD'),
    paymentPlan: Joi.array().optional(),
  }),

  getClientProjects: Joi.object().keys({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
    search: Joi.string().optional().allow('').max(255),
    status: Joi.string()
      .valid('ACTIVE', 'COMPLETED', 'PAUSED', 'ARCHIVED')
      .optional(),
    sortBy: Joi.string()
      .valid('createdAt', 'startDate', 'endDate', 'totalBudget', 'name')
      .optional()
      .default('createdAt'),
    sortOrder: Joi.string().valid('asc', 'desc').optional().default('desc'),
  }),
};
