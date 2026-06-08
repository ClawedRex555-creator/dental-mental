import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
    files: [
      "components/**/*-modal.tsx",
      "components/shared/clinic-service-search.tsx",
      "components/shared/search-autocomplete.tsx",
      "components/auth/auth-gate.tsx",
      "components/patients/patient-debt-panel.tsx",
      "components/patients/patient-notes-panel.tsx",
      "components/settings/account-settings-page.tsx",
      "components/settings/egisz-settings-panel.tsx",
      "app/(dashboard)/(modules)/finance/page.tsx",
      "app/platform/admin/page.tsx",
      "components/medical-records/odontogram-image.tsx",
    ],
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
