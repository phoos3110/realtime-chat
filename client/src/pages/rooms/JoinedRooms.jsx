import { useEffect, useState } from 'react'
import { supabase } from '../../supabase'

export default function JoinedRooms({ userId, onOpen }) {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const [deletingId, setDeletingId] = useState(null)
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => {
    let active = true
    async function loadRooms() {
      try {
        // RLS chỉ trả về phòng có tài khoản hiện tại là thành viên.
        const { data, error } = await supabase.from('chat_rooms')
          .select('id, name, owner_id, created_at')
          .order('created_at', { ascending: false })
        if (error) throw error
        if (active) setRooms(data)
      } catch {
        if (active) setError('Không tải được danh sách phòng. Kiểm tra kết nối rồi nhấn Làm mới.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadRooms()
    return () => { active = false }
  }, [userId, revision])

  async function deleteRoom(item) {
    if (deletingId || item.owner_id !== userId) return
    if (!window.confirm(`Xóa phòng "${item.name || item.id.slice(0, 8)}"? Toàn bộ tin nhắn và thành viên sẽ bị xóa vĩnh viễn.`)) return
    setDeletingId(item.id)
    setDeleteError('')
    try {
      const { data, error } = await supabase.from('chat_rooms').delete()
        .eq('id', item.id).eq('owner_id', userId).select('id')
      if (error) throw error
      if (!data.length) throw new Error('Room not deleted')
      setRooms((previous) => previous.filter((room) => room.id !== item.id))
    } catch {
      setDeleteError('Không xóa được phòng. Kiểm tra quyền chủ phòng, kết nối và cấu hình SQL rồi thử lại.')
    } finally {
      setDeletingId(null)
    }
  }

  function refresh() {
    setLoading(true)
    setError('')
    setRevision((previous) => previous + 1)
  }

  return <section aria-labelledby="joined-rooms-heading" className="mt-6 rounded-lg border border-gray-200 bg-white p-6">
    <div className="flex items-center justify-between gap-3">
      <h2 id="joined-rooms-heading" className="text-lg font-semibold">Phòng đã tham gia</h2>
      <button onClick={refresh} disabled={loading || !!deletingId} className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-50">Làm mới</button>
    </div>
    <p className="mt-2 text-sm text-gray-500">Các phòng được lưu theo tài khoản. Chọn phòng để xem lại tin nhắn.</p>
    {deleteError && <p role="alert" className="mt-4 text-sm text-red-700">{deleteError}</p>}
    {loading ? <p role="status" className="mt-5 text-gray-500">Đang tải danh sách phòng…</p>
      : error ? <p role="alert" className="mt-5 text-sm text-red-700">{error}</p>
      : rooms.length === 0 ? <p className="mt-5 rounded-md bg-gray-50 p-4 text-gray-500">Bạn chưa tham gia phòng nào. Tạo phòng hoặc nhập ID ở trên để bắt đầu.</p>
      : <ul className="mt-5 divide-y divide-gray-100">
        {rooms.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
          <div className="min-w-0 flex-1">
            <h3 className="break-words font-medium">{item.name || `Phòng ${item.id.slice(0, 8)}`}</h3>
            <p className="mt-1 break-all font-mono text-sm text-gray-500">{item.id}</p>
            <p className="mt-1 text-sm text-gray-500">{item.owner_id === userId ? 'Bạn đã tạo' : 'Đã tham gia'} · Tạo ngày {new Date(item.created_at).toLocaleDateString('vi-VN')}</p>
          </div>
          <button disabled={!!deletingId} onClick={() => onOpen(item.id)} aria-label={`Mở phòng ${item.id}`} className="shrink-0 rounded-md border border-gray-300 px-4 py-2 font-medium hover:bg-gray-50">Mở phòng</button>
          {item.owner_id === userId && <button onClick={() => deleteRoom(item)} disabled={!!deletingId} aria-label={`Xóa phòng ${item.id}`} className="shrink-0 rounded-md border border-red-200 px-4 py-2 font-medium text-red-700 hover:bg-red-50 disabled:opacity-50">{deletingId === item.id ? 'Đang xóa…' : 'Xóa phòng'}</button>}
        </li>)}
      </ul>}
  </section>
}


