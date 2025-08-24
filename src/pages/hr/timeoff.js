import { useState } from 'react';

export default function TimeOff() {
  const [form, setForm] = useState({ name: '', start: '', end: '', reason: '' });
  const [status, setStatus] = useState('');

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const res = await fetch('/api/timeoff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setStatus('Request submitted');
      setForm({ name: '', start: '', end: '', reason: '' });
    } else {
      setStatus('Error submitting request');
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: 'sans-serif' }}>
      <h1>Request Time Off</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 300 }}>
        <input name="name" placeholder="Name" value={form.name} onChange={handleChange} required />
        <input name="start" type="date" value={form.start} onChange={handleChange} required />
        <input name="end" type="date" value={form.end} onChange={handleChange} required />
        <input name="reason" placeholder="Reason" value={form.reason} onChange={handleChange} />
        <button type="submit">Submit</button>
      </form>
      {status && <p>{status}</p>}
    </div>
  );
}
