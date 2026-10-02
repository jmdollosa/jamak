"use client";

import { Maximize2 } from "lucide-react";
import { ASSISTANT_NAME } from "@/lib/assistant/config";

/** Diameter of the docked orb and its distance from the viewport corner, in px. */
export const COMPACT_ORB = 72;
export const COMPACT_MARGIN = 28;
const BAR_HEIGHT = 44;
const GAP = 14;

interface CompactBarProps {
  visible: boolean;
  /** Short status for the conversation, e.g. "Listening…". */
  status: string;
  onExpand: () => void;
}

/** The status pill that sits beside the orb when it's docked in the corner. */
export function CompactBar({ visible, status, onExpand }: CompactBarProps) {
  return (
    <div
      inert={!visible}
      className="compact-bar fixed z-30"
      style={{
        right: COMPACT_MARGIN + COMPACT_ORB + GAP,
        bottom: COMPACT_MARGIN + COMPACT_ORB / 2 - BAR_HEIGHT / 2,
      }}
    >
      <div className="glass flex items-center rounded-full py-1.5 pl-4 pr-1.5" style={{ height: BAR_HEIGHT }}>
        <span className="status-dot mr-2.5 size-1.5 rounded-full" aria-hidden />
        <span className="text-[13px] text-frost/90">{status}</span>
        <button
          type="button"
          onClick={onExpand}
          aria-label={`Expand ${ASSISTANT_NAME}`}
          title="Expand"
          className="focus-ring ml-3 grid size-8 place-items-center rounded-full text-mist transition-colors hover:bg-white/10 hover:text-frost"
        >
          <Maximize2 className="size-4" />
        </button>
      </div>
    </div>
  );
}
