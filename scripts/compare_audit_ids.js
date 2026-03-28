// Script para comparar IDs de auditoría con auth.users y profiles
// Ejecuta esto en un entorno Node.js con acceso a Supabase


import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Cargar variables desde .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Mapear nombres de variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  throw new Error('Faltan variables de entorno NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function main() {
  // 1. Obtener todos los IDs de la auditoría
  const { data: auditRows, error: auditError } = await supabase
    .from('role_change_audit')
    .select('target_user_id, changed_by');

  if (auditError) throw auditError;

  const ids = new Set();
  for (const row of auditRows ?? []) {
    if (row.target_user_id) ids.add(row.target_user_id);
    if (row.changed_by) ids.add(row.changed_by);
  }
  const idList = Array.from(ids);

  // 2. Buscar en profiles
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, email')
    .in('id', idList);
  if (profileError) throw profileError;

  // 3. Mostrar resultados
  for (const id of idList) {
    const profile = profiles?.find(p => p.id === id);
    console.log(`ID: ${id}`);
    console.log(`  profiles:   ${profile ? profile.email : 'NO ENCONTRADO'}`);
    console.log('---');
  }
}

main().catch(console.error);
