"use client";

import { Calendar, Folder, House, NotebookPen, Settings, SquareCheckBig } from "lucide-react";
import Link from "next/link";
import { Waveform } from "./Waveform";

// Only Home exists for now; the rest are placeholders for upcoming sections.
const UPCOMING = [
  { label: "Tasks", icon: SquareCheckBig },
  { label: "Calendar", icon: Calendar },
  { label: "Files", icon: Folder },
  { label: "Notes", icon: NotebookPen },
  { label: "Settings", icon: Settings },
];

const PILL_SHAPE = [0.55, 1, 0.7, 0.9] as const;

interface SidebarProps {
  inert: boolean;
  /** Short status for the conversation, e.g. "Listening…". */
  status: string;
  getLevel: () => number;
}

export function Sidebar({ inert, status, getLevel }: SidebarProps) {
  return (
    <aside
      inert={inert}
      className="fade-away absolute bottom-0 left-0 top-[72px] z-20 hidden w-60 flex-col justify-between px-5 pb-7 lg:flex [&[inert]]:-translate-x-3"
    >
      <nav aria-label="Main">
        <ul className="flex flex-col gap-1">
          <li>
            <Link
              href="/"
              aria-current="page"
              className="focus-ring flex items-center gap-3 rounded-full bg-white/[0.07] px-4 py-2.5 text-sm font-medium text-frost ring-1 ring-inset ring-white/[0.08]"
            >
              <House className="size-[18px]" strokeWidth={1.8} />
              Home
            </Link>
          </li>
          {UPCOMING.map(({ label, icon: Icon }) => (
            <li key={label}>
              <span
                title="Coming soon"
                className="group flex cursor-default items-center gap-3 rounded-full px-4 py-2.5 text-sm text-mist"
              >
                <Icon className="size-[18px]" strokeWidth={1.8} />
                {label}
                <span className="ml-auto text-[11px] text-mist/70 opacity-0 transition-opacity group-hover:opacity-100">
                  Soon
                </span>
              </span>
            </li>
          ))}
        </ul>
      </nav>

      <div className="glass flex w-fit items-center gap-2.5 rounded-full py-2 pl-3.5 pr-4">
        <span className="status-dot size-2 rounded-full" aria-hidden />
        <span className="text-[13px] text-frost/90">{status}</span>
        <Waveform getLevel={getLevel} shape={PILL_SHAPE} className="h-3.5 gap-[2px]" barClassName="w-[2px]" />
      </div>
    </aside>
  );
}
