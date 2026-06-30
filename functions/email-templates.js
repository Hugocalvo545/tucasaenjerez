// functions/email-templates.js
"use strict";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Builds a responsive HTML email compatible with major email clients.
 * Uses tables + inline CSS only (no flexbox, no Grid).
 *
 * @param {object} opts
 * @param {string}   opts.title     - Main heading (e.g. "¡Reserva confirmada!")
 * @param {string}  [opts.subtitle] - Secondary heading or intro text
 * @param {Array<{label:string, value:string}>} [opts.items] - Key-value rows
 * @param {string}  [opts.footer]   - Raw HTML for the footer area
 * @returns {string} Full HTML document
 */
function buildEmailHTML({ title, subtitle = "", items = [], extra = "", footer = "" }) {
  const year = new Date().getFullYear();

  const itemRows = items
    .map(
      ({ label, value }) => `
      <tr>
        <td style="
          padding: 10px 20px;
          border-bottom: 1px solid #f0ece3;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 14px;
          color: #888888;
          white-space: nowrap;
          vertical-align: top;
          width: 150px;
        ">${escapeHtml(label)}</td>
        <td style="
          padding: 10px 20px;
          border-bottom: 1px solid #f0ece3;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 14px;
          color: #1a1a1a;
          vertical-align: top;
        ">${value}</td>
      </tr>`
    )
    .join("\n");

  const subtitleBlock = subtitle
    ? `<p style="
          margin: 8px 0 0;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 15px;
          color: #666666;
        ">${escapeHtml(subtitle)}</p>`
    : "";

  const footerBlock = footer
    ? `<tr>
        <td style="
          background: #f7f5f0;
          padding: 20px 32px;
          text-align: center;
          border-top: 1px solid #ece8e0;
        ">
          <p style="
            margin: 0;
            font-family: Arial, Helvetica, sans-serif;
            font-size: 13px;
            color: #888888;
          ">${footer}</p>
        </td>
      </tr>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f7f5f0; font-family: Arial, Helvetica, sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color: #f7f5f0;">
    <tr>
      <td align="center" style="padding: 32px 16px;">

        <table width="600" cellpadding="0" cellspacing="0" border="0"
               style="max-width: 600px; width: 100%; background-color: #ffffff;
                      border-radius: 12px; overflow: hidden;">

          <!-- ── Header ── -->
          <tr>
            <td style="
              background-color: #1a1a1a;
              padding: 24px 32px;
              text-align: center;
            ">
              <p style="
                margin: 0;
                font-family: Arial, Helvetica, sans-serif;
                font-size: 22px;
                font-weight: bold;
                color: #f2b544;
                letter-spacing: 0.04em;
              ">JLA Apartments</p>
            </td>
          </tr>

          <!-- ── Title ── -->
          <tr>
            <td style="padding: 32px 32px 8px; text-align: center;">
              <p style="
                margin: 0;
                font-family: Arial, Helvetica, sans-serif;
                font-size: 24px;
                font-weight: bold;
                color: #1a1a1a;
              ">${escapeHtml(title)}</p>
              ${subtitleBlock}
            </td>
          </tr>

          <!-- ── Divider ── -->
          <tr>
            <td style="padding: 16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top: 2px solid #f2b544; font-size: 0; line-height: 0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ── Items ── -->
          <tr>
            <td style="padding: 0 12px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border-collapse: collapse;">
                ${itemRows}
              </table>
            </td>
          </tr>

          <!-- ── Extra ── -->
          ${extra ? `<tr><td style="padding: 0 20px;">${extra}</td></tr>` : ""}

          <!-- ── Footer ── -->
          ${footerBlock}

          <!-- ── Bottom bar ── -->
          <tr>
            <td style="
              background-color: #1a1a1a;
              padding: 16px 32px;
              text-align: center;
            ">
              <p style="
                margin: 0;
                font-family: Arial, Helvetica, sans-serif;
                font-size: 12px;
                color: #888888;
              ">&copy; ${year} JLA Apartments &middot; Todos los derechos reservados</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`;
}

module.exports = { buildEmailHTML, escapeHtml };
