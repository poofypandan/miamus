import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">Maimus</h1>
        <p className="text-muted-foreground">Household management, starting with pet care.</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/staff">Staff View</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/dashboard">Owner Dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
