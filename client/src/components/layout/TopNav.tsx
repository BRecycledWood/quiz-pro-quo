import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";

const RUNNER_STORAGE_KEY = "lastRunnerUrl";
const DEFAULT_RUNNER_URL = "/w/demo/insurance-eligibility";

function getRunnerUrl() {
  if (typeof window === "undefined") return DEFAULT_RUNNER_URL;
  const stored = window.localStorage.getItem(RUNNER_STORAGE_KEY);
  return stored && stored.trim().length > 0 ? stored : DEFAULT_RUNNER_URL;
}

export default function TopNav() {
  const [location] = useLocation();
  const [runnerUrl, setRunnerUrl] = useState(DEFAULT_RUNNER_URL);

  useEffect(() => {
    setRunnerUrl(getRunnerUrl());
  }, [location]);

  useEffect(() => {
    const handler = () => setRunnerUrl(getRunnerUrl());
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return (
    <header className="w-full border-b bg-background/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
        <Link href="/" className="text-sm font-semibold uppercase tracking-wide">
          Qproquo
        </Link>
        <nav className="flex items-center gap-2">
          <Link href={runnerUrl}>
            <Button variant="ghost" size="sm">Runner</Button>
          </Link>
          <Link href="/admin">
            <Button variant="ghost" size="sm">Admin</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
