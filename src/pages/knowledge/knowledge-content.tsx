import { useEffect, useRef, useState } from 'react';
import './knowledge-content.css';
import { readKnowledgeDetails, KnowledgeDetailsSummary, type KnowledgeDetails } from './knowledge-details';

export type KnowledgeAsset = { id: string; name: string; type: string; size: number };
export type KnowledgeUpload = { name: string; data: string };
export const mediaMarker = '\n\n[ASTRA_KB_MEDIA_V1]';
export function parseKnowledge(body = ''): { text: string; files: KnowledgeAsset[]; details?: KnowledgeDetails } {
  const parsed = readKnowledgeDetails(body);
  body = parsed.text;
  const index = body.lastIndexOf(mediaMarker);
  if (index < 0) return { text: body, files: [], details: parsed.details };
  try {
    const files: unknown = JSON.parse(body.slice(index + mediaMarker.length));
    if (!Array.isArray(files) || !files.every(x => x && /^[a-f0-9]{64}$/.test(x.id) && typeof x.name === 'string')) return { text: body, files: [] };
    return { text: body.slice(0, index), files, details: parsed.details };
  } catch { return { text: body, files: [] }; }
}
export function KnowledgeContent({ body, id }: { body: string; id: string }) {
  const content = parseKnowledge(body);
  const used = new Set<string>();
  const parts = content.text.split(/(\[\[KB_IMAGE:[a-f0-9]{64}\]\])/g);
  return <div className="kb-content"><KnowledgeDetailsSummary details={content.details} /><div className="v38-prewrap">{parts.map((part, index) => {
    const hash = /^\[\[KB_IMAGE:([a-f0-9]{64})\]\]$/.exec(part)?.[1];
    const file = content.files.find(file => file.id === hash && file.type.startsWith('image/'));
    if (!file) return <span key={index}>{hash ? '' : part}</span>;
    used.add(file.id);
    return <img className="kb-inline-image" key={index} loading="lazy" src={`/api/knowledge/${id}/files/${file.id}`} alt={file.name} />;
  })}</div>
    {content.files.filter(file => !used.has(file.id)).map(file => <figure key={file.id}>
      {file.type.startsWith('image/') ? <img loading="lazy" src={`/api/knowledge/${id}/files/${file.id}`} alt={file.name} /> : null}
      <figcaption><a href={`/api/knowledge/${id}/files/${file.id}`} target="_blank" rel="noopener noreferrer">{file.name}</a> <small>({Math.ceil(file.size / 1024)} KB)</small></figcaption>
    </figure>)}
  </div>;
}

