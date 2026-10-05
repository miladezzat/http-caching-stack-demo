
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), quiet: true });
/** @type {import('next').NextConfig} */
module.exports = {
  poweredByHeader: false,
  allowedDevOrigins: ['127.0.0.1'],
  turbopack: { root: path.resolve(__dirname, '../..') },
};
