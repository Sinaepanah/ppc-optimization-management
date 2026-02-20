import { useState, useCallback } from 'react'
import type { Topic, TopicGroup } from '../types'

function generateId(): string {
  return `t-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface TopicEditorProps {
  topic: Topic
  group: TopicGroup
  onUpdate: (topic: Topic) => void
  onRemove: () => void
}

export function TopicEditor({ topic, group: _group, onUpdate, onRemove }: TopicEditorProps) {
  const [name, setName] = useState(topic.name)
  const [includeText, setIncludeText] = useState(topic.includePhrases.join('\n'))
  const [excludeText, setExcludeText] = useState(topic.excludePhrases.join('\n'))

  const sync = useCallback(() => {
    const include = includeText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    const exclude = excludeText.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    onUpdate({ ...topic, name: name.trim() || topic.name, includePhrases: include, excludePhrases: exclude })
  }, [topic, name, includeText, excludeText, onUpdate])

  const handleBlur = () => sync()

  return (
    <div className="topic-editor">
      <div className="topic-editor__header">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleBlur}
          placeholder="Topic name"
          className="topic-editor__name"
        />
        <button type="button" className="btn btn--small btn--danger" onClick={onRemove}>
          Remove topic
        </button>
      </div>
      <div className="topic-editor__phrases">
        <div className="topic-editor__block">
          <label>Include phrases (one per line, word-boundary match)</label>
          <textarea
            value={includeText}
            onChange={(e) => setIncludeText(e.target.value)}
            onBlur={handleBlur}
            rows={3}
            placeholder="e.g. pool&#10;swimming pool"
          />
        </div>
        <div className="topic-editor__block">
          <label>Exclude phrases (optional, one per line)</label>
          <textarea
            value={excludeText}
            onChange={(e) => setExcludeText(e.target.value)}
            onBlur={handleBlur}
            rows={2}
            placeholder="Optional"
          />
        </div>
      </div>
    </div>
  )
}

interface TopicListProps {
  topics: Topic[]
  group: TopicGroup
  onUpdate: (index: number, topic: Topic) => void
  onRemove: (index: number) => void
  onAdd: () => void
  title: string
}

export function TopicList({ topics, group, onUpdate, onRemove, onAdd, title }: TopicListProps) {
  return (
    <div className="topic-list">
      <h4>{title}</h4>
      {topics.map((t, i) => (
        <TopicEditor
          key={t.id}
          topic={t}
          group={group}
          onUpdate={(updated) => onUpdate(i, updated)}
          onRemove={() => onRemove(i)}
        />
      ))}
      <button type="button" className="btn btn--secondary" onClick={onAdd}>
        + Add topic
      </button>
    </div>
  )
}

export function createEmptyTopic(): Topic {
  return {
    id: generateId(),
    name: '',
    includePhrases: [],
    excludePhrases: [],
  }
}
