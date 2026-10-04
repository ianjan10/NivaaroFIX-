/**
 * Professional ID Generator
 * Generates 9-digit sequential ID: 4-digit registration year + 5-digit zero-padded sequence
 * e.g. professional #1 registered in 2025 = 202500001, #2 = 202500002, etc. Sequence resets per year.
 */
export async function generateProfessionalId(pool, registrationYear = null) {
  const year = registrationYear || new Date().getFullYear();
  const yearStr = String(year);
  const prefix = `${yearStr}%`;

  const query = `
    SELECT partner_id FROM (
      SELECT partner_id FROM agent_login WHERE partner_id ~ '^[0-9]{9}$' AND partner_id LIKE $1
      UNION ALL
      SELECT partner_code AS partner_id FROM professionals WHERE partner_code ~ '^[0-9]{9}$' AND partner_code LIKE $1
    ) combined
    ORDER BY partner_id DESC 
    LIMIT 1;
  `;
  
  const res = await pool.query(query, [prefix]);
  let nextSeq = 1;
  if (res.rows.length > 0 && res.rows[0].partner_id) {
    const lastSeq = parseInt(res.rows[0].partner_id.slice(4), 10);
    if (!isNaN(lastSeq)) {
      nextSeq = lastSeq + 1;
    }
  }

  return `${yearStr}${String(nextSeq).padStart(5, '0')}`;
}
