import { useState } from 'react'
import { supabase } from '../../supabase'
import JoinedRooms from './JoinedRooms'
import Room from './Room'
import { chatError } from '../../lib/chat'

const inputStyle = 'mt-2 w-full rounded-md border border-gray-300 p-3 outline-none focus:border-gray-600'
const buttonStyle = 'rounded-md bg-gray-900 px-5 py-3 font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50'

export default function RoomsPage({ session, onLogout, signingOut, logoutError }) {
  const [room, setRoom] = useState(null)
  const [invite, setInvite] = useState('')
  const [roomName, setRoomName] = useState('')
  const [notice, setNotice] = useState('')
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
    } catch (err) { setError(chatError(err)) }
    finally { setBusy(false) }
  }

  return <main className="min-h-dvh bg-gray-50 px-3 py-4 text-gray-900 sm:px-4 sm:py-8">
    <div className="mx-auto max-w-3xl">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-2xl font-semibold">Phòng trò chuyện</h1><p className="mt-1 text-gray-500">Xin chào, {name}</p></div><button onClick={onLogout} disabled={signingOut} className="rounded-md border border-gray-300 bg-white px-4 py-2 disabled:opacity-50">{signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></header>
      {notice && <p role="status" className="mb-4 rounded-md bg-gray-100 p-3 text-sm">{notice}</p>}
      {logoutError && <p role="alert" className="mb-4 text-red-700">{logoutError}</p>}
      {room ? <Room key={room} id={room} user={session.user} onBack={(message) => { setRoom(null); setError(''); setNotice(message || '') }} /> : <>
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
