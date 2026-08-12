import Joi from 'joi';
import { INDUSTRIES } from '../../constants/industries';

// Reserved slugs that can't be used for portfolios
export const RESERVED_SLUGS = [
  'api',
  'login',
  'signup',
  'logout',
  'profile',
  'dashboard',
  'admin',
  'pricing',
  'settings',
  'help',
  'support',
  'about',
  'contact',
  'terms',
  'privacy',
  'blog',
  'docs',
  'status',
  'public',
  'static',
  'assets',
  'webhooks',
];

export default {
  create: Joi.object().keys({
    title: Joi.string().required().min(3).max(200),
    slug: Joi.string()
      .required()
      .pattern(/^[a-z0-9-]+$/)
      .min(3)
      .max(100)
      .custom((value, helpers) => {
        if (RESERVED_SLUGS.includes(value)) {
          return helpers.error('any.invalid');
        }
        return value;
      })
      .messages({
        'string.pattern.base':
          'Slug must contain only lowercase letters, numbers, and hyphens',
        'any.invalid': 'This slug is reserved and cannot be used',
      }),
    description: Joi.string().required().min(10).max(2000),
    category: Joi.string()
      .valid(...INDUSTRIES)
      .required()
      .min(2)
      .max(100),
    imageUrl: Joi.string().uri().optional().allow(''),
    images: Joi.array().items(Joi.string().uri()).optional(),
    projectDate: Joi.date().required(),
    client: Joi.string().optional().allow(''),
    technologies: Joi.array().items(Joi.string()).optional(),
    liveUrl: Joi.string().uri().optional().allow(''),
    githubUrl: Joi.string().uri().optional().allow(''),
    caseStudy: Joi.string().optional().allow(''),
    testimonial: Joi.string().optional().allow(''),
    order: Joi.number().integer().min(0).optional(),
    isPublished: Joi.boolean().optional(),
  }),

  update: Joi.object().keys({
    title: Joi.string().optional().min(3).max(200),
    slug: Joi.string()
      .optional()
      .pattern(/^[a-z0-9-]+$/)
      .min(3)
      .max(100)
      .custom((value, helpers) => {
        if (RESERVED_SLUGS.includes(value)) {
          return helpers.error('any.invalid');
        }
        return value;
      }),
    description: Joi.string().optional().min(10).max(2000),
    category: Joi.string().optional().min(2).max(100),
    imageUrl: Joi.string().uri().optional().allow(''),
    images: Joi.array().items(Joi.string().uri()).optional(),
    projectDate: Joi.date().optional(),
    client: Joi.string().optional().allow(''),
    technologies: Joi.array().items(Joi.string()).optional(),
    liveUrl: Joi.string().uri().optional().allow(''),
    githubUrl: Joi.string().uri().optional().allow(''),
    caseStudy: Joi.string().optional().allow(''),
    testimonial: Joi.string().optional().allow(''),
    order: Joi.number().integer().min(0).optional(),
    isPublished: Joi.boolean().optional(),
  }),

  portfolioId: Joi.object().keys({
    id: Joi.string().required().uuid(),
  }),

  publish: Joi.object().keys({
    isPublished: Joi.boolean().required(),
  }),

  pagination: Joi.object().keys({
    page: Joi.number().integer().min(1).optional().default(1),
    limit: Joi.number().integer().min(1).max(100).optional().default(20),
    category: Joi.string().optional(),
    isPublished: Joi.boolean().optional(),
    includeDeleted: Joi.boolean().optional().default(false),
  }),

  slug: Joi.object().keys({
    slug: Joi.string().required(),
  }),
};
