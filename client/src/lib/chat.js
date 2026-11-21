export function mergeMessages(previous, incoming) {
  return [...new Map([...previous, ...incoming].map((message) => [message.id, message])).values()]
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
}

export function cursorFilter(cursor, direction) {
  const op = direction === 'older' ? 'lt' : 'gt'
  return `created_at.${op}.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.${op}.${cursor.id})`
}

export function chatError(error) {
  const message = error?.message || ''
  if (message.includes('RATE_LIMITED')) return 'Bạn thao tác quá nhanh. Chờ vài giây rồi thử lại.'
  if (message.includes('ROOM_UNAVAILABLE') || message.includes('ROOM_NOT_FOUND')) return 'Phòng đã bị xóa hoặc bạn không còn là thành viên.'
  if (message.includes('OWNER_CANNOT_LEAVE')) return 'Chủ phòng cần xóa phòng thay vì rời phòng.'
  if (error?.code === 'PGRST202' || error?.code === '42501') return 'Chức năng chưa sẵn sàng. Kiểm tra phiên đăng nhập và chạy cập nhật SQL cho phòng chat.'
  return 'Không thể hoàn tất yêu cầu. Kiểm tra mạng rồi thử lại.'
}
