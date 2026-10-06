import "fake-indexeddb/auto";
import { afterEach, describe, it, expect } from "vitest";
import {
  BranchDB,
  createMap,
  makeNode,
  deleteBranch,
  deleteMap,
  initialize,
  SaveQueue,
} from "../src/data";
const databases: BranchDB[] = [];
function fresh() {
  const d = new BranchDB(crypto.randomUUID());
  databases.push(d);
  return d;
}
afterEach(async () => {
  for (const d of databases.splice(0)) await d.delete();
});
describe("local workspace", () => {
  it("persists structured notes and image blobs across database reopening", async () => {
    const d = fresh();
    const { map, root } = await createMap(d, "Notes");
    root.content = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Kept" }] },
      ],
    };
    await d.nodes.put(root);
    await d.images.add({
      id: "image",
      nodeId: root.id,
      mapId: map.id,
      blob: new Blob(["image"]),
      caption: "Caption",
      createdAt: 1,
    });
    d.close();
    await d.open();
    expect((await d.nodes.get(root.id))?.content).toEqual(root.content);
    expect(await (await d.images.get("image"))?.blob.text()).toBe("image");
  });
  it("deletes a branch and its images, preserving other branches", async () => {
    const d = fresh();
    const { map, root } = await createMap(d, "Map");
    const child = makeNode(map.id, "Child", root.id);
    const grand = makeNode(map.id, "Grand", child.id);
    const other = makeNode(map.id, "Other", root.id);
    await d.nodes.bulkAdd([child, grand, other]);
    await d.images.add({
      id: "image",
      nodeId: grand.id,
      mapId: map.id,
      blob: new Blob(["x"]),
      caption: "",
      createdAt: 1,
    });
    await deleteBranch(d, map.id, child.id);
    expect((await d.nodes.toArray()).map((n) => n.id).sort()).toEqual(
      [root.id, other.id].sort(),
    );
    expect(await d.images.count()).toBe(0);
    await expect(deleteBranch(d, map.id, root.id)).rejects.toThrow("central");
    await deleteMap(d, map.id);
    expect(await d.nodes.count()).toBe(0);
  });
  it("seeds once even after all maps are removed", async () => {
    const d = fresh();
    await initialize(d);
    const m = (await d.maps.toArray())[0];
    await deleteMap(d, m.id);
    await initialize(d);
    expect(await d.maps.count()).toBe(0);
  });
  it("flushes edits bound to each node when switching", async () => {
    const d = fresh();
    const { map, root } = await createMap(d, "Map");
    const child = makeNode(map.id, "Child", root.id);
    await d.nodes.add(child);
    const q = new SaveQueue<typeof root>((r) => d.nodes.bulkPut(r));
    q.enqueue({ ...root, title: "Root edit" });
    await q.flush();
    q.enqueue({ ...child, title: "Child edit" });
    await q.flush();
    expect((await d.nodes.get(root.id))?.title).toBe("Root edit");
    expect((await d.nodes.get(child.id))?.title).toBe("Child edit");
    q.dispose();
  });
  it("keeps pending edits on quota failure and retries the latest snapshot", async () => {
    let fail = true;
    let saved: { id: string; text: string }[] = [];
    const q = new SaveQueue<(typeof saved)[number]>(async (records) => {
      if (fail) throw new DOMException("Storage full", "QuotaExceededError");
      saved = records;
    });
    q.enqueue({ id: "a", text: "Important" });
    await expect(q.flush()).rejects.toThrow("Storage full");
    expect(q.state).toBe("error");
    expect(q.pending.get("a")?.text).toBe("Important");
    q.enqueue({ id: "a", text: "Latest" });
    fail = false;
    await q.flush();
    expect(saved[0].text).toBe("Latest");
    expect(q.state).toBe("saved");
    q.dispose();
  });
});
it("retains newer edits made during an in-flight save", async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const saved: { id: string; text: string }[][] = [];
  const q = new SaveQueue<{ id: string; text: string }>(async (records) => {
    if (!saved.length) await gate;
    saved.push(records);
  });
  q.enqueue({ id: "a", text: "First" });
  const flushing = q.flush();
  q.enqueue({ id: "a", text: "Second" });
  release();
  await flushing;
  expect(saved.map((b) => b[0].text)).toEqual(["First", "Second"]);
  expect(q.pending.size).toBe(0);
  q.dispose();
});
