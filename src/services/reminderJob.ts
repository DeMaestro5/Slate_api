import cron from 'node-cron';
import prisma from '../database/index';
import ReminderRepo from '../database/repository/ReminderRepo';
import { sendReminderEmail } from './Email.service';
import { logEmail } from './emailLog';
import { EmailStatus, EmailType, InvoiceStatus } from '@prisma/client';
import logger from '../core/Logger';

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(
    amount,
  );
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function runReminderJob(): Promise<void> {
  logger.info('[ReminderJob] Starting reminder job');

  const enabledSettings = await ReminderRepo.findAllEnabled();
  if (!enabledSettings.length) {
    logger.info('[ReminderJob] No users with reminders enabled');
    return;
  }

  const today = startOfDayUTC(new Date());
  let totalSent = 0;
  let totalSkipped = 0;

  for (const setting of enabledSettings) {
    const { userId, beforeDueDays, afterDueDays } = setting;

    // Build target dates for this user
    const targetDates: Array<{ date: Date; daysOffset: number }> = [];

    for (const days of beforeDueDays) {
      const target = new Date(today);
      target.setUTCDate(target.getUTCDate() + days);
      targetDates.push({ date: target, daysOffset: -days });
    }
    for (const days of afterDueDays) {
      const target = new Date(today);
      target.setUTCDate(target.getUTCDate() - days);
      targetDates.push({ date: target, daysOffset: days });
    }

    for (const { date, daysOffset } of targetDates) {
      const invoices = await prisma.invoice.findMany({
        where: {
          userId,
          status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] },
          dueDate: {
            gte: startOfDayUTC(date),
            lt: new Date(startOfDayUTC(date).getTime() + 86400000),
          },
        },
        include: {
          client: {
            select: { email: true, contactName: true, companyName: true },
          },
          user: { select: { name: true } },
        },
      });

      for (const invoice of invoices) {
        if (!invoice.client?.email) {
          totalSkipped++;
          continue;
        }

        // Skip if already reminded today
        if (
          invoice.lastReminderSentAt &&
          startOfDayUTC(invoice.lastReminderSentAt).getTime() ===
            today.getTime()
        ) {
          totalSkipped++;
          continue;
        }

        const clientName =
          invoice.client?.contactName ||
          invoice.client?.companyName ||
          'Client';
        const total = formatCurrency(Number(invoice.total), invoice.currency);
        const dueDate = formatDate(invoice.dueDate);

        let sent = false;
        let emailError: string | undefined;

        try {
          sent = await sendReminderEmail(
            invoice.client?.email,
            clientName,
            invoice.invoiceNumber,
            total,
            dueDate,
            daysOffset,
          );
          if (!sent) emailError = 'Provider did not confirm send';
        } catch (err) {
          emailError = err instanceof Error ? err.message : 'Send failed';
        }

        if (sent) {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              lastReminderSentAt: new Date(),
              reminderCount: { increment: 1 },
            },
          });
          totalSent++;
        } else {
          totalSkipped++;
        }

        await logEmail({
          userId,
          recipient: invoice.client?.email,
          subject: `Reminder: Invoice ${invoice.invoiceNumber}`,
          type: EmailType.REMINDER,
          status: sent ? EmailStatus.SENT : EmailStatus.FAILED,
          invoiceId: invoice.id,
          sentAt: sent ? new Date() : undefined,
          error: emailError,
        });
      }
    }
  }

  logger.info(
    `[ReminderJob] Done — sent: ${totalSent}, skipped: ${totalSkipped}`,
  );
}

export function startReminderJob(): void {
  // Runs every day at 08:00 UTC
  cron.schedule('0 8 * * *', async () => {
    try {
      await runReminderJob();
    } catch (err) {
      logger.error('[ReminderJob] Fatal error', { err });
    }
  });
  logger.info('[ReminderJob] Scheduled — runs daily at 08:00 UTC');
}
