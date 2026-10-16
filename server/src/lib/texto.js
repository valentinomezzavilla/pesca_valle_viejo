// "Distribuidora del Puerto" → "distribuidora-del-puerto" (para nombres de archivo)
export const slug = (t) => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
