import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../supabase'
import { chatError, cursorFilter, mergeMessages } from '../../lib/chat'

const PAGE_SIZE = 50

export default function Room({ id, user, onBack }) {
  const [messages, setMessages] = useState([])
  const [room, setRoom] = useState(null)
  const [text, setText] = useState('')
  const [pending, setPending] = useState(null)
  const [sending, setSending] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [connected, setConnected] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [hasOlder, setHasOlder] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const latest = useRef(null)
  const oldest = useRef(null)
  const scrollRef = useRef(null)
  const shouldScroll = useRef(true)
  const sendingRef = useRef(false)
  const inputRef = useRef(null)
  const restoreFocus = useRef(false)
  const exitRef = useRef(onBack)
  const syncRef = useRef(null)
  const aliveRef = useRef(true)

  useEffect(() => { exitRef.current = onBack }, [onBack])
  useEffect(() => { aliveRef.current = true; return () => { aliveRef.current = false } }, [])

  const merge = useCallback((rows) => {
    const sorted = mergeMessages([], rows)
    if (!sorted.length) return
    if (!latest.current || mergeMessages([latest.current], sorted).at(-1).id !== latest.current.id) latest.current = sorted.at(-1)
    setMessages((previous) => mergeMessages(previous, rows))
    // Một request trước có thể đã lưu thành công dù client nhận lỗi mạng.
    setPending((previous) => previous && rows.some((m) => m.id === previous.id) ? null : previous)
  }, [])

  useEffect(() => {
    let active = true
    let syncing = false
    async function sync() {
      if (!active || !navigator.onLine || syncing) return
      syncing = true
      try {
        const { data: info, error: roomError } = await supabase.from('chat_rooms').select('id, name, owner_id').eq('id', id).maybeSingle()
        if (roomError) throw roomError
        if (!active) return
        if (!info) { exitRef.current('Phòng đã bị xóa hoặc bạn không còn là thành viên.'); return }
        setRoom(info)
        // Đọc chồng 60 giây để không bỏ tin của transaction vừa commit muộn.
        let cursor = latest.current ? {
          created_at: new Date(new Date(latest.current.created_at).getTime() - 60000).toISOString(),
          id: '00000000-0000-0000-0000-000000000000',
        } : null
        // Tải trang đầu; khi kết nối lại, lấy TẤT CẢ tin sau cursor theo từng lô.
        do {
          let query = supabase.from('chat_messages').select('*').eq('room_id', id)
          query = cursor
            ? query.or(cursorFilter(cursor, 'newer')).order('created_at').order('id').limit(PAGE_SIZE)
            : query.order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE)
          const { data, error } = await query
          if (error) throw error
          if (!active) return
          if (!cursor) {
            const sorted = mergeMessages([], data)
            oldest.current = sorted[0] || null
            setHasOlder(data.length === PAGE_SIZE)
            merge(data)
            break
          }
          merge(data)
          if (data.length < PAGE_SIZE) break
          cursor = data.at(-1)
        } while (active)
        if (active) setError('')
      } catch (err) {
        if (active) setError(chatError(err))
      } finally {
        syncing = false
        if (active) setLoading(false)
      }
    }
    syncRef.current = sync
    const channel = supabase.channel(`room:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room_id=eq.${id}` }, () => { void sync() })
      .subscribe((state) => {
        if (!active) return
        setConnected(state === 'SUBSCRIBED')
        if (state === 'SUBSCRIBED') void sync()
      })
    function networkChange() {
      setOnline(navigator.onLine)
      if (navigator.onLine) void sync()
    }
    function focus() { if (document.visibilityState === 'visible') void sync() }
    window.addEventListener('online', networkChange)
    window.addEventListener('offline', networkChange)
    window.addEventListener('focus', focus)
    document.addEventListener('visibilitychange', focus)
    // Không dựa vào DELETE event vì RLS không lọc được bản ghi đã xóa.
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void sync() }, 5000)
    void sync()
    return () => {
      active = false
      syncRef.current = null
      clearInterval(timer)
      window.removeEventListener('online', networkChange)
      window.removeEventListener('offline', networkChange)
      window.removeEventListener('focus', focus)
      document.removeEventListener('visibilitychange', focus)
      void supabase.removeChannel(channel)
    }
  }, [id, merge])

  useEffect(() => {
    if (shouldScroll.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages])

  useEffect(() => {
    if (restoreFocus.current && !sending && !pending) {
      inputRef.current?.focus({ preventScroll: true })
      restoreFocus.current = false
    }
  }, [sending, pending])

  async function loadOlder() {
    if (!oldest.current || loadingOlder || !online) return
    setLoadingOlder(true)
    const height = scrollRef.current?.scrollHeight || 0
    try {
      const { data, error } = await supabase.from('chat_messages').select('*').eq('room_id', id)
        .or(cursorFilter(oldest.current, 'older')).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE)
      if (error) throw error
      if (!aliveRef.current) return
      shouldScroll.current = false
      const sorted = mergeMessages([], data)
      if (sorted.length) oldest.current = sorted[0]
      setHasOlder(data.length === PAGE_SIZE)
      setMessages((previous) => mergeMessages(previous, data))
      requestAnimationFrame(() => { if (scrollRef.current) scrollRef.current.scrollTop += scrollRef.current.scrollHeight - height })
    } catch (err) { if (aliveRef.current) setError(chatError(err)) }
    finally { if (aliveRef.current) setLoadingOlder(false) }
  }

  async function send(event) {
    event.preventDefault()
    if (sendingRef.current || !navigator.onLine || (!pending && !text.trim())) return
    const message = pending || { id: crypto.randomUUID(), content: text.trim() }
    sendingRef.current = true
    restoreFocus.current = true
    setSending(true)
    setPending(message)
    setText('')
    setError('')
    try {
      const { data, error } = await supabase.rpc('send_chat_message', { target: id, message_id: message.id, body: message.content })
      if (error) throw error
      if (!aliveRef.current) return
      // Chỉ đồng bộ theo thứ tự database để không bỏ sót tin đến cùng lúc.
      setMessages((previous) => mergeMessages(previous, [data]))
      setPending(null)
      shouldScroll.current = true
      void syncRef.current?.()
    } catch (err) {
      if (aliveRef.current) setError(chatError(err) + ' Tin chưa xác nhận đã gửi; nhấn Gửi lại để kiểm tra/gửi với cùng mã tin.')
    } finally {
      sendingRef.current = false
      if (aliveRef.current) setSending(false)
    }
  }

  function goBack() {
    if ((text.trim() || pending) && !window.confirm('Bạn còn tin chưa gửi hoặc chưa xác nhận. Vẫn quay về danh sách?')) return
    onBack()
  }

  async function copy() {
    try { await navigator.clipboard.writeText(id); setCopied(true) }
    catch { setError('Hãy chọn và sao chép ID phòng bên trên.') }
  }

  return <section className="flex h-[calc(100dvh-10rem)] min-h-96 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white sm:h-[75dvh]">
    <header className="shrink-0 border-b border-gray-200 p-4">
      <div className="flex items-start justify-between gap-3"><h2 className="min-w-0 break-words font-semibold">{room?.name || 'Phòng chat'}</h2><button onClick={goBack} className="shrink-0 py-1 text-sm underline underline-offset-4">Về danh sách</button></div>
      <label htmlFor="room-invite" className="mt-3 block text-sm text-gray-500">ID phòng</label><div className="mt-1 flex gap-2"><input id="room-invite" readOnly value={id} className="min-w-0 flex-1 rounded border border-gray-200 bg-gray-50 p-2 font-mono text-sm" /><button onClick={copy} className="min-h-11 shrink-0 rounded border border-gray-300 px-3 text-sm">{copied ? 'Đã chép' : 'Sao chép'}</button></div>
      <p role="status" className="mt-2 text-sm text-gray-500">{!online ? 'Mất mạng · tin nhắn của bạn chưa bị xóa' : connected ? 'Đã kết nối' : 'Đang kết nối lại · tự kiểm tra tin mới'}</p>
    </header>
    <div ref={scrollRef} onScroll={() => { const box = scrollRef.current; shouldScroll.current = box.scrollHeight - box.scrollTop - box.clientHeight < 80 }} role="log" aria-live="polite" aria-label="Tin nhắn trong phòng" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
      {hasOlder && <button disabled={loadingOlder || !online} onClick={loadOlder} className="mx-auto block min-h-11 rounded border border-gray-300 px-4 text-sm disabled:opacity-50">{loadingOlder ? 'Đang tải…' : 'Tải tin nhắn cũ'}</button>}
      {loading && <p role="status" className="text-center text-gray-500">Đang tải tin nhắn…</p>}
      {!loading && !messages.length && <p className="py-6 text-center text-gray-500">Chưa có tin nhắn. Chia sẻ ID để mời bạn vào phòng.</p>}
      {messages.map((message) => <div key={message.id} className={`flex ${message.sender_id === user.id ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[85%] rounded-lg px-4 py-3 ${message.sender_id === user.id ? 'bg-gray-900 text-white' : 'bg-gray-100'}`}><p className="mb-1 text-sm font-semibold">{message.sender_id === user.id ? 'Bạn' : message.sender_name}</p><p className="whitespace-pre-wrap break-words">{message.content}</p><time className="mt-2 block text-xs opacity-70" dateTime={message.created_at}>{new Date(message.created_at).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</time></div></div>)}
      {pending && <div className="ml-auto max-w-[85%] rounded-lg border border-dashed border-gray-400 p-3"><p className="whitespace-pre-wrap break-words">{pending.content}</p><p role="status" className="mt-2 text-sm text-gray-500">{sending ? 'Đang gửi…' : 'Chưa xác nhận đã gửi'}</p></div>}
    </div>
    {error && <p role="alert" className="max-h-24 shrink-0 overflow-y-auto px-4 pb-2 text-sm text-red-700">{error}</p>}
    <form onSubmit={send} className="flex shrink-0 gap-2 border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <input ref={inputRef} aria-label="Tin nhắn" value={text} onChange={(e) => setText(e.target.value)} disabled={sending || !!pending} maxLength={2000} placeholder={pending ? 'Gửi lại tin đang chờ trước' : 'Nhập tin nhắn…'} className="min-w-0 flex-1 rounded-md border border-gray-300 p-3 disabled:bg-gray-50" />
      <button disabled={sending || !online || !room || (!pending && !text.trim())} className="min-h-11 shrink-0 rounded-md bg-gray-900 px-4 font-medium text-white disabled:opacity-50">{sending ? 'Đang gửi…' : pending ? 'Gửi lại' : 'Gửi'}</button>
    </form>
    {pending && !sending && <button className="pb-3 text-sm underline" onClick={() => { if (window.confirm('Tin có thể đã được lưu nếu mạng bị ngắt khi trả kết quả. Bỏ trạng thái chờ để soạn tin khác?')) { setPending(null); setError('') } }}>Bỏ trạng thái chờ</button>}
  </section>
}
