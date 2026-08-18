import express from 'express';
import { SuccessResponse } from '../../core/ApiResponse';
import { CacheService } from '../../cache/CacheService';
import { CacheKeys, TTL } from '../../cache/keys';
import ProjectRepo from '../../database/repository/ProjectRepo';
import ClientRepo from '../../database/repository/ClientRepo';
import ProposalRepo from '../../database/repository/ProposalRepo';
import ContractRepo from '../../database/repository/ContractRepo';
import { BadRequestError, NotFoundError } from '../../core/ApiError';
import validator from '../../helpers/validator';
import schema from './schema';
import asyncHandler from '../../helpers/asyncHandler';
import { getProjectData, validatePaymentPlan } from './utils';
import { ProtectedRequest } from '../../types/app-request';
import authentication from '../../auth/authentication';
import { ProjectStatus } from '@prisma/client';
import { checkUsageLimit } from '../../middleware/subscription-check';

const router = express.Router();

/*---------------------------------------------------------*/
// All routes require authentication
router.use(authentication);
/*---------------------------------------------------------*/

/**
 * Get all projects for authenticated user with pagination
 */
router.get(
  '/',
  validator(schema.pagination),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = (req.query.status as ProjectStatus) || undefined;
    const search = (req.query.search as string) || undefined;

    const cacheKey = CacheKeys.projectList(userId, page, limit, status || '');
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return new SuccessResponse(
        'Projects fetched successfully',
        cached as object,
      ).send(res);
    }

    const skip = (page - 1) * limit;

    const [projects, total] = await Promise.all([
      ProjectRepo.findAllByUser(userId, skip, limit, status, search),
      ProjectRepo.countByUser(userId, status, search),
    ]);

    const totalPages = Math.ceil(total / limit);

    const payload = {
      projects: projects.map(getProjectData),
      pagination: { page, limit, total, totalPages },
    };
    await CacheService.set(cacheKey, payload, TTL.LIST);

    new SuccessResponse('Projects fetched successfully', payload).send(res);
  }),
);

/**
 * Create new project
 */
router.post(
  '/',
  checkUsageLimit('projects'),
  validator(schema.create),
  asyncHandler(async (req: ProtectedRequest, res) => {
    // ONLY verify client if clientId is provided
    if (req.body.clientId) {
      const clientExists = await ClientRepo.existsForUser(
        req.body.clientId,
        req.user.id,
      );
      if (!clientExists) {
        throw new BadRequestError('Client not found or does not belong to you');
      }

      // If proposalId provided, verify it belongs to user and client
      if (req.body.proposalId) {
        const proposal = await ProposalRepo.findById(
          req.body.proposalId,
          req.user.id,
        );
        if (!proposal) {
          throw new BadRequestError('Proposal not found');
        }
        if (proposal.clientId !== req.body.clientId) {
          throw new BadRequestError('Proposal does not belong to this client');
        }
      }

      // If contractId provided, verify it belongs to user and client
      if (req.body.contractId) {
        const contract = await ContractRepo.findById(
          req.body.contractId,
          req.user.id,
        );
        if (!contract) {
          throw new BadRequestError('Contract not found');
        }
        if (contract.clientId !== req.body.clientId) {
          throw new BadRequestError('Contract does not belong to this client');
        }
      }
    } else {
      // If no clientId, proposalId and contractId must also be null
      if (req.body.proposalId || req.body.contractId) {
        throw new BadRequestError(
          'Proposal and Contract can only be assigned with a client',
        );
      }
    }

    // Validate payment plan if provided
    if (req.body.paymentPlan && req.body.paymentPlan.length > 0) {
      const validation = validatePaymentPlan(
        req.body.paymentPlan,
        req.body.totalBudget,
      );
      if (!validation.valid) {
        throw new BadRequestError(validation.message || 'Invalid payment plan');
      }
    }

    // Convert dates
    const startDate = new Date(req.body.startDate);
    const endDate = req.body.endDate ? new Date(req.body.endDate) : undefined;

    const project = await ProjectRepo.create({
      userId: req.user.id,
      clientId: req.body.clientId || null,
      proposalId: req.body.proposalId || null,
      contractId: req.body.contractId || null,
      name: req.body.name,
      description: req.body.description,
      startDate,
      endDate,
      totalBudget: req.body.totalBudget,
      currency: req.body.currency,
      paymentPlan: req.body.paymentPlan,
    });

    await CacheService.invalidatePattern(
      CacheKeys.userProjectsPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);

    new SuccessResponse('Project created successfully', {
      project: getProjectData(project),
    }).send(res);
  }),
);

