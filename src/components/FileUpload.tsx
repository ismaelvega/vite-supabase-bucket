import { useState, useRef } from 'react'

interface UploadedFile {
  name: string
  url: string
  downloadUrl: string
  expiresAt: string
}

export function FileUpload() {
  const [uploading, setUploading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): boolean => {
    if (file.type !== 'application/pdf') {
      setError('Only PDF files are allowed')
      return false
    }
    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      setError('File size must be less than 5MB')
      return false
    }
    return true
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const result = reader.result as string
        // Remove data:application/pdf;base64, prefix
        const base64 = result.split(',')[1]
        resolve(base64)
      }
      reader.onerror = reject
    })
  }

  const uploadFile = async (file: File) => {
    if (!validateFile(file)) return

    setUploading(true)
    setError(null)

    try {
      const fileData = await fileToBase64(file)

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fileData,
          fileName: file.name,
          fileSize: file.size
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Upload failed')
      }

      const result = await response.json()

      setUploadedFile({
        name: result.file.name,
        url: result.file.url,
        downloadUrl: result.file.downloadUrl,
        expiresAt: result.file.expiresAt
      })

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleFileSelect = (files: FileList | null) => {
    if (files && files.length > 0) {
      uploadFile(files[0])
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      uploadFile(e.dataTransfer.files[0])
    }
  }

  const resetUpload = () => {
    setUploadedFile(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const formatExpirationDate = (isoString: string): string => {
    return new Date(isoString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="upload-container">
      <h1>PDF Upload to Supabase</h1>
      <p className="subtitle">Secure upload via Vercel API • Max 5MB • 5 uploads/hour</p>

      {!uploadedFile && (
        <div
          className={`drop-zone ${dragActive ? 'drag-active' : ''} ${uploading ? 'uploading' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => handleFileSelect(e.target.files)}
            style={{ display: 'none' }}
            disabled={uploading}
          />

          {uploading ? (
            <div className="upload-status">
              <div className="spinner"></div>
              <p>Uploading securely...</p>
            </div>
          ) : (
            <div className="upload-prompt">
              <div className="upload-icon">📄</div>
              <p>Click to select or drag & drop a PDF file</p>
              <p className="file-info">PDF files only, max 5MB</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {uploadedFile && (
        <div className="upload-success">
          <h2>✅ Upload Successful!</h2>
          <div className="file-info">
            <p><strong>File:</strong> {uploadedFile.name}</p>
            <p><strong>Link expires:</strong> {formatExpirationDate(uploadedFile.expiresAt)}</p>
            <p><strong>Security:</strong> Server-side validated & rate-limited</p>
          </div>

          <div className="file-actions">
            <a
              href={uploadedFile.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
            >
              View PDF
            </a>
            <a
              href={uploadedFile.downloadUrl}
              download
              className="btn btn-secondary"
            >
              Download PDF
            </a>
          </div>

          <button onClick={resetUpload} className="btn btn-outline">
            Upload Another File
          </button>
        </div>
      )}
    </div>
  )
}