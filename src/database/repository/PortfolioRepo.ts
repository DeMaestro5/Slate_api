import prisma from '../index';
import { Portfolio, Prisma } from '@prisma/client';

export interface CreatePortfolioData {
  userId: string;
  title: string;
  slug: string;
  description: string;
  category: string;
  imageUrl?: string;
  images?: string[];
  projectDate: Date;
  client?: string;
  technologies?: string[];
  liveUrl?: string;
  githubUrl?: string;
  caseStudy?: string;
  testimonial?: string;
  order?: number;
  isPublished?: boolean;
}

export interface UpdatePortfolioData {
  title?: string;
  slug?: string;
  description?: string;
  category?: string;
  imageUrl?: string;
  images?: string[];
  projectDate?: Date;
  client?: string;
  technologies?: string[];
  liveUrl?: string;
  githubUrl?: string;
  caseStudy?: string;
  testimonial?: string;
  order?: number;
  isPublished?: boolean;
}

/**
 * Check if portfolio item exists and belongs to user
 */
async function existsForUser(id: string, userId: string): Promise<boolean> {
  const portfolio = await prisma.portfolio.findFirst({
    where: {
      id,
      userId,
      deletedAt: null,
    },
  });
  return portfolio !== null;
}

/**
 * Check if slug is available
 */
async function isSlugAvailable(
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  const existing = await prisma.portfolio.findFirst({
    where: {
      slug,
      deletedAt: null,
      ...(excludeId && { id: { not: excludeId } }),
    },
  });
  return existing === null;
}

/**
 * Find portfolio item by ID (only if not deleted and belongs to user)
 */
async function findById(id: string, userId: string): Promise<Portfolio | null> {
  return prisma.portfolio.findFirst({
    where: {
      id,
      userId,
      deletedAt: null,
    },
  });
}

/**
 * Find portfolio item by slug (public - includes published items from any user)
 */
async function findBySlug(slug: string): Promise<Portfolio | null> {
  return prisma.portfolio.findFirst({
    where: {
      slug,
      isPublished: true,
      deletedAt: null,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          portfolioTitle: true,
          portfolioBio: true,
          portfolioAvatar: true,
          portfolioLocation: true,
          isAvailable: true,
          linkedinUrl: true,
          twitterUrl: true,
          githubUrl: true,
        },
      },
    },
  });
}

/**
 * Get all portfolio items for a user
 */
async function findAllByUser(
  userId: string,
  skip: number = 0,
  take: number = 20,
  filters?: {
    category?: string;
    isPublished?: boolean;
    includeDeleted?: boolean;
  },
): Promise<Portfolio[]> {
  const where: Prisma.PortfolioWhereInput = {
    userId,
    deletedAt: filters?.includeDeleted ? undefined : null,
  };

  if (filters?.category) {
    where.category = filters.category;
  }

  if (filters?.isPublished !== undefined) {
    where.isPublished = filters.isPublished;
  }

  return prisma.portfolio.findMany({
    where,
    skip,
    take,
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  });
}

/**
 * Count portfolio items for a user
 */
async function countByUser(
  userId: string,
  filters?: {
    category?: string;
    isPublished?: boolean;
    includeDeleted?: boolean;
  },
): Promise<number> {
  const where: Prisma.PortfolioWhereInput = {
    userId,
    deletedAt: filters?.includeDeleted ? undefined : null,
  };

  if (filters?.category) {
    where.category = filters.category;
  }

  if (filters?.isPublished !== undefined) {
    where.isPublished = filters.isPublished;
  }

  return prisma.portfolio.count({ where });
}

/**
 * Get all published portfolio items for public profile
 */
async function findPublishedByUserId(userId: string): Promise<Portfolio[]> {
  return prisma.portfolio.findMany({
    where: {
      userId,
      isPublished: true,
      deletedAt: null,
    },
    orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
  });
}

/**
 * Get next order number for user's portfolio
 */
