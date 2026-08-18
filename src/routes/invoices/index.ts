import express from 'express';
import { SuccessResponse } from '../../core/ApiResponse';
import { CacheService } from '../../cache/CacheService';
import { CacheKeys, TTL } from '../../cache/keys';
import InvoiceRepo from '../../database/repository/InvoicesRepo';
import ClientRepo from '../../database/repository/ClientRepo';
import ProjectRepo from '../../database/repository/ProjectRepo';
import { checkUsageLimit } from '../../middleware/subscription-check';
import {
  BadRequestError,
  InternalError,
  NotFoundError,
} from '../../core/ApiError';
import validator from '../../helpers/validator';
import schema from './schema';
import asyncHandler from '../../helpers/asyncHandler';
import {
  getInvoiceData,
  calculateInvoiceTotals,
  generateInvoiceHTML,
  calculateDaysOverdue,
} from './utils';
import { ProtectedRequest } from '../../types/app-request';
import authentication from '../../auth/authentication';
import {
  EmailStatus,
  EmailType,
  InvoiceStatus,
  PaymentMethod,
} from '@prisma/client';
import PaymentRepo from '../../database/repository/PaymentRepo';
import paymentLink from './payment-link';
import { generatePdf } from '../../services/pdf';
import { sendEmail } from '../../services/Email.service';
import { logEmail } from '../../services/emailLog';
import SettingsRepo from '../../database/repository/SettingsRepo';

const router = express.Router();

/*---------------------------------------------------------*/
// All routes below require authentication
router.use(authentication);
/*---------------------------------------------------------*/

router.use('/', paymentLink);

/**
 * GET /api/v1/invoices/overdue
 * Get overdue invoices
 * IMPORTANT: Must be before /:id route
 */
router.get(
  '/overdue',
  asyncHandler(async (req: ProtectedRequest, res) => {
    // Update overdue statuses first
    await InvoiceRepo.updateOverdueStatus(req.user.id);

    // Get all overdue invoices
    const invoices = await InvoiceRepo.findOverdue(req.user.id);

    // Add days overdue to each invoice
    const invoicesWithDays = invoices.map((invoice) => ({
      ...getInvoiceData(invoice),
      daysOverdue: calculateDaysOverdue(invoice.dueDate),
    }));

    new SuccessResponse('Overdue invoices fetched successfully', {
      invoices: invoicesWithDays,
      total: invoices.length,
    }).send(res);
  }),
);

/**
 * GET /api/v1/invoices
 * Get all invoices for authenticated user with pagination
 */
router.get(
  '/',
  validator(schema.pagination),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = (req.query.status as InvoiceStatus) || undefined;
    const search = (req.query.search as string) || undefined;

    const cacheKey = CacheKeys.invoiceList(
      userId,
      page,
      limit,
      status || '',
      search || '',
    );
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return new SuccessResponse(
        'Invoices fetched successfully',
        cached as object,
      ).send(res);
    }

    const skip = (page - 1) * limit;

    const [invoices, total] = await Promise.all([
      InvoiceRepo.findAllByUser(userId, skip, limit, status, search),
      InvoiceRepo.countByUser(userId, status, search),
    ]);

    const totalPages = Math.ceil(total / limit);

    const payload = {
      invoices: invoices.map(getInvoiceData),
      pagination: { page, limit, total, totalPages },
    };
    await CacheService.set(cacheKey, payload, TTL.LIST);

    new SuccessResponse('Invoices fetched successfully', payload).send(res);
  }),
);

/**
 * POST /api/v1/invoices
 * Create new invoice
 */
