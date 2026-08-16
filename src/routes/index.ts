import express from 'express';
import apikey from '../auth/apikey';
import asyncHandler from '../helpers/asyncHandler';
import permission from '../helpers/permission';
import InvoiceRepo from '../database/repository/InvoicesRepo';
import { NotFoundError } from '../core/ApiError';
import { SuccessResponse } from '../core/ApiResponse';
import { Permission } from '../database/types';
import signup from './auth/signup';
import login from './auth/login';
import logout from './auth/logout';
import token from './auth/token';
import credential from './auth/credential';
import profile from './profile';
import forgotPassword from './auth/forgot-password';
import resetPassword from './auth/reset-password';
import emailVerification from './auth/emailVerification';
import oauth from './auth/oauth';
import onboarding from './onboarding';
import clients from './clients';
import proposals from './proposals';
import contracts from './contracts';
import projects from './projects';
import invoices from './invoices';
import expenses from './expenses';
import payments from './payments';
import stripeWebhook from './webhooks/stripe';
import dashboard from './dashboard';
import pricing from './pricing';
import portfolio from './portfolio';
import publicPortfolioLink from './portfolio/public';
import uploadRoutes from './upload';
import settings from './settings';
import subscription from './subscription';
import milestones from './milestone';
import admin from './admin';
import feedback from './feedback';
import stripeSubscriptionWebhook from './webhooks/stripe-subscription';
import publicRouter from './public';

const router = express.Router();

router.use('/webhooks', stripeWebhook);
router.use('/webhooks', stripeSubscriptionWebhook);

// OAuth routes are PUBLIC — mount BEFORE apikey (no API key required for redirects)
router.use('/auth/oauth', oauth);

// Public portfolio — unauthenticated, mount BEFORE apikey (GET /p/:slug)
router.use('/p', publicPortfolioLink);

// Public endpoints — no auth required
router.use('/public', publicRouter);

// Public invoice endpoint — no API key required, used by /pay page
router.get(
  '/invoices/:id/public',
  asyncHandler(async (req, res) => {
    const invoice = await InvoiceRepo.findByIdPublic(req.params.id);
    if (!invoice) throw new NotFoundError('Invoice not found');

    new SuccessResponse('Invoice fetched successfully', {
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        total: invoice.total,
        currency: invoice.currency,
        dueDate: invoice.dueDate,
        issueDate: invoice.issueDate,
        businessName: invoice.user?.businessName || invoice.user?.name || null,
        client: { companyName: invoice.client?.companyName },
      },
    }).send(res);
  }),
);

/*---------------------------------------------------------*/
router.use(apikey);
/*---------------------------------------------------------*/
/*---------------------------------------------------------*/
router.use(permission(Permission.GENERAL));
/*---------------------------------------------------------*/
router.use('/signup', signup);
router.use('/login', login);
router.use('/logout', logout);
router.use('/refresh', token);
router.use('/credential', credential);
router.use('/profile', profile);
router.use('/', emailVerification);
router.use('/forgot-password', forgotPassword);
router.use('/reset-password', resetPassword);
router.use('/onboarding', onboarding);
router.use('/clients', clients);
router.use('/proposals', proposals);
router.use('/contracts', contracts);
router.use('/projects', projects);
router.use('/invoices', invoices);
router.use('/expenses', expenses);
router.use('/payments', payments);
router.use('/dashboard', dashboard);
router.use('/pricing', pricing);
router.use('/portfolio', portfolio);
router.use('/upload', uploadRoutes);
router.use('/settings', settings);
router.use('/subscription', subscription);
router.use('/', milestones);
router.use('/feedback', feedback);
router.use('/admin', admin);

export default router;
