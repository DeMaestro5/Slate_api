import prisma from '../index';
import {
  NegotiationPosture,
  Prisma,
  ProjectValueRange,
  ClientType,
} from '@prisma/client';

export interface ProfileSettings {
  name?: string;
  email?: string;
  profilePicUrl?: string;
  timezone?: string;
  dateFormat?: string;
  language?: string;
  portfolioSlug?: string | null;
  portfolioTitle?: string | null;
  portfolioBio?: string | null;
  portfolioLocation?: string | null;
  isAvailable?: boolean;
  linkedinUrl?: string | null;
  twitterUrl?: string | null;
  githubUrl?: string | null;
  industry?: string | null;
  experienceLevel?: string | null;
  yearsOfExperience?: number | null;
  toolsAndSkills?: string[];
  clientTypes?: ClientType[];
  negotiationPosture?: NegotiationPosture | null;
  averageProjectValue?: ProjectValueRange | null;
  clientMarket?: string | null;
  biggestChallenge?: string | null;
  averageHourlyRate?: number | null;
}

export interface BusinessSettings {
  businessName?: string;
  businessAddress?: string;
  businessCity?: string;
  businessState?: string;
  businessZipCode?: string;
  businessCountry?: string;
  businessPhone?: string;
  businessEmail?: string;
  businessWebsite?: string;
  taxId?: string;
  businessLogo?: string;
}

export interface InvoiceDefaults {
  defaultCurrency?: string;
  defaultPaymentTerms?: string;
  defaultPaymentTermsCustom?: string;
  defaultInvoiceNotes?: string;
  defaultInvoiceTerms?: string;
  defaultTaxRate?: number;
  invoiceNumberPrefix?: string;
  nextInvoiceNumber?: number;
}

export interface StripeSettings {
  stripeAccountId?: string;
  stripeAccountStatus?: string;
  stripeOnboardingComplete?: boolean;
  stripeChargesEnabled?: boolean;
  stripePayoutsEnabled?: boolean;
  stripeConnectedAt?: Date;
}

/**
 * Get user profile settings
 */
async function getProfileSettings(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      profilePicUrl: true,
      timezone: true,
      dateFormat: true,
      language: true,
    },
  });
}

/**
 * Get business settings
 */
async function getBusinessSettings(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      businessName: true,
      businessAddress: true,
      businessCity: true,
      businessState: true,
      businessZipCode: true,
      businessCountry: true,
      businessPhone: true,
      businessEmail: true,
      businessWebsite: true,
      taxId: true,
      businessLogo: true,
    },
  });
}

/**
 * Get invoice defaults
 */
async function getInvoiceDefaults(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      defaultCurrency: true,
      defaultPaymentTerms: true,
      defaultPaymentTermsCustom: true,
      defaultInvoiceNotes: true,
      defaultInvoiceTerms: true,
      defaultTaxRate: true,
      invoiceNumberPrefix: true,
      nextInvoiceNumber: true,
    },
  });
}

/**
 * Get Stripe settings
 */
async function getStripeSettings(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      stripeAccountId: true,
      stripeAccountStatus: true,
      stripeOnboardingComplete: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeConnectedAt: true,
    },
  });
}

/**
 * Get all settings
 */
async function getAllSettings(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      // Profile
      id: true,
      name: true,
      email: true,
      profilePicUrl: true,
      timezone: true,
      dateFormat: true,
      language: true,
      averageHourlyRate: true,
      industry: true,
      experienceLevel: true,
      yearsOfExperience: true,
      toolsAndSkills: true,
      clientTypes: true,
      negotiationPosture: true,
      averageProjectValue: true,
      clientMarket: true,
      biggestChallenge: true,
      // Portfolio
      portfolioSlug: true,
      portfolioTitle: true,
      portfolioBio: true,
      portfolioLocation: true,
      portfolioTemplate: true,
      isAvailable: true,
      linkedinUrl: true,
      twitterUrl: true,
      githubUrl: true,
      // Business
      businessName: true,
      businessAddress: true,
      businessCity: true,
      businessState: true,
      businessZipCode: true,
      businessCountry: true,
      businessPhone: true,
      businessEmail: true,
      businessWebsite: true,
      taxId: true,
      businessLogo: true,
      // Invoice Defaults
      defaultCurrency: true,
      defaultPaymentTerms: true,
      defaultPaymentTermsCustom: true,
      defaultInvoiceNotes: true,
      defaultInvoiceTerms: true,
      defaultTaxRate: true,
      invoiceNumberPrefix: true,
      nextInvoiceNumber: true,
      // Stripe
      stripeAccountId: true,
      stripeAccountStatus: true,
      stripeOnboardingComplete: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeConnectedAt: true,
    },
  });
}