router.post(
  '/',
  checkUsageLimit('invoices'),
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
    }

    // If projectId provided, verify it belongs to user
    if (req.body.projectId) {
      const projectExists = await ProjectRepo.existsForUser(
        req.body.projectId,
        req.user.id,
      );
      if (!projectExists) {
        throw new BadRequestError('Project not found');
      }
    }

    // Calculate totals
    const totals = calculateInvoiceTotals(
      req.body.lineItems,
      req.body.taxRate || 0,
    );

    // Generate invoice number
    const invoiceNumber = await InvoiceRepo.generateInvoiceNumber(req.user.id);

    // Convert dates
    const issueDate = new Date(req.body.issueDate);
    const dueDate = new Date(req.body.dueDate);

    const invoice = await InvoiceRepo.create({
      userId: req.user.id,
      clientId: req.body.clientId || null,
      projectId: req.body.projectId || null,
      invoiceNumber,
      issueDate,
      dueDate,
      subtotal: totals.subtotal,
      taxRate: req.body.taxRate || 0,
      taxAmount: totals.taxAmount,
      total: totals.total,
      currency: req.body.currency || 'USD',
      notes: req.body.notes,
      terms: req.body.terms,
      lineItems: req.body.lineItems,
    });

    await CacheService.invalidatePattern(
      CacheKeys.userInvoicesPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);

    new SuccessResponse('Invoice created successfully', {
      invoice: getInvoiceData(invoice),
    }).send(res);
  }),
);

/**
 * GET /api/v1/invoices/:id
 * Get single invoice by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const cacheKey = `invoice:${req.user.id}:${req.params.id}`;
    const cached = await CacheService.get(cacheKey);
    if (cached) {
      return new SuccessResponse('Invoice fetched', cached as object).send(res);
    }

    const invoice = await InvoiceRepo.findById(req.params.id, req.user.id);
    if (!invoice) throw new NotFoundError('Invoice not found');

    const payload = { invoice: getInvoiceData(invoice) };
    await CacheService.set(cacheKey, payload, 300); // 5 min TTL
    new SuccessResponse('Invoice fetched', payload).send(res);
  }),
);

/**
 * PUT /api/v1/invoices/:id
 * Update invoice
 */
router.put(
  '/:id',
  validator(schema.update),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const exists = await InvoiceRepo.existsForUser(req.params.id, req.user.id);
    if (!exists) {
      throw new NotFoundError('Invoice not found');
    }

    // Recalculate totals if line items provided
    const updateData: any = { ...req.body };

    if (req.body.lineItems) {
      const totals = calculateInvoiceTotals(
        req.body.lineItems,
        req.body.taxRate || 0,
      );
      updateData.subtotal = totals.subtotal;
      updateData.taxAmount = totals.taxAmount;
      updateData.total = totals.total;
    }

    // Convert dates if provided
    if (updateData.issueDate) {
      updateData.issueDate = new Date(updateData.issueDate);
    }
    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate);
    }

    const invoice = await InvoiceRepo.update(
      req.params.id,
      req.user.id,
      updateData,
    );

    await CacheService.invalidatePattern(
      CacheKeys.userInvoicesPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);
    await CacheService.del(`invoice:${req.user.id}:${req.params.id}`);

    new SuccessResponse('Invoice updated successfully', {
      invoice: getInvoiceData(invoice),
    }).send(res);
  }),
);

/**
 * DELETE /api/v1/invoices/:id
 * Delete invoice
 */
router.delete(
  '/:id',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const exists = await InvoiceRepo.existsForUser(req.params.id, req.user.id);
    if (!exists) {
      throw new NotFoundError('Invoice not found');
    }

    await InvoiceRepo.remove(req.params.id, req.user.id);

    await CacheService.invalidatePattern(
      CacheKeys.userInvoicesPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);
    await CacheService.del(`invoice:${req.user.id}:${req.params.id}`);

    new SuccessResponse('Invoice deleted successfully', {}).send(res);
  }),
);

/**
 * POST /api/v1/invoices/:id/send
 * Mark invoice as sent and send to client
 */
