import { useEffect, useState, useCallback } from 'react';
import {
  Plus, X, Loader2, Trash2, Pencil, Info, Wifi, FileText,
  Trash, Folder, File, ChevronRight, ChevronLeft, Image as ImageIcon,
  Download, Upload, FolderPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { InfoPage, FileFolder, FileEntry, Office } from '@/types/database';

const ICON_MAP: Record<string, typeof Info> = {
  Info, Wifi, FileText, Trash,
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(s: string): string {
  return new Date(s).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function InfoFilesScreen() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'info' | 'files'>('info');
  const [canEditInfo, setCanEditInfo] = useState(false);
  const [canEditFiles, setCanEditFiles] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('office_holders')
      .select('offices!inner(id, name, description, group_id, permissions, created_at)')
      .eq('user_id', profile.id)
      .then(({ data }) => {
        if (data) {
          const offices = data.map((d: Record<string, unknown>) => d.offices as Office);
          setCanEditInfo(offices.some(o => o.permissions.includes('infos')) || profile.is_admin);
          setCanEditFiles(offices.some(o => o.permissions.includes('files')) || profile.is_admin);
        }
      });
  }, [profile]);

  return (
    <div className="px-5 pt-6 pb-4">
      <h2 className="text-2xl font-display font-bold text-sage-900 mb-4">Infos & Dateien</h2>

      <div className="flex rounded-2xl bg-cream-200 p-1 mb-4">
        <button
          onClick={() => setTab('info')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
            tab === 'info' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'
          }`}
        >
          <Info className="w-4 h-4" /> Infoseiten
        </button>
        <button
          onClick={() => setTab('files')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition ${
            tab === 'files' ? 'bg-white text-sage-900 shadow-soft' : 'text-sage-500'
          }`}
        >
          <Folder className="w-4 h-4" /> Dateien
        </button>
      </div>

      {tab === 'info' ? (
        <InfoPagesTab canEdit={canEditInfo} />
      ) : (
        <FilesTab canEdit={canEditFiles} />
      )}
    </div>
  );
}

// =====================
// Infoseiten
// =====================

