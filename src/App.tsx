import { useEffect, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Handle,
  Position,
  type NodeProps,
  type Node,
  type ReactFlowInstance,
} from "@xyflow/react";
import {
  Plus,
  Leaf,
  ChevronRight,
  ArrowUpRight,
  Maximize,
  Minus,
  Home,
  Trash2,
  Pencil,
  Check,
  X,
  GitBranch,
  PanelLeftClose,
  Menu,
  WifiOff,
} from "lucide-react";
import {
  branchIds,
  makeNode,
  preview,
  SaveQueue,
  colors,
  type MapRecord,
  type NoteRecord,
  type ImageRecord,
} from "./data";
import {
  supabase,
  listMaps,
  listNodes,
  saveNodes,
  saveMaps,
  saveImages,
  newCloudMap,
  addNode,
  removeMap as cloudRemoveMap,
  removeNodes,
  importLocal,
  type CloudMap,
} from "./cloud";
import type { Session } from "@supabase/supabase-js";
import NoteEditor from "./NoteEditor";
type MindNode = Node<
  {
    title: string;
    color: string;
    preview: string;
    root: boolean;
    select: () => void;
  },
  "idea"
>;
function Idea({ data, selected }: NodeProps<MindNode>) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Edit ${data.title}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          data.select();
        }
      }}
      className={`idea ${selected ? "selected" : ""}`}
      style={{ borderLeftColor: data.color }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="idea-eyebrow" style={{ color: data.color }}>
        {data.root ? "CENTRAL TOPIC" : "IDEA"}
      </div>
      <strong>{data.title || "Untitled idea"}</strong>
      {data.preview && <p>{data.preview}</p>}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { idea: Idea };
export default function App() {
  const [maps, setMaps] = useState<CloudMap[]>([]),
    [nodes, setNodes] = useState<NoteRecord[]>([]),
    [mapId, setMapId] = useState(""),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [saveTick, tick] = useState(0),
    [busy, setBusy] = useState(false),
    [sidebar, setSidebar] = useState(true),
    [offline, setOffline] = useState(!navigator.onLine);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [notice, setNotice] = useState("");
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const canEdit =
    !!session &&
    maps.find((m) => m.id === mapId)?.owner_id === session.user.id &&
    !offline;
  const editableRef = useRef(canEdit);
  editableRef.current = canEdit;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const mapsRef = useRef(maps);
  mapsRef.current = maps;
  const [nodeQueue] = useState(
    () =>
      new SaveQueue<NoteRecord>(
        (records) => saveNodes(records),
        () => tick((t) => t + 1),
      ),
  );
  const [mapQueue] = useState(
    () =>
      new SaveQueue<MapRecord>(
        (records) => saveMaps(records),
        () => tick((t) => t + 1),
      ),
  );
  const [imageQueue] = useState(
    () =>
      new SaveQueue<ImageRecord>(
        (records) => saveImages(records),
        () => tick((t) => t + 1),
      ),
  );
  const flow = useRef<ReactFlowInstance<MindNode> | null>(null);
  const current = maps.find((m) => m.id === mapId);
  const note = nodes.find((n) => n.id === selected);
  async function flush() {
    await nodeQueue.flush();
    await mapQueue.flush();
    await imageQueue.flush();
  }
  async function openMap(id: string) {
    await flush();
    const ns = await listNodes(id);

    setNodes(ns);
    setSelected(ns.find((n) => !n.parentId)?.id ?? "");
    setMapId(id);
  }
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const ms = supabase ? await listMaps() : [];
        const id = "";
        const ns: NoteRecord[] = [];
        if (alive) {
          setMaps(ms);
          setMapId(id);
          setNodes(ns);
          setSelected(ns.find((n) => !n.parentId)?.id ?? "");
        }
      } catch (e) {
        if (alive) setError(message(e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (!supabase) return;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      if (sessionRef.current?.user.id !== next?.user.id) {
        for (const q of [nodeQueue, mapQueue, imageQueue]) {
          q.dispose();
          q.pending.clear();
          q.state = "saved";
          q.error = "";
        }
        setSelected("");
        setMapId("");
        setNodes([]);
      }
      setSession(next);
    });
    return () => subscription.unsubscribe();
  }, [nodeQueue, mapQueue, imageQueue]);
  useEffect(() => {
    const onOnline = () => setOffline(!navigator.onLine);
    const hide = () => {
      if (document.visibilityState === "hidden") void flush().catch(() => {});
    };
    const unload = (e: BeforeUnloadEvent) => {
      if (
        nodeQueue.pending.size ||
        mapQueue.pending.size ||
        imageQueue.pending.size
      ) {
        e.preventDefault();
        void flush().catch(() => {});
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOnline);
    window.addEventListener("beforeunload", unload);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOnline);
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [nodeQueue, mapQueue, imageQueue]);
  function message(e: unknown) {
    return e instanceof Error
      ? e.message
      : "Something went wrong with browser storage.";
  }
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  function edit(id: string, patch: Partial<NoteRecord>) {
    if (!editableRef.current) return;
    const old = nodesRef.current.find((n) => n.id === id);
    if (!old) return;
    const next = { ...old, ...patch, updatedAt: Date.now() };
    nodesRef.current = nodesRef.current.map((n) => (n.id === id ? next : n));
    setNodes(nodesRef.current);
    nodeQueue.enqueue(next);
  }
  async function select(id: string) {
    if (id === selected) return;
    await flush();
    setSelected(id);
  }
  async function newMap() {
    if (!session || offline)
      throw Error("Log in and connect to create a page.");
    const title = window.prompt("Name your new mind map", "Untitled map");
    if (!title?.trim()) return;
    await flush();
    const { map } = await newCloudMap(title.trim(), session.user.id);
    setMaps((ms) => [...ms, map]);
    await openMap(map.id);
  }
  async function add(sibling = false) {
    if (!canEdit || !note) return;
    await flush();
    const parent = sibling ? note.parentId : note.id;
    if (!parent) return;
    const existing = nodes.filter((n) => n.parentId === parent).length;
    const p = nodes.find((n) => n.id === parent)!;
    const child = makeNode(
      mapId,
      "New idea",
      parent,
      p.x + 300,
      p.y + (existing % 2 === 0 ? 1 : -1) * Math.ceil(existing / 2) * 150,
      colors[existing % colors.length],
    );
    await addNode(child);
    setNodes((ns) => [...ns, child]);
    setSelected(child.id);
  }
  async function removeNode() {
    if (!canEdit || !note || !note.parentId) return;
    const count = branchIds(nodes, note.id).length;
    if (
      !window.confirm(
        `Delete “${note.title}”${count > 1 ? ` and its ${count - 1} descendant${count > 2 ? "s" : ""}` : ""}? All notes and attached images in this branch will be permanently removed.`,
      )
    )
      return;
    await flush();
    await removeNodes(branchIds(nodes, note.id));
    const ids = branchIds(nodes, note.id);
    setNodes((ns) => ns.filter((n) => !ids.includes(n.id)));
    setSelected(note.parentId);
  }
  async function removeMap() {
    if (
      !canEdit ||
      !current ||
      !window.confirm(
        `Delete “${current.title}”? All ${nodes.length} nodes, notes, and attached images will be permanently removed.`,
      )
    )
      return;
    await flush();
    await cloudRemoveMap(mapId);
    const remaining = maps.filter((m) => m.id !== mapId);
    setMaps(remaining);
    if (remaining.length) await openMap(remaining[0].id);
    else {
      setMapId("");
      setNodes([]);
      setSelected("");
    }
  }
  async function rename() {
    if (!canEdit || !current) return;
    const title = window.prompt("Rename this mind map", current.title);
    if (!title?.trim()) return;
    const next = { ...current, title: title.trim(), updatedAt: Date.now() };
    setMaps((ms) => ms.map((m) => (m.id === next.id ? next : m)));
    mapQueue.enqueue(next);
  }
  const failed =
    nodeQueue.state === "error" ||
    mapQueue.state === "error" ||
    imageQueue.state === "error";
  const saving =
    nodeQueue.state === "saving" ||
    mapQueue.state === "saving" ||
    imageQueue.state === "saving";
  void saveTick;
  const rendered: MindNode[] = nodes.map((n) => ({
    id: n.id,
    type: "idea",
    position: { x: n.x, y: n.y },
    selected: n.id === selected,
    data: {
      title: n.title,
      color: n.color,
      preview: preview(n.content).slice(0, 90),
      root: !n.parentId,
      select: () => void action(() => select(n.id)),
    },
  }));
  return (
    <div className="app">
      {sidebar && (
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-icon">
              <Leaf size={22} />
            </span>
            <span>
              branch<span className="brand-dot">.</span>
            </span>
            <button
              className="icon sidebar-close"
              aria-label="Hide sidebar"
              onClick={() => setSidebar(false)}
            >
              <PanelLeftClose size={17} />
            </button>
          </div>
          <div className="workspace-label">PUBLIC NOTE PAGES</div>
          <button
            className="new-map"
            disabled={busy || loading || !session || offline}
            onClick={() => void action(newMap)}
          >
            <Plus size={17} /> New mind map
          </button>
          <div className="sidebar-heading">
            AVAILABLE PAGES <span>{maps.length}</span>
          </div>
          <nav aria-label="Mind maps">
            {maps.map((m) => (
              <button
                key={m.id}
                className={`map-button ${mapId === m.id ? "active" : ""}`}
                disabled={busy}
                onClick={() => void action(() => openMap(m.id))}
              >
                <GitBranch size={17} />
                <span>{m.title}</span>
                {mapId === m.id && <ChevronRight size={15} />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <p>Published pages are readable by everyone.</p>
            {!supabase ? (
              <div role="alert">
                Backend not configured. See README for Supabase setup.
              </div>
            ) : session ? (
              <>
                <p>Signed in as {session.user.email}</p>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await flush();
                      const { error } = await supabase!.auth.signOut();
                      if (error) throw error;
                    })
                  }
                >
                  Log out
                </button>
                <button
                  disabled={busy || offline}
                  onClick={() =>
                    void action(async () => {
                      if (
                        !window.confirm(
                          "Publish copies of all local pages, notes and images? Anyone will be able to read them. Originals stay on this device. Retrying a partial import can create duplicates.",
                        )
                      )
                        return;
                      const count = await importLocal(session.user.id);
                      setMaps(await listMaps());
                      setNotice(
                        `Published ${count} local pages. Originals retained.`,
                      );
                    })
                  }
                >
                  Import local notes
                </button>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(async () => {
                    const { error } = await supabase!.auth.signInWithPassword({
                      email,
                      password,
                    });
                    if (error) throw error;
                    setPassword("");
                  });
                }}
              >
                <label>
                  Email
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    autoComplete="current-password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <button disabled={busy}>Log in</button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      if (!email || password.length < 8)
                        throw Error(
                          "Enter an email and a password of at least 8 characters.",
                        );
                      const { data, error } = await supabase!.auth.signUp({
                        email,
                        password,
                      });
                      if (error) throw error;
                      setNotice(
                        data.session
                          ? "Account created."
                          : "Check your email to confirm your account before logging in.",
                      );
                      setPassword("");
                    })
                  }
                >
                  Create account
                </button>
              </form>
            )}
            {notice && <p role="status">{notice}</p>}
            <div className="version">BRANCH / VERSION 1.0</div>
          </div>
        </aside>
      )}
      <main className="main">
        <header className="topbar">
          <div className="breadcrumb">
            {!sidebar && (
              <button
                className="icon"
                aria-label="Show sidebar"
                onClick={() => setSidebar(true)}
              >
                <Menu size={18} />
              </button>
            )}
            <span>My workspace</span>
            <ChevronRight size={14} />
            <strong>{current?.title ?? "Mind maps"}</strong>
          </div>
          <div className="save-status" role="status">
            {offline && (
              <span className="offline">
                <WifiOff size={13} /> Offline
              </span>
            )}
            <span className={`status-dot ${failed ? "failed" : ""}`} />
            {failed
              ? "Save failed"
              : saving
                ? "Saving…"
                : canEdit
                  ? "Saved to server"
                  : "Read only"}
            {failed && (
              <button onClick={() => void action(flush)}>Retry save</button>
            )}
          </div>
        </header>
        {(error || failed) && (
          <div className="error" role="alert">
            {error || nodeQueue.error || mapQueue.error || imageQueue.error}{" "}
            {failed &&
              "Your pending edits are still available here. Keep this tab open and retry."}{" "}
            {error && (
              <button onClick={() => setError("")} aria-label="Dismiss error">
                <X size={15} />
              </button>
            )}
          </div>
        )}
        {loading ? (
          <div className="empty">
            <Leaf size={34} />
            <h2>Opening your workspace…</h2>
          </div>
        ) : !current ? (
          <div className="empty">
            <GitBranch size={40} />
            <h1>Give an idea somewhere to grow.</h1>
            <p>
              Select a published page to read its notes. Log in to create your
              own.
            </p>
            <div className="public-list">
              {maps.map((m) => (
                <button
                  key={m.id}
                  onClick={() => void action(() => openMap(m.id))}
                >
                  {m.title}
                </button>
              ))}
            </div>
            <button
              className="primary"
              onClick={() => void action(newMap)}
              disabled={busy || !session || offline}
            >
              {" "}
              <Plus size={17} /> Create a mind map
            </button>
          </div>
        ) : (
          <>
            <div className="map-header">
              <div>
                <div className="eyebrow">A SPACE TO THINK</div>
                <h1>{current.title}</h1>
                <p>
                  {nodes.length} ideas <span>·</span> Let one thought lead to
                  another.
                </p>
              </div>
              <div className="map-actions" hidden={!canEdit}>
                <button
                  className="icon"
                  aria-label="Rename map"
                  onClick={() => void action(rename)}
                >
                  <Pencil size={17} />
                </button>
                <button
                  className="icon"
                  aria-label="Delete map"
                  onClick={() => void action(removeMap)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
            <div className="work-area">
              <div className="canvas">
                <div className="canvas-top">
                  <span>
                    <span className="status-dot" /> MIND MAP
                  </span>
                  <span>Drag to explore · Scroll to zoom</span>
                </div>
                <ReactFlow<MindNode>
                  key={mapId}
                  nodes={rendered}
                  edges={nodes
                    .filter((n) => n.parentId)
                    .map((n) => ({
                      id: n.id,
                      source: n.parentId!,
                      target: n.id,
                      type: "smoothstep",
                      style: { stroke: "#b3bdb1", strokeWidth: 1.5 },
                    }))}
                  nodeTypes={nodeTypes}
                  nodesDraggable={canEdit}
                  nodesFocusable={false}
                  nodesConnectable={false}
                  edgesReconnectable={false}
                  deleteKeyCode={null}
                  minZoom={0.2}
                  maxZoom={2}
                  defaultViewport={current.viewport}
                  fitView={!current.viewport}
                  fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
                  onInit={(instance) => {
                    flow.current = instance;
                  }}
                  onNodeClick={(_, n) => void action(() => select(n.id))}
                  onNodesChange={(changes) => {
                    for (const c of changes) {
                      if (c.type === "position" && c.position)
                        edit(c.id, { x: c.position.x, y: c.position.y });
                    }
                  }}
                  onMoveEnd={(_, viewport) => {
                    const m = mapsRef.current.find((m) => m.id === mapId);
                    if (m && editableRef.current) {
                      const next = { ...m, viewport, updatedAt: Date.now() };
                      setMaps((ms) =>
                        ms.map((m) => (m.id === mapId ? next : m)),
                      );
                      mapQueue.enqueue(next);
                    }
                  }}
                >
                  <Background color="#d2d8ce" gap={24} size={1} />
                </ReactFlow>
                <div className="canvas-footer">
                  <div className="zoom-tools">
                    <button
                      aria-label="Zoom out"
                      onClick={() => void flow.current?.zoomOut()}
                    >
                      <Minus size={16} />
                    </button>
                    <button
                      aria-label="Zoom in"
                      onClick={() => void flow.current?.zoomIn()}
                    >
                      <Plus size={16} />
                    </button>
                    <span />
                    <button
                      aria-label="Fit map to screen"
                      onClick={() =>
                        void flow.current?.fitView({
                          padding: 0.25,
                          maxZoom: 1,
                          duration: 250,
                        })
                      }
                    >
                      <Maximize size={16} />
                    </button>
                  </div>
                  <button
                    className="root-button"
                    disabled={busy}
                    onClick={() => {
                      const root = nodes.find((n) => !n.parentId);
                      if (root) {
                        void action(() => select(root.id));
                        void flow.current?.setCenter(
                          root.x + 110,
                          root.y + 50,
                          { zoom: 1, duration: 300 },
                        );
                      }
                    }}
                  >
                    <Home size={14} /> Central topic
                  </button>
                </div>
              </div>
              <aside className="editor-panel">
                {note ? (
                  <>
                    <div className="panel-top">
                      <span className="eyebrow">THE DETAILS</span>
                      <span className="note-kind">
                        {note.parentId ? "Idea" : "Central topic"}
                      </span>
                    </div>
                    <div className="editor-heading">
                      <span style={{ background: note.color }} />
                      <h2>Your thought, expanded.</h2>
                    </div>
                    <label className="field-label" htmlFor="node-title">
                      TITLE
                    </label>
                    <input
                      id="node-title"
                      className="title-input"
                      disabled={busy || !canEdit}
                      value={note.title}
                      onChange={(e) => edit(note.id, { title: e.target.value })}
                    />
                    <div className="color-row" hidden={!canEdit}>
                      <span className="field-label">NODE COLOR</span>
                      <div>
                        {colors.map((c, i) => (
                          <button
                            key={c}
                            className={`color-choice ${note.color === c ? "chosen" : ""}`}
                            style={{ background: c }}
                            aria-label={`Color ${["forest", "ochre", "lavender", "terracotta", "blue"][i]}`}
                            aria-pressed={note.color === c}
                            onClick={() => edit(note.id, { color: c })}
                          >
                            {note.color === c && <Check size={12} />}
                          </button>
                        ))}
                      </div>
                    </div>
                    <NoteEditor
                      note={note}
                      edit={edit}
                      report={setError}
                      imageQueue={imageQueue}
                      locked={busy || !canEdit}
                    />
                    <div className="node-actions" hidden={!canEdit}>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() => void action(() => add())}
                      >
                        <Plus size={16} /> Add child idea{" "}
                        <ArrowUpRight size={15} />
                      </button>
                      <button
                        className="secondary"
                        disabled={busy || !note.parentId}
                        onClick={() => void action(() => add(true))}
                      >
                        <GitBranch size={15} /> Add sibling
                      </button>
                      {note.parentId && (
                        <button
                          className="delete-node"
                          disabled={busy}
                          onClick={() => void action(removeNode)}
                        >
                          <Trash2 size={14} /> Delete branch
                        </button>
                      )}
                    </div>
                    <div className="timestamps">
                      Created {new Date(note.createdAt).toLocaleString()}
                      <br />
                      Updated {new Date(note.updatedAt).toLocaleString()}
                    </div>
                  </>
                ) : (
                  <div className="empty">
                    <h2>Select an idea</h2>
                    <p>Choose a node to write its note.</p>
                  </div>
                )}
              </aside>
            </div>
            <footer className="bottom-bar">
              <span>
                <Leaf size={13} /> Small thoughts. New possibilities.
              </span>
              <span>PUBLIC READING · OWNER EDITING</span>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}
