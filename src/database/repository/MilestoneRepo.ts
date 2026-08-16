import { MilestoneStatus } from '@prisma/client';
import prisma from '../index';

async function existsForUser(id: string, userId: string): Promise<boolean> {
  const count = await prisma.milestone.count({
    where: { id, project: { userId } },
  });
  return count > 0;
}

async function findByProjectId(projectId: string) {
  return prisma.milestone.findMany({
    where: { projectId },
    orderBy: { order: 'asc' },
    include: { invoice: { select: { id: true, status: true } } },
  });
}

async function findById(id: string) {
  return prisma.milestone.findUnique({
    where: { id },
    include: { invoice: { include: { client: true } }, project: true },
  });
}

async function create(
  projectId: string,
  data: {
    name: string;
    amount: number;
    order: number;
    dueDate?: Date | null;
    invoiceId: string | null;
  },
) {
  return prisma.milestone.create({
    data: { projectId, ...data },
  });
}

async function update(
  id: string,
  data: Partial<{
    name: string;
    amount: number;
    dueDate: Date | null;
    invoiceId: string | null;
  }>,
) {
  return prisma.milestone.update({ where: { id }, data });
}

async function markComplete(id: string) {
  return prisma.milestone.update({
    where: { id },
    data: {
      status: MilestoneStatus.COMPLETED,
      completedAt: new Date(),
    },
  });
}

async function remove(id: string) {
  return prisma.milestone.delete({ where: { id } });
}

export default {
  existsForUser,
  findByProjectId,
  findById,
  create,
  update,
  markComplete,
  remove,
};
