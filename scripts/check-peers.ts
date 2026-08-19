#!/usr/bin/env bun
/**
 * Fail if an installed package's peer dependency is not satisfied.
 *
 * @opentui/solid declares an exact peer on solid-js, and solid-js is inlined
 * into the published bundle — so an unmet peer is not a warning about someone
 * else's tree, it is a statement that the artefact we ship was compiled against
 * a version we are not shipping. Nothing else in the repo or CI checked it.
 *
 *   bun run scripts/check-peers.ts
 */

import { readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { join } from "node:path"

const root = fileURLToPath(new URL("..", import.meta.url))
const modules = join(root, "node_modules")

interface Manifest {
  name?: string
  version?: string
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
}

async function manifest(name: string): Promise<Manifest | null> {
  return Bun.file(join(modules, name, "package.json"))
    .json()
    .catch(() => null)
}

/** Every installed package, scoped ones included. */
async function installed(): Promise<string[]> {
  const names: string[] = []
  for (const entry of await readdir(modules, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue
    if (entry.name.startsWith("@")) {
      for (const scoped of await readdir(join(modules, entry.name))) names.push(`${entry.name}/${scoped}`)
    } else {
      names.push(entry.name)
    }
  }
  return names
}

const problems: string[] = []

for (const name of await installed()) {
  const own = await manifest(name)
  for (const [peer, range] of Object.entries(own?.peerDependencies ?? {})) {
    const optional = own?.peerDependenciesMeta?.[peer]?.optional === true
    const found = await manifest(peer)
    if (!found) {
      if (!optional) problems.push(`${name} needs ${peer}@${range}, which is not installed`)
      continue
    }
    if (!Bun.semver.satisfies(found.version ?? "", range)) {
      problems.push(`${name} needs ${peer}@${range}, but ${found.version} is installed`)
    }
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(problem)
  process.exit(1)
}

console.log("peer dependencies satisfied")
