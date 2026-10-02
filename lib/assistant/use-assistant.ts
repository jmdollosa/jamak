"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { AssistantController } from "./assistant-controller";

export function useAssistant() {
  const [controller] = useState(() => new AssistantController());
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => controller.shutdown, [controller]);

  return { ...snapshot, controller };
}
