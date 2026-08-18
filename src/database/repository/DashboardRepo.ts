import prisma from '../index';

// ─── HELPER ───────────────────────────────────────────────────────────────────

function calculatePercentageChange(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

function getWeekNumber(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function calculateHealthScore(
  avgPaymentTime: number,
  onTimeRate: number,
  outstandingRatio: number,
): number {
  let score = 100;
  if (avgPaymentTime > 30) score -= Math.min(30, (avgPaymentTime - 30) * 0.5);
  if (onTimeRate < 80) score -= (80 - onTimeRate) * 0.5;
  if (outstandingRatio > 50)
    score -= Math.min(30, (outstandingRatio - 50) * 0.5);
  return Math.max(0, Math.round(score));
}

// ─── OVERVIEW ─────────────────────────────────────────────────────────────────

/**
 * GET /dashboard/overview
 * Powers: Total Revenue card, Pending Invoices card, Outstanding card, Active Clients card
 */
async function getOverview(userId: string, startDate?: Date, endDate?: Date) {
  const now = new Date();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultCurrency: true },
  });
  const userCurrency = user?.defaultCurrency ?? 'USD';

  // Resolve current period bounds
  const currentStart =
    startDate ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const currentEnd = endDate ?? now;

  // Calculate matching previous period (same length, immediately before)
  const periodMs = currentEnd.getTime() - currentStart.getTime();
  const prevStart = new Date(currentStart.getTime() - periodMs);
  const prevEnd = new Date(currentStart.getTime());

  const currentDateFilter = { gte: currentStart, lte: currentEnd };
  const prevDateFilter = { gte: prevStart, lte: prevEnd };

  // ── Revenue ──────────────────────────────────────────────────────────────
  const [currentRevenueData, prevRevenueData] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        userId,
        currency: userCurrency,
        status: 'PAID',
        paidAt: currentDateFilter,
      },
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: {
        userId,
        currency: userCurrency,
        status: 'PAID',
        paidAt: prevDateFilter,
      },
      _sum: { total: true },
    }),
  ]);

  const currentRevenue = Number(currentRevenueData._sum.total || 0);
  const prevRevenue = Number(prevRevenueData._sum.total || 0);

  // ── Pending Invoices (SENT but not yet overdue) ───────────────────────────
  const pendingData = await prisma.invoice.aggregate({
    where: { userId, currency: userCurrency, status: 'SENT' },
    _sum: { total: true },
    _count: { _all: true },
  });

  // ── Outstanding (SENT + OVERDUE + PARTIALLY_PAID) ────────────────────────
  const outstandingData = await prisma.invoice.aggregate({
    where: {
      userId,
      currency: userCurrency,
      status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
    },
    _sum: { total: true },
  });

  // Correct outstanding by subtracting partial payments already made
  const partiallyPaidInvoices = await prisma.invoice.findMany({
    where: { userId, currency: userCurrency, status: 'PARTIALLY_PAID' },
    include: { payments: { where: { status: 'COMPLETED' } } },
  });

  let actualOutstanding = Number(outstandingData._sum.total || 0);
  for (const invoice of partiallyPaidInvoices) {
    const paidAmount = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    actualOutstanding =
      actualOutstanding -
      Number(invoice.total) +
      (Number(invoice.total) - paidAmount);
  }

  // ── Overdue count ────────────────────────────────────────────────────────
  const overdueCount = await prisma.invoice.count({
    where: { userId, status: 'OVERDUE' },
  });

  // ── Active Clients ───────────────────────────────────────────────────────
  const [currentActiveClients, prevActiveClients] = await Promise.all([
    // Active = has at least one non-draft invoice (ever)
    prisma.client.count({
      where: {
        userId,
        invoices: {
          some: {
            status: { in: ['SENT', 'PAID', 'OVERDUE', 'PARTIALLY_PAID'] },
          },
        },
      },
    }),
    // Previous count: clients who had PAID invoices before current period
    // (used only for percentageChange comparison)
    prisma.client.count({
      where: {
        userId,
        invoices: {
          some: {
            status: 'PAID',
            paidAt: { lt: currentStart },
          },
        },
      },
    }),
  ]);

  // ── Misc counts ──────────────────────────────────────────────────────────
  const [totalClients, activeProjects, totalInvoices] = await Promise.all([
    prisma.client.count({ where: { userId } }),
    prisma.project.count({ where: { userId, status: 'ACTIVE' } }),
    prisma.invoice.count({ where: { userId } }),
  ]);

  // ── Expenses ─────────────────────────────────────────────────────────────
  const expensesData = await prisma.expense.aggregate({
    where: { userId, date: currentDateFilter },
    _sum: { amount: true },
  });

  const pendingByCurrency = await prisma.invoice.groupBy({
    by: ['currency'],
    where: {
      userId,
      status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
    },
    _sum: { total: true },
    orderBy: { _sum: { total: 'desc' } },
  });

  const outstandingByCurrency = await prisma.invoice.groupBy({
    by: ['currency'],
    where: {
      userId,
      status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
    },
    _sum: { total: true },
    orderBy: { _sum: { total: 'desc' } },
  });

  const revenueByCurrency = await prisma.invoice.groupBy({
    by: ['currency'],
    where: {
      userId,
      status: 'PAID',
    },
    _sum: { total: true },
    orderBy: { _sum: { total: 'desc' } },
  });

  return {
    // ── Stat cards ─────────────────────────────────────────────────────────
    revenue: {
      total: currentRevenue,
      previousTotal: prevRevenue,
      percentageChange: calculatePercentageChange(currentRevenue, prevRevenue),
      currency: userCurrency,
    },
    pendingInvoices: {
      total: Number(pendingData._sum.total || 0),
      count: pendingData._count._all, // → "8 invoices awaiting payment"
      currency: userCurrency,
    },
    outstanding: {
      total: actualOutstanding,
      overdueCount, // → "1 overdue"
      currency: userCurrency,
    },
    activeClients: {
      count: currentActiveClients,
      previousCount: prevActiveClients,
      percentageChange: calculatePercentageChange(
        currentActiveClients,
        prevActiveClients,
      ),
    },
    // ── Supporting data ───────────────────────────────────────────────────
    expenses: {
      total: Number(expensesData._sum.amount || 0),
      currency: userCurrency,
    },
    profit: {
      total: currentRevenue - Number(expensesData._sum.amount || 0),
      currency: userCurrency,
    },
    counts: {
      totalClients,
      activeProjects,
      totalInvoices,
      overdueInvoices: overdueCount,
    },
    pendingByCurrency: pendingByCurrency.map((r) => ({
      currency: r.currency,
      total: Number(r._sum.total ?? 0),
    })),
    outstandingByCurrency: outstandingByCurrency.map((r) => ({
      currency: r.currency,
      total: Number(r._sum.total ?? 0),
    })),
    revenueByCurrency: revenueByCurrency.map((r) => ({
      currency: r.currency,
      total: Number(r._sum.total ?? 0),
    })),
  };
}

