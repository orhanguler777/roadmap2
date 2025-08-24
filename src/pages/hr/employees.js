import { useState, useEffect } from 'react';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ name: '', surname: '', position: '', startDate: '', birthday: '' });

  useEffect(() => {
    fetch('/api/employees').then(res => res.json()).then(setEmployees);
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await fetch('/api/employees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    setForm({ name: '', surname: '', position: '', startDate: '', birthday: '' });
    const updated = await fetch('/api/employees').then(res => res.json());
    setEmployees(updated);
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Employees</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 300 }}>
        <input name="name" placeholder="Name" value={form.name} onChange={handleChange} required />
        <input name="surname" placeholder="Surname" value={form.surname} onChange={handleChange} required />
        <input name="position" placeholder="Position" value={form.position} onChange={handleChange} />
        <input name="startDate" type="date" placeholder="Start Date" value={form.startDate} onChange={handleChange} />
        <input name="birthday" type="date" placeholder="Birthday" value={form.birthday} onChange={handleChange} />
        <button type="submit">Add</button>
      </form>
      <ul>
        {employees.map((e, i) => (
          <li key={i}>{e.name} {e.surname} - {e.position}</li>
        ))}
      </ul>
    </div>
  );
}
