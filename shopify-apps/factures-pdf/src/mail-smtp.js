// Envoi SMTP (nodemailer) : uniquement sur Node. Sur Cloudflare, voir createBrevoTransport.

import nodemailer from 'nodemailer';

/** `url` : adresse smtp://…, objet de réglages nodemailer, ou "json" (tests, aucun envoi). */
export function createTransport(url) {
  if (!url) return null;
  if (url === 'json') return nodemailer.createTransport({ jsonTransport: true });
  return nodemailer.createTransport(url);
}
