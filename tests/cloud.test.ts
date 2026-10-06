import "fake-indexeddb/auto";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { db, createMap, makeNode } from "../src/data";
const calls = vi.hoisted(() => ({
  pages: [] as any[],
  nodes: [] as any[],
  images: [] as any[],
  uploads: [] as any[],
  fail: false,
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    rpc: async (_: string, args: any) => {
      calls.pages.push(args);
      return { error: calls.fail ? { message: "Remote unavailable" } : null };
    },
    from: (name: string) => ({
      upsert: async (records: any) => {
        (name === "nodes" ? calls.nodes : calls.images).push(records);
        return { error: null };
      },
    }),
    auth: { getUser: async () => ({ data: { user: { id: "owner" } } }) },
    storage: {
      from: () => ({
        upload: async (path: string, blob: Blob) => {
          calls.uploads.push({ path, blob });
          return { error: null };
        },
      }),
    },
  }),
}));
beforeEach(async () => {
  vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public");
  vi.resetModules();
  await db.maps.clear();
  await db.nodes.clear();
  await db.images.clear();
  calls.pages = [];
  calls.nodes = [];
  calls.images = [];
  calls.uploads = [];
  calls.fail = false;
});
afterEach(() => vi.unstubAllEnvs());
it("explicit import copies graph and image with new IDs and preserves originals", async () => {
  const { map, root } = await createMap(db, "Private original");
  const child = makeNode(map.id, "Child", root.id);
  await db.nodes.add(child);
  const image = {
    id: "original-image",
    nodeId: child.id,
    mapId: map.id,
    blob: new Blob(["original bytes"], { type: "image/png" }),
    caption: "Original caption",
    createdAt: 1,
  };
  await db.images.add(image);
  const { importLocal } = await import("../src/cloud");
  expect(await importLocal("owner")).toBe(1);
  const copied = calls.nodes[0];
  expect(copied).toHaveLength(2);
  const copiedRoot = copied.find((n: any) => n.title === "Private original");
  const copiedChild = copied.find((n: any) => n.title === "Child");
  expect(copiedChild.parentId).toBe(copiedRoot.id);
  expect(copiedRoot.id).not.toBe(root.id);
  expect(calls.pages[0].page.owner_id).toBe("owner");
  expect(calls.uploads[0].path).toContain("owner/");
  expect(await calls.uploads[0].blob.text()).toBe("original bytes");
  expect(calls.images[0].nodeId).toBe(copiedChild.id);
  expect(await db.maps.toArray()).toEqual([map]);
  expect(await db.nodes.get(child.id)).toEqual(child);
  expect(await (await db.images.get(image.id))!.blob.text()).toBe(
    "original bytes",
  );
});
it("failed import reports remote error and keeps local notes", async () => {
  const { map, root } = await createMap(db, "Keep me");
  calls.fail = true;
  const { importLocal } = await import("../src/cloud");
  await expect(importLocal("owner")).rejects.toThrow("Remote unavailable");
  expect(await db.maps.get(map.id)).toEqual(map);
  expect(await db.nodes.get(root.id)).toEqual(root);
});
