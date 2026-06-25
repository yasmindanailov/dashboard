import { JwtService } from '@nestjs/jwt';
import { Server } from 'socket.io';

import { SupportGateway } from './support.gateway';
import { SupportService } from './support.service';
import { PrismaService } from '../../core/database/prisma.service';

/**
 * Regresión SUPP-INV-3 (audit 2026-06-25, GL-3): las NOTAS INTERNAS
 * (`is_internal`) son solo para staff y NUNCA deben emitirse a la room
 * `conversation:<id>` (donde también está el cliente). Deben ir solo a
 * `agent:inbox`. Antes del fix, `broadcastNewMessage` emitía el payload
 * completo (incl. `is_internal:true` + body) a la room del cliente.
 */
describe('SupportGateway.broadcastNewMessage — aislamiento de notas internas (SUPP-INV-3, GL-3)', () => {
  let gateway: SupportGateway;
  let emit: jest.Mock;
  let to: jest.Mock;

  beforeEach(() => {
    gateway = new SupportGateway(
      {} as unknown as JwtService,
      {} as unknown as SupportService,
      {} as unknown as PrismaService,
    );
    emit = jest.fn();
    to = jest.fn(() => ({ emit }));
    gateway.server = { to } as unknown as Server;
  });

  it('emite una nota interna SOLO a agent:inbox (nunca a la room del cliente)', () => {
    gateway.broadcastNewMessage(
      'conv-1',
      { id: 'm1', is_internal: true, body: 'nota privada del agente' },
      true,
    );

    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith('agent:inbox');
    expect(to).not.toHaveBeenCalledWith('conversation:conv-1');
    expect(emit).toHaveBeenCalledWith(
      'message:new',
      expect.objectContaining({ conversationId: 'conv-1' }),
    );
  });

  it('emite un mensaje público a la room de la conversación', () => {
    gateway.broadcastNewMessage(
      'conv-1',
      { id: 'm2', is_internal: false, body: 'hola, ¿en qué te ayudo?' },
      false,
    );

    expect(to).toHaveBeenCalledTimes(1);
    expect(to).toHaveBeenCalledWith('conversation:conv-1');
    expect(to).not.toHaveBeenCalledWith('agent:inbox');
  });

  it('por defecto (isInternal omitido) trata el mensaje como público', () => {
    gateway.broadcastNewMessage('conv-2', { id: 'm3' });

    expect(to).toHaveBeenCalledWith('conversation:conv-2');
    expect(to).not.toHaveBeenCalledWith('agent:inbox');
  });
});