export function KnowledgeEditor({ body, articleId, onFiles }: { body: string; articleId?: string; onFiles: (uploads: KnowledgeUpload[], retained: string[]) => void }) {
  const initial = parseKnowledge(body);
  const [retained, setRetained] = useState(initial.files);
  type InlineUpload = KnowledgeUpload & { id: string; type: string };
  const [uploads, setUploads] = useState<InlineUpload[]>([]);
  const [text, setText] = useState(initial.text);
  const editor = useRef<HTMLDivElement>(null);
  const selection = useRef<Range | null>(null);
  const readingFiles = useRef(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  function imageNode(file: { id: string; name: string }, src: string) {
    const image = document.createElement('img');
    image.src = src; image.alt = file.name; image.dataset.kbImage = file.id;
    image.className = 'kb-inline-image'; image.draggable = false;
    const figure = document.createElement('span');
    figure.className = 'kb-editor-image'; figure.contentEditable = 'false';
    figure.dataset.kbImage = file.id;
    const remove = document.createElement('button');
    remove.type = 'button'; remove.className = 'kb-image-remove';
    remove.dataset.removeImage = file.id; remove.textContent = '×';
    remove.setAttribute('aria-label', 'Remove image ' + file.name);
    remove.title = 'Remove image';
    figure.append(image, remove);
    return figure;
  }
  function rememberSelection() {
    const current = window.getSelection();
    if (current?.rangeCount && editor.current?.contains(current.anchorNode) && editor.current.contains(current.focusNode)) selection.current = current.getRangeAt(0).cloneRange();
  }
  function serialize(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
    if (!(node instanceof HTMLElement)) return '';
    if (node.classList.contains('kb-editor-image')) return `[[KB_IMAGE:${node.dataset.kbImage}]]`;
    if (node.tagName === 'BUTTON') return '';
    if (node.tagName === 'IMG') return /^[a-f0-9]{64}$/.test(node.dataset.kbImage ?? '') ? `[[KB_IMAGE:${node.dataset.kbImage}]]` : '';
    if (node.tagName === 'BR') return '\n';
    const value = [...node.childNodes].map(serialize).join('');
    return ['DIV', 'P', 'LI'].includes(node.tagName) && node !== editor.current ? value + '\n' : value;
  }
  function synchronize(nextUploads = uploads, nextRetained = retained) {
    if (!editor.current) return;
    setText(serialize(editor.current));
    const ids = new Set([...editor.current.querySelectorAll<HTMLImageElement>('img[data-kb-image]')].map(image => image.dataset.kbImage));
    const kept = nextRetained.filter(file => !file.type.startsWith('image/') || ids.has(file.id));
    const added = nextUploads.filter(file => !file.type.startsWith('image/') || ids.has(file.id));
    setRetained(kept); setUploads(added); onFiles(added.map(({ name, data }) => ({ name, data })), kept.map(file => file.id));
  }
  useEffect(() => {
    const host = editor.current;
    if (!host) return;
    const inserted = new Set<string>();
    for (const part of initial.text.split(/(\[\[KB_IMAGE:[a-f0-9]{64}\]\])/g)) {
      const hash = /^\[\[KB_IMAGE:([a-f0-9]{64})\]\]$/.exec(part)?.[1];
      const file = initial.files.find(file => file.id === hash && file.type.startsWith('image/'));
      if (file && articleId) { host.append(imageNode(file, `/api/knowledge/${articleId}/files/${file.id}`)); inserted.add(file.id); }
      else if (!hash) host.append(document.createTextNode(part));
    }
    for (const file of initial.files.filter(file => file.type.startsWith('image/') && !inserted.has(file.id))) {
      if (articleId) host.append(document.createTextNode('\n'), imageNode(file, `/api/knowledge/${articleId}/files/${file.id}`), document.createTextNode('\n'));
    }
    setText(serialize(host));
    return () => { host.replaceChildren(); };
    // The parent keys the editor by article, so its initial document is loaded once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function insertNodes(nodes: Node[]) {
    const host = editor.current;
    if (!host) return;
    const range = selection.current;
    const fragment = document.createDocumentFragment(); nodes.forEach(node => fragment.append(node));
    const last = nodes.at(-1);
    if (range && host.contains(range.commonAncestorContainer)) { range.deleteContents(); range.insertNode(fragment); }
    else host.append(fragment);
    host.focus();
    if (last) { const next = document.createRange(); next.setStartAfter(last); next.collapse(true); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(next); selection.current = next; }
  }
  async function addFiles(files: File[]) {
    if (readingFiles.current || !files.length) return;
    setError('');
    if (retained.length + uploads.length + files.length > 10) { setError('Attach up to 10 files.'); return; }
    const total = retained.reduce((n, f) => n + f.size, 0) + uploads.reduce((n, f) => n + atob(f.data).length, 0) + files.reduce((n,f) => n + f.size,0);
    if (files.some(f => f.size < 1 || f.size > 5 * 1024 * 1024) || total > 10 * 1024 * 1024) { setError('Each file can be up to 5 MB; total attachments up to 10 MB.'); return; }
    readingFiles.current = true; setReading(true);
    try {
      const added = await Promise.all(files.map(async file => {
        const bytes = await file.arrayBuffer();
        const id = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onerror = () => reject(Error('Could not read ' + file.name));
        reader.onload = () => resolve(String(reader.result).split(',')[1]!); reader.readAsDataURL(file);
        });
        const type = /^(image\/(png|jpeg|gif|webp))$/.test(file.type) ? file.type : 'application/octet-stream';
        return { id, name: file.name, data, type };
      }));
      const next = [...uploads];
      for (const file of added) {
        if (!next.some(existing => existing.id === file.id) && !retained.some(existing => existing.id === file.id)) next.push(file);
        if (file.type.startsWith('image/')) insertNodes([imageNode(file, `data:${file.type};base64,${file.data}`), document.createTextNode('\n')]);
      }
      synchronize(next);
    } catch (e) { setError((e as Error).message); } finally { readingFiles.current = false; setReading(false); }
  }
  return <div className="kb-editor">
    <label>Title<input name="contentTitle" maxLength={300} defaultValue={initial.details?.contentTitle ?? ''} placeholder="A short title for the issue or solution" /></label>
    <label>Error message<textarea name="errorMessage" rows={3} maxLength={2000} defaultValue={initial.details?.errorMessage ?? ''} placeholder="Paste the exact error message or error code, if applicable" /></label>
    <span id="kb-content-label">Article content</span>
    <div ref={editor} className="kb-inline-editor" contentEditable={!reading} suppressContentEditableWarning role="textbox" aria-multiline="true" aria-labelledby="kb-content-label" data-placeholder="Write or paste your instructions and screenshots here…"
      onClick={event => {
        const target = event.target as HTMLElement;
        const button = target.closest<HTMLButtonElement>('button[data-remove-image]');
        if (!reading && button && editor.current?.contains(button)) {
          button.closest('.kb-editor-image')?.remove(); synchronize(); editor.current.focus();
        }
      }}
      onInput={() => synchronize()} onKeyUp={rememberSelection} onMouseUp={rememberSelection} onBlur={rememberSelection}
      onDrop={event => { event.preventDefault(); rememberSelection(); void addFiles([...event.dataTransfer.files]); }}
      onPaste={event => { event.preventDefault(); rememberSelection(); const files = [...event.clipboardData.files]; const value = event.clipboardData.getData('text/plain'); if (value) { insertNodes([document.createTextNode(value)]); synchronize(); } if (files.length) void addFiles(files); }} />
    <input type="hidden" name="body" value={text} />
    <label className="kb-file-picker">Images and files<input type="file" multiple disabled={reading} onChange={event => { void addFiles([...event.target.files ?? []]); event.target.value = ''; }} /></label>
    <p className="hint">Paste screenshots into the article at the cursor. Click × beside an image to remove it. Other files stay as attachments. Up to 10 files, 5 MB each, 10 MB total.</p>
    {reading ? <p role="status">Reading attachments…</p> : null}{error ? <p className="notice error" role="alert">{error}</p> : null}
    {[...retained.filter(file => !file.type.startsWith('image/')).map(file => ({ id:file.id, name:file.name, remove: () => synchronize(uploads, retained.filter(item => item.id !== file.id)) })),
      ...uploads.filter(file => !file.type.startsWith('image/')).map(file => ({ id:file.id, name:file.name, remove: () => synchronize(uploads.filter(item => item.id !== file.id)) }))].map(file => <div className="kb-file-row" key={file.id}><span>{file.name}</span><button type="button" className="secondary" onClick={file.remove}>Remove</button></div>)}
    <input type="hidden" name="attachmentsReading" value={reading ? 'yes' : 'no'} />
  </div>;
}