function InfoPagesTab({ canEdit }: { canEdit: boolean }) {
  const [pages, setPages] = useState<InfoPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<InfoPage | null>(null);
  const [showEdit, setShowEdit] = useState(false);
  const [editPage, setEditPage] = useState<InfoPage | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('info_pages')
      .select('*')
      .order('sort_order', { ascending: true });
    if (!error && data) {
      setPages(data as InfoPage[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (selected) {
    return (
      <InfoPageView
        page={selected}
        canEdit={canEdit}
        onBack={() => setSelected(null)}
        onEdit={() => { setEditPage(selected); setShowEdit(true); }}
      />
    );
  }

  if (showEdit) {
    return (
      <EditInfoPageDialog
        page={editPage}
        onClose={() => { setShowEdit(false); setEditPage(null); }}
        onSaved={() => { setShowEdit(false); setEditPage(null); load(); }}
      />
    );
  }

  return (
    <div>
      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : pages.length === 0 ? (
        <div className="card text-center py-10">
          <Info className="w-10 h-10 text-sage-300 mx-auto mb-3" />
          <p className="text-sage-500 text-sm">Noch keine Infoseiten.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pages.map(page => {
            const Icon = ICON_MAP[page.icon] ?? Info;
            return (
              <button
                key={page.id}
                onClick={() => setSelected(page)}
                className="card w-full flex items-center gap-3 py-3.5 hover:bg-cream-50 transition text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-600 flex items-center justify-center shrink-0">
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sage-900 text-sm">{page.title}</p>
                  <p className="text-xs text-sage-400">Aktualisiert am {formatDate(page.updated_at)}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-sage-300 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {canEdit && (
        <button
          onClick={() => { setEditPage(null); setShowEdit(true); }}
          className="btn-primary w-full mt-4"
        >
          <Plus className="w-5 h-5" /> Neue Infoseite
        </button>
      )}
    </div>
  );
}

function InfoPageView({ page, canEdit, onBack, onEdit }: {
  page: InfoPage;
  canEdit: boolean;
  onBack: () => void;
  onEdit: () => void;
}) {
  const [content, setContent] = useState(page.content);

  useEffect(() => {
    setContent(page.content);
  }, [page]);

  const Icon = ICON_MAP[page.icon] ?? Info;

  async function del() {
    if (!confirm('Diese Infoseite löschen?')) return;
    const { error } = await supabase.from('info_pages').delete().eq('id', page.id);
    if (!error) onBack();
  }

  return (
    <div>
      <button onClick={onBack} className="text-sm font-semibold text-sage-600 flex items-center gap-1 mb-4">
        <ChevronLeft className="w-4 h-4" /> Zurück
      </button>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-12 h-12 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center">
          <Icon className="w-6 h-6" />
        </div>
        <h3 className="text-xl font-display font-bold text-sage-900">{page.title}</h3>
      </div>
      <div className="card">
        <div className="prose prose-sm max-w-none">
          <p className="text-sage-700 whitespace-pre-wrap text-sm leading-relaxed">{content}</p>
        </div>
      </div>
      {canEdit && (
        <div className="flex gap-2 mt-4">
          <button onClick={onEdit} className="btn-secondary flex-1">
            <Pencil className="w-5 h-5" /> Bearbeiten
          </button>
          <button onClick={del} className="btn-secondary text-red-500 hover:bg-red-50">
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}

function EditInfoPageDialog({ page, onClose, onSaved }: {
  page: InfoPage | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [title, setTitle] = useState(page?.title ?? '');
  const [content, setContent] = useState(page?.content ?? '');
  const [icon, setIcon] = useState(page?.icon ?? 'Info');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const iconOptions = Object.keys(ICON_MAP);

  async function save() {
    if (!title.trim() || !profile) return;
    setSaving(true);
    setError(null);

    const slug = page?.slug ?? slugify(title);
    if (page) {
      const { error: updateError } = await supabase.from('info_pages').update({
        title: title.trim(),
        content: content.trim(),
        icon,
        updated_by: profile.id,
        updated_at: new Date().toISOString(),
      }).eq('id', page.id);
      if (updateError) { setError(updateError.message); setSaving(false); return; }
    } else {
      const { error: insertError } = await supabase.from('info_pages').insert({
        title: title.trim(),
        slug,
        content: content.trim(),
        icon,
        updated_by: profile.id,
      });
      if (insertError) { setError(insertError.message); setSaving(false); return; }
    }

    onSaved();
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cream-50/95 backdrop-blur-sm px-5 pt-5 pb-3 border-b border-cream-200">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sage-900 text-lg">{page ? 'Infoseite bearbeiten' : 'Neue Infoseite'}</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3.5">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}

          <div>
            <label className="label">Titel</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="z.B. WLAN-Zugang" />
          </div>

          <div>
            <label className="label">Icon</label>
            <div className="flex gap-2 flex-wrap">
              {iconOptions.map(name => {
                const Icon = ICON_MAP[name];
                return (
                  <button
                    key={name}
                    onClick={() => setIcon(name)}
                    className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${
                      icon === name ? 'bg-brand-500 text-white' : 'bg-cream-200 text-sage-500'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label">Inhalt</label>
            <textarea
              className="input min-h-32 resize-none"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Informationen hier eintragen…"
            />
          </div>

          <button onClick={save} disabled={saving || !title.trim()} className="btn-primary w-full">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================
// Dateien
// =====================

function FilesTab({ canEdit }: { canEdit: boolean }) {
  const [folders, setFolders] = useState<FileFolder[]>([]);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentFolder, setCurrentFolder] = useState<FileFolder | null>(null);
  const [showFolderCreate, setShowFolderCreate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [folderRes, fileRes] = await Promise.all([
      supabase.from('file_folders').select('*').order('name'),
      supabase.from('file_entries').select('*').order('file_name'),
    ]);
    if (folderRes.data) setFolders(folderRes.data as FileFolder[]);
    if (fileRes.data) setFiles(fileRes.data as FileEntry[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const subFolders = folders.filter(f => f.parent_id === (currentFolder?.id ?? null));
  const folderFiles = files.filter(f => f.folder_id === (currentFolder?.id ?? null));

  async function uploadFile(file: File) {
    if (!canEdit) return;
    setUploading(true);
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path = currentFolder ? `${currentFolder.id}/${fileName}` : fileName;

    const { error: uploadError } = await supabase.storage
      .from('files')
      .upload(path, file);
    if (uploadError) {
      alert('Upload fehlgeschlagen: ' + uploadError.message);
      setUploading(false);
      return;
    }

    const { error: dbError } = await supabase.from('file_entries').insert({
      folder_id: currentFolder?.id ?? null,
      group_id: currentFolder?.group_id ?? null,
      file_name: file.name,
      storage_path: path,
      mime_type: file.type,
      file_size: file.size,
    });
    if (dbError) {
      alert('Fehler beim Speichern: ' + dbError.message);
      setUploading(false);
      return;
    }

    setUploading(false);
    load();
  }

  async function deleteFile(file: FileEntry) {
    if (!confirm(`"${file.file_name}" löschen?`)) return;
    await supabase.storage.from('files').remove([file.storage_path]);
    await supabase.from('file_entries').delete().eq('id', file.id);
    load();
  }

  async function deleteFolder(folder: FileFolder) {
    if (!confirm(`Ordner "${folder.name}" und alle Inhalte löschen?`)) return;
    const childFolders = folders.filter(f => f.parent_id === folder.id);
    const childFiles = files.filter(f => f.folder_id === folder.id);
    for (const cf of childFiles) {
      await supabase.storage.from('files').remove([cf.storage_path]);
    }
    await supabase.from('file_entries').delete().eq('folder_id', folder.id);
    for (const sf of childFolders) {
      await supabase.from('file_folders').delete().eq('id', sf.id);
    }
    await supabase.from('file_folders').delete().eq('id', folder.id);
    load();
  }

  function getFileUrl(file: FileEntry): string {
    const { data } = supabase.storage.from('files').getPublicUrl(file.storage_path);
    return data.publicUrl;
  }

  if (previewFile) {
    return (
      <FilePreview
        file={previewFile}
        url={getFileUrl(previewFile)}
        onBack={() => setPreviewFile(null)}
      />
    );
  }

  return (
    <div>
      {currentFolder && (
        <button
          onClick={() => { const parent = folders.find(f => f.id === currentFolder.parent_id) ?? null; setCurrentFolder(parent); }}
          className="text-sm font-semibold text-sage-600 flex items-center gap-1 mb-4"
        >
          <ChevronLeft className="w-4 h-4" /> Zurück
        </button>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-6 h-6 text-brand-500 animate-spin" />
        </div>
      ) : subFolders.length === 0 && folderFiles.length === 0 ? (
        <div className="card text-center py-10">
          <Folder className="w-10 h-10 text-sage-300 mx-auto mb-3" />
          <p className="text-sage-500 text-sm">
            {currentFolder ? 'Dieser Ordner ist leer.' : 'Noch keine Dateien.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {subFolders.map(folder => (
            <div key={folder.id} className="card flex items-center gap-3 py-3.5">
              <button
                onClick={() => setCurrentFolder(folder)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-sage-100 text-sage-600 flex items-center justify-center shrink-0">
                  <Folder className="w-5 h-5" />
                </div>
                <p className="font-semibold text-sage-900 text-sm truncate">{folder.name}</p>
              </button>
              {canEdit && (
                <button onClick={() => deleteFolder(folder)} className="text-sage-300 hover:text-red-500 transition shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {folderFiles.map(file => {
            const isImage = file.mime_type?.startsWith('image/');
            const isPdf = file.mime_type === 'application/pdf';
            const Icon = isImage ? ImageIcon : File;
            return (
              <div key={file.id} className="card flex items-center gap-3 py-3.5">
                <button
                  onClick={() => setPreviewFile(file)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                    isImage ? 'bg-brand-100 text-brand-600' : isPdf ? 'bg-red-100 text-red-600' : 'bg-sage-100 text-sage-600'
                  }`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sage-900 text-sm truncate">{file.file_name}</p>
                    <p className="text-xs text-sage-400">
                      {file.file_size ? formatFileSize(file.file_size) : ''} · {formatDate(file.created_at)}
                    </p>
                  </div>
                </button>
                {canEdit && (
                  <button onClick={() => deleteFile(file)} className="text-sage-300 hover:text-red-500 transition shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div className="flex gap-2 mt-4">
          <button onClick={() => setShowFolderCreate(true)} className="btn-secondary flex-1">
            <FolderPlus className="w-5 h-5" /> Ordner
          </button>
          <label className="btn-primary flex-1 cursor-pointer">
            {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
            {uploading ? 'Lädt hoch…' : 'Datei hochladen'}
            <input
              type="file"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) uploadFile(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}

      {showFolderCreate && (
        <CreateFolderDialog
          parentId={currentFolder?.id ?? null}
          onClose={() => setShowFolderCreate(false)}
          onCreated={() => { setShowFolderCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateFolderDialog({ parentId, onClose, onCreated }: {
  parentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    const { error: insertError } = await supabase.from('file_folders').insert({
      name: name.trim(),
      parent_id: parentId,
    });
    if (insertError) { setError(insertError.message); setCreating(false); return; }
    onCreated();
    setCreating(false);
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/30 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-cream-50 w-full max-w-md rounded-t-3xl sm:rounded-3xl" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-cream-50/95 backdrop-blur-sm px-5 pt-5 pb-3 border-b border-cream-200">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sage-900 text-lg">Neuer Ordner</h3>
            <button onClick={onClose} className="w-8 h-8 rounded-xl flex items-center justify-center text-sage-400 hover:bg-cream-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3.5">
          {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}
          <div>
            <label className="label">Ordnername</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="z.B. Protokolle" autoFocus />
          </div>
          <button onClick={create} disabled={creating || !name.trim()} className="btn-primary w-full">
            {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilePreview({ file, url, onBack }: {
  file: FileEntry;
  url: string;
  onBack: () => void;
}) {
  const isImage = file.mime_type?.startsWith('image/');
  const isPdf = file.mime_type === 'application/pdf';

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm font-semibold text-sage-600 flex items-center gap-1">
          <ChevronLeft className="w-4 h-4" /> Zurück
        </button>
        <a
          href={url}
          download={file.file_name}
          target="_blank"
          rel="noopener noreferrer"
          className="w-9 h-9 rounded-xl bg-white border border-sage-200 flex items-center justify-center text-sage-600 shadow-soft"
        >
          <Download className="w-4 h-4" />
        </a>
      </div>
      <div className="card">
        <p className="font-semibold text-sage-900 text-sm mb-3">{file.file_name}</p>
        {isImage && (
          <img src={url} alt={file.file_name} className="w-full rounded-xl" />
        )}
        {isPdf && (
          <iframe src={url} className="w-full h-[60vh] rounded-xl border border-sage-200" title={file.file_name} />
        )}
        {!isImage && !isPdf && (
          <div className="text-center py-8">
            <File className="w-10 h-10 text-sage-300 mx-auto mb-3" />
            <a href={url} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              <Download className="w-5 h-5" /> Herunterladen
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
