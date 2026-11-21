import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import RoomsPage from '../rooms/RoomsPage'

const inputStyle = 'mt-2 w-full rounded-md border border-gray-300 p-3'

export default function AuthPage() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState(() => new URLSearchParams(window.location.search).has('recovery') || window.location.hash.includes('type=recovery') ? 'update' : 'login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(() => new URLSearchParams(window.location.hash.slice(1)).has('error_description') ? 'Liên kết không còn hợp lệ. Hãy yêu cầu email đặt lại mật khẩu mới.' : '')
  const [notice, setNotice] = useState('')
  const registering = mode === 'register'
  const updating = mode === 'update'
  const forgot = mode === 'forgot'

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY') setMode('update')
      if (event === 'SIGNED_OUT') setMode('login')
    })
    return () => subscription.unsubscribe()
  }, [])

  function changeMode(next) {
    setMode(next)
    setError('')
    setNotice('')
    setPassword('')
    setConfirmation('')
  }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setError('')
    setNotice('')
    if (registering && !name.trim()) return setError('Vui lòng nhập tên hiển thị.')
    if ((registering || updating) && password !== confirmation) return setError('Mật khẩu xác nhận không khớp.')
    if (updating && !session) return setError('Liên kết không hợp lệ hoặc đã hết hạn. Hãy yêu cầu email mới.')
    setBusy(true)
    try {
      if (forgot) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/?recovery=1` })
        if (error) throw error
        setNotice('Nếu email thuộc một tài khoản, bạn sẽ nhận được liên kết đặt lại mật khẩu. Kiểm tra cả thư mục spam.')
      } else if (updating) {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        window.history.replaceState(null, '', window.location.pathname)
        // Hiển thị xác nhận trước khi tiếp tục vào phòng.
        setMode('updated')
        setNotice('Đã cập nhật mật khẩu. Bạn có thể tiếp tục vào phòng trò chuyện.')
      } else {
        const credentials = { email: email.trim(), password }
        const result = registering
          ? await supabase.auth.signUp({ ...credentials, options: { data: { display_name: name.trim() }, emailRedirectTo: window.location.origin } })
          : await supabase.auth.signInWithPassword(credentials)
        if (result.error) throw result.error
        if (registering && !result.data.session) {
          setNotice('Nếu email đủ điều kiện đăng ký, bạn sẽ nhận được email xác nhận. Hãy kiểm tra hộp thư trước khi đăng nhập.')
          setMode('login')
        }
      }
      setPassword('')
      setConfirmation('')
    } catch (err) {
      const errors = {
        invalid_credentials: 'Email hoặc mật khẩu không đúng.',
        email_not_confirmed: 'Vui lòng xác nhận email trước khi đăng nhập.',
        user_already_exists: 'Không thể đăng ký bằng email này. Hãy thử đăng nhập.',
        weak_password: 'Mật khẩu chưa đáp ứng yêu cầu bảo mật.',
        same_password: 'Mật khẩu mới cần khác mật khẩu cũ.',
        over_email_send_rate_limit: 'Yêu cầu quá nhanh. Vui lòng thử lại sau.',
        signup_disabled: 'Chức năng đăng ký đang bị tắt.',
      }
      setError(errors[err.code] || 'Không thể hoàn tất yêu cầu. Kiểm tra kết nối hoặc thử lại sau.')
    } finally { setBusy(false) }
  }

  async function logout() {
    setBusy(true)
    setError('')
    try {
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
      window.history.replaceState(null, '', window.location.pathname)
      setNotice('')
    } catch { setError('Không thể đăng xuất. Vui lòng thử lại.') }
    finally { setBusy(false) }
  }

  if (!loading && session && !updating && mode !== 'updated') return <RoomsPage key={session.user.id} session={session} onLogout={logout} signingOut={busy} logoutError={error} />
  const title = { login: 'Đăng nhập', register: 'Đăng ký', forgot: 'Quên mật khẩu', update: 'Đặt mật khẩu mới', updated: 'Đã đổi mật khẩu' }[mode]

  return <main className="flex min-h-dvh items-center justify-center bg-gray-50 p-4 text-gray-900">
    <section className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 sm:p-8">
      {loading ? <p role="status">Đang tải phiên đăng nhập…</p> : <>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-gray-500">{forgot ? 'Nhập email để nhận liên kết đặt lại mật khẩu.' : updating ? 'Nhập và xác nhận mật khẩu mới.' : mode === 'updated' ? 'Mật khẩu của tài khoản đã được thay đổi.' : 'Kết nối và trò chuyện với mọi người.'}</p>
        {mode === 'updated' ? <button onClick={() => changeMode('login')} className="mt-5 w-full rounded-md bg-gray-900 p-3 text-white">Tiếp tục</button> : <form onSubmit={submit} className="mt-6 space-y-4">
          {registering && <label className="block text-sm font-medium">Tên hiển thị<input required maxLength={50} autoComplete="nickname" value={name} onChange={(e) => setName(e.target.value)} className={inputStyle} /></label>}
          {!updating && <label className="block text-sm font-medium">Email<input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputStyle} /></label>}
          {!forgot && <label className="block text-sm font-medium">{updating ? 'Mật khẩu mới' : 'Mật khẩu'}<input required type="password" minLength={registering || updating ? 8 : undefined} autoComplete={registering || updating ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} className={inputStyle} /></label>}
          {(registering || updating) && <><p className="text-sm text-gray-500">Dùng ít nhất 8 ký tự.</p><label className="block text-sm font-medium">Xác nhận mật khẩu<input required type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={inputStyle} /></label></>}
          <button disabled={busy} className="w-full rounded-md bg-gray-900 p-3 font-semibold text-white disabled:opacity-50">{busy ? 'Đang xử lý…' : forgot ? 'Gửi email đặt lại' : updating ? 'Lưu mật khẩu mới' : title}</button>
        </form>}
        {mode === 'login' && <button disabled={busy} onClick={() => changeMode('forgot')} className="mt-3 min-h-11 text-sm underline underline-offset-4">Quên mật khẩu?</button>}
        {(mode === 'login' || registering) && <p className="mt-4 text-center text-sm text-gray-500">{registering ? 'Đã có tài khoản? ' : 'Chưa có tài khoản? '}<button disabled={busy} onClick={() => changeMode(registering ? 'login' : 'register')} className="min-h-11 font-semibold text-gray-900 underline underline-offset-4">{registering ? 'Đăng nhập' : 'Đăng ký'}</button></p>}
        {(forgot || updating) && <button disabled={busy} onClick={() => { if (updating && session) void logout(); else changeMode('login') }} className="mt-4 min-h-11 text-sm underline">Quay lại đăng nhập</button>}
      </>}
      {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
    </section>
  </main>
}