// ─── INCOME CHART ──────────────────────────────────────────────────────────────

/**
 * GET /dashboard/income-chart
 * Powers: Revenue Overview chart (income line)
 */
async function getIncomeChart(
  userId: string,
  startDate: Date,
  endDate: Date,
  groupBy: 'month' | 'week' | 'day' = 'month',
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultCurrency: true },
  });
  const userCurrency = user?.defaultCurrency ?? 'USD';

  const invoices = await prisma.invoice.findMany({
    where: {
      userId,
      currency: userCurrency,
      status: 'PAID',
      paidAt: { gte: startDate, lte: endDate },
    },
    select: { total: true, paidAt: true },
    orderBy: { paidAt: 'asc' },
  });

  const grouped = new Map<string, number>();

  invoices.forEach((invoice) => {
    if (!invoice.paidAt) return;
    const date = new Date(invoice.paidAt);
    let key: string;

    if (groupBy === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0',
      )}`;
    } else if (groupBy === 'week') {
      key = `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(
        2,
        '0',
      )}`;
    } else {
      key = date.toISOString().split('T')[0];
    }

    grouped.set(key, (grouped.get(key) || 0) + Number(invoice.total));
  });

  return Array.from(grouped.entries())
    .map(([period, amount]) => ({ period, amount, currency: userCurrency }))
    .sort((a, b) => a.period.localeCompare(b.period));
}

// ─── EXPENSES CHART ────────────────────────────────────────────────────────────

/**
 * GET /dashboard/expenses-chart
 * Powers: Revenue Overview chart (expenses line) + category breakdown
 */
async function getExpensesChart(
  userId: string,
  startDate: Date,
  endDate: Date,
  groupBy: 'month' | 'week' | 'day' = 'month',
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultCurrency: true },
  });
  const userCurrency = user?.defaultCurrency ?? 'USD';

  const expenses = await prisma.expense.findMany({
    where: { userId, date: { gte: startDate, lte: endDate } },
    select: { amount: true, date: true, category: true },
    orderBy: { date: 'asc' },
  });

  const groupedByPeriod = new Map<string, number>();
  const groupedByCategory = new Map<string, number>();

  expenses.forEach((expense) => {
    const date = new Date(expense.date);
    let key: string;

    if (groupBy === 'month') {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0',
      )}`;
    } else if (groupBy === 'week') {
      key = `${date.getFullYear()}-W${String(getWeekNumber(date)).padStart(
        2,
        '0',
      )}`;
    } else {
      key = date.toISOString().split('T')[0];
    }

    groupedByPeriod.set(
      key,
      (groupedByPeriod.get(key) || 0) + Number(expense.amount),
    );
    groupedByCategory.set(
      expense.category,
      (groupedByCategory.get(expense.category) || 0) + Number(expense.amount),
    );
  });

  return {
    byPeriod: Array.from(groupedByPeriod.entries())
      .map(([period, amount]) => ({ period, amount, currency: userCurrency }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    byCategory: Array.from(groupedByCategory.entries())
      .map(([category, amount]) => ({
        category,
        amount,
        currency: userCurrency,
      }))
      .sort((a, b) => b.amount - a.amount),
    total: expenses.reduce((sum, e) => sum + Number(e.amount), 0),
  };
}

// ─── CLIENT REVENUE ────────────────────────────────────────────────────────────

/**
 * GET /dashboard/client-revenue
 * Powers: Top Clients widget
 */
async function getClientRevenue(userId: string, limit: number = 10) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultCurrency: true },
  });
  const userCurrency = user?.defaultCurrency ?? 'USD';

  const clients = await prisma.client.findMany({
    where: { userId },
    include: {
      invoices: {
        where: { status: 'PAID', currency: userCurrency },
        select: { total: true },
      },
      _count: { select: { invoices: true } },
    },
  });

  // Build full revenue map before slicing
  const allWithRevenue = clients
    .map((client) => ({
      ...client,
      totalRevenue: client.invoices.reduce(
        (sum, inv) => sum + Number(inv.total),
        0,
      ),
    }))
    .filter((c) => c.totalRevenue > 0)
    .sort((a, b) => b.totalRevenue - a.totalRevenue);

  const grandTotal = allWithRevenue.reduce((sum, c) => sum + c.totalRevenue, 0);

  const topN = allWithRevenue.slice(0, limit);
  const topNTotal = topN.reduce((sum, c) => sum + c.totalRevenue, 0);

  const concentrationPercent =
    grandTotal > 0 ? Math.round((topNTotal / grandTotal) * 100) : 0;

  // HEALTHY < 40%, MODERATE 40-60%, CONCENTRATED > 60%
  const concentrationStatus =
    concentrationPercent < 40
      ? 'HEALTHY'
      : concentrationPercent < 60
        ? 'MODERATE'
        : 'CONCENTRATED';

  return {
    clients: topN.map((client) => ({
      clientId: client.id,
      companyName: client.companyName,
      contactName: client.contactName,
      email: client.email,
      totalRevenue: client.totalRevenue,
      totalInvoices: client._count.invoices,
      currency: client.currency,
    })),
    summary: {
      topNTotal: Math.round(topNTotal),
      grandTotal: Math.round(grandTotal),
      concentrationPercent,
      concentrationStatus,
      currency: userCurrency,
    },
  };
}

