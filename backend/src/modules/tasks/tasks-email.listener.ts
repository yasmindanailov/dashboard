import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../core/database/prisma.service';
import { EmailService } from '../../core/email/email.service';

interface TaskAssignedPayload {
  task: {
    id: string;
    title: string;
    type: string;
    priority: string;
    assigned_to: string | null;
    due_date: Date | null;
    description: string | null;
  };
  assignedBy: string;
}

@Injectable()
export class TasksEmailListener {
  private readonly logger = new Logger(TasksEmailListener.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  @OnEvent('task.assigned')
  async handleTaskAssigned(payload: TaskAssignedPayload): Promise<void> {
    const { task } = payload;
    if (!task.assigned_to) return;

    const agent = await this.prisma.user.findUnique({
      where: { id: task.assigned_to },
      select: { email: true, first_name: true },
    });
    if (!agent) {
      this.logger.warn(
        `task.assigned: agent ${task.assigned_to} not found for task ${task.id}`,
      );
      return;
    }

    const appUrl = this.config.get<string>(
      'NEXT_PUBLIC_APP_URL',
      'http://localhost:3002',
    );
    const taskUrl = `${appUrl}/dashboard/tasks/${task.id}`;
    const dueLabel = task.due_date
      ? new Date(task.due_date).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        })
      : 'Sin fecha límite';

    await this.emailService.send({
      to: agent.email,
      subject: `Nueva tarea asignada: ${task.title}`,
      html: `
        <div style="font-family: 'Inter', -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #635BFF 0%, #8B5CF6 100%); padding: 32px; border-radius: 16px 16px 0 0;">
            <h1 style="color: #fff; margin: 0; font-size: 24px;">Tarea asignada</h1>
            <p style="color: rgba(255,255,255,0.85); margin: 8px 0 0; font-size: 14px;">${task.type} · ${task.priority}</p>
          </div>
          <div style="background: #fff; padding: 32px; border: 1px solid #f0f0f0; border-top: none; border-radius: 0 0 16px 16px;">
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Hola ${agent.first_name || 'agente'},
            </p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">
              Se te ha asignado una nueva tarea: <strong>${task.title}</strong>.
            </p>
            <div style="background: #f9fafb; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <table style="width: 100%; font-size: 14px; color: #374151;">
                <tr><td style="padding: 4px 0; color: #9ca3af;">Tipo:</td><td style="text-align: right; font-weight: 600;">${task.type}</td></tr>
                <tr><td style="padding: 4px 0; color: #9ca3af;">Prioridad:</td><td style="text-align: right;">${task.priority}</td></tr>
                <tr><td style="padding: 4px 0; color: #9ca3af;">Vence:</td><td style="text-align: right;">${dueLabel}</td></tr>
              </table>
            </div>
            <p style="text-align: center; margin: 24px 0;">
              <a href="${taskUrl}" style="display: inline-block; background: #635BFF; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Ver tarea</a>
            </p>
          </div>
        </div>
      `,
    });

    await this.prisma.notification.create({
      data: {
        user_id: task.assigned_to,
        channel: 'internal',
        title: `Nueva tarea: ${task.title}`,
        body:
          task.description?.slice(0, 200) ||
          `Se te ha asignado una tarea de tipo ${task.type}.`,
        action_url: `/dashboard/tasks/${task.id}`,
        metadata: {
          event: 'task.assigned',
          task_id: task.id,
          assigned_by: payload.assignedBy,
        },
      },
    });

    this.logger.log(
      `task.assigned → email + notification to agent ${agent.email} (task ${task.id})`,
    );
  }
}
