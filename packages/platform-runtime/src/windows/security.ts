export const WINDOWS_SYSTEM_SID = "S-1-5-18" as const;

export type WindowsAce = Readonly<{
  readonly sid: string;
  readonly mask: number; // Win32 GENERIC_ALL or FILE_ALL_ACCESS
  readonly type: "access-allowed" | "access-denied";
  readonly isInherited: boolean;
}>;

export type WindowsSecurityDescriptorView = Readonly<{
  readonly ownerSid: string;
  readonly isDaclProtected: boolean;
  readonly isReparsePoint: boolean;
  readonly aces: readonly WindowsAce[];
}>;

export const FILE_ALL_ACCESS = 0x1f01ff;
export const GENERIC_ALL = 0x10000000;

export function isControlledWindowsSecurityDescriptor(
  descriptor: WindowsSecurityDescriptorView,
  currentUserSid: string,
): boolean {
  if (!descriptor || typeof descriptor !== "object") return false;
  if (descriptor.isReparsePoint) return false;
  if (!descriptor.isDaclProtected) return false;
  if (descriptor.ownerSid.toUpperCase() !== currentUserSid.toUpperCase()) return false;

  const normalizedUser = currentUserSid.toUpperCase();
  const normalizedSystem = WINDOWS_SYSTEM_SID.toUpperCase();

  // Exactly two allowed identities: current user and SYSTEM
  // No inherited ACEs permitted (protected DACL)
  if (!Array.isArray(descriptor.aces) || descriptor.aces.length === 0) return false;

  let seenUser = false;
  let seenSystem = false;

  for (const ace of descriptor.aces) {
    if (ace.type !== "access-allowed" || ace.isInherited) return false;
    const sid = ace.sid.toUpperCase();
    if (sid === normalizedUser) {
      seenUser = true;
    } else if (sid === normalizedSystem) {
      seenSystem = true;
    } else {
      // Extra identity granted -> fails closed!
      return false;
    }
  }

  return seenUser && seenSystem;
}
