import { useState, useRef } from 'react'
import { supabase, BUCKET_NAME } from '../lib/supabase'

interface UploadedFile {
  name: string
  url: string
  downloadUrl: string
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
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setError('File size must be less than 10MB')
      return false
    }
    return true
  }

  const generateFileName = (originalName: string): string => {
    const timestamp = Date.now()
    const extension = originalName.split('.').pop()
    const nameWithoutExtension = originalName.replace(/\.[^/.]+$/, '')
    return `${timestamp}-${nameWithoutExtension}.${extension}`
  }

  const uploadFile = async (file: File) => {
    if (!validateFile(file)) return

    setUploading(true)
    setError(null)

    try {
      const fileName = generateFileName(file.name)

      const { data, error: uploadError } = await supabase.storage
        .from(BUCKET_NAME)
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        throw uploadError
      }

      // Generate signed URLs for viewing and downloading (1 year expiration)
      const { data: urlData, error: urlError } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(fileName, 31536000) // 1 year in seconds

      if (urlError) {
        throw urlError
      }

      // Generate download URL
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from(BUCKET_NAME)
        .createSignedUrl(fileName, 31536000, { download: true })

      if (downloadError) {
        throw downloadError
      }

      setUploadedFile({
        name: file.name,
        url: urlData.signedUrl,
        downloadUrl: downloadData.signedUrl
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

  return (
    <div className="upload-container">
      <h1>PDF Upload to Supabase</h1>

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
              <p>Uploading...</p>
            </div>
          ) : (
            <div className="upload-prompt">
              <div className="upload-icon">📄</div>
              <p>Click to select or drag & drop a PDF file</p>
              <p className="file-info">PDF files only, max 10MB</p>
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
            <p><strong>Link expires:</strong> 1 year from now</p>
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