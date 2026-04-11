import { createClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase admin client using the SERVICE_ROLE_KEY.
 *
 * Used for admin operations that bypass RLS:
 *   - auth.admin.createUser()
 *   - auth.admin.deleteUser()
 *   - auth.admin.updateUserById()
 *
 * NEVER import this module in client components, middleware, or any
 * file that runs in the browser. The service role key has full DB access.
 */
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
)
