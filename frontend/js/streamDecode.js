/**
 * Decode encoded stream URLs (Reverse → Subtract 1 → Hex decode).
 * Usado para obtener la URL directa del stream y evitar la capa de anuncios.
 */
export function decodeHexFormat(encoded) {
  if (!encoded || typeof encoded !== 'string') return '';
  const reversed = encoded.split('').reverse().join('');
  let adjusted = '';
  for (let i = 0; i < reversed.length; i++) {
    adjusted += String.fromCharCode(reversed.charCodeAt(i) - 1);
  }
  const hexClean = adjusted.replace(/[^0-9a-fA-F]/g, '');
  let decoded = '';
  for (let i = 0; i < hexClean.length; i += 2) {
    decoded += String.fromCharCode(parseInt(hexClean.substr(i, 2), 16));
  }
  return decoded;
}

export function decodeSource(encoded) {
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

/**
 * Busca en el HTML una URL codificada (hex) y devuelve la URL decodificada si parece válida.
 */
export function extractDecodedStreamUrl(html) {
  if (!html || typeof html !== 'string') return null;
  // Patrones típicos: sources:["..."], file:"...", data-src="...", o variable con string largo hex
  const patterns = [
    /sources?\s*[=:]\s*\[?\s*["']([^"']{50,})["']/gi,
    /file\s*[=:]\s*["']([^"']{50,})["']/gi,
    /data-src\s*=\s*["']([^"']+)["']/gi,
    /(?:src|url)\s*[=:]\s*["']([^"']{50,})["']/gi,
    /["']([a-fA-F0-9]{80,})["']/g,
  ];
  for (const regex of patterns) {
    const m = regex.exec(html);
    if (m && m[1]) {
      const encoded = m[1].trim();
      let decoded = decodeHexFormat(encoded);
      if (!decoded) decoded = decodeSource(encoded);
      if (decoded && (decoded.startsWith('http://') || decoded.startsWith('https://'))) {
        return decoded;
      }
    }
  }
  return null;
}
