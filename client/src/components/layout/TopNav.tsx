import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function TopNav() {
  return (
    <header className="w-full border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="text-sm font-semibold uppercase tracking-wide">
          Qproquo
        </Link>
        <nav className="flex items-center gap-2">
          <Link href="/admin">
            <Button variant="ghost" size="sm">Admin</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
