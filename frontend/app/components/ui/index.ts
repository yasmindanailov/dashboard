/**
 * Aelium Design System — Component Barrel Export
 *
 * Usage:
 *   import { Button, Badge, Select, Pagination } from '@/components/ui';
 *
 * Ref: docs/DESIGN_SYSTEM.md
 */

export { Button, type ButtonProps } from './Button';
export { Badge, type BadgeProps, type BadgeVariant } from './Badge';
export { StatusDot, type StatusDotProps, type StatusDotColor } from './StatusDot';
export { Card, type CardProps } from './Card';
export { Input, type InputProps } from './Input';
export { Select, type SelectProps, type SelectOption } from './Select';
export { SearchInput, type SearchInputProps } from './SearchInput';
export { Textarea, type TextareaProps } from './Textarea';
export { Modal, type ModalProps } from './Modal';
export { Table, type TableProps, type TableColumn, type TableSort, type SortDirection } from './Table';
export { ToastProvider, useToast, type ToastVariant, type ToastMessage } from './Toast';
export { Tabs, type TabsProps, type Tab } from './Tabs';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { Skeleton, type SkeletonProps } from './Skeleton';
export { Avatar, type AvatarProps } from './Avatar';
export { Tooltip, type TooltipProps } from './Tooltip';
export { Dropdown, type DropdownProps, type DropdownItem } from './Dropdown';
export { Pagination, type PaginationProps } from './Pagination';
export { StatsCard, type StatsCardProps, type StatsCardTrend } from './StatsCard';
export { StatusTabs, type StatusTabsProps, type StatusTab, type StatusTabVariant } from './StatusTabs';
export { Breadcrumb, type BreadcrumbProps, type BreadcrumbItem } from './Breadcrumb';
export { AlertBanner, type AlertBannerProps, type AlertBannerVariant } from './AlertBanner';

/* ── Layout Components (UI_SPEC §2-§3) ── */
export { PageHeader, type PageHeaderProps } from './PageHeader/PageHeader';
export { FilterBar, type FilterBarProps } from './FilterBar/FilterBar';
export { ListPage, type ListPageProps } from './ListPage/ListPage';
export { DetailPage, type DetailPageProps, type DetailTab } from './DetailPage/DetailPage';
export { FormPage, type FormPageProps } from './FormPage/FormPage';
export { default as ContextBackLink } from './ContextBackLink';

/* ── Contextual Help (UI_SPEC §4.12) ── */
export { HelpTip, type HelpTipProps } from './HelpTip';

/* ── Command Palette (UI_SPEC §4.10) ── */
export { CommandPalette } from './CommandPalette';

/* ── Bulk Actions (UI_SPEC §4.11) ── */
export { BulkActionBar, type BulkActionBarProps } from './BulkActionBar';

/* ── Portal identity (ADR-066) ── */
export { PortalBadge, type PortalBadgeProps } from './PortalBadge';

/* ── Editor patterns (ADR-075 §B.2 — extensible section cards) ── */
export {
  EditorSectionCard,
  type EditorSectionCardProps,
} from './EditorSectionCard';
