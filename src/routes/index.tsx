import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { CombApp } from "@/components/comb-app";
import { HoneyLoad } from "@/components/honey-load";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const [booted, setBooted] = useState(false);
  const finish = useCallback(() => setBooted(true), []);

  if (!booted) return <HoneyLoad onDone={finish} />;

  return <CombApp />;
}
