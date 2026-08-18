import prisma from '../index';
import { Invoice, InvoiceStatus, Prisma } from '@prisma/client';

export interface CreateInvoiceData {
  userId: string;
  clientId?: string | null;
  projectId?: string;
  invoiceNumber: string;
  issueDate: Date;
  dueDate: Date;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency?: string;
  notes?: string;
  terms?: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
    order: number;
  }>;
}

export interface UpdateInvoiceData {
  issueDate?: Date;
  dueDate?: Date;
  subtotal?: number;
  taxRate?: number;
  taxAmount?: number;
  total?: number;
  currency?: string;
  notes?: string;
  terms?: string;
  scheduledSendAt?: Date | null;
  lineItems?: Array<{
    description: string;
    quantity: number;
    rate: number;
    amount: number;
    order: number;
  }>;
}

export interface InvoiceWithDetails extends Invoice {
  lineItems: any[];
  client?: any;
  project?: any;
}

/**
 * Check if invoice exists and belongs to user
 */
async function existsForUser(id: string, userId: string): Promise<boolean> {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id,
      userId,
    },
  });
  return invoice !== null;
}

/**
 * Find invoice by ID (only if belongs to user)
 */
async function findById(
  id: string,
  userId: string,
): Promise<InvoiceWithDetails | null> {
  return prisma.invoice.findFirst({
    where: {
      id,
      userId,
    },
    include: {
      lineItems: {
        orderBy: {
          order: 'asc',
        },
      },
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          billingAddress: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Generate next invoice number for user
 */
async function generateInvoiceNumber(userId: string): Promise<string> {
  const lastInvoice = await prisma.invoice.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });

  if (!lastInvoice) {
    return 'INV-0001';
  }

  // Extract number from format INV-0001
  const match = lastInvoice.invoiceNumber.match(/INV-(\d+)/);
  if (match) {
    const nextNumber = parseInt(match[1], 10) + 1;
    return `INV-${nextNumber.toString().padStart(4, '0')}`;
  }

  return 'INV-0001';
}

/**
 * Create new invoice with line items
 */
async function create(data: CreateInvoiceData): Promise<InvoiceWithDetails> {
  const { lineItems, ...invoiceData } = data;

  return prisma.invoice.create({
    data: {
      ...invoiceData,
      clientId: invoiceData.clientId || null,
      projectId: invoiceData.projectId || null,
      lineItems: {
        create: lineItems,
      },
    },
    include: {
      lineItems: {
        orderBy: {
          order: 'asc',
        },
      },
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          billingAddress: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Update invoice and line items
 */
async function update(
  id: string,
  userId: string,
  data: UpdateInvoiceData,
): Promise<InvoiceWithDetails> {
  const { lineItems, ...invoiceData } = data;

  // If line items provided, delete old ones and create new ones
  if (lineItems) {
    await prisma.invoiceLineItem.deleteMany({
      where: { invoiceId: id },
    });

    return prisma.invoice.update({
      where: {
        id,
        userId,
      },
      data: {
        ...invoiceData,
        updatedAt: new Date(),
        lineItems: {
          create: lineItems,
        },
      },
      include: {
        lineItems: {
          orderBy: {
            order: 'asc',
          },
        },
        client: {
          select: {
            id: true,
            companyName: true,
            contactName: true,
            email: true,
            billingAddress: true,
          },
        },
        project: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
      },
    });
  }

  return prisma.invoice.update({
    where: {
      id,
      userId,
    },
    data: {
      ...invoiceData,
      updatedAt: new Date(),
    },
    include: {
      lineItems: {
        orderBy: {
          order: 'asc',
        },
      },
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          billingAddress: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Find invoice by ID (without user validation - for webhooks)
 */
async function findByIdPublic(id: string): Promise<any | null> {
  return prisma.invoice.findUnique({
    where: { id },
    include: {
      client: {
        select: {
          companyName: true,
          contactName: true,
          email: true,
        },
      },
      user: {
        select: {
          name: true,
          businessName: true,
        },
      },
    },
  });
}

/**
 * Update invoice status
 */
async function updateStatus(
  id: string,
  userId: string,
  status: InvoiceStatus,
  additionalData?: Partial<Invoice>,
): Promise<Invoice> {
  return prisma.invoice.update({
    where: {
      id,
      userId,
    },
    data: {
      status,
      ...additionalData,
      updatedAt: new Date(),
    },
  });
}

/**
 * Delete invoice (hard delete)
 */
async function remove(id: string, userId: string): Promise<Invoice> {
  return prisma.invoice.delete({
    where: {
      id,
      userId,
    },
  });
}

/**
 * Get all invoices for a user with pagination
 */
async function findAllByUser(
  userId: string,
  skip: number = 0,
  take: number = 20,
  status?: InvoiceStatus,
  search?: string,
): Promise<InvoiceWithDetails[]> {
  const where: Prisma.InvoiceWhereInput = {
    userId,
  };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      {
        client: {
          companyName: { contains: search, mode: 'insensitive' },
        },
      },
    ];
  }

  return prisma.invoice.findMany({
    where,
    skip,
    take,
    orderBy: {
      createdAt: 'desc',
    },
    include: {
      lineItems: {
        orderBy: {
          order: 'asc',
        },
      },
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          billingAddress: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Count invoices for a user
 */
async function countByUser(
  userId: string,
  status?: InvoiceStatus,
  search?: string,
): Promise<number> {
  const where: Prisma.InvoiceWhereInput = {
    userId,
  };

  if (status) {
    where.status = status;
  }

  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      {
        client: {
          companyName: { contains: search, mode: 'insensitive' },
        },
      },
    ];
  }

  return prisma.invoice.count({ where });
}

/**
 * Update invoice status after payment
 * Automatically sets to PAID or PARTIALLY_PAID based on payment amount
 */
async function updateStatusAfterPayment(invoiceId: string) {
  // Get invoice with payments
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      payments: {
        where: {
          status: 'COMPLETED',
        },
      },
    },
  });

  if (!invoice) {
    throw new Error('Invoice not found');
  }

  // Calculate total paid
  const totalPaid = invoice.payments.reduce(
    (sum, payment) => sum + Number(payment.amount),
    0,
  );

  const invoiceTotal = Number(invoice.total);

  // Determine new status
  let newStatus: InvoiceStatus;
  const additionalData: any = {};

  if (totalPaid >= invoiceTotal) {
    newStatus = InvoiceStatus.PAID;
    additionalData.paidAt = new Date();
  } else if (totalPaid > 0) {
    newStatus = InvoiceStatus.PARTIALLY_PAID;
  } else {
    // No change if no payment
    return invoice;
  }

  // Update invoice status
  return prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      status: newStatus,
      ...additionalData,
    },
    include: {
      client: true,
      project: true,
      lineItems: {
        orderBy: {
          order: 'asc',
        },
      },
      payments: true,
    },
  });
}

/**
 * Duplicate invoice
 */
async function duplicate(
  id: string,
  userId: string,
  newInvoiceNumber: string,
  newIssueDate: Date,
  newDueDate: Date,
): Promise<InvoiceWithDetails> {
  const original = await findById(id, userId);

  if (!original) {
    throw new Error('Invoice not found');
  }

  return prisma.invoice.create({
    data: {
      userId: original.userId,
      clientId: original.clientId,
      projectId: original.projectId,
      invoiceNumber: newInvoiceNumber,
      status: InvoiceStatus.DRAFT,
      issueDate: newIssueDate,
      dueDate: newDueDate,
      subtotal: original.subtotal,
      taxRate: original.taxRate,
      taxAmount: original.taxAmount,
      total: original.total,
      currency: original.currency,
      notes: original.notes,
      terms: original.terms,
      lineItems: {
        create: original.lineItems.map((item: any) => ({
          description: item.description,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
          order: item.order,
        })),
      },
    },
    include: {
      lineItems: {
        orderBy: {
          order: 'asc',
        },
      },
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          billingAddress: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Mark invoice as sent
 */
async function markAsSent(id: string, userId: string): Promise<Invoice> {
  return prisma.invoice.update({
    where: {
      id,
      userId,
    },
    data: {
      status: InvoiceStatus.SENT,
      sentAt: new Date(),
      updatedAt: new Date(),
    },
  });
}

/**
 * Get overdue invoices
 */
async function findOverdue(userId: string): Promise<InvoiceWithDetails[]> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return prisma.invoice.findMany({
    where: {
      userId,
      status: InvoiceStatus.SENT,
      dueDate: {
        lt: today,
      },
    },
    orderBy: {
      dueDate: 'asc',
    },
    include: {
      lineItems: {
        orderBy: {
          order: 'asc',
        },
      },
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          billingAddress: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });
}

/**
 * Update overdue invoices status
 */
async function updateOverdueStatus(userId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const result = await prisma.invoice.updateMany({
    where: {
      userId,
      status: InvoiceStatus.SENT,
      dueDate: {
        lt: today,
      },
    },
    data: {
      status: InvoiceStatus.OVERDUE,
      updatedAt: new Date(),
    },
  });

  return result.count;
}

/**
 * Get invoices by IDs (for batch operations)
 */
async function findByIds(
  ids: string[],
  userId: string,
): Promise<InvoiceWithDetails[]> {
  return prisma.invoice.findMany({
    where: {
      id: { in: ids },
      userId,
    },
    include: {
      lineItems: {
        orderBy: {
          order: 'asc',
        },
      },
      client: {
        select: {
          id: true,
          companyName: true,
          contactName: true,
          email: true,
          billingAddress: true,
        },
      },
      project: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });
}

export default {
  findByIdPublic,
  updateStatusAfterPayment,
  existsForUser,
  findById,
  generateInvoiceNumber,
  create,
  update,
  updateStatus,
  remove,
  findAllByUser,
  countByUser,
  duplicate,
  markAsSent,
  findOverdue,
  updateOverdueStatus,
  findByIds,
};
