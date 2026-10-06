import Dexie, { type Table } from "dexie";
import type { JSONContent } from "@tiptap/react";
export interface MapRecord {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  viewport?: { x: number; y: number; zoom: number };
}
export interface NoteRecord {
  id: string;
  mapId: string;
  parentId: string | null;
  title: string;
  color: string;
  content: JSONContent;
  x: number;
  y: number;
  createdAt: number;
  updatedAt: number;
}
export interface ImageRecord {
  id: string;
  nodeId: string;
  mapId: string;
  blob: Blob;
  caption: string;
  createdAt: number;
}
export const blank: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};
export const colors = ["#517b65", "#b58a4d", "#7f80ac", "#b96e60", "#5e94a1"];
export class BranchDB extends Dexie {
  maps!: Table<MapRecord, string>;
  nodes!: Table<NoteRecord, string>;
  images!: Table<ImageRecord, string>;
  settings!: Table<{ key: string; value: string }, string>;
  constructor(name = "branch-local-v1") {
    super(name);
    this.version(1).stores({
      maps: "id,updatedAt",
      nodes: "id,mapId,parentId",
      images: "id,nodeId,mapId",
      settings: "key",
    });
  }
}
export const db = new BranchDB();
export function makeNode(
  mapId: string,
  title: string,
  parentId: string | null = null,
  x = 0,
  y = 0,
  color = colors[0],
): NoteRecord {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    mapId,
    parentId,
    title,
    color,
    content: structuredClone(blank),
    x,
    y,
    createdAt: now,
    updatedAt: now,
  };
}
export function branchIds(nodes: NoteRecord[], id: string): string[] {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of nodes)
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        changed = true;
      }
  }
  return [...ids];
}
export async function deleteBranch(
  database: BranchDB,
  mapId: string,
  id: string,
) {
  await database.transaction(
    "rw",
    database.nodes,
    database.images,
    async () => {
      const nodes = await database.nodes.where("mapId").equals(mapId).toArray();
      const node = nodes.find((n) => n.id === id);
      if (!node) throw Error("This node no longer exists.");
      if (!node.parentId)
        throw Error("Delete the map to remove its central topic.");
      const ids = branchIds(nodes, id);
      await database.images.where("nodeId").anyOf(ids).delete();
      await database.nodes.bulkDelete(ids);
    },
  );
}
export async function deleteMap(database: BranchDB, id: string) {
  await database.transaction(
    "rw",
    database.maps,
    database.nodes,
    database.images,
    async () => {
      await database.images.where("mapId").equals(id).delete();
      await database.nodes.where("mapId").equals(id).delete();
      await database.maps.delete(id);
    },
  );
}
export async function createMap(database: BranchDB, title: string) {
  const now = Date.now();
  const map: MapRecord = {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
  };
  const root = makeNode(map.id, title);
  await database.transaction("rw", database.maps, database.nodes, async () => {
    await database.maps.add(map);
    await database.nodes.add(root);
  });
  return { map, root };
}
export async function initialize(database: BranchDB) {
  await database.transaction(
    "rw",
    database.maps,
    database.nodes,
    database.settings,
    async () => {
      if (await database.settings.get("initialized")) return;
      const { map, root } = await createMap(
        database,
        "A little space for big ideas",
      );
      root.content = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Start with a thought. Follow it somewhere interesting. This is your space to connect ideas, collect references, and find the next story.",
              },
            ],
          },
        ],
      };
      await database.nodes.put(root);
      const ideas = [
        makeNode(map.id, "Collect your sparks", root.id, 300, -150, colors[1]),
        makeNode(map.id, "Make connections", root.id, 300, 0, colors[2]),
        makeNode(map.id, "Find your next story", root.id, 300, 150, colors[4]),
      ];
      for (const n of ideas)
        n.content = {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Select this idea to write a note. Add a child to explore it further, or drag it to make room.",
                },
              ],
            },
          ],
        };
      await database.nodes.bulkAdd(ideas);
      await database.settings.put({ key: "initialized", value: "yes" });
    },
  );
}
export type SaveState = "saved" | "saving" | "error";
// Snapshots retain their original IDs; failed writes remain queued until retry.
export class SaveQueue<T extends { id: string }> {
  pending = new Map<string, T>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  state: SaveState = "saved";
  error = "";
  constructor(
    private write: (records: T[]) => Promise<unknown>,
    private notify: () => void = () => {},
    private delay = 450,
  ) {}
  enqueue(value: T) {
    this.pending.set(value.id, structuredClone(value));
    this.state = "saving";
    this.notify();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, this.delay);
  }
  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) {
      await this.running;
      if (this.pending.size) return this.flush();
      return;
    }
    if (!this.pending.size) return;
    const batch = [...this.pending.values()];
    this.state = "saving";
    this.notify();
    this.running = (async () => {
      try {
        await this.write(batch);
        for (const value of batch)
          if (this.pending.get(value.id) === value)
            this.pending.delete(value.id);
        this.state = this.pending.size ? "saving" : "saved";
        this.error = "";
      } catch (e) {
        this.state = "error";
        this.error =
          e instanceof Error
            ? e.message
            : "Browser storage could not save your changes.";
        throw e;
      } finally {
        this.running = undefined;
        this.notify();
      }
    })();
    await this.running;
    if (this.pending.size) return this.flush();
  }
  dispose() {
    clearTimeout(this.timer);
  }
}
export function preview(content: JSONContent): string {
  return (
    content.text ?? (content.content ?? []).map(preview).join(" ")
  ).trim();
}
