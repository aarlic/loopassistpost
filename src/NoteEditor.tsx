import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  ListChecks,
  Link,
  ImagePlus,
  X,
} from "lucide-react";
import { type NoteRecord, type ImageRecord, type SaveQueue } from "./data";
import { listImages, removeImage } from "./cloud";
const limit = 5 * 1024 * 1024;
function ImageCard({
  image,
  change,
  remove,
  locked,
}: {
  locked: boolean;
  image: ImageRecord;
  change: (caption: string) => void;
  remove: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const u = URL.createObjectURL(image.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [image.blob]);
  return (
    <figure className="attachment">
      <img src={url} alt={image.caption || "Attached note image"} />
      <button
        hidden={locked}
        className="remove-image"
        aria-label="Remove attached image"
        onClick={remove}
      >
        <X size={14} />
      </button>
      <input
        disabled={locked}
        aria-label="Image caption"
        placeholder="Add a caption…"
        value={image.caption}
        onChange={(e) => change(e.target.value)}
      />
    </figure>
  );
}
export default function NoteEditor({
  note,
  edit,
  report,
  imageQueue,
  locked,
}: {
  note: NoteRecord;
  edit: (id: string, patch: Partial<NoteRecord>) => void;
  report: (message: string) => void;
  imageQueue: SaveQueue<ImageRecord>;
  locked: boolean;
}) {
  const current = useRef(note);
  current.current = note;
  const editRef = useRef(edit);
  editRef.current = edit;
  const [images, setImages] = useState<ImageRecord[]>([]),
    [imageLoading, setImageLoading] = useState(false),
    [revision, setRevision] = useState(0);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          protocols: ["http", "https", "mailto"],
          isAllowedUri: (url, ctx) =>
            /^(https?:|mailto:)/i.test(url) && ctx.defaultValidate(url),
        },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
    ],
    editable: !locked,
    content: note.content,
    editorProps: {
      attributes: { "aria-label": "Note content", class: "note-content" },
    },
    onUpdate: ({ editor }) => {
      editRef.current(current.current.id, { content: editor.getJSON() });
      setRevision((r) => r + 1);
    },
    onSelectionUpdate: () => setRevision((r) => r + 1),
  });
  useEffect(() => {
    editor?.setEditable(!locked, false);
    editor?.setOptions({
      editorProps: {
        attributes: {
          "aria-label": "Note content",
          "aria-readonly": String(locked),
          class: "note-content",
        },
      },
    });
  }, [editor, locked]);
  useEffect(() => {
    editor?.commands.setContent(note.content, { emitUpdate: false });
  }, [note.id, editor]);
  useEffect(() => {
    let active = true;
    setImages([]);
    setImageLoading(true);
    listImages(note.id)
      .then((records) => {
        if (active) {
          const combined = new Map(records.map((r) => [r.id, r]));
          for (const r of imageQueue.pending.values())
            if (r.nodeId === note.id) combined.set(r.id, r);
          setImages([...combined.values()]);
        }
      })
      .catch((e) => report(`Unable to load images: ${e.message}`))
      .finally(() => {
        if (active) setImageLoading(false);
      });
    return () => {
      active = false;
    };
  }, [note.id, imageQueue]);
  void revision;
  function link() {
    if (!editor) return;
    const value = window.prompt(
      "Link URL (https://, http://, or mailto:)",
      editor.getAttributes("link").href ?? "https://",
    );
    if (value === null) return;
    if (!value.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    if (!/^(https?:\/\/|mailto:)/i.test(value)) {
      report("Use a link beginning with https://, http://, or mailto:.");
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: value.trim() })
      .run();
  }
  async function attach(files: FileList | null) {
    if (locked || !files) return;
    report("");
    const owner = current.current;
    for (const file of Array.from(files)) {
      if (
        !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
          file.type,
        )
      ) {
        report("Choose a JPEG, PNG, WebP, or GIF image.");
        continue;
      }
      if (file.size > limit) {
        report(`“${file.name}” exceeds the 5 MB image limit.`);
        continue;
      }
      const record: ImageRecord = {
        id: crypto.randomUUID(),
        nodeId: owner.id,
        mapId: owner.mapId,
        blob: file,
        caption: "",
        createdAt: Date.now(),
      };
      imageQueue.enqueue(record);
      setImages((old) => [...old, record]);
    }
  }
  async function remove(id: string) {
    if (locked) return;
    try {
      await imageQueue.flush();
      await removeImage(id);
      setImages((old) => old.filter((i) => i.id !== id));
    } catch (e) {
      report(
        e instanceof Error
          ? e.message
          : "Unable to remove image. Please retry.",
      );
    }
  }
  return (
    <>
      <label className="field-label note-label">NOTE</label>
      <div className="rich-editor">
        <fieldset
          disabled={locked}
          hidden={locked}
          className="format-toolbar"
          aria-label="Note formatting"
        >
          {editor && (
            <>
              <button
                aria-label="Bold"
                aria-pressed={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold size={15} />
              </button>
              <button
                aria-label="Italic"
                aria-pressed={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic size={15} />
              </button>
              <button
                aria-label="Heading"
                aria-pressed={editor.isActive("heading")}
                onClick={() =>
                  editor.chain().focus().toggleHeading({ level: 2 }).run()
                }
              >
                H2
              </button>
              <span />
              <button
                aria-label="Bullet list"
                aria-pressed={editor.isActive("bulletList")}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              >
                <List size={16} />
              </button>
              <button
                aria-label="Numbered list"
                aria-pressed={editor.isActive("orderedList")}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered size={16} />
              </button>
              <button
                aria-label="Checklist"
                aria-pressed={editor.isActive("taskList")}
                onClick={() => editor.chain().focus().toggleTaskList().run()}
              >
                <ListChecks size={16} />
              </button>
              <button
                aria-label="Link"
                aria-pressed={editor.isActive("link")}
                onClick={link}
              >
                <Link size={15} />
              </button>
            </>
          )}
        </fieldset>
        <EditorContent editor={editor} />
      </div>
      <div className="attachment-heading">
        <span className="field-label">ATTACHMENTS</span>
        <label className="attach-button" hidden={locked}>
          <ImagePlus size={15} />
          <span>Add image</span>
          <input
            type="file"
            disabled={locked}
            aria-label="Attach images"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            onChange={(e) => {
              void attach(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <small className="image-limit">
        JPEG, PNG, WebP, GIF · Up to 5 MB per image
      </small>
      {imageLoading ? (
        <p className="image-empty">Loading images…</p>
      ) : images.length ? (
        images.map((i) => (
          <ImageCard
            key={i.id}
            image={i}
            locked={locked}
            change={(caption) => {
              if (locked) return;
              const next = { ...i, caption };
              setImages((old) => old.map((r) => (r.id === i.id ? next : r)));
              imageQueue.enqueue(next);
            }}
            remove={() => void remove(i.id)}
          />
        ))
      ) : (
        <div className="image-empty">
          A reference, a sketch, a little inspiration.
        </div>
      )}
    </>
  );
}
