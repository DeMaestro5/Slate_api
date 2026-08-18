import Joi from 'joi';
import { InvoiceStatus } from '@prisma/client';

export default {
  create: Joi.object().keys({
    clientId: Joi.string().optional().uuid().allow(null),
    projectId: Joi.string().optional().uuid(),
    issueDate: Joi.date().required(),
    dueDate: Joi.date().required().greater(Joi.ref('issueDate')),
    taxRate: Joi.number().optional().min(0).max(100).default(0),
    currency: Joi.string().length(3).uppercase().optional(),
    notes: Joi.string().optional().allow(''),
    terms: Joi.string().optional().allow(''),
    lineItems: Joi.array()
      .items(
        Joi.object({
          description: Joi.string().required().min(1),
          quantity: Joi.number().required().positive(),
          rate: Joi.number().required().min(0),
          amount: Joi.number().required().min(0),
          order: Joi.number().required().integer().min(0),
        }),
      )
      .required()
      .min(1),
  }),

  update: Joi.object().keys({
    clientId: Joi.string().optional().uuid().allow(null),
    issueDate: Joi.date().optional(),
    dueDate: Joi.date().optional(),
    taxRate: Joi.number().optional().min(0).max(100),
    currency: Joi.string().length(3).uppercase().optional(),
    notes: Joi.string().optional().allow(''),
    terms: Joi.string().optional().allow(''),
    lineItems: Joi.array()
      .items(
        Joi.object({
          description: Joi.string().required().min(1),
          quantity: Joi.number().required().positive(),
          rate: Joi.number().required().min(0),
          amount: Joi.number().required().min(0),
          order: Joi.number().required().integer().min(0),
        }),
      )
      .optional()
      .min(1),
  }),

  invoiceId: Joi.object().keys({
    id: Joi.string().required().uuid(),
  }),

  pagination: Joi.object().keys({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
    status: Joi.string()
      .valid(...Object.values(InvoiceStatus))
      .optional(),
    search: Joi.string().optional().allow('').max(255),
  }),

  updateStatus: Joi.object().keys({
    status: Joi.string()
      .required()
      .valid(...Object.values(InvoiceStatus)),
  }),

  batchSend: Joi.object().keys({
    invoiceIds: Joi.array()
      .items(Joi.string().uuid())
      .required()
      .min(1)
      .max(50),
  }),

  markPaid: Joi.object({
    amount: Joi.number().positive().required(),
    paymentMethod: Joi.string()
      .valid(
        'STRIPE',
        'BANK_TRANSFER',
        'CASH',
        'CHECK',
        'MOBILE_MONEY',
        'CRYPTO',
        'OTHER',
      )
      .required(),
    paidAt: Joi.string().isoDate().required(),
    notes: Joi.string().max(500).optional().allow(''),
  }),
};
