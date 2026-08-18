import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../index';
import { Client, Prisma, PaymentTerms } from '@prisma/client';

export interface CreateClientData {
  userId: string;
  companyName: string;
  contactName?: string;
  email?: string;
  phone?: string;
  billingAddress?: any;
  paymentTerms?: PaymentTerms;
  currency?: string;
  notes?: string;
}

export interface UpdateClientData {
  companyName?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  billingAddress?: any;
  paymentTerms?: PaymentTerms;
  currency?: string;
  notes?: string;
}

export interface ClientWithInvoices extends Client {
  invoices: any[];
}

/**
 * Check if client exists and belongs to user
 */
async function existsForUser(id: string, userId: string): Promise<boolean> {
  const client = await prisma.client.findFirst({
    where: {
      id,
      userId,
    },
  });
  return client !== null;
}

/**
 * Find client by ID (only if belongs to user)
 */
async function findById(id: string, userId: string): Promise<Client | null> {
  return prisma.client.findFirst({
    where: {
      id,
      userId,
    },
  });
}

/**
 * Find client by ID with invoices
 */
async function findByIdWithInvoices(
  id: string,
  userId: string,
): Promise<ClientWithInvoices | null> {
  return prisma.client.findFirst({
    where: {
      id,
      userId,
    },
    include: {
      invoices: {
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });
}

/**
 * Create new client
 */
async function create(data: CreateClientData): Promise<Client> {
  return prisma.client.create({
    data: {
      userId: data.userId,
      companyName: data.companyName,
      contactName: data.contactName,
      email: data.email,
      phone: data.phone,
      billingAddress: data.billingAddress,
      paymentTerms: data.paymentTerms || PaymentTerms.NET_30,
      currency: data.currency || 'USD',
      notes: data.notes,
    },
  });
}

/**
 * Update client information
 */
async function update(
  id: string,
  userId: string,
  data: UpdateClientData,
): Promise<Client> {
  return prisma.client.update({
    where: {
      id,
      userId,
    },
    data: {
      ...data,
      updatedAt: new Date(),
    },
  });
}

/**
 * Delete client (hard delete)
 */
async function remove(id: string, userId: string): Promise<Client> {
  return prisma.client.delete({
    where: {
      id,
      userId,
    },
  });
}

/**
 * Get all clients for a user with pagination
 */
async function findAllByUser(
  userId: string,
  skip: number = 0,
  take: number = 20,
  search?: string,
): Promise<Client[]> {
  const where: Prisma.ClientWhereInput = {
    userId,
  };

  // Add search filter if provided
  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: 'insensitive' } },
      { contactName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  return prisma.client.findMany({
    where,
    skip,
    take,
    orderBy: {
      createdAt: 'desc',
    },
  });
}

/**
 * Count clients for a user
 */
async function countByUser(userId: string, search?: string): Promise<number> {
  const where: Prisma.ClientWhereInput = {
    userId,
  };

  if (search) {
    where.OR = [
      { companyName: { contains: search, mode: 'insensitive' } },
      { contactName: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  return prisma.client.count({ where });
}

/**
 * Get client stats (total revenue, outstanding balance, etc.)
 */
async function getStats(id: string, userId: string) {
  const client = await prisma.client.findFirst({
    where: { id, userId },
    include: {
      invoices: {
        include: {
          payments: true,
        },
      },
    },
  });

  if (!client) return null;

  const totalInvoices = client.invoices.length;
  const paidInvoices = client.invoices.filter(
    (inv) => inv.status === 'PAID',
  ).length;
  const overdueInvoices = client.invoices.filter(
    (inv) => inv.status === 'OVERDUE',
  ).length;

  const totalRevenue = client.invoices
    .filter((inv) => inv.status === 'PAID')
    .reduce((sum, inv) => sum + Number(inv.total), 0);

  const outstandingBalance = client.invoices
    .filter((inv) => inv.status === 'SENT' || inv.status === 'OVERDUE')
    .reduce((sum, inv) => sum + Number(inv.total), 0);

  return {
    clientId: client.id,
    companyName: client.companyName,
    totalInvoices,
    paidInvoices,
    overdueInvoices,
    totalRevenue,
    outstandingBalance,
    currency: client.currency,
  };
}

/**
 * Get client health score
 */
async function getHealth(id: string, userId: string) {
  const client = await prisma.client.findFirst({
    where: { id, userId },
    include: {
      invoices: {
        orderBy: {
          dueDate: 'desc',
        },
      },
    },
  });

  if (!client) return null;

  const totalInvoices = client.invoices.length;
  if (totalInvoices === 0) {
    return {
      clientId: client.id,
      companyName: client.companyName,
      healthScore: 100,
      status: 'EXCELLENT',
      averageDaysToPay: 0,
      overdueCount: 0,
      paymentRate: 0,
    };
  }

  const paidInvoices = client.invoices.filter((inv) => inv.status === 'PAID');
  const overdueInvoices = client.invoices.filter(
    (inv) => inv.status === 'OVERDUE',
  );

  const paymentRate = (paidInvoices.length / totalInvoices) * 100;

  // Calculate average days to pay
  const daysToPay = paidInvoices
    .filter((inv) => inv.paidAt)
    .map((inv) => {
      const issued = new Date(inv.issueDate);
      const paid = new Date(inv.paidAt!);
      return Math.floor(
        (paid.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24),
      );
    });

  const averageDaysToPay =
    daysToPay.length > 0
      ? Math.round(daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length)
      : 0;

  // Calculate health score (0-100)
  let healthScore = 100;
  healthScore -= overdueInvoices.length * 10; // -10 per overdue invoice
  healthScore -= Math.max(0, averageDaysToPay - 30) * 0.5; // -0.5 per day over 30
  healthScore = Math.max(0, Math.min(100, healthScore));

  let status = 'EXCELLENT';
  if (healthScore < 40) status = 'POOR';
  else if (healthScore < 70) status = 'FAIR';
  else if (healthScore < 90) status = 'GOOD';

  return {
    clientId: client.id,
    companyName: client.companyName,
    healthScore: Math.round(healthScore),
    status,
    averageDaysToPay,
    overdueCount: overdueInvoices.length,
    paymentRate: Math.round(paymentRate),
  };
}

/**
 * Get all clients with basic invoice counts (for CSV export)
 */
async function findAllForExport(userId: string): Promise<any[]> {
  return prisma.client.findMany({
    where: { userId },
    include: {
      _count: {
        select: {
          invoices: true,
        },
      },
    },
    orderBy: {
      companyName: 'asc',
    },
  });
}

async function createProject(
  clientId: string,
  userId: string,
  data: {
    name: string;
    description?: string;
    startDate: Date;
    endDate?: Date;
    totalBudget: string;
    currency?: string;
    paymentPlan?: any;
  },
) {
  return await prisma.project.create({
    data: {
      clientId,
      userId,
      name: data.name,
      description: data.description || null,
      startDate: data.startDate,
      endDate: data.endDate || null,
      totalBudget: new Decimal(data.totalBudget),
      currency: data.currency || 'USD',
      paymentPlan: data.paymentPlan || null,
    },
    include: {
      client: true,
      invoices: {
        select: {
          id: true,
          total: true,
          status: true,
        },
      },
      milestones: {
        select: {
          id: true,
          amount: true,
          status: true,
        },
      },
    },
  });
}
async function getClientProjects(
  clientId: string,
  userId: string,
  filters: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
  },
) {
  const page = filters.page || 1;
  const limit = filters.limit || 20;
  const skip = (page - 1) * limit;
  const search = filters.search || '';
  const status = filters.status || null;
  const sortBy = filters.sortBy || 'createdAt';
  const sortOrder = filters.sortOrder || 'desc';

  // Build where clause
  const where: any = {
    clientId,
    userId,
  };

  // Add search filter (search by project name or description)
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  // Add status filter
  if (status) {
    where.status = status;
  }

  // Build orderBy
  const orderBy: any = {};
  orderBy[sortBy] = sortOrder;

  // Get total count for pagination
  const total = await prisma.project.count({ where });

  // Get paginated projects
  const projects = await prisma.project.findMany({
    where,
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          email: true,
        },
      },
      invoices: {
        select: {
          id: true,
          total: true,
          status: true,
        },
      },
      milestones: {
        select: {
          id: true,
          amount: true,
          status: true,
        },
      },
    },
    orderBy,
    skip,
    take: limit,
  });

  return {
    projects,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNextPage: page < Math.ceil(total / limit),
      hasPrevPage: page > 1,
    },
  };
}

export default {
  existsForUser,
  findById,
  findByIdWithInvoices,
  create,
  update,
  remove,
  findAllByUser,
  countByUser,
  getStats,
  getHealth,
  findAllForExport,
  createProject,
  getClientProjects,
};
