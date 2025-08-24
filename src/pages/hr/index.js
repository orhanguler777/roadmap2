import Link from 'next/link';

export default function HrHome() {
  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>HR Management</h1>
      <ul>
        <li><Link href="/hr/employees">Employees</Link></li>
        <li><Link href="/hr/timeoff">Request Time Off</Link></li>
      </ul>
    </div>
  );
}
