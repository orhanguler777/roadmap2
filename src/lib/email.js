import { google } from 'googleapis';

export async function sendEmail({ to, subject, text }) {
  const { GMAIL_CLIENT_EMAIL, GMAIL_PRIVATE_KEY, ADMIN_EMAIL } = process.env;
  if (!GMAIL_CLIENT_EMAIL || !GMAIL_PRIVATE_KEY || !ADMIN_EMAIL) {
    console.warn('Email environment variables not set; skipping send.');
    return;
  }
  const auth = new google.auth.JWT(
    GMAIL_CLIENT_EMAIL,
    null,
    GMAIL_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/gmail.send'],
    ADMIN_EMAIL
  );
  await auth.authorize();
  const gmail = google.gmail({ version: 'v1', auth });
  const message = [`To: ${to}`, `Subject: ${subject}`, '', text].join('\n');
  const encodedMessage = Buffer.from(message)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encodedMessage },
  });
}
