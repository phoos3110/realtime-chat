import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import JoinedRooms from './JoinedRooms'

const inputStyle = 'mt-2 w-full rounded-md border border-gray-300 p-3 outline-none focus:border-gray-600'
const buttonStyle = 'rounded-md bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50'

function explain(error) {
  if (error.message?.includes('ROOM_NOT_FOUND')) return 'Không tìm thấy phòng. Kiểm tra lại ID.'
  if (error.code === 'PGRST202' || error.code === '42P01') return 'Chưa có cấu hình phòng trên Supabase. Hãy chạy supabase/rooms.sql và bản cập nhật supabase/room-names.sql trong SQL Editor.'
  return 'Không thể hoàn tất yêu cầu. Kiểm tra kết nối và thử lại.'
}

export default function RoomsPage({ session, onLogout, signingOut, logoutError }) {
  const [room, setRoom] = useState(null)
  const [invite, setInvite] = useState('')
  const [roomName, setRoomName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const name = session.user.user_metadata.display_name || session.user.email?.split('@')[0] || 'Người dùng'

  async function openRoom(event, creating = false) {
    event.preventDefault()
    if (busy) return
    if (creating && (!roomName.trim() || roomName.trim().length > 100)) {
      setError('Nhập tên phòng từ 1 đến 100 ký tự.')
      return
    }
    const id = invite.trim().toLowerCase()
    if (!creating && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
      setError('ID phòng chưa đúng. Hãy dán đầy đủ mã do người tạo phòng gửi.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const { data, error } = creating
        ? await supabase.rpc('create_chat_room', { room_name: roomName.trim() })
        : await supabase.rpc('open_chat_room', { invite: id })
      if (error) throw error
      setRoom(data)
    } catch (err) { setError(explain(err)) }
    finally { setBusy(false) }
  }

  return <main className="min-h-dvh bg-gray-50 px-4 py-8 text-gray-900 sm:py-12">
    <div className="mx-auto max-w-3xl">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">Phòng trò chuyện</h1><p className="mt-1 text-gray-500">Xin chào, {name}</p></div><button onClick={onLogout} disabled={signingOut} className="rounded-md border border-gray-300 bg-white px-4 py-2 disabled:opacity-50">{signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></header>
      {logoutError && <p role="alert" className="mb-4 text-red-700">{logoutError}</p>}
      {room ? <Room key={room} id={room} user={session.user} name={name} onBack={() => { setRoom(null); setError('') }} /> : <>
        <div className="grid gap-5 sm:grid-cols-2">
          <section className="rounded-lg border border-gray-200 bg-white p-6"><h2 className="text-lg font-semibold">Tạo phòng mới</h2><form onSubmit={(e) => openRoom(e, true)} className="mt-4"><label className="block text-sm font-medium">Tên phòng<input required maxLength={100} value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Ví dụ: Nhóm bạn thân" className={inputStyle} /></label><button disabled={busy || !roomName.trim()} className={`${buttonStyle} mt-4 w-full`}>{busy ? 'Đang xử lý…' : 'Tạo phòng'}</button></form></section>
          <section className="rounded-lg border border-gray-200 bg-white p-6"><h2 className="text-lg font-semibold">Tham gia phòng</h2><form onSubmit={openRoom} className="mt-4"><label className="block text-sm font-medium">ID phòng<input required value={invite} onChange={(e) => setInvite(e.target.value)} placeholder="Dán ID phòng vào đây" autoComplete="off" spellCheck={false} className={inputStyle} /></label><button disabled={busy || !invite.trim()} className={`${buttonStyle} mt-4 w-full`}>{busy ? 'Đang xử lý…' : 'Vào phòng'}</button></form></section>
        </div>
        <JoinedRooms userId={session.user.id} onOpen={(id) => { setRoom(id); setError('') }} />
        <p className="mt-5 text-sm text-gray-500">Ai có ID và đã đăng nhập đều có thể tham gia. Chỉ chia sẻ ID với người bạn muốn mời.</p>
        {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </>}
    </div>
  </main>
}

function Room({ id, user, name, onBack }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('Đang kết nối…')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [title, setTitle] = useState('Phòng chat')
  const endRef = useRef(null)

  useEffect(() => {
    let alive = true
    function merge(rows) {
      if (!alive) return
      setMessages((previous) => [...new Map([...previous, ...rows].map((m) => [m.id, m])).values()].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)))
    }
    async function history() {
      const { data, error } = await supabase.from('chat_messages').select('*').eq('room_id', id).order('created_at', { ascending: false }).limit(100)
      if (!alive) return
      if (error) setError(explain(error))
      else merge(data)
    }
    const channel = supabase.channel(`room:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${id}` }, ({ new: message }) => merge([message]))
      .subscribe((state) => {
        if (!alive) return
        if (state === 'SUBSCRIBED') { setStatus('Đã kết nối'); void history() }
        else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(state)) setStatus('Mất kết nối · đang thử lại…')
      })
    void supabase.from('chat_rooms').select('name').eq('id', id).single().then(({ data, error }) => {
      if (!alive) return
      if (error) setError(explain(error))
      else setTitle(data.name)
    }).catch(() => { if (alive) setError('Không tải được tên phòng. Vui lòng mở lại phòng.') })
    void history()
    return () => { alive = false; void supabase.removeChannel(channel) }
  }, [id])

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [messages])

  async function send(event) {
    event.preventDefault()
    if (sending || !text.trim()) return
    setSending(true)
    setError('')
    try {
      const { data, error } = await supabase.from('chat_messages').insert({ room_id: id, sender_id: user.id, sender_name: name.slice(0, 100), content: text.trim() }).select().single()
      if (error) throw error
      setMessages((previous) => previous.some((m) => m.id === data.id) ? previous : [...previous, data])
      setText('')
    } catch (err) { setError(explain(err)) }
    finally { setSending(false) }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(id); setCopied(true) }
    catch { setError('Không thể sao chép tự động. Hãy chọn và sao chép ID phòng bên trên.') }
  }

  return <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
    <header className="border-b border-gray-200 p-5"><div className="flex items-center justify-between gap-3"><h2 className="min-w-0 break-words font-semibold">{title}</h2><button onClick={onBack} className="text-sm underline underline-offset-4">Về danh sách</button></div><label className="mt-4 block text-sm text-gray-500">ID phòng<div className="mt-1 flex gap-2"><input aria-label="ID phòng để chia sẻ" readOnly value={id} className="min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 p-2 font-mono text-sm text-gray-900" /><button onClick={copy} className="shrink-0 rounded border border-gray-300 px-3 text-sm">{copied ? 'Đã chép' : 'Sao chép'}</button></div></label><p role="status" className="mt-3 text-sm text-gray-500">{status}</p></header>
    <div role="log" aria-live="polite" aria-label="Tin nhắn trong phòng" className="h-[45dvh] min-h-48 space-y-4 overflow-y-auto p-5">
      {!messages.length && <p className="py-10 text-center text-gray-500">Chưa có tin nhắn. Chia sẻ ID để mời bạn vào phòng.</p>}
      {messages.map((message) => <div key={message.id} className={`flex ${message.sender_id === user.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-lg px-4 py-3 ${message.sender_id === user.id ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}><p className="mb-1 text-sm font-semibold">{message.sender_id === user.id ? 'Bạn' : message.sender_name}</p><p className="whitespace-pre-wrap break-words">{message.content}</p><time className="mt-2 block text-xs opacity-60" dateTime={message.created_at}>{new Date(message.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</time></div></div>)}
      <div ref={endRef} />
    </div>
    {error && <p role="alert" className="mx-5 mb-3 text-sm text-red-700">{error}</p>}
    <form onSubmit={send} className="flex gap-3 border-t border-gray-200 p-4"><input aria-label="Tin nhắn" value={text} onChange={(e) => setText(e.target.value)} disabled={sending} maxLength={2000} placeholder="Nhập tin nhắn…" className="min-w-0 flex-1 rounded-md border border-gray-300 p-3" /><button disabled={sending || !text.trim()} className={buttonStyle}>{sending ? 'Đang gửi…' : 'Gửi'}</button></form>
  </section>
}

