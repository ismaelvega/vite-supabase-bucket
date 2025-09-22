import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)
const BUCKET_NAME = 'vitejs'

// Simple in-memory rate limiting (resets on function restart)
const uploadCounts = new Map<string, { count: number; resetTime: number }>()

function getClientIP(req: VercelRequest): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    (req.headers['x-real-ip'] as string) ||
    'unknown'
  )
}

function isRateLimited(ip: string): boolean {
  const now = Date.now()
  const record = uploadCounts.get(ip)

  if (!record || now > record.resetTime) {
    // Reset or create new record (1 hour window)
    uploadCounts.set(ip, { count: 1, resetTime: now + 60 * 60 * 1000 })
    return false
  }

  if (record.count >= 5) { // Max 5 uploads per hour
    return true
  }

  record.count++
  return false
}

function validatePDF(buffer: Buffer): boolean {
  // Check PDF magic number (%PDF)
  const pdfHeader = buffer.slice(0, 4).toString()
  return pdfHeader === '%PDF'
}

function sanitizeFileName(filename: string): string {
  // Remove/replace dangerous characters
  return filename
    .replace(/[^a-zA-Z0-9.\-_\s]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
}

function generateFileName(originalName: string): string {
  const timestamp = Date.now()
  const sanitized = sanitizeFileName(originalName)
  const extension = sanitized.split('.').pop()
  const nameWithoutExtension = sanitized.replace(/\.[^/.]+$/, '')
  return `${timestamp}-${nameWithoutExtension}.${extension}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const clientIP = getClientIP(req)

    // Check rate limiting
    if (isRateLimited(clientIP)) {
      return res.status(429).json({
        error: 'Too many uploads. Please try again later.'
      })
    }

    // Parse the uploaded file
    const contentType = req.headers['content-type']
    if (!contentType?.includes('multipart/form-data')) {
      return res.status(400).json({ error: 'Invalid content type' })
    }

    // Get file data from request body
    // Note: This is a simplified approach. In production, use a proper multipart parser
    const rawBody = req.body
    if (!rawBody || typeof rawBody !== 'object') {
      return res.status(400).json({ error: 'No file provided' })
    }

    // For this example, assuming the file comes as base64 in the body
    const { fileData, fileName, fileSize } = rawBody as {
      fileData: string
      fileName: string
      fileSize: number
    }

    if (!fileData || !fileName) {
      return res.status(400).json({ error: 'Missing file data or name' })
    }

    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024
    if (fileSize > maxSize) {
      return res.status(400).json({ error: 'File too large. Max size is 5MB.' })
    }

    // Convert base64 to buffer
    const fileBuffer = Buffer.from(fileData, 'base64')

    // Validate PDF
    if (!validatePDF(fileBuffer)) {
      return res.status(400).json({ error: 'Invalid PDF file' })
    }

    // Generate unique filename
    const uniqueFileName = generateFileName(fileName)

    // Upload to Supabase
    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(uniqueFileName, fileBuffer, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false
      })

    if (uploadError) {
      console.error('Upload error:', uploadError)
      return res.status(500).json({ error: 'Upload failed' })
    }

    // Generate signed URLs (1 year expiration)
    const oneYear = 31536000 // seconds

    const [viewUrlResult, downloadUrlResult] = await Promise.all([
      supabase.storage.from(BUCKET_NAME).createSignedUrl(uniqueFileName, oneYear),
      supabase.storage.from(BUCKET_NAME).createSignedUrl(uniqueFileName, oneYear, { download: true })
    ])

    if (viewUrlResult.error || downloadUrlResult.error) {
      console.error('URL generation error:', viewUrlResult.error || downloadUrlResult.error)
      return res.status(500).json({ error: 'Failed to generate URLs' })
    }

    // Return success response
    res.status(200).json({
      message: 'Upload successful',
      file: {
        name: fileName,
        url: viewUrlResult.data.signedUrl,
        downloadUrl: downloadUrlResult.data.signedUrl,
        expiresAt: new Date(Date.now() + oneYear * 1000).toISOString()
      }
    })

  } catch (error) {
    console.error('API error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}