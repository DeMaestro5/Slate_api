import { PrismaClient, MilestoneStatus, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

interface OldMilestoneItem {
  milestone: string;
  amount: number;
  dueDate?: string;
  status?: 'pending' | 'invoiced' | 'paid';
}

function mapStatus(old?: string): MilestoneStatus {
  switch (old) {
    case 'invoiced':
      return MilestoneStatus.INVOICED;
    case 'paid':
      return MilestoneStatus.PAID;
    case 'pending':
    default:
      return MilestoneStatus.PENDING;
  }
}

async function main() {
  const projects = await prisma.project.findMany({
    where: { paymentPlan: { not: Prisma.JsonNull } },
  });

  console.log(`Found ${projects.length} project(s) with a paymentPlan`);

  let created = 0;

  for (const project of projects) {
    const items = project.paymentPlan as unknown as OldMilestoneItem[] | null;

    if (!Array.isArray(items) || items.length === 0) {
      console.log(`Skipping project ${project.id} — empty/invalid paymentPlan`);
      continue;
    }

    // Idempotency guard: skip if this project already has milestones
    // (safe to re-run the script without creating duplicates)
    const existing = await prisma.milestone.count({
      where: { projectId: project.id },
    });
    if (existing > 0) {
      console.log(
        `Skipping project ${project.id} — already has ${existing} milestone(s)`,
      );
      continue;
    }

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await prisma.milestone.create({
        data: {
          projectId: project.id,
          name: item.milestone,
          amount: item.amount,
          order: i,
          status: mapStatus(item.status),
          dueDate: item.dueDate ? new Date(item.dueDate) : null,
        },
      });
      created++;
    }

    console.log(`Project ${project.id}: created ${items.length} milestone(s)`);
  }

  console.log(`Done. Total milestones created: ${created}`);
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
