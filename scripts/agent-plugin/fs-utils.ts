import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

export async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}
