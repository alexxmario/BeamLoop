import { File, Paths } from "expo-file-system";

export interface ContentIdea {
  id: string;
  userId: string;
  text: string;
  createdAt: string;
}

const store = new File(Paths.document, "beamloop-ideas.json");

function readAll(): ContentIdea[] {
  if (!store.exists) return [];
  try {
    const parsed = JSON.parse(store.textSync()) as unknown;
    return Array.isArray(parsed) ? (parsed as ContentIdea[]) : [];
  } catch {
    return [];
  }
}

function writeAll(ideas: ContentIdea[]) {
  if (!store.exists) store.create({ intermediates: true });
  store.write(JSON.stringify(ideas));
}

export function listIdeas(userId: string): ContentIdea[] {
  return readAll()
    .filter((idea) => idea.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function saveIdea(userId: string, text: string): ContentIdea {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Write something before saving an idea");
  const idea: ContentIdea = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    userId,
    text: trimmed,
    createdAt: new Date().toISOString(),
  };
  const all = readAll();
  const otherUsers = all.filter((stored) => stored.userId !== userId);
  const thisUsersIdeas = [idea, ...all.filter((stored) => stored.userId === userId)].slice(0, 100);
  writeAll([...thisUsersIdeas, ...otherUsers]);
  return idea;
}

export function deleteIdea(userId: string, id: string) {
  writeAll(readAll().filter((idea) => idea.userId !== userId || idea.id !== id));
}

export function clearIdeas(userId: string) {
  writeAll(readAll().filter((idea) => idea.userId !== userId));
}
