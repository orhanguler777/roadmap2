import fs from 'fs';
import path from 'path';
import { sendEmail } from '../../lib/email';

const dataFile = path.join(process.cwd(), 'src', 'data', 'timeoff.json');

function readRequests() {
  try {
    const data = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeRequests(reqs) {
  fs.writeFileSync(dataFile, JSON.stringify(reqs, null, 2));
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const requests = readRequests();
    return res.status(200).json(requests);
  }
  if (req.method === 'POST') {
    const requests = readRequests();
    const newReq = req.body;
    requests.push(newReq);
    writeRequests(requests);
    if (process.env.ADMIN_EMAIL) {
      try {
        await sendEmail({
          to: process.env.ADMIN_EMAIL,
          subject: 'New time off request',
          text: `${newReq.name} requested time off from ${newReq.start} to ${newReq.end}`,
        });
      } catch (e) {
        console.error('Failed to send email', e);
      }
    }
    return res.status(201).json(newReq);
  }
  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end('Method Not Allowed');
}
