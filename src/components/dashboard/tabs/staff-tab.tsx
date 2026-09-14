"use client";

import { useRequireOwner } from "@/hooks/use-require-owner";

// Built out in Phase 60D.
export function StaffTab() {
  const isOwner = useRequireOwner();
  if (!isOwner) return null;
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-gray-900">Staff</h2>
    </div>
  );
}
