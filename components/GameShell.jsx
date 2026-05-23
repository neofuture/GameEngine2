"use client";

import dynamic from "next/dynamic";

const FpsGame = dynamic(() => import("@/components/FpsGame"), {
  ssr: false,
});

export default function GameShell() {
  return <FpsGame />;
}
