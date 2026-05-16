const sqlite3 = require('better-sqlite3');
const db = new sqlite3('c:/Users/johan/OneDrive/Desktop/repos git/cotizadorpm-pocketbase/backend/pb_data/data.db');

const rows = db.prepare(`SELECT id, name, listRule, viewRule, createRule, updateRule, deleteRule FROM _collections WHERE name IN ('cotizaciones', 'espacios', 'impuestos', 'configuracion');`).all();

console.log(JSON.stringify(rows, null, 2));
