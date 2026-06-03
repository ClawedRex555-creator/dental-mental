import { Suspense } from "react";

export default function PlatformLoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm">Загрузка…</div>}>
      {children}
    </Suspense>
  );
}