router.post(
  '/:id/send',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const invoice = await InvoiceRepo.findById(req.params.id, req.user.id);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestError('Only draft invoices can be sent');
    }

    if (!invoice.client.email) {
      throw new BadRequestError('Client does not have an email address');
    }

    // Mark as sent
    const updatedInvoice = await InvoiceRepo.markAsSent(
      req.params.id,
      req.user.id,
    );

    const clientEmail = invoice.client!.email!;
    let emailSent = false;
    let emailError: string | undefined;

    const senderName =
      (req.user as any).businessName ||
      req.user.name ||
      'Your service provider';
    const formattedTotal = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: invoice.currency,
    }).format(Number(invoice.total));
    const formattedDueDate = new Date(invoice.dueDate).toLocaleDateString(
      'en-US',
      {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      },
    );

    // Generate PDF — optional, email sends without it
    let pdfBuffer: Buffer | null = null;
    try {
      const htmlContent = generateInvoiceHTML(
        { ...invoice, status: updatedInvoice.status },
        req.user,
      );
      pdfBuffer = await generatePdf({
        html: htmlContent,
        filename: `invoice-${invoice.invoiceNumber}.pdf`,
      });
    } catch {
      // PDF failure does not block email
    }

    // Generate payment link — optional, email sends without it
    let paymentLinkUrl: string | null = null;
    try {
      const { createStripePaymentIntent, generatePaymentLink } = await import(
        '../payments/utils'
      );
      const stripeSettings = await SettingsRepo.getStripeSettings(req.user.id);
      if (
        stripeSettings?.stripeAccountId &&
        stripeSettings.stripeChargesEnabled
      ) {
        const paymentIntent = await createStripePaymentIntent(
          Number(invoice.total),
          invoice.currency,
          invoice.id,
          invoice.client.email,
          req.user.id,
        );
        paymentLinkUrl = generatePaymentLink(
          invoice.id,
          paymentIntent.client_secret!,
        );
      }
    } catch {
      // Payment link failure does not block email
    }

    const subject = `Invoice ${invoice.invoiceNumber} from ${senderName}`;

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f9fafb;">
  <div style="background:#fff;padding:40px;border-radius:12px;border:1px solid #e5e7eb;">
    <div style="margin-bottom:28px;">
      <span style="font-size:22px;font-weight:900;color:#111827;">nov</span><span style="font-size:22px;font-weight:900;color:#ea580c;">ba</span>
    </div>
    <h1 style="color:#111827;margin:0 0 8px 0;font-size:22px;">Invoice ${
      invoice.invoiceNumber
    }</h1>
    <p style="color:#6b7280;margin:0 0 28px 0;font-size:15px;">From ${senderName}</p>
    <p style="color:#374151;margin:0 0 20px 0;font-size:15px;">Hi ${
      invoice.client.contactName || invoice.client.companyName
    },</p>
    <p style="color:#374151;margin:0 0 24px 0;font-size:15px;">Please find your invoice${
      pdfBuffer ? ' attached' : ' below'
    }. Here's a summary:</p>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:28px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
        <span style="color:#6b7280;font-size:13px;">Invoice</span>
        <span style="color:#111827;font-weight:700;font-size:13px;">${
          invoice.invoiceNumber
        }</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
        <span style="color:#6b7280;font-size:13px;">Amount due</span>
        <span style="color:#ea580c;font-weight:700;font-size:15px;">${formattedTotal}</span>
      </div>
      <div style="display:flex;justify-content:space-between;">
        <span style="color:#6b7280;font-size:13px;">Due date</span>
        <span style="color:#111827;font-weight:700;font-size:13px;">${formattedDueDate}</span>
      </div>
    </div>
    ${
      paymentLinkUrl
        ? `
    <div style="text-align:center;margin:0 0 28px 0;">
      <a href="${paymentLinkUrl}" style="display:inline-block;background-color:#ea580c;color:#fff;text-decoration:none;padding:14px 36px;border-radius:10px;font-weight:700;font-size:15px;">
        Pay Now →
      </a>
      <p style="color:#9ca3af;font-size:12px;margin:10px 0 0 0;">Secure payment powered by Stripe</p>
    </div>
    `
        : ''
    }
    <p style="color:#9ca3af;font-size:12px;margin:24px 0 0 0;border-top:1px solid #f3f4f6;padding-top:16px;">
      ${
        pdfBuffer ? 'The full invoice is attached as a PDF. ' : ''
      }If you have any questions, reply to this email.
    </p>
  </div>
