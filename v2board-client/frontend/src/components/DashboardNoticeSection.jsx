function normalizeNotices(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.records)) return payload.records
  return []
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) return tags.filter(Boolean).map(String)
  if (typeof tags === 'string' && tags.trim()) {
    return tags.split(',').map((tag) => tag.trim()).filter(Boolean)
  }
  return []
}

export function DashboardNoticeSection({ notices }) {
  const list = normalizeNotices(notices)

  if (!list.length) {
    return (
      <div className="card">
        <div className="empty">暂无公告</div>
      </div>
    )
  }

  return (
    <div className="notice-list">
      {list.map((notice, index) => {
        const tags = normalizeTags(notice?.tags)
        const imageUrl = typeof notice?.img_url === 'string' ? notice.img_url.trim() : ''
        const title = notice?.title || `公告 ${index + 1}`
        const content = notice?.content || ''

        return (
          <div className="card notice-card" key={notice?.id || `${title}-${index}`}>
            {imageUrl && (
              <img className="notice-image" src={imageUrl} alt={title} />
            )}
            <div className="notice-title">{title}</div>
            {tags.length > 0 && (
              <div className="notice-tags">
                {tags.map((tag) => (
                  <span key={tag} className="notice-tag">{tag}</span>
                ))}
              </div>
            )}
            <div className="notice-content">{content}</div>
          </div>
        )
      })}
    </div>
  )
}
