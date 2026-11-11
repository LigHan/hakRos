'use strict';

function readJpeg(base64, maxBytes) {
  if (typeof base64 !== 'string' || base64.length > Math.ceil(maxBytes / 3) * 4) return null;
  const data = Buffer.from(base64, 'base64');
  if (data.length < 5 || data.length > maxBytes || data.toString('base64') !== base64) return null;
  if (data.readUInt16BE(0) !== 0xffd8 || data[2] !== 0xff || data.readUInt16BE(data.length - 2) !== 0xffd9) {
    return null;
  }
  return data;
}

module.exports = readJpeg;
