const fs = require('fs');
const path = require('path');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function buildTranscriptHtml(ticket, messages) {
  const rows = messages.length
    ? messages.map(m => `
        <tr>
          <td class="ts">${new Date(m.timestamp).toLocaleString()}</td>
          <td class="author">${escapeHtml(m.author_tag)}</td>
          <td>${escapeHtml(m.content)}</td>
        </tr>`).join('')
    : '<tr><td colspan="3" style="text-align:center;color:#72767d">No messages recorded.</td></tr>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Ticket #${ticket.id} — ${escapeHtml(ticket.subject)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#36393f;color:#dcddde;padding:24px}
  h1{color:#fff;margin-bottom:12px;font-size:1.4rem}
  .meta{background:#2f3136;border-radius:8px;padding:14px 18px;margin-bottom:20px;display:flex;gap:24px;flex-wrap:wrap;font-size:.875rem}
  .meta b{color:#b9bbbe}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.75rem;font-weight:600}
  .open{background:#57f287;color:#000}.closed{background:#ed4245;color:#fff}
  table{width:100%;border-collapse:collapse;background:#2f3136;border-radius:8px;overflow:hidden;font-size:.875rem}
  th{background:#5865f2;color:#fff;padding:10px 14px;text-align:left;font-weight:600}
  td{padding:8px 14px;border-bottom:1px solid #40444b;vertical-align:top;word-break:break-word}
  tr:last-child td{border-bottom:none}
  tr:nth-child(even) td{background:#32353b}
  .ts{white-space:nowrap;color:#72767d;font-size:.8rem;min-width:160px}
  .author{font-weight:600;color:#7289da;white-space:nowrap;min-width:140px}
</style>
</head>
<body>
  <h1>🎫 Ticket #${ticket.id} — ${escapeHtml(ticket.subject)}</h1>
  <div class="meta">
    <span><b>Status:</b> <span class="badge ${ticket.status}">${ticket.status.toUpperCase()}</span></span>
    <span><b>Opened:</b> ${new Date(ticket.created_at).toLocaleString()}</span>
    ${ticket.closed_at ? `<span><b>Closed:</b> ${new Date(ticket.closed_at).toLocaleString()}</span>` : ''}
    <span><b>Subject:</b> ${escapeHtml(ticket.subject)}</span>
  </div>
  <table>
    <thead><tr><th>Time</th><th>Author</th><th>Message</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;
}

async function generateTranscript(ticket, db) {
  const dir = path.join(__dirname, '..', '..', 'transcripts');
  fs.mkdirSync(dir, { recursive: true });

  const filename = `ticket-${ticket.id}-${Date.now()}.html`;
  const filepath = path.join(dir, filename);

  const messages = db.getTicketMessages(ticket.id);
  fs.writeFileSync(filepath, buildTranscriptHtml(ticket, messages), 'utf8');
  return filepath;
}

module.exports = { generateTranscript, buildTranscriptHtml };
