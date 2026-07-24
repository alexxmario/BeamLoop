import { File, Paths } from "expo-file-system";
import type { Platform } from "./api/types";

export interface ChannelGroup {
  id: string;
  userId: string;
  name: string;
  platforms: Platform[];
  createdAt: string;
  updatedAt?: string;
}

const store = new File(Paths.document, "beamloop-channel-groups.json");

function readAll(): ChannelGroup[] {
  if (!store.exists) return [];
  try {
    const parsed = JSON.parse(store.textSync()) as unknown;
    return Array.isArray(parsed) ? (parsed as ChannelGroup[]) : [];
  } catch {
    return [];
  }
}

function writeAll(groups: ChannelGroup[]) {
  if (!store.exists) store.create({ intermediates: true });
  store.write(JSON.stringify(groups));
}

export function listChannelGroups(userId: string): ChannelGroup[] {
  return readAll()
    .filter((group) => group.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveChannelGroup(
  userId: string,
  name: string,
  platforms: Platform[]
): ChannelGroup {
  const cleanName = name.trim().slice(0, 28);
  const uniquePlatforms = [...new Set(platforms)];
  if (!cleanName) throw new Error("Give this group a name");
  if (uniquePlatforms.length === 0) throw new Error("Select at least one channel");

  const group: ChannelGroup = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    userId,
    name: cleanName,
    platforms: uniquePlatforms,
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  const otherUsers = all.filter((stored) => stored.userId !== userId);
  const thisUsersGroups = [
    group,
    ...all.filter(
      (stored) =>
        stored.userId === userId &&
        stored.name.toLocaleLowerCase() !== cleanName.toLocaleLowerCase()
    ),
  ].slice(0, 20);
  writeAll([...thisUsersGroups, ...otherUsers]);
  return group;
}

export function deleteChannelGroup(userId: string, id: string) {
  writeAll(readAll().filter((group) => group.userId !== userId || group.id !== id));
}

export function updateChannelGroup(
  userId: string,
  id: string,
  name: string,
  platforms: Platform[]
): ChannelGroup {
  const cleanName = name.trim().slice(0, 28);
  const uniquePlatforms = [...new Set(platforms)];
  if (!cleanName) throw new Error("Give this collection a name");
  if (uniquePlatforms.length === 0) throw new Error("Select at least one channel");
  const all = readAll();
  const current = all.find((group) => group.userId === userId && group.id === id);
  if (!current) throw new Error("That collection no longer exists");
  const duplicate = all.some(
    (group) =>
      group.userId === userId &&
      group.id !== id &&
      group.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase()
  );
  if (duplicate) throw new Error("A collection with that name already exists");
  const updated = {
    ...current,
    name: cleanName,
    platforms: uniquePlatforms,
    updatedAt: new Date().toISOString(),
  };
  writeAll(
    all.map((group) =>
      group.userId === userId && group.id === id ? updated : group
    )
  );
  return updated;
}

export function clearChannelGroups(userId: string) {
  writeAll(readAll().filter((group) => group.userId !== userId));
}
