/**
 * All cache key templates in one place.
 * Every key is user-scoped to allow clean per-user invalidation.
 */

export const CacheKeys = {
  // Dashboard
  dashboardOverview: (userId: string, startDate: string, endDate: string) =>
    `novba:user:${userId}:dashboard:overview:${startDate}:${endDate}`,
  dashboardIncomeChart: (
    userId: string,
    startDate: string,
    endDate: string,
    groupBy: string,
  ) =>
    `novba:user:${userId}:dashboard:income:${startDate}:${endDate}:${groupBy}`,
  dashboardExpensesChart: (
    userId: string,
    startDate: string,
    endDate: string,
    groupBy: string,
  ) =>
    `novba:user:${userId}:dashboard:expenses:${startDate}:${endDate}:${groupBy}`,
  dashboardClientRevenue: (userId: string, limit: number) =>
    `novba:user:${userId}:dashboard:client-revenue:${limit}`,
  dashboardCashFlow: (userId: string, months: number) =>
    `novba:user:${userId}:dashboard:cashflow:${months}`,
  dashboardHealth: (userId: string) => `novba:user:${userId}:dashboard:health`,
  dashboardActivity: (userId: string, limit: number) =>
    `novba:user:${userId}:dashboard:activity:${limit}`,

  // Lists
  invoiceList: (
    userId: string,
    page: number,
    limit: number,
    status: string,
    search: string,
  ) => `novba:user:${userId}:invoices:${page}:${limit}:${status}:${search}`,
  clientList: (userId: string, page: number, limit: number, search: string) =>
    `novba:user:${userId}:clients:${page}:${limit}:${search}`,
  contractList: (userId: string, page: number, limit: number, status: string) =>
    `novba:user:${userId}:contracts:${page}:${limit}:${status}`,
  projectList: (userId: string, page: number, limit: number, status: string) =>
    `novba:user:${userId}:projects:${page}:${limit}:${status}`,
  proposalList: (userId: string, page: number, limit: number, status: string) =>
    `novba:user:${userId}:proposals:${page}:${limit}:${status}`,
  paymentList: (userId: string, page: number, limit: number) =>
    `novba:user:${userId}:payments:${page}:${limit}`,
  expenseList: (
    userId: string,
    page: number,
    limit: number,
    category: string,
  ) => `novba:user:${userId}:expenses:${page}:${limit}:${category}`,
  portfolioList: (userId: string, page: number, limit: number) =>
    `novba:user:${userId}:portfolio:${page}:${limit}`,

  // Settings
  settingsProfile: (userId: string) => `novba:user:${userId}:settings:profile`,

  clientProjectsPattern: (userId: string, clientId: string) =>
    `novba:user:${userId}:client:${clientId}:projects:*`,

  // Pattern for invalidating all client project caches across all clients for a user
  userClientProjectsPattern: (userId: string) =>
    `novba:user:${userId}:client:*:projects:*`,

  // Subscription
  subscriptionUsage: (userId: string) =>
    `novba:user:${userId}:subscription:usage`,

  // Pattern for bulk invalidation (used with SCAN)
  userPattern: (userId: string) => `novba:user:${userId}:*`,
  userDashboardPattern: (userId: string) => `novba:user:${userId}:dashboard:*`,
  userInvoicesPattern: (userId: string) => `novba:user:${userId}:invoices:*`,
  userClientsPattern: (userId: string) => `novba:user:${userId}:clients:*`,
  userContractsPattern: (userId: string) => `novba:user:${userId}:contracts:*`,
  userProjectsPattern: (userId: string) => `novba:user:${userId}:projects:*`,
  userProposalsPattern: (userId: string) => `novba:user:${userId}:proposals:*`,
  userPaymentsPattern: (userId: string) => `novba:user:${userId}:payments:*`,
  userExpensesPattern: (userId: string) => `novba:user:${userId}:expenses:*`,
  userPortfolioPattern: (userId: string) => `novba:user:${userId}:portfolio:*`,
  userSettingsPattern: (userId: string) => `novba:user:${userId}:settings:*`,
  userSubscriptionPattern: (userId: string) =>
    `novba:user:${userId}:subscription:*`,
};

// TTLs in seconds
export const TTL = {
  DASHBOARD: 300, // 5 minutes
  LIST: 120, // 2 minutes
  SETTINGS: 1800, // 30 minutes
  SUBSCRIPTION: 300, // 5 minutes
  HEALTH_METRICS: 600, // 10 minutes
  CASH_FLOW: 600, // 10 minutes
};
