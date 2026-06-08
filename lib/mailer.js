/**
 * Mailer - Gmail SMTP wrapper voi Nodemailer.
 * Tao Gmail App Password tai: https://myaccount.google.com/apppasswords
 * Set 2 bien moi truong: SMTP_USER, SMTP_PASS (App password 16 ky tu)
 */
const nodemailer = require('nodemailer');

const USER = process.env.SMTP_USER || '';
const PASS = process.env.SMTP_PASS || '';
const FROM_NAME = process.env.SMTP_FROM_NAME || 'XOSO66 TV';

let transporter = null;

function getTransporter() {
  if (!USER || !PASS) {
    console.warn('[Mailer] SMTP_USER hoac SMTP_PASS chua duoc set - email se KHONG gui');
    return null;
  }
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: USER, pass: PASS }
    });
  }
  return transporter;
}

function otpEmailHtml(code, brandName, minutes) {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#ff7a18,#ff3b3b);padding:24px;text-align:center;color:#fff">
      <h1 style="margin:0;font-size:24px;font-weight:900">${brandName}</h1>
      <p style="margin:6px 0 0;opacity:.95">Khoi phuc mat khau</p>
    </div>
    <div style="padding:30px 28px">
      <p style="margin:0 0 12px;font-size:14px;color:#374151">Xin chao,</p>
      <p style="margin:0 0 18px;font-size:14px;color:#374151">Ban (hoac ai do) vua yeu cau khoi phuc mat khau tai khoan tai <b>${brandName}</b>. Su dung ma OTP duoi day de tiep tuc:</p>
      <div style="text-align:center;margin:24px 0">
        <div style="display:inline-block;background:#fff8f0;border:2px dashed #ff7a18;padding:16px 32px;border-radius:10px">
          <div style="font-size:38px;font-weight:900;color:#ff7a18;letter-spacing:8px;font-family:Courier New,monospace">${code}</div>
        </div>
      </div>
      <p style="margin:0 0 8px;font-size:13px;color:#6b7280">Ma nay co hieu luc trong <b>${minutes} phut</b>. Khong chia se ma cho bat ky ai.</p>
      <p style="margin:14px 0 0;font-size:12px;color:#9ca3af">Neu ban khong yeu cau, vui long bo qua email nay hoac lien he CSKH.</p>
    </div>
    <div style="background:#f3f4f6;padding:12px;text-align:center;font-size:11px;color:#9ca3af">
      &copy; ${new Date().getFullYear()} ${brandName} &middot; Email tu dong, vui long khong reply.
    </div>
  </div>`;
}

async function sendOtp(toEmail, code, brandName, ttlMs) {
  const t = getTransporter();
  if (!t) {
    console.log('[Mailer DEMO] Se gui OTP', code, 'den', toEmail);
    return { ok: false, demo: true };
  }
  const minutes = Math.round((ttlMs || 300000) / 60000);
  await t.sendMail({
    from: `"${FROM_NAME}" <${USER}>`,
    to: toEmail,
    subject: `[${brandName}] Ma OTP khoi phuc mat khau: ${code}`,
    text: 'Ma OTP cua ban la: ' + code + '. Co hieu luc trong ' + minutes + ' phut.',
    html: otpEmailHtml(code, brandName, minutes)
  });
  return { ok: true };
}

module.exports = { sendOtp, isReady: () => !!(USER && PASS) };
