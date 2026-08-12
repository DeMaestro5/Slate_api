import express from 'express';
import { SuccessResponse } from '../../core/ApiResponse';
import { CacheService } from '../../cache/CacheService';
import { CacheKeys, TTL } from '../../cache/keys';
import PortfolioRepo from '../../database/repository/PortfolioRepo';
import { BadRequestError, NotFoundError } from '../../core/ApiError';
import validator from '../../helpers/validator';
import schema from './schema';
import asyncHandler from '../../helpers/asyncHandler';
import { formatPortfolioData } from './utils';
import { ProtectedRequest } from '../../types/app-request';
import authentication from '../../auth/authentication';
import { checkUsageLimit } from '../../middleware/subscription-check';

const router = express.Router();

/*---------------------------------------------------------*/
// All routes require authentication
router.use(authentication);
/*---------------------------------------------------------*/

/**
 * GET /api/v1/portfolio
 * Get all portfolio items for authenticated user
 */
router.get(
  '/',
  validator(schema.pagination),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const category = (req.query.category as string) || undefined;
    const isPublished = req.query.isPublished
      ? req.query.isPublished === 'true'
      : undefined;
    const includeDeleted = req.query.includeDeleted === 'true';

    const cacheKey = CacheKeys.portfolioList(userId, page, limit);
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return new SuccessResponse(
        'Portfolio items fetched successfully',
        cached as object,
      ).send(res);
    }

    const skip = (page - 1) * limit;

    const [portfolioItems, total] = await Promise.all([
      PortfolioRepo.findAllByUser(userId, skip, limit, {
        category,
        isPublished,
        includeDeleted,
      }),
      PortfolioRepo.countByUser(userId, {
        category,
        isPublished,
        includeDeleted,
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    const payload = {
      portfolio: portfolioItems.map(formatPortfolioData),
      pagination: { page, limit, total, totalPages },
    };
    await CacheService.set(cacheKey, payload, TTL.LIST);

    new SuccessResponse('Portfolio items fetched successfully', payload).send(
      res,
    );
  }),
);
/**
 * GET /api/v1/portfolio/analytics
 * Get portfolio analytics
 */
router.get(
  '/analytics',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const analytics = await PortfolioRepo.getAnalytics(req.user.id);

    new SuccessResponse('Portfolio analytics fetched successfully', {
      analytics,
    }).send(res);
  }),
);

/**
 * POST /api/v1/portfolio
 * Create new portfolio item
 */
router.post(
  '/',
  checkUsageLimit('portfolioItems'),
  validator(schema.create),
  asyncHandler(async (req: ProtectedRequest, res) => {
    // Check if slug is available
    const slugAvailable = await PortfolioRepo.isSlugAvailable(req.body.slug);
    if (!slugAvailable) {
      throw new BadRequestError(
        'This slug is already taken. Please choose another.',
      );
    }

    // Convert date if provided as string
    const projectDate = req.body.projectDate
      ? new Date(req.body.projectDate)
      : new Date();

    const portfolio = await PortfolioRepo.create({
      userId: req.user.id,
      title: req.body.title,
      slug: req.body.slug,
      description: req.body.description,
      category: req.body.category,
      imageUrl: req.body.imageUrl,
      images: req.body.images,
      projectDate,
      client: req.body.client,
      technologies: req.body.technologies,
      liveUrl: req.body.liveUrl,
      githubUrl: req.body.githubUrl,
      caseStudy: req.body.caseStudy,
      testimonial: req.body.testimonial,
      isPublished: req.body.isPublished,
      order: req.body.order,
    });

    await CacheService.invalidatePattern(
      CacheKeys.userPortfolioPattern(req.user.id),
    );

    new SuccessResponse('Portfolio item created successfully', {
      portfolio: formatPortfolioData(portfolio),
    }).send(res);
  }),
);

/**
 * GET /api/v1/portfolio/:id
 * Get single portfolio item by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const portfolio = await PortfolioRepo.findById(req.params.id, req.user.id);

    if (!portfolio) {
      throw new NotFoundError('Portfolio item not found');
    }

    new SuccessResponse('Portfolio item fetched successfully', {
      portfolio: formatPortfolioData(portfolio),
    }).send(res);
  }),
);

/**
 * PUT /api/v1/portfolio/:id
 * Update portfolio item
 */
router.put(
  '/:id',
  validator(schema.update),
  asyncHandler(async (req: ProtectedRequest, res) => {
    // Check if portfolio exists
    const exists = await PortfolioRepo.existsForUser(
      req.params.id,
      req.user.id,
    );
    if (!exists) {
      throw new NotFoundError('Portfolio item not found');
    }

    // If slug is being updated, check availability
    if (req.body.slug) {
      const slugAvailable = await PortfolioRepo.isSlugAvailable(
        req.body.slug,
        req.params.id,
      );
      if (!slugAvailable) {
        throw new BadRequestError(
          'This slug is already taken. Please choose another.',
        );
      }
    }

    // Convert date if provided
    const updateData = {
      ...req.body,
      projectDate: req.body.projectDate
        ? new Date(req.body.projectDate)
        : undefined,
    };

    const portfolio = await PortfolioRepo.update(
      req.params.id,
      req.user.id,
      updateData,
    );

    await CacheService.invalidatePattern(
      CacheKeys.userPortfolioPattern(req.user.id),
    );

    new SuccessResponse('Portfolio item updated successfully', {
      portfolio: formatPortfolioData(portfolio),
    }).send(res);
  }),
);

/**
 * DELETE /api/v1/portfolio/:id
 * Soft delete portfolio item
 */
router.delete(
  '/:id',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const exists = await PortfolioRepo.existsForUser(
      req.params.id,
      req.user.id,
    );
    if (!exists) {
      throw new NotFoundError('Portfolio item not found');
    }

    const portfolio = await PortfolioRepo.softDelete(
      req.params.id,
      req.user.id,
    );

    await CacheService.invalidatePattern(
      CacheKeys.userPortfolioPattern(req.user.id),
    );

    new SuccessResponse('Portfolio item deleted successfully', {
      portfolio: formatPortfolioData(portfolio),
    }).send(res);
  }),
);

/**
 * POST /api/v1/portfolio/:id/publish
 * Toggle publish status
 */
router.post(
  '/:id/publish',

  validator(schema.publish),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const exists = await PortfolioRepo.existsForUser(
      req.params.id,
      req.user.id,
    );
    if (!exists) {
      throw new NotFoundError('Portfolio item not found');
    }

    const portfolio = await PortfolioRepo.togglePublish(
      req.params.id,
      req.user.id,
      req.body.isPublished,
    );

    await CacheService.invalidatePattern(
      CacheKeys.userPortfolioPattern(req.user.id),
    );

    new SuccessResponse(
      `Portfolio item ${
        req.body.isPublished ? 'published' : 'unpublished'
      } successfully`,
      {
        portfolio: formatPortfolioData(portfolio),
      },
    ).send(res);
  }),
);

export default router;
