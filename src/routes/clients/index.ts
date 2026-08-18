import express from 'express';
import { SuccessResponse } from '../../core/ApiResponse';
import { CacheService } from '../../cache/CacheService';
import { CacheKeys, TTL } from '../../cache/keys';
import ClientRepo from '../../database/repository/ClientRepo';
import { BadRequestError, NotFoundError } from '../../core/ApiError';
import validator from '../../helpers/validator';
import schema from './schema';
import asyncHandler from '../../helpers/asyncHandler';
import { getClientData, convertToCSV } from './utils';
import { ProtectedRequest } from '../../types/app-request';
import authentication from '../../auth/authentication';
import { checkUsageLimit } from '../../middleware/subscription-check';

const router = express.Router();

/*---------------------------------------------------------*/
// All routes require authentication
router.use(authentication);
/*---------------------------------------------------------*/

/**
 * GET /api/v1/clients
 * Get all clients for authenticated user with pagination
 */
router.get(
  '/',
  validator(schema.pagination),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || undefined;

    const cacheKey = CacheKeys.clientList(userId, page, limit, search || '');
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return new SuccessResponse(
        'Clients fetched successfully',
        cached as object,
      ).send(res);
    }

    const skip = (page - 1) * limit;

    const [clients, total] = await Promise.all([
      ClientRepo.findAllByUser(userId, skip, limit, search),
      ClientRepo.countByUser(userId, search),
    ]);

    const totalPages = Math.ceil(total / limit);

    const payload = {
      clients: clients.map(getClientData),
      pagination: { page, limit, total, totalPages },
    };
    await CacheService.set(cacheKey, payload, TTL.LIST);

    new SuccessResponse('Clients fetched successfully', payload).send(res);
  }),
);

/**
 * POST /api/v1/clients
 * Create new client
 */
router.post(
  '/',
  checkUsageLimit('clients'),
  validator(schema.create),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const client = await ClientRepo.create({
      userId: req.user.id,
      companyName: req.body.companyName,
      contactName: req.body.contactName,
      email: req.body.email,
      phone: req.body.phone,
      billingAddress: req.body.billingAddress,
      paymentTerms: req.body.paymentTerms,
      currency: req.body.currency,
      notes: req.body.notes,
    });

    await CacheService.invalidatePattern(
      CacheKeys.userClientsPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);

    new SuccessResponse('Client created successfully', {
      client: getClientData(client),
    }).send(res);
  }),
);

/**
 * GET /api/v1/clients/:id
 * Get single client by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const cacheKey = `client:${req.user.id}:${req.params.id}`;
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return new SuccessResponse(
        'Client fetched successfully',
        cached as object,
      ).send(res);
    }
    const client = await ClientRepo.findById(req.params.id, req.user.id);
    if (!client) throw new NotFoundError('Client not found');
    const payload = { client: getClientData(client) };
    await CacheService.set(cacheKey, payload, 300);
    new SuccessResponse('Client fetched successfully', payload).send(res);
  }),
);

/**
 * PUT /api/v1/clients/:id
 * Update client information
 */

/**
 * POST /clients/:clientId/projects
 * Create a project for a specific client
 */
router.post(
  '/:clientId/projects',
  validator(schema.createProjectForClient),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const { clientId } = req.params;
    const { id: userId } = req.user;

    const project = await ClientRepo.createProject(clientId, userId, req.body);

    await CacheService.invalidatePattern(CacheKeys.userProjectsPattern(userId));
    await CacheService.invalidatePattern(CacheKeys.userClientsPattern(userId));

    new SuccessResponse('Project created successfully', {
      project,
    }).send(res);
  }),
);

/**
 * GET /clients/:clientId/projects
 * Get all projects for a specific client with pagination and filtering
 */