</body>
</html>
`;

    try {
      emailSent = await sendEmail({
        to: clientEmail,
        subject,
        html,
        ...(pdfBuffer
          ? {
              attachments: [
                {
                  filename: `invoice-${invoice.invoiceNumber}.pdf`,
                  content: pdfBuffer,
                },
              ],
            }
          : {}),
      });
      if (!emailSent) emailError = 'Email provider did not confirm send';
    } catch (err) {
      emailError = err instanceof Error ? err.message : 'Send failed';
    }

    await logEmail({
      userId: req.user.id,
      recipient: clientEmail,
      subject: `Invoice ${invoice.invoiceNumber}`,
      type: EmailType.INVOICE_SENT,
      status: emailSent ? EmailStatus.SENT : EmailStatus.FAILED,
      invoiceId: invoice.id,
      sentAt: emailSent ? new Date() : undefined,
      error: emailError ?? undefined,
    });

    await CacheService.invalidatePattern(
      CacheKeys.userInvoicesPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);
    await CacheService.del(`invoice:${req.user.id}:${req.params.id}`);

    new SuccessResponse('Invoice sent successfully', {
      invoice: getInvoiceData(updatedInvoice),
    }).send(res);
  }),
);

/**
 * POST /invoices/:id/schedule
 * Schedule a DRAFT invoice to be sent at a future date/time
 */
router.post(
  '/:id/schedule',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const { scheduledSendAt } = req.body;

    if (!scheduledSendAt) {
      throw new BadRequestError('scheduledSendAt is required');
    }

    const sendAt = new Date(scheduledSendAt);
    if (isNaN(sendAt.getTime())) {
      throw new BadRequestError('scheduledSendAt must be a valid date');
    }

    if (sendAt <= new Date()) {
      throw new BadRequestError('scheduledSendAt must be in the future');
    }

    const invoice = await InvoiceRepo.findById(req.params.id, req.user.id);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BadRequestError('Only DRAFT invoices can be scheduled');
    }

    if (!invoice.client.email) {
      throw new BadRequestError('Client does not have an email address');
    }

    const updated = await InvoiceRepo.update(req.params.id, req.user.id, {
      scheduledSendAt: sendAt,
    });

    await CacheService.invalidatePattern(
      CacheKeys.userInvoicesPattern(req.user.id),
    );
    await CacheService.del(`invoice:${req.user.id}:${req.params.id}`);
    new SuccessResponse('Invoice scheduled successfully', {
      invoice: getInvoiceData(updated),
    }).send(res);
  }),
);

/**
 * DELETE /invoices/:id/schedule
 * Cancel a scheduled send — clears scheduledSendAt, invoice stays DRAFT
 */
router.delete(
  '/:id/schedule',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const invoice = await InvoiceRepo.findById(req.params.id, req.user.id);
    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    if (!invoice.scheduledSendAt) {
      throw new BadRequestError('This invoice has no scheduled send');
    }

    const updated = await InvoiceRepo.update(req.params.id, req.user.id, {
      scheduledSendAt: null,
    });

    await CacheService.invalidatePattern(
      CacheKeys.userInvoicesPattern(req.user.id),
    );
    await CacheService.del(`invoice:${req.user.id}:${req.params.id}`);

    new SuccessResponse('Schedule cancelled successfully', {
      invoice: getInvoiceData(updated),
    }).send(res);
  }),
);

/**
 * POST /api/v1/invoices/:id/duplicate
 * Duplicate an existing invoice
 */
router.post(
  '/:id/duplicate',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const exists = await InvoiceRepo.existsForUser(req.params.id, req.user.id);
    if (!exists) {
      throw new NotFoundError('Invoice not found');
    }

    // Generate new invoice number
    const newInvoiceNumber = await InvoiceRepo.generateInvoiceNumber(
      req.user.id,
    );

    // Set new dates (issue date = today, due date = 30 days from today)
    const newIssueDate = new Date();
    const newDueDate = new Date();
    newDueDate.setDate(newDueDate.getDate() + 30);

    const duplicatedInvoice = await InvoiceRepo.duplicate(
      req.params.id,
      req.user.id,
      newInvoiceNumber,
      newIssueDate,
      newDueDate,
    );

    await CacheService.invalidatePattern(
      CacheKeys.userInvoicesPattern(req.user.id),
    );
    await CacheService.del(`invoice:${req.user.id}:${req.params.id}`);

    new SuccessResponse('Invoice duplicated successfully', {
      invoice: getInvoiceData(duplicatedInvoice),
    }).send(res);
  }),
);

/**
 * PATCH /api/v1/invoices/:id/status
 * Update invoice status
 */
router.patch(
  '/:id/status',
  validator(schema.updateStatus),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const invoice = await InvoiceRepo.findById(req.params.id, req.user.id);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    const additionalData: any = {};

    // If marking as paid, set paidAt
    if (req.body.status === InvoiceStatus.PAID) {
      additionalData.paidAt = new Date();
    }

    const updatedInvoice = await InvoiceRepo.updateStatus(
      req.params.id,
      req.user.id,
      req.body.status,
      additionalData,
    );

    await CacheService.invalidatePattern(
      CacheKeys.userInvoicesPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);
    await CacheService.del(`invoice:${req.user.id}:${req.params.id}`);

    new SuccessResponse('Invoice status updated successfully', {
      invoice: getInvoiceData(updatedInvoice),
    }).send(res);
  }),
);

/**
 * GET /invoices/:id/pdf
 * Return invoice as PDF (same template as email attachment; one canonical document).
 */
router.get(
  '/:id/pdf',
  asyncHandler(async (req: ProtectedRequest, res) => {
    const invoice = await InvoiceRepo.findById(req.params.id, req.user.id);

    if (!invoice) {
      throw new NotFoundError('Invoice not found');
    }

    const htmlContent = generateInvoiceHTML(invoice, req.user);
    const pdfBuffer = await generatePdf({
      html: htmlContent,
      filename: `invoice-${invoice.invoiceNumber}.pdf`,
    });

    if (!pdfBuffer) {
      throw new InternalError('Failed to generate PDF');
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`,
    );
    res.send(pdfBuffer);
  }),
);

