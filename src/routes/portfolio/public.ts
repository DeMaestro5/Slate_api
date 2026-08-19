import express from 'express';
import { SuccessResponse } from '../../core/ApiResponse';
import PortfolioRepo from '../../database/repository/PortfolioRepo';
import prisma from '../../database';
import { NotFoundError } from '../../core/ApiError';
import asyncHandler from '../../helpers/asyncHandler';
import { formatPortfolioData } from './utils';

const router = express.Router();

/**
 * GET /:slug
 * Public portfolio page (no authentication required)
 */
router.get(
  '/:slug',
  asyncHandler(async (req, res) => {
    const { slug } = req.params;
    console.log('[PUBLIC PORTFOLIO] looking up slug:', req.params.slug);

    // First, try to find user by portfolio slug (case-insensitive: slug is stored lowercase)
    const user = await prisma.user.findFirst({
      where: {
        portfolioSlug: slug?.toLowerCase() ?? slug,
      },
      select: {
        id: true,
        name: true,
        email: true,
        profilePicUrl: true,
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

    console.log('[PUBLIC PORTFOLIO] user found:', user ? user.id : 'NOT FOUND');
    console.log('[PUBLIC PORTFOLIO] portfolioSlug in DB:', user?.portfolioSlug);

    if (!user) {
      throw new NotFoundError('Portfolio not found');
    }

    // Get all published portfolio items for this user
    const portfolioItems = await PortfolioRepo.findPublishedByUserId(user.id);

    // Increment view count for each item (async, don't wait)
    portfolioItems.forEach((item) => {
      PortfolioRepo.incrementViews(item.id).catch((err) => {
        console.error('Failed to increment views:', err);
      });
    });

    // Calculate total views
    const totalViews = portfolioItems.reduce(
      (sum, item) => sum + item.views,
      0,
    );

    // Format response
    new SuccessResponse('Public portfolio fetched successfully', {
      profile: {
        name: user.name,
        title: user.portfolioTitle || 'Freelancer',
        bio: user.portfolioBio,
        avatar: user.portfolioAvatar ?? user.profilePicUrl ?? null,
        location: user.portfolioLocation,
        portfolioTemplate: user.portfolioTemplate,
        isAvailable: user.isAvailable,
        email: user.email, // Contact email
        linkedinUrl: user.linkedinUrl,
        twitterUrl: user.twitterUrl,
        githubUrl: user.githubUrl,
        slug: user.portfolioSlug,
        totalViews,
        totalProjects: portfolioItems.length,
      },
      portfolio: portfolioItems.map(formatPortfolioData),
    }).send(res);
  }),
);

export default router;
