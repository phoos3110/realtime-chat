import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

export default function AuthPage() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const registering = mode === 'register'

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setError('')
    setNotice('')
    if (registering && !name.trim()) return setError('Vui lòng nhập tên hiển thị.')
    if (registering && password !== confirmation) return setError('Mật khẩu xác nhận không khớp.')
    setBusy(true)
    try {
      const credentials = { email: email.trim(), password }
      const result = registering
        ? await supabase.auth.signUp({ ...credentials, options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword(credentials)
      if (result.error) throw result.error
      setPassword('')
      setConfirmation('')
      if (registering && !result.data.session) {
        setNotice('Nếu địa chỉ email đủ điều kiện đăng ký, bạn sẽ nhận được email xác nhận. Hãy kiểm tra hộp thư trước khi đăng nhập.')
        setMode('login')
      }
    } catch (err) {
      const errors = {
        invalid_credentials: 'Email hoặc mật khẩu không đúng.',
        email_not_confirmed: 'Vui lòng xác nhận email trước khi đăng nhập.',
        user_already_exists: 'Không thể đăng ký bằng email này. Hãy thử đăng nhập.',
        weak_password: 'Mật khẩu chưa đáp ứng yêu cầu bảo mật.',
        over_email_send_rate_limit: 'Bạn gửi yêu cầu quá nhanh. Vui lòng thử lại sau.',
        signup_disabled: 'Chức năng đăng ký đang bị tắt trong Supabase.',
      }
      setError(errors[err.code] || 'Không thể hoàn tất yêu cầu. Kiểm tra kết nối và cấu hình Supabase rồi thử lại.')
    } finally {
      setBusy(false)
    }
  }

  async function logout() {
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      setNotice('')
    } catch {
      setError('Không thể đăng xuất. Vui lòng thử lại.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-gray-50 p-4 text-gray-900">
      <section className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 sm:p-8">
        {loading ? <p role="status" className="text-slate-500">Đang tải phiên đăng nhập…</p> : session ? (
          <>
            <h1 className="text-xl font-semibold">Xin chào, {session.user.user_metadata.display_name || session.user.email}</h1>
            <p className="mt-2 break-words text-slate-500">{session.user.email}</p>
            <div className="my-6 rounded-md bg-gray-50 p-5"><h2 className="font-semibold text-gray-900">Chưa có cuộc trò chuyện</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">Tài khoản của bạn đã đăng nhập. Phần lưu và nhận tin nhắn sẽ được kết nối ở bước tiếp theo.</p></div>
            <button disabled={busy} onClick={logout} className="w-full rounded-md border border-slate-300 p-3 font-semibold hover:bg-slate-50 disabled:opacity-50">{busy ? 'Đang đăng xuất…' : 'Đăng xuất'}</button>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold">{registering ? 'Tạo tài khoản' : 'Chào mừng trở lại'}</h1>
            <p className="mt-2 text-slate-500">{registering ? 'Bắt đầu kết nối với mọi người.' : 'Đăng nhập để tiếp tục trò chuyện.'}</p>
            <form onSubmit={submit} className="mt-6 space-y-4">
              {registering && <label className="block text-sm font-medium">Tên hiển thị<input required maxLength={50} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 p-3" /></label>}
              <label className="block text-sm font-medium">Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 p-3" /></label>
              <label className="block text-sm font-medium">Mật khẩu<input required type="password" minLength={registering ? 8 : undefined} autoComplete={registering ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 p-3" /></label>
              {registering && <><p className="text-sm text-slate-500">Dùng ít nhất 8 ký tự cho mật khẩu.</p><label className="block text-sm font-medium">Xác nhận mật khẩu<input required type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className="mt-2 w-full rounded-md border border-slate-300 p-3" /></label></>}
              <button disabled={busy} className="w-full rounded-md bg-gray-900 p-3 font-semibold text-white hover:bg-gray-800 disabled:opacity-50">{busy ? 'Đang xử lý…' : registering ? 'Đăng ký' : 'Đăng nhập'}</button>
            </form>
            <p className="mt-5 text-center text-sm text-slate-500">{registering ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}<button disabled={busy} onClick={() => { setMode(registering ? 'login' : 'register'); setError(''); setNotice(''); setPassword(''); setConfirmation('') }} className="font-semibold text-gray-900 underline underline-offset-4">{registering ? 'Đăng nhập' : 'Đăng ký'}</button></p>
          </>
        )}
        {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      </section>
    </main>
  )
}