/**
 * POST /api/v1/invoices/batch-send
 * Send multiple invoices at once
 */
router.post(
  '/batch-send',
  validator(schema.batchSend),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const invoices = await InvoiceRepo.findByIds(
      req.body.invoiceIds,
      req.user.id,
    );

    if (invoices.length === 0) {
      throw new NotFoundError('No invoices found');
    }

    // Validate all invoices can be sent
    const invalidInvoices = invoices.filter(
      (inv) => inv.status !== InvoiceStatus.DRAFT || !inv.client.email,
    );

    if (invalidInvoices.length > 0) {
      throw new BadRequestError(
        `Cannot send ${invalidInvoices.length} invoice(s). They must be in DRAFT status and have client email.`,
      );
    }

    const sentInvoices: Array<ReturnType<typeof getInvoiceData>> = [];
    const results: Array<{ invoiceId: string; sent: boolean; error?: string }> =
      [];

    for (const invoice of invoices) {
      const sent = await InvoiceRepo.markAsSent(invoice.id, req.user.id);
      sentInvoices.push(getInvoiceData(sent));

      const clientEmail = invoice.client!.email!;
      let emailSent = false;
      let emailError: string | undefined;
      try {
        const htmlContent = generateInvoiceHTML(invoice, req.user);
        const pdfBuffer = await generatePdf({
          html: htmlContent,
          filename: `invoice-${invoice.invoiceNumber}.pdf`,
        });
        if (pdfBuffer) {
          const subject = `Invoice ${invoice.invoiceNumber} from ${
            req.user.name || 'Us'
          }`;
          emailSent = await sendEmail({
            to: clientEmail,
            subject,
            html: '<p>Please find your invoice attached.</p>',
            attachments: [
              {
                filename: `invoice-${invoice.invoiceNumber}.pdf`,
                content: pdfBuffer,
              },
            ],
          });
          if (!emailSent) emailError = 'Email provider did not confirm send';
        } else {
          emailError = 'PDF generation failed';
        }
      } catch (err) {
        emailError = err instanceof Error ? err.message : 'Send failed';
      }

      await logEmail({
        userId: req.user.id,
        recipient: clientEmail,
        subject: `Invoice ${invoice.invoiceNumber}`,
        type: EmailType.INVOICE_SENT,
        status: emailSent ? EmailStatus.SENT : EmailStatus.FAILED,
        invoiceId: invoice.id,
        sentAt: emailSent ? new Date() : undefined,
        error: emailError ?? undefined,
      });

      results.push({
        invoiceId: invoice.id,
        sent: emailSent,
        ...(emailError && { error: emailError }),
      });
    }

    await CacheService.invalidatePattern(
      CacheKeys.userInvoicesPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);
    await CacheService.del(`invoice:${req.user.id}:${req.params.id}`);

    new SuccessResponse('Invoices sent successfully', {
      count: sentInvoices.length,
      invoices: sentInvoices,
      results,
    }).send(res);
  }),
);