router.get(
  '/:clientId/projects',
  validator(schema.getClientProjects),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const { clientId } = req.params;
    const { id: userId } = req.user;

    const cacheKey = `client:${userId}:${clientId}:projects:${JSON.stringify(
      req.query,
    )}`;
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return new SuccessResponse(
        'Projects fetched successfully',
        cached as object,
      ).send(res);
    }

    const result = await ClientRepo.getClientProjects(
      clientId,
      userId,
      req.query,
    );

    await CacheService.set(cacheKey, result, 300);

    new SuccessResponse('Projects fetched successfully', result).send(res);
  }),
);
router.put(
  '/:id',
  validator(schema.update),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const exists = await ClientRepo.existsForUser(req.params.id, req.user.id);
    if (!exists) {
      throw new NotFoundError('Client not found');
    }

    const client = await ClientRepo.update(
      req.params.id,
      req.user.id,
      req.body,
    );

    await CacheService.invalidatePattern(
      CacheKeys.userClientsPattern(req.user.id),
    );
    await CacheService.del(`client:${req.user.id}:${req.params.id}`);
    await CacheService.del(`client-stats:${req.user.id}:${req.params.id}`);
    await CacheService.del(`client-health:${req.user.id}:${req.params.id}`);
    await CacheService.del(`client-invoices:${req.user.id}:${req.params.id}`);

    new SuccessResponse('Client updated successfully', {
      client: getClientData(client),
    }).send(res);
  }),
);

/**
 * DELETE /api/v1/clients/:id
 * Delete client
 */
router.delete(
  '/:id',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const exists = await ClientRepo.existsForUser(req.params.id, req.user.id);
    if (!exists) {
      throw new NotFoundError('Client not found');
    }

    // Check if client has invoices (you may want to prevent deletion)
    const clientWithInvoices = await ClientRepo.findByIdWithInvoices(
      req.params.id,
      req.user.id,
    );

    if (clientWithInvoices && clientWithInvoices.invoices.length > 0) {
      throw new BadRequestError(
        'Cannot delete client with existing invoices. Please delete or reassign invoices first.',
      );
    }

    await ClientRepo.remove(req.params.id, req.user.id);

    await CacheService.invalidatePattern(
      CacheKeys.userClientsPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);
    await CacheService.del(`client:${req.user.id}:${req.params.id}`);
    await CacheService.del(`client-stats:${req.user.id}:${req.params.id}`);
    await CacheService.del(`client-health:${req.user.id}:${req.params.id}`);
    await CacheService.del(`client-invoices:${req.user.id}:${req.params.id}`);

    new SuccessResponse('Client deleted successfully', {}).send(res);
  }),
);

/**
 * GET /api/v1/clients/:id/invoices
 * Get all invoices for a specific client
 */
router.get(
  '/:id/invoices',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const cacheKey = `client-invoices:${req.user.id}:${req.params.id}`;
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return new SuccessResponse(
        'Client invoices fetched successfully',
        cached as object,
      ).send(res);
    }
    const client = await ClientRepo.findByIdWithInvoices(
      req.params.id,
      req.user.id,
    );
    if (!client) throw new NotFoundError('Client not found');
    const payload = {
      client: { id: client.id, companyName: client.companyName },
      invoices: client.invoices,
    };
    await CacheService.set(cacheKey, payload, 300);
    new SuccessResponse('Client invoices fetched successfully', payload).send(
      res,
    );
  }),
);

/**
 * GET /api/v1/clients/:id/stats
 * Get client statistics (revenue, outstanding balance, etc.)
 */
router.get(
  '/:id/stats',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const cacheKey = `client-stats:${req.user.id}:${req.params.id}`;
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return new SuccessResponse(
        'Client stats fetched successfully',
        cached as object,
      ).send(res);
    }
    const stats = await ClientRepo.getStats(req.params.id, req.user.id);
    if (!stats) throw new NotFoundError('Client not found');
    const payload = { stats };
    await CacheService.set(cacheKey, payload, 300);
    new SuccessResponse('Client stats fetched successfully', payload).send(res);
  }),
);

/**
 * GET /api/v1/clients/:id/health
 * Get client health score
 */
router.get(
  '/:id/health',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const cacheKey = `client-health:${req.user.id}:${req.params.id}`;
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return new SuccessResponse(
        'Client health fetched successfully',
        cached as object,
      ).send(res);
    }
    const health = await ClientRepo.getHealth(req.params.id, req.user.id);
    if (!health) throw new NotFoundError('Client not found');
    const payload = { health };
    await CacheService.set(cacheKey, payload, 300);
    new SuccessResponse('Client health fetched successfully', payload).send(
      res,
    );
  }),
);

/**
 * GET /api/v1/clients/export/csv
 * Export all clients to CSV
 */
router.get(
  '/export/csv',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const clients = await ClientRepo.findAllForExport(req.user.id);

    const csv = convertToCSV(clients);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=clients.csv');
    res.send(csv);
  }),
);

export default router;
