import fs from 'fs';
import path from 'path';
import { sendEmail } from '../../lib/email';

const dataFile = path.join(process.cwd(), 'src', 'data', 'employees.json');

function readEmployees() {
  try {
    const data = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }
  const employees = readEmployees();
  const today = new Date();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const messages = [];
  employees.forEach(emp => {
    if (emp.birthday) {
      const [y, m, d] = emp.birthday.split('-').map(Number);
      if (m === month && d === day) {
        messages.push(`Birthday: ${emp.name} ${emp.surname}`);
      }
    }
    if (emp.startDate) {
      const [sy, sm, sd] = emp.startDate.split('-').map(Number);
      if (sm === month && sd === day) {
        const years = today.getFullYear() - sy;
        messages.push(`Anniversary ${years} years: ${emp.name} ${emp.surname}`);
      }
    }
  });
  if (messages.length && process.env.ADMIN_EMAIL) {
    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL,
        subject: 'Employee celebrations',
        text: messages.join('\n'),
      });
    } catch (e) {
      console.error('Failed to send email', e);
    }
  }
  return res.status(200).json({ sent: messages.length });
}
