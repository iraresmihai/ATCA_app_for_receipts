let folders = [];
let dest = null;

const elList = document.getElementById('list');
const elCount = document.getElementById('count');
const elDest = document.getElementById('dest');
const elWrite = document.getElementById('write');
const elStatus = document.getElementById('status');

// Default destination: <parent of first picked folder>\.claude\allPdf.txt.
// Picking folders under forUsers/ thus lands the file at forUsers/.claude/allPdf.txt.
function defaultDest(folders) {
  if (folders.length === 0) return null;
  const first = folders[0];
  const parent = first.replace(/[\\/][^\\/]+$/, '');
  return `${parent}\\.claude\\allPdf.txt`;
}

async function renderList() {
  elList.innerHTML = '';
  if (folders.length === 0) {
    elList.innerHTML = '<div style="padding: 30px; text-align: center; color: #94a3b8; font-size: 13px;">Picked folders will appear here.</div>';
    elCount.textContent = 'No folders picked yet.';
    return;
  }
  let okCount = 0;
  for (const f of folders) {
    const pdfPath = `${f}\\receipts.pdf`;
    const ok = await window.api.exists(pdfPath);
    if (ok) okCount++;
    const div = document.createElement('div');
    div.className = `item ${ok ? 'ok' : 'missing'}`;
    div.innerHTML =
      `<span class="path" title="${f}">${f}</span>` +
      `<span class="tag">${ok ? '✓ receipts.pdf' : '✗ no receipts.pdf'}</span>`;
    elList.appendChild(div);
  }
  elCount.textContent = `${folders.length} folder(s) picked — ${okCount} with receipts.pdf, ${folders.length - okCount} without.`;
}

function updateDest() {
  elDest.textContent = dest ?? '—';
  elWrite.disabled = !dest || folders.length === 0;
}

document.getElementById('pick').onclick = async () => {
  const picked = await window.api.pickFolders();
  if (!picked) return;
  folders = picked;
  if (!dest) dest = defaultDest(folders);
  elStatus.textContent = '';
  elStatus.className = 'muted';
  await renderList();
  updateDest();
};

document.getElementById('changeDest').onclick = async () => {
  const parent = await window.api.pickDestFolder();
  if (!parent) return;
  // If the picked folder is itself .claude, drop the file in there;
  // otherwise add a .claude subfolder.
  const last = parent.replace(/^.*[\\/]/, '');
  dest = last === '.claude'
    ? `${parent}\\allPdf.txt`
    : `${parent}\\.claude\\allPdf.txt`;
  updateDest();
};

document.getElementById('write').onclick = async () => {
  if (!dest || folders.length === 0) return;
  const lines = folders.map(f => `${f}\\receipts.pdf`);
  try {
    await window.api.writeAllPdf(dest, lines);
    elStatus.className = 'status ok';
    elStatus.textContent = `✓ Wrote ${lines.length} path(s) to ${dest}`;
  } catch (e) {
    elStatus.className = 'status err';
    elStatus.textContent = `✗ ${e.message ?? e}`;
  }
};