async function getNextOrderNumber(userId: string): Promise<number> {
  const lastItem = await prisma.portfolio.findFirst({
    where: {
      userId,
      deletedAt: null,
    },
    orderBy: {
      order: 'desc',
    },
    select: {
      order: true,
    },
  });

  return lastItem ? lastItem.order + 1 : 0;
}

/**
 * Create new portfolio item
 */
async function create(data: CreatePortfolioData): Promise<Portfolio> {
  const order = data.order ?? (await getNextOrderNumber(data.userId));

  return prisma.portfolio.create({
    data: {
      userId: data.userId,
      title: data.title,
      slug: data.slug,
      description: data.description,
      category: data.category,
      imageUrl: data.imageUrl,
      images: data.images ? (data.images as any) : Prisma.JsonNull,
      projectDate: data.projectDate,
      client: data.client,
      technologies: data.technologies
        ? (data.technologies as any)
        : Prisma.JsonNull,
      liveUrl: data.liveUrl,
      githubUrl: data.githubUrl,
      caseStudy: data.caseStudy,
      testimonial: data.testimonial,
      isPublished: data.isPublished,
      order,
    },
  });
}

/**
 * Update portfolio item
 */
async function update(
  id: string,
  userId: string,
  data: UpdatePortfolioData,
): Promise<Portfolio> {
  return prisma.portfolio.update({
    where: {
      id,
      userId,
      deletedAt: null,
    },
    data: {
      ...data,
      images: data.images ? (data.images as any) : undefined,
      technologies: data.technologies ? (data.technologies as any) : undefined,
    },
  });
}

/**
 * Toggle publish status
 */
async function togglePublish(
  id: string,
  userId: string,
  isPublished: boolean,
): Promise<Portfolio> {
  return prisma.portfolio.update({
    where: {
      id,
      userId,
      deletedAt: null,
    },
    data: {
      isPublished,
    },
  });
}

/**
 * Soft delete portfolio item
 */
async function softDelete(id: string, userId: string): Promise<Portfolio> {
  return prisma.portfolio.update({
    where: {
      id,
      userId,
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
      isPublished: false, // Also unpublish
    },
  });
}

/**
 * Restore deleted portfolio item
 */
async function restore(id: string, userId: string): Promise<Portfolio> {
  return prisma.portfolio.update({
    where: {
      id,
      userId,
    },
    data: {
      deletedAt: null,
    },
  });
}

/**
 * Increment view count
 */
async function incrementViews(id: string): Promise<void> {
  await prisma.portfolio.update({
    where: { id },
    data: {
      views: {
        increment: 1,
      },
    },
  });
}

/**
 * Get portfolio analytics for user
 */
async function getAnalytics(userId: string) {
  const portfolioItems = await prisma.portfolio.findMany({
    where: {
      userId,
      deletedAt: null,
    },
    select: {
      id: true,
      title: true,
      slug: true,
      views: true,
      isPublished: true,
      category: true,
      createdAt: true,
    },
    orderBy: {
      views: 'desc',
    },
  });

  const totalViews = portfolioItems.reduce((sum, item) => sum + item.views, 0);
  const publishedCount = portfolioItems.filter(
    (item) => item.isPublished,
  ).length;
  const totalCount = portfolioItems.length;

  // Most viewed items
  const topItems = portfolioItems.slice(0, 5);

  // Views by category
  const viewsByCategory = portfolioItems.reduce(
    (acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + item.views;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    totalViews,
    totalItems: totalCount,
    publishedItems: publishedCount,
    unpublishedItems: totalCount - publishedCount,
    topItems,
    viewsByCategory: Object.entries(viewsByCategory).map(
      ([category, views]) => ({
        category,
        views,
      }),
    ),
  };
}

export default {
  existsForUser,
  isSlugAvailable,
  findById,
  findBySlug,
  findAllByUser,
  countByUser,
  findPublishedByUserId,
  getNextOrderNumber,
  create,
  update,
  togglePublish,
  softDelete,
  restore,
  incrementViews,
  getAnalytics,
};
