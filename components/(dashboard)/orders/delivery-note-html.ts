// Repli d'impression navigateur : document 58 mm sans prix, imprimé via une
// iframe (aucune CSS globale d'impression à maintenir).

import type { DeliveryNote } from '@/lib/orders/delivery-note/build';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

export function deliveryNoteHtml(note: DeliveryNote): string {
  const lines = note.lines
    .map(
      (l) =>
        `<div class="l"><b>${l.quantity}x ${esc(l.productName)}</b>${
          l.flavors.length
            ? `<div>Goûts : ${esc(l.flavors.join(', '))}</div>`
            : ''
        }${l.extras.length ? `<div>+ ${esc(l.extras.join(', '))}</div>` : ''}</div>`
    )
    .join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
@page{size:58mm auto;margin:2mm}body{width:54mm;font:12px monospace;margin:0}
h1{font-size:13px;text-align:center;margin:0}.c{font-size:30px;font-weight:bold;text-align:center}
.s{text-align:center}hr{border:0;border-top:1px dashed #000}.l{margin:4px 0}.l div{padding-left:10px}
</style></head><body><h1>EBA COFFEE SHOP<br>BON DE LIVRAISON</h1>
<div class="c">${esc(note.code)}</div><div class="s">${esc(note.dailyNumber)}</div><hr>
<div>Client : ${esc(note.customer)}</div>${note.pickup ? `<div>Pour : ${esc(note.pickup)}</div>` : ''}<hr>
${lines}${note.note ? `<hr><div>Note : ${esc(note.note)}</div>` : ''}<hr></body></html>`;
}

export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;opacity:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  if (!doc || !frame.contentWindow) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  frame.contentWindow.focus();
  frame.contentWindow.print();
  setTimeout(() => frame.remove(), 60_000);
}
