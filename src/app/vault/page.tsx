"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type VaultFile = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: string;
  createdAt: string;
  folderId?: string;
};

type VaultFolder = {
  id: string;
  name: string;
  parentId?: string;
  createdAt: string;
};

type ViewMode = "grid" | "list";
type SortField = "name" | "date" | "size" | "type";

interface PreviewFile extends VaultFile {
  downloadUrl: string;
}

export default function VaultPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortField, setSortField] = useState<SortField>("date");
  const [previewFile, setPreviewFile] = useState<PreviewFile | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<Array<{ id: string | null; name: string }>>([
    { id: null, name: "ROOT" },
  ]);
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);

  const loadFilesAndFolders = useCallback(
    async (folderId: string | null = null) => {
      try {
        const folderParam = folderId ? `?folderId=${folderId}` : "";
        const filesRes = await fetch(`/api/vault/files${folderParam}`);
        const foldersRes = await fetch(`/api/vault/folders${folderParam ? `?parentId=${folderId}` : ""}`);

        if (filesRes.status === 401 || foldersRes.status === 401) {
          router.push("/");
          return;
        }

        const filesData = await filesRes.json();
        const foldersData = await foldersRes.json();

        setFiles(filesData.files ?? []);
        setFolders(foldersData.folders ?? []);
      } catch (error) {
        console.error("Load error:", error);
        setMessage("LOAD_FAILED");
      }
    },
    [router]
  );

  useEffect(() => {
    void loadFilesAndFolders(currentFolderId);
  }, [currentFolderId, loadFilesAndFolders]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === "F1") {
        e.preventDefault();
        fileInputRef.current?.click();
      } else if (e.key === "F2") {
        e.preventDefault();
        setViewMode(prev => prev === "grid" ? "list" : "grid");
      } else if (e.key === "F3") {
        e.preventDefault();
        document.getElementById("search-input")?.focus();
      } else if (e.key === "F4") {
        e.preventDefault();
        setShowNewFolder(!showNewFolder);
      } else if (e.key === "Escape") {
        if (previewFile) {
          setPreviewFile(null);
        } else if (showNewFolder) {
          setShowNewFolder(false);
          setNewFolderName("");
        }
      } else if (e.key === "ArrowRight" && previewFile) {
        navigatePreview(1);
      } else if (e.key === "ArrowLeft" && previewFile) {
        navigatePreview(-1);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [previewFile, showNewFolder]);

  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(true);
    };

    const handleDragLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) {
        setIsDragging(false);
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        setSelectedFile(file);
      }
    };

    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("drop", handleDrop);

    return () => {
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  const uploadFile = async () => {
    const fileFromInput = fileInputRef.current?.files?.[0] ?? null;
    const fileToUpload = selectedFile ?? fileFromInput;

    if (!fileToUpload) {
      fileInputRef.current?.click();
      return;
    }

    setLoading(true);
    setMessage("");

    try {
      const formData = new FormData();
      formData.append("file", fileToUpload);
      if (currentFolderId) {
        formData.append("folderId", currentFolderId);
      }

      const uploadResponse = await fetch("/api/vault/upload", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadResponse.json();
      if (!uploadResponse.ok) {
        throw new Error(uploadData.error ?? "Upload failed");
      }

      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      setMessage("UPLOAD_COMPLETE");
      await loadFilesAndFolders(currentFolderId);
    } catch (error) {
      const text = error instanceof Error ? error.message : "UPLOAD_FAILED";
      setMessage(text);
    } finally {
      setLoading(false);
    }
  };

  const createFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      const response = await fetch("/api/vault/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFolderName.trim(),
          parentId: currentFolderId || undefined,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Create folder failed");
      }

      setNewFolderName("");
      setShowNewFolder(false);
      setMessage("FOLDER_CREATED");
      await loadFilesAndFolders(currentFolderId);
    } catch (error) {
      const text = error instanceof Error ? error.message : "CREATE_FAILED";
      setMessage(text);
    }
  };

  useEffect(() => {
    if (selectedFile) {
      uploadFile();
    }
  }, [selectedFile]);

  const downloadFile = async (fileId: string) => {
    const response = await fetch("/api/vault/sign-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "DOWNLOAD_FAILED");
      return;
    }

    window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
  };

  const previewFileHandler = async (file: VaultFile) => {
    const response = await fetch("/api/vault/sign-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId: file.id }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "PREVIEW_FAILED");
      return;
    }

    setPreviewFile({ ...file, downloadUrl: data.downloadUrl });
  };

  const deleteFile = async (fileId: string) => {
    if (deleteConfirm !== fileId) {
      setDeleteConfirm(fileId);
      setTimeout(() => setDeleteConfirm(null), 3000);
      return;
    }

    try {
      const response = await fetch(`/api/vault/files/${fileId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Delete failed");
      }

      setMessage("FILE_DELETED");
      setPreviewFile(null);
      setDeleteConfirm(null);
      await loadFilesAndFolders(currentFolderId);
    } catch (error) {
      setMessage("DELETE_FAILED");
    }
  };

  const navigatePreview = (direction: number) => {
    if (!previewFile) return;
    const currentIndex = filteredItems.findIndex(item => 
      item.type === "file" && item.data.id === previewFile.id
    );
    const newIndex = currentIndex + direction;
    if (newIndex >= 0 && newIndex < filteredItems.length) {
      const item = filteredItems[newIndex];
      if (item.type === "file") {
        previewFileHandler(item.data);
      }
    }
  };

  const copyDownloadLink = async (fileId: string) => {
    const response = await fetch("/api/vault/sign-download", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileId }),
    });

    const data = await response.json();
    if (response.ok) {
      await navigator.clipboard.writeText(data.downloadUrl);
      setMessage("LINK_COPIED");
      setTimeout(() => setMessage(""), 2000);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
  };

  const formatFileSize = (bytes: string) => {
    const size = parseInt(bytes);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith("image/")) return "🖼";
    if (mimeType.startsWith("video/")) return "🎬";
    if (mimeType.startsWith("audio/")) return "🎵";
    if (mimeType.includes("pdf")) return "📄";
    if (mimeType.includes("zip") || mimeType.includes("rar")) return "📦";
    return "📁";
  };

  type ContentItem = 
    | { type: "folder"; data: VaultFolder }
    | { type: "file"; data: VaultFile };

  const items: ContentItem[] = [
    ...folders.map(f => ({ type: "folder" as const, data: f })),
    ...files.map(f => ({ type: "file" as const, data: f })),
  ];

  const filteredItems = items
    .filter(item => {
      if (item.type === "folder") {
        return item.data.name.toLowerCase().includes(searchQuery.toLowerCase());
      }
      return (
        item.data.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.data.mimeType.toLowerCase().includes(searchQuery.toLowerCase())
      );
    })
    .sort((a, b) => {
      if (a.type === "folder" && b.type === "file") return -1;
      if (a.type === "file" && b.type === "folder") return 1;

      switch (sortField) {
        case "name":
          const aName = a.type === "folder" ? a.data.name : a.data.filename;
          const bName = b.type === "folder" ? b.data.name : b.data.filename;
          return aName.localeCompare(bName);
        case "size":
          const aSize = a.type === "folder" ? 0 : parseInt(a.data.sizeBytes);
          const bSize = b.type === "folder" ? 0 : parseInt(b.data.sizeBytes);
          return bSize - aSize;
        case "type":
          const aType = a.type === "folder" ? "[FOLDER]" : a.data.mimeType;
          const bType = b.type === "folder" ? "[FOLDER]" : b.data.mimeType;
          return aType.localeCompare(bType);
        case "date":
        default:
          return (
            new Date(b.type === "folder" ? b.data.createdAt : b.data.createdAt).getTime() -
            new Date(a.type === "folder" ? a.data.createdAt : a.data.createdAt).getTime()
          );
      }
    });

  const totalSize = files.reduce((acc, file) => acc + parseInt(file.sizeBytes), 0);

  const canPreview = (mimeType: string) => {
    return mimeType.startsWith("image/") || 
           mimeType.startsWith("video/") || 
           mimeType.includes("pdf");
  };

  const openFolder = (folderId: string, folderName: string) => {
    setCurrentFolderId(folderId);
    setBreadcrumbs([...breadcrumbs, { id: folderId, name: folderName }]);
  };

  const navigateToBreadcrumb = (index: number) => {
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);
    setCurrentFolderId(newBreadcrumbs[index].id);
  };

  return (
    <>
      <svg className="topography-grid" viewBox="0 0 1000 1000" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="100" height="100" patternUnits="userSpaceOnUse">
            <path d="M 100 0 L 0 0 0 100" fill="none" stroke="rgba(255,184,0,0.1)" strokeWidth="0.5"/>
            <circle cx="0" cy="0" r="1" fill="rgba(255,184,0,0.3)"/>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
        <path d="M 0 200 Q 250 150 500 200 T 1000 200" fill="none" stroke="var(--trace-gold)" strokeWidth="0.2" opacity="0.3" />
        <path d="M 0 500 Q 300 600 600 500 T 1000 500" fill="none" stroke="var(--trace-cyan)" strokeWidth="0.2" opacity="0.3" />
      </svg>

      <main className="vault-frame">
        {/* HEADER */}
        <header className="vault-header">
          <div className="logo-section">
            <h1 className="system-title" style={{fontFamily: 'var(--font-inter)'}}>AEGIS <span className="logo-accent">//</span> VAULT</h1>
          </div>
          <div className="header-status">
            <div className="status-item">UPTIME: <span>142:12:04</span></div>
            <div className="status-item">ENCRYPTION: <span>AES-256-GCM</span></div>
            <div className="status-item">NODE: <span>TRUSTED</span></div>
          </div>
          <div className="header-actions">
            <button onClick={logout} className="logout-btn" style={{fontFamily: 'var(--font-space-mono)'}}>
              DISCONNECT
            </button>
          </div>
        </header>

        {/* SIDEBAR - DIRECTORY TREE */}
        <aside className="file-tree">
          <div className="nav-label" style={{fontFamily: 'var(--font-space-mono)'}}>Directories</div>
          <ul className="tree-list">
            <li className="tree-node" onClick={() => setCurrentFolderId(null)}>
              <span className="tree-icon">/</span> Root Vault
            </li>
            <li className="tree-node">
              <span className="tree-icon">/</span> Recovered
            </li>
            <li className="tree-node active">
              <span className="tree-icon">/</span> Current
            </li>
            <li className="tree-node">
              <span className="tree-icon">/</span> Secured
            </li>
          </ul>

          <div className="nav-label" style={{marginTop: '3rem', fontFamily: 'var(--font-space-mono)'}}>Quick Access</div>
          <ul className="tree-list">
            <li className="tree-node" onClick={() => fileInputRef.current?.click()}>
              <b style={{fontFamily: 'var(--font-space-mono)'}}>F1</b> Upload
            </li>
            <li className="tree-node" onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}>
              <b style={{fontFamily: 'var(--font-space-mono)'}}>F2</b> Toggle
            </li>
            <li className="tree-node" onClick={() => document.getElementById('search-input')?.focus()}>
              <b style={{fontFamily: 'var(--font-space-mono)'}}>F3</b> Search
            </li>
            <li className="tree-node" onClick={() => setShowNewFolder(!showNewFolder)}>
              <b style={{fontFamily: 'var(--font-space-mono)'}}>F4</b> Folder
            </li>
          </ul>
        </aside>

        {/* MAIN CONTENT */}
        <main className="workspace">
          <input
            ref={fileInputRef}
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              setSelectedFile(file);
              if (file) uploadFile();
            }}
            style={{display: 'none'}}
          />

          {/* BREADCRUMB NAVIGATION */}
          <div className="breadcrumb-nav" style={{fontFamily: 'var(--font-space-mono)'}}>
            {breadcrumbs.map((bc, idx) => (
              <span key={idx}>
                <button 
                  className="breadcrumb-btn"
                  onClick={() => navigateToBreadcrumb(idx)}
                >
                  {bc.name}
                </button>
                {idx < breadcrumbs.length - 1 && <span className="breadcrumb-sep">/</span>}
              </span>
            ))}
          </div>

          <div className="content-header" style={{fontFamily: 'var(--font-space-mono)'}}>
            <div className="search-box">
              <input
                id="search-input"
                type="text"
                placeholder="SEARCH FILES..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="search-input"
              />
            </div>
            <select 
              value={sortField} 
              onChange={(e) => setSortField(e.target.value as SortField)}
              className="sort-select"
            >
              <option value="date">DATE</option>
              <option value="name">NAME</option>
              <option value="size">SIZE</option>
              <option value="type">TYPE</option>
            </select>
            <button 
              className="action-btn primary"
              onClick={() => fileInputRef.current?.click()}
            >
              ADD FILES
            </button>
            <button 
              className="action-btn secondary"
              onClick={() => setShowNewFolder(!showNewFolder)}
            >
              NEW FOLDER
            </button>
          </div>

          {message && (
            <div className={`status-message ${message.includes("FAIL") || message.includes("ERROR") ? "error" : ""}`} style={{fontFamily: 'var(--font-space-mono)'}}>
              {message}
            </div>
          )}

          {showNewFolder && (
            <div className="new-folder-input" style={{fontFamily: 'var(--font-space-mono)'}}>
              <input
                type="text"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                  if (e.key === "Escape") {
                    setShowNewFolder(false);
                    setNewFolderName("");
                  }
                }}
                autoFocus
                className="folder-input"
              />
              <button onClick={createFolder} className="folder-btn-create">CREATE</button>
              <button onClick={() => {setShowNewFolder(false); setNewFolderName("");}} className="folder-btn-cancel">CANCEL</button>
            </div>
          )}

          {isDragging && (
            <div className="drop-overlay">
              <div className="drop-zone" style={{fontFamily: 'var(--font-space-mono)'}}>
                <div style={{fontSize: '48px', marginBottom: '16px'}}>📤</div>
                <div>DROP_FILE_TO_UPLOAD</div>
              </div>
            </div>
          )}

          {/* SHELL-STYLE FILE LISTING */}
          <div className={`file-container ${viewMode}`}>
            {filteredItems.length === 0 ? (
              <div className="empty-state" style={{fontFamily: 'var(--font-space-mono)'}}>
                <div className="empty-icon">📦</div>
                <div>{(files.length + folders.length) === 0 ? "NO_FILES_STORED" : "NO_MATCHES_FOUND"}</div>
                <div style={{fontSize: '11px', color: '#444', marginTop: '8px'}}>
                  {(files.length + folders.length) === 0 ? "Press F1 to upload, F4 to create folder" : "Try a different search term"}
                </div>
              </div>
            ) : (
              <>
                {/* GRID VIEW */}
                {viewMode === "grid" && (
                  <div className="grid-view">
                    {filteredItems.map((item) =>
                      item.type === "folder" ? (
                        <div 
                          key={item.data.id} 
                          className="folder-card"
                          onClick={() => openFolder(item.data.id, item.data.name)}
                        >
                          <div className="folder-icon">📁</div>
                          <div className="folder-name" style={{fontFamily: 'var(--font-inter)'}}>
                            {item.data.name}
                          </div>
                        </div>
                      ) : (
                        <div 
                          key={item.data.id} 
                          className="file-card-grid"
                          onClick={() => previewFileHandler(item.data)}
                        >
                          <div className="file-icon">{getFileIcon(item.data.mimeType)}</div>
                          <div className="file-name" style={{fontFamily: 'var(--font-inter)'}}>
                            {item.data.filename}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                )}

                {/* LIST VIEW - SHELL STYLE */}
                {viewMode === "list" && (
                  <div className="shell-list">
                    <div className="shell-header" style={{fontFamily: 'var(--font-space-mono)'}}>
                      <div className="shell-col-name">NAME</div>
                      <div className="shell-col-size">SIZE</div>
                      <div className="shell-col-type">TYPE</div>
                      <div className="shell-col-date">MODIFIED</div>
                    </div>
                    {filteredItems.map((item) =>
                      item.type === "folder" ? (
                        <div 
                          key={item.data.id} 
                          className="shell-row folder-row"
                          onClick={() => openFolder(item.data.id, item.data.name)}
                          style={{fontFamily: 'var(--font-space-mono)'}}
                        >
                          <div className="shell-col-name">
                            <span className="shell-icon">📁</span> {item.data.name}
                          </div>
                          <div className="shell-col-size">-</div>
                          <div className="shell-col-type">[DIR]</div>
                          <div className="shell-col-date">{new Date(item.data.createdAt).toLocaleDateString()}</div>
                        </div>
                      ) : (
                        <div 
                          key={item.data.id} 
                          className="shell-row file-row"
                          onClick={() => previewFileHandler(item.data)}
                          style={{fontFamily: 'var(--font-space-mono)'}}
                        >
                          <div className="shell-col-name">
                            <span className="shell-icon">{getFileIcon(item.data.mimeType)}</span> {item.data.filename}
                          </div>
                          <div className="shell-col-size">{formatFileSize(item.data.sizeBytes)}</div>
                          <div className="shell-col-type">{item.data.mimeType.split('/')[1]?.toUpperCase() || item.data.mimeType}</div>
                          <div className="shell-col-date">{new Date(item.data.createdAt).toLocaleDateString()}</div>
                        </div>
                      )
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </main>

        {/* FORENSICS PANEL */}
        <aside className="forensics-panel">
          <div className="panel-title" style={{fontFamily: 'var(--font-space-mono)'}}>Forensic Inspector</div>
          
          {previewFile ? (
            <>
              <div className="data-block">
                <span className="data-label">FILE NAME</span>
                <div className="data-value">{previewFile.filename}</div>
              </div>

              <div className="data-block">
                <span className="data-label">MIME TYPE</span>
                <div className="data-value">{previewFile.mimeType}</div>
              </div>

              <div className="data-block">
                <span className="data-label">SIZE</span>
                <div className="data-value">{formatFileSize(previewFile.sizeBytes)}</div>
              </div>

              <div className="data-block">
                <span className="data-label">UPLOADED</span>
                <div className="data-value" style={{fontSize: '0.65rem'}}>
                  {new Date(previewFile.createdAt).toLocaleDateString()}<br />
                  {new Date(previewFile.createdAt).toLocaleTimeString()}
                </div>
              </div>

              <div className="data-block">
                <span className="data-label">THREAT LEVEL</span>
                <div className="threat-indicator clean" />
                <span style={{fontSize: '0.7rem', color: '#00ff00'}}>CLEAN</span>
              </div>

              <div style={{marginTop: 'auto'}}>
                <button 
                  className="action-btn full-width"
                  onClick={() => downloadFile(previewFile.id)}
                  style={{fontFamily: 'var(--font-space-mono)'}}
                >
                  DOWNLOAD
                </button>
                <button 
                  className="action-btn full-width secondary"
                  onClick={() => copyDownloadLink(previewFile.id)}
                  style={{fontFamily: 'var(--font-space-mono)', marginTop: '8px'}}
                >
                  COPY LINK
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="data-block">
                <span className="data-label">TOTAL FILES</span>
                <div className="data-value">{files.length}</div>
              </div>

              <div className="data-block">
                <span className="data-label">TOTAL FOLDERS</span>
                <div className="data-value">{folders.length}</div>
              </div>

              <div className="data-block">
                <span className="data-label">STORAGE USED</span>
                <div className="data-value">{formatFileSize(totalSize.toString())}</div>
              </div>

              <div className="data-block">
                <span className="data-label">VAULT STATUS</span>
                <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px'}}>
                  <div style={{width: '8px', height: '8px', background: '#00ff00', borderRadius: '50%', boxShadow: '0 0 10px #00ff00'}} />
                  <span style={{fontSize: '0.75rem', color: '#aaa'}}>SECURED</span>
                </div>
              </div>

              <div className="data-block">
                <span className="data-label">ENCRYPTION</span>
                <div className="data-value" style={{fontSize: '0.65rem', lineHeight: '1.5'}}>
                  AES-256-GCM<br />
                  SHA-256<br />
                  Cloudflare R2
                </div>
              </div>
            </>
          )}
        </aside>

        {/* FOOTER */}
        <footer className="vault-footer">
          <div>STATUS: MONITORING</div>
          <div>NODES: {files.length + folders.length}</div>
          <div className="packet-stream">R2_CONNECTED • AES_SECURED • VERIFIED</div>
        </footer>
      </main>

      {/* FILE PREVIEW MODAL */}
      {previewFile && (
        <div className="preview-modal" onClick={() => setPreviewFile(null)}>
          <div className="preview-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setPreviewFile(null)} style={{fontFamily: 'var(--font-space-mono)'}}>
              ✕
            </button>

            <div className="preview-main">
              <div className="preview-viewer">
                {previewFile.mimeType.startsWith("image/") && (
                  <img src={previewFile.downloadUrl} alt={previewFile.filename} className="preview-image" />
                )}
                {previewFile.mimeType.startsWith("video/") && (
                  <video src={previewFile.downloadUrl} controls className="preview-video" />
                )}
                {previewFile.mimeType.includes("pdf") && (
                  <iframe src={previewFile.downloadUrl} className="preview-pdf" title={previewFile.filename} />
                )}
                {!canPreview(previewFile.mimeType) && (
                  <div className="preview-placeholder" style={{fontFamily: 'var(--font-space-mono)'}}>
                    <div style={{fontSize: '64px', marginBottom: '20px'}}>{getFileIcon(previewFile.mimeType)}</div>
                    <div style={{fontSize: '14px', color: '#666'}}>PREVIEW_NOT_AVAILABLE</div>
                    <div style={{fontSize: '11px', color: '#444', marginTop: '8px'}}>Download to view this file</div>
                  </div>
                )}
              </div>

              <div className="preview-sidebar">
                <div className="preview-header" style={{fontFamily: 'var(--font-inter)'}}>
                  <div style={{fontSize: '18px', fontWeight: '700', marginBottom: '8px'}}>
                    {previewFile.filename}
                  </div>
                  <div style={{fontSize: '11px', color: '#444', fontFamily: 'var(--font-space-mono)'}}>
                    {previewFile.mimeType}
                  </div>
                </div>

                <div className="preview-details" style={{fontFamily: 'var(--font-space-mono)'}}>
                  <div className="detail-row">
                    <span className="detail-label">SIZE</span>
                    <span className="detail-value">{formatFileSize(previewFile.sizeBytes)}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">TYPE</span>
                    <span className="detail-value">{previewFile.mimeType.split('/')[1]?.toUpperCase()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">UPLOADED</span>
                    <span className="detail-value">{new Date(previewFile.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="detail-row">
                    <span className="detail-label">TIME</span>
                    <span className="detail-value">{new Date(previewFile.createdAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="preview-actions">
                  <button 
                    className="action-btn primary" 
                    onClick={() => downloadFile(previewFile.id)}
                    style={{fontFamily: 'var(--font-space-mono)'}}
                  >
                    DOWNLOAD
                  </button>
                  <button 
                    className="action-btn secondary" 
                    onClick={() => copyDownloadLink(previewFile.id)}
                    style={{fontFamily: 'var(--font-space-mono)'}}
                  >
                    COPY_LINK
                  </button>
                  <button 
                    className={`action-btn danger ${deleteConfirm === previewFile.id ? 'confirm' : ''}`}
                    onClick={() => deleteFile(previewFile.id)}
                    style={{fontFamily: 'var(--font-space-mono)'}}
                  >
                    {deleteConfirm === previewFile.id ? 'CONFIRM_DELETE?' : 'DELETE'}
                  </button>
                </div>

                <div className="preview-navigation" style={{fontFamily: 'var(--font-space-mono)'}}>
                  <button 
                    className="nav-btn"
                    onClick={() => navigatePreview(-1)}
                    disabled={filteredItems.findIndex(item => item.type === "file" && item.data.id === previewFile.id) === 0}
                  >
                    ← PREV
                  </button>
                  <span className="nav-indicator">
                    {filteredItems.findIndex(item => item.type === "file" && item.data.id === previewFile.id) + 1} / {filteredItems.filter(i => i.type === "file").length}
                  </span>
                  <button 
                    className="nav-btn"
                    onClick={() => navigatePreview(1)}
                    disabled={filteredItems.findIndex(item => item.type === "file" && item.data.id === previewFile.id) === filteredItems.filter(i => i.type === "file").length - 1}
                  >
                    NEXT →
                  </button>
                </div>

                <div className="keyboard-hints" style={{fontFamily: 'var(--font-space-mono)'}}>
                  <div><kbd>ESC</kbd> Close</div>
                  <div><kbd>←</kbd> <kbd>→</kbd> Navigate</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        :root {
          --bg-base: #050608;
          --trace-gold: rgba(255, 184, 0, 0.6);
          --trace-cyan: rgba(0, 243, 255, 0.4);
          --glass: rgba(15, 18, 24, 0.7);
          --border-glow: rgba(255, 255, 255, 0.08);
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: var(--trace-gold); }

        .topography-grid {
          position: fixed;
          top: 0; left: 0; width: 100%; height: 100%;
          pointer-events: none;
          z-index: 0;
          opacity: 0.4;
          mask-image: radial-gradient(circle at center, black, transparent 80%);
        }

        .vault-frame {
          position: relative;
          z-index: 1;
          display: grid;
          grid-template-columns: 280px 1fr 340px;
          grid-template-rows: 70px 1fr 40px;
          height: 100vh;
          gap: 1px;
          background: rgba(255,255,255,0.05);
        }

        .vault-header {
          grid-column: 1 / -1;
          background: var(--glass);
          backdrop-filter: blur(20px);
          display: flex;
          align-items: center;
          padding: 0 2rem;
          border-bottom: 1px solid var(--border-glow);
          justify-content: space-between;
        }

        .logo-section {
          font-weight: 900;
          font-size: 1.2rem;
          letter-spacing: 0.2rem;
          text-transform: uppercase;
          color: #fff;
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .logo-accent { color: var(--trace-gold); }

        .header-status {
          display: flex;
          gap: 30px;
          font-size: 0.7rem;
          text-transform: uppercase;
          color: #888;
        }

        .status-item span {
          color: var(--trace-cyan);
          margin-left: 5px;
        }

        .logout-btn {
          background: transparent;
          border: 1px solid var(--border-glow);
          color: #aaa;
          padding: 8px 16px;
          font-size: 0.7rem;
          text-transform: uppercase;
          cursor: pointer;
          transition: all 0.3s;
          letter-spacing: 0.1em;
        }

        .logout-btn:hover {
          border-color: var(--trace-gold);
          color: var(--trace-gold);
        }

        .file-tree {
          background: var(--glass);
          backdrop-filter: blur(10px);
          padding: 2rem;
          border-right: 1px solid var(--border-glow);
          overflow-y: auto;
        }

        .nav-label {
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.1rem;
          color: #555;
          margin-bottom: 1.5rem;
          display: block;
        }

        .tree-list { list-style: none; margin: 0; padding: 0; }

        .tree-node {
          font-size: 0.85rem;
          margin-bottom: 0.8rem;
          cursor: pointer;
          padding: 8px 12px 8px 16px;
          color: #909090;
          transition: all 0.2s ease;
          border-left: 2px solid transparent;
        }

        .tree-node:hover {
          color: var(--trace-gold);
          border-left-color: var(--trace-gold);
        }

        .tree-node.active {
          color: #fff;
          font-weight: bold;
          border-left-color: var(--trace-cyan);
        }

        .tree-icon { opacity: 0.4; margin-right: 4px; }

        .workspace {
          padding: 2rem;
          overflow-y: auto;
          position: relative;
          display: flex;
          flex-direction: column;
          background: var(--bg-base);
        }

        .view-controls {
          display: flex;
          gap: 20px;
          margin-bottom: 2rem;
        }

        .tab {
          font-size: 0.8rem;
          font-weight: 600;
          padding-bottom: 8px;
          border-bottom: 2px solid transparent;
          cursor: pointer;
          color: #666;
          transition: all 0.3s ease;
          text-transform: uppercase;
        }

        .tab.active {
          color: #fff;
          border-color: var(--trace-cyan);
        }

        .breadcrumb-nav {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 20px;
          font-size: 0.8rem;
          color: #666;
        }

        .breadcrumb-btn {
          background: transparent;
          border: none;
          color: var(--trace-cyan);
          cursor: pointer;
          transition: color 0.2s;
          padding: 0;
          text-decoration: underline;
          font-size: 0.8rem;
        }

        .breadcrumb-btn:hover { color: #fff; }
        .breadcrumb-sep { color: #555; margin: 0 4px; }

        .content-header {
          display: flex;
          gap: 16px;
          margin-bottom: 2rem;
          align-items: center;
          flex-wrap: wrap;
        }

        .search-box { flex: 1; min-width: 200px; }

        .search-input {
          width: 100%;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border-glow);
          color: #aaa;
          padding: 10px 16px;
          font-size: 0.8rem;
          outline: none;
          transition: all 0.3s;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .search-input:focus {
          border-color: var(--trace-cyan);
          color: #fff;
          box-shadow: 0 0 15px rgba(0, 243, 255, 0.1);
        }

        .search-input::placeholder { color: #555; }

        .sort-select {
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border-glow);
          color: #999;
          padding: 10px 16px;
          font-size: 0.8rem;
          letter-spacing: 0.05em;
          cursor: pointer;
          outline: none;
          transition: all 0.3s;
          text-transform: uppercase;
        }

        .sort-select:hover {
          border-color: var(--trace-cyan);
          color: #aaa;
        }

        .sort-select option {
          background: #0a0a0a;
          color: #fff;
        }

        .action-btn {
          background: transparent;
          border: 1px solid var(--border-glow);
          color: #aaa;
          padding: 10px 20px;
          font-size: 0.8rem;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.3s;
          text-transform: uppercase;
        }

        .action-btn:hover {
          border-color: var(--trace-cyan);
          color: var(--trace-cyan);
        }

        .action-btn.primary {
          border-color: var(--trace-gold);
          color: var(--trace-gold);
        }

        .action-btn.primary:hover {
          background: rgba(255, 184, 0, 0.1);
        }

        .action-btn.secondary {
          border-color: var(--trace-cyan);
          color: var(--trace-cyan);
        }

        .action-btn.secondary:hover {
          background: rgba(0, 243, 255, 0.1);
        }

        .action-btn.full-width {
          width: 100%;
          margin-top: 12px;
        }

        .grid-view {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 20px;
          flex: 1;
        }

        .file-card-grid {
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border-glow);
          padding: 2rem 1.5rem;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          cursor: pointer;
          transition: all 0.3s;
          position: relative;
          overflow: hidden;
        }

        .file-card-grid:hover {
          background: rgba(0, 243, 255, 0.05);
          border-color: var(--trace-cyan);
          transform: translateY(-5px);
        }

        .file-icon {
          font-size: 40px;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .file-name {
          font-weight: 700;
          font-size: 0.9rem;
          color: #e0e0e0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          width: 100%;
        }

        .file-meta {
          font-size: 0.65rem;
          color: #555;
          margin-top: 0.5rem;
        }

        .threat-level {
          position: absolute;
          top: 1.5rem;
          right: 1.5rem;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #00ff00;
          box-shadow: 0 0 10px #00ff00;
        }

        .threat-level.high {
          background: #ff3e3e;
          box-shadow: 0 0 10px #ff3e3e;
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0% {opacity: 1; transform: scale(1);}
          50% {opacity: 0.4; transform: scale(1.2);}
          100% {opacity: 1; transform: scale(1);}
        }

        .shell-list {
          display: flex;
          flex-direction: column;
          border: 1px solid var(--border-glow);
          background: rgba(255,255,255,0.01);
          overflow: hidden;
          flex: 1;
        }

        .shell-header {
          display: grid;
          grid-template-columns: 2fr 120px 120px 140px;
          gap: 16px;
          padding: 12px 16px;
          background: rgba(0,0,0,0.3);
          border-bottom: 1px solid var(--border-glow);
          font-size: 0.65rem;
          color: #555;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          font-weight: 500;
          position: sticky;
          top: 0;
          z-index: 5;
        }

        .shell-row {
          display: grid;
          grid-template-columns: 2fr 120px 120px 140px;
          gap: 16px;
          padding: 12px 16px;
          border-bottom: 1px solid rgba(255,255,255,0.02);
          align-items: center;
          font-size: 0.85rem;
          color: #909090;
          transition: all 0.2s;
          cursor: pointer;
        }

        .shell-row:hover {
          background: rgba(255,255,255,0.02);
          color: #fff;
          border-bottom-color: var(--border-glow);
        }

        .shell-row.folder-row {
          color: var(--trace-gold);
        }

        .shell-row.folder-row:hover {
          background: rgba(255, 184, 0, 0.05);
        }

        .shell-col-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .shell-icon {
          flex-shrink: 0;
          font-size: 16px;
        }

        .shell-col-size,
        .shell-col-type,
        .shell-col-date {
          text-align: right;
          color: #666;
        }

        .shell-row:hover .shell-col-size,
        .shell-row:hover .shell-col-type,
        .shell-row:hover .shell-col-date {
          color: #888;
        }

        .forensics-panel {
          background: var(--glass);
          backdrop-filter: blur(30px);
          border-left: 1px solid var(--border-glow);
          padding: 2rem;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
        }

        .panel-title {
          font-size: 0.7rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.2rem;
          margin-bottom: 2rem;
          color: var(--trace-gold);
        }

        .data-block { margin-bottom: 2rem; }

        .data-label {
          font-size: 0.6rem;
          color: #555;
          text-transform: uppercase;
          margin-bottom: 0.5rem;
          display: block;
          letter-spacing: 0.1em;
        }

        .data-value {
          font-size: 0.75rem;
          color: #aaa;
          word-break: break-all;
          background: rgba(0,0,0,0.3);
          padding: 10px;
          border-left: 2px solid var(--trace-gold);
        }

        .threat-indicator {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 8px;
          box-shadow: 0 0 10px rgba(0, 255, 0, 0.5);
        }

        .threat-indicator.clean {
          background: #00ff00;
        }

        .vault-footer {
          grid-column: 1 / -1;
          background: #000;
          display: flex;
          align-items: center;
          padding: 0 2rem;
          font-size: 0.6rem;
          color: #444;
          gap: 20px;
          border-top: 1px solid var(--border-glow);
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .packet-stream {
          margin-left: auto;
          color: var(--trace-cyan);
          overflow: hidden;
          white-space: nowrap;
        }

        .preview-modal {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2000;
          backdrop-filter: blur(12px);
        }

        .preview-content {
          background: var(--glass);
          backdrop-filter: blur(20px);
          border: 1px solid var(--border-glow);
          width: 90vw;
          max-width: 1200px;
          height: 80vh;
          display: grid;
          grid-template-rows: auto 1fr;
          grid-template-columns: 1fr 280px;
          position: relative;
          animation: slideUp 0.3s ease;
        }

        @keyframes slideUp {
          from {transform: translateY(20px); opacity: 0;}
          to {transform: translateY(0); opacity: 1;}
        }

        .modal-close {
          position: absolute;
          top: 12px;
          right: 12px;
          background: transparent;
          border: 1px solid var(--border-glow);
          color: #aaa;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 10;
          font-size: 18px;
          transition: all 0.3s;
        }

        .modal-close:hover {
          border-color: var(--trace-cyan);
          color: var(--trace-cyan);
        }

        .preview-main {
          grid-column: 1;
          grid-row: 1 / -1;
          display: flex;
          flex-direction: column;
          padding: 20px;
          overflow: hidden;
        }

        .preview-viewer {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.3);
          border: 1px solid var(--border-glow);
          overflow: auto;
          margin-bottom: 16px;
        }

        .preview-image, .preview-video, .preview-pdf {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }

        .preview-sidebar {
          grid-column: 2;
          grid-row: 1 / -1;
          padding: 20px;
          border-left: 1px solid var(--border-glow);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        .preview-header {
          margin-bottom: 20px;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--border-glow);
        }

        .preview-details {
          flex: 1;
          margin-bottom: 20px;
        }

        .detail-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px 0;
          font-size: 0.75rem;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }

        .detail-label {
          color: #666;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }

        .detail-value {
          color: #aaa;
          text-align: right;
          max-width: 150px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .preview-placeholder {
          text-align: center;
          color: #666;
        }

        .preview-navigation {
          display: flex;
          gap: 12px;
          align-items: center;
          justify-content: space-between;
          padding: 12px 0;
          border-top: 1px solid var(--border-glow);
          margin-bottom: 12px;
        }

        .nav-btn {
          background: transparent;
          border: 1px solid var(--border-glow);
          color: #666;
          padding: 6px 12px;
          font-size: 0.65rem;
          letter-spacing: 0.1em;
          cursor: pointer;
          transition: all 0.3s;
          text-transform: uppercase;
        }

        .nav-btn:hover:not(:disabled) {
          border-color: var(--trace-cyan);
          color: var(--trace-cyan);
        }

        .nav-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .nav-indicator {
          font-size: 0.65rem;
          color: #666;
          text-transform: uppercase;
        }

        .keyboard-hints {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.6rem;
          color: #555;
          padding: 8px 0;
        }

        .keyboard-hints kbd {
          background: rgba(0,0,0,0.3);
          border: 1px solid var(--border-glow);
          padding: 2px 4px;
          border-radius: 2px;
          font-size: 0.6rem;
          color: var(--trace-cyan);
          margin-right: 4px;
        }

        .status-message {
          padding: 12px 16px;
          background: rgba(0, 243, 255, 0.05);
          border: 1px solid var(--trace-cyan);
          color: var(--trace-cyan);
          font-size: 0.75rem;
          margin-bottom: 24px;
          letter-spacing: 0.1em;
        }

        .status-message.error {
          background: rgba(255, 62, 62, 0.05);
          border-color: #ff3e3e;
          color: #ff3e3e;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          color: #666;
          font-size: 0.85rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          flex: 1;
        }

        .empty-icon {
          font-size: 64px;
          margin-bottom: 20px;
          opacity: 0.3;
        }

        .drop-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          backdrop-filter: blur(8px);
        }

        .drop-zone {
          border: 2px dashed var(--trace-cyan);
          padding: 60px;
          text-align: center;
          color: var(--trace-cyan);
          font-size: 1.2rem;
          letter-spacing: 0.1em;
        }

        .new-folder-input {
          display: flex;
          gap: 12px;
          margin-bottom: 20px;
          padding: 16px;
          background: rgba(255,255,255,0.02);
          border: 1px solid var(--border-glow);
        }

        .folder-input {
          flex: 1;
          background: transparent;
          border: 1px solid var(--border-glow);
          color: #fff;
          padding: 10px 16px;
          font-size: 0.85rem;
          outline: none;
          transition: all 0.3s;
        }

        .folder-input:focus {
          border-color: var(--trace-cyan);
          box-shadow: 0 0 15px rgba(0, 243, 255, 0.1);
        }

        .folder-btn-create,
        .folder-btn-cancel {
          background: transparent;
          border: 1px solid var(--border-glow);
          color: #aaa;
          padding: 10px 20px;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.3s;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .folder-btn-create:hover {
          border-color: var(--trace-gold);
          color: var(--trace-gold);
        }

        .folder-btn-cancel:hover {
          border-color: #ff3e3e;
          color: #ff3e3e;
        }
      `}</style>
    </>
  );
}