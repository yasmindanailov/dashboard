'use client';

import { useState } from 'react';
import {
  Button,
  Badge,
  StatusDot,
  Card,
  Input,
  Modal,
  Tabs,
  StatusTabs,
  EmptyState,
  Skeleton,
  Avatar,
  Tooltip,
  Dropdown,
  Table,
  useToast,
  AlertBanner,
  HelpTip,
  Toggle,
  IconWell,
  SegmentedControl,
  PasswordStrengthMeter,
  NotificationRow,
  OTPInput,
  Stepper,
  PricingCard,
  OrderSummary,
  PaymentMethodCard,
  ActivityRow,
  BrandMark,
  CartLineItem,
  SidebarConversationList,
  type TableColumn,
  type TableSort,
} from '../../components/ui';
import {
  Shield,
  Bell,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Search,
  Sparkles,
  CreditCard,
  Briefcase,
  Globe,
  Server,
} from 'lucide-react';

/* ── Mock data for Table demo ── */
interface DemoClient {
  id: number;
  name: string;
  email: string;
  plan: string;
  status: 'active' | 'inactive';
}

const DEMO_CLIENTS: DemoClient[] = [
  { id: 1, name: 'Juan García', email: 'juan@empresa.com', plan: 'Web Pro', status: 'active' },
  { id: 2, name: 'María López', email: 'maria@startup.io', plan: 'Web Business', status: 'active' },
  { id: 3, name: 'Carlos Ruiz', email: 'carlos@agencia.es', plan: 'Agency Starter', status: 'inactive' },
  { id: 4, name: 'Ana Martín', email: 'ana@tienda.com', plan: 'Web Inicio', status: 'active' },
];

const DEMO_COLUMNS: TableColumn<DemoClient>[] = [
  { key: 'name', header: 'Cliente', sortable: true, render: (c) => (
    <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <Avatar name={c.name} size="sm" />
      <span style={{ fontWeight: 'var(--font-weight-medium)' }}>{c.name}</span>
    </span>
  )},
  { key: 'email', header: 'Email', render: (c) => (
    <span style={{ color: 'var(--text-secondary)' }}>{c.email}</span>
  )},
  { key: 'plan', header: 'Plan', sortable: true },
  { key: 'status', header: 'Estado', render: (c) => (
    <Badge variant={c.status === 'active' ? 'success' : 'neutral'}>
      {c.status === 'active' ? 'Activo' : 'Inactivo'}
    </Badge>
  )},
];