/**
 * POST /api/v1/invoices/:id/mark-paid
 * Record a payment and update invoice status
 */
router.post(
  '/:id/mark-paid',
  validator(schema.markPaid),
  asyncHandler(async (req: ProtectedRequest, res) => {
    const invoice = await InvoiceRepo.findById(req.params.id, req.user.id);
    if (!invoice) throw new NotFoundError('Invoice not found');

    if (
      invoice.status === InvoiceStatus.PAID ||
      invoice.status === InvoiceStatus.CANCELLED
    ) {
      throw new BadRequestError(
        `Invoice is already ${invoice.status.toLowerCase()}`,
      );
    }

    const { amount, paymentMethod, paidAt, notes } = req.body;

    if (amount > Number(invoice.total)) {
      throw new BadRequestError('Payment amount cannot exceed invoice total');
    }

    await PaymentRepo.create({
      invoiceId: invoice.id,
      userId: req.user.id,
      amount,
      currency: invoice.currency,
      paymentMethod: paymentMethod as PaymentMethod,
      status: 'COMPLETED',
      paidAt: new Date(paidAt),
      notes,
    });

    const totalPaid = await PaymentRepo.getTotalPaidForInvoice(invoice.id);

    let updatedInvoice;
    if (totalPaid >= Number(invoice.total)) {
      updatedInvoice = await InvoiceRepo.updateStatus(
        invoice.id,
        req.user.id,
        InvoiceStatus.PAID,
        { paidAt: new Date(paidAt) },
      );
    } else if (totalPaid > 0) {
      updatedInvoice = await InvoiceRepo.updateStatus(
        invoice.id,
        req.user.id,
        InvoiceStatus.PARTIALLY_PAID,
      );
    } else {
      updatedInvoice = invoice;
    }

    await CacheService.invalidatePattern(
      CacheKeys.userInvoicesPattern(req.user.id),
    );
    await CacheService.invalidateUserDashboard(req.user.id);

    new SuccessResponse('Invoice payment recorded successfully', {
      invoice: getInvoiceData(updatedInvoice),
    }).send(res);
  }),
);

export default router;
