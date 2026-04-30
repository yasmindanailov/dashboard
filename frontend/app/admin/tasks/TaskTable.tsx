'use client';

/* ═══════════════════════════════════════
   TaskTable — List component for tasks
   Ref: UI_SPEC.md §5.15, Regla 15
   ═══════════════════════════════════════ */

import Link from 'next/link';
import { Table, Badge, Pagination } from '../../components/ui';
import type { TableColumn, BadgeVariant } from '../../components/ui';
import type { Task, TaskListResponse } from './types';
import {
  TASK_TYPE_LABELS, TASK_STATUS_LABELS,
  TASK_STATUS_VARIANTS, TASK_PRIORITY_COLORS,
} from './types';
import styles from './tasks.module.css';

interface Props {
  data: TaskListResponse | null;
  page: number;
  onPageChange: (p: number) => void;
  showAgentColumn: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function isOverdue(task: Task): boolean {
  if (!task.due_date) return false;
  if (['completed', 'cancelled'].includes(task.status)) return false;
  return new Date(task.due_date) < new Date();
}

export default function TaskTable({ data, page, onPageChange, showAgentColumn }: Props) {
  if (!data) return null;

  const columns: TableColumn<Task>[] = [
    {
      key: 'priority',
      header: '',
      width: '8px',
      render: (t: Task) => (
        // Inline style justificado: color dinámico por priority. La clase
        // `.priorityBar` aporta dimensiones + radius; el background lo
        // resuelve `TASK_PRIORITY_COLORS` (tokens canónicos DS post B.3).
        <div
          className={styles.priorityBar}
          style={{
            backgroundColor: TASK_PRIORITY_COLORS[t.priority] || 'var(--border)',
          }}
        />
      ),
    },
    {
      key: 'title',
      header: 'Tarea',
      render: (t: Task) => (
        <div className={styles.titleCell}>
          <Link href={`/admin/tasks/${t.id}`} className={styles.titleLink}>
            {t.title}
          </Link>
          {/* Sprint 8 Fase B.7 (2026-04-29) — ADR-073: porqué humano +
              chips de tags como segunda línea bajo el título. */}
          {t.reason && <span className={styles.titleReason}>{t.reason}</span>}
          {t.tag_assignments && t.tag_assignments.length > 0 && (
            <div className={styles.titleTags}>
              {t.tag_assignments.slice(0, 3).map((a) => (
                <span
                  key={a.tag.id}
                  className={styles.titleTagChip}
                  style={
                    a.tag.color
                      ? {
                          backgroundColor: `${a.tag.color}1A`,
                          color: a.tag.color,
                          borderColor: `${a.tag.color}33`,
                        }
                      : undefined
                  }
                >
                  {a.tag.label}
                </span>
              ))}
              {t.tag_assignments.length > 3 && (
                <span className={styles.titleTagMore}>
                  +{t.tag_assignments.length - 3}
                </span>
              )}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'client',
      header: 'Cliente',
      render: (t: Task) => t.client ? (
        <Link href={`/admin/clients/${t.client.id}`} className={styles.clientLink}>
          {t.client.first_name} {t.client.last_name}
        </Link>
      ) : '—',
    },
    {
      key: 'type',
      header: 'Tipo',
      width: '140px',
      render: (t: Task) => (
        <Badge variant="neutral">{TASK_TYPE_LABELS[t.type] || t.type}</Badge>
      ),
    },
  ];

  if (showAgentColumn) {
    columns.push({
      key: 'assignee',
      header: 'Agente',
      width: '150px',
      render: (t: Task) => t.assignee ? (
        <span className={styles.assignee}>{t.assignee.first_name} {t.assignee.last_name}</span>
      ) : (
        <span className={styles.unassigned}>Sin asignar</span>
      ),
    });
  }

  columns.push(
    {
      key: 'due_date',
      header: 'Vencimiento',
      width: '120px',
      render: (t: Task) => (
        <span className={`${styles.dueDate} ${isOverdue(t) ? styles.overdue : ''}`}>
          {formatDate(t.due_date)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      width: '130px',
      render: (t: Task) => (
        <Badge variant={(TASK_STATUS_VARIANTS[t.status] as BadgeVariant) || 'neutral'}>
          {TASK_STATUS_LABELS[t.status] || t.status}
        </Badge>
      ),
    },
  );

  return (
    <>
      <Table columns={columns} data={data.data} rowKey={(t: Task) => t.id} />
      {data.meta.totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={data.meta.totalPages}
          onPageChange={onPageChange}
        />
      )}
    </>
  );
}
