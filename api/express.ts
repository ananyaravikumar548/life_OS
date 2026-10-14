import type { Request, Response } from 'express'
import app from '../server/app.js'

export default function handler(request: Request, response: Response) {
  const incomingUrl = new URL(request.url, 'http://vercel.internal')
  const expressPath = incomingUrl.searchParams.get('__expressPath')

  if (expressPath !== null) {
    incomingUrl.searchParams.delete('__expressPath')
    request.url = `/api/${expressPath}${incomingUrl.search}`
  }

  app(request, response)
}
