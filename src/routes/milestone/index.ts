import express from 'express';
import authentication from '../../auth/authentication';
import validator from '../../helpers/validator';
import schema from './schema';
import asyncHandler from '../../helpers/asyncHandler';
import { ProtectedRequest } from '../../types/app-request';
import ProjectRepo from '../../database/repository/ProjectRepo';
import { NotFoundError } from '../../core/ApiError';
import MilestoneRepo from '../../database/repository/MilestoneRepo';
import { SuccessResponse } from '../../core/ApiResponse';
import { sendReminderEmail } from '../../services/Email.service';
import { logEmail } from '../../services/emailLog';
import { EmailStatus, EmailType } from '@prisma/client';
import Logger from '../../core/Logger';

const router = express.Router();
router.use(authentication);

//List of milestones for projects
router.get(
  '/projects/:projectId/milestones',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const project = await ProjectRepo.existsForUser(
      req.params.projectId,
      req.user.id,
    );
    if (!project) throw new NotFoundError('Project not found');

    const milestone = await MilestoneRepo.findByProjectId(req.params.projectId);
    new SuccessResponse('Milestone retrieved', { milestone }).send(res);
  }),
);

// Create a milestone on a project
router.post(
  '/projects/:projectId/milestones',
  validator(schema.create),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const project = await ProjectRepo.existsForUser(
      req.params.projectId,
      req.user.id,
    );
    if (!project) throw new NotFoundError('Project not found');

    const existing = await MilestoneRepo.findByProjectId(req.params.projectId);
    const milestone = await MilestoneRepo.create(req.params.projectId, {
      name: req.body.name,
      amount: req.body.amount,
      order: existing.length,
      dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      invoiceId: req.body.invoiceId ?? null,
    });

    new SuccessResponse('Milestone created', { milestone }).send(res);
  }),
);

// update a milestone

router.put(
  '/milestones/:id',
  validator(schema.update),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const owns = await MilestoneRepo.existsForUser(req.params.id, req.user.id);
    if (!owns) throw new NotFoundError('Milestone not found');

    const milestone = await MilestoneRepo.update(req.params.id, {
      ...(req.body.name !== undefined && { name: req.body.name }),
      ...(req.body.amount !== undefined && { amount: req.body.amount }),
      ...(req.body.dueDate !== undefined && {
        dueDate: req.body.dueDate ? new Date(req.body.dueDate) : null,
      }),
      ...(req.body.invoiceId !== undefined && {
        invoiceId: req.body.invoiceId,
      }),
    });
    new SuccessResponse('Milestone updates', { milestone }).send(res);
  }),
);

//delete a milestone
router.delete(
  '/milestone/:id',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const owns = await MilestoneRepo.existsForUser(req.params.id, req.user.id);
    if (!owns) throw new NotFoundError('Milestone not found');
    await MilestoneRepo.remove(req.params.id);
    new SuccessResponse('Milestone deleted', {}).send(res);
  }),
);

// mark milestone complete - fires a reminder email IF an invoice is linked

router.patch(
  '/milestone/:id/complete',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const owns = await MilestoneRepo.existsForUser(req.body.id, req.user.id);
    if (!owns) throw new NotFoundError('Milestone not found');
    const milestone = await MilestoneRepo.markComplete(req.params.id);
    const full = await MilestoneRepo.findById(milestone.id);

    let emailSent = false;

    if (full?.invoice && full.invoice.client?.email) {
      try {
        emailSent = await sendReminderEmail(
          full.invoice.client.email,
          full.invoice.client.contactName || full.invoice.client.companyName,
          full.invoice.invoiceNumber,
          new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: full.invoice.currency,
          }).format(Number(full.invoice.total)),
          full.invoice.dueDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          }),
          0, // treated as 'due now' - milestone reached
        );

        await logEmail({
          userId: req.user.id,
          recipient: full.invoice.client.email,
          subject: `Milestone reached: ${milestone.name}`,
          type: EmailType.REMINDER,
          status: emailSent ? EmailStatus.SENT : EmailStatus.FAILED,
          invoiceId: full.invoice.id,
          sentAt: emailSent ? new Date() : undefined,
        });
      } catch (error) {
        Logger.error('[Milestone] reminder email failed', {
          error,
          milestoneId: milestone.id,
        });
      }
    } else {
      Logger.info(
        '[Milestone] completed with no linked invoice - no reminder sent',
      ),
        {
          milestoneId: milestone.id,
        };
    }

    new SuccessResponse('Milestone marked complete', {
      milestone,
      emailSent,
    }).send(res);
  }),
);

export default router;
