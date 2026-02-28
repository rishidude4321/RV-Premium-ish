/**
 * Decode encoded stream URLs (Reverse → Subtract 1 → Hex decode).
 * Uso en backend para extraer URL directa y reducir anuncios/redirects.
 */
function decodeHexFormat(encoded) {
  if (!encoded || typeof encoded !== 'string') return '';
  const reversed = encoded.split('').reverse().join('');
  let adjusted = '';
  for (let i = 0; i < reversed.length; i++) {
    adjusted += String.fromCharCode(reversed.charCodeAt(i) - 1);
  }
  const hexClean = adjusted.replace(/[^0-9a-fA-F]/g, '');
  let decoded = '';
  for (let i = 0; i < hexClean.length; i += 2) {
    decoded += String.fromCharCode(parseInt(hexClean.substring(i, i + 2), 16));
  }
  return decoded;
}

function decodeSource(encoded) {
  if (!encoded || typeof encoded !== 'string') return '';
  const reversed = encoded.split('').reverse().join('');
  let adjusted = '';
  for (let i = 0; i < reversed.length; i++) {
    adjusted += String.fromCharCode(reversed.charCodeAt(i) - 1);
  }
  const pairs = adjusted.match(/.{1,2}/g);
  if (!pairs) return '';
  return pairs.map((byte) => String.fromCharCode(parseInt(byte, 16))).join('');
}

function tryDecode(encoded) {
  let decoded = decodeHexFormat(encoded);
  if (!decoded) decoded = decodeSource(encoded);
  return decoded;
}

/**
 * Busca en el HTML una URL codificada y devuelve la URL decodificada si es válida.
 */
function extractDecodedStreamUrl(html) {
  if (!html || typeof html !== 'string') return null;
  const patterns = [
    /sources?\s*[=:]\s*\[?\s*["']([^"']{50,})["']/gi,
    /file\s*[=:]\s*["']([^"']{50,})["']/gi,
    /data-src\s*=\s*["']([^"']+)["']/gi,
    /(?:src|url)\s*[=:]\s*["']([^"']{50,})["']/gi,
    /["']([a-fA-F0-9]{80,})["']/g,
    /atob\s*\(\s*["']([^"']+)["']\s*\)/gi,
  ];
  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(html)) !== null) {
      const encoded = m[1].trim();
      const decoded = tryDecode(encoded);
      if (decoded && (decoded.startsWith('http://') || decoded.startsWith('https://'))) {
        return decoded;
      }
    }
  }
  return null;
}

/**
 * Quita scripts y enlaces que abren nueva pestaña para reducir redirects/ads.
 */
function sanitizeEmbedHtml(html) {
  if (!html || typeof html !== 'string') return html;
  let out = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<script\s[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<a\s+([^>]*\s)?target\s*=\s*["']?_blank["']?([^>]*)>/gi, '<span $1$2>')
    .replace(/onclick\s*=\s*["'][^"']*window\.open[^"']*["']/gi, '')
    .replace(/onclick\s*=\s*["'][^"']*["']/gi, '');
  return out;
}

module.exports = { extractDecodedStreamUrl, sanitizeEmbedHtml };
