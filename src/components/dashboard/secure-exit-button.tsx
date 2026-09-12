"use client";

import { useRouter } from "next/navigation";
import { useHousehold } from "@/context/household-context";

// Deliberately understated — a way for an owner to lock the app before
// handing the device to staff, not a prominent action. Staff never see it:
// they're already at the lowest privilege, so there's nothing to "secure".
export function SecureExitButton() {
  const { userRole, lockOwner } = useHousehold();
  const router = useRouter();

  if (userRole !== "owner") return null;

  return (
    <button
      type="button"
      onClick={() => {
        lockOwner();
        router.push("/");
      }}
      className="mt-16 mb-8 w-full py-4 text-center text-xs text-gray-300"
    >
      Secure & Exit
    </button>
  );
}
