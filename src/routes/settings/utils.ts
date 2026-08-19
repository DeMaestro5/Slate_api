import Stripe from 'stripe';

/**
 * Get Stripe client
 */
export function getStripeClient(): Stripe | null {
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

  if (!stripeSecretKey) {
    return null;
  }

  return new Stripe(stripeSecretKey);
}

/**
 * Create Stripe Connect account link
 */
export async function createStripeConnectLink(
  accountId: string,
): Promise<string> {
  const stripe = getStripeClient();

  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    return_url: `${process.env.FRONTEND_URL}/settings?stripe=complete`,
    refresh_url: `${process.env.FRONTEND_URL}/settings?stripe=refresh`,
    type: 'account_onboarding',
  });

  return accountLink.url;
}

/**
 * Create Stripe Connect account
 */
export async function createStripeConnectAccount(
  email: string,
  businessName?: string,
): Promise<string> {
  const stripe = getStripeClient();

  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const account = await stripe.accounts.create({
    type: 'express',
    email,
    business_type: 'individual',
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    ...(businessName && {
      business_profile: {
        name: businessName,
      },
    }),
  });

  return account.id;
}

/**
 * Get Stripe Connect account status
 */
export async function getStripeAccountStatus(accountId: string) {
  const stripe = getStripeClient();

  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  const account = await stripe.accounts.retrieve(accountId);

  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

/**
 * Disconnect Stripe Connect account
 */
export async function disconnectStripeAccount(
  accountId: string,
): Promise<void> {
  const stripe = getStripeClient();

  if (!stripe) {
    throw new Error('Stripe is not configured');
  }

  await stripe.accounts.del(accountId);
}

/**
 * Format settings for response
 */
export function formatSettings(settings: any) {
  // Helper to get display payment terms
  const getPaymentTermsDisplay = () => {
    if (
      settings.defaultPaymentTerms === 'CUSTOM' &&
      settings.defaultPaymentTermsCustom
    ) {
      return settings.defaultPaymentTermsCustom;
    }
    // Convert enum to readable format
    const termMap: Record<string, string> = {
      NET_15: 'Net 15',
      NET_30: 'Net 30',
      NET_60: 'Net 60',
      DUE_ON_RECEIPT: 'Due on Receipt',
    };
    return (
      termMap[settings.defaultPaymentTerms] || settings.defaultPaymentTerms
    );
  };

  return {
    profile: {
      name: settings.name,
      email: settings.email,
      profilePicUrl: settings.profilePicUrl,
      timezone: settings.timezone,
      dateFormat: settings.dateFormat,
      language: settings.language,
      portfolioSlug:
        settings.portfolioSlug ??
        (settings.name
          ? settings.name
              .toLowerCase()
              .trim()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
          : ''),
      portfolioTitle: settings.portfolioTitle,
      portfolioBio: settings.portfolioBio,
      portfolioLocation: settings.portfolioLocation,
      portfolioTemplate: settings.portfolioTemplate ?? 'classic',
      isAvailable: settings.isAvailable,
      linkedinUrl: settings.linkedinUrl,
      twitterUrl: settings.twitterUrl,
      githubUrl: settings.githubUrl,
      averageHourlyRate:
        settings.averageHourlyRate != null
          ? Number(settings.averageHourlyRate)
          : null,
      industry: settings.industry,
      experienceLevel: settings.experienceLevel,
      yearsOfExperience: settings.yearsOfExperience,
      toolsAndSkills: settings.toolsAndSkills,
      clientTypes: settings.clientTypes,
      negotiationPosture: settings.negotiationPosture,
      averageProjectValue: settings.averageProjectValue,
      clientMarket: settings.clientMarket,
      biggestChallenge: settings.biggestChallenge,
    },
    business: {
      businessName: settings.businessName,
      businessAddress: settings.businessAddress,
      businessCity: settings.businessCity,
      businessState: settings.businessState,
      businessZipCode: settings.businessZipCode,
      businessCountry: settings.businessCountry,
      businessPhone: settings.businessPhone,
      businessEmail: settings.businessEmail,
      businessWebsite: settings.businessWebsite,
      taxId: settings.taxId,
      businessLogo: settings.businessLogo,
    },
    invoiceDefaults: {
      defaultCurrency: settings.defaultCurrency,
      defaultPaymentTerms: settings.defaultPaymentTerms,
      defaultPaymentTermsCustom: settings.defaultPaymentTermsCustom, // ← ADD THIS
      paymentTermsDisplay: getPaymentTermsDisplay(), // ← ADD THIS (user-friendly)
      defaultInvoiceNotes: settings.defaultInvoiceNotes,
      defaultInvoiceTerms: settings.defaultInvoiceTerms,
      defaultTaxRate: settings.defaultTaxRate
        ? Number(settings.defaultTaxRate)
        : null,
      invoiceNumberPrefix: settings.invoiceNumberPrefix,
      nextInvoiceNumber: settings.nextInvoiceNumber,
    },
    stripe: {
      stripeAccountId: settings.stripeAccountId,
      stripeAccountStatus: settings.stripeAccountStatus,
      stripeOnboardingComplete: settings.stripeOnboardingComplete,
      stripeChargesEnabled: settings.stripeChargesEnabled,
      stripePayoutsEnabled: settings.stripePayoutsEnabled,
      stripeConnectedAt: settings.stripeConnectedAt,
      isConnected: !!settings.stripeAccountId,
    },
  };
}