/**
 * Update profile settings
 */
async function updateProfileSettings(userId: string, data: ProfileSettings) {
  // Lowercase portfolioSlug if provided
  const updateData = {
    ...data,
    ...(data.portfolioSlug !== undefined && {
      portfolioSlug: data.portfolioSlug
        ? data.portfolioSlug.toLowerCase().trim()
        : null,
    }),
  };

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      id: true,
      name: true,
      email: true,
      profilePicUrl: true,
      timezone: true,
      dateFormat: true,
      language: true,
      portfolioSlug: true,
      portfolioTitle: true,
      portfolioBio: true,
      portfolioLocation: true,
      isAvailable: true,
      linkedinUrl: true,
      twitterUrl: true,
      githubUrl: true,
      industry: true,
      experienceLevel: true,
      yearsOfExperience: true,
      toolsAndSkills: true,
      clientTypes: true,
      negotiationPosture: true,
      averageProjectValue: true,
      clientMarket: true,
      biggestChallenge: true,
      averageHourlyRate: true,
    },
  });
}

/**
 * Update business settings
 */
async function updateBusinessSettings(userId: string, data: BusinessSettings) {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      businessName: true,
      businessAddress: true,
      businessCity: true,
      businessState: true,
      businessZipCode: true,
      businessCountry: true,
      businessPhone: true,
      businessEmail: true,
      businessWebsite: true,
      taxId: true,
      businessLogo: true,
    },
  });
}

/**
 * Update invoice defaults
 */
async function updateInvoiceDefaults(userId: string, data: InvoiceDefaults) {
  // Convert defaultTaxRate to Decimal if provided
  const updateData: any = { ...data };
  if (data.defaultTaxRate !== undefined) {
    updateData.defaultTaxRate = new Prisma.Decimal(data.defaultTaxRate);
  }

  return prisma.user.update({
    where: { id: userId },
    data: updateData,
    select: {
      defaultCurrency: true,
      defaultPaymentTerms: true,
      defaultInvoiceNotes: true,
      defaultInvoiceTerms: true,
      defaultPaymentTermsCustom: true,
      defaultTaxRate: true,
      invoiceNumberPrefix: true,
      nextInvoiceNumber: true,
    },
  });
}

/**
 * Update Stripe settings
 */
async function updateStripeSettings(userId: string, data: StripeSettings) {
  return prisma.user.update({
    where: { id: userId },
    data,
    select: {
      stripeAccountId: true,
      stripeAccountStatus: true,
      stripeOnboardingComplete: true,
      stripeChargesEnabled: true,
      stripePayoutsEnabled: true,
      stripeConnectedAt: true,
    },
  });
}

/**
 * Upload/Update business logo
 */
async function updateLogo(userId: string, logoUrl: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      businessLogo: logoUrl,
    },
    select: {
      businessLogo: true,
    },
  });
}

/**
 * Delete business logo
 */
async function deleteLogo(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      businessLogo: null,
    },
    select: {
      businessLogo: true,
    },
  });
}

/**
 * Disconnect Stripe account
 */
async function disconnectStripe(userId: string) {
  return prisma.user.update({
    where: { id: userId },
    data: {
      stripeAccountId: null,
      stripeAccountStatus: null,
      stripeOnboardingComplete: false,
      stripeChargesEnabled: false,
      stripePayoutsEnabled: false,
      stripeConnectedAt: null,
    },
  });
}

export default {
  getProfileSettings,

  getBusinessSettings,
  getInvoiceDefaults,
  getStripeSettings,
  getAllSettings,
  updateProfileSettings,
  updateBusinessSettings,
  updateInvoiceDefaults,
  updateStripeSettings,
  updateLogo,
  deleteLogo,
  disconnectStripe,
};