/**
 * Get single project by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const project = await ProjectRepo.findById(req.params.id, req.user.id);

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Get project stats
    const stats = await ProjectRepo.getStats(req.params.id, req.user.id);

    new SuccessResponse('Project fetched successfully', {
      project: getProjectData(project),
      stats,
    }).send(res);
  }),
);

/**
 * Update project
 */
router.put(
  '/:id',
  validator(schema.update),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const exists = await ProjectRepo.existsForUser(req.params.id, req.user.id);
    if (!exists) {
      throw new NotFoundError('Project not found');
    }

    // Validate payment plan if provided
    if (req.body.paymentPlan && req.body.paymentPlan.length > 0) {
      // Get current project to check budget
      const currentProject = await ProjectRepo.findById(
        req.params.id,
        req.user.id,
      );
      const budgetToCheck =
        req.body.totalBudget || Number(currentProject?.totalBudget);

      const validation = validatePaymentPlan(
        req.body.paymentPlan,
        budgetToCheck,
      );
      if (!validation.valid) {
        throw new BadRequestError(validation.message || 'Invalid payment plan');
      }
    }

    // Convert dates if provided
    const updateData: any = { ...req.body };
    if (updateData.startDate) {
      updateData.startDate = new Date(updateData.startDate);
    }
    if (updateData.endDate) {
      updateData.endDate = new Date(updateData.endDate);
    }

    const project = await ProjectRepo.update(
      req.params.id,
      req.user.id,
      updateData,
    );

    await CacheService.invalidatePattern(
      CacheKeys.userProjectsPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);

    new SuccessResponse('Project updated successfully', {
      project: getProjectData(project),
    }).send(res);
  }),
);

/**
 * Delete project
 */
router.delete(
  '/:id',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const exists = await ProjectRepo.existsForUser(req.params.id, req.user.id);
    if (!exists) {
      throw new NotFoundError('Project not found');
    }

    // Check if project has invoices
    const project = await ProjectRepo.findByIdWithInvoices(
      req.params.id,
      req.user.id,
    );

    if (project && project.invoices && project.invoices.length > 0) {
      throw new BadRequestError(
        'Cannot delete project with existing invoices. Please delete or unlink invoices first.',
      );
    }

    await ProjectRepo.remove(req.params.id, req.user.id);

    await CacheService.invalidatePattern(
      CacheKeys.userProjectsPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);

    new SuccessResponse('Project deleted successfully', {}).send(res);
  }),
);

/**

 * Get all invoices for a specific project
 */
router.get(
  '/:id/invoices',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const project = await ProjectRepo.findByIdWithInvoices(
      req.params.id,
      req.user.id,
    );

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    new SuccessResponse('Project invoices fetched successfully', {
      project: {
        id: project.id,
        name: project.name,
        status: project.status,
      },
      invoices: project.invoices,
    }).send(res);
  }),
);

/**
 * POST /api/v1/projects/:id/payment-plan
 * Update payment plan for project
 */
router.post(
  '/:id/payment-plan',
  validator(schema.paymentPlan),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const project = await ProjectRepo.findById(req.params.id, req.user.id);

    if (!project) {
      throw new NotFoundError('Project not found');
    }

    // Validate payment plan
    const validation = validatePaymentPlan(
      req.body.paymentPlan,
      Number(project.totalBudget),
    );
    if (!validation.valid) {
      throw new BadRequestError(validation.message || 'Invalid payment plan');
    }

    const updatedProject = await ProjectRepo.update(
      req.params.id,
      req.user.id,
      {
        paymentPlan: req.body.paymentPlan,
      },
    );

    await CacheService.invalidatePattern(
      CacheKeys.userProjectsPattern(req.user.id),
    );

    new SuccessResponse('Payment plan updated successfully', {
      project: getProjectData(updatedProject),
    }).send(res);
  }),
);

export default router;
