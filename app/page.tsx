import { AssistantApp } from "@/components/assistant/AssistantApp";
import { Landscape } from "@/components/scene/Landscape";

export default function Home() {
  return (
    <div className="relative h-dvh overflow-clip">
      <Landscape />
      <AssistantApp />
    </div>
  );
}
