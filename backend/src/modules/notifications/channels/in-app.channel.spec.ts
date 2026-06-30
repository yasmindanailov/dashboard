import { InAppChannel } from './in-app.channel';
import { PrismaService } from '../../../core/database/prisma.service';
import {
  NotificationRecipient,
  RenderedNotification,
} from '../interfaces/notification-channel.interface';

/**
 * F3·E10 — el InAppChannel es el ÚNICO que persiste filas en `notifications`,
 * así que es donde se calcula y escribe `category` (derivada de
 * `metadata.event` vía la taxonomía). Estos tests blindan esa escritura.
 */
describe('InAppChannel — persistencia de category (F3·E10)', () => {
  let channel: InAppChannel;
  let create: jest.Mock;

  const recipient: NotificationRecipient = {
    user_id: 'u1',
    email: 'cliente@example.com',
    first_name: 'C',
    last_name: 'X',
    language: 'es',
  };

  const buildRendered = (
    metadata: Record<string, unknown> | undefined,
  ): RenderedNotification => ({
    event_type: 'invoice.paid',
    subject: 'Asunto',
    body: 'Cuerpo',
    metadata,
  });

  /** Categoría con la que se llamó a `notification.create` (primera llamada). */
  const persistedCategory = (): string => {
    const calls = create.mock.calls as Array<[{ data: { category: string } }]>;
    return calls[0][0].data.category;
  };

  beforeEach(() => {
    create = jest.fn().mockResolvedValue({ id: 'n1' });
    const prisma = {
      notification: { create },
    } as unknown as PrismaService;
    channel = new InAppChannel(prisma);
  });

  it('deriva category desde metadata.event y la persiste', async () => {
    await channel.send(buildRendered({ event: 'invoice.paid' }), recipient);
    expect(persistedCategory()).toBe('facturacion');
  });

  it('usa general cuando metadata.event falta (notificación legacy)', async () => {
    await channel.send(buildRendered(undefined), recipient);
    expect(persistedCategory()).toBe('general');
  });

  it('usa general cuando el event no está en la taxonomía', async () => {
    await channel.send(buildRendered({ event: 'desconocido.x' }), recipient);
    expect(persistedCategory()).toBe('general');
  });

  it('mapea un evento admin (plugins) correctamente', async () => {
    await channel.send(
      buildRendered({ event: 'plugin.circuit_opened' }),
      recipient,
    );
    expect(persistedCategory()).toBe('plugins');
  });
});