// ─── CASH FLOW FORECAST ────────────────────────────────────────────────────────

/**
 * GET /dashboard/cash-flow-forecast
 * Powers: Cash Flow Forecast chart
 */
async function getCashFlowForecast(userId: string, months: number = 6) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultCurrency: true },
  });
  const userCurrency = user?.defaultCurrency ?? 'USD';

  const today = new Date();
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + months);

  const upcomingInvoices = await prisma.invoice.findMany({
    where: {
      userId,
      currency: userCurrency,
      status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
      dueDate: { lte: endDate },
    },
    include: {
      payments: { where: { status: 'COMPLETED' } },
      client: { select: { companyName: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  const forecast = upcomingInvoices.map((invoice) => {
    const paidAmount = invoice.payments.reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const expectedAmount = Number(invoice.total) - paidAmount;
    return {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      clientName: invoice.client?.companyName || 'Unassigned Client',
      dueDate: invoice.dueDate,
      expectedAmount,
      currency: invoice.currency,
      status: invoice.status,
      isOverdue: new Date(invoice.dueDate) < today,
    };
  });

  // Monthly grouping for the bar chart
  const monthlyForecast = new Map<
    string,
    { projected: number; conservative: number }
  >();

  forecast.forEach((item) => {
    const date = new Date(item.dueDate);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0',
    )}`;
    const existing = monthlyForecast.get(key) || {
      projected: 0,
      conservative: 0,
    };
    monthlyForecast.set(key, {
      // Projected = full expected
      projected: existing.projected + item.expectedAmount,
      // Conservative = 80% of projected (accounts for late payments)
      conservative: existing.conservative + item.expectedAmount * 0.8,
    });
  });

  const monthlyData = Array.from(monthlyForecast.entries())
    .map(([month, amounts]) => ({
      month,
      projected: Math.round(amounts.projected),
      conservative: Math.round(amounts.conservative),
      currency: userCurrency,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  // 1. Peak month — highest projected value in the forecast
  const peakMonth = monthlyData.reduce(
    (peak, month) => (month.projected > peak.projected ? month : peak),
    monthlyData[0] ?? {
      month: '',
      projected: 0,
      conservative: 0,
      currency: userCurrency,
    },
  );

  // 2. Current month actual revenue (PAID invoices this month)
  const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const currentMonthRevenue = await prisma.invoice.aggregate({
    where: {
      userId,
      currency: userCurrency,
      status: 'PAID',
      paidAt: { gte: currentMonthStart, lte: today },
    },
    _sum: { total: true },
  });
  const currentMonthTotal = Number(currentMonthRevenue._sum.total || 0);

  // 3. Projected growth % — peak projected vs current month actual
  const projectedGrowthPercent =
    currentMonthTotal > 0
      ? Math.round(
          ((peakMonth.projected - currentMonthTotal) / currentMonthTotal) * 100,
        )
      : 0;

  // 4. Human-readable peak month label e.g. "July"
  const peakMonthLabel = peakMonth.month
    ? new Date(peakMonth.month + '-01').toLocaleString('en-US', {
        month: 'long',
      })
    : null;

  // 5. Overdue amount within the forecast pipeline
  const overdueTotal = forecast
    .filter((item) => item.isOverdue)
    .reduce((sum, item) => sum + item.expectedAmount, 0);

  // 6. Total pipeline
  const pipelineTotal = forecast.reduce(
    (sum, item) => sum + item.expectedAmount,
    0,
  );

  return {
    upcomingInvoices: forecast,
    monthlyForecast: monthlyData,
    totalExpected: Math.round(pipelineTotal),
    insights: {
      peakMonth: {
        label: peakMonthLabel,
        month: peakMonth.month,
        projected: peakMonth.projected,
        conservative: peakMonth.conservative,
        currency: userCurrency,
      },
      projectedGrowth: {
        percent: projectedGrowthPercent,
        direction: projectedGrowthPercent >= 0 ? 'up' : 'down',
        currentMonthTotal,
      },
      pipeline: {
        total: Math.round(pipelineTotal),
        overdueAmount: Math.round(overdueTotal),
        overduePercent:
          pipelineTotal > 0
            ? Math.round((overdueTotal / pipelineTotal) * 100)
            : 0,
      },
    },
  };
}

// ─── HEALTH METRICS ────────────────────────────────────────────────────────────

/**
 * GET /dashboard/health-metrics
 * Powers: Business Health widget (score + 4 metrics)
 */
async function getHealthMetrics(userId: string) {
  const today = new Date();
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const sixtyDaysAgo = new Date(thirtyDaysAgo);
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 30);
  const ninetyDaysAgo = new Date(today);
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  // ── Avg payment time + on-time rate (from all paid invoices) ─────────────
  const paidInvoices = await prisma.invoice.findMany({
    where: { userId, status: 'PAID', paidAt: { not: null } },
    select: { issueDate: true, paidAt: true, dueDate: true },
  });

  const paymentTimes = paidInvoices.map((inv) =>
    Math.floor(
      (new Date(inv.paidAt!).getTime() - new Date(inv.issueDate).getTime()) /
        86400000,
    ),
  );

  const averagePaymentTime =
    paymentTimes.length > 0
      ? Math.round(
          paymentTimes.reduce((a, b) => a + b, 0) / paymentTimes.length,
        )
      : 0;

  const onTimePayments = paidInvoices.filter(
    (inv) => inv.paidAt && new Date(inv.paidAt) <= new Date(inv.dueDate),
  ).length;

  // collectionRate = on-time payment percentage (maps to "Collection Rate 87%" in UI)
  const collectionRate =
    paidInvoices.length > 0
      ? Math.round((onTimePayments / paidInvoices.length) * 100)
      : 0;

  // ── Revenue growth (last 30 days vs previous 30 days) ────────────────────
  const [last30, prev30] = await Promise.all([
    prisma.invoice.aggregate({
      where: { userId, status: 'PAID', paidAt: { gte: thirtyDaysAgo } },
      _sum: { total: true },
    }),
    prisma.invoice.aggregate({
      where: {
        userId,
        status: 'PAID',
        paidAt: { gte: sixtyDaysAgo, lt: thirtyDaysAgo },
      },
      _sum: { total: true },
    }),
  ]);

  const currentRevenue = Number(last30._sum.total || 0);
  const previousRevenue = Number(prev30._sum.total || 0);
  const revenueGrowth = calculatePercentageChange(
    currentRevenue,
    previousRevenue,
  );

  // ── Outstanding ratio (for health score calc only) ───────────────────────
  const outstandingData = await prisma.invoice.aggregate({
    where: { userId, status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] } },
    _sum: { total: true },
  });
  const outstanding = Number(outstandingData._sum.total || 0);
  const outstandingRatio =
    currentRevenue > 0 ? Math.round((outstanding / currentRevenue) * 100) : 0;

  // ── Client retention rate ────────────────────────────────────────────────
  // Clients who had invoices in the previous 30-90 day window
  const previousPeriodClients = await prisma.client.findMany({
    where: {
      userId,
      invoices: {
        some: { createdAt: { gte: ninetyDaysAgo, lt: thirtyDaysAgo } },
      },
    },
    select: { id: true },
  });

  // Of those, how many also had invoices in the last 30 days
  const retainedCount =
    previousPeriodClients.length > 0
      ? await prisma.client.count({
          where: {
            userId,
            id: { in: previousPeriodClients.map((c) => c.id) },
            invoices: { some: { createdAt: { gte: thirtyDaysAgo } } },
          },
        })
      : 0;

  const clientRetention =
    previousPeriodClients.length > 0
      ? Math.round((retainedCount / previousPeriodClients.length) * 100)
      : 100; // 100% if no previous clients to compare (new account)

  return {
    healthScore: calculateHealthScore(
      averagePaymentTime,
      collectionRate,
      outstandingRatio,
    ),
    // ── These four map directly to the four rows in the Business Health widget ──
    collectionRate, // "Collection Rate   87%"
    avgPaymentTime: averagePaymentTime, // "Avg Payment Time  12 days"
    clientRetention, // "Client Retention  92%"
    revenueGrowth, // "Revenue Growth    29.4%"
  };
}

// ─── RECENT ACTIVITY ──────────────────────────────────────────────────────────

/**
 * GET /dashboard/recent-activity
 * Powers: Recent Activity feed (payments received + invoices sent/overdue, merged + sorted)
 */
async function getRecentActivity(userId: string, limit: number = 10) {
  const [recentPayments, recentInvoices] = await Promise.all([
    prisma.payment.findMany({
      where: { userId, status: 'COMPLETED' },
      take: limit,
      orderBy: { paidAt: 'desc' },
      include: {
        invoice: {
          select: {
            invoiceNumber: true,
            client: { select: { companyName: true } },
          },
        },
      },
    }),
    prisma.invoice.findMany({
      where: { userId, status: { in: ['SENT', 'OVERDUE'] } },
      take: limit,
      orderBy: { updatedAt: 'desc' },
      include: {
        client: { select: { companyName: true } },
      },
    }),
  ]);

  const activity = [
    ...recentPayments.map((p) => ({
      id: p.id,
      type: 'PAYMENT_RECEIVED' as const,
      clientName: p.invoice.client?.companyName || 'Unassigned Client',
      invoiceNumber: p.invoice.invoiceNumber,
      amount: Number(p.amount),
      currency: p.currency,
      timestamp: p.paidAt,
    })),
    ...recentInvoices.map((inv) => ({
      id: inv.id,
      type: (inv.status === 'OVERDUE' ? 'INVOICE_OVERDUE' : 'INVOICE_SENT') as
        | 'INVOICE_OVERDUE'
        | 'INVOICE_SENT',
      clientName: inv.client?.companyName || 'Unassigned Client',
      invoiceNumber: inv.invoiceNumber,
      amount: Number(inv.total),
      currency: inv.currency,
      timestamp: inv.updatedAt,
    })),
  ]
    .sort(
      (a, b) =>
        new Date(b.timestamp!).getTime() - new Date(a.timestamp!).getTime(),
    )
    .slice(0, limit);

  return activity;
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────

export default {
  getOverview,
  getIncomeChart,
  getExpensesChart,
  getClientRevenue,
  getCashFlowForecast,
  getHealthMetrics,
  getRecentActivity,
};
