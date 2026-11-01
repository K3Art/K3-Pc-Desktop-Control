document.querySelector('#pair').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/api/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: document.querySelector('#code').value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Pairing failed');
    location.replace('/');
  } catch (error) { document.querySelector('#error').textContent = error.message; }
  finally { button.disabled = false; }
});
