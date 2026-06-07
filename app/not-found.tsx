import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "1.5rem",
        fontFamily: "system-ui, sans-serif",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <h1 style={{ fontSize: "1.5rem", margin: 0 }}>404</h1>
      <p style={{ margin: 0, color: "#64748b" }}>Страница не найдена</p>
      <Link href="/" style={{ color: "#0d9488", textDecoration: "underline" }}>
        На главную
      </Link>
    </div>
  );
}
