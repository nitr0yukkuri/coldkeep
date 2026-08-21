export type AtomicTextFileOps = {
  exists(path: string): Promise<boolean>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, contents: string): Promise<void>;
  moveFile(from: string, to: string): Promise<void>;
  unlink(path: string): Promise<void>;
};

const tempPathFor = (path: string) => `${path}.tmp`;

/**
 * Writes a small JSON/text document through a sibling temporary file. If the
 * process is interrupted, the next read can recover the completed temporary
 * file instead of parsing a half-written target.
 */
export async function writeTextAtomically(
  path: string,
  contents: string,
  ops: AtomicTextFileOps,
): Promise<void> {
  const temporaryPath = tempPathFor(path);
  await ops.writeFile(temporaryPath, contents);
  if (await ops.exists(path)) {
    await ops.unlink(path);
  }
  await ops.moveFile(temporaryPath, path);
}

/** Reads the target, falling back to a completed temporary write when the
 * target is missing or unreadable. */
export async function readTextWithRecovery(
  path: string,
  ops: AtomicTextFileOps,
  isUsable: (contents: string) => boolean = () => true,
): Promise<string | null> {
  const temporaryPath = tempPathFor(path);
  const candidates = [path, temporaryPath];
  let sawCandidate = false;
  for (const candidate of candidates) {
    if (!(await ops.exists(candidate))) {
      continue;
    }
    sawCandidate = true;
    try {
      const contents = await ops.readFile(candidate);
      if (!isUsable(contents)) {
        continue;
      }
      if (candidate === temporaryPath) {
        if (await ops.exists(path)) {
          await ops.unlink(path);
        }
        await ops.moveFile(temporaryPath, path);
      }
      return contents;
    } catch {
      // Try the next candidate; a broken target must not hide a valid temp.
    }
  }
  if (sawCandidate) {
    throw new Error(`No valid content found for ${path}`);
  }
  return null;
}