export default function DesignSystemPreview() {
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [tableSort, setTableSort] = useState<TableSort>({ key: 'name', direction: 'asc' });
  const [_tableLoading, _setTableLoading] = useState(false);
  const [toggleOn, setToggleOn] = useState(true);
  const [segMode, setSegMode] = useState('name');
  const [otp, setOtp] = useState('');
  const [introKey, setIntroKey] = useState(0);
  const { toast, toastUndo } = useToast();

  const handleLoadingDemo = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <div style={{ padding: 'var(--space-8)', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-semibold)', marginBottom: 'var(--space-2)' }}>
        Aelium Design System
      </h1>
      <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)', marginBottom: 'var(--space-8)' }}>
        Preview de todos los componentes base. Esta página es temporal.
      </p>

      {/* ── Buttons ── */}
      <Section title="Button">
        <Row>
          <Button variant="primary">Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Peligro</Button>
        </Row>
        <Row label="Tamaños">
          <Button size="sm">Pequeño</Button>
          <Button size="md">Mediano</Button>
          <Button size="lg">Grande</Button>
        </Row>
        <Row label="Estados">
          <Button loading onClick={handleLoadingDemo}>Cargando</Button>
          <Button disabled>Desactivado</Button>
          <Button variant="primary" fullWidth>Ancho completo</Button>
        </Row>
        <Row label="Con loading real">
          <Button loading={loading} onClick={handleLoadingDemo}>
            {loading ? 'Guardando...' : 'Guardar cambios'}
          </Button>
        </Row>
      </Section>

      {/* ── Badge ── */}
      <Section title="Badge">
        <Row>
          <Badge variant="neutral">Neutro</Badge>
          <Badge variant="success">Activo</Badge>
          <Badge variant="warning">Pendiente</Badge>
          <Badge variant="danger">Error</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="brand">Brand</Badge>
        </Row>
      </Section>

      {/* ── StatusDot ── */}
      <Section title="StatusDot">
        <Row>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <StatusDot color="success" pulse /> En línea
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <StatusDot color="danger" /> Desconectado
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <StatusDot color="warning" /> Ausente
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <StatusDot color="neutral" /> Inactivo
          </span>
        </Row>
      </Section>

      {/* ── Toggle (F1a) ── */}
      <Section title="Toggle / Switch">
        <Row>
          <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <Toggle checked={toggleOn} onChange={setToggleOn} aria-label="Demo toggle" />
            {toggleOn ? 'Activado' : 'Desactivado'}
          </span>
          <Toggle checked={false} onChange={() => {}} aria-label="Toggle off" />
          <Toggle checked disabled onChange={() => {}} aria-label="Toggle deshabilitado" />
        </Row>
      </Section>

      {/* ── IconWell (F1a) ── */}
      <Section title="IconWell">
        <Row label="Tonos">
          <IconWell icon={Shield} tone="brand" />
          <IconWell icon={CheckCircle2} tone="success" />
          <IconWell icon={AlertTriangle} tone="warning" />
          <IconWell icon={Bell} tone="danger" />
          <IconWell icon={Wrench} tone="neutral" />
        </Row>
        <Row label="Tamaños">
          <IconWell icon={Shield} size="sm" />
          <IconWell icon={Shield} size="md" />
          <IconWell icon={Shield} size="lg" />
        </Row>
      </Section>

      {/* ── SegmentedControl (F1a) ── */}
      <Section title="SegmentedControl">
        <Row>
          <SegmentedControl
            options={[
              { value: 'name', label: 'Por nombre', icon: Search },
              { value: 'ai', label: 'Con IA', icon: Sparkles },
            ]}
            value={segMode}
            onChange={setSegMode}
            aria-label="Modo de búsqueda"
          />
        </Row>
      </Section>

      {/* ── PasswordStrengthMeter (F1a) ── */}
      <Section title="PasswordStrengthMeter">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', maxWidth: 520 }}>
          <PasswordStrengthMeter score={1} />
          <PasswordStrengthMeter score={2} />
          <PasswordStrengthMeter score={3} />
          <PasswordStrengthMeter score={4} />
        </div>
      </Section>

      {/* ── NotificationRow (F1a) ── */}
      <Section title="NotificationRow">
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', maxWidth: 640 }}>
          <NotificationRow
            icon={CreditCard}
            tone="brand"
            title="Factura disponible"
            category="Facturación"
            body="Tu factura de junio (24,20 €) ya está lista para descargar."
            time="hace 2 h"
            unread
            actionLabel="Ver factura"
          />
          <NotificationRow
            icon={CheckCircle2}
            tone="success"
            title="Servicio activado"
            category="Servicios"
            body="Tu hosting Web Pro se ha aprovisionado correctamente."
            time="ayer"
            actionLabel="Abrir servicio"
          />
          <NotificationRow
            icon={Bell}
            tone="warning"
            title="Tu dominio expira pronto"
            category="Dominios"
            body="aelium.net se renueva el 12 de julio. Revisa la auto-renovación."
            time="hace 3 d"
          />
        </div>
      </Section>

      {/* ── Stepper (F1a) ── */}
      <Section title="Stepper">
        <Row>
          <Stepper steps={['Configurar', 'Carrito', 'Facturación', 'Confirmar']} current={3} />
        </Row>
        <Row label="A mitad">
          <Stepper steps={['Configurar', 'Carrito', 'Facturación', 'Confirmar']} current={1} />
        </Row>
        <Row label="Vertical (FSM)">
          <div style={{ maxWidth: 420 }}>
            <Stepper
              orientation="vertical"
              current={1}
              steps={[
                { label: 'Código recibido', sub: 'Recibimos tu código de autorización (EPP).' },
                { label: 'Transferencia en curso', sub: 'El registrador actual tiene 5-7 días para aprobarla.' },
                { label: 'Completada', sub: 'El dominio queda en Aelium.' },
              ]}
            />
          </div>
        </Row>
      </Section>

      {/* ── OTPInput (F1a) ── */}
      <Section title="OTPInput">
        <div style={{ maxWidth: 320 }}>
          <OTPInput value={otp} onChange={setOtp} aria-label="Código de verificación" />
          <p style={{ marginTop: 'var(--space-3)', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
            Valor: {otp || '—'}
          </p>
        </div>
      </Section>

      {/* ── PricingCard (F1a) ── */}
      <Section title="PricingCard">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', maxWidth: 620, paddingTop: 'var(--space-3)' }}>
          <PricingCard
            name="Web Inicio"
            description="Para empezar con buen pie."
            showFrom
            price="6 €"
            period="/mes"
            priceNote="facturado anual · IVA incl."
            features={['2 GB SSD', '1 web · 3 cuentas', 'SSL y copias de seguridad']}
            ctaLabel="Configurar"
          />
          <PricingCard
            name="Web Pro"
            description="Para webs que crecen y venden."
            showFrom
            price="12 €"
            period="/mes"
            priceNote="facturado anual · IVA incl."
            features={['10 GB SSD', '3 webs · 10 cuentas · Staging', 'SSL, copias y optimización']}
            highlighted
            badge={{ label: 'Recomendado', tone: 'brand' }}
            ctaLabel="Configurar"
          />
        </div>
      </Section>

      {/* ── OrderSummary (F1a) ── */}
      <Section title="OrderSummary">
        <div style={{ maxWidth: 320 }}>
          <OrderSummary
            lines={[
              { label: 'Web Pro · anual', value: '115,20 €' },
              { label: 'minegocio.com', value: 'Gratis', free: true },
              { label: 'Base imponible', value: '95,21 €', divider: true },
              { label: 'IVA (21%)', value: '19,99 €' },
            ]}
            totalValue="115,20 €"
          />
        </div>
      </Section>

      {/* ── PaymentMethodCard (F1a) ── */}
      <Section title="PaymentMethodCard">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)', maxWidth: 560 }}>
          <PaymentMethodCard
            icon={Briefcase}
            label="Perfil"
            title="Sara Gómez Ruiz"
            subtitle="Autónoma · NIF 12345678Z"
          />
          <PaymentMethodCard
            icon={CreditCard}
            label="Pago"
            title="Visa •••• 4242"
            subtitle="vía Stripe · caduca 06/27"
          />
        </div>
      </Section>

      {/* ── ActivityRow (F1a) ── */}
      <Section title="ActivityRow">
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '4px 20px', maxWidth: 560 }}>
          <ActivityRow initials="LF" meta="hoy, 09:14">
            <strong>Luis Ferrer</strong> revisó tu web
          </ActivityRow>
          <ActivityRow icon={CheckCircle2} tone="success" meta="12 jun, 11:20">
            <strong>Mantenimiento</strong> completado
          </ActivityRow>
          <ActivityRow icon={Shield} tone="brand" meta="12 jun, 14:32">
            <strong>Luis Ferrer</strong> accedió al panel de tu hosting
          </ActivityRow>
          <ActivityRow icon={Bell} tone="warning" meta="10 jun, 11:05">
            Registro DNS actualizado
          </ActivityRow>
        </div>
      </Section>

      {/* ── BrandMark (F1d) ── */}
      <Section title="BrandMark">
        <Row label="Isotipo">
          <BrandMark size={28} />
          <BrandMark size={40} />
          <BrandMark size={56} />
        </Row>
        <Row label="Con wordmark">
          <BrandMark size={32} withWordmark />
        </Row>
        <Row label="Mono (currentColor)">
          <span style={{ color: 'var(--text-primary)' }}><BrandMark size={32} mono /></span>
          <span style={{ color: 'var(--brand)' }}><BrandMark size={32} mono withWordmark /></span>
        </Row>
        <Row label="Animación de entrada «01 · Ensamblaje» (intro · al montar)">
          <BrandMark key={`i-${introKey}`} size={48} intro />
          <BrandMark key={`iw-${introKey}`} size={32} withWordmark intro />
          <Button size="sm" variant="secondary" onClick={() => setIntroKey((n) => n + 1)}>
            Reproducir
          </Button>
        </Row>
      </Section>

      {/* ── CartLineItem (componente nuevo) ── */}
      <Section title="CartLineItem">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', maxWidth: 560 }}>
          <CartLineItem
            icon={Server}
            name="Web Pro"
            badge={{ label: 'Anual', variant: 'brand' }}
            sub="Hosting gestionado · 10 GB SSD"
            renewNote="Se renueva el 14 jun 2027"
            price="115,20 €"
            term="/año"
            onEdit={() => {}}
            onRemove={() => {}}
          />
          <CartLineItem
            icon={Globe}
            name="minegocio.com"
            sub="Dominio · registro 1 año"
            warning=".es requiere NIF español — completa tus datos fiscales antes de pagar."
            originalPrice="12,00 €"
            price="Gratis"
            priceFree
            term="primer año"
            onRemove={() => {}}
          />
        </div>
      </Section>

      {/* ── SidebarConversationList (componente nuevo) ── */}
      <Section title="SidebarConversationList">
        <div style={{ width: 260, padding: 'var(--space-3)', background: 'var(--surface-secondary)', borderRadius: 'var(--radius-lg)' }}>
          <SidebarConversationList
            openCount={2}
            cta={{ label: 'Escribir a Luis' }}
            items={[
              { id: '1', title: 'Migración de mi web', preview: 'Luis: ya está casi listo…', time: '9:14', tone: 'brand', status: 'open', unread: true, onClick: () => {} },
              { id: '2', title: 'Factura de junio', preview: 'Tú: ¿incluye el dominio?', time: 'ayer', tone: 'success', status: 'open', onClick: () => {} },
              { id: '3', title: 'Cambio de plan', preview: 'Resuelta · gracias', time: '3 jun', channel: 'whatsapp', tone: 'neutral', status: 'resolved', onClick: () => {} },
            ]}
          />
        </div>
      </Section>

      {/* ── Card ── */}
      <Section title="Card">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <Card>
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Card default</p>
            <p style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)' }}>24 clientes</p>
          </Card>
          <Card variant="interactive">
            <p style={{ margin: 0, fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>Card interactive</p>
            <p style={{ margin: 0, fontSize: 'var(--font-size-lg)', fontWeight: 'var(--font-weight-semibold)' }}>Hover me</p>
          </Card>
        </div>
      </Section>

      {/* ── Input ── */}
      <Section title="Input">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <Input label="Nombre" placeholder="Juan García" />
          <Input label="Email" placeholder="juan@empresa.com" type="email" />
          <Input label="Con error" placeholder="..." error="Este campo es obligatorio" />
          <Input label="Con ayuda" placeholder="..." helperText="Mínimo 8 caracteres" />
        </div>
      </Section>

      {/* ── Tabs ── */}
      <Section title="Tabs">
        <Tabs
          tabs={[
            { id: 'overview', label: 'Resumen' },
            { id: 'tickets', label: 'Tickets', count: 12 },
            { id: 'chats', label: 'Chats', count: 3 },
            { id: 'history', label: 'Historial' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
        <div style={{ padding: 'var(--space-4) 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
          Tab activa: <strong>{activeTab}</strong>
        </div>
      </Section>

      {/* ── StatusTabs ── */}
      <Section title="StatusTabs (List Pages)">
        <StatusTabs
          tabs={[
            { label: 'Todas', value: '', count: 142 },
            { label: 'Pendientes', value: 'pending', count: 5, variant: 'warning' },
            { label: 'Pagadas', value: 'paid', count: 130, variant: 'success' },
            { label: 'Vencidas', value: 'overdue', count: 7, variant: 'danger' },
          ]}
          active={statusFilter}
          onChange={setStatusFilter}
        />
        <div style={{ padding: 'var(--space-4) 0', fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
          Filtro activo: <strong>{statusFilter || 'todas'}</strong>
        </div>
      </Section>

      {/* ── Avatar ── */}
      <Section title="Avatar">
        <Row>
          <Avatar name="Juan García" size="sm" />
          <Avatar name="María López" size="md" />
          <Avatar name="Carlos Ruiz" size="lg" />
          <Avatar name="Ana Martín" size="lg" />
          <Avatar name="Pedro Sánchez" size="lg" />
        </Row>
      </Section>

      {/* ── Tooltip ── */}
      <Section title="Tooltip">
        <Row>
          <Tooltip content="Tooltip arriba" position="top">
            <Button variant="secondary" size="sm">Hover (arriba)</Button>
          </Tooltip>
          <Tooltip content="Tooltip abajo" position="bottom">
            <Button variant="secondary" size="sm">Hover (abajo)</Button>
          </Tooltip>
          <Tooltip content="Tooltip derecha" position="right">
            <Button variant="secondary" size="sm">Hover (derecha)</Button>
          </Tooltip>
        </Row>
      </Section>

      {/* ── Dropdown ── */}
      <Section title="Dropdown">
        <Row>
          <Dropdown
            items={[
              { label: 'Editar', onClick: () => toast('info', 'Editando...') },
              { label: 'Duplicar', onClick: () => toast('info', 'Duplicando...') },
              { label: '', onClick: () => {}, divider: true },
              { label: 'Eliminar', onClick: () => toast('error', 'Eliminado.'), danger: true },
            ]}
          />
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-secondary)' }}>
            Click en los tres puntos
          </span>
        </Row>
      </Section>

      {/* ── EmptyState ── */}
      <Section title="EmptyState">
        <Card>
          <EmptyState
            icon={
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            }
            title="Sin conversaciones"
            description="Cuando un cliente inicie un chat, aparecerá aquí."
            action={<Button size="sm">Crear conversación</Button>}
          />
        </Card>
      </Section>

      {/* ── Skeleton ── */}
      <Section title="Skeleton">
        <Card>
          <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
            <Skeleton width={40} height={40} circle />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <Skeleton width="60%" height={14} />
              <Skeleton width="40%" height={12} />
            </div>
          </div>
          <Skeleton width="100%" height={12} />
          <div style={{ marginTop: 'var(--space-2)' }}>
            <Skeleton width="80%" height={12} />
          </div>
        </Card>
      </Section>

      {/* ── Modal ── */}
      <Section title="Modal">
        <Button onClick={() => setModalOpen(true)}>Abrir modal</Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Confirmar acción"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
              <Button variant="primary" onClick={() => setModalOpen(false)}>Confirmar</Button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 'var(--font-size-base)', color: 'var(--text-secondary)' }}>
            Esta acción no se puede deshacer. El ticket se cerrará permanentemente.
          </p>
        </Modal>
      </Section>

      {/* ── Table ── */}
      <Section title="Table">
        <Row label="Con datos">
          <div style={{ width: '100%' }}>
            <Card padding="none">
              <Table<DemoClient>
                columns={DEMO_COLUMNS}
                data={DEMO_CLIENTS}
                rowKey={(c) => c.id}
                sort={tableSort}
                onSortChange={setTableSort}
                onRowClick={(c) => toast('info', `Seleccionado: ${c.name}`)}
              />
            </Card>
          </div>
        </Row>
        <Row label="Loading">
          <div style={{ width: '100%' }}>
            <Card padding="none">
              <Table<DemoClient>
                columns={DEMO_COLUMNS}
                data={[]}
                rowKey={(c) => c.id}
                loading={true}
                skeletonRows={3}
              />
            </Card>
          </div>
        </Row>
        <Row label="Sin datos">
          <div style={{ width: '100%' }}>
            <Card padding="none">
              <Table<DemoClient>
                columns={DEMO_COLUMNS}
                data={[]}
                rowKey={(c) => c.id}
                emptyTitle="Sin clientes"
                emptyDescription="Aún no tienes clientes registrados."
                emptyAction={<Button size="sm">Añadir cliente</Button>}
              />
            </Card>
          </div>
        </Row>
      </Section>

      {/* ── AlertBanner ── */}
      <Section title="AlertBanner">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
          <AlertBanner variant="info">Información: Tu cuenta ha sido verificada correctamente.</AlertBanner>
          <AlertBanner variant="success" onClose={() => {}}>Perfil de facturación actualizado.</AlertBanner>
          <AlertBanner variant="warning">Tu servicio se renueva en 3 días.</AlertBanner>
          <AlertBanner variant="danger">Factura vencida. Contacta con soporte.</AlertBanner>
        </div>
      </Section>

      {/* ── HelpTip ── */}
      <Section title="HelpTip (§4.12)">
        <Row>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
            Próxima renovación <HelpTip text="Se renueva automáticamente en la fecha de aniversario de tu servicio." />
          </span>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
            Vencimiento <HelpTip text="Fecha límite de pago. Se cobra automáticamente si tienes método registrado." />
          </span>
          <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--text-primary)' }}>
            Setup fee <HelpTip text="Coste único de activación. Solo se cobra una vez." position="right" />
          </span>
        </Row>
      </Section>

      {/* ── Toast ── */}
      <Section title="Toast">
        <Row label="Estándar">
          <Button variant="primary" size="sm" onClick={() => toast('success', 'Cambios guardados correctamente.')}>Toast success</Button>
          <Button variant="secondary" size="sm" onClick={() => toast('error', 'No se pudo guardar. Inténtalo de nuevo.')}>Toast error</Button>
          <Button variant="secondary" size="sm" onClick={() => toast('warning', 'La sesión expira en 5 minutos.')}>Toast warning</Button>
          <Button variant="secondary" size="sm" onClick={() => toast('info', 'Nuevo ticket asignado: #1284')}>Toast info</Button>
        </Row>
        <Row label="Con deshacer (§4.9)">
          <Button variant="secondary" size="sm" onClick={() => toastUndo('info', 'Ticket cerrado.', () => toast('success', 'Ticket reabierto.'))}>Cerrar ticket (undo)</Button>
          <Button variant="secondary" size="sm" onClick={() => toastUndo('warning', 'Conversación archivada.', () => toast('success', 'Conversación restaurada.'))}>Archivar (undo)</Button>
          <Button variant="secondary" size="sm" onClick={() => toastUndo('success', 'Marcado como leído.', () => toast('info', 'Marcado como no leído.'))}>Leer (undo)</Button>
        </Row>
      </Section>
    </div>
  );
}

/* ── Helper Components ── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--space-10)' }}>
      <h2 style={{
        fontSize: 'var(--font-size-md)',
        fontWeight: 'var(--font-weight-semibold)',
        marginBottom: 'var(--space-4)',
        paddingBottom: 'var(--space-2)',
        borderBottom: '1px solid var(--border)',
      }}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function Row({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <div style={{ marginBottom: 'var(--space-4)' }}>
      {label && (
        <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)', marginBottom: 'var(--space-2)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 'var(--font-weight-medium)' }}>
          {label}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)', alignItems: 'center' }}>
        {children}
      </div>
    </div>
  );
}
