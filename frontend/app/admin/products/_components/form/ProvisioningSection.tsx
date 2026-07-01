import Form from '@rjsf/core';
import validator from '@rjsf/validator-ajv8';
import type { IChangeEvent } from '@rjsf/core';
import type { RJSFSchema } from '@rjsf/utils';

import { Card, Select } from '../../../../components/ui';
import { translateSchema } from '../../../../_shared/i18n';
import {
  aeliumDsTemplates,
  aeliumDsWidgets,
} from '../../../../_shared/plugins/rjsf-theme';
import styles from '../../productForm.module.css';

/* ═══════════════════════════════════════════════════════════════════════════
   ProvisioningSection — sección "Provisioning" (crear + editar). 1:1 con
   `admin/ProductoForm.dc.html`. Select de provisioner (plugins reales) +
   sub-form dinámico `@rjsf/core` cuando el manifest declara
   `productConfigSchema` (ADR-080 Amendment B). Compartido (R15 DRY).
   ═══════════════════════════════════════════════════════════════════════════ */

interface Props {
  provisioner: string;
  onProvisionerChange: (v: string) => void;
  options: { value: string; label: string }[];
  hasProductConfigSchema: boolean;
  productConfigSchema: RJSFSchema | undefined;
  provisionerConfig: Record<string, unknown>;
  onConfigChange: (v: Record<string, unknown>) => void;
}

export function ProvisioningSection({
  provisioner,
  onProvisionerChange,
  options,
  hasProductConfigSchema,
  productConfigSchema,
  provisionerConfig,
  onConfigChange,
}: Props) {
  return (
    <Card>
      <div className={styles.formSection}>
        <h3 className={styles.sectionTitle}>Provisioning</h3>
        <div className={styles.provisionerField}>
          <Select
            label="Provisioner"
            value={provisioner}
            onChange={(e) => onProvisionerChange(e.target.value)}
            options={options}
            helperText="Plugins registrados en /admin/settings/plugins"
          />
        </div>

        {hasProductConfigSchema && productConfigSchema && (
          <div className={styles.provConfig}>
            <h4 className={styles.provConfigTitle}>
              Configuración del provisioner
            </h4>
            <p className={`${styles.sectionHint} ${styles.provConfigHint}`}>
              Campos del manifest de <code>{provisioner}</code> · se guardan en{' '}
              <code>products.provisioner_config</code>
            </p>
            <Form
              // tagName="div" evita que @rjsf/core renderice un <form> interno
              // (anidado dentro del <form> wrapper rompería la hidratación). El
              // submit del wrapper valida via `validator.validateFormData` antes
              // del POST/PATCH (enforcement form-side; defensa canónica en el
              // plugin runtime).
              tagName="div"
              schema={translateSchema(productConfigSchema)}
              formData={provisionerConfig}
              widgets={aeliumDsWidgets}
              templates={aeliumDsTemplates}
              validator={validator}
              onChange={(e: IChangeEvent) =>
                onConfigChange((e.formData ?? {}) as Record<string, unknown>)
              }
              uiSchema={{ 'ui:submitButtonOptions': { norender: true } }}
              showErrorList={false}
            />
          </div>
        )}
      </div>
    </Card>
  );
}
