import fs from 'fs';
import path from 'path';

const dataFile = path.join(process.cwd(), 'src', 'data', 'employees.json');

function readEmployees() {
  try {
    const data = fs.readFileSync(dataFile, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

function writeEmployees(employees) {
  fs.writeFileSync(dataFile, JSON.stringify(employees, null, 2));
}

export default function handler(req, res) {
  if (req.method === 'GET') {
    const employees = readEmployees();
    return res.status(200).json(employees);
  }
  if (req.method === 'POST') {
    const employees = readEmployees();
    const newEmp = req.body;
    employees.push(newEmp);
    writeEmployees(employees);
    return res.status(201).json(newEmp);
  }
  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end('Method Not Allowed');
}
