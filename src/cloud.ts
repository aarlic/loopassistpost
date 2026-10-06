import { createClient } from "@supabase/supabase-js";
import {
  db,
  makeNode,
  type MapRecord,
  type NoteRecord,
  type ImageRecord,
} from "./data";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key) : null;
export type CloudMap = MapRecord & { owner_id: string };
function client() {
  if (!supabase)
    throw Error("Backend not configured. Add Supabase environment variables.");
  return supabase;
}
function check(error: { message: string } | null) {
  if (error) throw Error(error.message);
}
export async function listMaps(): Promise<CloudMap[]> {
  const { data, error } = await client()
    .from("maps")
    .select("*")
    .order("updatedAt", { ascending: false });
  check(error);
  return data ?? [];
}
export async function listNodes(mapId: string): Promise<NoteRecord[]> {
  const { data, error } = await client()
    .from("nodes")
    .select("*")
    .eq("mapId", mapId);
  check(error);
  return data ?? [];
}
export async function saveMaps(records: MapRecord[]) {
  for (const { id, ...patch } of records) {
    const { data, error } = await client()
      .from("maps")
      .update(patch)
      .eq("id", id)
      .select("id");
    check(error);
    if (!data?.length) throw Error("You cannot change this page.");
  }
}
export async function saveNodes(records: NoteRecord[]) {
  const { error } = await client().from("nodes").upsert(records);
  check(error);
}
export async function addNode(note: NoteRecord) {
  const { error } = await client().from("nodes").insert(note);
  check(error);
}
export async function newCloudMap(title: string, owner: string) {
  const now = Date.now();
  const map: CloudMap = {
    id: crypto.randomUUID(),
    title,
    owner_id: owner,
    createdAt: now,
    updatedAt: now,
  };
  const root = makeNode(map.id, title);
  const { error } = await client().rpc("create_page", { page: map, root });
  check(error);
  return { map, root };
}
export async function removeMap(id: string) {
  const { data, error } = await client()
    .from("maps")
    .delete()
    .eq("id", id)
    .select("id");
  check(error);
  if (!data?.length) throw Error("You cannot delete this page.");
}
export async function removeNodes(ids: string[]) {
  const { data, error } = await client()
    .from("nodes")
    .delete()
    .in("id", ids)
    .select("id");
  check(error);
  if (!data?.length) throw Error("Notes could not be deleted.");
}
export async function listImages(nodeId: string): Promise<ImageRecord[]> {
  const c = client();
  const { data, error } = await c
    .from("images")
    .select("*")
    .eq("nodeId", nodeId);
  check(error);
  return Promise.all(
    (data ?? []).map(async (r) => {
      const { data: blob, error: e } = await c.storage
        .from("note-images")
        .download(r.path);
      check(e);
      return { ...r, blob: blob! };
    }),
  );
}
export async function saveImages(records: ImageRecord[]) {
  const c = client();
  const {
    data: { user },
  } = await c.auth.getUser();
  if (!user) throw Error("Please log in.");
  for (const { blob, ...r } of records) {
    const path = `${user.id}/${r.mapId}/${r.id}`;
    const { error } = await c.storage
      .from("note-images")
      .upload(path, blob, { upsert: true, contentType: blob.type });
    check(error);
    const { error: e } = await c.from("images").upsert({ ...r, path });
    check(e);
  }
}
export async function removeImage(id: string) {
  const c = client();
  const { data, error } = await c
    .from("images")
    .select("path")
    .eq("id", id)
    .single();
  check(error);
  const { error: e } = await c.storage.from("note-images").remove([data!.path]);
  check(e);
  const { data: removed, error: f } = await c
    .from("images")
    .delete()
    .eq("id", id)
    .select("id");
  check(f);
  if (!removed?.length) throw Error("Image could not be deleted.");
}
export async function importLocal(owner: string) {
  const originals = await db.maps.toArray();
  for (const original of originals) {
    const ns = await db.nodes.where("mapId").equals(original.id).toArray();
    const root = ns.find((n) => !n.parentId);
    if (!root) throw Error(`Page ${original.title} has no central topic.`);
    const mapId = crypto.randomUUID();
    const ids = new Map(ns.map((n) => [n.id, crypto.randomUUID()]));
    const page = { ...original, id: mapId, owner_id: owner };
    const copies = ns.map((n) => ({
      ...n,
      id: ids.get(n.id)!,
      mapId,
      parentId: n.parentId ? (ids.get(n.parentId) ?? null) : null,
    }));
    const { error } = await client().rpc("create_page", {
      page,
      root: copies.find((n) => !n.parentId),
    });
    check(error);
    await saveNodes(copies);
    const images = await db.images.where("mapId").equals(original.id).toArray();
    await saveImages(
      images.map((i) => ({
        ...i,
        id: crypto.randomUUID(),
        mapId,
        nodeId: ids.get(i.nodeId)!,
      })),
    );
  }
  return originals.length;
}
