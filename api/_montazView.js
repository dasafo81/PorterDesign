// api/_montazView.js
// Widok „Do montażu” (checklista dla ekipy montażowej, bez cen) jako czysta funkcja:
// dane (JSON) → kompletna strona HTML. Współdzielony przez:
//   • okno „🔧 Do montażu” w karcie deala (src/components/ScreenCRM.jsx),
//   • publiczny link dla montażysty (api/montaz.js).
// Plik z prefiksem „_” nie jest osobnym endpointem Vercela. Bez zależności od przeglądarki i Node.
//
// data = {
//   name, addr,
//   rows:    [{room, name, qty, unit, modelSzycia, szerokosc, wysokosc, podzial, note, installNote}],
//   rails:   [{no, length_cm, color, cuts:[cm,...], spare}],
//   missing: [{len, room}],
//   hasRails: bool
// }
// opts.nonce — gdy podany, przycisk „Drukuj” podpinany jest skryptem z tym nonce
// (strona publiczna ma CSP bez inline-handlerów); bez niego używany jest onclick.

function esc(v) {
  return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function renderMontazHtml(data, opts) {
  data = data || {};
  opts = opts || {};
  var rows = data.rows || [];
  var body = '';

  if (data.hasRails && (data.rails || []).length + (data.missing || []).length > 0) {
    body += '<div class="rails"><div class="rt">📏 Szyny KS z magazynu</div>';
    (data.rails || []).forEach(function (r) {
      body += '<div class="rl"><b>#' + esc(r.no) + ' szyna ' + esc(r.length_cm) + ' cm' + (r.color ? ' (' + esc(r.color) + ')' : '') + '</b> → tnij: '
        + esc((r.cuts || []).join(' + ')) + ' cm'
        + (r.spare > 0 ? ' · zostanie ' + esc(r.spare) + ' cm' : ' · bez reszty') + '</div>';
    });
    if ((data.missing || []).length) {
      body += '<div class="rl miss">Brak w magazynie: '
        + esc(data.missing.map(function (n) { return n.len + ' cm' + (n.room ? ' (' + n.room + ')' : ''); }).join(', ')) + '</div>';
    }
    body += '<div class="rn">Odcinki ułożone tak, by zużyć jak najmniej szyn; 1 cm zapasu na każde cięcie.</div></div>';
  }

  if (!rows.length) {
    body = '<p class="empty">Brak pozycji w wycenie.</p>';
  } else {
    rows.forEach(function (r, i) {
      if (i === 0 || r.room !== rows[i - 1].room) body += '<h2>' + esc(r.room) + '</h2>';
      var wymiary = [r.szerokosc && r.szerokosc !== '-' ? r.szerokosc : null, r.wysokosc && r.wysokosc !== '-' ? r.wysokosc : null].filter(Boolean).join(' × ');
      var multi = r.qty > 1;
      body += '<div class="item' + (multi ? ' multi' : '') + '">'
        + '<div class="head">'
        + (multi ? '<span class="qty">' + esc(r.qty) + '×</span>' : '')
        + '<span class="name">' + esc(r.name) + '</span>'
        + (multi && r.unit ? '<span class="unit">' + esc(r.unit) + '</span>' : '')
        + '</div>'
        + (r.modelSzycia && r.modelSzycia !== '-' ? '<div class="model">' + esc(r.modelSzycia) + '</div>' : '')
        + (wymiary ? '<div class="dim">' + esc(wymiary) + '</div>' : '')
        + (r.podzial && r.podzial !== '-' ? '<div class="sub">' + esc(r.podzial) + '</div>' : '')
        + (r.note ? '<div class="note">Uwaga: ' + esc(r.note) + '</div>' : '')
        + (r.installNote ? '<div class="inst">🔨 ' + esc(r.installNote) + '</div>' : '')
        + '</div>';
    });
  }

  var printBtn = opts.nonce
    ? '<button id="pr" type="button">Drukuj</button><script nonce="' + esc(opts.nonce) + '">document.getElementById("pr").addEventListener("click",function(){window.print();});</script>'
    : '<button onclick="window.print()">Drukuj</button>';
  var addr = data.addr || '';
  var updated = data.updatedAt
    ? '<div class="upd">Stan na: ' + esc(new Date(data.updatedAt).toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw', dateStyle: 'short', timeStyle: 'short' })) + '</div>'
    : '';

  return '<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="robots" content="noindex,nofollow">'
    + '<title>Do montażu — ' + esc(data.name || '') + '</title><style>'
    + 'body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;max-width:760px;margin:0 auto;padding:20px 18px 40px;font-size:14px}'
    + '.top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;border-bottom:2px solid #1a1a1a;padding-bottom:10px;margin-bottom:6px}'
    + '.lbl{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#777}'
    + '.cn{font-size:20px;font-weight:700;margin-top:2px}.ad{font-size:13px;color:#555;margin-top:3px}.upd{font-size:11px;color:#999;margin-top:3px}'
    + 'button{border:1px solid #bbb;background:#f4f4f4;border-radius:8px;padding:6px 12px;font-size:13px;cursor:pointer}'
    + 'h2{font-size:15px;margin:22px 0 6px;padding-bottom:5px;border-bottom:1px solid #ccc}'
    + '.item{padding:10px 0;border-bottom:1px dashed #ccc;page-break-inside:avoid}'
    + '.item.multi{background:#fff7e0;border-left:5px solid #e08a00;padding-left:10px;border-radius:4px;margin:4px 0}'
    + '.head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}'
    + '.name{font-weight:600;font-size:14px}'
    + '.qty{background:#e08a00;color:#fff;font-weight:800;font-size:20px;line-height:1;padding:5px 11px;border-radius:8px;white-space:nowrap}'
    + '.unit{font-size:12px;color:#8a5a00;font-weight:700}'
    + '.model{font-weight:600;font-size:13px;margin-top:4px}.dim{font-size:13px;color:#444;margin-top:3px}.sub{font-size:12px;color:#777;margin-top:2px}'
    + '.note{font-size:13px;color:#a86b00;font-style:italic;margin-top:5px}'
    + '.inst{font-size:13px;margin-top:5px;padding:6px 10px;background:#f1f1f1;border-radius:8px;white-space:pre-line}'
    + '.rails{margin:12px 0 4px;padding:10px 12px;background:#eef7f1;border:1px solid #b7dcc4;border-radius:8px}'
    + '.rt{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#2f6b45;font-weight:700;margin-bottom:4px}'
    + '.rl{font-size:13px;padding:2px 0}.rl.miss{color:#a86b00}.rn{font-size:11px;color:#777;margin-top:5px}'
    + '.empty{text-align:center;color:#888;padding:30px 0}'
    + '@media print{button{display:none}.item.multi{-webkit-print-color-adjust:exact;print-color-adjust:exact}.qty{-webkit-print-color-adjust:exact;print-color-adjust:exact}}'
    + '</style></head><body>'
    + '<div class="top"><div><div class="lbl">🔧 Do montażu</div><div class="cn">' + esc(data.name || '') + '</div>'
    + (addr ? '<div class="ad">📍 ' + esc(addr) + '</div>' : '') + updated + '</div>'
    + printBtn + '</div>'
    + body + '</body></html>';
}
