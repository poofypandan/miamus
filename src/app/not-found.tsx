import Link from "next/link";

/**
 * A link that leads nowhere (Phase 157), instead of Next's default English
 * 404. Both languages: there is no telling who followed it.
 */
export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Halaman tidak ditemukan</h1>
        <p className="text-sm text-muted-foreground">Page not found</p>
      </div>
      <Link
        href="/"
        className="flex min-h-12 w-full max-w-xs items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Kembali ke awal · Back to the start
      </Link>
    </div>
  );
}
