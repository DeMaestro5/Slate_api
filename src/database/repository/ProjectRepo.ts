import prisma from '../index';
import { Project, ProjectStatus, Prisma } from '@prisma/client';

export interface CreateProjectData {
  userId: string;
  clientId?: string | null;
  proposalId?: string;
  contractId?: string;
  name: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  totalBudget: number;
  currency?: string;
  paymentPlan?: any;
}

export interface UpdateProjectData {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  startDate?: Date;
  endDate?: Date;
  totalBudget?: number;
  currency?: string;
  paymentPlan?: any;
}

export interface ProjectWithDetails extends Project {
  client?: any;
  proposal?: any;
  contract?: any;
  invoices?: any[];
  _count?: {
    invoices: number;
  };
}

/**
 * Check if project exists and belongs to user
 */
async function existsForUser(id: string, userId: string): Promise<boolean> {
  const project = await prisma.project.findFirst({
    where: {
      id,
      userId,
    },
  });
  return project !== null;
}

/**
 * Find project by ID (only if belongs to user)
 */
async function findById(
  id: string,
  userId: string,
): Promise<ProjectWithDetails | null> {
  return prisma.project.findFirst({
    where: {
      id,
      userId,
    },
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
        },
      },
      proposal: {
        select: {
          id: true,
          proposalNumber: true,
          title: true,
          totalAmount: true,
        },
      },
      contract: {
        select: {
          id: true,
          contractNumber: true,
          title: true,
          status: true,
        },
      },
      _count: {
        select: {
          invoices: true,
        },
      },
    },
  });
}

/**
 * Find project by ID with invoices
 */
async function findByIdWithInvoices(
  id: string,
  userId: string,
): Promise<ProjectWithDetails | null> {
  return prisma.project.findFirst({
    where: {
      id,
      userId,
    },
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
        },
      },
      proposal: {
        select: {
          id: true,
          proposalNumber: true,
          title: true,
          totalAmount: true,
        },
      },
      contract: {
        select: {
          id: true,
          contractNumber: true,
          title: true,
          status: true,
        },
      },
      invoices: {
        orderBy: {
          createdAt: 'desc',
        },
      },
    },
  });
}

/**
 * Create new project
 */
async function create(data: CreateProjectData): Promise<ProjectWithDetails> {
  return prisma.project.create({
    data: {
      userId: data.userId,
      clientId: data.clientId || null,
      proposalId: data.proposalId,
      contractId: data.contractId,
      name: data.name,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      totalBudget: data.totalBudget,
      currency: data.currency || 'USD',
      paymentPlan: data.paymentPlan ?? Prisma.JsonNull,
    },
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
        },
      },
      proposal: {
        select: {
          id: true,
          proposalNumber: true,
          title: true,
          totalAmount: true,
        },
      },
      contract: {
        select: {
          id: true,
          contractNumber: true,
          title: true,
          status: true,
        },
      },
      _count: {
        select: {
          invoices: true,
        },
      },
    },
  });
}

/**
 * Update project
 */
async function update(
  id: string,
  userId: string,
  data: UpdateProjectData,
): Promise<ProjectWithDetails> {
  return prisma.project.update({
    where: {
      id,
      userId,
    },
    data: {
      ...data,
      paymentPlan:
        data.paymentPlan !== undefined
          ? data.paymentPlan ?? Prisma.JsonNull
          : undefined,
      updatedAt: new Date(),
    },
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
        },
      },
      proposal: {
        select: {
          id: true,
          proposalNumber: true,
          title: true,
          totalAmount: true,
        },
      },
      contract: {
        select: {
          id: true,
          contractNumber: true,
          title: true,
          status: true,
        },
      },
      _count: {
        select: {
          invoices: true,
        },
      },
    },
  });
}

/**
 * Update project status
 */
async function updateStatus(
  id: string,
  userId: string,
  status: ProjectStatus,
): Promise<Project> {
  return prisma.project.update({
    where: {
      id,
      userId,
    },
    data: {
      status,
      updatedAt: new Date(),
    },
  });
}

/**
 * Delete project (hard delete)
 */
async function remove(id: string, userId: string): Promise<Project> {
  return prisma.project.delete({
    where: {
      id,
      userId,
    },
  });
}

/**
 * Get all projects for a user with pagination
 */
async function findAllByUser(
  userId: string,
  skip: number = 0,
  take: number = 20,
  status?: ProjectStatus,
  search?: string,
): Promise<ProjectWithDetails[]> {
  const where: Prisma.ProjectWhereInput = {
    userId,
  };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      {
        client: {
          companyName: { contains: search, mode: 'insensitive' },
        },
      },
    ];
  }

  return prisma.project.findMany({
    where,
    skip,
    take,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
        },
      },
      proposal: {
        select: {
          id: true,
          proposalNumber: true,
          title: true,
          totalAmount: true,
        },
      },
      contract: {
        select: {
          id: true,
          contractNumber: true,
          title: true,
          status: true,
        },
      },
      _count: {
        select: {
          invoices: true,
        },
      },
    },
  });
}

/**
 * Count projects for a user
 */
async function countByUser(
  userId: string,
  status?: ProjectStatus,
  search?: string,
): Promise<number> {
  const where: Prisma.ProjectWhereInput = {
    userId,
  };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } },
      {
        client: {
          companyName: { contains: search, mode: 'insensitive' },
        },
      },
    ];
  }

  return prisma.project.count({ where });
}

/**
 * Get project statistics
 */
async function getStats(id: string, userId: string) {
  const project = await prisma.project.findFirst({
    where: { id, userId },
    include: {
      invoices: {
        include: {
          payments: true,
        },
      },
    },
  });

  if (!project) return null;

  const totalInvoices = project.invoices.length;
  const paidInvoices = project.invoices.filter(
    (inv) => inv.status === 'PAID',
  ).length;

  const totalInvoiced = project.invoices.reduce(
    (sum, inv) => sum + Number(inv.total),
    0,
  );

  const totalPaid = project.invoices
    .filter((inv) => inv.status === 'PAID')
    .reduce((sum, inv) => sum + Number(inv.total), 0);

  const outstandingAmount = project.invoices
    .filter((inv) => inv.status === 'SENT' || inv.status === 'OVERDUE')
    .reduce((sum, inv) => sum + Number(inv.total), 0);

  const budgetUsed = (totalInvoiced / Number(project.totalBudget)) * 100;
  const budgetRemaining = Number(project.totalBudget) - totalInvoiced;

  return {
    projectId: project.id,
    name: project.name,
    status: project.status,
    totalBudget: Number(project.totalBudget),
    totalInvoiced,
    totalPaid,
    outstandingAmount,
    budgetUsed: Math.round(budgetUsed * 100) / 100,
    budgetRemaining,
    totalInvoices,
    paidInvoices,
    currency: project.currency,
  };
}

export default {
  existsForUser,
  findById,
  findByIdWithInvoices,
  create,
  update,
  updateStatus,
  remove,
  findAllByUser,
  countByUser,
  getStats,
};
