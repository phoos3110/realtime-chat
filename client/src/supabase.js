import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
if (!url || !key) throw new Error('Thiếu cấu hình Supabase: kiểm tra biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_PUBLISHABLE_KEY.')

export const supabase = createClient(url, key, {
  global: {
    fetch: (input, init = {}) => fetch(input, {
      ...init,
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
    }),
  },
})
