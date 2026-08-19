import express from 'express';
import { SuccessResponse } from '../../core/ApiResponse';
import prisma from '../../database';
import { BadRequestError } from '../../core/ApiError';
import validator from '../../helpers/validator';
import asyncHandler from '../../helpers/asyncHandler';
import { ProtectedRequest } from '../../types/app-request';
import authentication from '../../auth/authentication';
import Joi from 'joi';
import { RESERVED_SLUGS } from '../portfolio/schema';
import { PORTFOLIO_TEMPLATE_SLUGS } from '../../constants/portfolioTemplates';

const router = express.Router();

/*---------------------------------------------------------*/
router.use(authentication);
/*---------------------------------------------------------*/

const portfolioProfileSchema = Joi.object().keys({
  portfolioSlug: Joi.string()
    .pattern(/^[a-z0-9-]+$/)
    .min(3)
    .max(50)
    .optional()
    .allow('')
    .custom((value, helpers) => {
      if (value && RESERVED_SLUGS.includes(value)) {
        return helpers.error('any.invalid');
      }
      return value;
    })
    .messages({
      'string.pattern.base':
        'Portfolio slug must contain only lowercase letters, numbers, and hyphens',
      'any.invalid': 'This slug is reserved and cannot be used',
    }),
  portfolioTitle: Joi.string().optional().allow('').max(100),
  portfolioBio: Joi.string().optional().allow('').max(500),
  portfolioAvatar: Joi.string().uri().optional().allow(''),
  portfolioLocation: Joi.string().optional().allow('').max(100),
  portfolioTemplate: Joi.string()
    .optional()
    .valid(...PORTFOLIO_TEMPLATE_SLUGS),
  isAvailable: Joi.boolean().optional(),
  linkedinUrl: Joi.string().uri().optional().allow(''),
  twitterUrl: Joi.string().uri().optional().allow(''),
  githubUrl: Joi.string().uri().optional().allow(''),
});

/**
 * PUT /api/v1/profile/portfolio
 * Update user's portfolio profile settings
 */
router.put(
  '/portfolio',
  validator(portfolioProfileSchema),
  asyncHandler(async (req: ProtectedRequest, res) => {
    // If slug is being set, check if available
    if (req.body.portfolioSlug) {
      const existingUser = await prisma.user.findFirst({
        where: {
          portfolioSlug: req.body.portfolioSlug,
          id: {
            not: req.user.id,
          },
        },
      });

      if (existingUser) {
        throw new BadRequestError(
          'This portfolio slug is already taken. Please choose another.',
        );
      }
    }

    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        portfolioSlug: req.body.portfolioSlug,
        portfolioTitle: req.body.portfolioTitle,
        portfolioBio: req.body.portfolioBio,
        portfolioAvatar: req.body.portfolioAvatar,
        portfolioLocation: req.body.portfolioLocation,
        portfolioTemplate: req.body.portfolioTemplate, // NEW
        isAvailable: req.body.isAvailable,
        linkedinUrl: req.body.linkedinUrl,
        twitterUrl: req.body.twitterUrl,
        githubUrl: req.body.githubUrl,
      },
      select: {
        id: true,
        name: true,
        email: true,
        portfolioSlug: true,
        portfolioTitle: true,
        portfolioBio: true,
        portfolioAvatar: true,
        portfolioLocation: true,
        portfolioTemplate: true, // NEW
        isAvailable: true,
        linkedinUrl: true,
        twitterUrl: true,
        githubUrl: true,
      },
    });

    new SuccessResponse('Portfolio profile updated successfully', {
      profile: updatedUser,
      publicUrl: updatedUser.portfolioSlug
        ? `${process.env.FRONTEND_URL || 'https://novba.com'}/${
            updatedUser.portfolioSlug
          }`
        : null,
    }).send(res);
  }),
);

/**
 * GET /api/v1/profile/portfolio
 * Get user's portfolio profile settings
 */
router.get(
  '/portfolio',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        portfolioSlug: true,
        portfolioTitle: true,
        portfolioBio: true,
        portfolioAvatar: true,
        portfolioLocation: true,
        portfolioTemplate: true,
        isAvailable: true,
        linkedinUrl: true,
        twitterUrl: true,
        githubUrl: true,
      },
    });

    new SuccessResponse('Portfolio profile fetched successfully', {
      profile: user,
      publicUrl: user?.portfolioSlug
        ? `${process.env.FRONTEND_URL || 'https://novba.com'}/${
            user.portfolioSlug
          }`
        : null,
    }).send(res);
  }),
);

export default router;
