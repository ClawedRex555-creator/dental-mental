import { ModuleGuard } from "@/components/clinic/module-guard";

/** Разделы, которые супер-админ может отключать. /settings — вне этой группы. */
export default function ModulesLayout({ children }: { children: React.ReactNode }) {
  return <ModuleGuard>{children}</ModuleGuard>;
}
